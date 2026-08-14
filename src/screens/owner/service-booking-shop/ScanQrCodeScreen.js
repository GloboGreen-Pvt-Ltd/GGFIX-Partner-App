import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ChevronLeft,
  ScanLine,
  Hash,
  User,
  Wrench,
  ShieldCheck,
  BadgeCheck,
  RotateCcw,
  AlertTriangle,
  Camera as CameraIcon,
  Phone,
  Smartphone,
  Tag,
  Clock,
  UserCog,
  MessageSquareText,
} from 'lucide-react-native';
import { ticketApi } from '../../../api/client';

const BRAND_GREEN = '#16BB05';
const BRAND_GREEN_DARK = '#087A0A';

// Ticket lifecycle → human label + colour chip. Mirrors the backend status set
// (TicketService): CREATED, IN_DIAGNOSIS, QUOTED, APPROVED, IN_REPAIR, READY,
// DELIVERED_PROCESSING, DELIVERED, CANCELLED.
const STATUS_META = {
  CREATED:              { label: 'Created',       color: '#667066', bg: '#EFF5EE' },
  IN_DIAGNOSIS:         { label: 'In Diagnosis',  color: '#16BB05', bg: '#F0F8EF' },
  QUOTED:               { label: 'Quoted',        color: '#B45309', bg: '#FEF3C7' },
  APPROVED:             { label: 'Approved',      color: '#087A0A', bg: '#F0F8EF' },
  IN_REPAIR:            { label: 'In Repair',     color: '#B45309', bg: '#FEF3C7' },
  READY:                { label: 'Ready',         color: BRAND_GREEN_DARK, bg: '#E6F7E3' },
  DELIVERED_PROCESSING: { label: 'Delivering',    color: '#087A0A', bg: '#F0F8EF' },
  DELIVERED:            { label: 'Delivered',     color: BRAND_GREEN_DARK, bg: '#E6F7E3' },
  CANCELLED:            { label: 'Cancelled',     color: '#B91C1C', bg: '#FEE2E2' },
};

function statusMeta(status) {
  const key = String(status || '').toUpperCase();
  return STATUS_META[key] || { label: key ? key.replace(/_/g, ' ') : 'Unknown', color: '#667066', bg: '#EFF5EE' };
}

// Same rendering rule the print slip uses: PIN/Password show the value inline,
// Pattern keeps its "1,2,3" dot sequence, None stays plain.
function formatSecurity(type, value) {
  const t = String(type || 'NONE').toUpperCase();
  if (t === 'NONE' || !t) return 'None';
  const label = t === 'PIN' ? 'PIN' : t === 'PASSWORD' ? 'Password' : t === 'PATTERN' ? 'Pattern'
    : t.charAt(0) + t.slice(1).toLowerCase();
  const v = value == null ? '' : String(value).trim();
  return v ? `${label} · ${v}` : label;
}

const formatINR = (n) =>
  n == null || n === '' ? null : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Manual date format — Hermes ships without full Intl, so we avoid
// Date.toLocaleString options and build the "12 Jul, 3:59 PM" string ourselves.
function formatWhen(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()} ${months[d.getMonth()]}, ${h}:${m} ${ampm}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolve whatever the QR encodes (a trackingId like "GG-1234" or a raw ticket
// UUID) to a full ticket. Try a direct id fetch first when it looks like a UUID,
// then fall back to the shop ticket search which matches on trackingId.
async function resolveTicket(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (UUID_RE.test(value)) {
    const byId = await ticketApi.get(`/tickets/${value}`).catch(() => null);
    if (byId) return byId;
  }

  const page = await ticketApi.get('/tickets', { query: { q: value, size: 5 } }).catch(() => null);
  const list = Array.isArray(page?.content) ? page.content : Array.isArray(page) ? page : [];
  if (list.length) {
    const exact = list.find((t) => String(t.trackingId || '').toLowerCase() === value.toLowerCase());
    return exact || list[0];
  }

  // Last resort — some deployments encode the id even without dashes.
  if (!UUID_RE.test(value)) {
    const byRaw = await ticketApi.get(`/tickets/${value}`).catch(() => null);
    if (byRaw) return byRaw;
  }
  return null;
}

function DetailRow({ icon: Icon, label, value }) {
  return (
    <View className="flex-row items-start py-2.5 border-b border-gray-100">
      <View className="w-8 h-8 rounded-lg items-center justify-center mr-3" style={{ backgroundColor: '#E6F7E3' }}>
        <Icon size={15} color={BRAND_GREEN_DARK} />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.6 }}>{label}</Text>
        <Text className="text-[13.5px] font-extrabold text-gray-900 mt-0.5">{value || '—'}</Text>
      </View>
    </View>
  );
}

