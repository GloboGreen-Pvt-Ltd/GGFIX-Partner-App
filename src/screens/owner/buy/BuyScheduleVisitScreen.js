import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, Text, View } from 'react-native';
import {
  Bell, CalendarCheck, CalendarDays, Check, ChevronDown, CircleCheck, MapPin, Phone, ShieldCheck, Store, Wallet,
} from 'lucide-react-native';
import { fetchMe } from '../../../api/auth';
import { scheduleShopPurchase } from '../../../api/orders';
import { getSession } from '../../../auth/session';
import { listingConditionLabel } from '../../../api/nearbyListings';
import { showToast } from '../../../components/Toast';
import { rf } from '../../../utils/responsive';
import { C, Card, ErrorBox, PickerModal, PrimaryButton, SellScreen, Thumb, money } from '../sell/kit';
import { clock, scheduleLabel, ymd } from './buyKit';
import { deviceSpecs, up, usePurchase } from './purchaseKit';

// Schedule Shop Visit — an accepted lead where the customer brings the device
// to the shop: pick the visit day + hour (POST /sell-orders/shop-purchases/{id}/schedule).
// The server notifies the customer with the shop name and time.

const DAYS_AHEAD = 14;
const HOURS = Array.from({ length: 12 }, (_, i) => 9 + i); // 9 AM – 8 PM
const hh = (h) => `${String(h).padStart(2, '0')}:00`;
const SCHEDULABLE = ['SELL_CONFIRMED', 'PICKUP_SCHEDULED', 'PICKUP_ASSIGNED'];

const STEPS = [
  { label: 'Quote Accepted', Icon: Check },
  { label: 'Schedule Visit', Icon: Store },
  { label: 'Inspection', Icon: ShieldCheck },
  { label: 'Payment', Icon: Wallet },
  { label: 'Completed', Icon: CircleCheck },
];

function Stepper({ at }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 6, marginBottom: 4 }}>
      {STEPS.map((st, i) => {
        const done = i < at;
        const now = i === at;
        const Icon = done ? Check : st.Icon;
        return (
          <View key={st.label} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : i <= at ? C.teal : C.border }} />
              <View style={{ height: 30, width: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: done || now ? C.teal : '#FFFFFF', borderWidth: 2, borderColor: done || now ? C.teal : C.border }}>
                <Icon size={15} color={done || now ? '#FFFFFF' : C.faint} strokeWidth={done ? 3 : 2} />
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === STEPS.length - 1 ? 'transparent' : i < at ? C.teal : C.border }} />
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 5, fontSize: rf(10.5), fontWeight: now ? '800' : '600', color: done ? C.teal : now ? C.text : C.muted }}>{st.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Head({ Icon, title, sub }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Icon size={20} color={C.teal} />
      <Text style={{ marginLeft: 8, fontSize: rf(14.5), fontWeight: '800', color: C.text }}>{title}</Text>
      {sub ? <Text style={{ marginLeft: 6, fontSize: rf(12), color: C.muted }}>{sub}</Text> : null}
    </View>
  );
}

