import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StatusBar, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { ArrowLeft, CircleCheck, Circle, RotateCcw, Smartphone, XCircle } from 'lucide-react-native';
import { ticketApi } from '../../../api/client';
import { confirm, notify } from '../../../components/confirm';
import { useResponsive } from '../../../theme/responsive';
import { estimatedTotalOf, priceItemsFromTicket } from './ReceiptCard';

const ACCENT = '#035C6C';
const MINT = '#E5F3F5';
const MINT_LINE = '#C7E6EA';
const INK = '#111111';
const MUTED = '#6B7280';
const SUBTLE = '#9CA3AF';
const LINE = '#E5E7EB';
const PAGE = '#F3F4F6';
const RED = '#DC2626';
const GREEN = '#609138';
const AMBER = '#B45309';


const REASONS = ['Price Correction', 'Customer Discount', 'Spare Part Price Change', 'Service Cancelled', 'Other'];

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const amountOf = (m) => Number(m?.amount ?? m?.price ?? 0) || 0;
// Same identity the server checks: id, else code, else label (lower-case).
const identityOf = (m) => {
  for (const k of ['id', 'serviceId', 'code', 'serviceCode', 'label', 'serviceName']) {
    const v = m?.[k];
    if (v != null && String(v).trim() && String(v).toUpperCase() !== 'OTHER') return String(v).trim().toLowerCase();
  }
  return '';
};
const signed = (n) => (n < 0 ? `− ${inr(Math.abs(n))}` : n > 0 ? `+ ${inr(n)}` : inr(0));

/**
 * Price Revised — change the price of, or cancel, services ALREADY on the
 * booking. Never adds a service (Re-Est) and never changes the repair status.
 * One POST /tickets/{id}/price-revision; the server checks each item still has
 * the price it was loaded with (so a concurrent edit is never overwritten and a
 * repeated submit can't apply twice), records old → new per service with the
 * reason, and asks for fresh approval only for an increase or a cancellation.
 */
