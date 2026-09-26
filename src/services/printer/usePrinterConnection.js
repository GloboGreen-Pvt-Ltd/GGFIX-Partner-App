import { useCallback, useEffect, useRef, useState } from 'react';
import * as Transport from '../../../modules/ggfix-printer';
import { PRINTER_STATE, PRINTER_TRANSPORT } from './types';
import { buildLabelCommand } from './tspl';
import { getLastDevice, saveLastDevice } from './storage';
import { getBluetoothPermission, PERMISSION_GRANTED, requestBluetoothPermission } from './bluetoothPermissions';

/**
 * Owns the full printer lifecycle for one screen across all three
 * transports (Bluetooth / Wi-Fi network / USB): availability/permission
 * checks, device listing (Bluetooth/USB) or address entry (network),
 * connect/reconnect, sending a label. Screens use only this hook —
 * everything else under services/printer/ is an implementation detail
 * composed here.
 *
 * `state` drives the sheet's status text; `isConnected` is tracked
 * separately so it stays true across the GENERATING_LABEL/PRINTING/
 * PRINT_SUCCESS/PRINT_ERROR sub-states of a print, instead of being
 * reconstructed from an ambiguous PRINT_ERROR (which can mean "permission
 * denied", "could not connect" or "print failed" without this).
 */
