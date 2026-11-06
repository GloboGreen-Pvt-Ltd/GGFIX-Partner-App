import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { CircleCheck, Eye, House, LayoutList } from 'lucide-react-native';
import { rf } from '../../../utils/responsive';
import { C, Card, PrimaryButton, SellScreen, StatusPill, Thumb, listingImage, listingSub, money } from './kit';

// After publish / save: the new listing, its id and where to go next.

const HEAD = {
  PUBLISHED: { title: 'Listing Published', sub: 'Your item is now live on the marketplace.' },
  DRAFT: { title: 'Draft Saved', sub: 'Publish it any time from My Listings → Draft.' },
  UPDATED: { title: 'Listing Updated', sub: 'Your changes have been saved.' },
};

export default function SellListingSuccessScreen({ navigation, route }) {
  const listing = route?.params?.listing || null;
  const outcome = route?.params?.outcome || 'PUBLISHED';
  const head = HEAD[outcome] || HEAD.PUBLISHED;
  const shortId = listing?.id ? String(listing.id).replace(/-/g, '').slice(0, 10).toUpperCase() : null;
  const status = listing?._status || 'ACTIVE';

  return (
    <SellScreen title="Listing" onBack={() => navigation.goBack()}>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <View style={{ height: 60, width: 60, borderRadius: 30, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}>
          <CircleCheck size={34} color={C.green} />
        </View>
        <Text style={{ fontSize: rf(19), fontWeight: '800', color: C.text, marginTop: 12 }}>{head.title}</Text>
        <Text style={{ fontSize: rf(12.5), color: C.muted, marginTop: 4, textAlign: 'center' }}>{head.sub}</Text>
      </View>

      {listing ? (
        <Card style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Thumb uri={listingImage(listing)} size={64} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text numberOfLines={2} style={{ fontSize: rf(13.5), fontWeight: '800', color: C.text }}>{listing.title}</Text>
              <Text numberOfLines={1} style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{listingSub(listing)}</Text>
              <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.teal, marginTop: 3 }}>{listing.price != null ? money(listing.price) : 'No price'}</Text>
            </View>
            <StatusPill status={status} />
          </View>
          {shortId ? (
            <View style={{ flexDirection: 'row', marginTop: 10, backgroundColor: C.field, borderRadius: 10, padding: 10 }}>
              <Text style={{ fontSize: rf(12), color: C.muted }}>Listing ID</Text>
              <Text selectable style={{ flex: 1, textAlign: 'right', fontSize: rf(12), fontWeight: '800', color: C.text }}>#{shortId}</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Exactly three next steps, icon over label. */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        {[
          { label: 'My Listings', Icon: LayoutList, onPress: () => navigation.replace('SellMyListings', { initialStatus: status === 'DRAFT' ? 'DRAFT' : 'ACTIVE' }) },
          { label: 'View Listing', Icon: Eye, disabled: !listing?.id, onPress: () => navigation.navigate('MarketplaceListingDetails', { productId: listing.id, listing }) },
          { label: 'Back to Sell Home', Icon: House, onPress: () => navigation.popTo('OwnerTabs', { screen: 'Sell' }) },
        ].map(({ label, Icon, onPress, disabled }) => (
          <Pressable key={label} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
            className="active:opacity-80"
            style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF', opacity: disabled ? 0.45 : 1 }}>
            <View style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={19} color={C.green} />
            </View>
            <Text style={{ fontSize: rf(12), fontWeight: '800', color: C.text, marginTop: 6 }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </SellScreen>
  );
}
