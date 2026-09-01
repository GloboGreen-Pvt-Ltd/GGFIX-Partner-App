import React, { useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addToCart } from '../../api/marketplace';
import { normalizeDeviceImageUrl } from '../../utils/images';
import { notify } from '../../components/confirm';

const PALETTE = {
  primary: '#004C40',
  accentOrange: '#F59E0B',
  text: '#172117',
  muted: '#667066',
  border: '#E2E8E2',
  bg: '#F7FAF7',
  success: '#004C40',
  awaiting: '#004C40',
  awaitingBg: '#F0F8EF',
};

/**
 * Shop-owner-side detail page for a marketplace Buy listing.
 *
 * Accepts the listing on `route.params.listing` (full object from
 * /marketplace/buy/nearby) so we don't need a separate GET-by-id endpoint.
 * Renders the Figma "Buying Details" layout: hero image, price (or "Awaiting
 * your quote" for customer requests), spec rows, refund/warranty pill, and the
 * Contact + Order Now bottom actions.
 */
export default function OwnerBuyListingDetailsScreen({ navigation, route }) {
  const listing = route.params?.listing || {};
  const isCustomer = listing.sellerType === 'CUSTOMER';
  const priceNum = listing.expectedPrice != null ? Number(listing.expectedPrice) : null;
  const isAwaitingQuote = priceNum != null && priceNum === 0;

  // Catalog products (shop inventory / spare parts) can go in the cart. Peer
  // sell listings can't — they route to Contact / Order Now instead.
  const isProduct = listing.source === 'product' && !!listing.id;
  const [adding, setAdding] = useState(false);

  const onAddToCart = async () => {
    if (!isProduct || adding) return;
    setAdding(true);
    try {
      await addToCart(listing.id, 1);
      notify('Added to cart', `${listing.productName || 'Item'} is in your cart.`, { preset: 'done' });
    } catch (e) {
      notify('Could not add', e.message || 'Please try again.', { preset: 'error' });
    } finally {
      setAdding(false);
    }
  };

  // The contact phone is supplied either by the listing (shop seller — we
  // hydrate it via the BuyScreen card) or by the listing's seller record.
  // For customer sellers we don't yet expose the phone, so fall back to a
  // "no phone" Alert.
  const contactPhone = listing.contactPhone || listing.sellerPhone || null;
  const contactName = listing.sellerType === 'SHOP'
    ? (listing.shopName || 'Shop')
    : 'Customer';

  const callSeller = () => {
    if (!contactPhone) {
      return;
    }
    Linking.openURL(`tel:${contactPhone}`).catch(() => {});
  };

  const openMap = () => {
    const q = encodeURIComponent(
      [listing.address, listing.city, listing.state, listing.pincode].filter(Boolean).join(', ')
      || 'Cuddalore',
    );
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${q}`,
      default: `https://maps.google.com/?q=${q}`,
    });
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={20} color={PALETTE.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {listing.productName || 'Listing Details'}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={styles.hero}>
          {listing.productImage ? (
            <Image source={{ uri: normalizeDeviceImageUrl(listing.productImage) }} style={styles.heroImage} resizeMode="contain" />
          ) : (
            <Ionicons name="phone-portrait-outline" size={88} color="#CBD5CB" />
          )}
          <View style={styles.priceBar}>
            {isAwaitingQuote ? (
              <Text style={styles.awaitingPill}>Awaiting your quote</Text>
            ) : priceNum != null && priceNum > 0 ? (
              <Text style={styles.priceText}>
                ₹{priceNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.modelName}>{listing.productName || 'Listing'}</Text>

          <SpecRow
            icon="phone-portrait-outline"
            label="Condition"
            value={listing.condition || 'Good'}
          />
          {listing.description ? (
            <SpecRow
              icon="information-circle-outline"
              label="Specs"
              value={listing.description}
            />
          ) : null}
          {isCustomer ? (
            <SpecRow
              icon="person-outline"
              label="Sold by"
              value="Customer"
            />
          ) : (
            <SpecRow
              icon="storefront-outline"
              label="Sold by"
              value={listing.shopName || 'Shop'}
            />
          )}
          <SpecRow
            icon="location-outline"
            label="Location"
            value={[listing.city, listing.state, listing.pincode].filter(Boolean).join(', ') || '—'}
            onPress={openMap}
            actionLabel="View on map"
          />
          {listing.distanceKm != null ? (
            <SpecRow
              icon="navigate-outline"
              label="Distance"
              value={`${Number(listing.distanceKm).toFixed(1)} km`}
            />
          ) : null}
        </View>

        <View style={[styles.section, { flexDirection: 'row', gap: 8 }]}>
          <View style={styles.warrantyPill}>
            <Ionicons name="calendar-outline" size={14} color={PALETTE.success} />
            <Text style={styles.warrantyText}>15 Days Refund*</Text>
          </View>
          <View style={styles.warrantyPill}>
            <Ionicons name="shield-checkmark-outline" size={14} color={PALETTE.success} />
            <Text style={styles.warrantyText}>Upto 06 Months Warranty*</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.disclaimer}>
            * Contact the seller after placing your order.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {isProduct ? (
          <TouchableOpacity style={styles.cartBtn} onPress={onAddToCart} disabled={adding} activeOpacity={0.9}>
            <Ionicons name="cart-outline" size={17} color="#FFFFFF" />
            <Text style={styles.cartText}>{adding ? 'Adding…' : 'Add to Cart'}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.contactBtn} onPress={callSeller} disabled={!contactPhone}>
              <Ionicons name="call-outline" size={16} color={PALETTE.primary} />
              <Text style={styles.contactText}>
                {contactPhone ? 'Contact' : `Call ${contactName}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.orderBtn}
              onPress={() => {
                // Order Now currently routes to the seller via phone — quotation
                // flow for customer sells lands here too.
                if (contactPhone) {
                  Linking.openURL(`tel:${contactPhone}`).catch(() => {});
                }
              }}
            >
              <Text style={styles.orderText}>{isAwaitingQuote ? 'Send Quote' : 'Order Now'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function SpecRow({ icon, label, value, onPress, actionLabel }) {
  return (
    <View style={styles.specRow}>
      <View style={styles.specIconWrap}>
        <Ionicons name={icon} size={16} color={PALETTE.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={styles.specValue}>{value}</Text>
      </View>
      {onPress ? (
        <TouchableOpacity onPress={onPress}>
          <Text style={styles.specAction}>{actionLabel || 'View'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
    backgroundColor: '#FFFFFF',
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: PALETTE.text },
  hero: {
    height: 260,
    backgroundColor: PALETTE.bg,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroImage: { width: '70%', height: '85%' },
  priceBar: {
    position: 'absolute',
    bottom: 12,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: '#172117',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  priceText: { fontSize: 14, fontWeight: '800', color: PALETTE.text },
  awaitingPill: {
    fontSize: 12,
    fontWeight: '800',
    color: PALETTE.awaiting,
    backgroundColor: PALETTE.awaitingBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
  },
  modelName: { fontSize: 15, fontWeight: '700', color: PALETTE.text, marginBottom: 8 },
  specRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  specIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F8EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  specLabel: { fontSize: 11, color: PALETTE.muted, marginBottom: 1 },
  specValue: { fontSize: 13, fontWeight: '600', color: PALETTE.text },
  specAction: { fontSize: 12, fontWeight: '700', color: PALETTE.primary },
  warrantyPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F8EF',
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  warrantyText: { fontSize: 11, fontWeight: '700', color: PALETTE.success },
  disclaimer: { fontSize: 11, color: '#DC2626', textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: PALETTE.border,
  },
  contactBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PALETTE.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactText: { fontSize: 13, fontWeight: '700', color: PALETTE.primary },
  orderBtn: {
    flex: 1,
    backgroundColor: PALETTE.accentOrange,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cartBtn: {
    flex: 1,
    backgroundColor: PALETTE.success,
    paddingVertical: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cartText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
