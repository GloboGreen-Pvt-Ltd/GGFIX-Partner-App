import React, { useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Bluetooth, BluetoothConnected, Check, Minus, Plus, Printer, X } from 'lucide-react-native';
import { ResponsiveModal, SPACING } from '../../../components/responsive';
import { Touchable } from '../../../components/ios';
import { usePrinterConnection } from '../../../services/printer/usePrinterConnection';
import { PRINTER_STATE } from '../../../services/printer/types';
import LabelPreview from './LabelPreview';

const ACCENT = '#004C40';
const PRIMARY = '#006B57';
const MINT = '#DFF7EF';
const SOFT_MINT = '#F1FBF7';
const BORDER = '#DCE7E2';
const TEXT_PRIMARY = '#10201B';
const TEXT_SECONDARY = '#77817F';
const DANGER = '#B3261E';

const STATUS_TEXT = {
  [PRINTER_STATE.IDLE]: 'Not connected',
  [PRINTER_STATE.CHECKING_BLUETOOTH]: 'Checking Bluetooth…',
  [PRINTER_STATE.BLUETOOTH_DISABLED]: 'Bluetooth is off',
  [PRINTER_STATE.REQUESTING_PERMISSION]: 'Requesting Bluetooth permission…',
  [PRINTER_STATE.PERMISSION_DENIED]: 'Bluetooth permission required',
  [PRINTER_STATE.PRINTER_FOUND]: 'Select a printer',
  [PRINTER_STATE.CONNECTING]: 'Connecting…',
  [PRINTER_STATE.CONNECTED]: 'Connected',
  [PRINTER_STATE.GENERATING_LABEL]: 'Generating label…',
  [PRINTER_STATE.PRINTING]: 'Printing…',
  [PRINTER_STATE.PRINT_SUCCESS]: 'Label sent to printer',
  [PRINTER_STATE.PRINT_ERROR]: 'Print failed',
  [PRINTER_STATE.DISCONNECTED]: 'Printer disconnected',
};

// A single stray or missing manifest entry aside, this is Android-only — the
// native module targets Android only (same platform scope as
// modules/ggfix-downloads), so there is no iOS branch to wire here.
function openBluetoothSettings() {
  if (Platform.OS === 'android') {
    Linking.sendIntent?.('android.settings.BLUETOOTH_SETTINGS')?.catch?.(() => {});
  }
}

/**
 * "Print QR Slip" now opens this instead of the old expo-print system
 * dialog. `label` is the same ticket-derived data BarcodePrintScreen.js
 * already has — no refetch here.
 */
