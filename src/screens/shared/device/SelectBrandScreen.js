import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Pencil, Plus, Search, ArrowLeft, X } from 'lucide-react-native';
import { EmptyState, Loader, ScreenHeader } from '../../../components/rnr';
import { ResponsiveModal } from '../../../components/responsive';
import DeviceImage from '../../../components/DeviceImage';
import { resolveDeviceImageSource } from '../../../utils/images';
import { PICKER_PAD, PICKER_GAP } from './pickerGrid';
import { getBrandsForCategory } from '../../../api/masterData';

// Canonical brand picker used by all flows (Booking / Sell / Owner-list /
// Profile). Gutter and gap come from the shared `pickerGrid` so the device
// pickers line up; the column count is this screen's own (see brandColumns).
// Brand data is fetched from the API (getBrandsForCategory) — nothing static.
const HORIZONTAL_PAD = PICKER_PAD;
const GRID_GAP = PICKER_GAP;
// Grey page, white tiles. Search mode keeps a white list surface.
const SCREEN_BG = '#F8F8F8';
const SEARCH_BG = '#FFFFFF';
// Written as a value, not the `primary` class. NativeWind compiles
// tailwind.config.js at BUILD time, so the class can lag behind the palette.
const ACCENT = '#09AD2A';
const ACCENT_TEXT = '#078F23';
const MINT = '#EAF8EC';

// Compact tile metrics: fixed inner padding and a short logo band, so a row
// stays ~70pt tall instead of growing with the card width.
const TILE_PAD = 8;
const TILE_RADIUS = 14;

// Columns follow the live width: 4 on small phones, 5 from 400pt, and more on
// tablets — monotonic, so the grid never drops a column as the screen widens.
function brandColumns(width) {
  if (width >= 1000) return 8;
  if (width >= 840) return 7;
  if (width >= 600) return 6;
  if (width >= 400) return 5;
  return 4;
}

// Fallback colours for a brand with no logo, picked by hashing its name.
// Five visually distinct GGFIX-palette pairs keep the initials tellable apart,
// which is the only job this list has.
const BRAND_PALETTES = [
  { bg: 'bg-[#EAF8EC]', text: 'text-[#078F23]' },
  { bg: 'bg-[#FFF8E1]', text: 'text-[#8A6A00]' },
  { bg: 'bg-[#FEECEC]', text: 'text-[#D63232]' },
  { bg: 'bg-[#F3F3F3]', text: 'text-[#1E1E1E]' },
  { bg: 'bg-[#09AD2A]', text: 'text-white' },
];
function paletteFor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BRAND_PALETTES[h % BRAND_PALETTES.length];
}

