import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronLeft, ChevronRight, Inbox, Search } from 'lucide-react-native';

/**
 * Shared pieces of the Job Report layout (OwnerJobReportScreen): white header,
 * left status rail with counts, month bar, Jobs-style tiles and empty states.
 * Report screens (leave, permission, pickup, attendance) build on these so
 * they all look the same.
 */

// Brand sheet.
export const RC = {
  teal: '#035C6C',
  navy: '#1C3053',
  blue: '#0788C9',
  green: '#609138',
  orange: '#FAA700',
  red: '#F32C26',
  ink: '#111111',
  bg: '#F3F4F6',
  tint: '#E5F3F5',
  white: '#FFFFFF',
  muted: '#6B7280',
  line: '#E5E7EB',
  gray: '#6B7280',
};

// Left-rail text / disc / icon / count sizes by window width, shared by Jobs,
// Job Report and every report screen so the menus scale the same way.
export function railSizes(winW) {
  if (winW < 360) return { font: 9.5, line: 12, disc: 30, icon: 14, badge: 9 };
  if (winW < 400) return { font: 10.5, line: 13, disc: 34, icon: 16, badge: 9 };
  if (winW < 600) return { font: 11, line: 14, disc: 34, icon: 16, badge: 9.5 };
  if (winW < 900) return { font: 12, line: 15, disc: 38, icon: 17, badge: 10 };
  return { font: 13, line: 16, disc: 40, icon: 18, badge: 10.5 };
}

// Rail / list geometry — same numbers as Jobs and Job Report.
export function useReportGeometry() {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isSmall = winW < 360;
  const railW = winW >= 680 ? 104 : (isSmall ? 70 : 78);
  const numCols = winW - railW >= 680 ? 2 : 1;
  const capW = numCols === 1 ? { width: '100%', maxWidth: 720, alignSelf: 'center' } : null;
  return { insets, isSmall, railW, numCols, capW, bottomPad: insets.bottom + 16 };
}

// White header: back · centred title + subtitle · optional Search toggle / extra buttons.
export function ReportHeader({ title, subtitle, onBack, searchOpen, onToggleSearch, right = null }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <View style={s.headerRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={6} accessibilityRole="button" accessibilityLabel="Back" activeOpacity={0.7} style={s.headerBack}>
            <ArrowLeft size={19} color={RC.ink} />
          </TouchableOpacity>
        ) : null}
        <View pointerEvents="none" style={s.headerTitleWrap}>
          <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.headerSub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={{ flex: 1 }} />
        {onToggleSearch ? (
          <TouchableOpacity
            onPress={onToggleSearch}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? 'Close search' : 'Search'}
            activeOpacity={0.8}
            style={[s.headerBtn, { backgroundColor: searchOpen ? RC.teal : RC.tint }]}
          >
            <Search size={16} color={searchOpen ? RC.white : RC.teal} />
          </TouchableOpacity>
        ) : null}
        {right}
      </View>
    </View>
  );
}

// Round header button for extra actions (same look as the Search toggle).
export function ReportHeaderButton({ Icon, onPress, label, active = false, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.8}
      style={[s.headerBtn, { backgroundColor: active ? RC.teal : RC.tint, marginLeft: 8 }, style]}
    >
      <Icon size={16} color={active ? RC.white : RC.teal} strokeWidth={2.2} />
    </TouchableOpacity>
  );
}

/**
 * Left status rail. items: [{ key, label, tone, Icon, count }].
 */
