import React, { useCallback } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path } from 'react-native-svg';
import { BadgeCheck, Copy, Eye, House, LayoutList, Rocket, Tag } from 'lucide-react-native';
import { rf } from '../../../utils/responsive';
import { showToast } from '../../../components/Toast';
import { C, CONTENT_MAX, StatusPill, Thumb, listingImage, listingSub, money } from './kit';

// After publish / save: the new listing, its id and where to go next.

const HEAD = {
  PUBLISHED: { title: 'Listing Published!', sub: 'Your item is now live on the marketplace.' },
  DRAFT: { title: 'Draft Saved', sub: 'Publish it any time from My Listings → Draft.' },
  UPDATED: { title: 'Listing Updated', sub: 'Your changes have been saved.' },
};

const MINT = '#E3F6EE';
// Confetti dashes around the badge: [x offset, y, rotate, color].
const CONFETTI = [
  [-92, 18, '35deg', '#F3BF23'], [-104, 66, '25deg', '#F3BF23'], [-62, 0, '-55deg', '#2BB389'], [-70, 48, '40deg', '#2BB389'],
  [78, 16, '-35deg', '#F3BF23'], [52, 0, '55deg', '#2BB389'], [92, 64, '-25deg', '#2BB389'],
];

export default function SellListingSuccessScreen({ navigation, route }) {
  const listing = route?.params?.listing || null;
  const outcome = route?.params?.outcome || 'PUBLISHED';
  const head = HEAD[outcome] || HEAD.PUBLISHED;
  const shortId = listing?.id ? String(listing.id).replace(/-/g, '').slice(0, 10).toUpperCase() : null;
  const status = listing?._status || 'ACTIVE';
  const { width } = useWindowDimensions();

  const goSellHome = () => navigation.popTo('OwnerTabs', { screen: 'Sell' });
  // Android back button lands on the Sell tab home, not the wizard or another tab.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { navigation.popTo('OwnerTabs', { screen: 'Sell' }); return true; });
    return () => sub.remove();
  }, [navigation]));

  const copyId = async () => {
    try { await Clipboard.setStringAsync(`#${shortId}`); showToast({ type: 'success', title: 'Listing ID copied' }); } catch (_) {}
  };

  const shadow = (o, r) => ({ elevation: 3, shadowColor: '#000', shadowOpacity: o, shadowRadius: r, shadowOffset: { width: 0, height: 3 } });

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Soft mint waves, top and bottom */}
      <Svg width={width} height={160} style={{ position: 'absolute', top: 70 }} viewBox="0 0 400 160" preserveAspectRatio="none">
        <Path d="M0 40 C 90 0, 160 120, 260 70 S 400 40, 400 40 L400 160 L0 160 Z" fill="#EEF9F5" />
      </Svg>
      <Svg width={width} height={170} style={{ position: 'absolute', bottom: 0 }} viewBox="0 0 400 170" preserveAspectRatio="none">
        <Path d="M0 40 C 120 0, 220 90, 400 30 L400 170 L0 170 Z" fill="#E8F7F1" />
        <Path d="M0 90 C 140 40, 240 140, 400 70 L400 170 L0 170 Z" fill="#CDEFE3" />
      </Svg>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }}>
          {/* Badge on a podium, confetti around it */}
          <View style={{ alignItems: 'center', height: 150, justifyContent: 'flex-end' }}>
            {CONFETTI.map(([x, y, r, c], i) => (
              <View key={i} style={{ position: 'absolute', left: '50%', top: y, marginLeft: x, width: 16, height: 4, borderRadius: 2, backgroundColor: c, transform: [{ rotate: r }] }} />
            ))}
            <View style={{ height: 92, width: 92, borderRadius: 46, backgroundColor: '#1FA77A', alignItems: 'center', justifyContent: 'center', marginBottom: -12, zIndex: 1, elevation: 5, shadowColor: '#1FA77A', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
              <BadgeCheck size={54} color="#FFFFFF" strokeWidth={2.2} />
            </View>
            <View style={{ height: 28, width: 150, borderRadius: 75, backgroundColor: '#7FD8B6', borderBottomWidth: 6, borderBottomColor: '#3FBF94' }} />
          </View>

          <Text style={{ fontSize: rf(26), fontWeight: '900', color: '#0B2E24', marginTop: 20, textAlign: 'center' }}>{head.title}</Text>
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: MINT, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginTop: 10, maxWidth: '100%' }}>
            {outcome === 'PUBLISHED' ? <Rocket size={16} color={C.green} style={{ marginRight: 8 }} /> : null}
            <Text style={{ flexShrink: 1, fontSize: rf(13), fontWeight: '600', color: C.text, textAlign: 'center' }}>{head.sub}</Text>
          </View>

          {listing ? (
            <View style={[{ marginTop: 22, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 14 }, shadow(0.06, 10)]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <Thumb uri={listingImage(listing)} size={84} />
                <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                  <Text numberOfLines={2} style={{ fontSize: rf(15.5), fontWeight: '800', color: C.text }}>{listing.title}</Text>
                  <Text numberOfLines={1} style={{ fontSize: rf(12), color: C.muted, marginTop: 4 }}>{listingSub(listing)}</Text>
                  <Text style={{ fontSize: rf(19), fontWeight: '900', color: C.green, marginTop: 6 }}>{listing.price != null ? money(listing.price) : 'No price'}</Text>
                </View>
                <StatusPill status={status} />
              </View>
              {shortId ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: C.field, borderRadius: 12, paddingLeft: 8, paddingRight: 6, paddingVertical: 6 }}>
                  <View style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                    <Tag size={14} color={C.green} />
                  </View>
                  <Text style={{ fontSize: rf(12.5), color: C.muted, marginLeft: 8 }}>Listing ID</Text>
                  <Text selectable numberOfLines={1} style={{ flex: 1, textAlign: 'right', fontSize: rf(13), fontWeight: '800', color: C.text, marginRight: 8 }}>#{shortId}</Text>
                  <Pressable onPress={copyId} accessibilityRole="button" accessibilityLabel="Copy listing ID" hitSlop={6} className="active:opacity-70"
                    style={{ height: 32, width: 32, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
                    <Copy size={15} color={C.green} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Exactly three next steps, icon over label. */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            {[
              { label: 'My Listings', Icon: LayoutList, onPress: () => navigation.replace('SellMyListings', { initialStatus: status === 'DRAFT' ? 'DRAFT' : 'ACTIVE' }) },
              { label: 'View Listing', Icon: Eye, disabled: !listing?.id, onPress: () => navigation.navigate('MarketplaceListingDetails', { productId: listing.id, listing }) },
              { label: 'Back to Sell Home', Icon: House, onPress: goSellHome },
            ].map(({ label, Icon, onPress, disabled }) => (
              <Pressable key={label} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
                className="active:opacity-80"
                style={[{ flex: 1, alignItems: 'center', paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF', opacity: disabled ? 0.45 : 1 }, shadow(0.05, 8)]}>
                <View style={{ height: 48, width: 48, borderRadius: 24, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={22} color={C.green} />
                </View>
                <Text numberOfLines={2} style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text, marginTop: 8, textAlign: 'center', paddingHorizontal: 4 }}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
