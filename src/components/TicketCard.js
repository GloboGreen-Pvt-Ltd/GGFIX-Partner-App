// Same card as the Employee app's Task / Job Report (GGFIX-Staff-App/src/components/TicketCard.js).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { rf, rs } from '../utils/responsive';

// List card used by Task Report / Assign Report (pickup-list style):
//   [badge]  #REF chip / title / subtitle          [STATUS] / date / time
//   ─────────────────────────────────────────────────────────────
//   rows of { icon, label, value } pairs — left aligned | right aligned
//   optional footer (e.g. Review button)
export default function TicketCard({
  badge, refId, title, subtitle, subtitle2, status, statusColor = '#035C6C', date, time, rows = [], footer, onPress, onLongPress,
}) {
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} delayLongPress={400} activeOpacity={0.9} style={S.card}>
      <View style={S.top}>
        {badge}
        <View style={{ flex: 1, minWidth: 0, marginLeft: rs(10) }}>
          {refId ? (
            <View style={S.refChip}><Text style={S.refText} numberOfLines={1}>{refId}</Text></View>
          ) : null}
          <Text style={S.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={S.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          {subtitle2 ? <Text style={S.subtitle} numberOfLines={1}>{subtitle2}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: rs(8), maxWidth: '42%' }}>
          {status ? (
            <View style={[S.status, { backgroundColor: `${statusColor}1A`, borderColor: `${statusColor}55` }]}>
              <Text style={[S.statusText, { color: statusColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{String(status).toUpperCase()}</Text>
            </View>
          ) : null}
          {date ? (
            <View style={S.dateRow}>
              <Calendar size={rs(12)} color="#6B7280" strokeWidth={2} />
              <Text style={S.date} numberOfLines={1}>{date}</Text>
            </View>
          ) : null}
          {time ? <Text style={S.time} numberOfLines={1}>{time}</Text> : null}
        </View>
      </View>

      {rows.length ? <View style={S.divider} /> : null}
      {rows.map((pair, i) => (
        <View key={i} style={[S.row, i > 0 && { marginTop: rs(4) }]}>
          {/* A field with no partner spans the full width (and may wrap to 2 lines). */}
          <Field {...(pair[0] || {})} wide={!pair[1]} />
          {pair[1] ? <Field {...pair[1]} right /> : null}
        </View>
      ))}
      {footer ? <View style={{ marginTop: rs(6) }}>{footer}</View> : null}
    </TouchableOpacity>
  );
}

// One compact line per field: icon + value (the icon stands in for the label).
function Field({ icon: Icon, label, value, right, muted, onPress, wide }) {
  if (!label) return <View style={{ flex: 1 }} />;
  const body = (
    <View style={[S.fieldHead, right && { justifyContent: 'flex-end' }]} accessibilityLabel={`${label}: ${value || '—'}`}>
      {Icon ? <View style={S.fieldIcon}><Icon size={rs(13)} color="#6B7280" strokeWidth={2} /></View> : null}
      <Text style={[S.fieldValue, { flexShrink: 1 }, muted && { color: '#9CA3AF' }, onPress && { color: '#035C6C' }]} numberOfLines={wide ? 2 : 1}>{value || '—'}</Text>
    </View>
  );
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      {onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7} hitSlop={6}>{body}</TouchableOpacity> : body}
    </View>
  );
}

const S = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: rs(8), paddingHorizontal: rs(10), marginBottom: rs(6),
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  refChip: { alignSelf: 'flex-start', backgroundColor: '#E5F3F5', borderRadius: rs(6), paddingHorizontal: rs(6), paddingVertical: rs(2), marginBottom: rs(2) },
  refText: { fontSize: rf(10), fontWeight: '800', color: '#035C6C' },
  title: { fontSize: rf(13.5), fontWeight: '800', color: '#111111' },
  subtitle: { fontSize: rf(12), color: '#6B7280', marginTop: 1 },
  status: { borderWidth: 1, borderRadius: 999, paddingHorizontal: rs(8), paddingVertical: rs(3) },
  statusText: { fontSize: rf(10), fontWeight: '800', letterSpacing: 0.3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: rs(4), marginTop: rs(4) },
  date: { fontSize: rf(11), fontWeight: '600', color: '#374151', flexShrink: 1 },
  time: { fontSize: rf(10.5), color: '#6B7280', marginTop: 1 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: rs(6) },
  row: { flexDirection: 'row', gap: rs(10) },
  // Fixed icon box = one text line tall, so icon and text line up on every row
  // (also when the text wraps to a second line).
  fieldHead: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(10) },
  // Icon centred under the device badge (32 wide), text starts in line with the title.
  fieldIcon: { width: rs(32), height: rf(17), alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: rf(10.5), color: '#6B7280' },
  fieldValue: { fontSize: rf(12), lineHeight: rf(17), fontWeight: '700', color: '#111111' },
});
