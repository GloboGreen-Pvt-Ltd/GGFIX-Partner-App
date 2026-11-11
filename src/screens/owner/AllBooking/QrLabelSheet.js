import React, { useEffect, useState } from 'react';
import { ticketApi } from '../../../api/client';
import PrinterConnectSheet from './PrinterConnectSheet';

// "Print QR Label" popup for one booking — every QR / barcode button opens this
// (replaces the old QR E-Print screen). Pass `ticket` when already loaded, else
// `ticketId` and it is fetched.

function formatSecurity(type, value) {
  const t = String(type || 'NONE').toUpperCase();
  if (t === 'NONE' || !t) return 'None';
  const label = t === 'PIN' ? 'PIN' : t === 'PASSWORD' ? 'Password' : t === 'PATTERN' ? 'Pattern' : t.charAt(0) + t.slice(1).toLowerCase();
  let v = value == null ? '' : String(value).trim();
  if (t === 'PATTERN') v = v.split(',').map((d) => d.trim()).filter(Boolean).join(',');
  return v ? `${label}: ${v}` : label;
}

function fmtCreatedOn(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { date: `${wd}, ${d.getDate()} ${mo} ${d.getFullYear()}`, time };
}

export function labelFromTicket(t, fallbackId) {
  const deviceName = t?.deviceDisplayName || t?.deviceModelName || t?.modelName || 'Device';
  return {
    trackingId: t?.trackingId || fallbackId || 'NO-ID',
    // Label only has room for "Brand Model" — drop the " · " extras.
    brandModel: String(deviceName).split(' · ')[0].trim() || deviceName,
    customerName: t?.customerName || '—',
    deviceSecurity: formatSecurity(t?.deviceSecurityType, t?.deviceSecurityValue),
    createdOn: fmtCreatedOn(t?.createdAt),
  };
}

export default function QrLabelSheet({ visible, onClose, ticket, ticketId }) {
  const [loaded, setLoaded] = useState(null);
  const id = ticket?.id || ticketId;
  useEffect(() => {
    if (!visible || ticket || !id) return undefined;
    let alive = true;
    ticketApi.get(`/tickets/${id}`).then((t) => { if (alive) setLoaded(t); }).catch(() => {});
    return () => { alive = false; };
  }, [visible, ticket, id]);
  const t = ticket || (loaded?.id === id ? loaded : null);
  return <PrinterConnectSheet visible={!!visible && !!t} onClose={onClose} label={labelFromTicket(t, id)} initialCopies={1} />;
}