export default function BuyScheduleVisitScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  }), []);
  const [date, setDate] = useState(ymd(days[0]));
  const [hour, setHour] = useState(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [shop, setShop] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const prefilled = useRef(false);

  // Shop the customer visits: the active shop (live /auth/me, else the saved session).
  useEffect(() => {
    (async () => {
      const s = (await fetchMe().catch(() => null)) || (await getSession().catch(() => null));
      setShop(s?.activeShop || null);
    })();
  }, []);

  // An existing visit time opens pre-selected.
  useEffect(() => {
    if (!o || prefilled.current) return;
    prefilled.current = true;
    if (o.pickupDate && days.some((d) => ymd(d) === o.pickupDate)) setDate(o.pickupDate);
    const h = o.pickupSlotStart ? Number(String(o.pickupSlotStart).split(':')[0]) : null;
    if (HOURS.includes(h)) setHour(h);
  }, [o]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date === ymd(days[0]);
  const nowHour = new Date().getHours();
  const past = (h) => isToday && h <= nowHour;
  useEffect(() => { if (hour != null && past(hour)) setHour(null); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSchedule = !!o && SCHEDULABLE.includes(up(o.status));

  const confirmVisit = async () => {
    if (hour == null) { setError({ message: 'Select a visit time slot' }); return; }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await scheduleShopPurchase(p.id, { pickupDate: date, slotStart: hh(hour), slotEnd: hh(hour + 1) });
      showToast({ type: 'success', title: o?.pickupDate ? 'Shop visit updated' : 'Shop visit scheduled', message: 'The customer has been notified.' });
      navigation.replace('BuyOrderDetail', { id: p.id, kind: 'LEAD', order: res });
    } catch (e) {
      setError(e);
      if (e?.status === 409) p.load();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const header = { title: 'Schedule Shop Visit', subtitle: 'Customer will visit your shop', onBack: () => navigation.goBack() };
  if (!o) {
    return (
      <SellScreen {...header}>
        {p.error ? (
          <ErrorBox tone={p.error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={p.error.message || 'Could not load the purchase.'} onRetry={p.load} style={{ marginTop: 16 }} />
        ) : <ActivityIndicator color={C.teal} style={{ marginTop: 40 }} />}
      </SellScreen>
    );
  }

  const { storage } = deviceSpecs(o);
  const specs = [o.condition ? listingConditionLabel(o.condition) : null, o.color, storage].filter(Boolean).join(' • ');
  const quote = o.quotedPrice ?? o.amount;
  const shopAddress = shop ? [shop.street, shop.address, shop.area, shop.district || shop.city, shop.state, shop.pincode].filter(Boolean).join(', ') : '';
  const shopPhone = shop?.mobile || shop?.mobilePrimary || shop?.phone || shop?.contactPhone || null;
  const dateOptions = days.map((d, i) => {
    const v = ymd(d);
    return { id: v, label: `${scheduleLabel(v)}${i === 0 ? ' (Today)' : i === 1 ? ' (Tomorrow)' : ''}` };
  });

  return (
    <SellScreen
      {...header}
      footer={(
        <PrimaryButton
          title="Confirm Shop Visit"
          icon={CalendarCheck}
          onPress={confirmVisit}
          loading={busy}
          disabled={!canSchedule || busy}
        />
      )}
    >
      <Stepper at={canSchedule ? 1 : 2} />

      {/* Device + accepted quote */}
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          <Thumb uri={o.imageUrl} size={84} radius={12} />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Text numberOfLines={2} style={{ flex: 1, fontSize: rf(14.5), fontWeight: '800', color: C.text }}>{o.productName || 'Device'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: C.greenBg, marginLeft: 6 }}>
                <CircleCheck size={12} color={C.green} />
                <Text style={{ marginLeft: 4, fontSize: rf(10.5), fontWeight: '800', color: C.text }}>Accepted</Text>
              </View>
            </View>
            {specs ? <Text numberOfLines={1} style={{ fontSize: rf(12), color: C.muted, marginTop: 3 }}>{specs}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: rf(11.5), color: C.muted }}>Quote Amount</Text>
                <Text style={{ fontSize: rf(18), fontWeight: '800', color: C.teal, marginTop: 1 }}>{money(quote)}</Text>
              </View>
              {o.orderNumber ? <Text style={{ fontSize: rf(11.5), color: C.muted }}>Lead ID: {o.orderNumber}</Text> : null}
            </View>
          </View>
        </View>
      </Card>

      {/* Visit date + time slot */}
      <Card style={{ marginTop: 14 }}>
        <Head Icon={CalendarDays} title="Visit Schedule" />
        <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text }}>Select Visit Date <Text style={{ color: C.red }}>*</Text></Text>
        <Pressable
          onPress={() => canSchedule && setDateOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Select visit date"
          className="active:opacity-80"
          style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, marginTop: 8 }}
        >
          <CalendarDays size={17} color={C.muted} />
          <Text style={{ flex: 1, marginLeft: 10, fontSize: rf(13), fontWeight: '700', color: C.text }}>{scheduleLabel(date)}</Text>
          <ChevronDown size={18} color={C.text} />
        </Pressable>

        <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text, marginTop: 14 }}>Select Visit Time Slot <Text style={{ color: C.red }}>*</Text></Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {HOURS.map((h) => {
            const on = h === hour;
            const off = past(h) || !canSchedule;
            return (
              <Pressable
                key={h}
                disabled={off}
                onPress={() => { setHour(h); setError(null); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: off }}
                style={{ width: '31%', flexGrow: 1, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: on ? C.teal : C.border, backgroundColor: on ? C.teal : off ? C.field : '#FFFFFF', opacity: off && !on ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: rf(12), fontWeight: '800', color: on ? '#FFFFFF' : C.text }}>{clock(hh(h))}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Shop the customer visits */}
      <View style={{ marginTop: 14, borderRadius: 14, borderWidth: 1, borderColor: C.mintLine, backgroundColor: '#FFFFFF', overflow: 'hidden' }}>
        <View style={{ backgroundColor: C.mint, paddingHorizontal: 12, paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Store size={20} color={C.teal} />
            <Text style={{ marginLeft: 8, fontSize: rf(14.5), fontWeight: '800', color: C.text }}>Shop Details</Text>
            <Text style={{ marginLeft: 6, fontSize: rf(12), color: C.muted }}>(Customer will visit)</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', padding: 12 }}>
          {shop?.frontImageUrl ? (
            <Image source={{ uri: shop.frontImageUrl }} style={{ width: 92, height: 64, borderRadius: 10, backgroundColor: C.field }} resizeMode="cover" />
          ) : (
            <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: C.mint, alignItems: 'center', justifyContent: 'center' }}>
              <Store size={24} color={C.teal} />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
            <Text numberOfLines={2} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{shop?.name || 'Your shop'}</Text>
            {shopAddress ? (
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <MapPin size={14} color={C.teal} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, marginLeft: 5, fontSize: rf(11.5), color: C.text }}>{shopAddress}</Text>
              </View>
            ) : null}
            {shopPhone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${shopPhone}`).catch(() => {})} accessibilityRole="button" accessibilityLabel={`Call ${shopPhone}`} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Phone size={14} color={C.teal} />
                <Text style={{ marginLeft: 5, fontSize: rf(11.5), color: C.text }}>{shopPhone}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {/* The server always notifies the customer when the visit is set. */}
      <Card style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Bell size={20} color={C.teal} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>Notify Customer</Text>
            <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>The customer gets a visit confirmation with your shop name & time.</Text>
          </View>
          <CircleCheck size={20} color={C.green} />
        </View>
      </Card>

      {!canSchedule ? <ErrorBox tone="warning" message="This visit can't be rescheduled any more." style={{ marginTop: 14 }} /> : null}
      {error ? <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message || 'Could not schedule the visit.'} style={{ marginTop: 14 }} /> : null}

      <PickerModal
        visible={dateOpen}
        title="Select Visit Date"
        options={dateOptions}
        searchable={false}
        selectedId={date}
        onSelect={(opt) => { setDate(opt.id); setDateOpen(false); setError(null); }}
        onClose={() => setDateOpen(false)}
      />
    </SellScreen>
  );
}
