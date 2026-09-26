import { useCallback, useEffect, useRef, useState } from 'react';
import * as Transport from '../../../modules/ggfix-printer';
import { PRINTER_STATE } from './types';
import { buildLabelCommand } from './tspl';
import { getLastDevice, saveLastDevice } from './storage';
import { getBluetoothPermission, PERMISSION_GRANTED, requestBluetoothPermission } from './bluetoothPermissions';

/**
 * Owns the full Bluetooth-printer lifecycle for one screen: Bluetooth/
 * permission checks, paired-device listing, connect/reconnect, sending a
 * label. Screens use only this hook — everything else under
 * services/printer/ is an implementation detail composed here.
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
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
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

  const listDevices = useCallback(async () => {
    setError(null);
    if (!Transport.isAvailable()) {
      setState(PRINTER_STATE.PRINT_ERROR);
      setError('This build does not include Bluetooth printer support — rebuild the app to pick up the printer module.');
      return;
    }

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
      const preselected = last ? bonded.find((d) => d.address === last.address) : null;
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
  }, []);

  const selectDevice = useCallback((address) => {
    setSelectedDevice((current) => {
      const found = devices.find((d) => d.address === address);
      return found || current;
    });
  }, [devices]);

  const connect = useCallback(async () => {
    if (!selectedDevice) return;
    setError(null);
    setState(PRINTER_STATE.CONNECTING);
    try {
      await Transport.connect(selectedDevice.address);
      await saveLastDevice(selectedDevice);
      setIsConnected(true);
      setState(PRINTER_STATE.CONNECTED);
    } catch (e) {
      setIsConnected(false);
      setState(PRINTER_STATE.PRINT_ERROR);
      setError(e?.message || `Could not connect to ${selectedDevice.name}.`);
    }
  }, [selectedDevice]);

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
      // Only send-confirmation is verifiable over SPP (the printer has no
      // read-back channel) — this state means "handed to the printer", not
      // "the sticker came out".
      setState(PRINTER_STATE.PRINT_SUCCESS);
    } catch (e) {
      setIsConnected(Transport.isConnected());
      setState(PRINTER_STATE.PRINT_ERROR);
      setError(e?.message || 'Could not send the label to the printer.');
    } finally {
      isPrintingRef.current = false;
    }
  }, []);

  return { state, error, devices, selectedDevice, isConnected, listDevices, selectDevice, connect, disconnect, print };
}
