import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { ArrowRight, Check, CircleCheck, CircleHelp, Power } from 'lucide-react-native';
import { getConditionGroups, getConditionOptions, getFunctionalIssues, getScreeningQuestions } from '../../../api/masterData';
import { FALLBACK_GROUPS, optKey, sortGroups } from '../../shared/sell/SellScreenConditionScreen';
import { screeningFallback } from '../../shared/sell/SellScreeningScreen';
import { rf } from '../../../utils/responsive';
import { C, CONTENT_MAX, FieldLabel, PickerModal, PrimaryButton, Section, Segmented, SelectField, SellScreen, TextField, reportErrors } from './kit';
import { LISTING_TYPES, useSellDraft, sellDraftStore } from './draft';
import ConditionArt, { artFor } from './conditionArt';

// Page 4 (step 2 of 4) — working state, description, defects, missing parts,
// accessories in the box and warranty.

const WORKING = [
  { value: 'WORKING', label: 'Working', sub: 'Fully functional', icon: CircleCheck },
  { value: 'DEAD', label: 'Dead', sub: 'Not working / for parts', icon: Power },
  { value: 'UNVERIFIED', label: 'Unverified', sub: 'Not tested yet', icon: CircleHelp },
];
// Per device family (no Earphones — rarely boxed any more).
const ACCESSORY_SETS = {
  mobile: ['Original Box', 'Charging Cable', 'Adapter', 'Bill / Invoice'],
  laptop: ['Original Box', 'Charger', 'Laptop Bag', 'Bill / Invoice'],
  tablet: ['Original Box', 'Charging Cable', 'Adapter', 'Stylus / Pen', 'Bill / Invoice'],
  watch: ['Original Box', 'Charging Cable', 'Extra Strap', 'Bill / Invoice'],
  audio: ['Original Box', 'Charging Case', 'Charging Cable', 'Bill / Invoice'],
};
const familyOf = (p) => {
  const t = `${p?.categoryCode || ''} ${p?.categoryName || ''}`.toLowerCase();
  if (/laptop|notebook|macbook/.test(t)) return 'laptop';
  if (/tab|ipad/.test(t)) return 'tablet';
  if (/watch/.test(t)) return 'watch';
  if (/audio|ear|head|bud|speaker/.test(t)) return 'audio';
  return 'mobile';
};
const ITEM_CONDITIONS = [
  { value: 'NEW', label: 'New' },
  { value: 'USED', label: 'Used' },
  { value: 'REFURBISHED', label: 'Refurbished' },
];

