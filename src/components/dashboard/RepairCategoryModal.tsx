import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  AudioWaveform,
  Headphones,
  Laptop,
  Settings,
  Smartphone,
  Tablet,
  Watch,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { getCategoryMenu, getDeviceCategories } from '../../api/masterData';
import { notify } from '../confirm';

// Plain style objects only: NativeWind's JSX interop silently drops a
// `style={({ pressed }) => …}` function (see components/ios/index.js), which
// left these cards with no size or clipping. TouchableOpacity gives the feedback.

/**
 * "Select your device category to repair" — opened by the Home Repair card.
 *
 * Cards come from GET /master/category-menu?categoryType=REPAIR (the admin's
 * Category Menu): image = imageUrl, title = menuName, subtitle = description.
 * Menu rows carry no device-category id/code, so each one is matched BY NAME
 * to /master/device-categories, which supplies the id/code/name the booking
 * flow's SelectBrand step needs.
 */

export interface PickedRepairCategory {
  id: string;
  code: string;
  name: string;
}

interface MenuRow {
  id: string;
  menuName?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number | null;
}

interface DeviceCategoryRow {
  id: string;
  code?: string | null;
  name?: string | null;
}

// Display order only; anything else the API returns follows these.
const ORDER = ['mobile', 'tablet', 'laptop', 'smartwatch', 'audio device'];

// Presentation-only subtitle when the API description is empty.
const FALLBACK_SUBTITLE: Record<string, string> = {
  mobile: 'Smartphones',
  tablet: 'iPad, Android Tablet',
  laptop: 'Windows, MacBook',
  smartwatch: 'Apple, Samsung, Others',
  'audio device': 'Earbuds, Headphones',
};

interface Theme {
  bg: [string, string, string];
  glow: string;
  tileBg: string;
  tileFg: string;
  arrow: string;
  badge: string;
  border: string;
  icon: LucideIcon;
  badgeIcon: LucideIcon;
}

const THEMES: Record<string, Theme> = {
  mobile: { bg: ['#F0FFF8', '#E4FAF0', '#D7F7E8'], glow: '#6EE7B7', tileBg: '#DDF7EA', tileFg: '#0B6B47', arrow: '#0B5E43', badge: '#10A36B', border: '#CDEFE0', icon: Smartphone, badgeIcon: Wrench },
  tablet: { bg: ['#F0FAFF', '#DDF3FF', '#CDEBFF'], glow: '#7DD3FC', tileBg: '#DCEFFF', tileFg: '#1D5FA8', arrow: '#1D4F9C', badge: '#1D8FE8', border: '#CFE6FA', icon: Tablet, badgeIcon: Wrench },
  laptop: { bg: ['#FFF9ED', '#FFF0CF', '#FFE7B0'], glow: '#FCD34D', tileBg: '#FFEBC7', tileFg: '#A35A06', arrow: '#C2610C', badge: '#F59E0B', border: '#F8E3B8', icon: Laptop, badgeIcon: Settings },
  smartwatch: { bg: ['#FFF2F9', '#FFE2F2', '#FFD8EC'], glow: '#F9A8D4', tileBg: '#FFDDEF', tileFg: '#B0246F', arrow: '#B8246F', badge: '#E0409A', border: '#F8D5E8', icon: Watch, badgeIcon: Wrench },
  'audio device': { bg: ['#FAF5FF', '#EEE2FF', '#E5D5FF'], glow: '#C4B5FD', tileBg: '#EADFFF', tileFg: '#6431C9', arrow: '#6A2FD8', badge: '#8B5CF6', border: '#E4D8FB', icon: Headphones, badgeIcon: AudioWaveform },
};
const DEFAULT_THEME: Theme = { bg: ['#F5FBF8', '#EAF6F0', '#DFF1E8'], glow: '#A7F3D0', tileBg: '#E1F3EA', tileFg: '#0B6B47', arrow: '#0B5E43', badge: '#10A36B', border: '#D6ECE1', icon: Wrench, badgeIcon: Wrench };

const norm = (v?: string | null) => String(v || '').trim().toLowerCase();
const orderIndex = (name?: string | null) => {
  const i = ORDER.indexOf(norm(name));
  return i === -1 ? ORDER.length : i;
};

