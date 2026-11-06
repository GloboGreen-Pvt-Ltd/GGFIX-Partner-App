import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { EncodingType, cacheDirectory, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';

// CSV in and out of the bulk flow: share a generated sheet (sample / report)
// and read a picked one. Web uses a Blob download and the browser's File.

export class FileError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Write `text` to a file and open the share sheet (web: download it). */
export async function shareTextFile({ name, text, mimeType = 'text/csv' }) {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') throw new FileError('UNSUPPORTED', 'Downloads are not available here.');
    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { downloaded: true };
  }
  if (!cacheDirectory) throw new FileError('UNSUPPORTED', 'Could not create the file on this device.');
  const uri = `${cacheDirectory}${name}`;
  await writeAsStringAsync(uri, text, { encoding: EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new FileError('UNSUPPORTED', 'Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: name, UTI: 'public.comma-separated-values-text' });
  return { shared: true };
}

const EXCEL_EXT = /\.(xlsx|xlsm|xls|xlsb|ods|numbers)$/i;
const NO_NATIVE = /native module|cannot find|not available|unimplemented|undefined is not|null is not/i;

/**
 * Pick a CSV file and read it. Resolves { name, text } or null when cancelled.
 * Throws FileError: PICKER_UNAVAILABLE (app build has no document picker yet),
 * EXCEL (an Excel workbook was picked), READ (file could not be read).
 */
export async function pickCsvText() {
  let DocumentPicker;
  try {
    // The native module only exists in builds made after it was added.
    // eslint-disable-next-line global-require
    DocumentPicker = require('expo-document-picker');
    if (typeof DocumentPicker?.getDocumentAsync !== 'function') throw new Error('not available');
  } catch (_) {
    throw new FileError('PICKER_UNAVAILABLE', 'CSV import needs the latest app build');
  }
  let res;
  try {
    res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  } catch (e) {
    if (NO_NATIVE.test(String(e?.message || ''))) throw new FileError('PICKER_UNAVAILABLE', 'CSV import needs the latest app build');
    throw new FileError('READ', 'Could not open the file picker. Please try again.');
  }
  if (!res || res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset?.uri) return null;
  const name = asset.name || asset.uri.split('/').pop() || 'sheet.csv';
  if (EXCEL_EXT.test(name)) {
    throw new FileError('EXCEL', 'Excel files can’t be read here. In Excel use File → Save As → CSV, then upload the .csv file.');
  }
  try {
    let text;
    if (Platform.OS === 'web') {
      text = asset.file?.text ? await asset.file.text() : await (await fetch(asset.uri)).text();
    } else {
      text = await readAsStringAsync(asset.uri, { encoding: EncodingType.UTF8 });
    }
    return { name, text: String(text || '') };
  } catch (_) {
    throw new FileError('READ', 'Could not read this file. Make sure it is a .csv file and try again.');
  }
}

/** File-name-safe date stamp: 2026-11-03_1430 */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