export default function PriceRevisedScreen({ navigation, route }) {
  const ticketId = route?.params?.ticketId;
  const insets = useSafeAreaInsets();
  const r = useResponsive();
  const col = r.isTablet ? { width: '100%', maxWidth: 760, alignSelf: 'center' } : null;

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [prices, setPrices] = useState({});        // index → typed new price (string)
  const [cancelled, setCancelled] = useState({});  // index → true
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [approvedNow, setApprovedNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const sendingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const t = await ticketApi.get(`/tickets/${ticketId}`);
      setTicket(t);
      setPrices({});
      setCancelled({});
    } catch (e) {
      setLoadError(e?.message || 'Could not load this booking.');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);
  useEffect(() => { load(); }, [load]);

  // Line items in the SAME order the server stores them (indexes must match).
  const items = useMemo(() => {
    if (!ticket) return [];
    try {
      const parsed = JSON.parse(ticket.priceItemsJson || 'null');
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
    return priceItemsFromTicket(ticket);
  }, [ticket]);
  const currentTotal = ticket ? Number(estimatedTotalOf(ticket, items)) || 0 : 0;

  const rows = items.map((m, i) => {
    const old = amountOf(m);
    const typed = prices[i];
    const isCancelled = !!cancelled[i];
    const raw = typed === undefined ? '' : typed;
    const blank = raw.trim() === '';
    const valid = blank || Number(raw) >= 0;
    const next = isCancelled ? 0 : blank || !valid ? old : Number(raw);
    return { m, i, old, raw, valid, next, isCancelled, changed: isCancelled || (!blank && valid && Number(raw) !== old) };
  });
  const changes = rows.filter((x) => x.changed);
  const delta = rows.reduce((s, x) => s + (x.isCancelled ? -x.old : (x.valid ? x.next - x.old : 0)), 0);
  const proposed = Math.max(0, currentTotal + delta);
  const increase = rows.some((x) => !x.isCancelled && x.valid && x.next > x.old);
  const anyCancel = rows.some((x) => x.isCancelled);
  const needsApproval = increase || anyCancel;
  const invalid = rows.filter((x) => !x.isCancelled && !x.valid);
  const allCancelled = rows.length > 0 && rows.every((x) => x.isCancelled);
  const notesOk = reason !== 'Other' || notes.trim().length >= 3;

  const canSubmit = changes.length > 0 && !invalid.length && !allCancelled && !!reason && notesOk && !saving;
  const hint = !changes.length ? 'Change a price or cancel a service.'
    : invalid.length ? `Enter a new price for ${invalid[0].m.label || 'the service'}.`
    : allCancelled ? 'At least one service must stay on the booking.'
    : !reason ? 'Select the reason for the revision.'
    : !notesOk ? 'Add a note for "Other".' : '';

  const toggleCancel = async (i, label) => {
    if (cancelled[i]) { setCancelled((c) => { const n = { ...c }; delete n[i]; return n; }); return; }
    const ok = await confirm({ title: 'Cancel this service?', message: `${label} will be removed from the estimate. Its price stays in the history.`, confirmText: 'Cancel Service', destructive: true });
    if (!ok) return;
    setCancelled((c) => ({ ...c, [i]: true }));
    if (!reason) setReason('Service Cancelled');
  };

  const submit = async () => {
    if (!canSubmit || sendingRef.current) return;
    sendingRef.current = true;
    setSaving(true);
    try {
      await ticketApi.post(`/tickets/${ticketId}/price-revision`, {
        body: {
          changes: changes.map((x) => ({
            index: x.i,
            identity: identityOf(x.m),
            oldAmount: x.old,
            newAmount: x.isCancelled ? null : Number(x.raw),
            cancel: x.isCancelled,
          })),
          reason,
          notes: notes.trim() || null,
          customerApproved: needsApproval ? approvedNow : null,
        },
      });
      notify('Price revised', needsApproval && !approvedNow ? 'Saved — waiting for customer approval.' : 'Booking estimate updated.', { preset: 'done' });
      navigation.goBack();
    } catch (e) {
      if (e?.status === 409) {
        notify('Could not revise', e?.message || 'The prices changed. Reloading…', { preset: 'error' });
        load();
      } else {
        notify('Could not revise', e?.status === 404 ? 'Price Revised needs the latest app server. Please update the server.' : (e?.message || 'Try again.'), { preset: 'error' });
      }
    } finally {
      sendingRef.current = false;
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (changes.length || notes.trim()) {
      const ok = await confirm({ title: 'Discard revision?', message: 'The price changes will not be saved.', confirmText: 'Discard', destructive: true });
      if (!ok) return;
    }
    navigation.goBack();
  };

  if (loading && !ticket) {
    return <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ACCENT} size="large" /></View>;
  }
  if (loadError || !ticket) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 14, color: RED, textAlign: 'center' }}>{loadError || 'Could not load this booking.'}</Text>
        <Pressable onPress={load} style={{ marginTop: 12 }}><Text style={{ color: ACCENT, fontWeight: '800' }}>Try again</Text></Pressable>
      </View>
    );
  }

  const deviceName = String(ticket.deviceDisplayName || ticket.modelName || 'Device').split(' (')[0].split(' · ')[0];
  const statusText = String(ticket.status || '').replace(/_/g, ' ');

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: LINE }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center' }, col]}>
          <Pressable onPress={cancel} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go back" className="items-center justify-center active:opacity-70" style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PAGE, borderWidth: 1, borderColor: LINE }}>
            <ArrowLeft size={18} color={INK} strokeWidth={2} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: INK }}>Price Revised</Text>
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>Modify existing repair charges · #{ticket.trackingId}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
      </View>

      <KeyboardAwareScrollView bottomOffset={100} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24 }}>
        <View style={col}>
          {/* Device + current approved estimate */}
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ height: 48, width: 48, borderRadius: 12, backgroundColor: PAGE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {ticket.deviceImageUrl ? <Image source={{ uri: ticket.deviceImageUrl }} style={{ width: '88%', height: '88%' }} resizeMode="contain" /> : <Smartphone size={22} color={MUTED} />}
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: INK }} numberOfLines={1}>{deviceName}</Text>
                {statusText ? <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 1 }} numberOfLines={1}>Status: {statusText} (unchanged)</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 10.5, color: MUTED }}>Current estimate</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: ACCENT }}>{inr(currentTotal)}</Text>
              </View>
            </View>
          </Card>

          {/* Existing services */}
          <Title text="Existing Services" />
          {rows.length === 0 ? (
            <Card><Text style={{ fontSize: 12.5, color: MUTED }}>This booking has no services to revise. Use Re-Est to add one.</Text></Card>
          ) : rows.map((x) => {
            const diff = x.isCancelled ? -x.old : (x.valid ? x.next - x.old : 0);
            const label = x.m.label || x.m.serviceName || 'Service';
            return (
              <View key={`${identityOf(x.m)}-${x.i}`} style={{ marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: x.isCancelled ? '#FECACA' : x.changed ? MINT_LINE : LINE, backgroundColor: x.isCancelled ? '#FEF2F2' : '#FFFFFF', padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '800', color: INK, textDecorationLine: x.isCancelled ? 'line-through' : 'none' }} numberOfLines={2}>{label}</Text>
                    {x.m.warranty ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>Warranty: {x.m.warranty}</Text> : null}
                  </View>
                  <Pressable onPress={() => toggleCancel(x.i, label)} hitSlop={6} accessibilityRole="button" className="flex-row items-center active:opacity-70" style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: x.isCancelled ? LINE : '#FECACA', backgroundColor: '#FFFFFF' }}>
                    {x.isCancelled ? <RotateCcw size={13} color={ACCENT} /> : <XCircle size={13} color={RED} />}
                    <Text style={{ marginLeft: 4, fontSize: 11.5, fontWeight: '800', color: x.isCancelled ? ACCENT : RED }}>{x.isCancelled ? 'Undo' : 'Cancel Service'}</Text>
                  </Pressable>
                </View>
                {x.isCancelled ? (
                  <Text style={{ marginTop: 8, fontSize: 12, fontWeight: '700', color: RED }}>Cancelled · − {inr(x.old)}</Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: MUTED }}>Old Price</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: INK, marginTop: 2 }}>{inr(x.old)}</Text>
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <Text style={{ fontSize: 11, color: MUTED }}>New Price</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, marginTop: 2, borderRadius: 10, borderWidth: 1, borderColor: x.valid ? LINE : '#FECACA', paddingHorizontal: 10, backgroundColor: '#FFFFFF' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: MUTED, marginRight: 4 }}>₹</Text>
                        <TextInput
                          value={x.raw}
                          onChangeText={(v) => setPrices((p) => ({ ...p, [x.i]: v.replace(/[^0-9.]/g, '') }))}
                          keyboardType="numeric"
                          placeholder="New price"
                          placeholderTextColor={SUBTLE}
                          cursorColor={ACCENT}
                          style={{ flex: 1, paddingVertical: 0, fontSize: 14, fontWeight: '800', color: INK }}
                        />
                      </View>
                    </View>
                    <View style={{ flex: 0.9, alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, color: MUTED }}>Difference</Text>
                      <Text style={{ fontSize: 13.5, fontWeight: '800', marginTop: 2, color: diff < 0 ? GREEN : diff > 0 ? AMBER : MUTED }}>{signed(diff)}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          {/* Reason */}
          <Title text="Reason for Revision" required />
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {REASONS.map((x) => {
                const on = reason === x;
                return (
                  <Pressable key={x} onPress={() => setReason(x)} accessibilityRole="radio" accessibilityState={{ selected: on }} className="active:opacity-80" style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: on ? 1.5 : 1, borderColor: on ? ACCENT : LINE, backgroundColor: on ? MINT : '#FFFFFF' }}>
                    <Text style={{ fontSize: 12.5, fontWeight: on ? '800' : '600', color: on ? ACCENT : INK }}>{x}</Text>
                  </Pressable>
                );
              })}
            </View>
            {reason === 'Other' ? <TextInput value={notes} onChangeText={setNotes} placeholder="Describe the reason (required)" placeholderTextColor={SUBTLE} multiline maxLength={300} textAlignVertical="top" cursorColor={ACCENT} style={{ marginTop: 10, minHeight: 56, borderRadius: 10, borderWidth: 1, borderColor: LINE, padding: 10, fontSize: 13.5, color: INK, includeFontPadding: false }} /> : null}
          </Card>

          {/* Summary */}
          <Title text="Price Summary" />
          <Card>
            <SumRow label="Previous Total" value={inr(currentTotal)} />
            <SumRow label="Adjustment" value={signed(delta)} color={delta < 0 ? GREEN : delta > 0 ? AMBER : MUTED} />
            <View style={{ height: 1, backgroundColor: LINE, marginVertical: 6 }} />
            <SumRow label="Proposed Revised Total" value={inr(proposed)} bold />
          </Card>

          {/* Approval */}
          <Title text="Customer Approval" />
          {needsApproval ? (
            <Pressable onPress={() => setApprovedNow((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: approvedNow }} className="flex-row items-center active:opacity-80" style={{ borderRadius: 14, borderWidth: 1, borderColor: approvedNow ? MINT_LINE : LINE, backgroundColor: approvedNow ? MINT : '#FFFFFF', padding: 12 }}>
              {approvedNow ? <CircleCheck size={20} color={ACCENT} strokeWidth={2} /> : <Circle size={20} color="#D1D5DB" strokeWidth={2} />}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK }}>Customer approved at the counter</Text>
                <Text style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                  {approvedNow ? `Customer approved ${inr(currentTotal)} → ${inr(proposed)}.` : `${increase ? 'A higher price' : 'A cancelled service'} needs fresh approval — leave unticked to wait for the customer.`}
                </Text>
              </View>
            </Pressable>
          ) : (
            <Card><Text style={{ fontSize: 12.5, color: MUTED }}>{changes.length ? 'The price only goes down — the current customer approval stays.' : 'Approval is needed only if a price goes up or a service is cancelled.'}</Text></Card>
          )}
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: LINE, paddingHorizontal: 14, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
          <View style={col}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={cancel} accessibilityRole="button" className="flex-1 items-center justify-center active:opacity-80" style={{ height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: LINE, backgroundColor: '#FFFFFF' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: INK }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={submit} disabled={!canSubmit} accessibilityRole="button" accessibilityState={{ disabled: !canSubmit }} className="flex-1 items-center justify-center active:opacity-85" style={{ height: 48, borderRadius: 12, backgroundColor: ACCENT, opacity: canSubmit ? 1 : 0.45 }}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Submit Revision</Text>}
              </Pressable>
            </View>
            {hint ? <Text style={{ fontSize: 11.5, color: MUTED, textAlign: 'center', marginTop: 6 }}>{hint}</Text> : null}
          </View>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function Title({ text, required }) {
  return (
    <Text style={{ fontSize: 13.5, fontWeight: '800', color: INK, marginTop: 14, marginBottom: 6 }}>
      {text}{required ? <Text style={{ color: RED }}> *</Text> : null}
    </Text>
  );
}

function Card({ children }) {
  return <View style={{ borderRadius: 14, borderWidth: 1, borderColor: LINE, backgroundColor: '#FFFFFF', padding: 12 }}>{children}</View>;
}

function SumRow({ label, value, color, bold }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3 }}>
      <Text style={{ flex: 1, fontSize: bold ? 14 : 13, fontWeight: bold ? '800' : '500', color: bold ? INK : MUTED }}>{label}</Text>
      <Text style={{ fontSize: bold ? 18 : 13.5, fontWeight: '800', color: color || (bold ? ACCENT : INK) }}>{value}</Text>
    </View>
  );
}
