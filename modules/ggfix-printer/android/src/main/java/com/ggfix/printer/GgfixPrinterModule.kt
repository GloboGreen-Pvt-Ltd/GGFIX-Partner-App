package com.ggfix.printer

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.PendingIntent
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

// Standard Serial Port Profile UUID — what every Bluetooth Classic
// (RFCOMM) peripheral, including budget TSPL label printers, registers
// under. Not printer-specific.
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

private const val ACTION_USB_PERMISSION = "com.ggfix.printer.USB_PERMISSION"
// Standard "raw"/JetDirect printing port — what the overwhelming majority of
// Wi-Fi label/receipt printers listen on for a plain byte-stream print job
// (no protocol beyond "connect, write bytes, the printer prints them").
private const val DEFAULT_NETWORK_PORT = 9100

/**
 * One open transport link at a time — Bluetooth Classic/SPP, a raw TCP
 * socket (Wi-Fi network printers on the standard port above), or Android's
 * USB Host API (bulk OUT transfer to the printer's USB interface). All three
 * reduce to the same shape once open: write bytes, notice the link drop,
 * close. TSPL2 label generation (this module knows nothing about it) lives
 * entirely in JS — see src/services/printer/tspl.js — handed to write() as a
 * plain string, same as before this file supported more than Bluetooth.
 */
private interface ActiveLink {
  fun write(bytes: ByteArray)
  fun isOpen(): Boolean
  fun close()
  /** Blocks (on the watcher thread) until the link drops on its own or is closed. */
  fun blockUntilClosed()
}

private class BluetoothLink(private val socket: BluetoothSocket) : ActiveLink {
  override fun write(bytes: ByteArray) {
    socket.outputStream.write(bytes)
    socket.outputStream.flush()
  }
  override fun isOpen() = socket.isConnected
  override fun close() { try { socket.close() } catch (_: IOException) {} }
  override fun blockUntilClosed() {
    try {
      val buf = ByteArray(1)
      while (socket.inputStream.read(buf) >= 0) { /* link alive; nothing to do with the byte */ }
    } catch (_: IOException) {
      // Expected once the socket is closed, from either side.
    }
  }
}

private class NetworkLink(private val socket: Socket) : ActiveLink {
  override fun write(bytes: ByteArray) {
    socket.getOutputStream().write(bytes)
    socket.getOutputStream().flush()
  }
  override fun isOpen() = socket.isConnected && !socket.isClosed
  override fun close() { try { socket.close() } catch (_: IOException) {} }
  override fun blockUntilClosed() {
    try {
      val buf = ByteArray(1)
      while (socket.getInputStream().read(buf) >= 0) { /* link alive */ }
    } catch (_: IOException) {
      // Expected once the socket is closed, from either side.
    }
  }
}

private class UsbLink(
  private val connection: UsbDeviceConnection,
  private val usbInterface: UsbInterface,
  private val endpointOut: UsbEndpoint,
) : ActiveLink {
  @Volatile private var closed = false

  override fun write(bytes: ByteArray) {
    // bulkTransfer has a practical per-call size ceiling on some devices —
    // chunk defensively so a longer TSPL stream (many copies) can't silently
    // truncate.
    var offset = 0
    val chunkSize = 16 * 1024
    while (offset < bytes.size) {
      val len = minOf(chunkSize, bytes.size - offset)
      val chunk = bytes.copyOfRange(offset, offset + len)
      val sent = connection.bulkTransfer(endpointOut, chunk, chunk.size, 5000)
      if (sent < 0) throw IOException("USB bulk transfer failed")
      offset += len
    }
  }
  override fun isOpen() = !closed
  override fun close() {
    closed = true
    try { connection.releaseInterface(usbInterface) } catch (_: Exception) {}
    try { connection.close() } catch (_: Exception) {}
  }
  // USB has no read-side "link dropped" signal the way a socket does (no
  // input stream to block on) — a real detach is only observable via
  // ACTION_USB_DEVICE_DETACHED, which this module doesn't currently listen
  // for. The watcher thread just idles until close() flips `closed`, so
  // disconnect() (caller-driven) is what actually ends the watch.
  override fun blockUntilClosed() {
    while (!closed) {
      try { Thread.sleep(400) } catch (_: InterruptedException) { return }
    }
  }
}

/**
 * Generic Bluetooth Classic (RFCOMM/SPP) / Wi-Fi (raw TCP) / USB (Host API)
 * transport: list paired/attached devices, connect to one, exchange raw
 * bytes, notice when the link drops.
 */