export default function ScanQrCodeScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [notFound, setNotFound] = useState(null); // holds the scanned value on miss
  const handlingRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission, requestPermission]);

  const reset = () => {
    handlingRef.current = false;
    setScanned(false);
    setLoading(false);
    setTicket(null);
    setNotFound(null);
  };

  const handleBarcode = async ({ data }) => {
    if (handlingRef.current || scanned) return;
    handlingRef.current = true;
    setScanned(true);
    setLoading(true);
    try {
      const t = await resolveTicket(data);
      if (t) setTicket(t);
      else setNotFound(String(data || '').trim() || 'this code');
    } catch (_) {
      setNotFound(String(data || '').trim() || 'this code');
    } finally {
      setLoading(false);
    }
  };

  // ── Camera permission gates (match ScanImeiScreen) ──────────────────────
  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator size="large" color={BRAND_GREEN} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-background">
        <SlimHeader onBack={() => navigation.goBack()} />
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-16 w-16 rounded-full bg-warning/15 items-center justify-center mb-4">
            <CameraIcon size={28} color="#F59E0B" />
          </View>
          <Text className="text-text font-extrabold text-[16px] text-center">Camera access needed</Text>
          <Text className="text-text-muted text-[12.5px] text-center mt-2 leading-5">
            We need your camera to scan the QR slip and pull up the ticket status.
          </Text>
          <View className="flex-row mt-6">
            <Pressable onPress={() => navigation.goBack()} className="px-5 py-3 rounded-xl bg-card border border-border mr-2">
              <Text className="text-text font-bold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings?.())}
              className="px-5 py-3 rounded-xl"
              style={{ backgroundColor: BRAND_GREEN }}
            >
              <Text className="text-white font-bold">{permission.canAskAgain ? 'Grant Camera' : 'Open Settings'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const showSheet = scanned; // sheet covers loading / result / not-found

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'datamatrix', 'code128'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcode}
      />

      {/* Header overlay */}
      <View className="absolute left-0 right-0 top-0 pt-12 px-4 pb-3 flex-row items-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <Pressable onPress={() => navigation.goBack()} className="w-10 h-10 rounded-full items-center justify-center bg-white/15 mr-3">
          <ChevronLeft size={22} color="#fff" />
        </Pressable>
        <Text className="text-white text-[16px] font-extrabold">Scan QR Slip</Text>
      </View>

      {/* Frame + brackets (hidden once a result sheet is up) */}
      {!showSheet ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <View style={{ width: 250, height: 250 }}>
            {[0, 1, 2, 3].map((i) => {
              const borders = {
                borderTopWidth: i < 2 ? 4 : 0,
                borderBottomWidth: i >= 2 ? 4 : 0,
                borderLeftWidth: i % 2 === 0 ? 4 : 0,
                borderRightWidth: i % 2 === 1 ? 4 : 0,
              };
              return (
                <View
                  key={i}
                  style={{
                    position: 'absolute',
                    top: i < 2 ? 0 : null,
                    bottom: i >= 2 ? 0 : null,
                    left: i % 2 === 0 ? 0 : null,
                    right: i % 2 === 1 ? 0 : null,
                    width: 40, height: 40, borderColor: BRAND_GREEN, ...borders,
                  }}
                />
              );
            })}
          </View>
          <View className="flex-row items-center mt-6">
            <ScanLine size={15} color="#fff" />
            <Text className="text-white text-[13px] font-extrabold ml-1.5">Align the QR slip inside the frame</Text>
          </View>
        </View>
      ) : null}

      {/* Result / loading / not-found bottom sheet */}
      {showSheet ? (
        <View className="absolute left-0 right-0 bottom-0" style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 28, maxHeight: '78%' }}>
          {loading ? (
            <View className="items-center justify-center py-10">
              <ActivityIndicator size="large" color={BRAND_GREEN} />
              <Text className="text-gray-500 text-[12.5px] font-semibold mt-3">Looking up ticket…</Text>
            </View>
          ) : ticket ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18 }}>
              {/* Found header + status chip */}
              <View className="flex-row items-center mb-1">
                <View className="w-9 h-9 rounded-full items-center justify-center mr-2.5" style={{ backgroundColor: '#E6F7E3' }}>
                  <BadgeCheck size={18} color={BRAND_GREEN_DARK} />
                </View>
                <View className="flex-1">
                  <Text className="text-[13px] font-extrabold text-gray-900" numberOfLines={1}>
                    {ticket.deviceDisplayName || ticket.deviceModelName || 'Ticket found'}
                  </Text>
                  <Text className="text-[10.5px] text-gray-400 font-semibold">Scan result</Text>
                </View>
                {(() => {
                  const m = statusMeta(ticket.status);
                  return (
                    <View className="px-3 py-1.5 rounded-full" style={{ backgroundColor: m.bg }}>
                      <Text className="text-[11.5px] font-extrabold" style={{ color: m.color }}>{m.label}</Text>
                    </View>
                  );
                })()}
              </View>

              <View className="mt-2 rounded-2xl px-3" style={{ backgroundColor: '#F7FAF7', borderWidth: 1, borderColor: '#EFF5EE' }}>
                <DetailRow icon={Hash} label="Service No." value={ticket.trackingId || ticket.id} />
                <DetailRow icon={User} label="Customer Name" value={ticket.customerName} />
                {ticket.customerPhone ? <DetailRow icon={Phone} label="Customer Phone" value={ticket.customerPhone} /> : null}
                <DetailRow icon={Smartphone} label="Device" value={[ticket.deviceDisplayName || ticket.deviceModelName, ticket.color].filter(Boolean).join(' · ')} />
                <DetailRow icon={Wrench} label="Repair Services" value={ticket.repairServicesSummary} />
                {formatINR(ticket.estimatedPrice) ? <DetailRow icon={Tag} label="Estimated Price" value={formatINR(ticket.estimatedPrice)} /> : null}
                {formatWhen(ticket.estimatedReadyAt) ? <DetailRow icon={Clock} label="Ready By" value={formatWhen(ticket.estimatedReadyAt)} /> : null}
                {formatWhen(ticket.estimatedDeliveryAt) ? <DetailRow icon={Clock} label="Delivery" value={formatWhen(ticket.estimatedDeliveryAt)} /> : null}
                <DetailRow icon={ShieldCheck} label="Device Security" value={formatSecurity(ticket.deviceSecurityType, ticket.deviceSecurityValue)} />
                {ticket.assignedTechnicianName ? <DetailRow icon={UserCog} label="Technician" value={ticket.assignedTechnicianName} /> : null}
                {ticket.issueDescription ? <DetailRow icon={MessageSquareText} label="Issue" value={ticket.issueDescription} /> : null}
                {/* Ticket status also spelled out as a row for the print/handoff record */}
                <View className="flex-row items-start py-2.5">
                  <View className="w-8 h-8 rounded-lg items-center justify-center mr-3" style={{ backgroundColor: '#E6F7E3' }}>
                    <BadgeCheck size={15} color={BRAND_GREEN_DARK} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[10px] uppercase font-bold text-gray-400" style={{ letterSpacing: 0.6 }}>Ticket Status</Text>
                    <Text className="text-[13.5px] font-extrabold mt-0.5" style={{ color: statusMeta(ticket.status).color }}>
                      {statusMeta(ticket.status).label}
                    </Text>
                  </View>
                </View>
              </View>

              <Pressable onPress={reset} className="mt-4 rounded-2xl py-3.5 flex-row items-center justify-center active:opacity-90" style={{ backgroundColor: BRAND_GREEN }}>
                <RotateCcw size={16} color="#fff" />
                <Text className="text-white text-[14px] font-extrabold ml-2">Scan another</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <View className="items-center px-6 py-8">
              <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#FEE2E2' }}>
                <AlertTriangle size={26} color="#B91C1C" />
              </View>
              <Text className="text-gray-900 font-extrabold text-[15px] text-center">No ticket found</Text>
              <Text className="text-gray-500 text-[12px] text-center mt-1.5 leading-5">
                Couldn't match <Text className="font-extrabold text-gray-700">{notFound}</Text> to a ticket in this shop. Make sure it's a GGFix QR slip.
              </Text>
              <Pressable onPress={reset} className="mt-5 rounded-2xl py-3.5 px-8 flex-row items-center justify-center active:opacity-90" style={{ backgroundColor: BRAND_GREEN }}>
                <RotateCcw size={16} color="#fff" />
                <Text className="text-white text-[14px] font-extrabold ml-2">Try again</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function SlimHeader({ onBack }) {
  return (
    <View className="pt-12 px-4 pb-3 flex-row items-center bg-card border-b border-border">
      <Pressable onPress={onBack} className="w-10 h-10 rounded-full items-center justify-center bg-surface-muted mr-3">
        <ChevronLeft size={22} color="#172117" />
      </Pressable>
      <Text className="text-text text-[16px] font-extrabold">Scan QR Slip</Text>
    </View>
  );
}
