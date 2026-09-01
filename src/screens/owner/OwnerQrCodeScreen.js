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
  Download,
  Share2,
  Store,
  Phone,
  User,
  MapPin,
} from 'lucide-react-native';
import { fetchMe } from '../../api/auth';
import { getSession } from '../../auth/session';
import { notify } from '../../components/confirm';

const BRAND_GREEN      = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';

const cardShadow = {
  shadowColor: '#172117',
  shadowOpacity: 0.10,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 6,
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
  const [user, setUser] = useState(null);
  // qrOnlyRef wraps ONLY the rendered QR image (white background + black
  // modules). Capturing this ref yields the QR by itself — no shop card,
  // no surrounding text — so Share / Download send a clean, scannable PNG.
  const qrOnlyRef = useRef(null);

  useEffect(() => {
    (async () => {
      try { setUser(await fetchMe()); }
      catch { try { setUser(await getSession()); } catch { setUser(null); } }
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

  // Share / download the QR image ONLY. captureRef on qrOnlyRef pulls just
  // the white-on-black QR canvas; the surrounding card stays out of the
  // captured PNG. Falls back to a text Share.share() if either capture or
  // expo-sharing fails — the recipient still gets the contact details.
  const captureAndShare = async (dialogTitle) => {
    try {
      const uri = await captureRef(qrOnlyRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle,
          UTI: 'public.png',
        });
        return true;
      }
    } catch (_) { /* fall through */ }
    return false;
  };

  const onShare = async () => {
    const ok = await captureAndShare(`${shopName} on GGfix`);
    if (ok) return;
    try {
      await Share.share({
        message: `${shopName} on GGfix — scan my QR to view the shop.`,
        title: `${shopName} on GGfix`,
      });
    } catch (e) {
      notify('Share failed', e?.message || 'Try again');
    }
  };

  const onDownload = async () => {
    const ok = await captureAndShare('Save QR to gallery');
    if (!ok) notify('Saved', 'QR captured but sharing isn\'t available on this device.');
  };

  return (
    <View className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View
          style={{ backgroundColor: '#FFFFFF', paddingTop: 6, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8E2' }}
        >
          <View className="flex-row items-center">
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#EFF5EE' }}
            >
              <ChevronLeft size={22} color="#172117" />
            </TouchableOpacity>
            <Text className="flex-1 text-text text-[24px] font-extrabold" numberOfLines={1}>
              My QR Code
            </Text>
            <TouchableOpacity
              onPress={onShare}
              activeOpacity={0.8}
              className="px-3 py-1.5 rounded-full flex-row items-center"
              style={{ backgroundColor: '#EFF5EE' }}
            >
              <Share2 size={13} color="#172117" />
              <Text className="ml-1.5 text-text text-[11px] font-extrabold" style={{ letterSpacing: 0.5 }}>
                SHARE
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
      >
        {/* Outer card is purely visual — the capturable region is the
            inner <ViewShot> that wraps only the QR canvas. */}
        <View className="bg-white rounded-3xl p-5 items-center" style={cardShadow}>
            <View className="flex-row items-center w-full">
              <View
                style={{
                  padding: 3,
                  borderRadius: 34,
                  borderWidth: 1.5,
                  borderColor: '#7ED957',
                  borderStyle: 'dashed',
                }}
              >
                <View
                  style={{
                    width: 56, height: 56, borderRadius: 28,
                    backgroundColor: '#E6F7E3',
                    alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={{ width: 56, height: 56 }} />
                  ) : (
                    <Text
                      className="text-[17px] font-extrabold"
                      style={{ color: BRAND_GREEN_DARK, letterSpacing: 1 }}
                    >
                      {shopName.slice(0, 2).toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>
              <View className="flex-1 ml-3">
                <Text className="text-[10.5px] font-extrabold" style={{ color: BRAND_GREEN_DARK, letterSpacing: 1 }}>
                  SHOP QR
                </Text>
                <Text className="text-[15px] font-extrabold text-gray-900 mt-0.5" numberOfLines={1}>
                  {shopName}
                </Text>
                <Text className="text-[11px] text-gray-500 mt-0.5" numberOfLines={1}>
                  Tap-to-scan business card
                </Text>
              </View>
            </View>

            {/* Branded share card — this is the ENTIRE region captured by
                Share / Download. It carries the GGfix header bar, shop name,
                owner name, the actual QR, and a "scan" footer, so the PNG
                the recipient gets reads as a proper business card not just a
                bare QR. Outer dashed-border View is purely on-screen styling
                and is NOT part of the captured image. */}
            <View
              className="mt-5 rounded-3xl p-4 items-center justify-center"
              style={{
                backgroundColor: '#F0F8EF',
                borderWidth: 1.5,
                borderColor: '#C8EEBF',
                borderStyle: 'dashed',
                width: '100%',
              }}
            >
              <ViewShot
                ref={qrOnlyRef}
                options={{ format: 'png', quality: 1 }}
                collapsable={false}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 22,
                  overflow: 'hidden',
                  width: 280,
                }}
              >
                {/* GGfix brand header */}
                <LinearGradient
                  colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{ paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' }}
                >
                  <Text className="text-white text-[10.5px] font-extrabold" style={{ letterSpacing: 2 }}>
                    GGFIX  ·  SCAN TO CONNECT
                  </Text>
                </LinearGradient>

                {/* Shop + owner names */}
                <View style={{ paddingTop: 14, paddingHorizontal: 16, alignItems: 'center' }}>
                  <Text
                    className="font-extrabold text-gray-900 text-center"
                    style={{ fontSize: 18, letterSpacing: -0.2 }}
                    numberOfLines={2}
                  >
                    {shopName}
                  </Text>
                  <Text
                    className="text-[12px] font-semibold mt-0.5 text-center"
                    style={{ color: BRAND_GREEN_DARK }}
                    numberOfLines={1}
                  >
                    Owner · {ownerName}
                  </Text>
                </View>

                {/* QR with a green corner-bracket frame */}
                <View style={{ alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
                  <View
                    style={{
                      padding: 12,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: '#E6F7E3',
                    }}
                  >
                    <QRCode
                      value={qrValue}
                      size={196}
                      color="#172117"
                      backgroundColor="#FFFFFF"
                      ecl="M"
                    />
                    {/* Corner brackets for a "scan target" feel */}
                    <CornerBracket pos="tl" />
                    <CornerBracket pos="tr" />
                    <CornerBracket pos="bl" />
                    <CornerBracket pos="br" />
                  </View>
                </View>

                {/* Footer */}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingTop: 4,
                    paddingBottom: 14,
                    alignItems: 'center',
                  }}
                >
                  <Text className="text-[10.5px] text-gray-500 text-center" numberOfLines={2}>
                    Point your camera at this QR to add {shopName} to your contacts.
                  </Text>
                  {shopPhone ? (
                    <View
                      className="mt-2 flex-row items-center px-3 py-1 rounded-full"
                      style={{ backgroundColor: '#E6F7E3' }}
                    >
                      <Phone size={10} color={BRAND_GREEN_DARK} />
                      <Text
                        className="ml-1.5 text-[10.5px] font-extrabold"
                        style={{ color: BRAND_GREEN_DARK }}
                      >
                        {shopPhone}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </ViewShot>
            </View>

            {/* Owner + Shop details */}
            <View
              className="mt-5 w-full rounded-2xl p-3"
              style={{ backgroundColor: '#F7FAF7' }}
            >
              {/* Owner */}
              <Text
                className="text-[9.5px] font-extrabold uppercase mb-1.5"
                style={{ color: BRAND_GREEN_DARK, letterSpacing: 1 }}
              >
                Owner
              </Text>
              <DetailRow Icon={User} label={ownerName} bold />
              {ownerPhone ? (
                <DetailRow Icon={Phone} label={ownerPhone} />
              ) : null}

              {/* Divider */}
              <View
                className="my-3"
                style={{ borderTopWidth: 1, borderTopColor: '#E2E8E2', borderStyle: 'dashed' }}
              />

              {/* Shop */}
              <Text
                className="text-[9.5px] font-extrabold uppercase mb-1.5"
                style={{ color: BRAND_GREEN_DARK, letterSpacing: 1 }}
              >
                Shop
              </Text>
              <DetailRow Icon={Store} label={shopName} bold />
              {shopPhone ? (
                <DetailRow Icon={Phone} label={shopPhone} />
              ) : null}
              {shopAddress ? (
                <DetailRow Icon={MapPin} label={shopAddress} multiline />
              ) : null}
            </View>
          </View>

        {/* Actions */}
        <View className="flex-row mt-4">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onDownload}
            className="flex-1 mr-2 rounded-2xl py-3.5 flex-row items-center justify-center"
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1.5,
              borderColor: BRAND_GREEN,
              ...cardShadow,
            }}
          >
            <Download size={16} color={BRAND_GREEN_DARK} />
            <Text className="ml-2 text-[14px] font-extrabold" style={{ color: BRAND_GREEN_DARK }}>
              Download
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={onShare}
            className="flex-1 ml-2"
            style={cardShadow}
          >
            <LinearGradient
              colors={[BRAND_GREEN, BRAND_GREEN_DARK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderRadius: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Share2 size={16} color="#FFFFFF" />
              <Text className="ml-2 text-white text-[14px] font-extrabold">Share QR</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// Tiny green L-shaped bracket painted at each corner of the QR tile to give
// the share image a "scan target" reticle feel. Pure-View only — no SVG —
// so view-shot rasterises it reliably across devices.
function CornerBracket({ pos }) {
  const isTop = pos === 'tl' || pos === 'tr';
  const isLeft = pos === 'tl' || pos === 'bl';
  const size = 14;
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
        borderColor: BRAND_GREEN_DARK,
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

function DetailRow({ Icon, label, bold, multiline }) {
  return (
    <View className="flex-row items-start py-1">
      <View
        className="w-7 h-7 rounded-full items-center justify-center mr-2.5"
        style={{ backgroundColor: '#E6F7E3' }}
      >
        <Icon size={13} color={BRAND_GREEN_DARK} />
      </View>
      <Text
        className={`flex-1 text-[13.5px] ${bold ? 'font-extrabold text-gray-900' : 'font-semibold text-gray-700'}`}
        numberOfLines={multiline ? 3 : 1}
        style={{ lineHeight: 18, marginTop: 4 }}
      >
        {label}
      </Text>
    </View>
  );
}
