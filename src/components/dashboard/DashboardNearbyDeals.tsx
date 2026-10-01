import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { ChevronRight, Smartphone, Store, User } from 'lucide-react-native';
import { DashboardSection } from './DashboardSection';
import { Touchable } from './theme';
import { normalizeDeviceImageUrl } from '../../utils/images';
import { listingPriceLabel, listingSellerLabel, listingSpecLine } from '../../api/nearbyListings';

const G = '#09AD2A';
const G_LIGHT = '#EAF8EC';
const DARK = '#1E1E1E';
const MUTED = '#6B6B6B';
const LIGHT = '#F3F3F3';

export interface NearbyDeal {
  _key: string;
  id?: string;
  productName?: string | null;
  productImage?: string | null;
  condition?: string | null;
  description?: string | null;
  sellerType?: string | null;
  shopName?: string | null;
  expectedPrice?: number | string | null;
  [k: string]: unknown;
}

interface Props {
  deals: NearbyDeal[];
  pad: number;
  cardWidth: number;
  gap: number;
  onOpen: (deal: NearbyDeal) => void;
  onViewAll: () => void;
}

function DealImage({ uri }: { uri?: string | null }) {
  const [broken, setBroken] = useState(false);
  const src = uri ? normalizeDeviceImageUrl(uri) : null;
  return (
    <View style={{ height: 88, borderRadius: 12, backgroundColor: '#F8F8F8', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {src && !broken ? (
        <Image source={{ uri: src }} style={{ width: '86%', height: '86%' }} resizeMode="contain" onError={() => setBroken(true)} />
      ) : (
        <Smartphone size={30} color={G} />
      )}
    </View>
  );
}

/**
 * Home "Nearby Deals" — a compact preview of the Buy screen's nearby listings
 * (same data and order as its "Trending Near You" rail). Tapping a card opens
 * the existing OwnerBuyListingDetails screen; View All opens Buy.
 */
export function DashboardNearbyDeals({ deals, pad, cardWidth, gap, onOpen, onViewAll }: Props) {
  if (!deals.length) return null;
  return (
    <View>
      <DashboardSection title="Nearby Deals" action="View All" onAction={onViewAll} pad={pad} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, gap, paddingBottom: 4 }}>
        {deals.map((d) => {
          const spec = listingSpecLine(d);
          const price = listingPriceLabel(d);
          const quote = price === 'Open for quotation';
          const isCustomer = d.sellerType === 'CUSTOMER';
          return (
            <Touchable
              key={d._key}
              onPress={() => onOpen(d)}
              accessibilityRole="button"
              accessibilityLabel={`${d.productName || 'Device'}${spec ? `, ${spec}` : ''}, ${listingSellerLabel(d)}`}
              style={{
                width: cardWidth,
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: LIGHT,
                padding: 8,
                shadowColor: '#000000',
                shadowOpacity: 0.04,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 1,
              }}
              pressedStyle={{ opacity: 0.85 }}
            >
              <DealImage uri={d.productImage} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: DARK, marginTop: 7 }} numberOfLines={1}>
                {d.productName || 'Device'}
              </Text>
              {spec ? (
                <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }} numberOfLines={1}>{spec}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                {isCustomer ? <User size={11} color={MUTED} /> : <Store size={11} color={MUTED} />}
                <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: DARK, marginLeft: 4 }} numberOfLines={1}>
                  {listingSellerLabel(d)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                {price ? (
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {quote ? (
                      <View style={{ alignSelf: 'flex-start', backgroundColor: G_LIGHT, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: G }} numberOfLines={1}>{price}</Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 13, fontWeight: '800', color: G }} numberOfLines={1}>{price}</Text>
                    )}
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: G_LIGHT, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                  <ChevronRight size={15} color={G} strokeWidth={2.4} />
                </View>
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}
