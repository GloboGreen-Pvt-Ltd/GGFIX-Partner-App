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
  Eye,
} from 'lucide-react-native';
import { fetchMe } from '../../api/auth';
import { getSession } from '../../auth/session';
import { getOwnerKycDocuments } from '../../api/shops';
import { notify } from '../../components/confirm';
import { rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

// GGFIX palette — green #09AD2A, ink #1E1E1E, white, neutrals #F8F8F8/#F3F3F3.
const ACCENT = '#09AD2A';
const PRIMARY = '#078F23';
const BRIGHT = '#09AD2A';
const MINT = '#EAF8EC';
const SOFT_MINT = '#F3F3F3';
const PAGE_BG = '#F8F8F8';
const CARD_BG = '#FFFFFF';
const BORDER = '#E6E6E6';
const TEXT_PRIMARY = '#1E1E1E';
const TEXT_SECONDARY = '#6B6B6B';
// Rendered QR side — compact, still comfortably scannable for the vCard payload.
const QR_SIZE = 130;

const cardShadow = {
  shadowColor: '#1E1E1E',
  shadowOpacity: 0.07,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
};

const softShadow = {
  shadowColor: '#1E1E1E',
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
        <View style={{ paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(12) }}>
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
              <ChevronLeft size={19} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text className="font-extrabold" style={{ fontSize: 17, color: TEXT_PRIMARY }} numberOfLines={1}>
                My QR Code
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
                Share your business with customers
              </Text>
            </View>
            <TouchableOpacity
              onPress={onShare}
              activeOpacity={0.8}
              className="flex-row items-center rounded-full"
              style={{ paddingHorizontal: rs(13), paddingVertical: rs(8), backgroundColor: ACCENT, ...softShadow }}
            >
              <Share2 size={13} color="#FFFFFF" />
              <Text className="font-extrabold" style={{ marginLeft: rs(6), fontSize: 11, color: '#FFFFFF', letterSpacing: 0.5 }}>
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
          style={{ backgroundColor: CARD_BG, borderRadius: 18, padding: 11, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', ...softShadow }}
        >
          <View style={{ position: 'relative' }}>
            <View
              style={{
                padding: 3, borderRadius: 27, borderWidth: 1.5, borderColor: BRIGHT, borderStyle: 'dashed',
              }}
            >
              <View
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: MINT, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}
              >
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={{ width: 44, height: 44 }} />
                ) : (
                  <Text className="font-extrabold" style={{ fontSize: 15, color: ACCENT, letterSpacing: 1 }}>
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
              <Camera size={11} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View className="flex-1" style={{ marginLeft: 12, minWidth: 0 }}>
            <Text className="font-extrabold" style={{ fontSize: 10.5, color: PRIMARY, letterSpacing: 1 }}>
              SHOP QR
            </Text>
            <Text className="font-extrabold" style={{ fontSize: 15, color: TEXT_PRIMARY, marginTop: 1 }} numberOfLines={1}>
              {shopName}
            </Text>
            <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: rs(1) }} numberOfLines={1}>
              Tap-to-scan business card
            </Text>
          </View>
          {isVerified ? (
            <View
              className="flex-row items-center rounded-full"
              style={{ marginLeft: 8, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: MINT }}
            >
              <ShieldCheck size={12} color={PRIMARY} />
              <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 10.5, color: PRIMARY }}>
                Verified Owner
              </Text>
            </View>
          ) : null}
        </View>

        {/* Main QR business card — the ENTIRE ViewShot region is what Share
            captures, so it carries the header bar, shop/owner name, QR, and
            footer, and reads as a proper business card rather than a bare QR. */}
        <View className="items-center" style={{ marginTop: 12 }}>
          <View
            style={{ borderRadius: 20, overflow: 'hidden', width: '100%', maxWidth: 300, borderWidth: 1, borderColor: BORDER, ...cardShadow }}
          >
            <ViewShot
              ref={qrOnlyRef}
              options={{ format: 'png', quality: 1 }}
              collapsable={false}
              style={{ backgroundColor: '#FFFFFF' }}
            >
              {/* Scan-to-connect header */}
              <LinearGradient
                colors={[ACCENT, PRIMARY]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ paddingVertical: 7, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <ScanLine size={12} color="#FFFFFF" />
                <Text className="text-white font-extrabold" style={{ marginLeft: 6, fontSize: 10, letterSpacing: 1.4 }}>
                  SCAN TO CONNECT
                </Text>
              </LinearGradient>

              {/* Shop + owner names */}
              <View style={{ paddingTop: 10, paddingHorizontal: 14, alignItems: 'center' }}>
                <Text className="font-extrabold text-center" style={{ fontSize: 15, color: TEXT_PRIMARY }} numberOfLines={2}>
                  {shopName}
                </Text>
                <Text className="font-semibold text-center" style={{ fontSize: 11, color: PRIMARY, marginTop: 1 }} numberOfLines={1}>
                  Owner · {ownerName}
                </Text>
              </View>

              {/* QR with a green corner-bracket frame */}
              <View style={{ alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 2 }}>
                {/* Soft mint panel behind the white QR tile */}
                <View style={{ padding: 9, borderRadius: 18, backgroundColor: MINT }}>
                <View style={{ padding: 8, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: BORDER }}>
                  <QRCode
                    value={qrValue}
                    size={QR_SIZE}
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
              </View>

              {/* Instruction + phone pill */}
              <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12, alignItems: 'center' }}>
                <View className="flex-row items-start" style={{ maxWidth: 230 }}>
                  <Camera size={11} color={TEXT_SECONDARY} style={{ marginTop: 2, marginRight: 5 }} />
                  <Text className="text-center flex-1" style={{ fontSize: 10, color: TEXT_SECONDARY, lineHeight: 14 }}>
                    Point your camera at this QR to add {shopName} to your contacts.
                  </Text>
                </View>
                {shopPhone ? (
                  <View
                    className="flex-row items-center rounded-full"
                    style={{ marginTop: 8, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: MINT }}
                  >
                    <Phone size={11} color={PRIMARY} />
                    <Text className="font-extrabold" style={{ marginLeft: 5, fontSize: 11, color: PRIMARY }}>
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
          style={{ backgroundColor: CARD_BG, borderRadius: 18, padding: 12, marginTop: 12, borderWidth: 1, borderColor: BORDER, ...softShadow }}
        >
          <DetailSection
            label="OWNER"
            Icon={User}
            title={ownerName}
            sub={ownerPhone}
            subIcon={Phone}
          />
          <View style={{ height: 1, backgroundColor: SOFT_MINT, marginVertical: 11 }} />
          <DetailSection
            label="SHOP"
            Icon={Store}
            title={shopName}
            sub={shopAddress || undefined}
            subIcon={MapPin}
            actionLabel="VIEW SHOP"
            ActionIcon={Eye}
            onAction={() => navigation.navigate('OwnerShopInfo')}
          />
        </View>

        {/* Bottom brand message */}
        <View className="flex-row items-center" style={{ marginTop: 18, marginBottom: 8 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
          <Text className="font-extrabold" style={{ marginHorizontal: rs(10), fontSize: 9.5, letterSpacing: 1.2, color: PRIMARY }}>
            LOCAL BUSINESS · BETTER TOGETHER
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

// Label, then icon + name + one detail line. The text column is flex-bound so
// a long address wraps (2 lines max) inside the card instead of running past
// its edge and pushing the action chip off-screen.
function DetailSection({ label, Icon, title, sub, subIcon: SubIcon, actionLabel, ActionIcon, onAction }) {
  return (
    <View>
      <Text className="font-extrabold" style={{ fontSize: 10, color: PRIMARY, letterSpacing: 1, marginBottom: 7 }}>
        {label}
      </Text>
      <View className="flex-row items-center">
        <View className="items-center justify-center" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: MINT, marginRight: 10 }}>
          <Icon size={16} color={ACCENT} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="font-extrabold" style={{ fontSize: 13, color: TEXT_PRIMARY }} numberOfLines={1}>
            {title}
          </Text>
          {sub ? (
            <View className="flex-row items-start" style={{ marginTop: 2 }}>
              <SubIcon size={11} color={TEXT_SECONDARY} style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, marginLeft: 5, fontSize: 11, lineHeight: 16, color: TEXT_SECONDARY }} numberOfLines={2}>
                {sub}
              </Text>
            </View>
          ) : null}
        </View>
        {onAction ? (
          <TouchableOpacity
            onPress={onAction}
            activeOpacity={0.85}
            className="flex-row items-center rounded-full"
            style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: MINT }}
          >
            <ActionIcon size={12} color={PRIMARY} />
            <Text className="font-extrabold" style={{ marginLeft: 4, fontSize: 10.5, color: PRIMARY }}>
              {actionLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// Tiny green L-shaped bracket painted at each corner of the QR tile to give
// the share image a "scan target" reticle feel. Pure-View only — no SVG —
// so view-shot rasterises it reliably across devices.
function CornerBracket({ pos }) {
  const isTop = pos === 'tl' || pos === 'tr';
  const isLeft = pos === 'tl' || pos === 'bl';
  const size = 11;
  const thickness = 2.5;
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
