import React, { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { Smartphone, Store, User } from 'lucide-react-native';
import { DashboardSection } from './DashboardSection';
import { Touchable } from './theme';
import { normalizeDeviceImageUrl } from '../../utils/images';
import { listingPriceLabel, listingSellerLabel, listingSpecLine } from '../../api/nearbyListings';

const G = '#035C6C';
const G_LIGHT = '#E5F3F5';
const DARK = '#111111';
const MUTED = '#6B7280';

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

function DealImage({ uri, tag }: { uri?: string | null; tag?: string | null }) {
  const [broken, setBroken] = useState(false);
  const src = uri ? normalizeDeviceImageUrl(uri) : null;
  return (
    <View style={{ aspectRatio: 1.1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      {src && !broken ? (
        <Image source={{ uri: src }} style={{ width: '74%', height: '74%' }} resizeMode="contain" onError={() => setBroken(true)} />
      ) : (
        <Smartphone size={28} color={G} />
      )}
      {tag ? (
        <View style={{ position: 'absolute', top: 0, left: 0, maxWidth: '86%', backgroundColor: G, paddingHorizontal: 7, paddingVertical: 3, borderBottomRightRadius: 10 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }} numberOfLines={1}>{tag}</Text>
        </View>
      ) : null}
      <View pointerEvents="none" style={{ position: 'absolute', right: 5, bottom: 5, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: G, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ color: G, fontSize: 10, fontWeight: '800' }}>VIEW</Text>
      </View>
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
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                overflow: 'hidden',
              }}
              pressedStyle={{ opacity: 0.85 }}
            >
              {/* Same tile as a Jobs card: image panel (condition tag · VIEW) on top. */}
              <DealImage uri={d.productImage} tag={d.condition || null} />
              <View style={{ paddingHorizontal: 7, paddingBottom: 7 }}>
                {price ? (
                  <View style={{ flexDirection: 'row', marginTop: 6 }}>
                    <View style={{ backgroundColor: quote ? G_LIGHT : G, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '100%' }}>
                      <Text style={{ fontSize: quote ? 9 : 12, fontWeight: '800', color: quote ? G : '#FFFFFF' }} numberOfLines={1}>{price}</Text>
                    </View>
                  </View>
                ) : null}
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '800', color: DARK, marginTop: 4 }} numberOfLines={2}>
                  {d.productName || 'Device'}
                </Text>
                {spec ? (
                  <Text style={{ fontSize: 10.5, color: MUTED, marginTop: 1 }} numberOfLines={1}>{spec}</Text>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  {isCustomer ? <User size={10} color={MUTED} /> : <Store size={10} color={MUTED} />}
                  <Text style={{ flex: 1, fontSize: 10.5, color: MUTED, marginLeft: 3 }} numberOfLines={1}>
                    {listingSellerLabel(d)}
                  </Text>
                </View>
              </View>
            </Touchable>
          );
        })}
      </ScrollView>
    </View>
  );
}
