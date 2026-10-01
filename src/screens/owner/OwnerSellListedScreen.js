import React from 'react';
import { View, Text, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Smartphone } from 'lucide-react-native';
import { SELL, SellButton, sellShadow } from '../shared/sell/sellTheme';

export default function OwnerSellListedScreen({ navigation, route }) {
  const { listing = {}, device = {}, images = {}, price = 0 } = route?.params || {};
  const firstImage = Object.values(images).filter(Boolean)[0] || device.imageUrl;
  const insets = useSafeAreaInsets();
  // The listing id is a UUID — show a short, readable reference instead.
  const ref = listing.id ? String(listing.id).split('-')[0].toUpperCase() : null;

  const goHome = () => {
    try { navigation.popToTop(); } catch (_) {}
    try { navigation.navigate('Home'); } catch (_) {}
  };

  const goSellMore = () => {
    try { navigation.popToTop(); } catch (_) {}
    try { navigation.navigate('Sell'); } catch (_) {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: SELL.page }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ height: 96, width: 96, borderRadius: 48, backgroundColor: SELL.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <View style={{ height: 64, width: 64, borderRadius: 32, backgroundColor: SELL.green, alignItems: 'center', justifyContent: 'center' }}>
              <Check size={34} color="#FFFFFF" strokeWidth={3} />
            </View>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: SELL.ink }}>Listed successfully!</Text>
          <Text style={{ fontSize: 13, color: SELL.muted, marginTop: 4, textAlign: 'center' }}>
            Your device is now live on the marketplace.
          </Text>
        </View>

        <View style={{ backgroundColor: SELL.card, borderRadius: 18, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: SELL.soft, flexDirection: 'row', alignItems: 'center', ...sellShadow }}>
          <View style={{ height: 68, width: 60, borderRadius: 12, backgroundColor: SELL.soft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {firstImage ? (
              <Image source={{ uri: firstImage }} style={{ width: 60, height: 68 }} resizeMode="contain" />
            ) : (
              <Smartphone size={24} color={SELL.muted} />
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: SELL.ink }} numberOfLines={2}>{device.modelName || 'Device'}</Text>
            {ref ? <Text style={{ fontSize: 12, color: SELL.muted, marginTop: 2 }} numberOfLines={1}>Listing #{ref}</Text> : null}
            <Text style={{ fontSize: 16, fontWeight: '800', color: SELL.greenDark, marginTop: 4 }}>
              ₹{Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={{ alignSelf: 'flex-start', backgroundColor: SELL.greenLight, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10.5, fontWeight: '800', color: SELL.greenDark }}>LIVE</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SellButton title="Home" variant="outline" onPress={goHome} style={{ flex: 1 }} />
          <SellButton title="Sell More" onPress={goSellMore} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </View>
  );
}
