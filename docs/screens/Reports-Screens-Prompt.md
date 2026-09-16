# Reports Screens — Current-State Spec (GGFIX-Partner-App)

This documents the owner-role reporting flow (`src/screens/owner/`) as currently built, as of 2026-09-10. Read-only reference — no code was changed to produce this doc.

## Contents

1. [ReportsScreen.js](#reportsscreenjs)
2. [OwnerStaffReportScreen.js](#ownerstaffreportscreenjs)
3. [OwnerEmployeeSalaryReportScreen.js](#owneremployeesalaryreportscreenjs)
4. [OwnerEmployeePickupReportScreen.js](#owneremployeepickupreportscreenjs)
5. [BookingStatusReportScreen.js](#bookingstatusreportscreenjs)
6. [BookingPreviousReportScreen.js](#bookingpreviousreportscreenjs)
7. [AllBooking/DeliveryInvoiceReportScreen.js](#deliveryinvoicereportscreenjs)

---

## ReportsScreen.js

- **Path**: `src/screens/owner/ReportsScreen.js`
- **Route name**: `Reports` (registered in `OwnerNavigator.js`, `options={{ title: 'Reports' }}`, native header shown)
- **Purpose**: Placeholder screen. Renders a title and one line of static hint text — no data fetching, no lists, no links to the other report screens.
- **Entry points**: None found. A repo-wide grep for `navigate('Reports'` / `navigate("Reports"` returns zero hits anywhere in `src/`. The task brief's assumption that this is "likely a hub other report screens are entered from" does not hold. The real entry surface for reports is `DashboardScreen.tsx`'s two tile grids (`REPORT_ACTIONS`: Revenue / Service Status / Cash Book, and `EMPLOYEE_ACTIONS`: Attendance / Service Report / Pickup Report / Permissions / Leave), which navigate directly to their target screens via `navigation.getParent().navigate(key, params)` (the `via: 'parent'` tiles), bypassing `Reports` entirely. `BookingStatusScreen` also links directly to `BookingPreviousReport`/`BookingStatusReport` without going through `Reports`.
- **Exit points / navigation out**: None — no buttons, no `Pressable`/`TouchableOpacity` in the file.
- **Key UI sections**:
  - `SafeAreaView` (top edge only), dark background (`#172117`)
  - Title text: "Reports"
  - Hint text: "Reports from billing/sales APIs. Data from backend."
- **State & data**: None. No `useState`, no props consumed, no Redux/context reads.
- **API calls**: None.
- **Notable quirks**: This is effectively dead/stub code still wired into the navigator (`Stack.Screen name="Reports"`) but unreachable from any current UI path. The hint text reads like a leftover placeholder from early scaffolding, describing functionality the screen doesn't implement. Worth flagging as a candidate for removal or for becoming the real hub the other six screens should have linked through.

---

## OwnerStaffReportScreen.js

- **Path**: `src/screens/owner/OwnerStaffReportScreen.js`
- **Route name**: `OwnerStaffReport` (`options={{ headerShown: false }}` — screen renders its own header)
- **Purpose**: All-staff attendance-family report. One screen, four possible modes (attendance / late / permission / leave) driven by `route.params.mode`, aggregating the existing per-employee attendance endpoint across the whole team for a selected month. Tapping a staff row drills into that employee's attendance calendar.
- **Entry points**: `DashboardScreen.tsx`'s `EMPLOYEE_ACTIONS` tile grid, via `via: 'parent'` navigation (`navigation.getParent().navigate('OwnerStaffReport', params)`):
  - "Attendance" tile leads with `{ mode: 'attendance' }`
  - "Permissions" tile leads with `{ mode: 'permission' }`
  - No entry point passes `mode: 'late'` or `mode: 'leave'` anywhere in the app (see Quirks).
- **Exit points / navigation out**:
  - Tapping a staff row → `navigation.navigate('OwnerEmployeeAttendance', { employee: e })`
  - Back chevron → `navigation.goBack()` if possible, else `navigation.navigate('Home')`
- **Key UI sections** (render order):
  - Custom white header: back button, mode icon + title (from `MODE_META`), month stepper, "Total `<Mode>`: N `<unit>`" pill
  - Error banner (red) if the load failed
  - Full-screen `ActivityIndicator` on first load
  - `FlatList` of staff rows: avatar-initials chip, name + `roleLabel`, four stat columns (Present / Late / Perm / Leave) with the active mode's column bolded/tinted, chevron; pull-to-refresh
  - Empty state (icon + "No staff yet" message) when the team list is empty
- **State & data**:
  - `mode` — read from `route.params.mode`, defaults to `'attendance'` (not stored in state)
  - `month` / `year` — stepper state, defaults to current month/year
  - `rows` — array of `{ emp, data }` per technician
  - `loading`, `refreshing`, `error`
  - Derived (`useMemo`): `sorted` (rows sorted descending by the mode's focal metric), `total` (sum of the focal metric across all rows)
- **API calls**:
  - `GET /technicians` (`ticketApi`) — fetch the shop's employee list, triggered on mount and month change
  - `GET /technicians/{id}/attendance?month=&year=` (`ticketApi`) — fanned out with `Promise.all` per employee, each individually `.catch()`-guarded so one failing employee's attendance call doesn't blank the whole list. Expected shape per employee: `{ presentDays, lateHours, permissionCount, leaveDays }`.
- **Notable quirks**:
  - `MODE_META` defines all four modes (`attendance`, `late`, `permission`, `leave`) with distinct icons/colors, but only `attendance` and `permission` are reachable from any navigation call found in the codebase — `late` and `leave` are currently dead paths (the screen fully supports them; nothing links to them).
  - A `pad2()` helper is defined at the top of the file but never called anywhere in it — dead code.
  - Uses NativeWind `className` almost exclusively for layout/styling (unlike `OwnerEmployeeSalaryReportScreen`/`OwnerEmployeePickupReportScreen`, its siblings under the employee-report family, which use `StyleSheet.create` plus `rf()/rs()` responsive helpers instead).

---

## OwnerEmployeeSalaryReportScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeSalaryReportScreen.js`
- **Route name**: `OwnerEmployeeSalaryReport` (registered without `headerShown:false` — native stack header is visible, with `title: 'Salary Report'`, `headerTintColor: '#087A0A'`). The screen itself renders no custom header row — it relies entirely on the native header.
- **Purpose**: One employee's 12-month payslip/salary history for a selectable financial year — monthly present-days + net salary, with a running yearly summary (total present days, total earned, average payout).
- **Entry points**: `OwnerEmployeeDetailScreen.js`'s "Quick Access" grid — the "Salary Report" tile (`route: 'OwnerEmployeeSalaryReport'`), always shown (no role gate), reached via `navigation.push(route, { employee })`. This is the only entry point found; there is no all-staff variant of this screen (contrast with `OwnerStaffReportScreen` and `OwnerEmployeePickupReportScreen`, both of which support an "all employees" mode with no `employee` param).
- **Exit points / navigation out**: Tapping a non-empty month row → `navigation.navigate('OwnerEmployeePayslip', { employee, month: row.month, year: row.year })`. Rows with no payslip yet (`_empty: true`) are disabled (no-op on tap).
- **Key UI sections** (render order):
  - Financial Year card: calendar icon, "Financial Year" label plus `YYYY-YY` value, year-stepper pill
  - Summary tiles row (3-up): Total Present (days), Total Earned (with "N not paid" sub-label), Avg / Month
  - "Monthly Payslips" section header
  - 12 `MonthCard` rows (Jan through Dec of the selected year) — index bubble, month name/year, present-days meta, net salary, status pill (Paid / Unpaid / Pending)
- **State & data**:
  - `employee` — from `route.params.employee` (screen renders an "Employee not found" state if absent)
  - `year` — stepper state, defaults to current year
  - `list` — raw payslip rows for the year from the API
  - `loading`, `refreshing`
  - Derived (`useMemo`): `rows` (12-slot array, filling months with no payslip as `{ _empty: true }` so every month always renders); `totals` (`totalPresent`, `totalNet`, `monthsPaid`, `monthsUnpaid`)
  - `useResponsive()` (tablet detection) caps content width to 700px and centers it on tablets
- **API calls**:
  - `GET /technicians/{employee.id}/payslips?year=` (`ticketApi`) — triggered on mount and on year change; expected response is an array of `{ month, year, presentDays, netSalary, regularSalary, ... }`.
- **Notable quirks**:
  - No error state UI — a failed fetch is swallowed (`catch { setList([]) }`) and silently renders all 12 months as "Pending", indistinguishable from a shop with genuinely no payslips yet.
  - Uses `rf()`/`rs()` responsive helpers throughout (per the app's employee responsive rebrand convention), unlike `DeliveryInvoiceReportScreen` and the `BookingStatusReport`/`BookingPreviousReport` screens, which use fixed px / NativeWind `className` instead.

---

## OwnerEmployeePickupReportScreen.js

- **Path**: `src/screens/owner/OwnerEmployeePickupReportScreen.js`
- **Route name**: `OwnerEmployeePickupReport` (registered without `headerShown:false`; native header title is dynamic — `route.params.employee` present shows "Pickup report", absent shows "Pickup Report"). No custom header row in the screen itself; relies on the native stack header, same pattern as the Salary Report screen.
- **Purpose**: Pickup-assignment report with two modes gated on the presence of `route.params.employee`:
  - Single-employee mode (`employee` param present): this pickup person's own assigned/in-progress/completed pickups for a selected month.
  - All-pickup-person mode (`employee` absent): every booking with any pickup person assigned, for the Dashboard's "Pickup Report" tile — each card additionally shows who it's assigned to.
- **Entry points**:
  - `DashboardScreen.tsx` `EMPLOYEE_ACTIONS` tile "Pickup Report" (`via: 'parent'`, no params) leads to all-pickup-person mode.
  - `OwnerEmployeeDetailScreen.js` "Quick Access" grid — "Pickup Report" tile, but only rendered when `employee.roleLabel` equals "Pickup Person" (role-gated, unlike the Salary Report tile which always shows); `navigation.push('OwnerEmployeePickupReport', { employee })` leads to single-employee mode.
- **Exit points / navigation out**: Tapping any pickup card → `navigation.navigate('OwnerPickupServiceDetail', { id: b.id, booking: b })`.
- **Key UI sections** (render order):
  - "This Month" stats card: month-stepper pill, 4 stat tiles (Assigned / In Progress / Completed / Total)
  - Loading spinner (only while list is empty)
  - "Recent Assigned" — single most-recent assigned-bucket card (or empty-state text)
  - "In Progress" — single most-recent in-progress-bucket card (or empty-state text)
  - "Previous Pickups" — filter chip row (All / Completed / In Progress / Assigned) plus full filtered list of `PickupCard`s (each: date, tracking ID, customer, assignee shown in all-mode only, address, status step line, footer date, refresh/status icon)
- **State & data**:
  - `employee` from `route.params.employee`; `allMode` is true when no employee id is present
  - `month` / `year` — stepper state
  - `list` — all shop repair bookings (unfiltered)
  - `loading`, `refreshing`, `filter` (All / Completed / In Progress / Assigned)
  - Derived: `mineAll` (bookings with `assignedPickupPersonId` set, or matching the given employee's id), `mine` (scoped to the selected month via `pickupDate`/`updatedAt`/`createdAt`), `counts` (bucketed tallies), `sortedDesc`, `recentAssigned`/`recentInProgress`, `filteredList`
  - `bucketize(status)` maps roughly 15 raw booking statuses into 3 buckets: assigned, in progress, completed
- **API calls**:
  - `listShopRepairBookings()` resolves to `GET /repair-bookings/shop` (order-service `orderApi`, via `src/api/orders.js`) — fetches ALL shop pickup bookings; all filtering (by employee, month, status bucket) happens client-side. No server-side filters or pagination are used.
- **Notable quirks**:
  - Filters entirely client-side over what could be an unbounded "all repair bookings for this shop" response — no page size limit visible (contrast with the booking-status/previous-report screens, which explicitly page at size 500).
  - The per-card refresh icon re-triggers the entire list reload, not a per-row refresh — mildly misleading UI (looks like a per-card action, is actually global).
  - Per the codebase's documented pickup-person-assignment pattern, filtering by `assignedPickupPersonId` here is exact (a real UUID column), unlike the technician-side task report which needs a name-fallback due to a missing FK — the in-code comment explicitly calls this out.

---

## BookingStatusReportScreen.js

- **Path**: `src/screens/owner/BookingStatusReportScreen.js`
- **Route name**: `BookingStatusReport` (`options={{ headerShown: false }}`)
- **Purpose**: Drill-down list of tickets belonging to one Booking Status tile (Total Booking, Total Processed, Work Pending, Spare Parts Pending, etc.), with a period filter and running total value.
- **Entry points**: `BookingStatusScreen.js` (route `BookingStatus`, itself reached from `DashboardScreen.tsx`'s `REPORT_ACTIONS` "Service Status" tile) — its `openReport(tile)` handler calls `navigation.navigate('BookingStatusReport', { statusKey: tile.key, label: tile.label, statusList: tile.statusList, bg: tile.color, icon: tile.key })` for every status tile (Total Booking, Total Processed, Total Delivered, Out for Delivery, Total Inprocess, Working Pending, and its two breakdown tiles Spare Parts Pending / Customer Approval Pending).
- **Exit points / navigation out**: Per-ticket card actions:
  - "View Details" → `navigation.navigate('DeviceDetail', { ticketId: t.id })`
  - "History" → `navigation.navigate('BookingTimeline', { ticketId: t.id })`
  - "Invoice" → checks `GET /tickets/{id}/invoice`; if one exists, navigates to `DeliveryInvoiceReport` with `{ ticketId: t.id }`, else to `InvoiceGenerator` with the same param
- **Key UI sections** (render order):
  - Slim header: back button, "Booking Status Report" title, period-filter chip that opens a bottom sheet
  - Gradient hero card (color/icon keyed by the incoming `icon`): status label, ticket count badge, period + total-value footer row
  - "N bookings" row plus Filters chip
  - Error banner / loading spinner / empty state, else a list of ticket cards: numbered chip, tracking-ID pill, price, customer plus device line, issue summary, date, and 3 action pills (View Details / History / Invoice)
  - Bottom-sheet modal — period picker (Today / Yesterday / This Week / This Month / All Time)
- **State & data**:
  - `tickets`, `loading`, `refreshing`, `error`
  - `period` — defaults to `'ALL'` (explicitly chosen so the count here matches the all-time count on the tile that opened it — called out in an in-code comment)
  - `showFilters` — bottom-sheet visibility
  - Route params consumed: `statusKey`, `label`, `statusList` (array of backend status strings), `bg`, `icon`
  - Derived: `periodLabel`, `totalPrice` (sum of price fields across all loaded tickets)
- **API calls**:
  - `GET /tickets?page=0&size=500` (`ticketApi`) when `statusList` is empty (the Total Booking tile — unfiltered)
  - Otherwise one `GET /tickets?page=0&size=500&status={s}` call per status in `statusList`, run in parallel, results flattened and merged; then filtered client-side by the selected period against `createdAt`
  - `GET /tickets/{id}/invoice` (`ticketApi`) — fired on demand when Invoice is tapped, to decide which screen to route to
- **Notable quirks**:
  - Period filtering happens entirely client-side after fetching up to 500 tickets per status — the same "no true server-side date filter" pattern used by `BookingPreviousReportScreen`.
  - A joined CSV string of the status list is used specifically to keep `useCallback`/`useEffect` dependencies stable, since `route.params.statusList` is a fresh array reference on every navigation without params — a deliberate workaround called out in an in-code comment.

---

## BookingPreviousReportScreen.js

- **Path**: `src/screens/owner/BookingPreviousReportScreen.js`
- **Route name**: `BookingPreviousReport` (`options={{ headerShown: false }}`)
- **Purpose**: Monthly status snapshot history — last 6 months of bookings, bucketed by status, derived client-side from the raw ticket feed (there is no dedicated monthly-snapshot backend endpoint, per an explicit in-code comment).
- **Entry points**: `BookingStatusScreen.js`, two separate tappable elements that both navigate here with no params:
  - The "Previous Reports" row in the inset-grouped list (subtitle: "Month-by-month status snapshots")
  - The "Previous" pill button in the screen's floating nav bar
- **Exit points / navigation out**: Tapping any month card → `navigation.navigate('OwnerTabs', { screen: 'Bookings' })` — jumps to the Bookings tab, but does not pass the tapped month as a filter (see Quirks).
- **Key UI sections** (render order):
  - Header: back button, "Previous Reports" title, "{N} months" pill
  - "LAST N MONTHS" eyebrow plus "Monthly status snapshots" heading
  - Summary card: total bookings in the window plus the month-range label
  - Error banner / loading spinner / empty state ("No history yet")
  - 6 month cards (newest first): month label (with a CURRENT badge on the first), total count, 5 status-bucket chips (Accepted / In Service / Ready / Delivered / Pending) each with a count, "View bookings" link
- **State & data**:
  - `tickets`, `loading`, `refreshing`, `error`
  - Constants: 6 months shown, page size 500
  - Derived (`useMemo`): `months` (built by tallying each ticket into a bucket over a fixed 6-month window), `grandTotal`
- **API calls**:
  - `GET /tickets?page=0&size=500` (`ticketApi`) — single call, no status/date filter; all month-bucketing and status-bucketing happens client-side.
- **Notable quirks**:
  - The raw-status-to-display-bucket map here is maintained independently of the separate bucket logic in `BookingStatusReportScreen`/`OwnerEmployeePickupReportScreen` (each of which defines its own status-to-bucket map) — one more site to keep in sync per the project's documented "one status, many edit sites" pattern.
  - Tapping a month card navigates to the live Bookings list with no month/status filter applied at all — the "View bookings" affordance implies drilling into that specific month's data, but it actually just opens the unfiltered current Bookings tab.
  - Only pulls a single page of 500 tickets total; a shop with more than 500 tickets across the 6-month window will silently undercount older months.

---

## AllBooking/DeliveryInvoiceReportScreen.js

- **Path**: `src/screens/owner/AllBooking/DeliveryInvoiceReportScreen.js`
- **Route name**: `DeliveryInvoiceReport` (`options={{ headerShown: false }}`)
- **Purpose**: Renders the final delivery/tax invoice for one ticket (a read-only receipt view) with Download-to-PDF and Share-as-PDF actions. This is the terminal viewer for an already-generated invoice — creation happens on a separate screen, `InvoiceGenerator`.
- **Entry points**, all passing `{ ticketId }`, and all following the same "does an invoice already exist" gate before navigating here:
  - `BookingStatusReportScreen.js` — ticket card Invoice action
  - `BillingScreen.js` (Invoices tab) — ticket card Invoice action
  - `AllBooking/BookingTimelineScreen.js` — the invoice timeline event's View button (only rendered once an invoice event exists)
  - `AllBooking/BookingHistoryScreen.js` — View Invoice card action (only shown once a booking is confirmed to already carry an invoice)
- **Exit points / navigation out**: Only `navigation.goBack()`, shown on the "No invoice generated yet" empty state's Go Back button. Otherwise the screen is a leaf/terminal view — Download and Share are native actions (PDF generation plus the OS share sheet or file save), not navigation.
- **Key UI sections** (render order):
  - Header: back button, "Deliver Invoice" title, invoice-number pill, Download button, Share button
  - Hero row: invoice total (final payable amount) plus delivery date
  - Letterhead card: shop name/owner/mobile on the left, Invoice No / Ticket Date / Delivery Date / GST No on the right; Bill To (customer) / From (shop) two-column block
  - "(A) Service" line-items table (horizontally scrollable): Sl, Description, Rate, Taxable Value, CGST, SGST, Total GST, Total — with a totals row
  - "(B) Spares" line-items table (adds Warranty and Qty columns) — with a totals row
  - "Tax Summary" table — rolls up Service plus Spares plus Grand Total
  - "Total Payable Summary" card — Taxable Amount, Total GST Tax, Discount, Invoice Total (bannered), amount in words, and, only when money moved, Advance Paid / Net Payable / Amount Paid / Credit-or-Balance-Payable
  - Signature and declaration card — customer signature line, shop Authorised Signatory tile, fixed declaration text
- **State & data**:
  - `ticketId` from `route.params`
  - `ticket`, `invoice`, `shop` (public shop card), `owner` (session), `customer` (fallback lookup), `loading`, `sharing`, `downloading`
  - A local session read (`AsyncStorage` via `src/auth/session.js`, not a network call) supplies the logged-in owner's name and phone as a fallback for shop fields
  - Heavy derived math, recomputed on each render rather than stored: per-line GST breakdown respecting the invoice's tax mode (without tax, inclusive, or exclusive), row/table/grand accumulations, a resolved customer address that falls back through the ticket snapshot, the fetched customer record, and composed structured columns, and payment/credit figures (advance paid, amount paid, credit amount, net payable)
- **API calls**:
  - `GET /tickets/{ticketId}` (`ticketApi`)
  - `GET /tickets/{ticketId}/invoice` (`ticketApi`) — if this returns null or errors, the screen renders the "No invoice generated yet" empty state instead of the invoice body
  - `GET /auth/shops/{shopId}/public` (`authApi`) — only if the ticket has a shop id; supplies the shop's public letterhead card (name, mobile, address, GST number)
  - `GET /customers/lookup?mobile={customerPhone}` (`ticketApi`) — only fired when the ticket has a customer phone but no denormalized customer address, as an address fallback
  - All four load calls run together in one `load()` function, each independently caught so one failing lookup doesn't block the rest
- **Notable quirks**:
  - By far the largest of the seven screens (about 1,480 lines) — roughly half of the file builds a hand-written HTML/CSS string template for PDF rendering via `expo-print`, duplicating the on-screen GST/tax math a second time so the printed PDF stays number-identical to the screen. Two independent implementations of the same tax math is a real maintenance risk if one is ever edited without the other.
  - Loads `expo-print` / `expo-sharing` / `expo-file-system` via lazy `require()` wrapped in try/catch rather than static imports, specifically so the screen doesn't crash the web bundle or dev environments missing those native modules.
  - Handles the `expo-file-system` v19+ API split explicitly: tries the new Paths/File class API first, falls back to the legacy submodule's cache-directory/copy functions — consistent with this app's documented SDK54 file-system gotcha.
  - Uses fixed pixel font sizes and NativeWind styling throughout — does not use the responsive scaling helpers that `OwnerEmployeeSalaryReportScreen`/`OwnerEmployeePickupReportScreen` use.
  - Web platform gets a materially degraded Share experience, falling back to a plain text share message instead of a PDF, since there is no native share-file API in the browser.
