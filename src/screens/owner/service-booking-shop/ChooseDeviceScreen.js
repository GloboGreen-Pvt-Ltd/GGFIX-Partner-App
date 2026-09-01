import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import {
  Smartphone, Tablet, Laptop, Watch, Headphones, Volume2,
} from 'lucide-react-native';
import {
  ScreenHeader, EmptyState, Loader, Badge,
} from '../../../components/rnr';
import DeviceImage from '../../../components/DeviceImage';
import { resolveDeviceImageSource } from '../../../utils/images';
import { getDeviceCategories } from '../../../api/masterData';

const CODE_META = {
  MOBILE:        { icon: Smartphone, color: '#087A0A', bg: 'bg-primary/10', sub: 'Smartphones' },
  SMARTPHONE:    { icon: Smartphone, color: '#087A0A', bg: 'bg-primary/10', sub: 'Smartphones' },
  LAPTOP:        { icon: Laptop,     color: '#16BB05', bg: 'bg-primary/10', sub: 'Laptops & Notebooks' },
  TABLET:        { icon: Tablet,     color: '#087A0A', bg: 'bg-info/10',    sub: 'Tablets' },
  SMARTWATCH:    { icon: Watch,      color: '#B45309', bg: 'bg-warning/10', sub: 'Smart Watches' },
  SMARTWATCHES:  { icon: Watch,      color: '#B45309', bg: 'bg-warning/10', sub: 'Smart Watches' },
  AUDIO:         { icon: Headphones, color: '#087A0A', bg: 'bg-danger/10',  sub: 'Headphones & Earbuds' },
  AUDIO_DEVICES: { icon: Headphones, color: '#087A0A', bg: 'bg-danger/10',  sub: 'Headphones & Earbuds' },
  SPEAKER:       { icon: Volume2,    color: '#087A0A', bg: 'bg-success/10', sub: 'Speakers' },
};
const DEFAULT_META = { icon: Smartphone, color: '#087A0A', bg: 'bg-primary/10', sub: 'Devices' };

const CODE_ORDER = [
  'MOBILE', 'SMARTPHONE',
  'TABLET',
  'LAPTOP',
  'SMARTWATCH', 'SMARTWATCHES',
  'AUDIO', 'AUDIO_DEVICES',
  'SPEAKER',
];
const orderRank = (code) => {
  const idx = CODE_ORDER.indexOf((code || '').toUpperCase());
  return idx === -1 ? CODE_ORDER.length : idx;
};

// Booking-flow category picker (its header reads "Select Category"). NOT the
// shared `SelectCategory` route in shared/device — that one serves the sell and
// profile flows; this screen is what the booking flow actually opens.
const SCREEN_BG = '#FFFFFF';
const CARD_BG = '#FFFFFF';
// Five across, so the five published categories sit on one row. The gutter is
// 8 rather than 12 and the card padding 6 rather than 14: at five columns a
// 390pt phone gives each card only ~65pt, and the old spacing left no room for
// the label.
const GRID_COLUMNS = 5;

export default function ChooseDeviceScreen({ navigation, route }) {
  const params = route?.params || {};
  const { width } = useWindowDimensions();
  const numColumns = GRID_COLUMNS;
  const horizontalPadding = 16;
  const gap = 8;
  // Math.floor, so a subpixel residue cannot wrap the fifth card to a new row.
  const cardWidth = Math.floor((width - horizontalPadding * 2 - gap * (numColumns - 1)) / numColumns);
  // The thumbnail was a fixed 104pt, which is taller than the whole card at
  // five columns. Scale it with the card and keep a floor so the icon
  // fallback still has somewhere to sit.
  const thumbSize = Math.max(40, Math.round(cardWidth * 0.78));

  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await getDeviceCategories();
        const active = (list || []).filter((c) => c.isActive !== false);
        active.sort((a, b) => {
          const ra = orderRank(a.code);
          const rb = orderRank(b.code);
          if (ra !== rb) return ra - rb;
          return (a.name || '').localeCompare(b.name || '');
        });
        setCats(active);
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // Hand off to the consolidated shared device picker. `flow: 'BOOKING'` is
  // what tells shared/device/SelectModelScreen to route to DeviceColorStorage
  // (rather than SelectVariant or OwnerSellChooseSalesCategory) at the end.
  const onPick = (c) => navigation.navigate('SelectBrand', {
    ...params,
    flow: 'BOOKING',
    categoryId: c.id,
    categoryCode: (c.code || '').toUpperCase(),
    categoryName: c.name,
  });

  return (
    <View className="flex-1" style={{ backgroundColor: SCREEN_BG }}>
      <ScreenHeader title="Select Category" onBack={() => navigation.goBack()} />

      {params.customer ? (
        <View className="px-4 pt-3 pb-3 bg-card border-b border-border">
          <View className="bg-card border border-border rounded-2xl p-3 flex-row items-center">
            <View className="h-9 w-9 rounded-full bg-primary/10 items-center justify-center mr-2.5">
              <Text className="text-[13px] font-extrabold text-primary">
                {(params.customer.name || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-[11px] text-text-muted">Booking for</Text>
              <Text className="text-[13px] font-extrabold text-text" numberOfLines={1}>{params.customer.name}</Text>
            </View>
            <Badge variant="softSuccess">CUSTOMER</Badge>
          </View>
        </View>
      ) : null}

      {loading ? (
        <Loader label="Loading categories..." />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {cats.length === 0 ? (
            <EmptyState
              title="No categories"
              description="No device categories published yet."
            />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
              {cats.map((c) => {
                const code = (c.code || '').toUpperCase();
                const meta = CODE_META[code] || DEFAULT_META;
                const Icon = meta.icon;
                const thumb = resolveDeviceImageSource({ url: c.imageUrl, base64: c.imageBase64 });
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onPick(c)}
                    className="border border-border rounded-2xl active:opacity-80"
                    style={{
                      width: cardWidth,
                      backgroundColor: CARD_BG,
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
                      className="rounded-xl items-center justify-center overflow-hidden"
                      style={{ height: thumbSize, width: '100%', backgroundColor: CARD_BG, marginBottom: 6, padding: 2 }}
                    >
                      {thumb ? (
                        <DeviceImage
                          url={c.imageUrl}
                          base64={c.imageBase64}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="contain"
                        />
                      ) : (
                        <Icon size={30} color={meta.color} strokeWidth={2} />
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
