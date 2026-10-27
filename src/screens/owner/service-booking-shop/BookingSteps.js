import React from 'react';
import { Text, View } from 'react-native';
import { Check } from 'lucide-react-native';

const ACCENT = '#035C6C';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

// Booking steps: Customer -> Devices & Repair -> Review & Confirm.
const BOOKING_STEPS = ['Customer', 'Devices', 'Confirm'];

/**
 * Compact 3-step progress row shared by the booking screens; `active` is the
 * current step's index (done steps show a tick).
 */
export function StepProgress({ active = 0 }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8 }}>
      {BOOKING_STEPS.map((label, i) => {
        const on = i === active;
        const done = i < active;
        return (
          <React.Fragment key={label}>
            {i > 0 ? <View style={{ flex: 1, height: 2, borderRadius: 1, marginHorizontal: 6, backgroundColor: done || on ? ACCENT : BORDER }} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: on || done ? ACCENT : '#FFFFFF', borderWidth: 1.5, borderColor: on || done ? ACCENT : BORDER,
                }}
              >
                {done ? <Check size={11} color="#FFFFFF" strokeWidth={3} /> : (
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: on ? '#FFFFFF' : MUTED }}>{i + 1}</Text>
                )}
              </View>
              <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: on ? '800' : '600', color: on || done ? ACCENT : MUTED }}>{label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}
