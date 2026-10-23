import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ShieldCheck, Store } from 'lucide-react-native';
import { ion } from '../../components/dashboard/solidIcons';
import { SERIF, T } from '../../components/dashboard/theme';
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

// Same palette as My Account.
const G = '#035C6C';
const G_LIGHT = '#E5F3F5';
const DARK = '#111111';
const MUTED = '#6B7280';
const LIGHT = '#F3F4F6';
const BG = '#F3F4F6';
const ICON_STROKE = 2;

// Header — same values as OwnerPersonalInfoScreen / MyAccountScreen.
const HEADER_BORDER = '#C7E6EA';
const HEADER_TEXT = '#111111';
const HEADER = {
  bar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: rs(16),
    paddingTop: rs(8),
    paddingBottom: rs(12),
    borderBottomWidth: 1,
    borderBottomColor: HEADER_BORDER,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: HEADER_BORDER,
  },
  titleWrap: { flex: 1, alignItems: 'center', marginHorizontal: rs(8) },
  title: { color: HEADER_TEXT, fontSize: T.headline, fontWeight: '800' },
  subtitle: { color: '#6B7280', fontSize: T.caption2, marginTop: rs(2) },
};

// Home screen tool-tile disc colours.
const TONE = {
  teal: '#357D89',
  green: '#5E9440',
  blue: '#3B82F6',
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
      {/* Header — same design as Personal Information / My Account. */}
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#FFFFFF' }}>
        <View style={HEADER.bar}>
          <View style={[HEADER.row, capStyle]}>
            <Pressable
              onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('OwnerTabs'))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => [HEADER.iconBtn, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-back" size={19} color={HEADER_TEXT} />
            </Pressable>
            <View style={HEADER.titleWrap}>
              <Text style={HEADER.title} numberOfLines={1}>Help & Support</Text>
              <Text style={HEADER.subtitle} numberOfLines={1}>Talk to the Near G Fix team</Text>
            </View>
            <View style={{ width: rs(36) }} />
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: rs(16), paddingTop: rs(12), paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={capStyle}>
          {/* Intro — solid brand teal, white headset disc. */}
          <View className="flex-row items-center" style={{ backgroundColor: G, borderRadius: rs(18), padding: rs(16) }}>
            <View style={{ width: rs(48), height: rs(48), borderRadius: rs(24), backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginRight: rs(12) }}>
              <GLYPH.support size={rf(24)} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Need help with your shop?</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: rs(3), lineHeight: rf(17) }}>
                Call, WhatsApp or email us — we'll get back to you as soon as possible.
              </Text>
            </View>
          </View>

          {/* Contact options — three tiles side by side. */}
          <SectionLabel subtitle="Choose how you'd like to reach us">Contact Us</SectionLabel>
          <View className="flex-row" style={{ marginHorizontal: -rs(4) }}>
            <ContactTile Glyph={GLYPH.call} tone="teal" label="Call Us" value={phone} onPress={call} />
            <ContactTile Glyph={GLYPH.whatsapp} tone="green" label="WhatsApp" value={DEFAULT_WHATSAPP} onPress={whatsapp} />
            <ContactTile Glyph={GLYPH.email} tone="blue" label="Email" value={email} onPress={mail} />
          </View>

          {/* The shop details that go along with WhatsApp / email messages. */}
          {shopLine ? (
            <>
              <SectionLabel subtitle="Sent with your message so we can find your shop">Your Shop</SectionLabel>
              <View style={{ ...LIST_STYLE, paddingVertical: rs(12) }}>
                <View className="flex-row items-center">
                  <View style={{ width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: G_LIGHT, alignItems: 'center', justifyContent: 'center', marginRight: rs(10) }}>
                    <Store size={rf(17)} color={G} strokeWidth={ICON_STROKE} />
                  </View>
                  <View className="flex-1" style={{ marginRight: rs(8) }}>
                    <Text style={{ fontSize: 10.5, color: MUTED }}>Shop name</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: DARK, marginTop: 1 }} numberOfLines={1}>{shop.name}</Text>
                  </View>
                  {shop.slug ? (
                    <View className="items-end">
                      <Text style={{ fontSize: 10.5, color: MUTED }}>Shop ID</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: G, marginTop: 1 }} numberOfLines={1}>#{shop.slug.toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
                <View className="flex-row items-center" style={{ marginTop: rs(10), paddingTop: rs(10), borderTopWidth: 1, borderTopColor: LIGHT }}>
                  <ShieldCheck size={rf(14)} color={G} strokeWidth={ICON_STROKE} />
                  <Text style={{ flex: 1, fontSize: 11, color: MUTED, marginLeft: rs(6), lineHeight: rf(15) }}>
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

const LIST_STYLE = {
  backgroundColor: '#FFFFFF',
  borderRadius: rs(16),
  borderWidth: 1,
  borderColor: LIGHT,
  paddingHorizontal: rs(12),
};

function SectionLabel({ children, subtitle }) {
  return (
    <View style={{ marginTop: rs(16), marginBottom: rs(8) }}>
      <Text style={{ fontSize: 15, fontWeight: '700', fontFamily: SERIF, color: DARK }}>{children}</Text>
      {subtitle ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{subtitle}</Text> : null}
    </View>
  );
}

// One contact option: Home-style disc (white icon), label, and the number /
// address under it — shrinks to fit rather than cutting the email off.
function ContactTile({ Glyph, tone, label, value, onPress }) {
  return (
    <View style={{ flex: 1, paddingHorizontal: rs(4) }}>
      <Pressable
        onPress={onPress}
        android_ripple={{ color: LIGHT }}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        className="items-center active:opacity-80"
        style={{ backgroundColor: '#FFFFFF', borderRadius: rs(16), borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: rs(14), paddingHorizontal: rs(6) }}
      >
        <View style={{ width: rs(46), height: rs(46), borderRadius: rs(23), backgroundColor: TONE[tone] || TONE.teal, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph size={rf(21)} color="#FFFFFF" />
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: DARK, marginTop: rs(8) }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: 10.5, color: MUTED, marginTop: rs(2), textAlign: 'center', alignSelf: 'stretch' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {value}
        </Text>
      </Pressable>
    </View>
  );
}
