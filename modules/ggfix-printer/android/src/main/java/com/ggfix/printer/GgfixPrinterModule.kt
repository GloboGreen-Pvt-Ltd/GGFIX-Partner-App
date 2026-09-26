package com.ggfix.printer

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID

// Standard Serial Port Profile UUID — what every Bluetooth Classic
// (RFCOMM) peripheral, including budget TSPL label printers, registers
// under. Not printer-specific.
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

/**
 * Generic Bluetooth Classic (RFCOMM/SPP) transport: list paired devices,
 * connect to one, exchange raw bytes, notice when the link drops.
 *
 * Deliberately knows nothing about any printer command language — TSPL
 * label generation lives entirely in JS (src/services/printer/tspl.js) and
 * is handed to write() as a plain string. Keeping this module dumb means a
 * wrong bet on the command language only costs a JS-side rewrite.
 */
class GgfixPrinterModule : Module() {
  private var socket: BluetoothSocket? = null
  private var watcher: Thread? = null

  private val adapter: BluetoothAdapter?
    get() {
      val ctx = appContext.reactContext ?: return null
      val manager = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      return manager?.adapter
    }

  override fun definition() = ModuleDefinition {
    Name("GgfixPrinter")

    // Fires only when the link drops on its own (out of range, printer
    // powered off) — a caller-initiated disconnect() does not emit this.
    Events("onConnectionStateChanged")

    Function("isBluetoothEnabled") {
      adapter?.isEnabled ?: false
    }

    Function("isConnected") {
      socket?.isConnected ?: false
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

    AsyncFunction("connect") { address: String ->
      val a = adapter ?: throw CodedException("ERR_NO_ADAPTER", "No Bluetooth adapter on this device", null)
      closeSocket()
      try {
        val device = a.getRemoteDevice(address)
        // Discovery (if somehow left running) slows the connect handshake
        // and is irrelevant here — we only ever connect to an already
        // paired address.
        a.cancelDiscovery()
        val s = device.createRfcommSocketToServiceRecord(SPP_UUID)
        s.connect()
        socket = s
        startWatcher(s)
      } catch (e: SecurityException) {
        throw CodedException("ERR_PERMISSION", "Bluetooth permission not granted", e)
      } catch (e: IllegalArgumentException) {
        throw CodedException("ERR_INVALID_ADDRESS", "Not a valid Bluetooth address: $address", e)
      } catch (e: IOException) {
        closeSocket()
        throw CodedException("ERR_CONNECT_FAILED", e.message ?: "Could not connect to $address", e)
      }
    }

    AsyncFunction("disconnect") {
      closeSocket()
    }

    AsyncFunction("write") { data: String ->
      val s = socket ?: throw CodedException("ERR_NOT_CONNECTED", "No printer connected", null)
      try {
        // The full TSPL2 command stream is printable ASCII text, so a plain
        // String round-trips the bridge with no byte-array/base64 overhead.
        s.outputStream.write(data.toByteArray(Charsets.ISO_8859_1))
        s.outputStream.flush()
      } catch (e: IOException) {
        closeSocket()
        throw CodedException("ERR_WRITE_FAILED", e.message ?: "Could not write to printer", e)
      }
    }

    OnDestroy {
      closeSocket()
    }
  }

  /**
   * A blocking read is the only way to notice a mid-session disconnect
   * before the NEXT write() attempt — the printer has nothing to say back
   * over SPP, so any returned byte or EOF both just confirm the link state.
   * Closing the socket (from closeSocket()) unblocks this read immediately.
   */
  private fun startWatcher(s: BluetoothSocket) {
    val thread = Thread {
      try {
        val buf = ByteArray(1)
        while (s.inputStream.read(buf) >= 0) { /* link alive; nothing to do with the byte */ }
      } catch (_: IOException) {
        // Expected once the socket is closed, from either side.
      }
      if (socket === s) {
        socket = null
        sendEvent("onConnectionStateChanged", mapOf("connected" to false))
      }
    }
    thread.isDaemon = true
    watcher = thread
    thread.start()
  }

  private fun closeSocket() {
    watcher = null
    try { socket?.close() } catch (_: IOException) { }
    socket = null
  }
}
