import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { ArrowRight, ChevronDown, House, Store, Truck, Users } from 'lucide-react-native';
import { notify } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import { C, PrimaryButton, SellScreen } from '../kit';
import { FULFIL } from '../SellStepPriceScreen';
import { useBulkDraft } from './bulkDraft';
import { FlowSteps, RadioRow, flowTitle } from './BulkFlowKit';
import { DraftLoading, NoBatch } from './BulkUi';

// Step 5 — Set Publishing Options: who can buy (Customer / Shop) and how they
// get it (delivery radius for home delivery). Prices, quantities and warranty
// come from the Excel rows. Listings have no expiry (no server expiry field).

const BUYERS = [
  { key: 'CUSTOMER', label: 'Customer', Icon: Users },
  { key: 'SHOP', label: 'Shop', Icon: Store },
];
const OPTION_ICON = { HOME: Truck, VISIT: House, SHOP: Store, COURIER: Truck };

export default function BulkFlowPricingScreen({ navigation }) {
  const { draft, ready, set } = useBulkDraft();
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!ready || f) return;
    const pr = draft.pricing;
    const def = draft.sheet?.defaults || {};
    const buyerType = pr.buyerType || def.buyerType || 'CUSTOMER';
    const option = (pr.fulfilmentKeys || [])[0] || (FULFIL[buyerType].some((o) => o.key === def.option) ? def.option : null);
    setF({ buyerType, option, radius: pr.deliveryRadiusKm || def.radius || '' });
  }, [ready, f, draft]);

  if (!ready || !f) return <DraftLoading title="Bulk Listing" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Bulk Listing" navigation={navigation} />;

  const options = FULFIL[f.buyerType];
  const up = (v) => { setError(null); setF((s) => ({ ...s, ...v })); };

  const publish = () => {
    const opt = options.find((o) => o.key === f.option);
    if (!opt) { setError('Choose a fulfillment option.'); return; }
    if (opt.key === 'HOME' && !(Number(f.radius) > 0)) { setError('Enter the delivery radius in KM.'); return; }
    set((s) => ({
      ...s,
      pricing: {
        ...s.pricing,
        priceMode: 'VARIANT',
        discountType: 'NONE',
        discountValue: '',
        buyerType: f.buyerType,
        fulfilmentKeys: [opt.key],
        fulfilment: [opt.value],
        deliveryRadiusKm: opt.key === 'HOME' ? String(Number(f.radius)) : '',
        listingValidity: 'NO_EXPIRY',
        publishMode: 'PUBLISH',
      },
    }));
    navigation.navigate('BulkCreating');
  };

  return (
    <SellScreen title={flowTitle(draft)} onBack={() => navigation.goBack()}
      footer={<PrimaryButton title="Publish Listings" iconRight={ArrowRight} variant="green" onPress={publish} />}>
      <FlowSteps step={5} />
      <Text style={{ fontSize: rf(19), fontWeight: '900', color: C.text, marginTop: 14 }}>Set Publishing Options</Text>

      <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginTop: 14 }}>Buyer Category<Text style={{ color: C.red }}> *</Text></Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        {BUYERS.map((b) => {
          const on = f.buyerType === b.key;
          return (
            <Pressable key={b.key} onPress={() => up({ buyerType: b.key, option: null, radius: '' })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={b.label}
              style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? C.green : C.border, backgroundColor: on ? C.greenBg : '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <b.Icon size={18} color={on ? C.green : C.text} />
              <Text style={{ fontSize: rf(13.5), fontWeight: '800', color: on ? C.green : C.text, marginLeft: 8 }}>{b.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginTop: 16 }}>Fulfillment Option<Text style={{ color: C.red }}> *</Text></Text>
      {options.map((o) => {
        const Icon = OPTION_ICON[o.key] || Truck;
        return (
          <RadioRow
            key={o.key}
            title={o.title}
            sub={o.key === 'HOME' ? 'Delivery radius (KM)' : o.sub}
            selected={f.option === o.key}
            onPress={() => up({ option: o.key })}
            right={(
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {o.key === 'HOME' && f.option === 'HOME' ? (
                  <TextInput value={f.radius} onChangeText={(t) => up({ radius: t.replace(/\D/g, '').slice(0, 3) })} placeholder="KM" placeholderTextColor={C.faint}
                    keyboardType="number-pad" maxLength={3} accessibilityLabel="Delivery radius in KM"
                    style={{ width: 58, height: 38, borderRadius: 8, borderWidth: 1, borderColor: C.border, textAlign: 'center', fontSize: rf(13.5), fontWeight: '700', color: C.text, backgroundColor: '#FFFFFF' }} />
                ) : <Icon size={18} color={C.muted} />}
              </View>
            )}
          />
        );
      })}

      <Text style={{ fontSize: rf(13), fontWeight: '800', color: C.text, marginTop: 16 }}>Listing Validity</Text>
      <Pressable onPress={() => notify('No Expiry', 'Listings stay live until you mark them sold or inactive.')} accessibilityRole="button" accessibilityLabel="Listing validity: No Expiry"
        style={{ height: 46, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginTop: 8 }}>
        <Text style={{ flex: 1, fontSize: rf(13.5), fontWeight: '700', color: C.text }}>No Expiry</Text>
        <ChevronDown size={17} color={C.muted} />
      </Pressable>

      {error ? <Text style={{ fontSize: rf(12), color: C.red, fontWeight: '700', marginTop: 12 }}>{error}</Text> : null}
    </SellScreen>
  );
}
