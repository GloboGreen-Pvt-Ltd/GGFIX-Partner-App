import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ChevronRight, ShieldCheck, Store } from 'lucide-react-native';
import { ion } from '../../components/dashboard/solidIcons';
import { T } from '../../components/dashboard/theme';
import { brand } from '../../theme/colors';
import { getSupportContacts } from '../../api/masterData';
import { getSession } from '../../auth/session';
import { notify } from '../../components/confirm';
import { rf, rs } from '../../utils/responsive';
import { useResponsive } from '../../theme/responsive';

/**
 * Help & Support for shop owners (My Account → More → Help & Support).
 * Call / WhatsApp / Email the Near G Fix team.
 * Contacts default to the ones published in the Terms & Privacy Policy; an
 * active admin-managed support contact (master /support-contacts) overrides
 * the phone / email without an app release.
 */

// Same palette as My Account — the Oct 2026 brand sheet.
const G = brand.teal;
const G_DARK = '#02414C';
const G_LIGHT = '#E5F3F5';
const NAVY = brand.navy;
const DARK = brand.black;
const MUTED = '#6B7280';
const LIGHT = '#E9EDF0';
const BG = brand.lightGray;
const ICON_STROKE = 2;

// Header — white text and translucent round buttons on the teal gradient,
// same values as MyAccountScreen.
const HEADER = {
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  titleWrap: { flex: 1, alignItems: 'center', marginHorizontal: rs(8) },
  title: { color: '#FFFFFF', fontSize: T.headline, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.75)', fontSize: T.caption2, marginTop: rs(2) },
};

// Solid tile colours (white glyph on top).
const TONE = {
  teal: brand.teal,
  whatsapp: '#25D366',
  blue: brand.blue,
};

