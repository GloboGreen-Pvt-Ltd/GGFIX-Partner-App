import React from 'react';
import { Text, View } from 'react-native';
import { Boxes, Cpu, FilePen, Headphones } from 'lucide-react-native';
import { confirm } from '../../../components/confirm';
import { rf } from '../../../utils/responsive';
import { C, Card, OptionCard, PrimaryButton, SellScreen } from './kit';
import { LISTING_TYPES, draftTitle, hasUnsavedProgress, useSellDraft, sellDraftStore } from './draft';

// Page 2 — what is being sold. Device / Spare Part / Accessory start the
// single-listing wizard; Bulk Listing opens the bulk flow.

const PHONE_ART = 'https://cdn.neargfix.com/buy&sell-categories-image/Sell-Phone.png';

export default function SellListingTypeScreen({ navigation }) {
  const { draft, ready } = useSellDraft();
  const resumable = ready && hasUnsavedProgress(draft);

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
    <SellScreen title="Add New Listing" subtitle="Choose what you want to sell" onBack={() => navigation.goBack()}>
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

      <View style={{ gap: 12, marginTop: 12 }}>
        <OptionCard image={PHONE_ART} tint="#EEF4F8" title="Device" sub="Mobile, laptop, tablet, smartwatch, etc." onPress={() => start(LISTING_TYPES.DEVICE)} />
        <OptionCard icon={Cpu} tint="#EAF6EF" iconColor="#2F7D4F" title="Spare Part" sub="Screen, battery, camera, charging port, etc." onPress={() => start(LISTING_TYPES.SPARE_PART)} />
        <OptionCard icon={Headphones} tint="#FFF4E8" iconColor={C.amber} title="Accessory" sub="Charger, cable, case, screen guard, etc." onPress={() => start(LISTING_TYPES.ACCESSORY)} />
        <OptionCard icon={Boxes} tint="#F3EEE6" iconColor="#8A5A2B" title="Bulk Listing" sub="List multiple units (same model/variant)." onPress={() => navigation.navigate('BulkListingType')} />
      </View>
    </SellScreen>
  );
}
