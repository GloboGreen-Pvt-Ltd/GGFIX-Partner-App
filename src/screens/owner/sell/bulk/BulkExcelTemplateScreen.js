import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ArrowRight, CircleCheck, Download, FileSpreadsheet } from 'lucide-react-native';
import { notify } from '../../../../components/confirm';
import { rf } from '../../../../utils/responsive';
import { C, PrimaryButton, SellScreen } from '../kit';
import { useBulkDraft } from './bulkDraft';
import { FileError, shareTextFile } from './bulkFiles';
import { FlowSteps, flowTitle, isSame } from './BulkFlowKit';
import { DraftLoading, NoBatch } from './BulkUi';
import { templateCsv } from './excelSheet';

// Step 1 — Download Excel Template (CSV, opens in Excel / Sheets).

const INCLUDES = [
  'Category, Brand, Model (common)',
  'Storage, Color, Condition',
  'IMEI/Serial (if applicable)',
  'Price, Quantity, Warranty',
  'Buyer Category & Fulfillment Option',
];

export default function BulkExcelTemplateScreen({ navigation }) {
  const { draft, ready } = useBulkDraft();
  const [busy, setBusy] = useState(false);
  if (!ready) return <DraftLoading title="Bulk Listing" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Bulk Listing" navigation={navigation} />;
  const same = isSame(draft);

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await shareTextFile({ name: same ? 'NearGFix_Same_Model_Template.csv' : 'NearGFix_Multiple_Models_Template.csv', text: templateCsv(draft.batchType) });
      if (res?.downloaded) notify('Template downloaded', 'Open it in Excel, fill your products and save.', { preset: 'done' });
    } catch (e) {
      notify('Could not save the template', e instanceof FileError ? e.message : 'Please try again.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SellScreen title={flowTitle(draft)} onBack={() => navigation.goBack()}
      footer={<PrimaryButton title="Next" iconRight={ArrowRight} variant="green" onPress={() => navigation.navigate('BulkExcelUpload')} />}>
      <FlowSteps step={1} />
      <Text style={{ fontSize: rf(19), fontWeight: '900', color: C.text, marginTop: 14 }}>Download Excel Template</Text>
      <Text style={{ fontSize: rf(13), color: C.muted, marginTop: 4 }}>Use our template to add product details.</Text>

      <Pressable onPress={download} accessibilityRole="button" accessibilityLabel="Download template" className="active:opacity-85"
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, marginTop: 16 }}>
        <View style={{ height: 44, width: 40, borderRadius: 8, backgroundColor: '#1D7A45', alignItems: 'center', justifyContent: 'center' }}>
          <FileSpreadsheet size={24} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
          <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text }}>{same ? 'Same Model Template' : 'Multiple Models Template'}</Text>
          <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>
            {same ? 'For one model with multiple units\n(variants: storage, color, IMEI, etc.)' : 'For different models in one file\n(one row per model / variant)'}
          </Text>
        </View>
        {busy ? <ActivityIndicator color={C.text} /> : <Download size={22} color={C.text} />}
      </Pressable>

      <View style={{ backgroundColor: C.greenBg, borderRadius: 14, padding: 14, marginTop: 16 }}>
        <Text style={{ fontSize: rf(14), fontWeight: '800', color: C.text, marginBottom: 4 }}>Template Includes</Text>
        {INCLUDES.map((t) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <CircleCheck size={17} color="#FFFFFF" fill={C.green} />
            <Text style={{ fontSize: rf(12.5), color: C.text, marginLeft: 8 }}>{t}</Text>
          </View>
        ))}
      </View>
      <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 12 }}>Rows starting with “EXAMPLE” are skipped. Several IMEIs in one row: separate them with “;”.</Text>
    </SellScreen>
  );
}
