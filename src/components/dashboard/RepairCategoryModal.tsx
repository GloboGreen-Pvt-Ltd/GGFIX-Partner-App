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
import {
  Headphones,
  Laptop,
  Smartphone,
  Tablet,
  Watch,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { categoryMenuKey, getCategoryMenu, getDeviceCategories } from '../../api/masterData';
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

// Every lookup below is keyed by categoryMenuKey(): the admin names menu rows
// "Repair Mobile", "Repair  Audio Device"…, while device categories are
// "Mobile", "Audio Device", "Smartwatch" (code SMARTWATCHES) — the key drops
// the Repair/Buy/Sell prefix, spacing, punctuation and plural so they meet.
const keyOf = (v?: string | null) => categoryMenuKey(v);

// Display order only; anything else the API returns follows these.
const ORDER = ['mobile', 'tablet', 'laptop', 'smartwatch', 'audiodevice'];

// Presentation-only subtitle when the API description is empty.
const FALLBACK_SUBTITLE: Record<string, string> = {
  mobile: 'Smartphones',
  tablet: 'iPad, Android Tablet',
  laptop: 'Windows, MacBook',
  smartwatch: 'Apple, Samsung, Others',
  audiodevice: 'Earbuds, Headphones',
};

// GGFIX palette.
const GREEN = '#09AD2A';
const GREEN_DEEP = '#078F23';
const MINT = '#EAF8EC';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const LINE = '#E6E6E6';

// Fallback glyph per category, used only when the admin image is missing/broken.
const ICONS: Record<string, LucideIcon> = {
  mobile: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  smartwatch: Watch,
  audiodevice: Headphones,
};

// "Repair  Audio Device" → "Audio Device": the popup title already says repair.
const displayName = (v?: string | null) =>
  String(v || '').replace(/^\s*repair\s+/i, '').replace(/\s+/g, ' ').trim() || String(v || '').trim();

const orderIndex = (name?: string | null) => {
  const i = ORDER.indexOf(keyOf(name));
  return i === -1 ? ORDER.length : i;
};

function CategoryTile({ row, width, onPress }: { row: MenuRow; width: number; onPress: () => void }) {
  const [broken, setBroken] = useState(false);
  const key = keyOf(row.menuName);
  const Icon = ICONS[key] || Wrench;
  const name = displayName(row.menuName);
  const subtitle = (row.description && row.description.trim()) || FALLBACK_SUBTITLE[key] || '';
  const img = row.imageUrl && row.imageUrl.trim() ? row.imageUrl.trim() : null;
  // Icon well tracks the tile width so narrow phones get smaller circles.
  const well = Math.max(52, Math.min(72, Math.round(width * 0.66)));

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${row.menuName || 'Category'}${subtitle ? `, ${subtitle}` : ''}`}
      style={{
        width,
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 9,
        paddingHorizontal: 6,
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: LINE,
      }}
    >
      <View
        style={{
          width: well, height: well, borderRadius: well / 2,
          backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}
      >
        {img && !broken ? (
          <Image
            source={{ uri: img }}
            resizeMode="contain"
            onError={() => setBroken(true)}
            style={{ width: '84%', height: '84%' }}
            accessibilityLabel={row.menuName || ''}
          />
        ) : (
          <Icon size={Math.round(well * 0.42)} color={GREEN} strokeWidth={1.8} />
        )}
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{ marginTop: 7, fontSize: 12, fontWeight: '800', color: INK, textAlign: 'center', lineHeight: 15, alignSelf: 'stretch' }}
      >
        {name}
      </Text>
      {/* Two-line slot (fixed height) so long subtitles wrap instead of
          truncating and every tile in a row stays the same height. */}
      <Text
        numberOfLines={2}
        style={{ marginTop: 2, fontSize: 10, lineHeight: 13, minHeight: 26, color: MUTED, textAlign: 'center', alignSelf: 'stretch' }}
      >
        {subtitle}
      </Text>
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
    deviceCats.forEach((c) => {
      if (!c?.id) return;
      // Keyed by name and by code, so "Repair Smartwatch" finds the
      // "Smartwatch" / SMARTWATCHES category either way.
      if (c.code) map[keyOf(c.code)] = map[keyOf(c.code)] || c;
      if (c.name) map[keyOf(c.name)] = c;
    });
    return map;
  }, [deviceCats]);

  // Layout: as many ~96dp+ tiles as fit — 2 on very small phones, 3 on
  // phones, up to 5 on tablets. Rows are centred so a short last row isn't
  // left-hanging.
  const sheetW = Math.min(winW - 24, 640);
  const pad = winW >= 700 ? 18 : winW < 360 ? 12 : 14;
  const gap = winW < 360 ? 8 : 10;
  const inner = sheetW - pad * 2;
  const cols = Math.max(2, Math.min(5, Math.floor((inner + gap) / (96 + gap))));
  const cardW = Math.floor((inner - gap * (cols - 1)) / cols);
  // Break the title into two even lines on phones instead of leaving
  // "repair" alone on the second line.
  const splitTitle = sheetW < 480;

  const choose = (row: MenuRow) => {
    const cat = catByName[keyOf(row.menuName)];
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
        style={{ flex: 1, backgroundColor: 'rgba(30,30,30,0.5)', alignItems: 'center', justifyContent: 'center', padding: 12 }}
        accessibilityLabel="Close"
      >
        {/* Swallows presses so tapping inside the sheet can't close it. */}
        <Animated.View
          style={{
            width: sheetW,
            maxHeight: winH - 24,
            borderRadius: 22,
            backgroundColor: '#FFFFFF',
            overflow: 'hidden',
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          }}
        >
          <Pressable onPress={() => {}} style={{ flexShrink: 1 }}>
            <ScrollView contentContainerStyle={{ padding: pad, paddingTop: pad + 2 }} showsVerticalScrollIndicator={false} bounces={false}>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={10}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{
                  position: 'absolute', top: 10, right: 10, zIndex: 2,
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: '#F3F3F3',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={16} color={INK} strokeWidth={2.4} />
              </TouchableOpacity>

              <Text style={{ textAlign: 'center', fontSize: 17, fontWeight: '800', color: INK, paddingHorizontal: 34, lineHeight: 22 }}>
                {splitTitle ? 'Select your device\n' : 'Select your device '}
                <Text style={{ color: GREEN_DEEP }}>category to repair</Text>
              </Text>
              <Text style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginTop: 3, marginBottom: 14, paddingHorizontal: 20 }}>
                Choose the device type you need service for
              </Text>

              {menu === null ? (
                <View style={{ paddingVertical: 48, alignItems: 'center' }}>
                  <ActivityIndicator color={GREEN} />
                </View>
              ) : items.length === 0 ? (
                <Text style={{ textAlign: 'center', color: MUTED, fontSize: 13, paddingVertical: 32 }}>
                  {failed
                    ? 'We couldn’t load device categories right now. Please try again.'
                    : 'No device categories are available right now.'}
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap }}>
                  {items.map((row) => (
                    <CategoryTile key={row.id} row={row} width={cardW} onPress={() => choose(row)} />
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