class GgfixPrinterModule : Module() {
  private var link: ActiveLink? = null
  private var watcher: Thread? = null
  private var pendingUsbPermission: ((Boolean) -> Unit)? = null
  private var usbReceiverRegistered = false

  private val adapter: BluetoothAdapter?
    get() {
      val ctx = appContext.reactContext ?: return null
      val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      return manager?.adapter
    }

  private val usbManager: UsbManager?
    get() {
      val ctx = appContext.reactContext ?: return null
      return ctx.getSystemService(Context.USB_SERVICE) as? UsbManager
    }

  private val usbPermissionReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action != ACTION_USB_PERMISSION) return
      val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
      val callback = pendingUsbPermission
      pendingUsbPermission = null
      callback?.invoke(granted)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("GgfixPrinter")

    // Fires only when the link drops on its own (out of range, printer
    // powered off, cable unplugged) — a caller-initiated disconnect() does
    // not emit this.
    Events("onConnectionStateChanged")

    OnCreate {
      val ctx = appContext.reactContext
      if (ctx != null && !usbReceiverRegistered) {
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          ctx.registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          @Suppress("UnspecifiedRegisterReceiverFlag")
          ctx.registerReceiver(usbPermissionReceiver, filter)
        }
        usbReceiverRegistered = true
      }
    }

    Function("isBluetoothEnabled") {
      adapter?.isEnabled ?: false
    }

    Function("isUsbAvailable") {
      usbManager != null
    }

    Function("isConnected") {
      link?.isOpen() ?: false
    }

    AsyncFunction("getBondedDevices") {
      val a = adapter ?: throw CodedException("ERR_NO_ADAPTER", "No Bluetooth adapter on this device", null)
      try {
        a.bondedDevices.map { d: BluetoothDevice ->
          mapOf("name" to (d.name ?: d.address), "address" to d.address)
        }
      } catch (e: SecurityException) {
        throw CodedException("ERR_PERMISSION", "Bluetooth permission not granted", e)
      }
    }

    AsyncFunction("getUsbDevices") {
      val m = usbManager ?: throw CodedException("ERR_NO_USB", "USB host mode not available on this device", null)
      m.deviceList.values.map { d: UsbDevice ->
        mapOf(
          "deviceName" to d.deviceName,
          "productName" to (d.productName ?: "USB Printer"),
          "vendorId" to d.vendorId,
          "productId" to d.productId,
        )
      }
    }

    AsyncFunction("connect") { address: String ->
      val a = adapter ?: throw CodedException("ERR_NO_ADAPTER", "No Bluetooth adapter on this device", null)
      closeLink()
      try {
        val device = a.getRemoteDevice(address)
        // Discovery (if somehow left running) slows the connect handshake
        // and is irrelevant here — we only ever connect to an already
        // paired address.
        a.cancelDiscovery()
        val s = device.createRfcommSocketToServiceRecord(SPP_UUID)
        s.connect()
        val newLink = BluetoothLink(s)
        link = newLink
        startWatcher(newLink)
      } catch (e: SecurityException) {
        throw CodedException("ERR_PERMISSION", "Bluetooth permission not granted", e)
      } catch (e: IllegalArgumentException) {
        throw CodedException("ERR_INVALID_ADDRESS", "Not a valid Bluetooth address: $address", e)
      } catch (e: IOException) {
        closeLink()
        throw CodedException("ERR_CONNECT_FAILED", e.message ?: "Could not connect to $address", e)
      }
    }

    // `port` is a plain (non-nullable) Int with 0 meaning "use the default" —
    // deliberately not `Int?`, to avoid depending on how this DSL's argument
    // converter handles a nullable primitive, which isn't something worth
    // gambling a native build on when a sentinel value does the same job.
    AsyncFunction("connectNetwork") { host: String, port: Int ->
      closeLink()
      val resolvedPort = if (port <= 0) DEFAULT_NETWORK_PORT else port
      try {
        val s = Socket()
        // Explicit timeout — a wrong/unreachable IP fails fast with a clear
        // error instead of hanging the print sheet's "Connecting..." state
        // for the OS's own much longer default TCP timeout.
        s.connect(InetSocketAddress(host, resolvedPort), 6000)
        val newLink = NetworkLink(s)
        link = newLink
        startWatcher(newLink)
      } catch (e: Exception) {
        closeLink()
        throw CodedException("ERR_CONNECT_FAILED", e.message ?: "Could not connect to $host:$resolvedPort", e)
      }
    }

    AsyncFunction("connectUsb") { deviceName: String ->
      val m = usbManager ?: throw CodedException("ERR_NO_USB", "USB host mode not available on this device", null)
      val device = m.deviceList.values.find { it.deviceName == deviceName }
        ?: throw CodedException("ERR_INVALID_DEVICE", "USB device not found: $deviceName", null)
      closeLink()

      if (!m.hasPermission(device)) {
        val granted = requestUsbPermission(m, device)
        if (!granted) throw CodedException("ERR_PERMISSION", "USB permission was not granted", null)
      }

      // Most USB label/receipt printers expose a single interface with one
      // bulk OUT endpoint (class 7 = Printer, but several budget printers
      // report a vendor-specific class instead) — take the first bulk OUT
      // endpoint found on any interface rather than assuming class 7, so an
      // unusual printer still works.
      var foundInterface: UsbInterface? = null
      var foundEndpoint: UsbEndpoint? = null
      outer@ for (i in 0 until device.interfaceCount) {
        val iface = device.getInterface(i)
        for (e in 0 until iface.endpointCount) {
          val ep = iface.getEndpoint(e)
          if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.direction == UsbConstants.USB_DIR_OUT) {
            foundInterface = iface
            foundEndpoint = ep
            break@outer
          }
        }
      }
      val iface = foundInterface
        ?: throw CodedException("ERR_NO_ENDPOINT", "No bulk OUT endpoint found on this USB device", null)
      val endpoint = foundEndpoint
        ?: throw CodedException("ERR_NO_ENDPOINT", "No bulk OUT endpoint found on this USB device", null)

      val connection = m.openDevice(device)
        ?: throw CodedException("ERR_CONNECT_FAILED", "Could not open USB device", null)
      if (!connection.claimInterface(iface, true)) {
        connection.close()
        throw CodedException("ERR_CONNECT_FAILED", "Could not claim USB interface", null)
      }
      val newLink = UsbLink(connection, iface, endpoint)
      link = newLink
      startWatcher(newLink)
    }

    AsyncFunction("disconnect") {
      closeLink()
    }

    AsyncFunction("write") { data: String ->
      val l = link ?: throw CodedException("ERR_NOT_CONNECTED", "No printer connected", null)
      try {
        // The full TSPL2 command stream is printable ASCII text, so a plain
        // String round-trips the bridge with no byte-array/base64 overhead.
        l.write(data.toByteArray(Charsets.ISO_8859_1))
      } catch (e: IOException) {
        closeLink()
        throw CodedException("ERR_WRITE_FAILED", e.message ?: "Could not write to printer", e)
      }
    }

    OnDestroy {
      closeLink()
      val ctx = appContext.reactContext
      if (ctx != null && usbReceiverRegistered) {
        try { ctx.unregisterReceiver(usbPermissionReceiver) } catch (_: Exception) {}
        usbReceiverRegistered = false
      }
    }
  }

  /**
   * AsyncFunction bodies in this Kotlin DSL are plain (non-suspend) lambdas
   * run on a background thread by the framework — there is no coroutine
   * scope to suspend on here. A CountDownLatch is the standard way to make
   * an async, broadcast-receiver-driven Android API (requestPermission)
   * block this background thread synchronously instead.
   */
  private fun requestUsbPermission(manager: UsbManager, device: UsbDevice): Boolean {
    val latch = CountDownLatch(1)
    var granted = false
    pendingUsbPermission = { g -> granted = g; latch.countDown() }
    val ctx = appContext.reactContext
      ?: throw CodedException("ERR_NO_CONTEXT", "No app context available to request USB permission", null)
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    val intent = Intent(ACTION_USB_PERMISSION).setPackage(ctx.packageName)
    val pi = PendingIntent.getBroadcast(ctx, 0, intent, flags)
    manager.requestPermission(device, pi)
    // The permission dialog is user-driven — give it a generous but bounded
    // wait so a dismissed/ignored dialog can't hang this call forever.
    latch.await(60, TimeUnit.SECONDS)
    return granted
  }

  /**
   * A blocking read (or, for USB, a poll loop) is the only way to notice a
   * mid-session disconnect before the NEXT write() attempt. Closing the link
   * (from closeLink()) unblocks this immediately for Bluetooth/network;
   * for USB it's noticed on the next poll tick.
   */
  private fun startWatcher(current: ActiveLink) {
    val thread = Thread {
      current.blockUntilClosed()
      if (link === current) {
        link = null
        sendEvent("onConnectionStateChanged", mapOf("connected" to false))
      }
    }
    thread.isDaemon = true
    watcher = thread
    thread.start()
  }

  private fun closeLink() {
    watcher = null
    link?.close()
    link = null
  }
}