// Illustrated, tappable card for a problem or an accessory (selected: coloured
// border, tinted art, tick). `danger` marks a selected problem in red.
function ArtCard({ label, kind, on, onPress, width, danger }) {
  const ring = on ? (danger ? C.red : C.teal) : C.border;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      className="active:opacity-85"
      style={{ width, borderRadius: 12, borderWidth: on ? 1.6 : 1, borderColor: ring, backgroundColor: '#FFFFFF', overflow: 'hidden' }}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 8, backgroundColor: on ? (danger ? C.redBg : C.mint) : '#FFFFFF' }}>
        <ConditionArt kind={kind} size={Math.min(64, Math.round(width * 0.5))} />
      </View>
      <View style={{ minHeight: 42, justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 6, backgroundColor: '#F7F8FA' }}>
        <Text numberOfLines={2} style={{ fontSize: rf(10.5), fontWeight: '700', color: C.text, textAlign: 'center', lineHeight: rf(13.5) }}>{label}</Text>
      </View>
      {on ? (
        <View style={{ position: 'absolute', top: 6, right: 6, height: 18, width: 18, borderRadius: 9, backgroundColor: danger ? C.red : C.teal, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={12} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}
const WARRANTY = [
  { id: 'NONE', label: 'No warranty' },
  { id: 'MANUFACTURER', label: 'Manufacturer Warranty' },
  { id: 'SHOP', label: 'Shop Warranty' },
];
const DESC_LIMIT = { DETAILED: 500, SHORT: 150 };
const DESC_MIN = { DETAILED: 20, SHORT: 10 };

// Accepts 12 Oct 2025, 12/10/2025, 2025-10-12 → ISO date, or null.
function parseDate(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let d = null;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(`${s}T00:00:00`);
  else if (dmy) d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  else d = new Date(s);
  return !Number.isNaN(d.getTime()) ? d : null;
}

export default function SellStepConditionScreen({ navigation }) {
  const { draft, ready } = useSellDraft();
  const c = draft.condition;
  const type = draft.listingType;
  const isDevice = type === LISTING_TYPES.DEVICE;
  const isAccessory = type === LISTING_TYPES.ACCESSORY;
  const set = (values) => sellDraftStore.patch('condition', values);

  const [issues, setIssues] = useState([]);
  // Card grid: 3 per row on phones, 4 on large phones / small tablets, 6 on tablets.
  const { width: winW } = useWindowDimensions();
  const gridW = Math.min(winW, CONTENT_MAX) - 32;
  const cols = winW >= 900 ? 6 : winW >= 560 ? 4 : 3;
  const gap = 10;
  const cardW = Math.floor((gridW - gap * (cols - 1)) / cols);
  const product = draft.product;
  const setProduct = (values) => sellDraftStore.patch('product', values);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [errors, setErrors] = useState({});

  // Defect list from master data (per category). Empty → the section hides.
  useEffect(() => {
    if (!ready || !isDevice) return undefined;
    let alive = true;
    getFunctionalIssues(draft.product.categoryId)
      .then((rows) => { if (alive) setIssues((rows || []).filter((r) => r?.name && r.isActive !== false).map((r) => r.name)); })
      .catch(() => { if (alive) setIssues([]); });
    return () => { alive = false; };
  }, [ready, isDevice, draft.product.categoryId]);

  // Old Partner app mobile condition questions (same APIs and fallbacks as
  // SellScreening / SellScreenCondition): screening questions per flow
  // (WORKING / DEAD) and physical-condition groups for the category.
  const flow = c.working === 'DEAD' ? 'DEAD' : 'WORKING';
  const [questions, setQuestions] = useState([]);
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    if (!ready || !isDevice) return undefined;
    let alive = true;
    getScreeningQuestions(flow, draft.product.categoryId)
      .then((list) => { if (alive) setQuestions(list?.length ? list : screeningFallback(flow)); })
      .catch(() => { if (alive) setQuestions(screeningFallback(flow)); });
    return () => { alive = false; };
  }, [ready, isDevice, flow, draft.product.categoryId]);
  useEffect(() => {
    if (!ready || !isDevice) return undefined;
    let alive = true;
    (async () => {
      let list = [];
      try { list = await getConditionGroups(draft.product.categoryId); } catch (_) {}
      const sorted = sortGroups(list?.length ? list : FALLBACK_GROUPS);
      const withOpts = await Promise.all(sorted.map(async (g) => {
        const remote = list?.length ? await getConditionOptions(g.id).catch(() => []) : [];
        const raw = remote?.length ? remote : (g.options || []).map((o, i) => ({ id: `${g.id}-${i}`, label: o }));
        const seen = new Set();
        return { ...g, opts: raw.filter((o) => o?.label && !seen.has(o.label) && seen.add(o.label)) };
      }));
      if (alive) setGroups(withOpts);
    })();
    return () => { alive = false; };
  }, [ready, isDevice, draft.product.categoryId]);
  // Saved answers are matched by question id, then by question text (as before).
  const answerFor = (q) => (c.screeningAnswers || []).find((a) => a.questionId === q.id
    || (a.question && q.question && a.question.trim().toLowerCase() === q.question.trim().toLowerCase()))?.answer;
  const setAnswer = (q, answer) => set({
    screeningAnswers: [...(c.screeningAnswers || []).filter((a) => a.questionId !== q.id && a.question !== q.question), { questionId: q.id, answer, question: q.question }],
  });
  const pickFor = (g) => (c.conditions || []).find((x) => (x.groupCode && g.code && x.groupCode.toUpperCase() === g.code.toUpperCase())
    || (x.groupName && g.name && x.groupName.trim().toLowerCase() === g.name.trim().toLowerCase()));
  const setPick = (g, o) => set({
    conditions: [...(c.conditions || []).filter((x) => x !== pickFor(g)), { groupCode: g.code, groupName: g.name, optionId: o.id, optionLabel: o.label }],
  });

  const toggleIn = (key, value) => set({ [key]: c[key].includes(value) ? c[key].filter((x) => x !== value) : [...c[key], value] });
  const limit = DESC_LIMIT[c.descriptionMode] || 500;
  const needsWorking = !isAccessory;
  const showDefects = isDevice && issues.length > 0;
  const family = familyOf(product);
  const isMobile = family === 'mobile';
  const ACCESSORIES = ACCESSORY_SETS[family];
  // Description only for devices that are Dead / Unverified (accessories & parts keep it).
  const showDescription = !needsWorking || c.working === 'DEAD' || c.working === 'UNVERIFIED';
  // A Working device must carry its IMEI (phones) or serial number (others).
  const idRequired = isDevice && c.working === 'WORKING';

  const validate = () => {
    const e = {};
    if (isDevice && !product.itemCondition) e.itemCondition = 'Select the condition type';
    const imei = String(product.imei || '').replace(/\s/g, '');
    if (idRequired && !imei) e.imei = isMobile ? 'Enter the 15-digit IMEI' : 'Enter the serial number';
    else if (isDevice && imei && isMobile && !/^\d{15}$/.test(imei)) e.imei = 'IMEI must be 15 digits';
    else if (isDevice && imei && !isMobile && !/^[A-Za-z0-9-]{4,30}$/.test(imei)) e.imei = 'Serial number: 4-30 letters or digits';
    if (needsWorking && !c.working) e.working = 'Select the item condition';
    const len = c.description.trim().length;
    if (showDescription && len < DESC_MIN[c.descriptionMode]) e.description = `Write at least ${DESC_MIN[c.descriptionMode]} characters`;
    if (showDescription && len > limit) e.description = `Keep it under ${limit} characters`;
    if (isDevice && c.working === 'DEAD' && showDefects && !c.issues.length && !c.missingParts.trim()) {
      e.issues = 'Tell buyers what is not working';
    }
    if (isDevice && questions.some((q) => !answerFor(q))) e.screening = 'Answer every device check question';
    if (isDevice && groups.some((g) => !pickFor(g))) e.physical = 'Pick the condition for every part';
    if (c.warrantyType !== 'NONE') {
      const d = parseDate(c.warrantyValidTill);
      if (!d) e.warranty = 'Enter the warranty end date, e.g. 12/10/2026';
      else if (d < new Date(new Date().toDateString())) e.warranty = 'This warranty has already ended';
    }
    setErrors(e);
    return reportErrors(e);
  };

  const next = () => {
    if (!validate()) return;
    // Keep only answers for the questions shown (the flow may have switched).
    if (isDevice) {
      set({
        screeningAnswers: questions.filter((q) => answerFor(q)).map((q) => ({ questionId: q.id, answer: answerFor(q), question: q.question })),
        conditions: groups.map((g) => pickFor(g)).filter(Boolean),
      });
    }
    if (c.warrantyType !== 'NONE') {
      const d = parseDate(c.warrantyValidTill);
      // Local calendar date: toISOString() is UTC and shifts it a day back in IST.
      set({ warrantyValidTill: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` });
    } else if (c.warrantyValidTill) {
      set({ warrantyValidTill: '' });
    }
    navigation.navigate('SellStepPhotos');
  };

  return (
    <SellScreen
      title="Condition & Description"
      subtitle="Step 2 of 4 • Item condition & info"
      step={2}
      stepLabels={['Device', 'Details', 'Photos', 'Price', 'Publish']}
      onBack={() => navigation.goBack()}
      footer={<PrimaryButton title="Next" iconRight={ArrowRight} onPress={next} disabled={!ready} />}
    >
      {needsWorking ? (
        <View style={{ marginTop: 10 }}>
          <FieldLabel label="Item Condition" required />
          <Segmented options={WORKING} value={c.working} onChange={(v) => { set({ working: v }); setErrors((e) => ({ ...e, working: null })); }} />
          {errors.working ? <Text style={{ fontSize: rf(11), color: C.red, marginTop: 4 }}>{errors.working}</Text> : null}
        </View>
      ) : null}

      {isDevice ? (
        <View style={{ marginTop: 16 }}>
          <FieldLabel label="Condition Type" required />
          <Segmented options={ITEM_CONDITIONS} value={product.itemCondition} onChange={(v) => { setProduct({ itemCondition: v }); setErrors((e) => ({ ...e, itemCondition: null })); }} />
          {errors.itemCondition ? <Text style={{ fontSize: rf(11), color: C.red, marginTop: 4 }}>{errors.itemCondition}</Text> : null}
          <TextField
            label={isMobile ? 'IMEI Number' : 'Serial Number'}
            required={idRequired}
            hint={idRequired ? undefined : '(Optional)'}
            value={product.imei}
            onChangeText={(t) => { setProduct({ imei: isMobile ? t.replace(/[^0-9]/g, '') : t.replace(/[^A-Za-z0-9-]/g, '').toUpperCase() }); setErrors((e) => ({ ...e, imei: null })); }}
            placeholder={isMobile ? '15-digit IMEI (dial *#06#)' : 'Serial number on the device label'}
            keyboardType={isMobile ? 'number-pad' : 'default'}
            maxLength={isMobile ? 15 : 30}
            error={errors.imei}
          />
        </View>
      ) : null}

      {showDescription ? (
      <View style={{ marginTop: 16 }}>
        <FieldLabel label="Description" required />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ v: 'DETAILED', l: 'Detailed (Recommended)' }, { v: 'SHORT', l: 'Short' }].map(({ v, l }) => {
            const on = c.descriptionMode === v;
            return (
              <Pressable
                key={v}
                onPress={() => set({ descriptionMode: v })}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                className="active:opacity-80"
                style={{ borderRadius: 999, paddingHorizontal: 12, height: 30, justifyContent: 'center', borderWidth: 1, borderColor: on ? C.teal : C.border, backgroundColor: on ? C.mint : '#FFFFFF' }}
              >
                <Text style={{ fontSize: rf(11.5), fontWeight: '800', color: on ? C.teal : C.muted }}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextField
          value={c.description}
          onChangeText={(t) => { set({ description: t }); setErrors((e) => ({ ...e, description: null })); }}
          placeholder={c.descriptionMode === 'SHORT'
            ? 'e.g. Excellent condition, battery 92%, no scratches.'
            : 'Overall condition, scratches or dents, battery health, repairs done, ownership, box contents…'}
          multiline
          maxLength={limit}
          counter
          error={errors.description}
          style={{ marginTop: 8 }}
        />
      </View>
      ) : null}

      {isDevice && questions.length ? (
        <Section title="Quick Device Check" sub="Answer each question about the device's current condition">
          {questions.map((q, i) => (
            <View key={q.id} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text, lineHeight: rf(18) }}>{`${i + 1}. ${q.question}`}</Text>
              {q.helperText ? <Text style={{ fontSize: rf(11), color: C.muted, marginTop: 2 }}>{q.helperText}</Text> : null}
              <Segmented
                options={(q.options || ['Yes', 'No']).map((o) => ({ value: o, label: o }))}
                lines={2}
                value={answerFor(q)}
                onChange={(v) => { setAnswer(q, v); setErrors((x) => ({ ...x, screening: null })); }}
                style={{ marginTop: 8 }}
              />
            </View>
          ))}
          {errors.screening ? <Text style={{ fontSize: rf(11), color: C.red }}>{errors.screening}</Text> : null}
        </Section>
      ) : null}

      {isDevice && groups.length ? (
        <Section title="Physical Condition" sub="Pick the option that best matches each part of the device">
          {groups.map((g) => (
            <View key={g.id} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: rf(12.5), fontWeight: '700', color: C.text, marginBottom: 8 }}>{g.name}</Text>
              <Segmented
                columns={cols}
                lines={3}
                options={g.opts.map((o) => ({ value: optKey(g, o), label: o.label }))}
                value={(() => { const p = pickFor(g); const o = p && g.opts.find((x) => x.id === p.optionId || x.label === p.optionLabel); return o ? optKey(g, o) : null; })()}
                onChange={(v) => { const o = g.opts.find((x) => optKey(g, x) === v); if (o) setPick(g, o); setErrors((x) => ({ ...x, physical: null })); }}
              />
            </View>
          ))}
          {errors.physical ? <Text style={{ fontSize: rf(11), color: C.red }}>{errors.physical}</Text> : null}
        </Section>
      ) : null}

      {showDefects ? (
        <Section
          title={c.working === 'DEAD' ? "What's not working?" : 'Functional or Physical Problems'}
          sub="Choose every problem the device has — buyers see these on the listing"
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
            {issues.map((name) => (
              <ArtCard
                key={name}
                label={name}
                kind={artFor(name)}
                width={cardW}
                danger
                on={c.issues.includes(name)}
                onPress={() => { toggleIn('issues', name); setErrors((e) => ({ ...e, issues: null })); }}
              />
            ))}
          </View>
          {errors.issues ? <Text style={{ fontSize: rf(11), color: C.red, marginTop: 6 }}>{errors.issues}</Text> : null}
        </Section>
      ) : null}

      {!isAccessory ? (
        <TextField
          label="Missing or Damaged Parts"
          hint="(Optional)"
          value={c.missingParts}
          onChangeText={(t) => { set({ missingParts: t }); setErrors((e) => ({ ...e, issues: null })); }}
          placeholder="e.g. Back glass cracked, SIM tray missing"
          maxLength={200}
          style={{ marginTop: 16 }}
        />
      ) : null}

      {isDevice ? (
        <Section title="Do you have the following?" sub="Select the accessories included with the device">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
            {ACCESSORIES.map((a) => (
              <ArtCard key={a} label={a} kind={artFor(a)} width={cardW} on={c.accessories.includes(a)} onPress={() => toggleIn('accessories', a)} />
            ))}
          </View>
          <TextField value={c.accessoriesOther} onChangeText={(t) => set({ accessoriesOther: t })} placeholder="Other (specify)" maxLength={80} style={{ marginTop: 10 }} />
        </Section>
      ) : null}

      <Section title="Warranty Information">
        <SelectField
          value={WARRANTY.find((w) => w.id === c.warrantyType)?.label}
          placeholder="Select warranty"
          onPress={() => setWarrantyOpen(true)}
          style={{ marginTop: 0 }}
        />
        {c.warrantyType !== 'NONE' ? (
          <TextField
            label="Valid Till"
            required
            value={c.warrantyValidTill}
            onChangeText={(t) => { set({ warrantyValidTill: t }); setErrors((e) => ({ ...e, warranty: null })); }}
            placeholder="DD/MM/YYYY"
            maxLength={12}
            keyboardType="numbers-and-punctuation"
            error={errors.warranty}
          />
        ) : null}
      </Section>

      <PickerModal
        visible={warrantyOpen}
        title="Warranty"
        options={WARRANTY}
        searchable={false}
        selectedId={c.warrantyType}
        onSelect={(o) => { setWarrantyOpen(false); set({ warrantyType: o.id }); setErrors((e) => ({ ...e, warranty: null })); }}
        onClose={() => setWarrantyOpen(false)}
      />
    </SellScreen>
  );
}
