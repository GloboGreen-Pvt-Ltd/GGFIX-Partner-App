import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Share2,
  Printer,
  ChevronLeft,
  Receipt,
  Building2,
  CheckCircle2,
  FileCheck2,
  Truck,
  User,
  Phone,
  MapPin,
  ClipboardList,
  IndianRupee,
  ListChecks,
} from 'lucide-react-native';
import { Loader } from '../../../components/rnr';
import { confirm, notify } from '../../../components/confirm';
import { ticketApi } from '../../../api/client';

const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';
const ACCENT_GREEN = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
};

// Billing + handover substages between READY and DELIVERED. Each Submit POSTs
// /tickets/{id}/progress-events so the customer + owner Service History rails
// light up the matching row. Order matches TicketService.LIFECYCLE_ORDER on
// the backend — must advance in this sequence:
//   READY -> INVOICE_GENERATED -> INVOICE_READY -> DELIVERED_PROCESSING -> DELIVERED
const HANDOFF_STEPS = [
  {
    key: 'INVOICE_GENERATED',
    label: 'Invoice Generated',
    hint: 'Mark when the invoice has been generated for billing.',
    confirmTitle: 'Invoice Generated?',
    confirmMessage: 'Record that the invoice has been generated. This advances the booking to "Invoice Generated" on the customer history.',
    Icon: Receipt,
  },
  {
    key: 'INVOICE_READY',
    label: 'Invoice Ready',
    hint: 'Mark when the invoice is finalized and ready for customer payment.',
    confirmTitle: 'Invoice Ready?',
    confirmMessage: 'Record that the invoice is finalized and ready for customer hand-off. Customer history advances to "Invoice Ready".',
    Icon: FileCheck2,
  },
  {
    key: 'DELIVERED_PROCESSING',
    label: 'Delivered to Customer Processing',
    hint: 'Mark when the handover has started but the customer has not yet received the device.',
    confirmTitle: 'Start delivery handover?',
    confirmMessage: 'Record that the delivery handover is in progress. The booking will move to "Delivered Processing" — it does NOT mark the device as delivered.',
    Icon: Truck,
  },
  {
    key: 'DELIVERED',
    label: 'Delivered to Customer',
    hint: 'Final step — only mark once the customer has physically received the device.',
    confirmTitle: 'Confirm Delivery',
    confirmMessage: 'This marks the booking as DELIVERED — the terminal state. Only confirm once the customer has physically received the device.',
    Icon: CheckCircle2,
    destructive: true,
  },
];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function priceItemsFromTicket(ticket) {
  if (Array.isArray(ticket.priceItems)) return ticket.priceItems;
  if (ticket.priceItemsJson) {
    try {
      const parsed = JSON.parse(ticket.priceItemsJson);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return ticket.services?.map?.((s) => ({ id: s.id, label: s.serviceName, amount: s.price })) || [];
}

function buildReceiptText(t) {
  const items = priceItemsFromTicket(t);
  const subtotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + tax;
  return (
    `🧾 GGFix — Delivery Invoice\n` +
    `â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n` +
    `Receipt #: ${t.trackingId || t.id}\n` +
    `Date: ${formatDate(t.deliveredAt || t.createdAt)}\n\n` +
    `From: ${t.shopName || 'GGFix Service Center'}\n` +
    `${t.shopAddress || ''}\n` +
    `${t.shopPhone ? 'Ph: ' + t.shopPhone : ''}\n\n` +
    `To: ${t.customerName || '—'}\n` +
    `${t.customerPhone ? 'Mobile: ' + t.customerPhone : ''}\n` +
    `${t.customerAddress || ''}\n\n` +
    `Device: ${t.deviceDisplayName || t.deviceModelName || t.modelName || '—'}\n\n` +
    `â”€â”€â”€ Services â”€â”€â”€\n` +
    items.map((i, idx) => `${idx + 1}. ${i.label}   ₹${Number(i.amount || 0).toLocaleString('en-IN')}`).join('\n') +
    `\n\nSubtotal: ₹${subtotal.toLocaleString('en-IN')}\n` +
    `GST (18%): ₹${tax.toLocaleString('en-IN')}\n` +
    `â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€\n` +
    `Total: ₹${total.toLocaleString('en-IN')}\n\n` +
    `Thank you for choosing GGFix!\n` +
    `30-day repair warranty included.`
  );
}

function SectionHeader({ icon: Icon, label, tint = '#E6F7E3', accent = BRAND_GREEN_DARK }) {
  return (
    <View className="flex-row items-center mb-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2"
        style={{ backgroundColor: tint }}
      >
        <Icon size={14} color={accent} />
      </View>
      <Text
        className="text-[11px] font-bold tracking-widest"
        style={{ color: accent, letterSpacing: 1.3 }}
      >
        {label}
      </Text>
    </View>
  );
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <View className="flex-row items-start py-2">
      <View
        className="w-8 h-8 rounded-full items-center justify-center mr-3"
        style={{ backgroundColor: '#F0F8EF' }}
      >
        <Icon size={14} color={ACCENT_GREEN} />
      </View>
      <View className="flex-1">
        <Text className="text-[10.5px] uppercase font-semibold text-gray-400 mb-0.5" style={{ letterSpacing: 0.6 }}>
          {label}
        </Text>
        <Text className="text-[13px] font-semibold text-gray-900 leading-5">
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function DeliveryInvoiceScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const ticketId = route?.params?.ticketId;
  const [ticket, setTicket] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submittingKey, setSubmittingKey] = useState(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    try {
      const [t, ev] = await Promise.all([
        ticketApi.get(`/tickets/${ticketId}`).catch(() => null),
        ticketApi.get(`/tickets/${ticketId}/events`).catch(() => []),
      ]);
      setTicket(t || {});
      setEvents(Array.isArray(ev) ? ev : (ev?.content ?? []));
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Keyed by step.key — true once a matching repair_booking_events row exists.
  const completedSteps = useMemo(() => {
    const done = {};
    (events || []).forEach((e) => {
      const k = String(e.status || '').toUpperCase();
      if (HANDOFF_STEPS.some((s) => s.key === k)) done[k] = true;
    });
    return done;
  }, [events]);

  // Submit a single step. Disallows jumping ahead: the previous handoff step
  // must already be completed (or the step must be the first in the chain).
  // Mirrors the backend lifecycle ladder so the customer history rail stays
  // in order even if the owner taps an out-of-sequence row.
  const submitStep = useCallback(async (step) => {
    if (!ticketId) return;
    const idx = HANDOFF_STEPS.findIndex((s) => s.key === step.key);
    if (idx > 0) {
      const prev = HANDOFF_STEPS[idx - 1];
      if (!completedSteps[prev.key]) {
        notify(
          'Complete the previous step first',
          `Mark "${prev.label}" before recording "${step.label}".`,
        );
        return;
      }
    }
    const ok = await confirm({
      title: step.confirmTitle || step.label,
      message: step.confirmMessage || `Record "${step.label}" for this booking?`,
      confirmText: step.label,
      destructive: !!step.destructive,
    });
    if (!ok) return;
    setSubmittingKey(step.key);
    try {
      await ticketApi.post(`/tickets/${ticketId}/progress-events`, {
        body: { statusKey: step.key, actor: 'OWNER' },
      });
      notify('Saved', `"${step.label}" recorded.`);
      await load();
    } catch (e) {
      notify('Save failed', e?.message || 'Try again');
    } finally {
      setSubmittingKey(null);
    }
  }, [ticketId, completedSteps, load]);

  if (loading) return <Loader label="Loading invoice..." />;

  const t = ticket || {};
  const items = priceItemsFromTicket(t);
  const subtotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + tax;
  const trackingId = t.trackingId || t.id || '—';

  const handleShare = async () => {
    try {
      await Share.share({
        message: buildReceiptText(t),
        title: `Invoice ${t.trackingId || t.id}`,
      });
    } catch (e) {
      notify('Share failed', e?.message || 'Try again');
    }
  };

  const handlePrint = () => {
    notify(
      'Print via share sheet',
      'Tap Share and choose "Print" from the system share sheet. Native print needs Expo Print module.',
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Slim white header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingTop: insets.top + 6,
          paddingBottom: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center mr-3 bg-surface-muted"
          >
            <ChevronLeft size={22} color="#172117" />
          </TouchableOpacity>
          <Text className="flex-1 text-text text-[17px] font-extrabold" numberOfLines={1}>
            Delivery Invoice
          </Text>
          <View
            className="px-2.5 py-1 rounded-full bg-surface-muted"
            style={{ maxWidth: 160 }}
          >
            <Text className="text-text text-[11px] font-extrabold" numberOfLines={1}>
              #{trackingId}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* From (shop) letterhead */}
        <View className="px-4" style={{ marginTop: 12 }}>
          <View
            className="bg-white rounded-2xl p-4 flex-row items-center"
            style={cardShadow}
          >
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mr-3"
              style={{ backgroundColor: '#E6F7E3' }}
            >
              <Building2 size={24} color={BRAND_GREEN_DARK} />
            </View>
            <View className="flex-1">
              <Text className="text-[10.5px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.7 }}>
                From
              </Text>
              <Text className="text-[15px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>
                {t.shopName || 'GGFix Service Center'}
              </Text>
              <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={2}>
                {t.shopAddress || 'India'}
              </Text>
              {t.shopPhone ? (
                <Text className="text-[11px] text-gray-500">Ph: {t.shopPhone}</Text>
              ) : null}
            </View>
            <View
              className="px-2.5 py-1 rounded-full"
              style={{ backgroundColor: BRAND_GREEN }}
            >
              <Text className="text-white text-[10px] font-extrabold tracking-wide">
                DELIVERY
              </Text>
            </View>
          </View>
        </View>

        {/* Invoice meta */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={Receipt} label="INVOICE DETAILS" />
            <View className="flex-row -mx-1">
              <View
                className="px-1 flex-1 mr-1 rounded-xl p-3"
                style={{ backgroundColor: '#F0F8EF' }}
              >
                <Text className="text-[9.5px] uppercase font-bold text-gray-500" style={{ letterSpacing: 0.6 }}>
                  Receipt No.
                </Text>
                <Text
                  className="text-[13px] font-extrabold mt-1"
                  style={{ color: BRAND_GREEN_DARK }}
                  numberOfLines={1}
                >
                  {trackingId}
                </Text>
              </View>
              <View
                className="px-1 flex-1 ml-1 rounded-xl p-3"
                style={{ backgroundColor: '#F0F8EF' }}
              >
                <Text className="text-[9.5px] uppercase font-bold text-gray-500" style={{ letterSpacing: 0.6 }}>
                  Date
                </Text>
                <Text
                  className="text-[12px] font-extrabold mt-1"
                  style={{ color: BRAND_GREEN_DARK }}
                  numberOfLines={1}
                >
                  {formatDate(t.deliveredAt || t.createdAt)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Bill to */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={User} label="BILL TO" />
            <DetailRow icon={User} label="Customer" value={t.customerName || '—'} />
            {t.customerPhone ? (
              <DetailRow icon={Phone} label="Mobile" value={t.customerPhone} />
            ) : null}
            {t.customerAddress ? (
              <DetailRow icon={MapPin} label="Address" value={t.customerAddress} />
            ) : null}
          </View>
        </View>

        {/* Items */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={ClipboardList} label="ITEMS" />

            <View
              className="flex-row pb-2 mb-1"
              style={{ borderBottomWidth: 1, borderBottomColor: '#EFF5EE' }}
            >
              <Text className="text-[10px] font-extrabold text-gray-400 w-6" style={{ letterSpacing: 0.6 }}>#</Text>
              <Text className="text-[10px] font-extrabold text-gray-400 flex-1" style={{ letterSpacing: 0.6 }}>DESCRIPTION</Text>
              <Text
                className="text-[10px] font-extrabold text-gray-400 text-right"
                style={{ width: 76, letterSpacing: 0.6 }}
              >
                AMOUNT
              </Text>
            </View>

            {items.length === 0 ? (
              <Text className="text-[12px] text-gray-500 py-3">No items recorded</Text>
            ) : items.map((item, i) => (
              <View
                key={item.id || i}
                className="flex-row items-center py-2"
                style={{
                  borderBottomWidth: i < items.length - 1 ? 1 : 0,
                  borderBottomColor: '#F7FAF7',
                }}
              >
                <View
                  className="w-6 h-6 rounded-full items-center justify-center"
                  style={{ backgroundColor: '#E6F7E3' }}
                >
                  <Text
                    className="text-[10px] font-extrabold"
                    style={{ color: BRAND_GREEN_DARK }}
                  >
                    {i + 1}
                  </Text>
                </View>
                <Text className="text-[12.5px] text-gray-800 flex-1 pl-2 pr-2" numberOfLines={2}>
                  {item.label}
                </Text>
                <Text
                  className="text-[12.5px] font-bold text-gray-900 text-right"
                  style={{ width: 76 }}
                >
                  ₹{Number(item.amount || 0).toLocaleString('en-IN')}
                </Text>
              </View>
            ))}

            <View
              className="mt-3 p-3 rounded-2xl"
              style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF' }}
            >
              <View className="flex-row justify-between py-1">
                <Text className="text-[12px] text-gray-600">Subtotal</Text>
                <Text className="text-[12.5px] font-bold text-gray-900">
                  ₹{subtotal.toLocaleString('en-IN')}
                </Text>
              </View>
              <View className="flex-row justify-between py-1">
                <Text className="text-[12px] text-gray-600">GST (18%)</Text>
                <Text className="text-[12.5px] font-bold text-gray-900">
                  ₹{tax.toLocaleString('en-IN')}
                </Text>
              </View>
              <View
                className="my-2"
                style={{ borderTopWidth: 1, borderTopColor: '#C8EEBF', borderStyle: 'dashed' }}
              />
              <View className="flex-row justify-between items-center">
                <View className="flex-row items-center">
                  <View
                    className="w-8 h-8 rounded-full items-center justify-center mr-2"
                    style={{ backgroundColor: BRAND_GREEN }}
                  >
                    <IndianRupee size={14} color="#FFFFFF" />
                  </View>
                  <Text className="text-[13.5px] font-extrabold text-gray-900">Total</Text>
                </View>
                <Text
                  className="text-[18px] font-extrabold"
                  style={{ color: BRAND_GREEN_DARK }}
                >
                  ₹{total.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Billing & Handover checklist */}
        <View className="px-4 mt-4">
          <View
            className="bg-white rounded-2xl p-4"
            style={cardShadow}
          >
            <SectionHeader icon={ListChecks} label="BILLING & HANDOVER" />
            <Text className="text-[11.5px] text-gray-500 mb-3 leading-4">
              Record each step as it happens. The booking advances through
              Invoice Generated → Invoice Ready → Delivered Processing →
              Delivered to Customer.
            </Text>
            {HANDOFF_STEPS.map((step) => {
              const done = !!completedSteps[step.key];
              const busy = submittingKey === step.key;
              const StepIcon = step.Icon;
              return (
                <Pressable
                  key={step.key}
                  disabled={done || busy}
                  onPress={() => submitStep(step)}
                  className="flex-row items-center rounded-2xl p-3 mb-2"
                  style={{
                    backgroundColor: done ? '#F0F8EF' : '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: done ? BRAND_GREEN : '#E2E8E2',
                  }}
                >
                  <View
                    className="w-11 h-11 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: done ? BRAND_GREEN : '#F0F8EF' }}
                  >
                    {done ? (
                      <CheckCircle2 size={20} color="#FFFFFF" />
                    ) : (
                      <StepIcon size={18} color={ACCENT_GREEN} />
                    )}
                  </View>
                  <View className="flex-1 pr-2">
                    <Text
                      className="text-[13px] font-extrabold"
                      style={{ color: done ? BRAND_GREEN_DARK : '#172117' }}
                    >
                      {step.label}
                    </Text>
                    <Text className="text-[10.5px] text-gray-500 mt-0.5">{step.hint}</Text>
                  </View>
                  {done ? (
                    <View
                      className="px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: BRAND_GREEN }}
                    >
                      <Text className="text-white text-[10px] font-extrabold tracking-wide">
                        DONE
                      </Text>
                    </View>
                  ) : busy ? (
                    <View
                      className="px-2.5 py-1 rounded-full flex-row items-center"
                      style={{ backgroundColor: '#E6F7E3' }}
                    >
                      <ActivityIndicator size="small" color={BRAND_GREEN_DARK} />
                      <Text
                        className="ml-1 text-[10px] font-extrabold tracking-wide"
                        style={{ color: BRAND_GREEN_DARK }}
                      >
                        SAVING
                      </Text>
                    </View>
                  ) : (
                    <View
                      className="px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: '#E6F7E3' }}
                    >
                      <Text
                        className="text-[10px] font-extrabold tracking-wide"
                        style={{ color: BRAND_GREEN_DARK }}
                      >
                        SUBMIT
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Footer note */}
        <View className="px-4 mt-4">
          <View
            className="rounded-2xl p-3"
            style={{ backgroundColor: '#F0F8EF', borderWidth: 1, borderColor: '#C8EEBF' }}
          >
            <Text className="text-[10.5px] text-gray-600 leading-4">
              We declare that this invoice shows the actual price of the goods described above and all particulars are true and correct. 30-day repair warranty included.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Sticky action bar */}
      <View
        className="absolute left-0 right-0 bottom-0 flex-row px-4 pt-3"
        style={{
          paddingBottom: insets.bottom + 12,
          backgroundColor: 'rgba(240, 248, 239, 0.96)',
          borderTopWidth: 1,
          borderTopColor: '#E2E8E2',
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePrint}
          className="flex-1 mr-2 rounded-2xl py-3.5 flex-row items-center justify-center"
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1.5,
            borderColor: BRAND_GREEN,
            ...cardShadow,
          }}
        >
          <Printer size={16} color={BRAND_GREEN_DARK} />
          <Text className="ml-2 text-[14px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
            Print
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleShare}
          className="flex-1 ml-2"
          style={cardShadow}
        >
          <LinearGradient
            colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Share2 size={16} color="#FFFFFF" />
            <Text className="ml-2 text-white text-[14px] font-extrabold">Share</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
