import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import {
  Smartphone, Laptop, Watch, Tablet, Headphones, Volume2,
} from 'lucide-react-native';
import { EmptyState, Loader, ScreenHeader, SearchBar } from '../../../components/rnr';
import { getDeviceCategories } from '../../../api/masterData';
import { resolveDeviceImageSource } from '../../../utils/images';

// Same grid metrics as the rest of the device-selection family so all five
// pickers line up visually (pixel-exact card width; 3 cols on phones, 4 on tablets).
const HORIZONTAL_PAD = 16;
const GRID_GAP = 12;
function gridMetrics(screenWidth) {
  const numColumns = screenWidth >= 600 ? 4 : 3;
  // Math.floor — see SelectBrandScreen for explanation; without it RN can
  // round subpixel widths up and wrap the 3rd card to a new row.
  const cardWidth = Math.floor((screenWidth - HORIZONTAL_PAD * 2 - GRID_GAP * (numColumns - 1)) / numColumns);
  return { numColumns, cardWidth };
}

const CODE_META = {
  MOBILE:        { icon: Smartphone, color: '#087A0A', bg: 'bg-primary/10', sub: 'Smartphones' },
  SMARTPHONE:    { icon: Smartphone, color: '#087A0A', bg: 'bg-primary/10', sub: 'Smartphones' },
  LAPTOP:        { icon: Laptop,     color: '#16BB05', bg: 'bg-primary/10', sub: 'Laptops & Notebooks' },
  TABLET:        { icon: Tablet,     color: '#087A0A', bg: 'bg-info/10',    sub: 'Tablets' },
  SMARTWATCH:    { icon: Watch,      color: '#B45309', bg: 'bg-warning/10', sub: 'Smart Watches' },
  SMARTWATCHES:  { icon: Watch,      color: '#B45309', bg: 'bg-warning/10', sub: 'Smart Watches' },
  AUDIO:         { icon: Headphones, color: '#087A0A', bg: 'bg-danger/10',  sub: 'Headphones, Earbuds & Speakers' },
  AUDIO_DEVICES: { icon: Headphones, color: '#087A0A', bg: 'bg-danger/10',  sub: 'Headphones, Earbuds & Speakers' },
  SPEAKER:       { icon: Volume2,    color: '#087A0A', bg: 'bg-success/10', sub: 'Speakers' },
};
const DEFAULT_META = { icon: Smartphone, color: '#087A0A', bg: 'bg-primary/10', sub: 'Devices' };

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
                      padding: 10,
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
                      className="text-[12.5px] font-extrabold text-text"
                      numberOfLines={1}
                      style={{ textAlign: 'center', width: '100%' }}
                    >
                      {c.name}
                    </Text>
                    <Text
                      className="text-[10px] text-text-muted mt-0.5"
                      numberOfLines={1}
                      style={{ textAlign: 'center', width: '100%' }}
                    >
                      {meta.sub}
                    </Text>
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