function CategoryCard({
  row, width, height, compact, onPress,
}: { row: MenuRow; width: number; height: number; compact: boolean; onPress: () => void }) {
  const [broken, setBroken] = useState(false);
  const key = norm(row.menuName);
  const t = THEMES[key] || DEFAULT_THEME;
  const Icon = t.icon;
  const BadgeIcon = t.badgeIcon;
  const subtitle = (row.description && row.description.trim()) || FALLBACK_SUBTITLE[key] || '';
  const img = row.imageUrl && row.imageUrl.trim() ? row.imageUrl.trim() : null;
  const tile = compact ? 32 : 44;
  const arrow = compact ? 30 : 40;
  const panelH = compact ? 62 : 72;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.88}
      accessibilityRole="button"
      accessibilityLabel={`${row.menuName || 'Category'}${subtitle ? `, ${subtitle}` : ''}`}
      style={{
        width,
        height,
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: t.border,
      }}
    >
      <LinearGradient colors={t.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        {/* Soft decoration behind the database image. */}
        <View pointerEvents="none" style={{ position: 'absolute', width: width * 0.8, height: width * 0.8, borderRadius: width, backgroundColor: t.glow, opacity: 0.18, top: height * 0.06, left: width * 0.1 }} />
        <View pointerEvents="none" style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: t.glow, opacity: 0.6, left: width * 0.12, top: (height - panelH) * 0.72 }} />
        <View pointerEvents="none" style={{ position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: t.glow, opacity: 0.7, right: width * 0.16, top: (height - panelH) * 0.36 }} />
        <View pointerEvents="none" style={{ position: 'absolute', width: width * 0.66, height: 16, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.75)', left: width * 0.17, top: height - panelH - 26 }} />

        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 10, right: 10,
            width: compact ? 30 : 38, height: compact ? 30 : 38, borderRadius: 999,
            backgroundColor: t.badge, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <BadgeIcon size={compact ? 15 : 19} color="#FFFFFF" strokeWidth={2.2} />
        </View>

        {/* Device image area. */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: compact ? 16 : 20, paddingHorizontal: 10 }}>
          {img && !broken ? (
            <Image
              source={{ uri: img }}
              resizeMode="contain"
              onError={() => setBroken(true)}
              style={{ width: '86%', height: '88%' }}
              accessibilityLabel={row.menuName || ''}
            />
          ) : (
            <Icon size={compact ? 44 : 64} color="rgba(11,27,63,0.25)" strokeWidth={1.4} />
          )}
        </View>

        {/* Information panel. */}
        <View
          style={{
            height: panelH, margin: 7, marginTop: 0, borderRadius: 16,
            backgroundColor: 'rgba(255,255,255,0.86)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
            flexDirection: 'row', alignItems: 'center', paddingHorizontal: compact ? 7 : 10, gap: compact ? 6 : 9,
          }}
        >
          <View style={{ width: tile, height: tile, borderRadius: compact ? 10 : 13, backgroundColor: t.tileBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={compact ? 16 : 21} color={t.tileFg} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={{ fontSize: compact ? 13.5 : 16, fontWeight: '800', color: '#071A38', lineHeight: compact ? 16 : 19 }}>
              {row.menuName}
            </Text>
            {subtitle ? (
              <Text numberOfLines={2} style={{ fontSize: compact ? 10 : 11.5, color: '#64748B', marginTop: 1, lineHeight: compact ? 12.5 : 14 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={{ width: arrow, height: arrow, borderRadius: 999, backgroundColor: t.arrow, alignItems: 'center', justifyContent: 'center' }}>
            <ArrowRight size={compact ? 15 : 19} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function RepairCategoryModal({
  visible, onClose, onPick,
}: { visible: boolean; onClose: () => void; onPick: (c: PickedRepairCategory) => void }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const [menu, setMenu] = useState<MenuRow[] | null>(null);
  const [deviceCats, setDeviceCats] = useState<DeviceCategoryRow[]>([]);
  const [failed, setFailed] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  // Fetched on every open so an image the admin changed shows up straight away.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setFailed(false);
    Promise.all([getCategoryMenu('REPAIR'), getDeviceCategories().catch(() => [])])
      .then(([rows, cats]) => {
        if (!alive) return;
        setMenu(Array.isArray(rows) ? rows : []);
        setDeviceCats(Array.isArray(cats) ? cats : []);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setMenu((prev) => prev ?? []);
      });
    return () => { alive = false; };
  }, [visible]);

  useEffect(() => {
    if (!visible) { anim.setValue(0); return; }
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [visible, anim]);

  const items = useMemo(
    () =>
      (menu || [])
        .filter((m) => m && m.isActive === true)
        .map((m, i) => ({ m, i }))
        .sort((a, b) => orderIndex(a.m.menuName) - orderIndex(b.m.menuName) || (a.m.sortOrder ?? 0) - (b.m.sortOrder ?? 0) || a.i - b.i)
        .map(({ m }) => m),
    [menu],
  );

  const catByName = useMemo(() => {
    const map: Record<string, DeviceCategoryRow> = {};
    deviceCats.forEach((c) => { if (c?.name && c?.id) map[norm(c.name)] = c; });
    return map;
  }, [deviceCats]);

  // Layout: 5 across on wide tablets, 3 on tablets, 2 on phones.
  const sheetW = Math.min(winW - 24, 1350);
  const pad = winW >= 700 ? 22 : 14;
  const gap = winW >= 700 ? 14 : 10;
  const cols = sheetW >= 1100 ? 5 : sheetW >= 640 ? 3 : 2;
  const cardW = Math.floor((sheetW - pad * 2 - gap * (cols - 1)) / cols);
  const compact = cardW < 200;
  const cardH = compact ? Math.round(cardW * 1.28) : Math.min(340, Math.round(cardW * 1.3));

  const choose = (row: MenuRow) => {
    const cat = catByName[norm(row.menuName)];
    if (!cat?.id) {
      notify('Not available yet', `${row.menuName || 'This category'} can't be booked from the app yet.`);
      return;
    }
    onPick({ id: cat.id, code: String(cat.code || '').toUpperCase(), name: cat.name || row.menuName || '' });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(3,20,16,0.5)', alignItems: 'center', justifyContent: 'center', padding: 12 }}
        accessibilityLabel="Close"
      >
        {/* Swallows presses so tapping inside the sheet can't close it. */}
        <Animated.View
          style={{
            width: sheetW,
            maxHeight: winH - 24,
            borderRadius: 26,
            backgroundColor: '#FFFFFF',
            overflow: 'hidden',
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          }}
        >
          <Pressable onPress={() => {}} style={{ flexShrink: 1 }}>
            <ScrollView contentContainerStyle={{ padding: pad, paddingTop: pad + 6 }} showsVerticalScrollIndicator={false} bounces={false}>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={10}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  position: 'absolute', top: 12, right: 12, zIndex: 2,
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: '#F1F5F3',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} color="#334155" strokeWidth={2.4} />
              </TouchableOpacity>

              <Text style={{ textAlign: 'center', fontSize: winW >= 700 ? 26 : 20, fontWeight: '800', color: '#0B1B3F', paddingHorizontal: 34, lineHeight: winW >= 700 ? 32 : 26 }}>
                Select your device <Text style={{ color: '#047857' }}>category to repair</Text>
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: pad, gap: 10 }}>
                <View style={{ height: 1, width: winW >= 700 ? 56 : 24, backgroundColor: '#CBD5E1' }} />
                <Text style={{ fontSize: winW >= 700 ? 14 : 12, color: '#64748B', flexShrink: 1, textAlign: 'center' }}>
                  Choose the device type you need service for
                </Text>
                <View style={{ height: 1, width: winW >= 700 ? 56 : 24, backgroundColor: '#CBD5E1' }} />
              </View>

              {menu === null ? (
                <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                  <ActivityIndicator color="#047857" />
                </View>
              ) : items.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#64748B', fontSize: 13, paddingVertical: 32 }}>
                  {failed
                    ? 'We couldn’t load device categories right now. Please try again.'
                    : 'No device categories are available right now.'}
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                  {items.map((row) => (
                    <CategoryCard
                      key={row.id}
                      row={row}
                      width={cardW}
                      height={cardH}
                      compact={compact}
                      onPress={() => choose(row)}
                    />
                  ))}
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
