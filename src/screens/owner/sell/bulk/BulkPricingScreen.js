import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Check, Info } from 'lucide-react-native';
import { notify } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import {
  C, Card, ErrorBox, FieldError, PrimaryButton, Section, Segmented, SellScreen, TextField, ToggleRow, cleanAmount, money,
} from '../kit';
import {
  discountError, finalPrice, priceError, rowSpecLine, rowTitle, useBulkDraft, validateRows,
} from './bulkDraft';
import {
  DraftLoading, IndexBadge, MintBar, NoBatch, STEP_LABELS, TOTAL_STEPS,
} from './BulkUi';

// Page 6 — Pricing & Stock: one price for all items or a price per variant,
// negotiable, and how buyers get the item (the server supports pickup at the
// shop and shipping). Publish / draft is chosen on Review.

function Radio({ on, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
      <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? C.green : '#C9CED6', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ height: 10, width: 10, borderRadius: 5, backgroundColor: C.green }} /> : null}
      </View>
      <Text style={{ fontSize: rf(13), color: C.text, marginLeft: 10 }}>{label}</Text>
    </Pressable>
  );
}

function Checkbox({ on, label, sub, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
      <View style={{ height: 20, width: 20, borderRadius: 5, borderWidth: 2, borderColor: on ? C.green : '#C9CED6', backgroundColor: on ? C.green : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: rf(13), color: C.text }}>{label}</Text>
        {sub ? <Text style={{ fontSize: rf(10.5), color: C.muted, marginTop: 1 }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

const RULES = [
  { value: 'NONE', label: 'None' },
  { value: 'FLAT', label: 'Flat ₹' },
  { value: 'PERCENT', label: 'Percentage %' },
];

export default function BulkPricingScreen({ navigation }) {
  const { draft, ready, patch, set } = useBulkDraft();
  const [showErrors, setShowErrors] = useState(false);

  if (!ready) return <DraftLoading title="Pricing & Publish Options" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Pricing & Publish Options" navigation={navigation} />;

  const pr = draft.pricing;
  const rows = draft.rows.filter((r) => !r.result?.productId);
  const totalQty = rows.reduce((n, r) => n + (Number(r.quantity) || 0), 0);
  const ruleOn = pr.discountType !== 'NONE';
  const ruleError = discountError(pr);
  const fulfilmentError = pr.fulfilment.length ? null : 'Choose at least one option';

  const setPrice = (key, text) => {
    const v = cleanAmount(text);
    set((s) => ({ ...s, rows: s.rows.map((r) => (r.key === key ? { ...r, price: v } : r)) }));
  };
  const copyFirstPrice = () => {
    const first = rows.find((r) => !priceError(r));
    if (!first) { notify('Enter a price first', 'Type a price for one item, then copy it to the rest.'); return; }
    set((s) => ({ ...s, rows: s.rows.map((r) => (r.result?.productId ? r : { ...r, price: first.price })) }));
  };
  const toggleFulfilment = (opt) => {
    const has = pr.fulfilment.includes(opt);
    patch('pricing', { fulfilment: has ? pr.fulfilment.filter((x) => x !== opt) : [...pr.fulfilment, opt] });
  };

  const priceErrors = rows.map((r) => priceError(r)).filter(Boolean).length;
  const samePrice = (pr.priceMode || 'VARIANT') === 'SAME';
  const prices = [...new Set(rows.map((r) => String(r.price ?? '')))];
  const commonPrice = prices.length === 1 ? prices[0] : '';
  const setAllPrices = (text) => {
    const v = cleanAmount(text);
    set((s) => ({ ...s, rows: s.rows.map((r) => (r.result?.productId ? r : { ...r, price: v })) }));
  };

  const next = () => {
    const itemErrors = Object.keys(validateRows(draft)).length;
    if (priceErrors || ruleError || fulfilmentError || itemErrors) {
      setShowErrors(true);
      const msg = priceErrors ? `${priceErrors} item${priceErrors > 1 ? 's need' : ' needs'} a price.`
        : ruleError || fulfilmentError || 'Some items have missing details — go back to Items to fix them.';
      notify('Check the pricing', msg);
      return;
    }
    navigation.navigate('BulkReview');
  };

  return (
    <SellScreen
      title="Pricing & Stock"
      onBack={() => navigation.goBack()}
      step={5}
      totalSteps={TOTAL_STEPS}
      stepLabels={STEP_LABELS}
      footer={<PrimaryButton title="Continue" onPress={next} />}
    >
      <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text, marginTop: 6 }}>Pricing Type</Text>
      <Radio on={samePrice} label="Same price for all items" onPress={() => { patch('pricing', { priceMode: 'SAME' }); if (!commonPrice) copyFirstPrice(); }} />
      <Radio on={!samePrice} label="Different price per variant" onPress={() => patch('pricing', { priceMode: 'VARIANT' })} />

      {samePrice ? (
        <TextField
          label="Price per item"
          required
          prefix="₹"
          value={commonPrice}
          onChangeText={setAllPrices}
          placeholder="0"
          keyboardType="decimal-pad"
          maxLength={9}
          error={showErrors && priceErrors ? 'Enter a selling price' : null}
        />
      ) : null}

      <ToggleRow
        label="Negotiable"
        sub="Buyers can send you an offer on these listings"
        value={pr.negotiable}
        onChange={(v) => patch('pricing', { negotiable: v })}
      />

      <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text, marginTop: 16 }}>Fulfillment</Text>
      <Checkbox on={pr.fulfilment.includes('PICKUP')} label="Buyer will visit my shop" sub="Pickup from your shop" onPress={() => toggleFulfilment('PICKUP')} />
      <Checkbox on={pr.fulfilment.includes('SHIPPING')} label="Courier / Shipping" sub="Ship to the buyer" onPress={() => toggleFulfilment('SHIPPING')} />
      <FieldError error={fulfilmentError} />
      <MintBar label="Total Quantity" value={totalQty} />

      {!samePrice ? (
      <Section title="Price per Variant" style={{ marginTop: 16 }}>
        <Card style={{ paddingVertical: 4 }}>
          {rows.map((row, i) => {
            const index = draft.rows.findIndex((r) => r.key === row.key) + 1;
            const err = showErrors ? priceError(row) : null;
            const fp = finalPrice(row, pr);
            const changed = ruleOn && !ruleError && fp != null && fp !== Number(row.price);
            return (
              <View key={row.key} style={{ paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: '#F1F2F4' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IndexBadge n={index} tone={err ? 'red' : 'teal'} />
                  <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: rf(12.5), fontWeight: '800', color: C.text }}>{rowTitle(row)}</Text>
                    <Text numberOfLines={1} style={{ fontSize: rf(10.5), color: C.muted, marginTop: 1 }}>{[rowSpecLine(row), `Qty ${row.quantity}`].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', width: 112, height: 40, borderRadius: 10, borderWidth: 1, borderColor: err ? C.red : C.border, paddingHorizontal: 10, marginLeft: 8 }}>
                    <Text style={{ fontSize: rf(13), fontWeight: '700', color: C.text, marginRight: 4 }}>₹</Text>
                    <TextInput
                      value={String(row.price ?? '')}
                      onChangeText={(v) => setPrice(row.key, v)}
                      placeholder="0"
                      placeholderTextColor={C.faint}
                      keyboardType="decimal-pad"
                      maxLength={10}
                      accessibilityLabel={`Price for item ${index}`}
                      // minWidth 0: on web an <input> otherwise keeps its ~190px intrinsic width
                      // inside this 112px box and the right-aligned price is drawn out of view.
                      style={{ flex: 1, minWidth: 0, fontSize: rf(13), fontWeight: '700', color: C.text, paddingVertical: 0, textAlign: 'right' }}
                    />
                  </View>
                </View>
                {changed ? <Text style={{ fontSize: rf(10.5), color: C.green, marginTop: 4, textAlign: 'right' }}>{`${money(fp)} after discount`}</Text> : null}
                {err ? <Text style={{ fontSize: rf(10.5), color: C.red, marginTop: 4, textAlign: 'right' }}>{err}</Text> : null}
              </View>
            );
          })}
        </Card>
      </Section>
      ) : null}

      <Section title="Bulk Discount" sub="Optional — reduces every item’s price above.">
        <Segmented options={RULES} value={pr.discountType} onChange={(v) => patch('pricing', { discountType: v, ...(v === 'NONE' ? { discountValue: '' } : {}) })} />
        {ruleOn ? (
          <>
            <TextField
              value={pr.discountValue}
              onChangeText={(v) => patch('pricing', { discountValue: cleanAmount(v) })}
              placeholder={pr.discountType === 'FLAT' ? 'Amount off each item' : 'Percent off each item'}
              prefix={pr.discountType === 'FLAT' ? '₹' : '%'}
              keyboardType="decimal-pad"
              maxLength={9}
              error={showErrors || pr.discountValue ? ruleError : null}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <Info size={13} color={C.muted} />
              <Text style={{ marginLeft: 5, fontSize: rf(10.5), color: C.muted }}>Applied per item. No item goes below ₹1.</Text>
            </View>
          </>
        ) : null}
      </Section>

      {showErrors && priceErrors ? <ErrorBox message={`${priceErrors} item${priceErrors > 1 ? 's need' : ' needs'} a selling price.`} /> : null}
    </SellScreen>
  );
}
