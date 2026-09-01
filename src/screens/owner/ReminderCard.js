import React from 'react';
import { Image, Text, View } from 'react-native';
import { formatMoney } from './revenueMath';
import { formatPhone } from '../../api/ledgerParties';

/* ── payment reminder card ────────────────────────────────────────────────
   The image that goes out with a reminder, captured off-screen by view-shot
   and shared as a PNG.

   It exists because a WhatsApp deep link carries text and nothing else, so the
   only way to put the shop's name and mark in front of the customer is to draw
   them into a picture first.

   NOT a copy of the OkCredit card. That one is a solid green block with the
   figure boxed in the middle, which in a chat list compresses to a green smear
   — brand colour, no information. This one inverts the weight: a slim branded
   header, then the amount on white at the size the whole image is really for.
   A thumbnail of it still reads as "₹3,000, and who from".

   Fixed 380pt wide and styled in absolute numbers — NOT the rs()/T ramp every
   other screen uses. Those scale to the device, and this view is never seen on
   a device: it is rendered off-screen and photographed, so a card captured on a
   small phone would otherwise reach the customer smaller than one captured on a
   tablet. The output has to be identical from every shop.
   ── */

export const REMINDER_CARD_WIDTH = 380;

const GREEN = '#087A0A';
const INK = '#172117';
const MUTED = '#667066';
const AMBER = '#B45309';
const AMBER_TINT = '#FEF3C7';
const HAIRLINE = '#E6EDE5';

/**
 * @param {string} shopName
 * @param {string} shopPhone
 * @param {string} shopLogoUrl  the shop's front image, when it has one
 * @param {string} customerName
 * @param {number} amount       what is outstanding
 * @param {string} dueLabel     "20 Aug 2026", or empty when nothing is promised
 */
export default function ReminderCard({
  shopName, shopPhone, shopLogoUrl, customerName, amount, dueLabel,
}) {
  return (
    // The outer green is a 6pt frame, not a fill: it edges the card so it sits
    // apart from WhatsApp's own bubble instead of merging into it.
    <View style={{ width: REMINDER_CARD_WIDTH, backgroundColor: GREEN, padding: 6 }}>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden' }}>

        {/* ── shop identity ── the part a deep link cannot carry ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: GREEN,
            paddingHorizontal: 16,
            paddingVertical: 13,
          }}
        >
          <View
            style={{
              height: 38,
              width: 38,
              borderRadius: 10,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginRight: 11,
            }}
          >
            {shopLogoUrl ? (
              <Image source={{ uri: shopLogoUrl }} style={{ height: 38, width: 38 }} resizeMode="cover" />
            ) : (
              // Monogram fallback, so a shop that never uploaded a front image
              // still sends something branded rather than an empty square.
              <Text style={{ fontSize: 18, fontWeight: '800', color: GREEN }}>
                {(shopName || '#').trim().charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: '800', color: '#FFFFFF' }}>
              {shopName || 'Our shop'}
            </Text>
            {shopPhone ? (
              <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.88)', marginTop: 1 }}>
                {formatPhone(shopPhone)}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── the figure ── the reason the image exists, so it gets the room ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1.4 }}>
            PAYMENT REMINDER
          </Text>
          <Text style={{ fontSize: 40, fontWeight: '800', color: INK, marginTop: 6, letterSpacing: -0.5 }}>
            {formatMoney(Math.abs(Number(amount) || 0))}
          </Text>
          <Text style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
            outstanding balance
          </Text>

          {dueLabel ? (
            // Amber, the app's one "someone still owes this" colour. A date is
            // the difference between a reminder and a demand.
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: AMBER_TINT,
                borderRadius: 999,
                paddingHorizontal: 11,
                paddingVertical: 5,
                marginTop: 12,
              }}
            >
              <Text style={{ fontSize: 11.5, fontWeight: '800', color: AMBER }}>
                Due by {dueLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── who it is for ── */}
        {customerName ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: HAIRLINE,
              paddingHorizontal: 16,
              paddingVertical: 11,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '800', color: MUTED, letterSpacing: 1.1 }}>
              ACCOUNT
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: INK, marginTop: 2 }}>
              {customerName}
            </Text>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: '#F3F8F2',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderTopWidth: 1,
            borderTopColor: HAIRLINE,
          }}
        >
          <Text style={{ fontSize: 11.5, color: MUTED, textAlign: 'center' }}>
            Kindly clear the balance at your earliest. Thank you!
          </Text>
        </View>
      </View>
    </View>
  );
}
