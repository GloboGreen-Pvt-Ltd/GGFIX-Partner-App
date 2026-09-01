package com.ggfix.downloads

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Writes a file into the phone's public Download collection.
 *
 * Why this exists: expo-file-system has no MediaStore binding, so the only
 * route it offers to a public folder is the Storage Access Framework — and
 * Android 11+ refuses a SAF grant on the Download folder itself, which is the
 * one folder we want. MediaStore.Downloads is the supported API for exactly
 * this, needs no runtime permission on Android 10+, and drops the file where
 * Files → Download lists it.
 *
 * Nothing here asks for broad storage access: on API 29+ the insert is scoped
 * to the Downloads collection and the app can only ever touch its own rows.
 */
class GgfixDownloadsModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("GgfixDownloads")

    /**
     * Copy [sourcePath] into Download/ under [fileName].
     *
     * Returns { name, uri }. The name is the one MediaStore settled on — it
     * appends " (1)", " (2)" and so on when the name is taken — and the uri is
     * what the download notification opens when tapped.
     */
    AsyncFunction("saveToDownloads") { sourcePath: String, fileName: String, mimeType: String ->
      val source = File(sourcePath.removePrefix("file://"))
      if (!source.exists()) throw CodedException("ERR_SOURCE_MISSING", "No file at $sourcePath", null)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        insertViaMediaStore(source, fileName, mimeType)
      } else {
        // API 24-28 predates scoped storage: the Download directory is a real
        // path and WRITE_EXTERNAL_STORAGE (declared maxSdkVersion=28) covers it.
        copyToLegacyDownloads(source, fileName)
      }
    }
  }

  private fun insertViaMediaStore(source: File, fileName: String, mimeType: String): Map<String, String> {
    val resolver = appContext.reactContext?.contentResolver
      ?: throw CodedException("ERR_NO_CONTEXT", "No content resolver available", null)

    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, fileName)
      put(MediaStore.Downloads.MIME_TYPE, mimeType)
      // IS_PENDING hides the row until the bytes are written, so a reader can
      // never open a half-copied PDF, and a crash mid-write leaves no visible
      // stub behind.
      put(MediaStore.Downloads.IS_PENDING, 1)
    }

    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val item: Uri = resolver.insert(collection, values)
      ?: throw CodedException("ERR_INSERT_FAILED", "MediaStore refused the Download entry", null)

    try {
      resolver.openOutputStream(item)?.use { out ->
        FileInputStream(source).use { input -> input.copyTo(out) }
      } ?: throw CodedException("ERR_OPEN_STREAM", "Could not open the Download entry for writing", null)

      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(item, values, null, null)
    } catch (e: Throwable) {
      // Roll the pending row back; a failed download must not leave a 0-byte
      // invoice in the user's Downloads.
      runCatching { resolver.delete(item, null, null) }
      throw e
    }

    return mapOf("name" to (resolvedName(resolver, item) ?: fileName), "uri" to item.toString())
  }

  /** The name MediaStore settled on after any de-duplication it applied. */
  private fun resolvedName(
    resolver: android.content.ContentResolver,
    item: Uri,
  ): String? = runCatching {
    resolver.query(item, arrayOf(MediaStore.Downloads.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) c.getString(0) else null
    }
  }.getOrNull()

  private fun copyToLegacyDownloads(source: File, fileName: String): Map<String, String> {
    val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    if (!dir.exists()) dir.mkdirs()

    // MediaStore de-duplicates for us on API 29+; below that we do it by hand
    // so a second invoice for the same ticket never overwrites the first.
    val dot = fileName.lastIndexOf('.')
    val stem = if (dot > 0) fileName.substring(0, dot) else fileName
    val ext = if (dot > 0) fileName.substring(dot) else ""
    var target = File(dir, fileName)
    var n = 1
    while (target.exists()) {
      target = File(dir, "$stem ($n)$ext")
      n += 1
    }

    FileInputStream(source).use { input ->
      FileOutputStream(target).use { out -> input.copyTo(out) }
    }
    return mapOf("name" to target.name, "uri" to android.net.Uri.fromFile(target).toString())
  }
}
