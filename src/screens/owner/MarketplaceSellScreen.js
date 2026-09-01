import React from 'react';
import { Image, Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Smartphone,
  Wrench,
  Search,
  Tag,
  Store,
  TrendingUp,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  ChevronLeft,
  MapPin,
} from 'lucide-react-native';

// Swiggy / Zomato green palette — matches customer SellHomeScreen visual language.
const GREEN       = '#004C40';
const GREEN_LIGHT = '#004C40';
const GREEN_DARK  = '#004C40';

const PROMISES = [
  { icon: TrendingUp,  label: 'Quick Listing',   tint: '#E6F7E3', color: GREEN_DARK },
  { icon: ShieldCheck, label: 'Trusted Buyers',  tint: '#FEF3C7', color: '#B45309' },
  { icon: Sparkles,    label: 'Boost Visibility', tint: '#FEF3C7', color: '#B45309' },
];

const STEPS = [
  { n: 1, title: 'Pick a category',           sub: 'Mobile · Spare parts · Accessories' },
  { n: 2, title: 'Add device & photos',       sub: 'Condition · IMEI · pricing' },
  { n: 3, title: 'Publish to marketplace',    sub: 'Buyers see your listing instantly' },
];

const TILES = [
  {
    key: 'SelectCategory',
    title: 'Mobile',
    sub: 'List a phone for sale — condition, photos, price',
    Icon: Smartphone,
    accent: GREEN_DARK,
    tint: '#E6F7E3',
    emoji: '📱',
    badge: 'POPULAR',
    params: { flow: 'OWNER_LIST' },
  },
  {
    key: 'OwnerSellSpareParts',
    title: 'Spare Parts',
    sub: 'List display combo, battery, camera & more',
    Icon: Wrench,
    accent: '#B45309',
    tint: '#FEF3C7',
    emoji: '🔧',
    badge: 'BULK OK',
    params: undefined,
  },
];

