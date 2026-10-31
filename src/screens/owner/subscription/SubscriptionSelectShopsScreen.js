import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MapPin, Plus, Search, Store, X } from 'lucide-react-native';
import { useResponsive } from '../../../theme/responsive';
import { activateTrial, getCatalog, getEligibleShops, getQuotePreview } from '../../../api/subscription';
import { confirm, notify } from '../../../components/confirm';
import { formatDate, formatPaise, titleCase } from '../../../subscription/format';
import {
  Badge, Btn, C, Checkbox, EmptyState, ErrorState, SkeletonCards, SubHeader, capFor, shadow, statusTone,
} from '../../../subscription/ui';

/**
 * Pick the owner's shops for the chosen plan. Eligible shops come from the
 * server (`/subscriptions/eligible-shops`); the estimate from `/quote/preview`.
 * Add New Shop opens the existing Add Shop form and the list refreshes on
 * return with the current selection kept.
 */
export default function SubscriptionSelectShopsScreen({ navigation, route }) {
  const { planCode, trial = false } = route?.params || {};
  // Read once — renew keeps the currently covered shops selected.
  const preselectRef = useRef(route?.params?.preselect || []);
  const r = useResponsive();
  const cap = capFor(r);

  const [plan, setPlan] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const loadedOnce = useRef(false);
  const preselectApplied = useRef(false);
  const planRef = useRef(null);

  const load = useCallback(async (silent) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const [cat, list] = await Promise.all([
        planRef.current ? Promise.resolve(null) : getCatalog(),
        getEligibleShops(),
      ]);
      if (cat) {
        const p = (cat.plans || []).find((x) => x.code === planCode) || null;
        planRef.current = p;
        setPlan(p);
        if (!p) setError('This plan is no longer available.');
      }
      const rows = Array.isArray(list) ? list : [];
      setShops(rows);
      // Drop selections that are no longer selectable; apply the renew preselect once.
      setSelected((prev) => {
        const ok = new Set(rows.filter((s) => s.selectable).map((s) => s.shopId));
        const next = new Set([...prev].filter((id) => ok.has(id)));
        if (!preselectApplied.current) {
          preselectRef.current.forEach((id) => { if (ok.has(id)) next.add(id); });
          preselectApplied.current = true;
        }
        return next;
      });
      loadedOnce.current = true;
    } catch (e) {
      if (!silent || !loadedOnce.current) setError(e?.message || 'Could not load your shops.');
      else notify('Could not refresh shops', e?.message || '', { preset: 'error' });
    } finally {
      setLoading(false);
    }
  }, [planCode]);

  // Refresh on every focus — returning from Add Shop shows the new shop.
  useFocusEffect(useCallback(() => { load(loadedOnce.current); }, [load]));

  const maxShops = plan?.shopLimit === null || plan?.shopLimit === undefined ? null : Number(plan.shopLimit);
  const count = selected.size;

  // Debounced server estimate (paid plans only).
  useEffect(() => {
    if (trial || !plan || count === 0) { setEstimate(null); setEstimateError(null); return undefined; }
    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const q = await getQuotePreview(planCode, count);
        if (!cancelled) { setEstimate(q || null); setEstimateError(null); }
      } catch (e) {
        if (!cancelled) { setEstimate(null); setEstimateError(e?.message || 'Estimate unavailable'); }
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [trial, plan, planCode, count]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter((s) => [s.name, s.shopCode, s.location].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [shops, query]);

  const limitNotice = () => notify('Shop limit reached', `${plan?.name || 'This plan'} covers up to ${maxShops} shop${maxShops === 1 ? '' : 's'}.`, { type: 'warning' });

  const toggle = (shop) => {
    if (!shop.selectable) {
      if (shop.reason) notify('Shop not available', shop.reason, { type: 'warning' });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(shop.shopId)) next.delete(shop.shopId);
      else if (maxShops !== null && next.size >= maxShops) { limitNotice(); return prev; }
      else next.add(shop.shopId);
      return next;
    });
  };

  const selectAll = () => {
    const eligible = shops.filter((s) => s.selectable).map((s) => s.shopId);
    if (maxShops !== null && eligible.length > maxShops) limitNotice();
    setSelected(new Set(maxShops === null ? eligible : eligible.slice(0, maxShops)));
  };

  const chosen = shops.filter((s) => selected.has(s.shopId));

  const onContinue = async () => {
    if (!count || !plan) return;
    if (!trial) {
      navigation.navigate('SubscriptionSummary', {
        planCode,
        shopIds: chosen.map((s) => s.shopId),
        shops: chosen.map((s) => ({ shopId: s.shopId, name: s.name })),
      });
      return;
    }
    const ok = await confirm({
      title: 'Start free trial?',
      message: `${plan.name}${plan.durationLabel ? ` (${plan.durationLabel})` : ''} for ${count} shop${count === 1 ? '' : 's'}: ${chosen.map((s) => s.name).join(', ')}.\n\nThe free trial can be used only once.`,
      confirmText: 'Start Trial',
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const me = await activateTrial(chosen.map((s) => s.shopId));
      navigation.replace('SubscriptionSuccess', {
        kind: 'trial',
        me,
        shops: chosen.map((s) => ({ shopId: s.shopId, name: s.name })),
        planName: plan.name,
        durationLabel: plan.durationLabel,
      });
    } catch (e) {
      notify('Could not start trial', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const renderShop = ({ item: s }) => {
    const on = selected.has(s.shopId);
    const cov = s.coverage || {};
    return (
      <Pressable
        onPress={() => toggle(s)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on, disabled: !s.selectable }}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', padding: 11, marginTop: 8, borderRadius: 14, minHeight: 56,
          backgroundColor: on ? C.tealSoft : C.white, borderWidth: 1, borderColor: on ? C.tealLine : C.line,
          opacity: pressed ? 0.85 : 1, ...shadow,
        })}
      >
        <View style={{ flex: 1, marginRight: 10, opacity: s.selectable ? 1 : 0.6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.ink, marginRight: 6 }}>{s.name || 'Shop'}</Text>
            {s.shopCode ? <Text style={{ fontSize: 11, color: C.muted }}>{s.shopCode}</Text> : null}
          </View>
          {s.location ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 3 }}>
              <MapPin size={11} color={C.subtle} style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, fontSize: 11.5, color: C.muted, marginLeft: 4 }}>{s.location}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, flexWrap: 'wrap', gap: 6 }}>
            <Badge label={cov.status && cov.status !== 'NONE' ? titleCase(cov.status) : 'Not covered'} tone={statusTone(cov.status)} />
            {cov.planName ? <Text style={{ fontSize: 11, color: C.muted }}>{`${cov.planName}${cov.endsAt ? ` · until ${formatDate(cov.endsAt)}` : ''}`}</Text> : null}
          </View>
          {!s.selectable && s.reason ? <Text style={{ fontSize: 11, color: C.orangeInk, marginTop: 4 }}>{s.reason}</Text> : null}
        </View>
        <Checkbox checked={on} disabled={!s.selectable} />
      </Pressable>
    );
  };

  const footerTotal = trial ? 'Free' : estimating ? null : estimate ? formatPaise(estimate.totalPaise) : '—';

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SubHeader
        title="Select Shops"
        subtitle="Choose the shops to activate under your selected subscription."
        onBack={() => navigation.goBack()}
        capStyle={cap}
      />

      {loading ? (
        <View style={[{ paddingHorizontal: 14 }, cap]}><SkeletonCards count={4} /></View>
      ) : error && !plan ? (
        <ErrorState title="Could not load" message={error} onRetry={() => load(false)} />
      ) : (
        <>
          <View style={[{ paddingHorizontal: 14, paddingTop: 10 }, cap]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 10, height: 44, backgroundColor: C.soft }}>
              <Search size={16} color={C.subtle} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search shop name, code or location"
                placeholderTextColor={C.subtle}
                style={{ flex: 1, marginLeft: 8, fontSize: 13, color: C.ink, paddingVertical: 0 }}
                returnKeyType="search"
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search"><X size={16} color={C.muted} /></Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
              <Btn label="Select All Eligible" variant="outline" compact onPress={selectAll} style={{ flex: 1.6, paddingHorizontal: 8 }} />
              <Btn label="Clear" variant="outline" compact onPress={() => setSelected(new Set())} disabled={!count} style={{ flex: 1, paddingHorizontal: 8 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, minHeight: 40 }}>
              <Text style={{ flex: 1, fontSize: 11, color: C.muted, marginRight: 8 }}>
                {maxShops !== null ? `${plan?.name || 'This plan'} covers up to ${maxShops} shop${maxShops === 1 ? '' : 's'}.` : `${shops.filter((x) => x.selectable).length} eligible shop${shops.filter((x) => x.selectable).length === 1 ? '' : 's'}`}
              </Text>
              <Pressable
                onPress={() => navigation.navigate('OwnerShopInfo', { mode: 'create' })}
                hitSlop={10}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
              >
                <Plus size={14} color={C.teal} />
                <Text style={{ marginLeft: 4, fontSize: 12.5, fontWeight: '800', color: C.teal }}>Add New Shop</Text>
              </Pressable>
            </View>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(s, i) => String(s.shopId || i)}
            renderItem={renderShop}
            style={{ flex: 1 }}
            contentContainerStyle={[{ paddingHorizontal: 14, paddingBottom: 16 }, cap]}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={(
              <EmptyState
                icon={Store}
                title={shops.length ? 'No shops match your search' : 'No shops yet'}
                message={shops.length ? 'Try a different name or code.' : 'Add a shop to cover it with this plan.'}
              />
            )}
          />

          <View style={{ borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.white, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 + r.insets.bottom }}>
            <View style={cap}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 12, color: C.muted }} numberOfLines={2}>
                    {`Selected Shops ${count} · ${[plan?.name, plan?.durationLabel].filter(Boolean).join(' ') || planCode}`}
                  </Text>
                  <Text style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{trial ? 'Free trial' : 'Estimated Total'}</Text>
                </View>
                {footerTotal === null ? <ActivityIndicator color={C.teal} /> : (
                  <Text style={{ fontSize: 17, fontWeight: '800', color: C.teal }}>{count ? footerTotal : '—'}</Text>
                )}
              </View>
              {estimateError && !trial && count ? <Text style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{estimateError}</Text> : null}
              <Btn
                label={trial ? 'Start Free Trial' : 'Continue'}
                onPress={onContinue}
                disabled={!count || !plan}
                loading={submitting}
                style={{ marginTop: 8 }}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}