export default function SelectBrandScreen({ navigation, route }) {
  const flow = route?.params?.flow || 'PROFILE';
  const {
    categoryId, categoryCode, categoryName, deviceTypeId, deviceTypeName,
    editSellOrderId, editHints,
  } = route?.params || {};
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const bookingEditMode = !!route?.params?.editMode;
  const isEditing = !!editSellOrderId || bookingEditMode;
  const currentBrandId = editHints?.brandId
    || (bookingEditMode ? route?.params?.brandId : null)
    || null;
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  // Equal-width tiles from the live width (Math.floor: a sub-pixel residue is
  // enough to wrap the last tile onto a new row). The logo sits in a band the
  // full inner width of the tile and LOGO_H tall, `contain`-fitted, so square
  // marks and wide wordmarks both land at ~36pt without being cropped.
  const numColumns = brandColumns(screenWidth);
  const cardWidth = Math.floor(
    (screenWidth - PICKER_PAD * 2 - PICKER_GAP * (numColumns - 1)) / numColumns,
  );
  const logoW = Math.max(28, cardWidth - TILE_PAD * 2);
  const logoH = screenWidth >= 600 ? 40 : 36;
  // Square logo box the tiles below are drawn with.
  const logoBox = Math.min(logoW, logoH);

  useEffect(() => {
    (async () => {
      try { setBrands(await getBrandsForCategory(categoryId)); } catch (_) {}
      setLoading(false);
    })();
  }, [categoryId]);

  const gridBrands = useMemo(() => {
    if (isEditing && currentBrandId) {
      const current = brands.find((b) => b.id === currentBrandId);
      const rest = brands.filter((b) => b.id !== currentBrandId);
      return current ? [current, ...rest] : brands;
    }
    return brands;
  }, [brands, isEditing, currentBrandId]);

  const searchResults = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];  // empty query → show the search prompt, not the full list
    return brands.filter((b) => {
      const name = (b.name || '').toLowerCase();
      // Partial brand typing ("goo" → Google), and also a full model name that
      // starts with the brand ("google pixel 10" → Google) so users who type the
      // whole device name still land on the right brand.
      return name.includes(needle) || needle.startsWith(name + ' ') || needle === name;
    });
  }, [brands, q]);

  const onPick = (b) => navigation.navigate('SelectModel', {
    ...(route?.params || {}),
    flow, categoryId, categoryCode, categoryName, deviceTypeId, deviceTypeName,
    brandId: b.id, brandName: b.name,
    editSellOrderId, editHints,
  });

  /**
   * "Other" — a walk-in device whose brand isn't in the catalogue.
   *
   * BOOKING only. Sell and marketplace listing price against a catalogue model,
   * and a typed brand has no price data behind it, so offering it there would
   * lead to a quote that cannot be honoured.
   *
   * Carries brandId: null with the typed brandName. Nothing is written to master
   * data — the name rides along on this job and the picker stays clean.
   */
  const allowOther = flow === 'BOOKING';
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');

  const onPickOther = () => {
    const name = otherName.trim();
    if (!name) return;
    setOtherOpen(false);
    setOtherName('');
    navigation.navigate('SelectModel', {
      ...(route?.params || {}),
      flow, categoryId, categoryCode, categoryName, deviceTypeId, deviceTypeName,
      brandId: null, brandName: name, customBrand: true,
      editSellOrderId, editHints,
    });
  };

  // ── Full-screen search mode ───────────────────────────────────────────────
  if (searchOpen) {
    return (
      <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
        <View
          className="flex-row items-center px-2 pb-2 bg-card border-b border-border"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            onPress={() => { setSearchOpen(false); setQ(''); }}
            className="h-10 w-10 items-center justify-center"
            hitSlop={8}
          >
            <ArrowLeft size={22} color="#1E1E1E" />
          </Pressable>
          <View className="flex-1 flex-row items-center rounded-xl px-3" style={{ backgroundColor: '#F3F3F3' }}>
            <Search size={18} color="#8E8E8E" />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Search brand"
              placeholderTextColor="#8E8E8E"
              className="flex-1 py-2.5 ml-2 text-text text-[13px]"
              returnKeyType="search"
            />
            {q ? (
              <Pressable onPress={() => setQ('')} hitSlop={8}>
                <X size={18} color="#6B6B6B" />
              </Pressable>
            ) : null}
          </View>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {searchResults.length === 0 ? (
            <EmptyState
              icon={<Search size={28} color="#09AD2A" />}
              title={q ? 'No brands found' : 'Search brands'}
              description={q ? `Nothing matches "${q.trim()}".` : 'Type a brand name (e.g. Google, Vivo, Samsung).'}
            />
          ) : (
            searchResults.map((b) => {
              const hasImg = !!(b.imageUrl || b.imageBase64);
              const palette = paletteFor(b.name);
              return (
                <Pressable
                  key={b.id}
                  onPress={() => onPick(b)}
                  className="flex-row items-center px-4 py-2.5 border-b border-border active:bg-primary/5"
                >
                  <View className="h-10 w-10 rounded-lg overflow-hidden bg-white border border-border items-center justify-center mr-3">
                    {hasImg ? (
                      <DeviceImage url={b.imageUrl} base64={b.imageBase64} style={{ width: 32, height: 32 }} />
                    ) : (
                      <View className={`h-10 w-10 items-center justify-center ${palette.bg}`}>
                        <Text className={`text-[13px] font-extrabold ${palette.text}`}>{(b.name || '?').slice(0, 1).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text className="flex-1 text-[13px] text-text" numberOfLines={1}>{b.name}</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Normal mode ───────────────────────────────────────────────────────────
  return (
    <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
      <ScreenHeader
        title="Select Brand"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        sticky={false}
        right={(
          <Pressable onPress={() => setSearchOpen(true)} className="h-10 w-10 items-center justify-center" hitSlop={8}>
            <Search size={22} color="#1E1E1E" />
          </Pressable>
        )}
      />
      {isEditing && editHints?.modelName ? (
        <View className="px-4 pt-3 pb-3 bg-card border-b border-border">
          <View className="bg-warning/10 border border-warning/30 rounded-xl px-3 py-2 flex-row items-center">
            <Pencil size={13} color="#F59E0B" />
            <View className="flex-1 ml-2">
              <Text className="text-[10px] font-extrabold text-warning tracking-wider">
                {flow === 'BOOKING' ? 'EDITING BOOKING' : 'EDITING ORDER'}
              </Text>
              <Text className="text-[12px] text-text font-semibold" numberOfLines={1}>
                Currently: {editHints.brandName ? `${editHints.brandName} · ` : ''}{editHints.modelName}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {loading ? (
        <Loader label="Loading brands..." />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, paddingTop: 10, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {gridBrands.length === 0 ? (
            <EmptyState title="No brands found" description="No brands mapped to this category yet." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
              {gridBrands.map((b) => {
                const palette = paletteFor(b.name);
                const initial = (b.name || '?').slice(0, 1).toUpperCase();
                const logo = resolveDeviceImageSource({ url: b.imageUrl, base64: b.imageBase64 });
                const isCurrent = isEditing && b.id === currentBrandId;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => onPick(b)}
                    className="rounded-2xl active:opacity-80"
                    style={{
                      width: cardWidth,
                      padding: 9,
                      alignItems: 'center',
                      backgroundColor: isCurrent ? '#EAF7F1' : '#FFFFFF',
                      borderWidth: isCurrent ? 1.5 : 1,
                      borderColor: isCurrent ? ACCENT : '#E6E6E6',
                      shadowColor: '#1E1E1E',
                      shadowOpacity: isCurrent ? 0 : 0.04,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: isCurrent ? 0 : 1,
                    }}
                  >
                    <View
                      className="rounded-lg items-center justify-center overflow-hidden"
                      style={{ height: logoBox, width: logoBox, marginBottom: 6 }}
                    >
                      {logo ? (
                        <DeviceImage
                          url={b.imageUrl}
                          base64={b.imageBase64}
                          style={{ width: logoBox, height: logoBox }}
                        />
                      ) : (
                        <View className={`items-center justify-center ${palette.bg}`} style={{ height: logoBox, width: logoBox }}>
                          <Text className={`text-[20px] font-extrabold ${palette.text}`}>{initial}</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      className="text-[12px] font-medium text-text"
                      numberOfLines={1}
                      style={{ textAlign: 'center', width: '100%' }}
                    >
                      {b.name}
                    </Text>
                    {/* Check badge, top-right corner — replaces the previous
                        inline "Current" pill below the name. */}
                    {isCurrent ? (
                      <View
                        className="items-center justify-center"
                        style={{ position: 'absolute', top: 6, right: 6, height: 18, width: 18, borderRadius: 9, backgroundColor: ACCENT }}
                      >
                        <Check size={11} color="#fff" strokeWidth={3} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

              {allowOther ? (
                <Pressable
                  onPress={() => setOtherOpen(true)}
                  className="rounded-2xl active:opacity-80"
                  style={{
                    width: cardWidth,
                    padding: 6,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: ACCENT,
                  }}
                >
                  <View
                    className="rounded-lg items-center justify-center"
                    style={{ height: logoBox, width: logoBox, marginBottom: 4, backgroundColor: 'rgba(0,76,64,0.10)' }}
                  >
                    <Plus size={Math.round(logoBox * 0.4)} color={ACCENT} />
                  </View>
                  <Text
                    className="text-[12px] font-medium"
                    numberOfLines={1}
                    style={{ textAlign: 'center', width: '100%', color: ACCENT }}
                  >
                    Other
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}

      {/* Type-in sheet for a brand the catalogue doesn't carry — same
          bottom-sheet-on-phone/dialog-on-tablet pattern used elsewhere in
          this flow (e.g. Customer Details' category picker), which also
          gets keyboard-avoidance for free (the previous raw centered overlay
          had none, so the input could sit behind the keyboard on a real
          device). */}
      <ResponsiveModal visible={otherOpen} onClose={() => { setOtherOpen(false); setOtherName(''); }} maxWidth={420}>
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#E6E6E6', marginBottom: 14 }} />
        <Text className="text-[13px] font-extrabold text-text">Other brand</Text>
        <Text className="text-[12px] text-text-muted mt-1 leading-4">
          Type the brand as it appears on the device. It is saved on this booking only —
          it is not added to the catalogue.
        </Text>
        <TextInput
          autoFocus
          value={otherName}
          onChangeText={setOtherName}
          placeholder="e.g. Lava"
          placeholderTextColor="#8E8E8E"
          className="mt-3 rounded-xl px-3 py-2.5 text-text text-[13px]"
          style={{ backgroundColor: '#F3F3F3' }}
          returnKeyType="done"
          onSubmitEditing={onPickOther}
        />
        <View className="flex-row justify-end mt-4">
          <Pressable
            onPress={() => { setOtherOpen(false); setOtherName(''); }}
            className="px-4 py-2 active:opacity-70"
          >
            <Text className="text-[13px] font-bold text-text-muted">Cancel</Text>
          </Pressable>
          <Pressable
            onPress={onPickOther}
            disabled={!otherName.trim()}
            className="px-4 py-2 rounded-xl active:opacity-80"
            style={{ backgroundColor: ACCENT, opacity: otherName.trim() ? 1 : 0.5 }}
          >
            <Text className="text-[13px] font-extrabold text-white">Continue</Text>
          </Pressable>
        </View>
      </ResponsiveModal>
    </View>
  );
}
