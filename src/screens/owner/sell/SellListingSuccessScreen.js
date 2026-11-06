import React from 'react';
import { Text, View } from 'react-native';
import { CircleCheck, Eye, LayoutList, Plus } from 'lucide-react-native';
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
      <View style={{ alignItems: 'center', marginTop: 20 }}>
        <View style={{ height: 72, width: 72, borderRadius: 36, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center' }}>
          <CircleCheck size={40} color={C.green} />
        </View>
        <Text style={{ fontSize: rf(19), fontWeight: '800', color: C.text, marginTop: 12 }}>{head.title}</Text>
        <Text style={{ fontSize: rf(12.5), color: C.muted, marginTop: 4, textAlign: 'center' }}>{head.sub}</Text>
      </View>

      {listing ? (
        <Card style={{ marginTop: 20 }}>
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

      <View style={{ gap: 10, marginTop: 20 }}>
        {listing?.id ? (
          <PrimaryButton title="View Listing" icon={Eye} onPress={() => navigation.navigate('MarketplaceListingDetails', { productId: listing.id, listing })} />
        ) : null}
        <PrimaryButton variant="outline" title="My Listings" icon={LayoutList} onPress={() => navigation.replace('SellMyListings', { initialStatus: status === 'DRAFT' ? 'DRAFT' : 'ACTIVE' })} />
        <PrimaryButton variant="soft" title="Add Another Listing" icon={Plus} onPress={() => navigation.replace('SellListingType')} />
        <PrimaryButton variant="soft" title="Back to Sell Home" onPress={() => navigation.popTo('OwnerTabs', { screen: 'Sell' })} />
      </View>
    </SellScreen>
  );
}
