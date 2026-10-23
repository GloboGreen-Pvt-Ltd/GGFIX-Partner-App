// The booking action sheet for ONE booking, outside the bookings list — opened
// by tapping the device card on Device Details. Same look and the same
// actions, sheets and destinations as the list's card-tap sheet
// (BookingHistoryScreen → bookingActionsFor), so a booking behaves the same
// wherever it is opened from:
//   active    → Edit · Re-Estimate · Re-Schedule · Assign · History · Receipt · Barcode · Details · Update Status
//   delivered → History · Invoice · Details · Re-Service
import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  Calculator, CalendarClock, FileText, History, ListChecks, Pencil, QrCode, ReceiptIndianRupee, RefreshCcw, Share2, UserCog,
} from 'lucide-react-native';
import { ResponsiveModal } from '../../../components/responsive';
import {
  ImeiGateSheet,
  RescheduleSheet,
  ServiceStatusSheet,
  ShareReceiptSheet,
  TechnicianPickerSheet,
} from './BookingActionSheets';
import { imeiApplies, resolveRecordCategory } from '../../../utils/imeiPolicy';

// Home tool-tile discs, as on the bookings list sheet.
const HOME_TILE_TONES = ['#357D89', '#5E9440', '#3B82F6', '#6B7280'];

/**
 * visible / onClose — the action grid itself.
 * booking — the full ticket (GET /tickets/{id}).
 * title, statusLabel — what the screen behind already shows (name, status).
 * onChanged — reload after a status, schedule or technician change.
 */
export default function BookingActionsMenu({ visible, onClose, booking, title, statusLabel, onChanged, navigation }) {
  const [techPickerOpen, setTechPickerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [imeiGateOpen, setImeiGateOpen] = useState(false);
  const [scannedImei, setScannedImei] = useState(null);

  const closeSheets = useCallback(() => {
    setTechPickerOpen(false);
    setShareOpen(false);
    setStatusOpen(false);
    setRescheduleOpen(false);
    setImeiGateOpen(false);
  }, []);

  const goInvoiceGenerator = useCallback((b) => {
    if (!b?.id) return;
    closeSheets();
    navigation.navigate('InvoiceGenerator', { ticketId: b.id });
  }, [closeSheets, navigation]);

  // Update Status → "Invoice Generated" routes here: a phone with no IMEI on
  // file goes through the IMEI gate first, anything else straight in.
  const startInvoice = useCallback(async (b) => {
    if (!b?.id) return;
    if (String(b.imei || '').trim() || !imeiApplies(await resolveRecordCategory(b))) {
      goInvoiceGenerator(b);
      return;
    }
    setScannedImei(null);
    setImeiGateOpen(true);
  }, [goInvoiceGenerator]);

  const openImeiScanner = useCallback(() => {
    navigation.navigate('ScanImei', {
      onScan: (imei) => {
        setScannedImei(imei);
        setImeiGateOpen(true);
      },
    });
  }, [navigation]);

  const delivered = String(booking?.status || '').toUpperCase() === 'DELIVERED';
  const go = (route, params) => () => navigation.navigate(route, params);
  const id = booking?.id;
  const actions = !booking ? [] : delivered
    ? [
      { key: 'history', label: 'History', icon: History, run: go('BookingTimeline', { ticketId: id }) },
      { key: 'invoice', label: 'Invoice', icon: ReceiptIndianRupee, run: go('DeliveryInvoiceReport', { ticketId: id }) },
      { key: 'details', label: 'Details', icon: FileText, run: go('TicketDetail', { ticketId: id }) },
      // A delivered device is back: the booking wizard pre-filled with this
      // device + customer, linked to this booking (same as the list).
      { key: 'reservice', label: 'Re-Service', icon: RefreshCcw, run: go('TicketDetail', { ticketId: id, autoReService: true }) },
    ]
    : [
      { key: 'edit', label: 'Edit', icon: Pencil, run: go('TicketDetail', { ticketId: id, autoEdit: true }) },
      // Straight to this booking's services & prices (same as the list's Re-Estimate).
      { key: 'reestimate', label: 'Re-Estimate', icon: Calculator, run: go('TicketDetail', { ticketId: id, autoReEstimate: true }) },
      { key: 'reschedule', label: 'Re-Schedule', icon: CalendarClock, run: () => setRescheduleOpen(true) },
      { key: 'assign', label: 'Assign', icon: UserCog, run: () => setTechPickerOpen(true) },
      { key: 'history', label: 'History', icon: History, run: go('BookingTimeline', { ticketId: id }) },
      { key: 'receipt', label: 'Receipt', icon: Share2, run: () => setShareOpen(true) },
      { key: 'barcode', label: 'Barcode', icon: QrCode, run: go('BarcodePrint', { ticketId: id, mode: 'barcode' }) },
      // On Device Details, "Details" is the booking's working screen — the
      // device view is the one already open.
      { key: 'details', label: 'Details', icon: FileText, run: go('TicketDetail', { ticketId: id }) },
      { key: 'status', label: 'Update Status', icon: ListChecks, run: () => setStatusOpen(true) },
    ];

  // The grid slides away before a sheet opens or a screen is pushed — two RN
  // Modals swapping in one tick is unreliable on iOS (same delay as the list).
  const pick = (run) => () => {
    onClose();
    setTimeout(run, 320);
  };

  return (
    <>
      <ResponsiveModal visible={visible} onClose={onClose}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111111' }} numberOfLines={1}>
          {title || booking?.deviceDisplayName || booking?.deviceModelName || 'Booking'}
        </Text>
        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2, marginBottom: 10 }} numberOfLines={1}>
          #{booking ? (booking.trackingId || String(booking.id || '').slice(0, 8).toUpperCase()) : ''}
          {booking?.customerName ? ` · ${booking.customerName}` : ''}
        </Text>
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -4 }}>
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <Pressable
                key={a.key}
                onPress={pick(a.run)}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                className="items-center active:opacity-70"
                style={{ width: '25%', paddingHorizontal: 4, paddingVertical: 8 }}
              >
                <View className="items-center justify-center" style={{ height: 44, width: 44, borderRadius: 22, backgroundColor: HOME_TILE_TONES[i % HOME_TILE_TONES.length] }}>
                  <Icon size={19} color="#FFFFFF" />
                </View>
                <Text style={{ marginTop: 6, fontSize: 11.5, fontWeight: '600', color: '#111111', textAlign: 'center' }} numberOfLines={2}>
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ResponsiveModal>

      {/* Assign stays open on its "assigned" face as the confirmation (as on the list). */}
      <TechnicianPickerSheet visible={techPickerOpen} booking={booking} onClose={closeSheets} onAssigned={() => onChanged?.()} />
      <ServiceStatusSheet
        visible={statusOpen}
        booking={booking}
        statusLabel={statusLabel || booking?.status || 'Pending'}
        onClose={closeSheets}
        onUpdated={onChanged}
        onGenerateInvoice={startInvoice}
      />
      <RescheduleSheet visible={rescheduleOpen} booking={booking} onClose={closeSheets} onUpdated={onChanged} />
      <ImeiGateSheet
        visible={imeiGateOpen}
        booking={booking}
        scannedImei={scannedImei}
        onClose={closeSheets}
        onVerified={goInvoiceGenerator}
        onScanRequest={openImeiScanner}
      />
      {/* Device Details already holds the full ticket the receipt needs. */}
      <ShareReceiptSheet visible={shareOpen} preparing={false} ticket={booking} onClose={closeSheets} />
    </>
  );
}
