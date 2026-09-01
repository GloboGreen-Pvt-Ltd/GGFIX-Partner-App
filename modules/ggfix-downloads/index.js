import { requireOptionalNativeModule } from 'expo';

/**
 * Native bridge to MediaStore.Downloads. Optional on purpose: an APK built
 * before this module existed simply does not contain it, and the caller needs
 * to say so plainly rather than crash on import.
 */
const GgfixDownloads = requireOptionalNativeModule('GgfixDownloads');

export const isAvailable = () => GgfixDownloads != null;

/**
 * Copy a local file into the phone's public Download folder.
 *
 * @param {string} sourcePath  local file:// or absolute path
 * @param {string} fileName    display name including extension
 * @param {string} mimeType    e.g. 'application/pdf'
 * @returns {Promise<{name: string, uri: string}>} the name MediaStore actually
 *          used — it appends " (1)" and so on rather than overwriting — plus the
 *          content:// uri the download notification opens.
 */
export async function saveToDownloads(sourcePath, fileName, mimeType) {
  if (!GgfixDownloads) throw new Error('GgfixDownloads native module is not available in this build.');
  return await GgfixDownloads.saveToDownloads(sourcePath, fileName, mimeType);
}