export default function PrinterConnectSheet({ visible, onClose, label, initialCopies = 1 }) {
  const {
    state, error, devices, selectedDevice, isConnected,
    listDevices, selectDevice, connect, disconnect, print,
  } = usePrinterConnection();
  const [copies, setCopies] = useState(() => Math.min(10, Math.max(1, Math.round(initialCopies || 1))));

  useEffect(() => {
    if (visible) {
      setCopies(Math.min(10, Math.max(1, Math.round(initialCopies || 1))));
      listDevices();
    }
    // initialCopies is only meant to seed the value when the sheet opens,
    // not to override the user's stepper taps on every render — depend on
    // `visible` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, listDevices]);

  const busy = state === PRINTER_STATE.CHECKING_BLUETOOTH
    || state === PRINTER_STATE.REQUESTING_PERMISSION
    || state === PRINTER_STATE.CONNECTING
    || state === PRINTER_STATE.GENERATING_LABEL
    || state === PRINTER_STATE.PRINTING;

  const handlePrimaryAction = () => {
    if (!isConnected) {
      connect();
      return;
    }
    print({
      trackingId: label.trackingId,
      brandModel: label.brandModel,
      customerName: label.customerName,
      deviceSecurity: label.deviceSecurity,
      createdOn: label.createdOn,
    }, copies);
  };

  const handleClose = () => {
    if (busy) return;
    onClose?.();
  };

  const StatusIcon = isConnected ? BluetoothConnected : Bluetooth;
  const isAlarmState = state === PRINTER_STATE.PRINT_ERROR
    || state === PRINTER_STATE.PERMISSION_DENIED
    || state === PRINTER_STATE.BLUETOOTH_DISABLED
    || state === PRINTER_STATE.DISCONNECTED;
  const statusColor = isAlarmState ? DANGER : (isConnected ? ACCENT : TEXT_SECONDARY);

  const primaryLabel = isConnected
    ? (busy ? 'Printing…' : (state === PRINTER_STATE.PRINT_SUCCESS ? 'Print Again' : (state === PRINTER_STATE.PRINT_ERROR ? 'Retry' : 'Print Label')))
    : (state === PRINTER_STATE.CONNECTING ? 'Connecting…' : 'Connect Printer');
  const primaryDisabled = busy || (!isConnected && !selectedDevice);

  return (
    <ResponsiveModal visible={visible} onClose={handleClose} maxWidth={480} scrollable>
      <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER, marginBottom: SPACING.md }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY }}>Print QR Label</Text>
          <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>TVS LP-46 Dlite · Bluetooth · 38 × 25 mm</Text>
        </View>
        <Touchable
          onPress={handleClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ height: 32, width: 32, borderRadius: 16, backgroundColor: MINT, alignItems: 'center', justifyContent: 'center' }}
          pressedStyle={{ opacity: 0.6 }}
        >
          <X size={16} color={ACCENT} />
        </Touchable>
      </View>

      <LabelPreview
        trackingId={label.trackingId}
        brandModel={label.brandModel}
        customerName={label.customerName}
        deviceSecurity={label.deviceSecurity}
        createdOn={label.createdOn}
      />

      <View
        style={{
          flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: SPACING.md,
          borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: SOFT_MINT,
        }}
      >
        <StatusIcon size={14} color={statusColor} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor, marginLeft: 6 }} numberOfLines={1}>
          {selectedDevice ? `${selectedDevice.name} · ${STATUS_TEXT[state] || ''}` : (STATUS_TEXT[state] || '')}
        </Text>
      </View>

      {error ? <Text style={{ fontSize: 12, color: DANGER, marginTop: 8 }}>{error}</Text> : null}

      {state === PRINTER_STATE.BLUETOOTH_DISABLED ? (
        <Touchable
          onPress={openBluetoothSettings}
          style={{ marginTop: SPACING.md, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: MINT }}
          pressedStyle={{ opacity: 0.85 }}
        >
          <Text style={{ fontWeight: '800', color: ACCENT }}>Open Bluetooth Settings</Text>
        </Touchable>
      ) : null}

      {state === PRINTER_STATE.PERMISSION_DENIED ? (
        <View style={{ marginTop: SPACING.md, flexDirection: 'row' }}>
          <Touchable
            onPress={listDevices}
            style={{ flex: 1, marginRight: 8, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: MINT }}
            pressedStyle={{ opacity: 0.85 }}
          >
            <Text style={{ fontWeight: '800', color: ACCENT }}>Try Again</Text>
          </Touchable>
          <Touchable
            onPress={() => Linking.openSettings?.()}
            style={{ flex: 1, marginLeft: 8, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: ACCENT }}
            pressedStyle={{ opacity: 0.85 }}
          >
            <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Open App Settings</Text>
          </Touchable>
        </View>
      ) : null}

      {state === PRINTER_STATE.PRINTER_FOUND && devices.length ? (
        <View style={{ marginTop: SPACING.md }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: TEXT_SECONDARY, letterSpacing: 0.5, marginBottom: 6 }}>
            PAIRED PRINTERS
          </Text>
          {devices.map((d) => {
            const active = selectedDevice?.address === d.address;
            return (
              <Touchable
                key={d.address}
                onPress={() => selectDevice(d.address)}
                style={{
                  flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, marginBottom: 8,
                  borderWidth: 1.5, borderColor: active ? ACCENT : BORDER, backgroundColor: active ? MINT : '#FFFFFF',
                }}
                pressedStyle={{ opacity: 0.85 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={1}>{d.name}</Text>
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>{d.address}</Text>
                </View>
                {active ? <Check size={18} color={ACCENT} /> : null}
              </Touchable>
            );
          })}
        </View>
      ) : null}

      {state === PRINTER_STATE.IDLE && !devices.length && !busy ? (
        <Touchable
          onPress={openBluetoothSettings}
          style={{ marginTop: SPACING.md, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: MINT }}
          pressedStyle={{ opacity: 0.85 }}
        >
          <Text style={{ fontWeight: '800', color: ACCENT }}>Pair Printer in Bluetooth Settings</Text>
        </Touchable>
      ) : null}

      {isConnected ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACING.md }}>
          <Text style={{ fontWeight: '800', color: TEXT_PRIMARY }}>Copies</Text>
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', borderRadius: 999,
              backgroundColor: SOFT_MINT, borderWidth: 1.5, borderColor: ACCENT, padding: 2,
            }}
          >
            <Touchable
              onPress={() => setCopies((c) => Math.max(1, c - 1))}
              style={{ height: 30, width: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}
              pressedStyle={{ opacity: 0.7 }}
            >
              <Minus size={13} color={ACCENT} />
            </Touchable>
            <View style={{ height: 30, width: 32, borderRadius: 15, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginHorizontal: 1 }}>
              <Text style={{ fontWeight: '800', color: ACCENT }}>{copies}</Text>
            </View>
            <Touchable
              onPress={() => setCopies((c) => Math.min(10, c + 1))}
              style={{ height: 30, width: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT }}
              pressedStyle={{ opacity: 0.8 }}
            >
              <Plus size={13} color="#FFFFFF" />
            </Touchable>
          </View>
        </View>
      ) : null}

      {state !== PRINTER_STATE.BLUETOOTH_DISABLED && state !== PRINTER_STATE.PERMISSION_DENIED ? (
        <Touchable
          onPress={handlePrimaryAction}
          disabled={primaryDisabled}
          style={{
            marginTop: SPACING.lg, borderRadius: 16, paddingVertical: 15,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: primaryDisabled ? BORDER : PRIMARY,
          }}
          pressedStyle={{ opacity: 0.85 }}
        >
          <Printer size={17} color="#FFFFFF" />
          <Text style={{ fontWeight: '800', color: '#FFFFFF', marginLeft: 8 }}>{primaryLabel}</Text>
        </Touchable>
      ) : null}

      {state === PRINTER_STATE.PRINT_SUCCESS ? (
        <Touchable onPress={onClose} style={{ marginTop: 10, alignItems: 'center', paddingVertical: 10 }} pressedStyle={{ opacity: 0.7 }}>
          <Text style={{ fontWeight: '800', color: TEXT_SECONDARY }}>Done</Text>
        </Touchable>
      ) : null}

      {isConnected ? (
        <Touchable onPress={disconnect} style={{ marginTop: 4, alignItems: 'center', paddingVertical: 8 }} pressedStyle={{ opacity: 0.7 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: TEXT_SECONDARY }}>Disconnect</Text>
        </Touchable>
      ) : null}
    </ResponsiveModal>
  );
}
