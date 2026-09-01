import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import {
  Smartphone, Laptop, Watch, Tablet, Headphones, Volume2,
} from 'lucide-react-native';
import { EmptyState, Loader, ScreenHeader, SearchBar } from '../../../components/rnr';
import { getDeviceCategories } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';

// FIVE columns, by request — the catalogue currently has five categories
// (Mobile, Laptop, Tablet, Audio Device, Smartwatch), so they land on one row.
//
// This DIVERGES from the rest of the device-selection family: SelectBrand,
// SelectSeries, SelectModel and SelectVariant still use 3-on-phone / 4-on-tablet.
// The comment that used to be here claimed all five pickers line up; that is no
// longer true of this one.
//
// Five columns is tight on a phone, so two things give way to make room:
//   · the gutter drops 12 -> 8, worth ~3pt per card;
//   · the sub-caption ("Headphones, Earbuds & Speakers") is HIDDEN below
//     `SUB_MIN_CARD`, because at a ~60pt card it renders as one ellipsised
//     word and reads as a rendering fault rather than information.
// The name itself gets two lines plus shrink-to-fit — at 320-390pt even
// "Smartwatch" at 10px needs ~57pt against 39-53pt of room.
const HORIZONTAL_PAD = 16;
const GRID_GAP = 8;
const GRID_COLUMNS = 5;
// Below this card width the sub-caption cannot render a whole word.
const SUB_MIN_CARD = 100;
function gridMetrics(screenWidth) {
  const numColumns = GRID_COLUMNS;
  // Math.floor — see SelectBrandScreen for explanation; without it RN can
  // round subpixel widths up and wrap the last card to a new row.
  const cardWidth = Math.floor((screenWidth - HORIZONTAL_PAD * 2 - GRID_GAP * (numColumns - 1)) / numColumns);
  return { numColumns, cardWidth };
}

const CODE_META = {
  MOBILE:        { icon: Smartphone, color: '#004C40', bg: 'bg-primary/10', sub: 'Smartphones' },
  SMARTPHONE:    { icon: Smartphone, color: '#004C40', bg: 'bg-primary/10', sub: 'Smartphones' },
  LAPTOP:        { icon: Laptop,     color: '#004C40', bg: 'bg-primary/10', sub: 'Laptops & Notebooks' },
  TABLET:        { icon: Tablet,     color: '#004C40', bg: 'bg-info/10',    sub: 'Tablets' },
  SMARTWATCH:    { icon: Watch,      color: '#B45309', bg: 'bg-warning/10', sub: 'Smart Watches' },
  SMARTWATCHES:  { icon: Watch,      color: '#B45309', bg: 'bg-warning/10', sub: 'Smart Watches' },
  AUDIO:         { icon: Headphones, color: '#004C40', bg: 'bg-danger/10',  sub: 'Headphones, Earbuds & Speakers' },
  AUDIO_DEVICES: { icon: Headphones, color: '#004C40', bg: 'bg-danger/10',  sub: 'Headphones, Earbuds & Speakers' },
  SPEAKER:       { icon: Volume2,    color: '#004C40', bg: 'bg-success/10', sub: 'Speakers' },
};
const DEFAULT_META = { icon: Smartphone, color: '#004C40', bg: 'bg-primary/10', sub: 'Devices' };

export default function SelectCategoryScreen({ navigation, route }) {
  const flow = route?.params?.flow || 'PROFILE';
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const { width: screenWidth } = useWindowDimensions();
  const { cardWidth } = gridMetrics(screenWidth);
  const logoBox = Math.round(cardWidth * 0.55);

  useEffect(() => {
    (async () => {
      try {
        const list = await getDeviceCategories();
        setCats((list || []).filter((c) => c.isActive !== false));
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return cats;
    const needle = q.toLowerCase();
    return cats.filter((c) => (c.name || '').toLowerCase().includes(needle));
  }, [cats, q]);

  // Tap auto-advances straight to the brand step. Forward `editSellOrderId`
  // (set when entering the wizard from "Edit sell order") so SellComplete can
  // PUT instead of POST at the end of the flow.
  const onPick = (c) => navigation.navigate('SelectBrand', {
    flow,
    categoryId: c.id,
    categoryCode: (c.code || '').toUpperCase(),
    categoryName: c.name,
    editSellOrderId: route?.params?.editSellOrderId,
  });

  const headerTitle = flow === 'OWNER_LIST' ? 'Sell' : 'Select Category';

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title={headerTitle}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        sticky={false}
      />
      <View className="px-4 pt-3 pb-3 bg-card border-b border-border">
        <SearchBar value={q} onChangeText={setQ} placeholder="Search category" onClear={() => setQ('')} />
      </View>

      {loading ? (
        <Loader label="Loading categories..." />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PAD, paddingTop: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <EmptyState title="No categories" description="Master data isn't seeded yet." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
              {filtered.map((c) => {
                const code = (c.code || '').toUpperCase();
                const meta = CODE_META[code] || DEFAULT_META;
                const Icon = meta.icon;
                const uri = resolveDeviceImageSource({ url: c.imageUrl, base64: c.imageBase64 });
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onPick(c)}
                    className="bg-card border border-border rounded-2xl active:opacity-80"
                    style={{
                      width: cardWidth,
                      padding: 6,
                      alignItems: 'center',
                      shadowColor: '#172117',
                      shadowOpacity: 0.04,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: 1,
                    }}
                  >
                    <View
                      className={`rounded-xl items-center justify-center overflow-hidden ${meta.bg}`}
                      style={{ height: logoBox, width: logoBox, marginBottom: 8 }}
                    >
                      {uri ? (
                        <Image
                          source={{ uri }}
                          style={{ width: logoBox, height: logoBox }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Icon size={Math.round(logoBox * 0.5)} color={meta.color} strokeWidth={2} />
                      )}
                    </View>
                    <Text
                      className="text-[10px] font-extrabold text-text"
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={{ textAlign: 'center', width: '100%' }}
                    >
                      {c.name}
                    </Text>
                    {cardWidth >= SUB_MIN_CARD ? (
                      <Text
                        className="text-[10px] text-text-muted mt-0.5"
                        numberOfLines={1}
                        style={{ textAlign: 'center', width: '100%' }}
                      >
                        {meta.sub}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
