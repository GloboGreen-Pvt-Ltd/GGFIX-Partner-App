import React from 'react';
import { View, Text, Image, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function OwnerSellListedScreen({ navigation, route }) {
  const { listing = {}, device = {}, images = {}, price = 0 } = route?.params || {};
  const firstImage = Object.values(images).filter(Boolean)[0] || device.imageUrl;

  const goHome = () => {
    try { navigation.popToTop(); } catch (_) {}
    try { navigation.navigate('Home'); } catch (_) {}
  };

  const goSellMore = () => {
    try { navigation.popToTop(); } catch (_) {}
    try { navigation.navigate('Sell'); } catch (_) {}
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View className="items-center mb-6">
          <View className="bg-success/15 rounded-full p-3 mb-3">
            <Ionicons name="checkmark-circle" size={56} color="#004C40" />
          </View>
          <Text className="text-text text-[20px] font-extrabold">Listed Successfully!</Text>
          <Text className="text-text-muted text-[12px] mt-1">Your device is now on the marketplace.</Text>
        </View>

        <View className="bg-card border border-border rounded-2xl p-4 mb-6">
          <View className="flex-row items-center">
            <View className="w-14 h-16 bg-border rounded-md overflow-hidden items-center justify-center">
              {firstImage ? (
                <Image source={{ uri: firstImage }} style={{ width: 56, height: 64 }} resizeMode="cover" />
              ) : (
                <Ionicons name="phone-portrait-outline" size={22} color="#667066" />
              )}
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-text font-extrabold text-[14px]" numberOfLines={1}>
                {device.modelName || 'Device'}
              </Text>
              {listing.id ? (
                <Text className="text-text-muted text-[10px] mt-0.5" numberOfLines={1}>#{listing.id}</Text>
              ) : null}
              <Text className="text-primary text-[14px] font-extrabold mt-1">
                ₹ {Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row">
          <Pressable
            onPress={goHome}
            className="flex-1 mr-2 rounded-2xl bg-background border border-border py-3 items-center active:opacity-80"
          >
            <Text className="text-text font-extrabold text-[13px]">Home</Text>
          </Pressable>
          <Pressable
            onPress={goSellMore}
            className="flex-1 rounded-2xl bg-primary py-3 items-center active:opacity-80"
          >
            <Text className="text-white font-extrabold text-[13px]">Sell More</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
