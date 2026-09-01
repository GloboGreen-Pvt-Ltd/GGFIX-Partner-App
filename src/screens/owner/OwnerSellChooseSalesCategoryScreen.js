import React from 'react';
import { View, Text, Pressable, ScrollView, Image, StatusBar } from 'react-native';
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
      accent: '#004C40',
      tint: '#F0F8EF',
      onPress: () => navigation.navigate('SelectVariant', params),
    },
    {
      key: 'parts',
      title: 'Spare Parts',
      sub: 'List individual parts (display, battery, camera…)',
      tag: 'Quick Sell',
      Icon: Wrench,
      accent: '#004C40',
      tint: '#F0F8EF',
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
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 22,
          borderBottomWidth: 1,
          borderBottomColor: '#E2E8E2',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: '#E6F7E3',
              alignItems: 'center', justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#004C40" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#172117', letterSpacing: 0.2 }}>
              Sell on ggfix
            </Text>
            <Text style={{ fontSize: 12, color: '#667066', marginTop: 2 }}>
              Reach nearby buyers in minutes
            </Text>
          </View>
          <View
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: '#E6F7E3',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="create-outline" size={20} color="#172117" />
          </View>
        </View>

        {/* Promo strip inside header */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: '#F0F8EF',
            paddingHorizontal: 12, paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1, borderColor: '#C8EEBF',
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: '#E6F7E3',
              alignItems: 'center', justifyContent: 'center', marginRight: 12,
            }}
          >
            <Ionicons name="flash" size={16} color="#004C40" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#004C40', fontSize: 14, fontWeight: '800' }}>
              Zero commission on first 10 listings
            </Text>
            <Text style={{ color: '#667066', fontSize: 12, marginTop: 2 }}>
              List more, sell more – we only win when you do!
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 18 }}>
        {modelName ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              padding: 12,
              marginBottom: 18,
              flexDirection: 'row',
              alignItems: 'center',
              shadowColor: '#172117',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.06,
              shadowRadius: 10,
              elevation: 2,
            }}
          >
            <View
              style={{
                width: 56, height: 56, borderRadius: 14,
                backgroundColor: '#F0F8EF',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 12, overflow: 'hidden',
              }}
            >
              {modelImageUrl ? (
                <Image source={{ uri: modelImageUrl }} style={{ width: 56, height: 56 }} resizeMode="cover" />
              ) : (
                <DeviceIcon size={26} color="#004C40" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: '#004C40', textTransform: 'uppercase' }}>
                Selected
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#172117', marginTop: 2 }} numberOfLines={1}>
                {modelName}
              </Text>
              {categoryName ? (
                <View
                  style={{
                    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
                    backgroundColor: '#F0F8EF',
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: 999, marginTop: 4,
                  }}
                >
                  <Ionicons name="phone-portrait" size={11} color="#004C40" />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#004C40', marginLeft: 4 }}>
                    {categoryName}
                  </Text>
                </View>
              ) : null}
            </View>
            <ChevronRight size={20} color="#CBD5CB" />
          </Pressable>
        ) : null}

        <Text
          style={{
            fontSize: 11, fontWeight: '800',
            color: '#8FA08F',
            letterSpacing: 1,
            marginBottom: 12,
            textTransform: 'uppercase',
          }}
        >
          What are you selling?
        </Text>

        {tiles.map((t) => {
          const Icon = t.Icon;
          return (
            <Pressable
              key={t.key}
              onPress={t.onPress}
              style={({ pressed }) => [
                {
                  backgroundColor: '#FFFFFF',
                  borderRadius: 18,
                  padding: 14,
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  shadowColor: '#172117',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.06,
                  shadowRadius: 10,
                  elevation: 2,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View
                style={{
                  width: 60, height: 60, borderRadius: 16,
                  backgroundColor: t.tint,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 14,
                }}
              >
                <Icon size={28} color={t.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#172117' }}>{t.title}</Text>
                  <View
                    style={{
                      marginLeft: 8,
                      backgroundColor: t.tint,
                      paddingHorizontal: 6, paddingVertical: 2,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '800', color: t.accent, letterSpacing: 0.3 }}>
                      {t.tag}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#667066', marginTop: 4, lineHeight: 17 }} numberOfLines={2}>
                  {t.sub}
                </Text>
              </View>
              <ChevronRight size={20} color={t.accent} />
            </Pressable>
          );
        })}

        {/* Why sell with us footer */}
        <View
          style={{
            marginTop: 8,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 14,
            shadowColor: '#172117',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 1,
          }}
        >
          <Text
            style={{
              fontSize: 11, fontWeight: '800', color: '#8FA08F',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
            }}
          >
            Why sell on ggfix
          </Text>

          {[
            { icon: 'shield-checkmark', color: '#004C40', title: 'Verified buyers in your area', sub: 'We connect you with trusted, local buyers' },
            { icon: 'ribbon', color: '#F59E0B', title: 'Get paid quickly & safely', sub: 'Secure payments with instant transfers' },
            { icon: 'rocket', color: '#004C40', title: 'Listing live in under a minute', sub: 'A few simple steps and you are done' },
          ].map((row, i) => (
            <View
              key={row.icon}
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 12,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: '#EFF5EE',
              }}
            >
              <View
                style={{
                  width: 44, height: 44, borderRadius: 14,
                  backgroundColor: row.color + '18',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Ionicons name={row.icon} size={20} color={row.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, color: '#172117', fontWeight: '800' }}>{row.title}</Text>
                <Text style={{ fontSize: 12, color: '#667066', marginTop: 2 }}>{row.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
