import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { ticketApi, shopApi } from '../../api/client';
import { notify } from '../../components/confirm';

// Lazy-load native PDF deps so a missing install doesn't crash the whole bundle.
// On web we fall back to window.open/window.print which doesn't need expo-print.
function getPrintModule() {
  try { return require('expo-print'); } catch { return null; }
}
function getSharingModule() {
  try { return require('expo-sharing'); } catch { return null; }
}
import { selectShopId, selectSession } from '../../store/authSlice';
import { useResponsive } from '../../theme/responsive';
import { rf, rs } from '../../utils/responsive';

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRupee(v) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return '₹ 0';
  return `₹ ${n.toLocaleString('en-IN')}`;
}

// Escape user-controlled strings before embedding in HTML.
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPayslipHtml({ shop, ownerMobile, employee, payslip, month, year, empId }) {
  const shopName = esc(shop?.name || 'Shop');
  const addrParts = [shop?.address, shop?.city, shop?.state, shop?.pincode].filter(Boolean);
  const shopAddress = esc(addrParts.join(', ') || '—');
  const shopPhone = esc(shop?.phone || ownerMobile || '—');
  const shopEmail = esc(shop?.email || '—');

  const monthName = MONTHS_FULL[month - 1] || '';
  const periodStart = payslip?.periodStart ? formatDate(payslip.periodStart) : '—';
  const periodEnd = payslip?.periodEnd ? formatDate(payslip.periodEnd) : '—';
  const netSalary = Number(payslip?.netSalary || 0);
  const netWage = Number(payslip?.netWage || 0);
  const totalPayable = netSalary + netWage;
  const isPaid = totalPayable > 0;

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Pay Slip — ${esc(employee?.name || 'Employee')} — ${esc(monthName)} ${esc(year)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #172117; margin: 0; padding: 24px; }
    .shop-head { text-align: center; padding-bottom: 14px; border-bottom: 2px solid #004C40; }
    .shop-name { font-size: 22px; font-weight: 800; color: #172117; margin: 0; }
    .shop-meta { font-size: 11px; color: #667066; margin: 4px 0; line-height: 1.45; }
    .doc-title { text-align: center; margin: 18px 0 6px; }
    .doc-title-label { letter-spacing: 4px; color: #667066; font-size: 10px; font-weight: 700; }
    .doc-title-month { font-size: 18px; font-weight: 800; color: #004C40; margin-top: 2px; }
    .status-pill {
      display: inline-block; padding: 3px 10px; border-radius: 999px;
      font-size: 10px; font-weight: 800; letter-spacing: 0.5px;
      color: #fff;
    }
    .status-paid { background: #004C40; }
    .status-pending { background: #F59E0B; color: #172117; }

    .grid { display: flex; gap: 16px; margin-top: 16px; }
    .grid > div { flex: 1; border: 1px solid #E2E8E2; border-radius: 8px; padding: 10px 12px; }
    .grid h3 { margin: 0 0 8px; font-size: 11px; color: #667066; letter-spacing: 1px; text-transform: uppercase; }
    .field { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
    .field label { color: #667066; }
    .field value { color: #172117; font-weight: 600; }

    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    thead th {
      background: #004C40; color: #FFFFFF; padding: 8px 10px; text-align: left;
      font-size: 11px; letter-spacing: 0.5px;
    }
    tbody td { padding: 9px 10px; border-bottom: 1px solid #EFF5EE; color: #172117; }
    tbody tr:nth-child(even) td { background: #F0F8EF; }
    td.amount, th.amount { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { padding: 10px; font-weight: 800; }
    .net-row td { background: #E6F7E3; color: #004C40; font-size: 13px; }

    .footer { margin-top: 24px; display: flex; justify-content: space-between; font-size: 11px; color: #667066; }
    .footer .sig { width: 40%; border-top: 1px solid #8FA08F; padding-top: 4px; text-align: center; }
  </style>
</head>
<body>
  <div class="shop-head">
    <h1 class="shop-name">${shopName}</h1>
    <p class="shop-meta">${shopAddress}</p>
    <p class="shop-meta">Phone: ${shopPhone} &nbsp;•&nbsp; Email: ${shopEmail}</p>
  </div>

  <div class="doc-title">
    <div class="doc-title-label">PAY SLIP</div>
    <div class="doc-title-month">
      ${esc(monthName)} ${esc(year)}
      &nbsp;
      <span class="status-pill ${isPaid ? 'status-paid' : 'status-pending'}">
        ${isPaid ? 'PAID' : 'PENDING'}
      </span>
    </div>
    <p class="shop-meta">Period: ${esc(periodStart)} — ${esc(periodEnd)}</p>
  </div>

  <div class="grid">
    <div>
      <h3>Employee Details</h3>
      <div class="field"><label>Name</label><value>${esc(employee?.name || '—')}</value></div>
      <div class="field"><label>Employee ID</label><value>${esc(empId)}</value></div>
      <div class="field"><label>Role</label><value>${esc(employee?.roleLabel || 'Technician')}</value></div>
      <div class="field"><label>Mobile</label><value>${esc(employee?.phone || '—')}</value></div>
      <div class="field"><label>Email</label><value>${esc(employee?.email || '—')}</value></div>
    </div>
    <div>
      <h3>Attendance</h3>
      <div class="field"><label>Present Days</label><value>${payslip?.presentDays ?? 0}</value></div>
      <div class="field"><label>Daily Wage Days</label><value>${payslip?.dailyWageDays ?? 0}</value></div>
      <div class="field"><label>Period Start</label><value>${esc(periodStart)}</value></div>
      <div class="field"><label>Period End</label><value>${esc(periodEnd)}</value></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Component</th>
        <th>Description</th>
        <th class="amount">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>Regular Salary</td>
        <td>Monthly base salary</td>
        <td class="amount">${formatRupee(payslip?.regularSalary)}</td>
      </tr>
      <tr>
        <td>2</td>
        <td>Regular Wage</td>
        <td>Daily-rate earnings (${payslip?.dailyWageDays ?? 0} days)</td>
        <td class="amount">${formatRupee(payslip?.regularWage)}</td>
      </tr>
      <tr>
        <td>3</td>
        <td>Net Salary</td>
        <td>Salary after deductions</td>
        <td class="amount">${formatRupee(payslip?.netSalary)}</td>
      </tr>
      <tr>
        <td>4</td>
        <td>Net Wage</td>
        <td>Wage after deductions</td>
        <td class="amount">${formatRupee(payslip?.netWage)}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr class="net-row">
        <td colspan="3">NET PAYABLE</td>
        <td class="amount">${formatRupee(totalPayable)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <div class="sig">Employee Signature</div>
    <div class="sig">Authorised Signatory</div>
  </div>
</body>
</html>`;
}

export default function OwnerEmployeePayslipScreen({ route }) {

  // Tablet: cap the column and centre it. A report stretched across a 1024pt
  // iPad makes the eye track the full line and leaves the tiles floating in
  // dead space — phones are unaffected (contentW stays undefined).
  const r = useResponsive();
  const contentW = r.isTablet ? Math.min(r.width - rs(32), 700) : undefined;
  const capStyle = contentW ? { width: contentW, alignSelf: 'center' } : null;
  const { employee, month: routeMonth, year: routeYear } = route.params || {};
  const shopId = useSelector(selectShopId);
  const session = useSelector(selectSession);
  const [data, setData] = useState(null);
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // 'download' | 'share' | null
  const month = routeMonth ?? new Date().getMonth() + 1;
  const year = routeYear ?? new Date().getFullYear();

  const load = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${employee.id}/payslips/${month}/${year}`);
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [employee?.id, month, year]);

  useEffect(() => { load(); }, [load]);

  // Fetch shop header once so the PDF has the right name/address/email.
  useEffect(() => {
    if (!shopId) return;
    let alive = true;
    (async () => {
      try {
        const res = await shopApi.get(`/shops/${shopId}`);
        if (alive) setShop(res);
      } catch {
        if (alive) setShop(null);
      }
    })();
    return () => { alive = false; };
  }, [shopId]);

  if (!employee) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><Text style={styles.error}>Employee not found</Text></View>
      </SafeAreaView>
    );
  }

  const periodStart = data?.periodStart ? formatDate(data.periodStart) : '—';
  const periodEnd = data?.periodEnd ? formatDate(data.periodEnd) : '—';
  const netSalary = Number(data?.netSalary || 0);
  const netWage = Number(data?.netWage || 0);
  const totalPayable = netSalary + netWage;
  const isPaid = totalPayable > 0;
  const empId = employee?.id
    ? `EM-${String(employee.id).slice(0, 8).toUpperCase()}`
    : '—';

  const buildHtml = () => buildPayslipHtml({
    shop,
    ownerMobile: session?.mobile,
    employee,
    payslip: data,
    month,
    year,
    empId,
  });

  // Open the payslip HTML in a new browser window and trigger window.print().
  // Browsers' print dialog has a "Save as PDF" destination, so this is the web
  // equivalent of Download / Share without needing expo-print.
  const printInNewWindow = (html) => {
    if (typeof window === 'undefined') return false;
    const w = window.open('', '_blank');
    if (!w) {
      notify('Pop-up blocked', 'Allow pop-ups for this site to download/share the pay slip.', { preset: 'error' });
      return true;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Give the new doc a tick to layout before printing.
    setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 350);
    return true;
  };

  // Download → opens the system print dialog (iOS: AirPrint; Android: print framework
  // which also offers "Save as PDF"). On web we just open a new window and print.
  const onDownload = async () => {
    if (!data) {
      notify('No payslip', 'There is no payslip to download for this month.');
      return;
    }
    setBusy('download');
    try {
      const html = buildHtml();
      if (Platform.OS === 'web') {
        printInNewWindow(html);
        return;
      }
      const Print = getPrintModule();
      if (!Print) {
        notify('PDF module not installed', 'Run `npm install --legacy-peer-deps` (adds expo-print), then restart Metro with `npx expo start --clear`.', { preset: 'error' });
        return;
      }
      await Print.printAsync({ html });
    } catch (e) {
      notify('Could not open print dialog', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setBusy(null);
    }
  };

  // Share → renders to a temp PDF file then opens the system share sheet.
  // On web we use the same window.open/print path since browsers have no share API
  // for arbitrary file URIs.
  const onShare = async () => {
    if (!data) {
      notify('No payslip', 'There is no payslip to share for this month.');
      return;
    }
    setBusy('share');
    try {
      const html = buildHtml();
      if (Platform.OS === 'web') {
        printInNewWindow(html);
        return;
      }
      const Print = getPrintModule();
      const Sharing = getSharingModule();
      if (!Print) {
        notify('PDF module not installed', 'Run `npm install --legacy-peer-deps` (adds expo-print), then restart Metro with `npx expo start --clear`.', { preset: 'error' });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const isAvailable = Sharing ? await Sharing.isAvailableAsync() : false;
      if (!isAvailable) {
        notify('Sharing unavailable', `PDF saved to: ${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Pay Slip — ${MONTHS_FULL[month - 1]} ${year}`,
      });
    } catch (e) {
      notify('Could not share', e?.message || 'Please try again.', { preset: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, capStyle]}>
        {loading ? (
          <ActivityIndicator size="large" color="#004C40" style={{ marginVertical: rs(28) }} />
        ) : (
          <>
            {/* Hero — month + employee */}
            <View style={styles.hero}>
              <View style={styles.heroTopRow}>
                <View style={styles.heroIconWrap}>
                  <Ionicons name="document-text" size={rs(18)} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroPayslip}>Pay Slip</Text>
                  <Text style={styles.heroMonth}>{MONTHS_FULL[month - 1]} {year}</Text>
                </View>
                <View style={[styles.heroStatusPill, isPaid ? styles.heroStatusPaid : styles.heroStatusPending]}>
                  {/* Pending is the amber fill — white on it is 2.1:1, so it
                      takes dark ink; Paid's deep green keeps white. */}
                  <Text style={[styles.heroStatusText, !isPaid && styles.heroStatusTextOnLight]}>
                    {isPaid ? 'Paid' : 'Pending'}
                  </Text>
                </View>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroEmpRow}>
                <View>
                  <Text style={styles.heroEmpLabel}>Employee</Text>
                  <Text style={styles.heroEmpName}>{employee.name || '—'}</Text>
                  <Text style={styles.heroEmpRole}>{employee.roleLabel || 'Technician'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.heroEmpLabel}>ID</Text>
                  <Text style={styles.heroEmpId}>{empId}</Text>
                </View>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroPeriodRow}>
                <Ionicons name="calendar-outline" size={rs(12)} color="rgba(255,255,255,0.85)" />
                <Text style={styles.heroPeriodText}>{periodStart} → {periodEnd}</Text>
              </View>
            </View>

            {/* Net payout summary */}
            <View style={styles.payoutCard}>
              <Text style={styles.payoutLabel}>Net Payable</Text>
              <Text style={styles.payoutAmount}>{formatRupee(totalPayable)}</Text>
              <View style={styles.payoutSplit}>
                <View style={styles.payoutSplitItem}>
                  <Text style={styles.payoutSplitLabel}>Net Salary</Text>
                  <Text style={styles.payoutSplitValue}>{formatRupee(data?.netSalary)}</Text>
                </View>
                <View style={styles.payoutSplitSep} />
                <View style={styles.payoutSplitItem}>
                  <Text style={styles.payoutSplitLabel}>Net Wage</Text>
                  <Text style={styles.payoutSplitValue}>{formatRupee(data?.netWage)}</Text>
                </View>
              </View>
            </View>

            {/* Attendance summary */}
            <Text style={styles.sectionHeader}>Attendance</Text>
            <View style={styles.attendanceRow}>
              <View style={[styles.attendanceTile, { backgroundColor: '#F0F8EF' }]}>
                <View style={styles.attendanceCheckCircle}>
                  <Ionicons name="checkmark" size={rs(15)} color="#FFFFFF" />
                </View>
                <Text style={styles.attendanceValue}>{data?.presentDays ?? 0}</Text>
                <Text style={styles.attendanceLabel}>Present Days</Text>
              </View>
              <View style={[styles.attendanceTile, { backgroundColor: '#F0F8EF' }]}>
                <Ionicons name="briefcase" size={rs(20)} color="#004C40" />
                <Text style={styles.attendanceValue}>{data?.dailyWageDays ?? 0}</Text>
                <Text style={styles.attendanceLabel}>Daily Wage Days</Text>
              </View>
            </View>

            {/* Earnings breakdown */}
            <Text style={styles.sectionHeader}>Earnings Breakdown</Text>
            <View style={styles.breakdownCard}>
              <BreakdownRow
                icon="cash-outline"
                iconBg="#E6F7E3"
                iconColor="#004C40"
                label="Regular Salary"
                sub="Monthly base"
                value={formatRupee(data?.regularSalary)}
              />
              <View style={styles.breakdownDivider} />
              <BreakdownRow
                icon="time-outline"
                iconBg="#FEF3C7"
                iconColor="#D97706"
                label="Regular Wage"
                sub="Daily-rate earnings"
                value={formatRupee(data?.regularWage)}
              />
              <View style={styles.breakdownDivider} />
              <BreakdownRow
                icon="wallet-outline"
                iconBg="#E6F7E3"
                iconColor="#004C40"
                label="Net Salary"
                sub="After deductions"
                value={formatRupee(data?.netSalary)}
                emphasize
              />
              <View style={styles.breakdownDivider} />
              <BreakdownRow
                icon="card-outline"
                iconBg="#F0F8EF"
                iconColor="#004C40"
                label="Net Wage"
                sub="After deductions"
                value={formatRupee(data?.netWage)}
                emphasize
              />
            </View>

            {/* Actions */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={onDownload}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                {busy === 'download' ? (
                  <ActivityIndicator size="small" color="#004C40" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={rs(16)} color="#004C40" />
                    <Text style={styles.actionBtnSecondaryText}>Download PDF</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={onShare}
                disabled={busy !== null}
                activeOpacity={0.85}
              >
                {busy === 'share' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="share-social-outline" size={rs(15)} color="#FFFFFF" />
                    <Text style={styles.actionBtnPrimaryText}>Share PDF</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {!loading && !data && (
          <Text style={styles.empty}>No payslip data for this month.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BreakdownRow({ icon, iconBg, iconColor, label, sub, value, emphasize }) {
  return (
    <View style={styles.breakdownRow}>
      <View style={[styles.breakdownIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={rs(15)} color={iconColor} />
      </View>
      <View style={styles.breakdownTextWrap}>
        <Text style={styles.breakdownLabel}>{label}</Text>
        <Text style={styles.breakdownSub}>{sub}</Text>
      </View>
      <Text style={[styles.breakdownValue, emphasize && styles.breakdownValueEmphasize]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: rs(12), paddingBottom: rs(24) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: rf(13), color: '#DC2626' },
  empty: { fontSize: rf(12), color: '#667066', textAlign: 'center', marginTop: rs(20) },

  hero: {
    backgroundColor: '#004C40',
    borderRadius: rs(14),
    paddingHorizontal: rs(14),
    paddingVertical: rs(14),
    shadowColor: '#172117', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: rs(10) },
  heroIconWrap: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPayslip: { fontSize: rf(11), color: 'rgba(255,255,255,0.85)', fontWeight: '600', letterSpacing: 0.5 },
  heroMonth: { fontSize: rf(18), fontWeight: '800', color: '#FFFFFF', marginTop: rs(1) },
  heroStatusPill: {
    paddingHorizontal: rs(11),
    paddingVertical: rs(5),
    borderRadius: 999,
  },
  heroStatusPaid: { backgroundColor: 'rgba(255,255,255,0.22)' },
  heroStatusPending: { backgroundColor: '#F59E0B' },
  heroStatusText: { fontSize: rf(11), fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  heroStatusTextOnLight: { color: '#172117' },

  heroDivider: { height: rs(1), backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: rs(10) },

  heroEmpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroEmpLabel: { fontSize: rf(10), color: 'rgba(255,255,255,0.7)', fontWeight: '600', letterSpacing: 0.5 },
  heroEmpName: { fontSize: rf(13.5), fontWeight: '800', color: '#FFFFFF', marginTop: rs(2) },
  heroEmpRole: { fontSize: rf(10.5), color: 'rgba(255,255,255,0.85)', marginTop: rs(1) },
  heroEmpId: { fontSize: rf(13), fontWeight: '800', color: '#FFFFFF', marginTop: rs(2), letterSpacing: 0.3 },

  heroPeriodRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  heroPeriodText: { fontSize: rf(11.5), color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

  payoutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(14),
    padding: rs(14),
    marginTop: rs(10),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8E2',
    shadowColor: '#172117', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  payoutLabel: { fontSize: rf(11.5), color: '#667066', fontWeight: '600', letterSpacing: 0.3 },
  payoutAmount: { fontSize: rf(26), fontWeight: '800', color: '#004C40', marginTop: rs(4) },
  payoutSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: rs(12),
    width: '100%',
  },
  payoutSplitItem: { flex: 1, alignItems: 'center' },
  payoutSplitSep: { width: rs(1), height: rs(28), backgroundColor: '#E2E8E2' },
  payoutSplitLabel: { fontSize: rf(10.5), color: '#8FA08F', fontWeight: '600' },
  payoutSplitValue: { fontSize: rf(14), fontWeight: '800', color: '#172117', marginTop: rs(3) },

  sectionHeader: { fontSize: rf(15), fontWeight: '800', color: '#172117', marginTop: rs(14), marginBottom: rs(9) },

  attendanceRow: { flexDirection: 'row', gap: rs(8) },
  attendanceTile: {
    flex: 1,
    borderRadius: rs(12),
    padding: rs(12),
    alignItems: 'flex-start',
  },
  attendanceCheckCircle: {
    width: rs(26), height: rs(26), borderRadius: rs(13),
    backgroundColor: '#004C40',
    alignItems: 'center', justifyContent: 'center',
  },
  attendanceValue: { fontSize: rf(18), fontWeight: '800', color: '#172117', marginTop: rs(8) },
  attendanceLabel: { fontSize: rf(11), color: '#667066', fontWeight: '600', marginTop: rs(2) },

  breakdownCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: rs(12),
    paddingHorizontal: rs(12),
    paddingVertical: rs(4),
    borderWidth: 1,
    borderColor: '#E2E8E2',
    shadowColor: '#172117', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: rs(11),
    gap: rs(10),
  },
  breakdownIconWrap: {
    width: rs(34),
    height: rs(34),
    borderRadius: rs(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownTextWrap: { flex: 1, minWidth: 0 },
  breakdownLabel: { fontSize: rf(13), fontWeight: '800', color: '#172117' },
  breakdownSub: { fontSize: rf(11), color: '#8FA08F', marginTop: rs(2) },
  breakdownValue: { fontSize: rf(13), fontWeight: '800', color: '#172117' },
  breakdownValueEmphasize: { color: '#004C40', fontWeight: '800' },
  breakdownDivider: { height: rs(1), backgroundColor: '#EFF5EE' },

  actionRow: { flexDirection: 'row', gap: rs(8), marginTop: rs(12) },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    paddingVertical: rs(11),
    borderRadius: rs(12),
  },
  actionBtnSecondary: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#004C40' },
  actionBtnSecondaryText: { color: '#004C40', fontSize: rf(13), fontWeight: '800' },
  actionBtnPrimary: { backgroundColor: '#004C40' },
  actionBtnPrimaryText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '800' },
});
