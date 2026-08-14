import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrendingUp, ShieldCheck, Sparkles } from 'lucide-react-native';
import { SectionHeader, OfferBanner, EmptyState, Loader } from '../../../components/rnr';
import { getDeviceCategories } from '../../../api/masterData';

// Per-code emoji/tint/sub fallback so admin-driven categories keep a friendly
// visual when they have no uploaded image yet.
const CODE_META = {
  MOBILE:        { emoji: '📱', bg: '#F0F8EF', sub: 'Get instant quote' },
  SMARTPHONE:    { emoji: '📱', bg: '#F0F8EF', sub: 'Get instant quote' },
  LAPTOP:        { emoji: '💻', bg: '#F0F8EF', sub: 'Fair market value' },
  SMARTWATCH:    { emoji: '⌚', bg: '#FFFBEB', sub: 'All brands accepted' },
  SMARTWATCHES:  { emoji: '⌚', bg: '#FFFBEB', sub: 'All brands accepted' },
  TABLET:        { emoji: '📲', bg: '#F0F8EF', sub: 'Top price guaranteed' },
  AUDIO:         { emoji: '🎧', bg: '#FEF2F2', sub: 'Earbuds & headphones' },
  AUDIO_DEVICES: { emoji: '🎧', bg: '#FEF2F2', sub: 'Earbuds & headphones' },
};
const DEFAULT_META = { emoji: '📱', bg: '#F0F8EF', sub: 'Get the best price' };

// Resolve an admin-uploaded category image (base64 preferred) to an <Image>
// uri, or null when the category has no image.
function imgUri(item) {
  if (!item) return null;
  const b64 = item.imageBase64 && String(item.imageBase64).trim();
  if (b64) return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  const url = item.imageUrl && String(item.imageUrl).trim();
  return url || null;
}

const STEPS = [
  { n: 1, title: 'Tell us about your device', sub: 'Model · condition · accessories' },
  { n: 2, title: 'Get quotes from shops',     sub: 'Up to 5 instant quotes' },
  { n: 3, title: 'Pickup at your doorstep',   sub: 'Pick the best · free pickup' },
];

export default function SellHomeScreen({ navigation }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();

  useEffect(() => {
    (async () => {
      try {
        const list = await getDeviceCategories();
        setCats((list || []).filter((c) => c.isActive !== false));
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // Same grid math as Repair / Buy home — 2 cols on phones, 3 on tablets,
  // 0.66 image aspect ratio. Keeps the three home screens visually consistent.
  const numCols = width >= 600 ? 3 : 2;
  const gridGap = 10;
  const gridPadH = 14;
  const cardW = Math.floor((width - gridPadH * 2 - gridGap * (numCols - 1)) / numCols);
  const imgH = Math.round(cardW * 0.66);

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{ backgroundColor: '#FFFFFF', paddingTop: 12, paddingBottom: 22, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
        >
          <View className="px-4">
            <Text className="text-text-muted text-[12px] font-bold tracking-widest">SELL & EARN</Text>
            <Text className="text-text text-[24px] font-extrabold mt-1">Turn your old tech into cash</Text>
            <Text className="text-text-muted text-[13px] mt-1">Best price from verified shops nearby.</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Trust strip — 3 cards matching Repair Home's promise cards */}
        <View className="flex-row px-4 mt-4">
          <View className="flex-1 bg-card border border-border rounded-2xl py-3 px-2 items-center mx-1">
            <TrendingUp size={18} color="#16BB05" />
            <Text className="text-[10px] font-bold text-text text-center mt-1.5">Best Price</Text>
          </View>
          <View className="flex-1 bg-card border border-border rounded-2xl py-3 px-2 items-center mx-1">
            <ShieldCheck size={18} color="#16BB05" />
            <Text className="text-[10px] font-bold text-text text-center mt-1.5">Verified Shops</Text>
          </View>
          <View className="flex-1 bg-card border border-border rounded-2xl py-3 px-2 items-center mx-1">
            <Sparkles size={18} color="#F59E0B" />
            <Text className="text-[10px] font-bold text-text text-center mt-1.5">Free Pickup</Text>
          </View>
        </View>

        <SectionHeader title="Select Category" caption="What are you selling today?" />
        {loading ? (
          <View className="py-8"><Loader label="Loading categories..." /></View>
        ) : cats.length === 0 ? (
          <View className="px-4">
            <EmptyState title="No categories yet" description="The admin hasn't published any device categories." />
          </View>
        ) : (
          <View className="flex-row flex-wrap" style={{ paddingHorizontal: gridPadH }}>
            {cats.map((c, i) => {
              const code = (c.code || '').toUpperCase();
              const meta = CODE_META[code] || DEFAULT_META;
              const uri = imgUri(c);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => navigation.navigate('SellSelectDevice', { flow: 'SELL', categoryId: c.id, categoryCode: code, categoryName: c.name })}
                  className="bg-card border border-border rounded-2xl p-2.5 active:opacity-80"
                  style={{
                    width: cardW,
                    marginLeft: i % numCols === 0 ? 0 : gridGap,
                    marginBottom: gridGap,
                    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
                  }}
                >
                  <View
                    className="rounded-xl items-center justify-center overflow-hidden mb-2"
                    style={{ width: '100%', height: imgH, backgroundColor: uri ? '#FFFFFF' : meta.bg }}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                    ) : (
                      <Text style={{ fontSize: 34 }}>{meta.emoji}</Text>
                    )}
                  </View>
                  <Text className="text-[14px] font-extrabold text-text" numberOfLines={1}>{c.name}</Text>
                  <Text className="text-[11px] text-text-muted mt-0.5" numberOfLines={2}>{meta.sub}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <SectionHeader title="How it works" />
        <View className="px-4">
          {STEPS.map((s) => (
            <View key={s.n} className="flex-row items-start mb-2">
              <View className="h-7 w-7 rounded-full bg-primary items-center justify-center mr-2">
                <Text className="text-white text-[11px] font-extrabold">{s.n}</Text>
              </View>
              <View className="flex-1 bg-card border border-border rounded-xl px-2.5 py-2">
                <Text className="text-[12px] font-extrabold text-text">{s.title}</Text>
                <Text className="text-[10px] text-text-muted mt-0.5">{s.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="px-4 mt-2">
          <OfferBanner
            badge="GUARANTEED"
            title="Top price or free pickup"
            subtitle="Not happy with the offer? Free pickup, no questions."
            cta="Learn more"
            palette="emerald"
            onPress={() => {}}
          />
        </View>
      </ScrollView>
    </View>
  );
}
