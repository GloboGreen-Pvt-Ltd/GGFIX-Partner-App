import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import SafeModal, { ModalInsets } from '../../../components/SafeModal';
import { rf } from '../../../utils/responsive';
import { C, ErrorBox, PrimaryButton } from '../sell/kit';
import { clock, shortDay, ymd } from './buyKit';

// Bottom sheet: pick the pickup (or shop-visit) day and hour for a purchase
// order. Next 7 days, hourly slots 9 AM – 8 PM; past slots today are off.
// onSubmit({ pickupDate, slotStart, slotEnd }) may throw; its message shows here.

const HOURS = Array.from({ length: 12 }, (_, i) => 9 + i);
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

export default function ScheduleSheet({ visible, title, initialDate, initialStart, onClose, onSubmit }) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  }), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const [date, setDate] = useState(null);
  const [hour, setHour] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setDate(days.some((d) => ymd(d) === initialDate) ? initialDate : ymd(days[0]));
    const h = initialStart ? Number(String(initialStart).split(':')[0]) : null;
    setHour(HOURS.includes(h) ? h : null);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const isToday = date === ymd(days[0]);
  const nowHour = new Date().getHours();
  const past = (h) => isToday && h <= nowHour;
  useEffect(() => { if (hour != null && past(hour)) setHour(null); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (hour == null) { setError({ message: 'Pick a time' }); return; }
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ pickupDate: date, slotStart: hh(hour), slotEnd: hh(hour + 1) });
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const chip = (on, off) => ({
    borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    borderColor: on ? C.teal : C.border, backgroundColor: on ? C.teal : off ? C.field : '#FFFFFF', opacity: off ? 0.5 : 1,
  });

  return (
    <SafeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <ModalInsets>
        {({ bottom }) => (
          <View style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.4)', justifyContent: 'flex-end' }}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
            <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: bottom + 16 }}>
              <Text style={{ fontSize: rf(15), fontWeight: '800', color: C.text }}>{title}</Text>
              <Text style={{ fontSize: rf(12), color: C.muted, marginTop: 2 }}>The customer is notified of the time.</Text>

              <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text, marginTop: 14, marginBottom: 8 }}>Date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {days.map((d, i) => {
                  const v = ymd(d);
                  const on = v === date;
                  const s = shortDay(d);
                  return (
                    <Pressable key={v} onPress={() => setDate(v)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[chip(on), { width: 64, height: 58 }]}>
                      <Text style={{ fontSize: rf(11), fontWeight: '700', color: on ? '#FFFFFF' : C.muted }}>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : s.day}</Text>
                      <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: on ? '#FFFFFF' : C.text, marginTop: 2 }}>{s.date}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text, marginTop: 14, marginBottom: 8 }}>Time</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {HOURS.map((h) => {
                  const on = h === hour;
                  const off = past(h);
                  return (
                    <Pressable key={h} disabled={off} onPress={() => { setHour(h); setError(null); }} accessibilityRole="button" accessibilityState={{ selected: on, disabled: off }} style={[chip(on, off), { width: '23%', flexGrow: 1, height: 38 }]}>
                      <Text style={{ fontSize: rf(12), fontWeight: '800', color: on ? '#FFFFFF' : C.text }}>{clock(hh(h))}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {error ? <ErrorBox tone={error.code === 'SERVER_UPDATE_REQUIRED' ? 'warning' : 'error'} message={error.message || 'Could not save the time.'} style={{ marginTop: 12 }} /> : null}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <PrimaryButton title="Cancel" variant="outline" style={{ flex: 1 }} onPress={onClose} />
                <PrimaryButton title="Save" style={{ flex: 1.4 }} loading={busy} onPress={save} />
              </View>
            </View>
          </View>
        )}
      </ModalInsets>
    </SafeModal>
  );
}
