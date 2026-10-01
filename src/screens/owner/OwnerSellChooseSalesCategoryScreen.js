import React from 'react';
import { View, Text, Pressable, ScrollView, Image, StatusBar, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Smartphone,
  Laptop,
  Watch,
  Tablet,
  Headphones,
  Wrench,
  ChevronRight,
} from 'lucide-react-native';

// GGFIX palette — green #09AD2A, ink #1E1E1E, white, neutrals #F8F8F8/#F3F3F3.
const G = '#09AD2A';
const G_DARK = '#078F23'; // green text on light-green fills
const G_LIGHT = '#EAF8EC';
const INK = '#1E1E1E';
const MUTED = '#6B6B6B';
const LINE = '#E6E6E6';
const SOFT = '#F3F3F3';
const PAGE_BG = '#F8F8F8';

const ICONS_BY_CODE = {
  MOBILE: Smartphone,
  SMARTPHONE: Smartphone,
  LAPTOP: Laptop,
  TABLET: Tablet,
  SMARTWATCH: Watch,
  SMARTWATCHES: Watch,
  AUDIO: Headphones,
  AUDIO_DEVICES: Headphones,
};

export default function OwnerSellChooseSalesCategoryScreen({ navigation, route }) {
  const params = route?.params || {};
  const { categoryCode, categoryName, modelName, modelImageUrl } = params;
  const DeviceIcon = ICONS_BY_CODE[(categoryCode || '').toUpperCase()] || Smartphone;

  const tiles = [
    {
      key: 'device',
      title: categoryName || 'Mobile',
      sub: `List the whole ${(categoryName || 'device').toLowerCase()} for sale`,
      tag: 'Best Value',
      Icon: DeviceIcon,
      accent: G,
      tint: G_LIGHT,
      onPress: () => navigation.navigate('SelectVariant', params),
    },
    {
      key: 'parts',
      title: 'Spare Parts',
      sub: 'List individual parts (display, battery, camera…)',
      tag: 'Quick Sell',
      Icon: Wrench,
      accent: G,
      tint: G_LIGHT,
      onPress: () => navigation.navigate('OwnerSellSpareParts', params),
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* White header */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: LINE,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: G_LIGHT,
              alignItems: 'center', justifyContent: 'center',
              marginRight: 10,
            }}
          >
            <Ionicons name="arrow-back" size={19} color={G} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18.5, fontWeight: '800', color: INK, letterSpacing: 0.2 }}>
              Sell on ggfix
            </Text>
            <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Reach nearby buyers in minutes
            </Text>
          </View>
          <View
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: G_LIGHT,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="create-outline" size={19} color={INK} />
          </View>
        </View>

        {/* Promo strip inside header */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: G_LIGHT,
            paddingHorizontal: 12, paddingVertical: 8,
            borderRadius: 12,
            borderWidth: 1, borderColor: '#CDEFD5',
          }}
        >
          <View
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: '#FFFFFF',
              alignItems: 'center', justifyContent: 'center', marginRight: 10,
            }}
          >
            <Ionicons name="flash" size={15} color={G} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: G_DARK, fontSize: 13, fontWeight: '800' }}>
              Zero commission on first 10 listings
            </Text>
            <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
              List more, sell more – we only win when you do!
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ backgroundColor: PAGE_BG }} contentContainerStyle={{ padding: 12, paddingTop: 14 }}>
        {modelName ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: 10,
              marginBottom: 14,
              flexDirection: 'row',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: SOFT,
              shadowColor: INK,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            <View
              style={{
                width: 48, height: 48, borderRadius: 12,
                backgroundColor: G_LIGHT,
                alignItems: 'center', justifyContent: 'center',
                marginRight: 10, overflow: 'hidden',
              }}
            >
              {modelImageUrl ? (
                <Image source={{ uri: modelImageUrl }} style={{ width: 48, height: 48 }} resizeMode="cover" />
              ) : (
                <DeviceIcon size={22} color={G} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: G_DARK, textTransform: 'uppercase' }}>
                Selected
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: INK, marginTop: 2 }} numberOfLines={1}>
                {modelName}
              </Text>
              {categoryName ? (
                <View
                  style={{
                    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
                    backgroundColor: G_LIGHT,
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: 999, marginTop: 4,
                  }}
                >
                  <Ionicons name="phone-portrait" size={11} color={G} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: G_DARK, marginLeft: 4 }}>
                    {categoryName}
                  </Text>
                </View>
              ) : null}
            </View>
            <ChevronRight size={20} color="#D6D6D6" />
          </Pressable>
        ) : null}

        <Text
          style={{
            fontSize: 11, fontWeight: '800',
            color: '#8E8E8E',
            letterSpacing: 1,
            marginBottom: 10,
            textTransform: 'uppercase',
          }}
        >
          What are you selling?
        </Text>

        {tiles.map((t) => {
          const Icon = t.Icon;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={t.onPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${t.title}, ${t.sub}`}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                padding: 12,
                marginBottom: 10,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: SOFT,
                shadowColor: INK,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.06,
                shadowRadius: 10,
                elevation: 2,
              }}
            >
              <View
                style={{
                  width: 48, height: 48, borderRadius: 14,
                  backgroundColor: t.tint,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Icon size={24} color={t.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '800', color: INK }} numberOfLines={1}>{t.title}</Text>
                  <View
                    style={{
                      marginLeft: 8,
                      backgroundColor: t.tint,
                      paddingHorizontal: 6, paddingVertical: 2,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '800', color: G_DARK, letterSpacing: 0.3 }}>
                      {t.tag}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 17 }} numberOfLines={2}>
                  {t.sub}
                </Text>
              </View>
              <ChevronRight size={20} color={t.accent} />
            </TouchableOpacity>
          );
        })}

        {/* Why sell with us footer */}
        <View
          style={{
            marginTop: 6,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 11,
            shadowColor: INK,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 1,
          }}
        >
          <Text
            style={{
              fontSize: 11, fontWeight: '800', color: '#8E8E8E',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
            }}
          >
            Why sell on ggfix
          </Text>

          {[
            { icon: 'shield-checkmark', color: G, title: 'Verified buyers in your area', sub: 'We connect you with trusted, local buyers' },
            { icon: 'ribbon', color: '#F59E0B', title: 'Get paid quickly & safely', sub: 'Secure payments with instant transfers' },
            { icon: 'rocket', color: G, title: 'Listing live in under a minute', sub: 'A few simple steps and you are done' },
          ].map((row, i) => (
            <View
              key={row.icon}
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 9,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: SOFT,
              }}
            >
              <View
                style={{
                  width: 38, height: 38, borderRadius: 12,
                  backgroundColor: row.color + '18',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Ionicons name={row.icon} size={18} color={row.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: INK, fontWeight: '800' }}>{row.title}</Text>
                <Text style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{row.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
