import React, { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { addToCart } from '../../api/marketplace';
import { listingConditionLabel, listingCustomerName, listingPriceLabel } from '../../api/nearbyListings';
import { getBrands, getDeviceCategories } from '../../api/masterData';
import { normalizeDeviceImageUrl } from '../../utils/images';
import { notify } from '../../components/confirm';

// GGFIX palette — green #09AD2A, ink #1E1E1E, white, neutrals #F8F8F8/#F3F3F3.
const PALETTE = {
  primary: '#09AD2A',
  primaryDark: '#078F23',
  mint: '#EAF8EC',
  text: '#1E1E1E',
  muted: '#6B6B6B',
  border: '#E6E6E6',
  soft: '#F3F3F3',
  page: '#F8F8F8',
  card: '#FFFFFF',
  danger: '#DC2626',
  amberDark: '#B45309',
  amberLight: '#FEF3C7',
};

const titleCase = (v) => String(v || '').toLowerCase().replace(/(^|[\s_])([a-z])/g, (_, sp, ch) => `${sp === '_' ? ' ' : sp}${ch.toUpperCase()}`);

function formatListedOn(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

/**
 * Shop-owner-side detail page for a marketplace Buy listing.
 *
 * Accepts the listing on `route.params.listing` (full object from
 * /marketplace/buy/nearby) so we don't need a separate GET-by-id endpoint.
 * Hero image, price (or "Awaiting your quote" for customer requests), spec
 * rows, refund/warranty pills, and the contact / quote bottom actions.
 */
export default function OwnerBuyListingDetailsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const listing = route.params?.listing || {};
  const isCustomer = listing.sellerType === 'CUSTOMER';
  const priceNum = listing.expectedPrice != null ? Number(listing.expectedPrice) : null;
  const isAwaitingQuote = priceNum != null && priceNum === 0;

  // Catalog products (shop inventory / spare parts) can go in the cart. Peer
  // sell listings can't — they route to the contact / quote actions instead.
  const isProduct = listing.source === 'product' && !!listing.id;
  const [adding, setAdding] = useState(false);
  // In-page explanation when an action can't complete (see callSeller / sendQuote).
  const [blocked, setBlocked] = useState(null); // { icon, title, message }

  // Category + brand names for the listing's categoryId / brandId. The Buy
  // screen passes the ones it already loaded; otherwise (e.g. opened from
  // Home) read them from the same master-data lists.
  const [names, setNames] = useState({ category: listing.categoryName || null, brand: listing.brandName || null });
  useEffect(() => {
    let cancelled = false;
    const needCat = !names.category && listing.categoryId;
    const needBrand = !names.brand && listing.brandId;
    if (!needCat && !needBrand) return undefined;
    (async () => {
      const [cats, brands] = await Promise.all([
        needCat ? getDeviceCategories().catch(() => []) : Promise.resolve([]),
        needBrand ? getBrands().catch(() => []) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setNames((n) => ({
        category: n.category || (Array.isArray(cats) ? cats : []).find((c) => c.id === listing.categoryId)?.name || null,
        brand: n.brand || (Array.isArray(brands) ? brands : []).find((b) => b.id === listing.brandId)?.name || null,
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.categoryId, listing.brandId]);

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

  // Seller shown on the page: the customer's own name (listingCustomerName —
  // "Unknown Customer" while the API sends none) or the shop's name.
  const sellerName = isCustomer ? listingCustomerName(listing) : (listing.shopName || 'Shop');
  const conditionText = listingConditionLabel(listing.condition) || 'Good';
  const priceText = listingPriceLabel(listing);
  const area = [listing.city, listing.state, listing.pincode].filter(Boolean).join(', ');
  const listedOn = formatListedOn(listing.createdAt);
  const listingRef = listing.id ? `#${String(listing.id).split('-')[0].toUpperCase()}` : null;

  // The listing's phone, when the API provides one. Customer listings don't
  // carry the customer's number today.
  const contactPhone = listing.contactPhone || listing.sellerPhone || null;

  const dial = (phone) => {
    const tel = String(phone).replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${tel}`).catch(() => {
      notify('Could not start the call', `Dial ${phone} manually.`, { preset: 'error' });
    });
  };

  // Dials when the listing has a number; otherwise says why, on the page
  // (a toast was easy to miss and read as "the button does nothing").
  const callSeller = () => {
    if (contactPhone) { dial(contactPhone); return; }
    setBlocked({
      icon: 'call-outline',
      title: isCustomer ? "Customer's number isn't shared" : "Shop's number isn't available",
      message: isCustomer
        ? "This listing doesn't include the customer's phone number, so the call can't be started from the app. It will dial automatically once the listing carries a number."
        : "This shop listing doesn't include a phone number.",
    });
  };

  // Quotes are sent against the listing's Sell Order (/sell-orders/{id}/quotations)
  // and this listing doesn't carry that id — so it is not guessed from other
  // fields; the sheet says exactly what's missing instead.
  const sendQuote = () => {
    setBlocked({
      icon: 'pricetag-outline',
      title: "Quote can't be sent yet",
      message: "This listing isn't linked to its sell order, which quotes are sent against. Once the listing includes that link (sellOrderId), this button will open the quote form.",
    });
  };

  const orderNow = () => {
    if (contactPhone) { dial(contactPhone); return; }
    callSeller();
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={PALETTE.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {listing.productName || 'Listing Details'}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 110 + insets.bottom }}>
        {/* Hero — white card so the product photos (shot on white) blend in. */}
        <View style={styles.hero}>
          {listing.productImage ? (
            <Image source={{ uri: normalizeDeviceImageUrl(listing.productImage) }} style={styles.heroImage} resizeMode="contain" />
          ) : (
            <Ionicons name="phone-portrait-outline" size={80} color="#D6D6D6" />
          )}
          {isAwaitingQuote ? (
            <View style={[styles.priceBar, { backgroundColor: PALETTE.amberLight }]}>
              <Ionicons name="time-outline" size={13} color={PALETTE.amberDark} />
              <Text style={[styles.priceBarText, { color: PALETTE.amberDark }]}>Awaiting your quote</Text>
            </View>
          ) : priceNum != null && priceNum > 0 ? (
            <View style={[styles.priceBar, { backgroundColor: PALETTE.mint }]}>
              <Text style={[styles.priceBarText, { color: PALETTE.primaryDark, fontSize: 13 }]}>
                ₹{priceNum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Every field the listing carries, grouped. A row shows only when the
            API has a value for it. */}
        <View style={styles.card}>
          <Text style={styles.modelName}>{listing.productName || 'Listing'}</Text>
          <Text style={styles.groupTitle}>DEVICE DETAILS</Text>
          {names.category ? <SpecRow icon="grid-outline" label="Category" value={names.category} /> : null}
          {names.brand ? <SpecRow icon="pricetags-outline" label="Brand" value={names.brand} /> : null}
          <SpecRow icon="phone-portrait-outline" label="Condition" value={conditionText} />
          {listing.description ? (
            <SpecRow icon="information-circle-outline" label="Specs" value={listing.description} last />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.groupTitle}>PRICE &amp; SELLER</Text>
          {priceText ? (
            <SpecRow icon="cash-outline" label="Price" value={priceText} valueColor={isAwaitingQuote ? PALETTE.amberDark : PALETTE.primaryDark} />
          ) : null}
          <SpecRow icon={isCustomer ? 'person-outline' : 'storefront-outline'} label="Sold by" value={sellerName} />
          <SpecRow icon="people-outline" label="Seller type" value={isCustomer ? 'Customer' : 'Shop'} last />
        </View>

        <View style={styles.card}>
          <Text style={styles.groupTitle}>LOCATION</Text>
          {listing.address ? <SpecRow icon="home-outline" label="Address" value={listing.address} /> : null}
          <SpecRow
            icon="location-outline"
            label="Area"
            value={area || '—'}
            onPress={openMap}
            actionLabel="View on map"
            last={listing.distanceKm == null}
          />
          {listing.distanceKm != null ? (
            <SpecRow icon="navigate-outline" label="Distance" value={`${Number(listing.distanceKm).toFixed(1)} km away`} last />
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.groupTitle}>LISTING</Text>
          {listing.status ? <SpecRow icon="checkmark-circle-outline" label="Status" value={titleCase(listing.status)} /> : null}
          {listedOn ? <SpecRow icon="calendar-outline" label="Listed on" value={listedOn} /> : null}
          {listingRef ? <SpecRow icon="barcode-outline" label="Listing ID" value={listingRef} last /> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={styles.warrantyPill}>
            <Ionicons name="calendar-outline" size={14} color={PALETTE.primary} />
            <Text style={styles.warrantyText} numberOfLines={1}>15 Days Refund*</Text>
          </View>
          <View style={styles.warrantyPill}>
            <Ionicons name="shield-checkmark-outline" size={14} color={PALETTE.primary} />
            <Text style={styles.warrantyText} numberOfLines={1}>Upto 06 Months Warranty*</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>* Contact the seller after placing your order.</Text>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
        {isProduct ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={onAddToCart} disabled={adding} activeOpacity={0.85}>
            <Ionicons name="cart-outline" size={17} color="#FFFFFF" />
            <Text style={styles.primaryText}>{adding ? 'Adding…' : 'Add to Cart'}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.outlineBtn} onPress={callSeller} activeOpacity={0.8} accessibilityRole="button">
              <Ionicons name="call-outline" size={16} color={PALETTE.primaryDark} />
              <Text style={styles.outlineText} numberOfLines={1}>
                {contactPhone ? 'Contact' : (isCustomer ? 'Call Customer' : 'Call Shop')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={isAwaitingQuote ? sendQuote : orderNow}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Ionicons name={isAwaitingQuote ? 'pricetag-outline' : 'bag-check-outline'} size={16} color="#FFFFFF" />
              <Text style={styles.primaryText}>{isAwaitingQuote ? 'Send Quote' : 'Order Now'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <BlockedSheet info={blocked} onClose={() => setBlocked(null)} bottomInset={insets.bottom} />
    </SafeAreaView>
  );
}

function SpecRow({ icon, label, value, valueColor, onPress, actionLabel, last }) {
  return (
    <View style={[styles.specRow, last ? null : styles.specRowLine]}>
      <View style={styles.specIconWrap}>
        <Ionicons name={icon} size={16} color={PALETTE.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={[styles.specValue, valueColor ? { color: valueColor, fontWeight: '800' } : null]}>{value}</Text>
      </View>
      {onPress ? (
        <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.specActionBtn}>
          <Text style={styles.specAction}>{actionLabel || 'View'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Bottom sheet that says why an action can't complete, with one OK. */
function BlockedSheet({ info, onClose, bottomInset }) {
  return (
    <Modal visible={!!info} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(bottomInset, 12) + 12 }]} onPress={() => {}}>
          <View style={styles.sheetIcon}>
            <Ionicons name={info?.icon || 'information-circle-outline'} size={22} color={PALETTE.amberDark} />
          </View>
          <Text style={styles.sheetTitle}>{info?.title}</Text>
          <Text style={styles.sheetMessage}>{info?.message}</Text>
          <TouchableOpacity style={[styles.primaryBtn, { flex: 0, marginTop: 16 }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.primaryText}>OK</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
    backgroundColor: PALETTE.card,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: PALETTE.text },
  hero: {
    height: 240,
    backgroundColor: PALETTE.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.soft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroImage: { width: '80%', height: '86%' },
  priceBar: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  priceBarText: { fontSize: 12, fontWeight: '800' },
  card: {
    backgroundColor: PALETTE.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PALETTE.soft,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
    marginTop: 10,
  },
  modelName: { fontSize: 15, fontWeight: '800', color: PALETTE.text, marginBottom: 8 },
  groupTitle: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, color: PALETTE.muted, marginBottom: 2 },
  specRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  specRowLine: { borderBottomWidth: 1, borderBottomColor: PALETTE.soft },
  specIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: PALETTE.mint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  specLabel: { fontSize: 11, color: PALETTE.muted, marginBottom: 1 },
  specValue: { fontSize: 13, fontWeight: '600', color: PALETTE.text },
  specActionBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: PALETTE.mint },
  specAction: { fontSize: 11, fontWeight: '700', color: PALETTE.primaryDark },
  warrantyPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PALETTE.card,
    borderWidth: 1,
    borderColor: PALETTE.soft,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
  },
  warrantyText: { flexShrink: 1, fontSize: 11, fontWeight: '700', color: PALETTE.primaryDark },
  disclaimer: { fontSize: 11, color: PALETTE.danger, textAlign: 'center', marginTop: 12 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: PALETTE.card,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border,
  },
  outlineBtn: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: PALETTE.primary,
    backgroundColor: PALETTE.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  outlineText: { fontSize: 13, fontWeight: '800', color: PALETTE.primaryDark },
  primaryBtn: {
    flex: 1,
    minHeight: 46,
    backgroundColor: PALETTE.primary,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(30,30,30,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: PALETTE.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sheetIcon: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: PALETTE.amberLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: PALETTE.text },
  sheetMessage: { fontSize: 13, color: PALETTE.muted, marginTop: 6, lineHeight: 19 },
});
