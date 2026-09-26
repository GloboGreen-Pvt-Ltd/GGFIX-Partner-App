import React, { useEffect, useState } from 'react';
import { Linking, Platform, Text, TextInput, View } from 'react-native';
import { Bluetooth, BluetoothConnected, Check, Minus, Plus, Printer, Usb, Wifi, X } from 'lucide-react-native';
import { ResponsiveModal, SPACING } from '../../../components/responsive';
import { Touchable } from '../../../components/ios';
import { usePrinterConnection } from '../../../services/printer/usePrinterConnection';
import { PRINTER_STATE, PRINTER_TRANSPORT } from '../../../services/printer/types';
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

const TRANSPORT_TABS = [
  { key: PRINTER_TRANSPORT.BLUETOOTH, label: 'Bluetooth', icon: Bluetooth },
  { key: PRINTER_TRANSPORT.NETWORK, label: 'Wi-Fi', icon: Wifi },
  { key: PRINTER_TRANSPORT.USB, label: 'USB', icon: Usb },
];

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
 *
 * Three transports share this one sheet: Bluetooth (paired-device list,
 * unchanged from before Wi-Fi/USB existed), Wi-Fi (a raw TCP socket to the
 * printer's IP — these budget printers have no discovery protocol, so it's
 * a manual IP+port entry, not a scan), and USB (attached-device list over
 * Android's USB Host API via an OTG cable). Switching tabs is a plain UI
 * concern — usePrinterConnection() owns the actual per-transport state.
 */
export default function PrinterConnectSheet({ visible, onClose, label, initialCopies = 1 }) {
  const {
    state, error, transport, setTransport,
    devices, selectedDevice, networkHost, setNetworkHost, networkPort, setNetworkPort,
    isConnected, listDevices, selectDevice, connect, disconnect, print,
  } = usePrinterConnection();
  const [copies, setCopies] = useState(() => Math.min(10, Math.max(1, Math.round(initialCopies || 1))));

  useEffect(() => {
    if (visible) {
      setCopies(Math.min(10, Math.max(1, Math.round(initialCopies || 1))));
      listDevices();
    }
    // initialCopies is only meant to seed the value when the sheet opens,
    // not to override the user's stepper taps on every render — depend on
    // `visible`/`transport` alone (re-list whenever the tab changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, transport, listDevices]);

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

  const handleSwitchTransport = (key) => {
    if (busy || isConnected || key === transport) return;
    setTransport(key);
  };

  const StatusIcon = isConnected
    ? (transport === PRINTER_TRANSPORT.BLUETOOTH ? BluetoothConnected : transport === PRINTER_TRANSPORT.USB ? Usb : Wifi)
    : (transport === PRINTER_TRANSPORT.USB ? Usb : transport === PRINTER_TRANSPORT.NETWORK ? Wifi : Bluetooth);
  const isAlarmState = state === PRINTER_STATE.PRINT_ERROR
    || state === PRINTER_STATE.PERMISSION_DENIED
    || state === PRINTER_STATE.BLUETOOTH_DISABLED
    || state === PRINTER_STATE.DISCONNECTED;
  const statusColor = isAlarmState ? DANGER : (isConnected ? ACCENT : TEXT_SECONDARY);
  const connectedName = selectedDevice?.name || selectedDevice?.productName
    || (transport === PRINTER_TRANSPORT.NETWORK ? networkHost : null);

  const primaryLabel = isConnected
    ? (busy ? 'Printing…' : (state === PRINTER_STATE.PRINT_SUCCESS ? 'Print Again' : (state === PRINTER_STATE.PRINT_ERROR ? 'Retry' : 'Print Label')))
    : (state === PRINTER_STATE.CONNECTING ? 'Connecting…' : 'Connect Printer');
  const canAttemptConnect = transport === PRINTER_TRANSPORT.NETWORK ? !!networkHost.trim() : !!selectedDevice;
  const primaryDisabled = busy || (!isConnected && !canAttemptConnect);

  const deviceListLabel = transport === PRINTER_TRANSPORT.USB ? 'ATTACHED USB DEVICES' : 'PAIRED PRINTERS';
  const noDevicesMessage = transport === PRINTER_TRANSPORT.USB
    ? 'No USB printer detected — plug it in via an OTG cable and make sure it is powered on.'
    : 'No paired printer found — pair the TVS LP-46 Dlite in Android Bluetooth settings first.';

  return (
    <ResponsiveModal visible={visible} onClose={handleClose} maxWidth={480} scrollable>
      <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER, marginBottom: SPACING.md }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: TEXT_PRIMARY }}>Print QR Label</Text>
          <Text style={{ fontSize: 12, color: TEXT_SECONDARY, marginTop: 2 }}>TVS LP-46 Dlite · 38 × 25 mm</Text>
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

      {/* Transport tabs — locked once connected/mid-action, same as every
          other control here; disconnect first to switch. */}
      <View
        style={{
          flexDirection: 'row', marginTop: SPACING.md, borderRadius: 14, backgroundColor: SOFT_MINT,
          borderWidth: 1, borderColor: BORDER, padding: 3,
        }}
      >
        {TRANSPORT_TABS.map((tab) => {
          const active = tab.key === transport;
          const TabIcon = tab.icon;
          const tabDisabled = busy || isConnected;
          return (
            <Touchable
              key={tab.key}
              onPress={() => handleSwitchTransport(tab.key)}
              disabled={tabDisabled && !active}
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                borderRadius: 11, paddingVertical: 9, gap: 6,
                backgroundColor: active ? '#FFFFFF' : 'transparent',
                opacity: tabDisabled && !active ? 0.5 : 1,
              }}
              pressedStyle={{ opacity: 0.85 }}
            >
              <TabIcon size={14} color={active ? ACCENT : TEXT_SECONDARY} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: active ? ACCENT : TEXT_SECONDARY }}>
                {tab.label}
              </Text>
            </Touchable>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: SPACING.md,
          borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: SOFT_MINT,
        }}
      >
        <StatusIcon size={14} color={statusColor} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor, marginLeft: 6 }} numberOfLines={1}>
          {connectedName ? `${connectedName} · ${STATUS_TEXT[state] || ''}` : (STATUS_TEXT[state] || '')}
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

      {transport === PRINTER_TRANSPORT.NETWORK && state !== PRINTER_STATE.BLUETOOTH_DISABLED && state !== PRINTER_STATE.PERMISSION_DENIED ? (
        <View style={{ marginTop: SPACING.md }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: TEXT_SECONDARY, letterSpacing: 0.5, marginBottom: 6 }}>
            PRINTER IP ADDRESS
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <TextInput
              value={networkHost}
              onChangeText={setNetworkHost}
              editable={!isConnected && !busy}
              placeholder="192.168.1.50"
              placeholderTextColor={TEXT_SECONDARY}
              keyboardType="decimal-pad"
              style={{
                flex: 1, marginRight: 8, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY,
                backgroundColor: isConnected || busy ? SOFT_MINT : '#FFFFFF',
              }}
            />
            <TextInput
              value={networkPort}
              onChangeText={setNetworkPort}
              editable={!isConnected && !busy}
              placeholder="9100"
              placeholderTextColor={TEXT_SECONDARY}
              keyboardType="number-pad"
              maxLength={5}
              style={{
                width: 84, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY,
                backgroundColor: isConnected || busy ? SOFT_MINT : '#FFFFFF',
              }}
            />
          </View>
          <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 6 }}>
            Leave the port blank for the standard 9100.
          </Text>
        </View>
      ) : null}

      {transport !== PRINTER_TRANSPORT.NETWORK && state === PRINTER_STATE.PRINTER_FOUND && devices.length ? (
        <View style={{ marginTop: SPACING.md }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: TEXT_SECONDARY, letterSpacing: 0.5, marginBottom: 6 }}>
            {deviceListLabel}
          </Text>
          {devices.map((d) => {
            const id = d.address || d.deviceName;
            const active = (selectedDevice?.address || selectedDevice?.deviceName) === id;
            return (
              <Touchable
                key={id}
                onPress={() => selectDevice(id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 12, marginBottom: 8,
                  borderWidth: 1.5, borderColor: active ? ACCENT : BORDER, backgroundColor: active ? MINT : '#FFFFFF',
                }}
                pressedStyle={{ opacity: 0.85 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '800', color: TEXT_PRIMARY }} numberOfLines={1}>{d.name || d.productName}</Text>
                  <Text style={{ fontSize: 11, color: TEXT_SECONDARY, marginTop: 1 }} numberOfLines={1}>{d.address || d.deviceName}</Text>
                </View>
                {active ? <Check size={18} color={ACCENT} /> : null}
              </Touchable>
            );
          })}
        </View>
      ) : null}

      {transport !== PRINTER_TRANSPORT.NETWORK && state === PRINTER_STATE.IDLE && !devices.length && !busy ? (
        transport === PRINTER_TRANSPORT.BLUETOOTH ? (
          <Touchable
            onPress={openBluetoothSettings}
            style={{ marginTop: SPACING.md, borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: MINT }}
            pressedStyle={{ opacity: 0.85 }}
          >
            <Text style={{ fontWeight: '800', color: ACCENT }}>Pair Printer in Bluetooth Settings</Text>
          </Touchable>
        ) : (
          <View style={{ marginTop: SPACING.md, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: MINT }}>
            <Text style={{ fontWeight: '700', color: ACCENT, textAlign: 'center' }}>{noDevicesMessage}</Text>
          </View>
        )
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