export default function MarketplaceSellScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const padH = 16;
  // 2-column grid for the category cards. Match the customer SellHome's
  // gap so the visual rhythm is consistent across both apps.
  const gridGap = 12;
  const cardW = Math.floor((width - padH * 2 - gridGap) / 2);
  const imgH = Math.round(cardW * 0.7);

  return (
    <View className="flex-1 bg-background">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            backgroundColor: '#FFFFFF',
            paddingTop: 10,
            paddingBottom: 18,
            borderBottomWidth: 1,
            borderBottomColor: '#E2E8E2',
          }}
        >
          <View style={{ paddingHorizontal: padH }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {navigation?.canGoBack?.() ? (
                <Pressable
                  onPress={() => navigation.goBack()}
                  hitSlop={8}
                  style={{
                    height: 36, width: 36, borderRadius: 18,
                    backgroundColor: '#EFF5EE',
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <ChevronLeft size={20} color="#172117" />
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Store size={14} color="#172117" />
                  <Text
                    style={{
                      color: '#172117', fontWeight: '800', fontSize: 13,
                      marginLeft: 4, letterSpacing: 0.5,
                    }}
                  >
                    SELL ON GGFIX
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <MapPin size={13} color="#667066" />
                  <Text
                    numberOfLines={1}
                    style={{
                      color: '#667066', fontWeight: '700', fontSize: 14,
                      maxWidth: width - 160, marginLeft: 4,
                    }}
                  >
                    Listings reach nearby buyers
                  </Text>
                  <ChevronDown size={15} color="#172117" style={{ marginLeft: 4 }} />
                </View>
              </View>
              <View
                style={{
                  paddingHorizontal: 10, paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: '#EFF5EE',
                }}
              >
                <Text style={{ color: '#172117', fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 }}>
                  OWNER
                </Text>
              </View>
            </View>

            <Text
              style={{
                color: '#172117', fontSize: 22, fontWeight: '800',
                marginTop: 14, letterSpacing: -0.3,
              }}
            >
              List a device for sale
            </Text>
            <Text
              style={{ color: '#667066', fontSize: 12.5, marginTop: 3 }}
            >
              Reach verified buyers — quick listing, instant exposure.
            </Text>

            <Pressable
              onPress={() => navigation.navigate('SelectCategory', { flow: 'OWNER_LIST' })}
              style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#F7FAF7', borderRadius: 16,
                borderWidth: 1, borderColor: '#E2E8E2',
                paddingHorizontal: 14, paddingVertical: 12,
                marginTop: 16,
                shadowColor: '#172117', shadowOpacity: 0.06,
                shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
              }}
            >
              <Search size={18} color={GREEN} />
              <Text
                numberOfLines={1}
                style={{ flex: 1, marginLeft: 10, color: '#667066', fontSize: 14 }}
              >
                Search a device to list
              </Text>
              <View
                style={{
                  backgroundColor: '#E6F7E3', borderRadius: 999,
                  paddingHorizontal: 10, paddingVertical: 4,
                }}
              >
                <Text style={{ color: GREEN_DARK, fontSize: 11, fontWeight: '800' }}>LIST</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Promise tiles */}
        <View style={{ flexDirection: 'row', paddingHorizontal: padH, marginTop: 16 }}>
          {PROMISES.map((p) => {
            const Icon = p.icon;
            return (
              <View
                key={p.label}
                style={{
                  flex: 1, marginHorizontal: 4,
                  backgroundColor: '#fff', borderRadius: 14,
                  paddingVertical: 12, paddingHorizontal: 6,
                  alignItems: 'center',
                  borderWidth: 1, borderColor: '#EFF5EE',
                }}
              >
                <View
                  style={{
                    height: 32, width: 32, borderRadius: 16,
                    backgroundColor: p.tint,
                    alignItems: 'center', justifyContent: 'center',
                    marginBottom: 6,
                  }}
                >
                  <Icon size={16} color={p.color} />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 10.5, fontWeight: '700', color: '#172117', textAlign: 'center',
                  }}
                >
                  {p.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Section header */}
        <View
          style={{
            paddingHorizontal: padH,
            marginTop: 22, marginBottom: 10,
            flexDirection: 'row', alignItems: 'flex-end',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 17, fontWeight: '800',
                color: '#172117', letterSpacing: -0.2,
              }}
            >
              Choose sales category
            </Text>
            <Text style={{ fontSize: 12, color: '#667066', marginTop: 2 }}>
              What are you listing today?
            </Text>
          </View>
          <View
            style={{
              backgroundColor: '#E6F7E3', borderRadius: 999,
              paddingHorizontal: 10, paddingVertical: 4,
            }}
          >
            <Text style={{ color: GREEN_DARK, fontSize: 11, fontWeight: '800' }}>
              {TILES.length} options
            </Text>
          </View>
        </View>

        {/* Category grid — mirrors customer SellHome category cards */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: padH }}>
          {TILES.map((t, i) => {
            const Icon = t.Icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => navigation.navigate(t.key, t.params || undefined)}
                style={{
                  width: cardW,
                  marginLeft: i % 2 === 0 ? 0 : gridGap,
                  marginBottom: gridGap,
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  padding: 10,
                  borderWidth: 1, borderColor: '#EFF5EE',
                  shadowColor: '#172117', shadowOpacity: 0.05,
                  shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
                }}
              >
                <View
                  style={{
                    width: '100%', height: imgH, borderRadius: 14,
                    backgroundColor: t.tint,
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: Math.min(40, imgH * 0.45) }}>{t.emoji}</Text>
                  <View
                    style={{
                      position: 'absolute', top: 64, alignSelf: 'center',
                      backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999,
                      paddingHorizontal: 8, paddingVertical: 4,
                      flexDirection: 'row', alignItems: 'center',
                    }}
                  >
                    <Icon size={12} color={t.accent} />
                  </View>
                  <View
                    style={{
                      position: 'absolute', top: 8, left: 8,
                      backgroundColor: '#E6F7E3', borderRadius: 999,
                      paddingHorizontal: 8, paddingVertical: 3,
                      flexDirection: 'row', alignItems: 'center',
                    }}
                  >
                    <Tag size={10} color={GREEN_DARK} />
                    <Text style={{ color: GREEN_DARK, fontSize: 9.5, fontWeight: '800', marginLeft: 3 }}>
                      {t.badge}
                    </Text>
                  </View>
                </View>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 14, fontWeight: '800', color: '#172117' }}
                >
                  {t.title}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ fontSize: 11, color: '#667066', marginTop: 2 }}
                >
                  {t.sub}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* How it works */}
        <View style={{ paddingHorizontal: padH, marginTop: 22, marginBottom: 6 }}>
          <Text
            style={{
              fontSize: 17, fontWeight: '800',
              color: '#172117', letterSpacing: -0.2,
            }}
          >
            How it works
          </Text>
          <Text style={{ fontSize: 12, color: '#667066', marginTop: 2 }}>
            Three steps from device to live listing
          </Text>
        </View>
        <View style={{ paddingHorizontal: padH }}>
          {STEPS.map((s) => (
            <View
              key={s.n}
              style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}
            >
              <View
                style={{
                  height: 28, width: 28, borderRadius: 14,
                  backgroundColor: GREEN,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 10, marginTop: 2,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{s.n}</Text>
              </View>
              <View
                style={{
                  flex: 1, backgroundColor: '#fff', borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderWidth: 1, borderColor: '#EFF5EE',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#172117' }}>
                  {s.title}
                </Text>
                <Text style={{ fontSize: 11, color: '#667066', marginTop: 2 }}>
                  {s.sub}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Bottom CTA */}
        <View style={{ paddingHorizontal: padH, marginTop: 18 }}>
          <Pressable
            onPress={() => navigation.navigate('MarketplaceOrders')}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: '#F0F8EF', borderRadius: 16,
              borderWidth: 1, borderColor: '#C8EEBF',
              paddingHorizontal: 14, paddingVertical: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View
                style={{
                  height: 36, width: 36, borderRadius: 18,
                  backgroundColor: '#E6F7E3',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Store size={18} color={GREEN_DARK} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#172117' }}>
                  My Listings
                </Text>
                <Text style={{ fontSize: 11, color: '#667066', marginTop: 1 }}>
                  Manage devices you've already published
                </Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '800', color: GREEN_DARK }}>
              View →
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
