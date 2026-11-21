import React, { memo, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getEmployeePresence } from '../../../api/presence';
import { rf } from '../../../utils/responsive';

// Stock-style presence line for one employee card (Shop Presence list only).
// Segments come ONLY from recorded server timeline events (detail API); the
// zigzag wiggle is decorative and seeded, so the same data draws the same line.
// After a LOCATION_UNVERIFIED event the state stays grey until the next
// recorded event (the server records no event when GPS recovers).
const COLOR = { IN: '#19A663', OUT: '#E14949', DUTY: '#3486DC', UNV: '#9AA3AD' };
const LEVEL = { IN: 0.3, OUT: 0.78, DUTY: 0.42, UNV: 0.55 };
const NEXT = { CHECKED_IN: 'IN', EXITED: 'OUT', RETURNED: 'IN', OUTSIDE_ENDED: 'DUTY', DUTY_STARTED: 'DUTY', DUTY_ENDED: 'IN', LOCATION_UNVERIFIED: 'UNV' };
const STALE_MS = 5 * 60 * 1000;
const TTL_MS = 60 * 1000;
const H = 50;
const STEP = 14; // px between zigzag vertices
const cache = new Map(); // `${id}|${date}` -> { at, p }

function fetchTimeline(id, date, today) {
  const k = `${id}|${date}`;
  const hit = cache.get(k);
  if (hit && (!today || Date.now() - hit.at < TTL_MS)) return hit.p;
  const p = getEmployeePresence(id, date).then((d) => (Array.isArray(d?.timeline) ? d.timeline : []));
  p.catch(() => cache.delete(k));
  cache.set(k, { at: Date.now(), p });
  return p;
}

// 12-hour clock for the time scale (manual: Hermes toLocaleTimeString varies).
const clock = (t) => { const d = new Date(t); const h = d.getHours(); return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const ms = (iso) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };
function seed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rand(s) { return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Recorded events -> [{ from, to, k }] intervals; never extends past `end`.
export function toSegments(timeline, { end, lastVerifiedMs, today }) {
  const ev = (timeline || []).map((e) => ({ k: NEXT[e?.type], t: ms(e?.at), type: e?.type }))
    .filter((e) => e.t != null && (e.k || e.type === 'CHECKED_OUT'))
    .sort((a, b) => a.t - b.t);
  const start = ev.find((e) => e.type === 'CHECKED_IN');
  if (!start) return [];
  const out = ev.find((e) => e.type === 'CHECKED_OUT' && e.t >= start.t);
  let stop = out ? out.t : end;
  if (stop == null || stop <= start.t) return [];
  const segs = [];
  let cur = start;
  for (const e of ev) {
    if (e.t <= cur.t || e === start) continue;
    if (e.t >= stop || e.type === 'CHECKED_OUT') break;
    if (!e.k) continue;
    segs.push({ from: cur.t, to: e.t, k: cur.k });
    cur = e;
  }
  segs.push({ from: cur.t, to: stop, k: cur.k });
  // Open session today: a GPS-based state is only known up to the last reading.
  if (!out && today) {
    const last = segs[segs.length - 1];
    const lv = lastVerifiedMs != null ? Math.max(lastVerifiedMs, last.from) : last.from;
    if (last.k !== 'DUTY' && last.k !== 'UNV' && stop - lv > STALE_MS) {
      last.to = lv;
      segs.push({ from: lv, to: stop, k: 'UNV' });
    }
  }
  return segs.filter((s) => s.to > s.from);
}

function buildPaths(segs, width, key) {
  const t0 = segs[0].from;
  const span = segs[segs.length - 1].to - t0 || 1;
  const x = (t) => 2 + ((t - t0) / span) * (width - 4);
  const r = rand(seed(key));
  const y = (k) => {
    const amp = k === 'UNV' ? 0 : (r() - 0.5) * 0.22;
    return Math.min(0.92, Math.max(0.08, LEVEL[k] + amp)) * H;
  };
  let prev = null;
  return segs.map((s, i) => {
    const xa = x(s.from); const xb = x(s.to);
    const pts = [prev || [xa, y(s.k)]];
    const n = Math.max(1, Math.round((xb - xa) / STEP));
    for (let j = 1; j <= n; j++) pts.push([xa + ((xb - xa) * j) / n, y(s.k)]);
    prev = pts[pts.length - 1];
    return { key: `${i}`, k: s.k, d: pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') };
  });
}

function PresenceLine({ employeeId, date, today, checkInTime, checkOutTime, lastVerifiedAt, version }) {
  const k = `${employeeId}|${date}`;
  const [res, setRes] = useState({ k: null, t: undefined });
  // Only use a result fetched for THIS employee and date (no stale line after a switch).
  const timeline = res.k === k ? res.t : undefined;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchTimeline(employeeId, date, today).then((t) => { if (alive) setRes({ k, t }); }).catch(() => { if (alive) setRes({ k, t: null }); });
    return () => { alive = false; };
  }, [k, employeeId, date, today, version, checkOutTime]);

  const NONE = { paths: [] };
  const { paths, t0, t1, open } = useMemo(() => {
    if (!width || !Array.isArray(timeline)) return NONE;
    try {
      // Past day with no check-out: end at the last recorded event, never beyond.
      const end = today ? Date.now() : Math.max(...timeline.map((e) => ms(e?.at) ?? -Infinity));
      if (!Number.isFinite(end)) return NONE;
      const segs = toSegments(timeline, { end, lastVerifiedMs: ms(lastVerifiedAt), today });
      if (!segs.length) return NONE;
      // Scale = exactly the drawn x-range (first segment start .. last segment end).
      const closed = timeline.some((e) => e?.type === 'CHECKED_OUT');
      return { paths: buildPaths(segs, width, `${employeeId}|${date}`), t0: segs[0].from, t1: segs[segs.length - 1].to, open: !closed };
    } catch {
      return NONE;
    }
    // version: recompute "now" on each list refresh
  }, [timeline, width, today, lastVerifiedAt, employeeId, date, version]);

  if (!checkInTime) return null;
  const lbl = { flex: 1, fontSize: rf(10.5), color: '#8A94A0' };
  return (
    <View>
    <View style={{ height: H, marginTop: 10 }} onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} accessibilityLabel="Presence line">
      {timeline === undefined ? null
        : !paths.length ? <Text style={{ fontSize: rf(11), color: '#9AA3AD', textAlign: 'center', lineHeight: H }}>{timeline === null ? 'Presence line unavailable' : 'No presence data yet'}</Text>
          : width > 0 ? (
            <Svg width={width} height={H}>
              {paths.map((p) => (
                <Path key={p.key} d={p.d} stroke={COLOR[p.k]} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray={p.k === 'UNV' ? '5,6' : undefined} />
              ))}
            </Svg>
          ) : null}
    </View>
    {paths.length && t1 > t0 ? (
      <View style={{ flexDirection: 'row', marginTop: 2, paddingHorizontal: 2 }} accessibilityLabel="Presence time scale">
        <Text style={lbl} numberOfLines={1}>{clock(t0)}</Text>
        <Text style={[lbl, { textAlign: 'center' }]} numberOfLines={1}>{clock(t0 + (t1 - t0) / 2)}</Text>
        <Text style={[lbl, { textAlign: 'right' }]} numberOfLines={1}>{open && today ? `Now ${clock(t1)}` : clock(t1)}</Text>
      </View>
    ) : null}
    </View>
  );
}

export default memo(PresenceLine);