const softShadow = {
  shadowColor: '#1C3053',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const DEFAULT_PHONE = '+91 81241 23452';
const DEFAULT_WHATSAPP = '+91 81241 23452';
const DEFAULT_EMAIL = 'support@neargfix.com';

const GLYPH = {
  call: ion('call'),
  whatsapp: ion('logo-whatsapp'),
  email: ion('mail'),
  support: ion('headset'),
};

const digitsOf = (s) => String(s || '').replace(/\D/g, '');

export default function HelpSupportScreen({ navigation }) {
  const [phone, setPhone] = useState(DEFAULT_PHONE);
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [shop, setShop] = useState({ name: '', slug: '' });

  const r = useResponsive();
  const isFocused = useIsFocused();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 920) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = (await getSupportContacts()) || [];
        const active = rows.filter((c) => c && c.isActive !== false);
        const p = active.find((c) => c.phone)?.phone;
        const e = active.find((c) => c.email)?.email;
        if (!cancelled) {
          if (p) setPhone(p);
          if (e) setEmail(e);
        }
      } catch (_) { /* keep the published defaults */ }
      try {
        const s = await getSession();
        const active = s?.activeShop || s?.shops?.find?.((x) => x.isActive) || null;
        if (!cancelled) setShop({ name: s?.shopName || active?.name || '', slug: active?.slug || '' });
      } catch (_) { /* message just goes without shop details */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Shop name + ID ride along in WhatsApp / email so support can find the shop.
  const shopLine = shop.name
    ? `${shop.name}${shop.slug ? ` (Shop ID #${shop.slug.toUpperCase()})` : ''}`
    : '';
  const message = `Hi Near G Fix team, I need help${shopLine ? ` with my shop ${shopLine}` : ''}.`;

  const open = (url, what) =>
    Linking.openURL(url).catch(() => notify(`Could not open ${what}`, 'Please try again or use another option.'));

  const call = () => open(`tel:+${digitsOf(phone).length === 10 ? `91${digitsOf(phone)}` : digitsOf(phone)}`, 'the dialer');
  const whatsapp = () => {
    const d = digitsOf(DEFAULT_WHATSAPP);
    open(`https://wa.me/${d.length === 10 ? `91${d}` : d}?text=${encodeURIComponent(message)}`, 'WhatsApp');
  };
  const mail = () => {
    const subject = `Partner support${shop.name ? ` - ${shop.name}` : ''}`;
    open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${message}\n\n`)}`, 'email');
  };

  return (
    <View className="flex-1" style={{ backgroundColor: BG }}>
      {isFocused ? <StatusBar barStyle="light-content" backgroundColor={G} /> : null}

      {/* Teal header: title bar + intro, one block (same as My Account). */}
      <LinearGradient
        colors={[G, G_DARK]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderBottomLeftRadius: rs(26), borderBottomRightRadius: rs(26) }}
      >
        <SafeAreaView edges={['top']}>
          <View style={[{ paddingHorizontal: rs(16), paddingTop: rs(6), paddingBottom: rs(20) }, capStyle]}>
            <View style={HEADER.row}>
              <Pressable
                onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('OwnerTabs'))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={({ pressed }) => [HEADER.iconBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="chevron-back" size={19} color="#FFFFFF" />
              </Pressable>
              <View style={HEADER.titleWrap}>
                <Text style={HEADER.title} numberOfLines={1}>Help & Support</Text>
                <Text style={HEADER.subtitle} numberOfLines={1}>Talk to the Near G Fix team</Text>
              </View>
              <View style={{ width: rs(36) }} />
            </View>

            <View className="flex-row items-center" style={{ marginTop: rs(18) }}>
              <View style={{ width: rs(56), height: rs(56), borderRadius: rs(18), backgroundColor: brand.orange, alignItems: 'center', justifyContent: 'center', marginRight: rs(14), borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' }}>
                <GLYPH.support size={rf(26)} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFFFFF' }}>Need help with your shop?</Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: rs(3), lineHeight: rf(17) }}>
                  Call, WhatsApp or email us — we'll get back to you as soon as possible.
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: rs(16), paddingTop: rs(4), paddingBottom: 28 + r.insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={capStyle}>
          <SectionLabel subtitle="Choose how you'd like to reach us">Contact Us</SectionLabel>
          <View style={LIST_STYLE}>
            <ContactRow Glyph={GLYPH.call} tone="teal" label="Call Us" value={phone} action="Call" onPress={call} />
            <ContactRow Glyph={GLYPH.whatsapp} tone="whatsapp" label="WhatsApp" value={DEFAULT_WHATSAPP} action="Chat" onPress={whatsapp} />
            <ContactRow Glyph={GLYPH.email} tone="blue" label="Email" value={email} action="Mail" onPress={mail} last />
          </View>

          {/* The shop details that go along with WhatsApp / email messages. */}
          {shopLine ? (
            <>
              <SectionLabel subtitle="Sent with your message so we can find your shop">Your Shop</SectionLabel>
              <View style={{ ...LIST_STYLE, paddingVertical: rs(12) }}>
                <View className="flex-row items-center">
                  <View style={{ width: rs(40), height: rs(40), borderRadius: rs(12), backgroundColor: G, alignItems: 'center', justifyContent: 'center', marginRight: rs(12) }}>
                    <Store size={rf(18)} color="#FFFFFF" strokeWidth={ICON_STROKE} />
                  </View>
                  <View className="flex-1" style={{ marginRight: rs(8) }}>
                    <Text style={{ fontSize: 10.5, color: MUTED }}>Shop name</Text>
                    <Text style={{ fontSize: 13.5, fontWeight: '700', color: DARK, marginTop: 1 }} numberOfLines={1}>{shop.name}</Text>
                  </View>
                  {shop.slug ? (
                    <View className="items-end">
                      <Text style={{ fontSize: 10.5, color: MUTED }}>Shop ID</Text>
                      <View style={{ marginTop: rs(2), paddingHorizontal: rs(8), paddingVertical: rs(2), borderRadius: 999, backgroundColor: G_LIGHT }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: G }} numberOfLines={1}>#{shop.slug.toUpperCase()}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
                <View className="flex-row items-center" style={{ marginTop: rs(12), padding: rs(10), borderRadius: rs(12), backgroundColor: G_LIGHT }}>
                  <ShieldCheck size={rf(15)} color={G} strokeWidth={ICON_STROKE} />
                  <Text style={{ flex: 1, fontSize: 11, color: NAVY, marginLeft: rs(8), lineHeight: rf(15) }}>
                    Included in WhatsApp and email messages so we can help you faster.
                  </Text>
                </View>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

// One white card per section — same as My Account.
const LIST_STYLE = {
  backgroundColor: '#FFFFFF',
  borderRadius: rs(18),
  paddingHorizontal: rs(12),
  ...softShadow,
};

function SectionLabel({ children, subtitle }) {
  return (
    <View style={{ marginTop: rs(18), marginBottom: rs(8), paddingHorizontal: rs(2) }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: NAVY }}>{children}</Text>
      {subtitle ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{subtitle}</Text> : null}
    </View>
  );
}

// One contact option: [solid tile + white glyph] label / number, action pill.
// The value shrinks to fit rather than cutting the email off.
function ContactRow({ Glyph, tone, label, value, action, onPress, last }) {
  const color = TONE[tone] || TONE.teal;
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: LIGHT }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      className="flex-row items-center"
      style={{ minHeight: rs(66), paddingVertical: rs(11), borderBottomWidth: last ? 0 : 1, borderBottomColor: '#F1F3F5' }}
    >
      <View style={{ width: rs(42), height: rs(42), borderRadius: rs(12), backgroundColor: color, alignItems: 'center', justifyContent: 'center', marginRight: rs(12) }}>
        <Glyph size={rf(20)} color="#FFFFFF" />
      </View>
      <View className="flex-1" style={{ marginRight: rs(8) }}>
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: DARK }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: 11.5, color: MUTED, marginTop: rs(2) }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {value}
        </Text>
      </View>
      <View className="flex-row items-center" style={{ paddingHorizontal: rs(10), paddingVertical: rs(5), borderRadius: 999, backgroundColor: G_LIGHT }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: G }}>{action}</Text>
        <ChevronRight size={rf(13)} color={G} strokeWidth={ICON_STROKE} />
      </View>
    </Pressable>
  );
}
