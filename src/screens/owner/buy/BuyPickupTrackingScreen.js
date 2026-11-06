import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Check, ClipboardCheck, House, MapPin, PackageCheck, Phone, Store, UserPlus } from 'lucide-react-native';
import { getListingOrigin } from '../../../api/nearbyListings';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, PrimaryButton } from '../sell/kit';
import { Initials, PurchasePage, pickupSteps, up, usePurchase, whenLabel } from './purchaseKit';

// Page 3 — Pickup Tracking: the assigned employee and the steps they mark in the
// Employee App (Assigned → Accepted → Journey Started → Arrived → OTP Verified →
// Inspection Started → Inspection Submitted — real timestamps), and the
// customer ↔ shop distance. Re-reads every 20 s while open.

const STATUSES = ['PICKUP_ASSIGNED', 'OUT_FOR_PICKUP', 'PICKED_UP'];
const POLL_MS = 20000;

function km(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function TimelineStep({ title, sub, mode, last }) {
  // mode: done | current | todo
  const ring = mode === 'todo' ? '#C9CED6' : C.green;
  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ alignItems: 'center', width: 26 }}>
        <View style={{ height: 24, width: 24, borderRadius: 12, borderWidth: 2, borderColor: ring, backgroundColor: mode === 'done' ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          {mode === 'done' ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
          {mode === 'current' ? <View style={{ height: 12, width: 12, borderRadius: 6, backgroundColor: C.teal }} /> : null}
        </View>
        {!last ? <View style={{ flex: 1, width: 2, minHeight: 18, backgroundColor: mode === 'todo' ? '#E1E5EA' : C.green }} /> : null}
      </View>
      <View style={{ flex: 1, marginLeft: 12, paddingBottom: last ? 0 : 14 }}>
        <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: mode === 'todo' ? C.text : C.text }}>{title}</Text>
        {sub ? <Text style={{ fontSize: rf(11.5), color: mode === 'current' ? C.teal : C.muted, marginTop: 2 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function RouteCard({ from, to, address }) {
  const dist = from && to ? km(from, to) : null;
  const open = () => {
    if (!from) return;
    const url = to
      ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${from.lat},${from.lng}`;
    Linking.openURL(url).catch(() => {});
  };
  return (
    <Pressable onPress={open} disabled={!from} accessibilityRole="button" accessibilityLabel="Open the route in Maps" className="active:opacity-90"
      style={{ marginTop: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#EEF6EF', borderWidth: 1, borderColor: '#DCEBDD' }}>
      <View style={{ height: 130 }}>
        {/* Schematic: customer (home) → shop; distance is straight-line from the saved coordinates. */}
        <Svg width="100%" height="130" viewBox="0 0 320 130" preserveAspectRatio="none">
          <Path d="M0 30 H320 M0 75 H320 M0 110 H320 M60 0 V130 M150 0 V130 M240 0 V130" stroke="#FFFFFF" strokeWidth="6" />
          <Path d="M48 88 C 90 120, 120 70, 165 92 S 230 50, 272 38" stroke={C.green} strokeWidth="4" fill="none" strokeLinecap="round" />
          <Circle cx="48" cy="88" r="5" fill={C.green} />
          <Circle cx="272" cy="38" r="5" fill={C.green} />
        </Svg>
        <View style={{ position: 'absolute', left: '11%', top: 52, height: 34, width: 34, borderRadius: 17, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' }}>
          <House size={17} color="#FFFFFF" />
        </View>
        <View style={{ position: 'absolute', right: '11%', top: 4, height: 34, width: 34, borderRadius: 17, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' }}>
          <Store size={17} color="#FFFFFF" />
        </View>
      </View>
      <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10, marginTop: -6 }}>
        <MapPin size={13} color={C.green} />
        <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: C.green, marginLeft: 4 }}>
          {dist != null ? `Distance: ${dist < 10 ? dist.toFixed(1) : Math.round(dist)} km` : 'Distance unavailable'}
        </Text>
        {from ? <Text style={{ fontSize: rf(11.5), color: C.muted }}>{'  |  Open in Maps'}</Text> : null}
      </View>
      {address ? <Text numberOfLines={2} style={{ fontSize: rf(11.5), color: C.muted, paddingHorizontal: 12, paddingBottom: 10, textAlign: 'center' }}>{address}</Text> : null}
    </Pressable>
  );
}

export default function BuyPickupTrackingScreen({ navigation, route }) {
  const p = usePurchase(route);
  const o = p.o;
  const leadRef = route?.params?.leadRef;
  const [shop, setShop] = useState(null);

  useEffect(() => { getListingOrigin().then((g) => setShop(g?.lat != null ? { lat: g.lat, lng: g.lng } : null)).catch(() => {}); }, []);
  const { load } = p;
  useFocusEffect(useCallback(() => {
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]));

  const pk = o?.pickup || {};
  const status = up(o?.status);
  const raw = pickupSteps(o);
  const lastDone = raw.reduce((n, s, i) => (s.done ? i : n), -1);
  const steps = raw.map((s, i) => ({
    title: s.title,
    mode: s.done ? 'done' : i === lastDone + 1 ? 'current' : 'todo',
    sub: s.at ? whenLabel(s.at) : s.done ? 'Time not recorded' : i === lastDone + 1 ? s.wait : null,
  }));
  const customer = o?.address?.latitude != null ? { lat: Number(o.address.latitude), lng: Number(o.address.longitude) } : null;
  const acts = o?.allowedActions || [];

  const reassign = () => navigation.navigate('BuyAssignPickup', { id: o.id, leadRef });

  const footer = !o ? null : (
    <View style={{ gap: 10 }}>
      {o.pickupInspection ? <PrimaryButton title="Review Inspection" icon={ClipboardCheck} variant={status === 'PICKED_UP' ? 'outline' : 'primary'} onPress={() => navigation.navigate('BuyInspectionReview', { id: o.id, order: o, leadRef })} /> : null}
      {status === 'PICKED_UP' ? <PrimaryButton title="Verify Shop Handover" icon={PackageCheck} onPress={() => navigation.navigate('BuyHandover', { id: o.id, order: o, leadRef })} /> : null}
      {acts.includes('ASSIGN') ? <PrimaryButton title="Reassign Employee" icon={UserPlus} variant="outline" onPress={reassign} /> : null}
    </View>
  );

  return (
    <PurchasePage navigation={navigation} route={route} p={p} title="Pickup Tracking" statuses={STATUSES} footer={footer}>
      {o ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.field, borderRadius: 14, padding: 12, marginTop: 6 }}>
            <Initials name={pk.personName} size={48} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <Text numberOfLines={1} style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>{pk.personName || 'Not assigned'}</Text>
              <Text numberOfLines={1} style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{['Pickup Person', pk.personPhone].filter(Boolean).join(' · ')}</Text>
            </View>
            {pk.personPhone ? (
              <PrimaryButton title="Call" icon={Phone} variant="outline" small onPress={() => Linking.openURL(`tel:${pk.personPhone}`).catch(() => {})} />
            ) : null}
          </View>

          {pk.issue ? <ErrorBox message={pk.issue} style={{ marginTop: 12 }} /> : null}
          {status === 'PICKED_UP' ? (
            <View style={{ backgroundColor: C.amberBg, borderRadius: 12, padding: 12, marginTop: 12 }}>
              <Text style={{ fontSize: rf(12), color: C.text }}>The device is collected and on its way to your shop. Verify the handover when it arrives.</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 16 }}>
            {steps.map((s, i) => <TimelineStep key={s.title} {...s} last={i === steps.length - 1} />)}
          </View>

          <RouteCard from={customer} to={shop} address={o.address?.line} />
        </>
      ) : null}
    </PurchasePage>
  );
}
