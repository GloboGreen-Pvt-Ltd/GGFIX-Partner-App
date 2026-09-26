import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import {
  ChevronLeft,
  Share2,
  Store,
  Phone,
  User,
  MapPin,
  ShieldCheck,
  Camera,
  ScanLine,
  Pencil,
  Eye,
  Leaf,
} from 'lucide-react-native';
import { fetchMe } from '../../api/auth';
import { getSession } from '../../auth/session';
import { getOwnerKycDocuments } from '../../api/shops';
import { notify } from '../../components/confirm';
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — same values used across the rest of the app's redesigned screens.
const ACCENT = '#004C40';
const PRIMARY = '#006B57';
const BRIGHT = '#00A86B';
const MINT = '#DFF7EC';
const SOFT_MINT = '#F2FBF7';
const PAGE_BG = '#F8FCFA';
const CARD_BG = '#FFFFFF';
const BORDER = '#DCEBE5';
const TEXT_PRIMARY = '#102019';
const TEXT_SECONDARY = '#667085';

const cardShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
};

const softShadow = {
  shadowColor: '#0B1F14',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

function joinAddress(shop) {
  if (!shop) return '';
  // The shop object can come from different sources (auth/me, getSession,
  // marketplace), each with slightly different field names. Coalesce all the
  // common spellings into a single readable line.
  const parts = [
    shop.street || shop.addressLine || shop.address,
    shop.area || shop.taluk,
    shop.district || shop.city,
    shop.state,
    shop.pincode,
  ].filter((p) => p && String(p).trim());
  return parts.join(', ');
}

export default function OwnerQrCodeScreen({ navigation }) {
  const r = useResponsive();
  const capStyle = r.isTablet ? { width: Math.min(r.width - rs(32), 800), alignSelf: 'center' } : null;
  const [user, setUser] = useState(null);
  const [kycStatus, setKycStatus] = useState(null);
  // qrOnlyRef wraps ONLY the rendered QR image (white background + black
  // modules). Capturing this ref yields the QR by itself — no shop card,
  // no surrounding text — so Share sends a clean, scannable PNG.
  const qrOnlyRef = useRef(null);

  useEffect(() => {
    (async () => {
      try { setUser(await fetchMe()); }
      catch { try { setUser(await getSession()); } catch { setUser(null); } }
    })();
  }, []);

  // Same reviewed, admin-approved KYC signal MyAccountScreen/OwnerPersonalInfo
  // use for "Verified Owner" — owner-wide, not per-shop.
  useEffect(() => {
    (async () => {
      try {
        const kyc = await getOwnerKycDocuments();
        setKycStatus(kyc?.status || null);
      } catch {
        setKycStatus(null);
      }
    })();
  }, []);

  const ownerName  = user?.name || 'Shop Owner';
  const ownerPhone = user?.phone || '';
  const activeShop = user?.activeShop || user?.shops?.find?.((s) => s.isActive) || null;
  const shopName   = activeShop?.name || user?.shopName || 'Your Shop';
  // The auth-service ShopLocationView exposes the shop's contact number as
  // plain `mobile` (see DTO). Older code shapes also used `mobilePrimary` /
  // `phone` / `contactPhone`, so accept any of those for resilience.
  const shopPhone  = activeShop?.mobile
    || activeShop?.mobilePrimary
    || activeShop?.phone
    || activeShop?.contactPhone
    || '';
  const shopAddress = joinAddress(activeShop);
  const avatarUri  = user?.avatarUrl || activeShop?.frontImageUrl || null;
  const isVerified = kycStatus === 'APPROVED';

  // Payload encoded into the QR. Keep it scan-friendly: vCard-style is the
  // widest-compatible format because every modern camera app recognises it
  // and offers "Add to contacts". useMemo so we don't reshape the value
  // each render — QRCode regenerates when its `value` prop changes.
  const qrValue = useMemo(() => (
    'BEGIN:VCARD\nVERSION:3.0\n' +
    `FN:${shopName}\n` +
    `ORG:${shopName}\n` +
    (ownerName ? `N:${ownerName};;;;\n` : '') +
    (shopPhone ? `TEL;TYPE=WORK,VOICE:${shopPhone}\n` : '') +
    (ownerPhone ? `TEL;TYPE=CELL,VOICE:${ownerPhone}\n` : '') +
    (shopAddress ? `ADR;TYPE=WORK:;;${shopAddress.replace(/,\s*/g, ';')};;;;\n` : '') +
    'NOTE:Listed on GGfix\nEND:VCARD'
  ), [shopName, ownerName, ownerPhone, shopPhone, shopAddress]);

  // Share the QR image only. captureRef on qrOnlyRef pulls just the
  // white-on-black QR canvas; the surrounding card stays out of the captured
  // PNG. Falls back to a text Share.share() if either capture or
  // expo-sharing fails — the recipient still gets the contact details.
  const onShare = async () => {
    try {
      const uri = await captureRef(qrOnlyRef, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `${shopName} on GGfix`,
          UTI: 'public.png',
        });
        return;
      }
    } catch (_) { /* fall through to text share */ }
    try {
      await Share.share({
        message: `${shopName} on GGfix — scan my QR to view the shop.`,
        title: `${shopName} on GGfix`,
      });
    } catch (e) {
      notify('Share failed', e?.message || 'Try again');
    }
  };

  return (
    <View className="flex-1" style={{ backgroundColor: PAGE_BG }}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_BG} />

      <SafeAreaView edges={['top']} style={{ backgroundColor: PAGE_BG }}>
        {/* Header — decorative mint leaf shapes, same low-risk plain-View
            approximation used elsewhere in this app (no new SVG dependency). */}
        <View style={{ paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(12), overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: -rs(30), right: -rs(20), height: rs(140), width: rs(140), borderRadius: rs(70), backgroundColor: MINT, opacity: 0.6 }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: rs(30), right: rs(40), height: rs(70), width: rs(70), borderRadius: rs(35), backgroundColor: SOFT_MINT, opacity: 0.8 }} />

          <View style={[{ flexDirection: 'row', alignItems: 'center' }, capStyle]}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              hitSlop={6}
              style={{
                height: rs(36), width: rs(36), borderRadius: rs(18), marginRight: rs(10),
                alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF',
                borderWidth: 1, borderColor: BORDER,
              }}
            >
              <ChevronLeft size={rf(19)} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text className="font-extrabold" style={{ fontSize: rf(24), color: TEXT_PRIMARY }} numberOfLines={1}>
                My QR Code
              </Text>
              <Text style={{ fontSize: rf(12), color: TEXT_SECONDARY, marginTop: rs(2) }} numberOfLines={1}>
                Share your business with customers
              </Text>
            </View>
            <TouchableOpacity
              onPress={onShare}
              activeOpacity={0.8}
              className="flex-row items-center rounded-full"
              style={{ paddingHorizontal: rs(14), paddingVertical: rs(9), backgroundColor: MINT, borderWidth: 1, borderColor: BRIGHT, ...softShadow }}
            >
              <Share2 size={rf(13)} color={ACCENT} />
              <Text className="font-extrabold" style={{ marginLeft: rs(6), fontSize: rf(11), color: ACCENT, letterSpacing: 0.5 }}>
                SHARE
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: rs(16), paddingBottom: rs(32) }}
      >
        <View style={capStyle}>
        {/* Shop QR identity card */}
        <View
          className="flex-row items-center"
          style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(11), borderWidth: 1, borderColor: BORDER, overflow: 'hidden', ...cardShadow }}
        >
          {/* Decorative only — a faint leaf accent in the corner, never over content. */}
          <View pointerEvents="none" style={{ position: 'absolute', right: -rs(8), bottom: -rs(10), opacity: 0.14, transform: [{ rotate: '-18deg' }] }}>
            <Leaf size={rf(46)} color={BRIGHT} />
          </View>
          <View style={{ position: 'relative' }}>
            <View
              style={{
                padding: 3, borderRadius: rs(29), borderWidth: 1.5, borderColor: BRIGHT, borderStyle: 'dashed',
              }}
            >
              <View
                style={{
                  width: rs(48), height: rs(48), borderRadius: rs(24),
                  backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}
              >
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: rs(48), height: rs(48) }} />
                ) : (
                  <Text className="font-extrabold" style={{ fontSize: rf(17), color: ACCENT, letterSpacing: 1 }}>
                    {shopName.slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
            </View>
            {/* Visual affordance only — tapping goes to the real profile-photo
                editor, same as every other camera badge in this app. */}
            <TouchableOpacity
              onPress={() => navigation.navigate('OwnerPersonalInfo')}
              activeOpacity={0.85}
              style={{
                position: 'absolute', right: -rs(2), bottom: -rs(2),
                width: rs(22), height: rs(22), borderRadius: rs(11),
                backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#FFFFFF',
              }}
            >
              <Camera size={rf(11)} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View className="flex-1" style={{ marginLeft: rs(13) }}>
            <Text className="font-extrabold" style={{ fontSize: rf(10.5), color: PRIMARY, letterSpacing: 1 }}>
              SHOP QR
            </Text>
            <Text className="font-extrabold" style={{ fontSize: rf(16.5), color: TEXT_PRIMARY, marginTop: rs(1) }} numberOfLines={1}>
              {shopName}
            </Text>
            <Text style={{ fontSize: rf(11), color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
              Tap-to-scan business card
            </Text>
          </View>
          {isVerified ? (
            <View
              className="flex-row items-center rounded-full"
              style={{ paddingHorizontal: rs(10), paddingVertical: rs(7), backgroundColor: MINT }}
            >
              <ShieldCheck size={rf(12)} color={ACCENT} />
              <Text className="font-extrabold" style={{ marginLeft: rs(5), fontSize: rf(10.5), color: ACCENT }}>
                Verified Owner
              </Text>
            </View>
          ) : null}
        </View>

        {/* Main QR business card — the ENTIRE ViewShot region is what Share
            captures, so it carries the header bar, shop/owner name, QR, and
            footer, and reads as a proper business card rather than a bare QR. */}
        <View className="items-center" style={{ marginTop: rs(14) }}>
          <View
            style={{ borderRadius: rs(28), overflow: 'hidden', width: '100%', maxWidth: rs(360), borderWidth: 1, borderColor: BORDER, ...cardShadow }}
          >
            <ViewShot
              ref={qrOnlyRef}
              options={{ format: 'png', quality: 1 }}
              collapsable={false}
              style={{ backgroundColor: '#FFFFFF' }}
            >
              {/* Decorative only — faint corner leaves, well clear of the QR,
                  phone pill and instruction text below. */}
              <View pointerEvents="none" style={{ position: 'absolute', left: -rs(6), bottom: -rs(8), opacity: 0.1, transform: [{ rotate: '25deg' }] }}>
                <Leaf size={rf(34)} color={BRIGHT} />
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', right: -rs(6), bottom: -rs(8), opacity: 0.1, transform: [{ rotate: '-25deg' }] }}>
                <Leaf size={rf(34)} color={BRIGHT} />
              </View>

              {/* Scan-to-connect header */}
              <LinearGradient
                colors={[PRIMARY, ACCENT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ paddingVertical: rs(14), paddingHorizontal: rs(18), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <ScanLine size={rf(15)} color="#FFFFFF" />
                <Text className="text-white font-extrabold" style={{ marginLeft: rs(8), fontSize: rf(13), letterSpacing: 2 }}>
                  SCAN TO CONNECT
                </Text>
              </LinearGradient>

              {/* Shop + owner names */}
              <View style={{ paddingTop: rs(16), paddingHorizontal: rs(18), alignItems: 'center' }}>
                <Text className="font-extrabold text-center" style={{ fontSize: rf(20), color: TEXT_PRIMARY }} numberOfLines={2}>
                  {shopName}
                </Text>
                <Text className="font-semibold text-center" style={{ fontSize: rf(12.5), color: PRIMARY, marginTop: rs(2) }} numberOfLines={1}>
                  Owner · {ownerName}
                </Text>
              </View>

              {/* QR with a green corner-bracket frame */}
              <View style={{ alignItems: 'center', paddingHorizontal: rs(18), paddingTop: rs(16), paddingBottom: rs(6) }}>
                <View style={{ padding: rs(12), backgroundColor: '#FFFFFF', borderRadius: rs(18), borderWidth: 1.5, borderColor: BORDER }}>
                  <QRCode
                    value={qrValue}
                    size={rs(210)}
                    color={TEXT_PRIMARY}
                    backgroundColor="#FFFFFF"
                    ecl="M"
                  />
                  <CornerBracket pos="tl" />
                  <CornerBracket pos="tr" />
                  <CornerBracket pos="bl" />
                  <CornerBracket pos="br" />
                </View>
              </View>

              {/* Instruction + phone pill */}
              <View style={{ paddingHorizontal: rs(18), paddingTop: rs(8), paddingBottom: rs(18), alignItems: 'center' }}>
                <View className="flex-row items-start" style={{ maxWidth: rs(260) }}>
                  <Camera size={rf(13)} color={TEXT_SECONDARY} style={{ marginTop: rs(1), marginRight: rs(6) }} />
                  <Text className="text-center flex-1" style={{ fontSize: rf(11.5), color: TEXT_SECONDARY, lineHeight: rf(16) }}>
                    Point your camera at this QR to add {shopName} to your contacts.
                  </Text>
                </View>
                {shopPhone ? (
                  <View
                    className="flex-row items-center rounded-full"
                    style={{ marginTop: rs(12), paddingHorizontal: rs(14), paddingVertical: rs(9), backgroundColor: MINT }}
                  >
                    <Phone size={rf(12)} color={ACCENT} />
                    <Text className="font-extrabold" style={{ marginLeft: rs(7), fontSize: rf(13), color: ACCENT }}>
                      {shopPhone}
                    </Text>
                  </View>
                ) : null}
              </View>
            </ViewShot>
          </View>
        </View>

        {/* Owner + Shop details */}
        <View
          style={{ backgroundColor: CARD_BG, borderRadius: rs(20), padding: rs(12), marginTop: rs(14), borderWidth: 1, borderColor: BORDER, ...cardShadow }}
        >
          <DetailSection
            label="OWNER"
            Icon={User}
            title={ownerName}
            sub={ownerPhone}
            subIcon={Phone}
            actionLabel="EDIT"
            ActionIcon={Pencil}
            onAction={() => navigation.navigate('OwnerPersonalInfo')}
          />
          <View style={{ height: 1, backgroundColor: BORDER, marginVertical: rs(13) }} />
          <DetailSection
            label="SHOP"
            Icon={Store}
            title={shopName}
            sub={shopAddress || undefined}
            subIcon={MapPin}
            actionLabel="VIEW SHOP"
            ActionIcon={Eye}
            onAction={() => navigation.navigate('OwnerShopInfo')}
            last
          />
        </View>

        {/* Bottom brand message */}
        <View className="flex-row items-center" style={{ marginTop: rs(22), marginBottom: rs(8) }}>
          <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
          <Text className="font-extrabold" style={{ marginHorizontal: rs(10), fontSize: rf(9.5), letterSpacing: 1.2, color: PRIMARY }}>
            LOCAL BUSINESS · BETTER TOGETHER
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

function DetailSection({ label, Icon, title, sub, subIcon: SubIcon, actionLabel, ActionIcon, onAction, last }) {
  return (
    <View className="flex-row items-center">
      <View>
        <Text className="font-extrabold" style={{ fontSize: rf(9.5), color: PRIMARY, letterSpacing: 1, marginBottom: rs(8) }}>
          {label}
        </Text>
        <View className="flex-row items-center">
          <View className="items-center justify-center" style={{ width: rs(38), height: rs(38), borderRadius: rs(19), backgroundColor: MINT, marginRight: rs(11) }}>
            <Icon size={rf(17)} color={ACCENT} />
          </View>
          <View>
            <Text className="font-extrabold" style={{ fontSize: rf(14.5), color: TEXT_PRIMARY }} numberOfLines={1}>
              {title}
            </Text>
            {sub ? (
              <View className="flex-row items-center" style={{ marginTop: rs(2) }}>
                <SubIcon size={rf(11)} color={TEXT_SECONDARY} />
                <Text style={{ marginLeft: rs(5), fontSize: rf(11.5), color: TEXT_SECONDARY }} numberOfLines={1}>
                  {sub}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        onPress={onAction}
        activeOpacity={0.85}
        className="flex-row items-center rounded-full"
        style={{ paddingHorizontal: rs(12), paddingVertical: rs(8), backgroundColor: MINT }}
      >
        <ActionIcon size={rf(12)} color={ACCENT} />
        <Text className="font-extrabold" style={{ marginLeft: rs(5), fontSize: rf(10.5), color: ACCENT }}>
          {actionLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// Tiny green L-shaped bracket painted at each corner of the QR tile to give
// the share image a "scan target" reticle feel. Pure-View only — no SVG —
// so view-shot rasterises it reliably across devices.
function CornerBracket({ pos }) {
  const isTop = pos === 'tl' || pos === 'tr';
  const isLeft = pos === 'tl' || pos === 'bl';
  const size = rs(14);
  const thickness = 3;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: isTop ? -2 : undefined,
        bottom: !isTop ? -2 : undefined,
        left: isLeft ? -2 : undefined,
        right: !isLeft ? -2 : undefined,
        width: size,
        height: size,
        borderColor: BRIGHT,
        borderTopWidth: isTop ? thickness : 0,
        borderBottomWidth: !isTop ? thickness : 0,
        borderLeftWidth: isLeft ? thickness : 0,
        borderRightWidth: !isLeft ? thickness : 0,
        borderTopLeftRadius: pos === 'tl' ? 4 : 0,
        borderTopRightRadius: pos === 'tr' ? 4 : 0,
        borderBottomLeftRadius: pos === 'bl' ? 4 : 0,
        borderBottomRightRadius: pos === 'br' ? 4 : 0,
      }}
    />
  );
}