export function usePrinterConnection() {
  const [state, setState] = useState(PRINTER_STATE.IDLE);
  const [error, setError] = useState(null);
  const [transport, setTransportState] = useState(PRINTER_TRANSPORT.BLUETOOTH);
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [networkHost, setNetworkHost] = useState('');
  const [networkPort, setNetworkPort] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const isPrintingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = Transport.addConnectionListener(({ connected }) => {
      if (!connected) {
        setIsConnected(false);
        setState(PRINTER_STATE.DISCONNECTED);
      }
    });
    return unsubscribe;
  }, []);

  // Switching transport clears whatever was found/selected for the previous
  // one (a Bluetooth device selection makes no sense once you've switched to
  // USB) but does NOT touch an already-open connection — the user switches
  // transport before connecting, not mid-session.
  const setTransport = useCallback((next) => {
    setTransportState(next);
    setState(PRINTER_STATE.IDLE);
    setError(null);
    setDevices([]);
    setSelectedDevice(null);
  }, []);

  const listDevices = useCallback(async () => {
    setError(null);
    if (!Transport.isAvailable()) {
      setState(PRINTER_STATE.PRINT_ERROR);
      setError('This build does not include Bluetooth printer support — rebuild the app to pick up the printer module.');
      return;
    }

    if (transport === PRINTER_TRANSPORT.NETWORK) {
      // No listing over Wi-Fi — the shop types in the printer's IP (most of
      // these budget label printers don't support any discovery protocol).
      // Prefill from whatever was last used, then it's just "ready to type".
      const last = await getLastDevice();
      if (last?.transport === PRINTER_TRANSPORT.NETWORK) {
        if (last.host) setNetworkHost(last.host);
        if (last.port) setNetworkPort(String(last.port));
      }
      setState(PRINTER_STATE.PRINTER_FOUND);
      return;
    }

    if (transport === PRINTER_TRANSPORT.USB) {
      if (!Transport.isUsbAvailable()) {
        setState(PRINTER_STATE.PRINT_ERROR);
        setError('This device does not support USB host mode, so a wired USB printer cannot be used here.');
        return;
      }
      try {
        const attached = await Transport.getUsbDevices();
        setDevices(attached);
        const last = await getLastDevice();
        const preselected = last?.transport === PRINTER_TRANSPORT.USB
          ? attached.find((d) => d.deviceName === last.address)
          : null;
        if (preselected) setSelectedDevice(preselected);
        if (attached.length) {
          setState(PRINTER_STATE.PRINTER_FOUND);
        } else {
          setState(PRINTER_STATE.IDLE);
          setError('No USB printer detected — plug it in via an OTG cable and make sure it is powered on.');
        }
      } catch (e) {
        setState(PRINTER_STATE.PRINT_ERROR);
        setError(e?.message || 'Could not read attached USB devices.');
      }
      return;
    }

    // Bluetooth (default transport, unchanged from before this hook also
    // supported network/USB).
    setState(PRINTER_STATE.CHECKING_BLUETOOTH);
    if (!Transport.isBluetoothEnabled()) {
      setState(PRINTER_STATE.BLUETOOTH_DISABLED);
      return;
    }

    setState(PRINTER_STATE.REQUESTING_PERMISSION);
    let permission = await getBluetoothPermission();
    if (permission !== PERMISSION_GRANTED) permission = await requestBluetoothPermission();
    if (permission !== PERMISSION_GRANTED) {
      setState(PRINTER_STATE.PERMISSION_DENIED);
      return;
    }

    try {
      const bonded = await Transport.getBondedDevices();
      setDevices(bonded);
      const last = await getLastDevice();
      const preselected = (!last || last.transport === PRINTER_TRANSPORT.BLUETOOTH)
        ? bonded.find((d) => d.address === last?.address)
        : null;
      if (preselected) setSelectedDevice(preselected);
      if (bonded.length) {
        setState(PRINTER_STATE.PRINTER_FOUND);
      } else {
        setState(PRINTER_STATE.IDLE);
        setError('No paired printer found — pair the TVS LP-46 Dlite in Android Bluetooth settings first.');
      }
    } catch (e) {
      setState(PRINTER_STATE.PRINT_ERROR);
      setError(e?.message || 'Could not read paired devices.');
    }
  }, [transport]);

  // Bluetooth/USB devices are matched by their own identifying field
  // (`address` for Bluetooth, `deviceName` for USB — the OS device path, not
  // a display name) — `id` here is whichever of those the caller passed.
  const selectDevice = useCallback((id) => {
    setSelectedDevice((current) => {
      const found = devices.find((d) => d.address === id || d.deviceName === id);
      return found || current;
    });
  }, [devices]);

  const connect = useCallback(async () => {
    setError(null);

    if (transport === PRINTER_TRANSPORT.NETWORK) {
      const host = networkHost.trim();
      if (!host) return;
      const port = networkPort.trim() ? Number(networkPort.trim()) : undefined;
      setState(PRINTER_STATE.CONNECTING);
      try {
        await Transport.connectNetwork(host, port);
        await saveLastDevice({ transport, host, port, name: host });
        setIsConnected(true);
        setState(PRINTER_STATE.CONNECTED);
      } catch (e) {
        setIsConnected(false);
        setState(PRINTER_STATE.PRINT_ERROR);
        setError(e?.message || `Could not connect to ${host}.`);
      }
      return;
    }

    if (!selectedDevice) return;
    setState(PRINTER_STATE.CONNECTING);
    try {
      if (transport === PRINTER_TRANSPORT.USB) {
        await Transport.connectUsb(selectedDevice.deviceName);
        await saveLastDevice({ transport, address: selectedDevice.deviceName, name: selectedDevice.productName });
      } else {
        await Transport.connect(selectedDevice.address);
        await saveLastDevice({ transport, address: selectedDevice.address, name: selectedDevice.name });
      }
      setIsConnected(true);
      setState(PRINTER_STATE.CONNECTED);
    } catch (e) {
      setIsConnected(false);
      setState(PRINTER_STATE.PRINT_ERROR);
      setError(e?.message || `Could not connect to ${selectedDevice.name || selectedDevice.productName}.`);
    }
  }, [transport, selectedDevice, networkHost, networkPort]);

  const disconnect = useCallback(async () => {
    try { await Transport.disconnect(); } catch (_) { /* already gone */ }
    setIsConnected(false);
    setState(PRINTER_STATE.IDLE);
  }, []);

  const print = useCallback(async (labelData, copies = 1) => {
    // Guards a double tap landing before the first re-render disables the
    // button — the button's own `disabled` covers the steady state, this
    // covers the gap between tap and paint.
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;
    setError(null);
    try {
      setState(PRINTER_STATE.GENERATING_LABEL);
      const command = buildLabelCommand(labelData, { copies });
      setState(PRINTER_STATE.PRINTING);
      await Transport.write(command);
      // Only send-confirmation is verifiable over any of these transports
      // (none of them have a read-back channel) — this state means "handed
      // to the printer", not "the sticker came out".
      setState(PRINTER_STATE.PRINT_SUCCESS);
    } catch (e) {
      setIsConnected(Transport.isConnected());
      setState(PRINTER_STATE.PRINT_ERROR);
      setError(e?.message || 'Could not send the label to the printer.');
    } finally {
      isPrintingRef.current = false;
    }
  }, []);

  return {
    state, error, transport, setTransport,
    devices, selectedDevice, networkHost, setNetworkHost, networkPort, setNetworkPort,
    isConnected, listDevices, selectDevice, connect, disconnect, print,
  };
}
