import React, { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, Boxes, CircleCheck, FilePen, Headphones, ShoppingCart, Wrench } from 'lucide-react-native';
import { confirm } from '../../../components/confirm';
import { rf } from '../../../utils/responsive';
import { C, CONTENT_MAX, Card, PrimaryButton, SellScreen } from './kit';
import { LISTING_TYPES, draftTitle, hasUnsavedProgress, useSellDraft, sellDraftStore } from './draft';

// Page 2 — what is being sold. Device / Spare Part / Accessory start the
// single-listing wizard; Bulk Listing opens the bulk flow.

const STEPS = ['Device', 'Details', 'Photos', 'Price', 'Publish'];
const TYPES = [
  { type: LISTING_TYPES.DEVICE, title: 'Device', sub: '(Mobile, Laptop etc.)', Icon: ShoppingCart },
  { type: LISTING_TYPES.SPARE_PART, title: 'Spare Part', Icon: Wrench },
  { type: LISTING_TYPES.ACCESSORY, title: 'Accessory', Icon: Headphones },
];

export default function SellListingTypeScreen({ navigation }) {
  const { draft, ready } = useSellDraft();
  const resumable = ready && hasUnsavedProgress(draft);
  const [picked, setPicked] = useState(null);
  const { width } = useWindowDimensions();
  const tileW = Math.floor((Math.min(width, CONTENT_MAX) - 32 - 12) / 2);

  const start = async (type) => {
    if (resumable) {
      const ok = await confirm({
        title: 'Start a new listing?',
        message: `Your unfinished draft "${draftTitle(draft)}" will be discarded.`,
        confirmText: 'Start New',
        destructive: true,
      });
      if (!ok) return;
    }
    sellDraftStore.reset(type);
    navigation.navigate('SellStepDetails');
  };

  return (
    <SellScreen
      title="Add New Listing"
      onBack={() => navigation.goBack()}
      step={1}
      stepLabels={STEPS}
      footer={<PrimaryButton title="Next" iconRight={ArrowRight} variant="green" disabled={!picked} onPress={() => start(picked)} />}
    >
      {resumable ? (
        <Card style={{ marginTop: 8, backgroundColor: C.amberBg, borderColor: '#F6D9A8' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <FilePen size={18} color={C.amber} />
            <Text style={{ flex: 1, marginLeft: 8, fontSize: rf(12.5), fontWeight: '800', color: C.text }} numberOfLines={1}>
              Unfinished draft: {draftTitle(draft)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <PrimaryButton small title="Continue" style={{ flex: 1 }} onPress={() => navigation.navigate('SellStepDetails')} />
            <PrimaryButton
              small
              variant="danger"
              title="Discard"
              style={{ flex: 1 }}
              onPress={async () => {
                const ok = await confirm({ title: 'Discard draft?', message: 'Everything entered for this listing will be removed.', confirmText: 'Discard', destructive: true });
                if (ok) sellDraftStore.reset();
              }}
            />
          </View>
        </Card>
      ) : null}

      <Text style={{ fontSize: rf(16), fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 10 }}>Choose Type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {TYPES.map((t) => {
          const on = picked === t.type;
          return (
            <Pressable key={t.type} onPress={() => setPicked(t.type)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t.title}
              className="active:opacity-85"
              style={{ width: tileW, height: 118, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? C.green : C.border, backgroundColor: on ? C.greenBg : '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
              {on ? <View style={{ position: 'absolute', top: 8, right: 8 }}><CircleCheck size={18} color={C.green} /></View> : null}
              <t.Icon size={34} color={C.green} strokeWidth={1.8} />
              <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text, marginTop: 8 }}>{t.title}</Text>
              {t.sub ? <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 2 }}>{t.sub}</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={() => navigation.navigate('BulkListingType')} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: 18, padding: 6 }}>
        <Boxes size={15} color={C.teal} />
        <Text style={{ marginLeft: 6, fontSize: rf(12.5), fontWeight: '800', color: C.teal }}>Bulk listing (many units)</Text>
      </Pressable>
    </SellScreen>
  );
}