export function StatusRail({ items, active, onSelect, width, isSmall, bottomPad = 16 }) {
  const { width: winW } = useWindowDimensions();
  const rz = railSizes(winW);
  return (
    <ScrollView
      style={{ width, flexGrow: 0, borderRightWidth: 1, borderRightColor: RC.line, backgroundColor: RC.white }}
      contentContainerStyle={{ paddingVertical: 6, paddingHorizontal: 5, paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      {items.map((it) => {
        const Icon = it.Icon;
        const on = active === it.key;
        const tone = it.tone || RC.teal;
        const disc = rz.disc;
        const n = Number(it.count) || 0;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onSelect(it.key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${it.label}, ${n}`}
            style={{
              marginVertical: 4, borderRadius: 14, backgroundColor: RC.white,
              shadowColor: tone, shadowOpacity: on ? 0.12 : 0.06, shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 }, elevation: on ? 2 : 1,
            }}
          >
            <LinearGradient
              colors={['#FFFFFF', `${tone}${on ? '24' : '10'}`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                alignItems: 'center', paddingVertical: 9, paddingHorizontal: 3, borderRadius: 14,
                borderWidth: on ? 1.5 : 1, borderColor: on ? tone : `${tone}22`,
              }}
            >
              <View>
                <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={rz.icon} color="#FFFFFF" strokeWidth={2.2} />
                </View>
                {it.count != null ? (
                  <View style={[s.railCount, { borderColor: tone }]}>
                    <Text style={{ fontSize: rz.badge, fontWeight: '800', color: tone }} numberOfLines={1}>{n > 99 ? '99+' : n}</Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={{ marginTop: 5, fontSize: rz.font, lineHeight: rz.line, fontWeight: on ? '800' : '700', color: tone, textAlign: 'center' }}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {it.label}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// Month / period bar with round teal arrows.
export function MonthBar({ label, sub, onPrev, onNext, prevDisabled = false, nextDisabled = false, capW }) {
  return (
    <View style={s.monthWrap}>
      <View style={[s.monthBar, capW]}>
        <TouchableOpacity onPress={onPrev} disabled={prevDisabled} hitSlop={8} accessibilityLabel="Previous" activeOpacity={0.8} style={[s.monthBtn, prevDisabled && s.monthBtnOff]}>
          <ChevronLeft size={16} color={RC.white} strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text style={s.monthText} numberOfLines={1}>{label}</Text>
          {sub ? <Text style={s.monthSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
        <TouchableOpacity onPress={onNext} disabled={nextDisabled} hitSlop={8} accessibilityLabel="Next" activeOpacity={0.8} style={[s.monthBtn, nextDisabled && s.monthBtnOff]}>
          <ChevronRight size={16} color={RC.white} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Jobs-style tile shell: left panel (image/avatar node, coloured status tag,
 * optional VIEW chip), right text column (children). `row` = phone layout.
 */
export function ReportTile({ row = true, panel, tag, tagColor = RC.teal, showView = true, onPress, accessibilityLabel, children }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[s.tileCard, row && { flexDirection: 'row' }]}
    >
      <View style={[s.tilePanel, row ? s.tilePanelRow : s.tilePanelCol]}>
        {panel}
        {tag ? (
          <View style={[s.statusTag, { backgroundColor: tagColor }]}>
            <Text style={s.statusTagText} numberOfLines={1}>{tag}</Text>
          </View>
        ) : null}
        {showView && onPress ? (
          <View pointerEvents="none" style={[s.viewBtn, row ? s.viewBtnRow : s.viewBtnCol]}>
            <Text style={[s.viewBtnText, { fontSize: row ? 11 : 12 }]}>VIEW</Text>
          </View>
        ) : null}
      </View>
      <View style={row ? s.tileTextRow : s.tileTextCol}>{children}</View>
    </Wrap>
  );
}

// Solid brand disc with a white icon or initials — the tile's left panel content.
export function TileDisc({ Icon, text, tone = RC.teal, row = true }) {
  const d = row ? 52 : 64;
  return (
    <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
      {Icon ? <Icon size={Math.round(d * 0.46)} color={RC.white} strokeWidth={2.1} /> : (
        <Text style={{ color: RC.white, fontSize: Math.round(d * 0.34), fontWeight: '800' }}>{text}</Text>
      )}
    </View>
  );
}

// Text rows used inside ReportTile, matching the Job Report tile.
export const tileText = StyleSheet.create({
  ref: { marginTop: 8, fontSize: 11, fontWeight: '800', color: RC.teal },
  title: { marginTop: 4, fontSize: 12.5, fontWeight: '800', lineHeight: 16, color: RC.ink },
  sub: { marginTop: 2, fontSize: 12, color: RC.muted },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  info: { flex: 1, minWidth: 0, fontSize: 11, color: RC.muted },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  date: { fontSize: 11, color: RC.muted },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: RC.tint, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  chipText: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: RC.teal },
});

// Empty list row and loading / error card.
export function ReportEmpty({ text, Icon = Inbox, tone = RC.teal }) {
  return (
    <View style={s.emptyRow}>
      <View style={[s.stateIcon, { backgroundColor: tone }]}>
        <Icon size={20} color={RC.white} />
      </View>
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

export const reportStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: RC.white },
  body: { flex: 1, flexDirection: 'row' },
  listPad: { paddingHorizontal: 10, paddingTop: 10 },
});

const s = StyleSheet.create({
  header: { backgroundColor: RC.white, borderBottomWidth: 1, borderBottomColor: RC.line, paddingBottom: 12, paddingHorizontal: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: RC.bg, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  // Title centred on the SCREEN; padded so it never runs under the buttons.
  headerTitleWrap: { position: 'absolute', left: 0, right: 0, top: -4, bottom: -4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 96 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: RC.ink, textAlign: 'center' },
  headerSub: { fontSize: 11, fontWeight: '700', color: RC.muted, marginTop: 1, textAlign: 'center' },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  railCount: {
    position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8,
    backgroundColor: RC.white, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },

  monthWrap: { paddingHorizontal: 10, paddingTop: 10 },
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: RC.white, borderRadius: 14, borderWidth: 1, borderColor: RC.line, paddingVertical: 6, paddingHorizontal: 6 },
  monthBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: RC.teal, alignItems: 'center', justifyContent: 'center' },
  monthBtnOff: { opacity: 0.35 },
  monthText: { fontSize: 13.5, fontWeight: '800', color: RC.navy },
  monthSub: { fontSize: 11, color: RC.muted, marginTop: 1 },

  tileCard: { flex: 1, marginBottom: 12, borderRadius: 16, backgroundColor: RC.white, overflow: 'hidden', borderWidth: 1, borderColor: RC.line },
  tilePanel: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: RC.white },
  tilePanelRow: { width: 104, minHeight: 104, alignSelf: 'stretch', borderRightWidth: 1, borderRightColor: RC.line },
  tilePanelCol: { aspectRatio: 1.4 },
  tileTextRow: { flex: 1, minWidth: 0, paddingHorizontal: 10, paddingBottom: 8 },
  tileTextCol: { paddingHorizontal: 8, paddingBottom: 8 },
  statusTag: { position: 'absolute', top: 0, left: 0, maxWidth: '86%', paddingHorizontal: 8, paddingVertical: 4, borderBottomRightRadius: 12 },
  statusTagText: { color: RC.white, fontSize: 9.5, fontWeight: '800' },
  viewBtn: { position: 'absolute', backgroundColor: RC.white, borderWidth: 1.5, borderColor: RC.teal, borderRadius: 10 },
  viewBtnRow: { right: 6, bottom: 6, paddingHorizontal: 10, paddingVertical: 3 },
  viewBtnCol: { right: 8, bottom: 8, paddingHorizontal: 14, paddingVertical: 5 },
  viewBtnText: { color: RC.teal, fontWeight: '800' },

  emptyRow: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 12, color: RC.muted, textAlign: 'center' },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
