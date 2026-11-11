import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { ArrowRight, CloudUpload, FileSpreadsheet, Trash2 } from 'lucide-react-native';
import { rf } from '../../../../utils/responsive';
import { C, ErrorBox, PrimaryButton, SellScreen } from '../kit';
import { useBulkDraft } from './bulkDraft';
import { FileError } from './bulkFiles';
import { FlowSteps, flowTitle } from './BulkFlowKit';
import { DraftLoading, NoBatch } from './BulkUi';
import { importSheet } from './excelImport';
import { pickSheetFile, readSheetRows } from './excelSheet';

// Step 2 — Upload Excel File (.xlsx / .csv, max 10 MB) → Validate File reads
// it and matches every row to the catalogue (Step 3 shows the result).

const sizeLabel = (b) => (b == null ? '' : b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function BulkExcelUploadScreen({ navigation }) {
  const { draft, ready, set } = useBulkDraft();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!ready) return <DraftLoading title="Bulk Listing" onBack={() => navigation.goBack()} />;
  if (!draft.batchType) return <NoBatch title="Bulk Listing" navigation={navigation} />;

  const choose = async () => {
    setError(null);
    try {
      const f = await pickSheetFile();
      if (f) setFile(f);
    } catch (e) {
      setError(e instanceof FileError ? e.message : 'Could not open the file. Please try again.');
    }
  };

  const validate = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await readSheetRows(file);
      const res = await importSheet(rows, draft);
      if (res.sheetError) { setError(res.sheetError); return; }
      set((s) => ({
        ...s,
        template: res.template ? { ...s.template, ...res.template } : s.template,
        rows: res.rows,
        sheet: { name: file.name, size: file.size, total: res.total, errors: res.errors, defaults: res.defaults, at: Date.now() },
      }));
      navigation.navigate('BulkExcelReview');
    } catch (e) {
      setError(e instanceof FileError ? e.message : 'Could not validate the file. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SellScreen title={flowTitle(draft)} onBack={() => navigation.goBack()}
      footer={<PrimaryButton title="Validate File" iconRight={ArrowRight} variant="green" loading={busy} disabled={!file} onPress={validate} />}>
      <FlowSteps step={2} />
      <Text style={{ fontSize: rf(19), fontWeight: '900', color: C.text, marginTop: 14 }}>Upload Excel File</Text>

      <View style={{ alignItems: 'center', borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.green, backgroundColor: C.greenBg, paddingVertical: 26, paddingHorizontal: 16, marginTop: 14 }}>
        <CloudUpload size={46} color={C.green} strokeWidth={1.6} />
        <Text style={{ fontSize: rf(14), color: C.text, marginTop: 10, textAlign: 'center' }}>{Platform.OS === 'web' ? 'Drag & drop your Excel file here' : 'Select your Excel file here'}</Text>
        <Text style={{ fontSize: rf(13), color: C.muted, marginTop: 6 }}>or</Text>
        <PrimaryButton title="Choose File" variant="outline" small onPress={choose} style={{ marginTop: 8, paddingHorizontal: 22, borderColor: C.green }} />
      </View>

      {file ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 14 }}>
          <View style={{ height: 38, width: 34, borderRadius: 6, backgroundColor: '#1D7A45', alignItems: 'center', justifyContent: 'center' }}>
            <FileSpreadsheet size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
            <Text numberOfLines={1} style={{ fontSize: rf(13), fontWeight: '800', color: C.text }}>{file.name}</Text>
            {file.size ? <Text style={{ fontSize: rf(11.5), color: C.muted, marginTop: 2 }}>{sizeLabel(file.size)}</Text> : null}
          </View>
          <Pressable onPress={() => { setFile(null); setError(null); }} accessibilityRole="button" accessibilityLabel="Remove file" hitSlop={8}>
            <Trash2 size={19} color={C.red} />
          </Pressable>
        </View>
      ) : null}

      <Text style={{ fontSize: rf(11.5), color: C.muted, textAlign: 'center', marginTop: 12 }}>Supported: .xlsx, .csv   |   Max size: 10 MB</Text>
      {busy ? <Text style={{ fontSize: rf(12), color: C.teal, textAlign: 'center', marginTop: 8 }}>Checking every row against the catalogue…</Text> : null}
      {error ? <ErrorBox message={error} style={{ marginTop: 14 }} /> : null}
    </SellScreen>
  );
}
