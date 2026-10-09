# Employee Screens — Current-State Spec (GGFIX-Partner-App)

This documents the owner-role employee/staff management flow (`src/screens/owner/OwnerEmployee*.js`) as currently built, as of 2026-09-10. Reference/handoff spec — not a redesign proposal.

## Contents
1. [OwnerEmployeeListScreen.js](#owneremployeelistscreenjs)
2. [OwnerEmployeeDetailScreen.js](#owneremployeedetailscreenjs)
3. [OwnerEmployeeAddScreen.js](#owneremployeeaddscreenjs)
4. [OwnerEmployeeAddAdvanceScreen.js](#owneremployeeaddadvancescreenjs)
5. [OwnerEmployeeApplyLeaveScreen.js](#owneremployeeapplyleavescreenjs)
6. [OwnerEmployeeAttendanceScreen.js](#owneremployeeattendancescreenjs)
7. [OwnerEmployeeCreatedScreen.js](#owneremployeecreatedscreenjs)
8. [OwnerEmployeeLeaveScreen.js](#owneremployeeleavescreenjs)
9. [OwnerEmployeePayslipScreen.js](#owneremployeepayslipscreenjs)
10. [OwnerEmployeeShiftDetailsScreen.js](#owneremployeeshiftdetailsscreenjs)
11. [OwnerEmployeeWorkingRecordScreen.js](#owneremployeeworkingrecordscreenjs)
12. [Related (documented elsewhere)](#related-documented-elsewhere)

---

## OwnerEmployeeListScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeListScreen.js`
- **Route name**: `OwnerEmployeeList` (registered `headerShown: false` — screen renders its own header)
- **Purpose**: Roster of the shop's technicians/staff/pickup persons, with an active/seat-allowance summary. Doubles as a "pick a pickup person" chooser when opened with `assignFor: 'pickup'` + `bookingId` params.
- **Entry points**:
  - `MyAccountScreen.js` — "Employee Management" menu row → `navigation.navigate('OwnerEmployeeList')` (no params).
  - `DashboardScreen.tsx` `EMPLOYEE_ACTIONS` tool tile "Team" → `navigate('OwnerEmployeeList', { via: 'parent' })` (dashboard tool grid, no employee params).
  - `DashboardAccountSheet.tsx` — "Employee Management" row → `navigate('OwnerEmployeeList')`.
  - The screen also reads `route.params.assignFor === 'pickup'` + `bookingId` to switch into its pickup-picker mode, but **no current caller was found passing those params** — see Notable quirks.
- **Exit points / navigation out**:
  - Header back → `navigation.goBack()`.
  - "Add Employee" pill (when seats available) → `navigate('OwnerEmployeeAdd')`.
  - Row tap (normal mode) → `navigate('OwnerEmployeeDetail', { employee: e })`.
  - Row tap (pickup-picker mode) → assigns the pickup person then `navigation.goBack()`.
  - "Upgrade Plan" button (seat-limit banner) → `navigate('OwnerSubscription')`.
- **Key UI sections** (render order):
  - Custom white header: back button, title ("Employees" or "Select Pickup Person"), "Add Employee"/"Limit reached" pill (hidden in pickup-picker mode).
  - Loading spinner (initial load only).
  - Summary card: users icon, "All Employees"/"Pickup-eligible staff" label, active/total subtext, `ProgressRing` (SVG ring: used vs. subscription seat limit, or headcount in pickup mode).
  - Seat-limit notice card (amber), shown only when `seats.allowed === false`: title, message, "Upgrade Plan" button.
  - Empty state (icon + copy) when the visible list is empty.
  - Employee row cards: avatar w/ initial + active-dot, name, phone/email, role pill (Pickup Person = truck icon/amber, else wrench/green); right side is either a chevron/spinner (picker mode) or an Active/Inactive `Switch` + chevron-to-detail (normal mode).
  - Footer info card ("You can add, edit or deactivate employees…") shown when list is non-empty and not in picker mode.
- **State & data**:
  - `list` — raw technician rows from `GET /technicians`.
  - `seats` — `{limit, used, remaining, unlimited, allowed, expired, planName, message}` from `fetchEmployeeLimit()`; null if the call fails (UI falls back to plain headcount).
  - `loading` / `refreshing` — initial vs. pull-to-refresh spinners.
  - `toggling` — id of the row whose Active switch is mid-flight.
  - `assigning` — id of the row being assigned as pickup person (picker mode).
  - Derived: `activeCount`, `shopActiveCount`, `seatUsage`, `seatLimit`, `canAdd`, `showLimitNotice`, `ringActive`/`ringTotal` (ring uses seat allowance in normal mode, plain headcount in picker mode).
  - No Redux; `route.params` (`assignFor`, `bookingId`) drive picker mode.
- **API calls**:
  - `GET /technicians` (`ticketApi`) — full roster; fired on every screen focus (`useFocusEffect`), not cached.
  - `fetchEmployeeLimit()` → `GET /technicians/limit` (`ticketApi`) — seat allowance; fetched alongside the roster via `Promise.allSettled`.
  - `PATCH /technicians/:id` (`ticketApi`) with `{ isAvailable }` — Active/Inactive toggle; refetches the seat limit afterward (not adjusted optimistically, since the server decides).
  - `assignPickupPerson(bookingId, { pickupPersonId, pickupPersonName, pickupPersonPhone })` → `POST /repair-bookings/:id/assign-pickup` (`orderApi`, via `src/api/orders.js`) — picker mode only.
- **Notable quirks**:
  - The pickup-picker mode (`assignFor`/`bookingId` params) appears to be **dead/unreachable** in the current app: `AllBooking/BookingActionSheets.js` has its own self-contained `PickupPersonPickerSheet` component (same `/technicians` fetch + same `assignPickupPerson` call) that is used instead of navigating here with those params. No `navigate('OwnerEmployeeList', { assignFor: ... })` call was found anywhere in `src/`.
  - The seat-allowance ring intentionally divides by the **subscription limit**, not headcount — a code comment explains this was previously headcount/headcount (always "full").
  - "Add Employee" stays visible-but-disabled at the seat ceiling rather than hiding, by design (comment explains the rationale).

---

## OwnerEmployeeDetailScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeDetailScreen.js`
- **Route name**: `OwnerEmployeeDetail` (custom header options: title "Employee Details", green tint `#087A0A`, bold `#172117` title)
- **Purpose**: One combined screen for adding a new employee, editing an existing one, and viewing an employee's full profile/quick-access hub (attendance, leave, salary, task/pickup reports). Mode is derived from `route.params.mode` (`'add' | 'edit' | 'view'`).
- **Entry points**:
  - `OwnerEmployeeListScreen` row tap → `{ employee }` (view mode, since no `mode` param and `employee` present).
  - `OwnerEmployeeAddScreen` "New Staff" card → `{ mode: 'add' }` (no employee).
  - `OwnerEmployeeAddScreen` search-result "Work Record" action → `{ employee: emp, viewOnly: true, tab: 'work' }` (view mode; `viewOnly`/`tab` params are read nowhere else in the file — see quirks).
  - `OwnerEmployeeCreatedScreen` "View profile" button → `{ employee }`.
  - Self (`navigation.push`) — header "⋮" menu in view mode → `{ employee, mode: 'edit' }`; Quick Access "Edit Profile" tile → same.
- **Exit points / navigation out**:
  - Add/Edit mode: "Cancel" → `goBack()`. Save success (add) → `navigate('OwnerEmployeeCreated', { employee: created, message })`. Save success (edit) → `notify` + `goBack()`. Delete confirmed → `del /technicians/:id` then `goBack()`.
  - View mode Quick Access grid → `navigation.push(route, params)` to: `OwnerEmployeeShiftDetails`, `OwnerEmployeeAttendance`, `OwnerEmployeeLeave`, conditionally `OwnerEmployeeWorkingRecord` (role = Technician) or `OwnerEmployeePickupReport` (role = Pickup Person), `OwnerEmployeeSalaryReport`, and `OwnerEmployeeDetail` itself (Edit Profile, `mode: 'edit'`).
  - "+ Add" next to Recent Salary Advance → `navigate('OwnerEmployeeAddAdvance', { employee })`.
  - Active/Inactive status pill → in-place confirm + PATCH (no navigation).
- **Key UI sections**:
  - *Add/Edit mode*: profile-photo hero (camera button, upload progress), "Basic Information" card (name, email, phone, role dropdown), "Work Information" card (date of join/birth, shift row, check-in/check-out time inputs), "Identity Verification" card (Aadhaar + PAN: number field + front/back upload tiles each), "Salary Package" card (monthly salary, daily wage), "App Login (optional)" card (password + show/hide, "Employee login enabled" checkbox, OTP hint), Delete Employee card (edit mode only), sticky footer (Cancel / Save or Create button).
  - *View mode*: hero card (avatar, name, role pill, employee ID, tappable Active/Inactive status), check-in/check-out tiles, "Quick Access" icon grid (role-gated), "This Month" card (present-days progress bar + 4 stat tiles: Present/Leave/Permission/Late Hrs), "Recent Salary Advance" card (or empty state) with Paid/Not Paid pills, "Recent Leave Request" card (or empty state) with Approved/Rejected pills, contact footer (2×2 grid: Role/Email/Phone/Department).
- **State & data**:
  - `form` — full field set (name, phone, email, password, roleLabel, salaryAmount, salaryPeriod, dateOfBirth, dateOfJoin, defaultCheckIn/Out, photoUrl, dailyWage, aadhar/pan number + front/back URLs).
  - `active`, `saving`, `roleOpen`, `showPassword`, `loginEnabled`, `uploading` (per-field upload spinner map).
  - `attendanceSummary`, `advances`, `recentLeaves` — loaded together via `loadProfileData()` for the view-mode "This Month"/recent cards.
  - Reads `selectShopId` from Redux (`store/authSlice`) to provision an employee login under the right shop.
  - Edit mode re-fetches the live technician row (`GET /technicians/:id`) on mount to fill in any fields missing from the list-row object passed via params.
- **API calls**:
  - `GET /technicians/:id` (`ticketApi`) — edit-mode field refresh.
  - `GET /technicians/:id/attendance?month&year`, `GET /technicians/:id/advances`, `GET /technicians/:id/leaves?month&year` (`ticketApi`, all `Promise.all` + individually `.catch(() => …)`) — view-mode summary data, reloaded on focus.
  - `POST /auth/shops/:shopId/technicians` (`authApi`) — provisions an app login (mobile/email + optional password) when adding with a phone/email and "Employee login enabled" checked; on `Shop not found` shows a confirm dialog offering to add without login.
  - `POST /technicians` (`ticketApi`) — creates the employee row (add mode), `userId` attached if a login was provisioned.
  - `PATCH /technicians/:id` (`ticketApi`) — edit-mode save, and also the Active/Inactive toggle (`{ isAvailable }`).
  - `DELETE /technicians/:id` (`ticketApi`) — delete employee (with destructive confirm).
  - `uploadMedia(asset, folder)` → `POST` to `MEDIA_UPLOAD_PATH` (`masterApi`, S3-backed) — photo/Aadhaar/PAN image uploads; folder is `employees` for the profile photo, `employee-ids` for ID documents.
- **Notable quirks**:
  - Three very different UIs (add / edit / view) live in one component switched on `mode`, unlike most sibling screens which are one-purpose files.
  - 409 responses from either the auth-service login provisioning call or the ticket-service create call are both treated as the subscription seat limit and routed through `showLimitPopup` — the auth call is deliberately made first so a refusal lands before anything is written.
  - `OwnerEmployeeAddScreen`'s `viewOnly`/`tab: 'work'` params (passed when opening a cross-shop search result) are accepted in the route but never read by this screen — it always renders the same view-mode UI regardless.
  - Save handlers duplicate almost the same body-building code three times (`doCreateEmployee`, `handleSaveEdit`, and the fetch-fresh effect) rather than sharing one serializer.
  - RN Web's `Alert.alert` action-sheet is skipped on web (`Platform.OS === 'web'`) in favor of going straight to the library picker, since RN Web's `Alert` collapses to `window.alert` and can't show multi-button menus.

---

## OwnerEmployeeAddScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeAddScreen.js`
- **Route name**: `OwnerEmployeeAdd` (native header title "Add Staff")
- **Purpose**: Landing screen before creating a brand-new employee record; also lets an owner search for and re-hire staff who previously worked at another shop (cross-shop technician search).
- **Entry points**:
  - `OwnerEmployeeListScreen` "Add Employee" pill → `navigate('OwnerEmployeeAdd')` (gated on seat availability before navigating).
  - `OwnerLeaveRequestsScreen` (empty-state CTA) → `navigate('OwnerEmployeeAdd')`.
- **Exit points / navigation out**:
  - "New Staff" card → `navigate('OwnerEmployeeDetail', { mode: 'add' })`.
  - Search result "Work Record" button → `navigate('OwnerEmployeeDetail', { employee: emp, viewOnly: true, tab: 'work' })`.
  - Search result "Add" button (relieved employees only) → creates the technician row in place, then `navigation.goBack()`.
  - "Block" button (not-relieved employees) → confirm dialog, then blocklists in place (no navigation).
- **Key UI sections**:
  - "New Staff" card (icon, title, subtitle) — primary CTA.
  - "or find existing" divider.
  - Search bar (name/phone, 2-char minimum, 350ms debounce, clear button, inline spinner).
  - Helper text under 2 characters.
  - Search result cards: avatar/initial, name, phone/email, last-shop name, relieved/not-relieved status line, action row (Add + Work Record, or Block + Work Record).
  - Empty-results state (icon + copy) once a search has run with no matches.
- **State & data**:
  - `query`, `results`, `searching`, `searched` (has a search actually run), `acting` (id of the row mid Add/Block request); debounce timer in a `useRef`.
  - No Redux/context reads.
- **API calls**:
  - `GET /technicians/search?q=` (`ticketApi`) — debounced search; failures are swallowed to an empty list ("endpoint not yet available" comment) rather than surfaced as an error.
  - `POST /technicians` (`ticketApi`) with `{ name, phone, email, roleLabel, sourceUserId }` — re-hires a found employee at this shop; a `409` routes to `showLimitPopup` for the seat limit.
  - `POST /technicians/blocklist` (`ticketApi`) with `{ phone, sourceUserId }` — hides a not-yet-relieved employee from future search results at this shop.
- **Notable quirks**:
  - "Add" is only offered when `emp.relievedFromLastShop` is true; otherwise the row only offers "Block", with a confirm dialog warning it hides them from search.
  - A failed search silently renders as "no results" instead of an error toast — deliberate per the inline comment, since the search endpoint may not exist on all environments yet.

---

## OwnerEmployeeAddAdvanceScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeAddAdvanceScreen.js`
- **Route name**: `OwnerEmployeeAddAdvance` (native header title "Add advance")
- **Purpose**: Minimal form to record a cash salary advance paid to one employee.
- **Entry points**: `OwnerEmployeeDetailScreen` — "+ Add" link next to "Recent Salary Advance" → `{ employee }`.
- **Exit points / navigation out**: "Add advance" button on success → `notify` + `navigation.goBack()`. No other navigation targets.
- **Key UI sections**: Amount field (₹, numeric keyboard), Notes field (multiline, optional), submit button (spinner while saving). Falls back to a plain "Employee not found" screen if no `employee` param.
- **State & data**: `amount`, `notes`, `saving` — all local; no Redux.
- **API calls**: `POST /technicians/:id/advances` (`ticketApi`) with `{ amount, notes }` — the only call in the file.
- **Notable quirks**:
  - This is by far the plainest screen of the eleven — plain `StyleSheet`, no design tokens/`rf`/`rs` responsive helpers, no rnr component library, no tablet width-capping — a visibly older/simpler pattern than its siblings (contrast `OwnerEmployeeApplyLeaveScreen`, which is built from the shared `rnr` components).
  - No advance-status field is settable here (Paid/Not Paid is decided elsewhere); this screen only records the request.

---

## OwnerEmployeeApplyLeaveScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeApplyLeaveScreen.js`
- **Route name**: `OwnerEmployeeApplyLeave` (custom header: title "Apply for leave", green tint, bold title)
- **Purpose**: Form to submit a leave request (start date, end date, reason) on behalf of an employee.
- **Entry points**: `OwnerEmployeeLeaveScreen` — "Apply for leave" button → `{ employee }`.
- **Exit points / navigation out**: "Submit Leave Request" on success → `notify` + `navigation.goBack()`. No other destinations.
- **Key UI sections**: Built from the shared `rnr` component kit — employee identity card (avatar initial substitute icon, name, role), Start date / End date `Input` fields (calendar icons both sides, `YYYY-MM-DD` placeholders), Reason `Input` (multiline, 250-char counter), an info note ("Leave request will be sent to your manager for approval"), and a `BottomActionBar` submit button (disabled until both dates are filled).
- **State & data**: `startDate`, `endDate`, `reason`, `saving` — all local. Uses `useBottomBarInset()` for safe-area-correct bottom padding.
- **API calls**: `POST /technicians/:id/leaves` (`ticketApi`) with `{ startDate, endDate, reason }` — the only call.
- **Notable quirks**:
  - Manual date-string validation via regex (`/^\d{4}-\d{2}-\d{2}$/`) rather than a date picker component — dates are typed, not selected from a calendar UI, unlike the calendar-grid UI in `OwnerEmployeeAttendanceScreen`.
  - The note text says the request "will be sent to your manager for approval," but this screen is itself opened from the owner/manager side — an owner is filing leave notionally on the employee's behalf; approval happens in `OwnerEmployeeLeaveScreen`'s Approve/Reject buttons.

---

## OwnerEmployeeAttendanceScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeAttendanceScreen.js`
- **Route name**: `OwnerEmployeeAttendance` (custom header: title "Attendance", green tint, bold title)
- **Purpose**: Monthly attendance report for one employee — calendar grid with status dots plus a daily list of check-in/out records.
- **Entry points**:
  - `OwnerEmployeeDetailScreen` Quick Access → "Monthly Summary" tile → `{ employee }`.
  - `OwnerStaffReportScreen` (Attendance/Permissions dashboard report) row tap → `navigate('OwnerEmployeeAttendance', { employee: e })`.
- **Exit points / navigation out**: None — this is a terminal/leaf report screen (month stepper only changes local state, no navigation calls anywhere in the file).
- **Key UI sections**:
  - "Attendance Overview" card: month pill with prev/next steppers, 5 stat rings (Present / Late / Permission / Leaves / Holidays), a 6×7 calendar grid (day numbers, today highlighted, colored status dot per day: Leave/Late/Permission/Week Off/Holiday), a color-key legend row.
  - "Attendance Monthly" card: month pill + list of `DayCard`s, each showing date, a status pill (Leave / Week Off / General + Permission note), and Check In / Check Out / Working Hrs columns (late times shown in red).
  - Empty-state text when no records exist for the month.
- **State & data**: `month`, `year` (steppable), `data` (full attendance-summary response), `loading`, `refreshing`. `recordsByDate` and `grid` are memoized derivations for the calendar. No Redux.
- **API calls**: `GET /technicians/:id/attendance?month&year` (`ticketApi`) — single call, refetched whenever `month`/`year` changes or the user pulls to refresh.
- **Notable quirks**:
  - Sundays default to a "Week Off" dot only when no other status is recorded for that day — an inferred client-side rule, not something the API returns explicitly.
  - Date parsing for the daily list is done manually from the `YYYY-MM-DD` string components (not `new Date(iso)`) specifically to dodge a timezone bug where UTC parsing shifted the day-of-week backward under IST — documented inline.
  - Tablet width-capping (`contentW`) pattern is repeated near-verbatim across this screen and several siblings (Leave, Payslip, ShiftDetails, WorkingRecord) rather than factored into a shared wrapper.

---

## OwnerEmployeeCreatedScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeCreatedScreen.js`
- **Route name**: `OwnerEmployeeCreated` (registered `headerShown: false`; native title "Employee Created" set but unused since header is hidden)
- **Purpose**: Success confirmation screen shown immediately after an employee is created, before returning to the list or profile.
- **Entry points**: `OwnerEmployeeDetailScreen` — `doCreateEmployee()` success path → `navigate('OwnerEmployeeCreated', { employee: created (or a minimal fallback object), message })`.
- **Exit points / navigation out**:
  - "Back to list" → `navigation.reset({ index: 1, routes: [{ name: 'OwnerTabs' }, { name: 'OwnerEmployeeList' }] })` — resets the stack so the new employee's Add/Detail screens aren't left behind it.
  - "View profile" (shown only if `employee.id` exists) → `navigate('OwnerEmployeeDetail', { employee })`.
- **Key UI sections**: Large checkmark icon, "Employee created" title, subtitle (uses the passed `message`, or falls back to a generated one), an employee summary card (name, role, phone/email) shown only if `employee.name` is present, and the two action buttons.
- **State & data**: Purely presentational — reads `route.params.employee` and `route.params.message`; no local state, no API calls, no Redux.
- **API calls**: None.
- **Notable quirks**:
  - Uses an older flat color palette (`#16BB05` / `#087A0A`) rather than the `#004C40` brand-green used throughout the other ten screens — visibly an older/unmigrated screen (per the app's ongoing green→pine palette migration noted elsewhere in the codebase).
  - `navigation.reset` targeting `['OwnerTabs', 'OwnerEmployeeList']` assumes `OwnerEmployeeList` is reachable as a second stack entry above the tab navigator — this is a fairly unusual reset shape compared to sibling screens, which mostly just `goBack()`.

---

## OwnerEmployeeLeaveScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeLeaveScreen.js`
- **Route name**: `OwnerEmployeeLeave` (custom header: title "Leave details", green tint, bold title)
- **Purpose**: Per-employee leave history and approval screen — monthly stat tiles, most-recent leave request with Approve/Reject actions, and a filterable list of previous requests.
- **Entry points**: `OwnerEmployeeDetailScreen` Quick Access → "Leave Report" tile → `{ employee }`.
- **Exit points / navigation out**: "Apply for leave" button → `navigate('OwnerEmployeeApplyLeave', { employee })`. Approve/Reject buttons act in place (PATCH + reload), no navigation.
- **Key UI sections**:
  - "This Month" stats card: month pill with steppers, 4 stat tiles (Leave / Processing / Rejected / Approved).
  - "Apply for leave" button.
  - "Recent Leave" section: single `LeaveCard` for the most recent request (by `requestedAt`), or an empty state.
  - "Previous Leave" section: filter chip row (All / Approved / Processing / Rejected), then a list of `LeaveCard`s for every other request, or an empty state.
  - `LeaveCard`: date, status pill (Processing/Approved/Rejected), reason / applied-days / request-datetime columns, and (only for pending items) Approve/Reject buttons.
- **State & data**: `month`, `year`, `filter`, `list` (raw leave rows), `loading`, `refreshing`. Derives `counts` (per-status tallies), `sorted` (newest first), `recent`/`previous`/`filteredPrevious`.
- **API calls**:
  - `GET /technicians/:id/leaves?month&year` (`ticketApi`) — loads the month's leave requests.
  - `PATCH /technicians/:id/leaves/:leaveId` (`ticketApi`) with `{ status: 'APPROVED' | 'REJECTED' }` — Approve/Reject actions, followed by a reload.
- **Notable quirks**:
  - Treats both `PENDING` and `PROCESSING` statuses as "processing" (`isPendingLeave` helper) — an inline comment explains the backend actually emits `PENDING`, and older code that keyed only on `PROCESSING` silently hid the Approve/Reject buttons and under-counted the "Processing" tile.
  - "Processing" status pill uses dark text on an amber fill while Approved/Rejected use white text on solid fills — a deliberate contrast-ratio exception called out in a code comment.

---

## OwnerEmployeePayslipScreen.js

- **Path**: `src/screens/owner/OwnerEmployeePayslipScreen.js`
- **Route name**: `OwnerEmployeePayslip` (custom header: title "Pay Slip", green tint, bold title)
- **Purpose**: Renders one month's payslip for an employee (earnings breakdown, attendance, net payable) and lets the owner download or share it as a PDF.
- **Entry points**: `OwnerEmployeeSalaryReportScreen` — row tap (via `openPayslip`) → `navigate('OwnerEmployeePayslip', { employee, month, year })`. (`OwnerEmployeeSalaryReportScreen` itself is documented in the separate Reports doc, but is this screen's only known caller.)
- **Exit points / navigation out**: None — leaf screen. Download/Share buttons open native print/share sheets (or a new browser window on web), not app navigation.
- **Key UI sections**:
  - Dark-green hero card: pay-slip icon, month/year, Paid/Pending status pill, employee name/role/ID, pay period range.
  - "Net Payable" summary card with Net Salary / Net Wage split.
  - "Attendance" tiles: Present Days, Daily Wage Days.
  - "Earnings Breakdown" card: Regular Salary, Regular Wage, Net Salary, Net Wage rows (each icon + label + amount).
  - Action row: "Download PDF" (outlined) and "Share PDF" (filled) buttons, each with its own busy spinner.
  - Empty-state text when no payslip data exists for the month.
- **State & data**: `data` (payslip payload), `shop` (shop header info for the PDF), `loading`, `busy` (`'download' | 'share' | null`). Reads `selectShopId` and `selectSession` from Redux (shop id for the shop lookup, `session.mobile` as a phone fallback in the PDF header).
- **API calls**:
  - `GET /technicians/:id/payslips/:month/:year` (`ticketApi`) — the payslip data.
  - `GET /shops/:shopId` (`shopApi`) — shop name/address/phone/email for the printed header; independent effect keyed off `shopId`.
  - No write calls — Download/Share build an HTML string client-side and hand it to `expo-print`/`expo-sharing` (native) or `window.open()+print()` (web); nothing is uploaded.
- **Notable quirks**:
  - `expo-print`/`expo-sharing` are lazy-`require()`'d inside try/catch (`getPrintModule`/`getSharingModule`) so a missing native install doesn't crash the whole bundle — with an explicit user-facing message telling them to `npm install --legacy-peer-deps` and restart Metro if the module is absent.
  - The payslip HTML is generated and escaped locally (`esc()` helper) rather than fetched pre-rendered from the backend — the PDF layout lives entirely in this screen file.
  - Web path reuses the same `printInNewWindow` helper for both Download and Share, since browsers have no arbitrary-file share API — both buttons do the same thing on web.

---

## OwnerEmployeeShiftDetailsScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeShiftDetailsScreen.js`
- **Route name**: `OwnerEmployeeShiftDetails` (custom header: title "Shift details", green tint, bold title)
- **Purpose**: Day-level check-in/check-out viewer for one employee — a week strip plus either a visual hour-by-hour timeline or a simple list.
- **Entry points**: `OwnerEmployeeDetailScreen` Quick Access → "Daily Shift Schedule" tile → `{ employee }`.
- **Exit points / navigation out**: None — leaf screen; all interactions (date selection, Today button, timeline/list toggle) are local state only.
- **Key UI sections**:
  - Header row: large day-of-month number, weekday + month/year, "Today" shortcut button.
  - Week strip (Mon–Sun): 7 day chips, Sunday tinted red, selected day tinted green.
  - "Schedule" section header + "View as list"/"View as timeline" toggle button.
  - Timeline view: hour rows from 9 AM–10 PM with a dashed connector line/dot, and floating "Check-In Time"/"Check-Out Time" chips positioned at the matching hour.
  - List view: two rows (Check-In Time, Check-Out Time) or an empty-state line if neither exists for the day.
  - Optional status note banner (amber) when the day's status isn't `GENERAL`.
- **State & data**: `selectedDate` (ISO string, defaults to today), `dayData` (the day's attendance record), `loading`, `viewAsList` (toggle). Computes the Monday-start week strip and parses `checkInTime`/`checkOutTime` into 12-hour labels.
- **API calls**: `GET /technicians/:id/attendance/day?date=` (`ticketApi`) — refetched whenever `selectedDate` changes.
- **Notable quirks**:
  - `isoDate()` deliberately builds the date string from local `getFullYear/Month/Date()` rather than `toISOString()`, with an inline comment explaining `toISOString()` is UTC and misreports "today" between midnight and 5:30 AM IST — the same class of timezone bug called out in the Attendance screen.
  - The visual timeline only spans 9 AM–10 PM (`SCHEDULE_HOURS`); a check-in/out outside that window would not appear on the timeline (though it would still show in list view).

---

## OwnerEmployeeWorkingRecordScreen.js

- **Path**: `src/screens/owner/OwnerEmployeeWorkingRecordScreen.js`
- **Route name**: `OwnerEmployeeWorkingRecord` — header title is conditional: `route.params.employee` present → "Working Record"; absent → "Service Report" (set in `OwnerNavigator.js`'s `options` function).
- **Purpose**: Repair-booking "task" report for a technician. Two modes: opened with an `employee` param it shows just that technician's assigned bookings; opened without one (from the dashboard) it shows every technician's assigned bookings shop-wide.
- **Entry points**:
  - `OwnerEmployeeDetailScreen` Quick Access → "Task Report" tile (only shown when `employee.roleLabel === 'Technician'`) → `{ employee }` (single-employee mode).
  - `DashboardScreen.tsx` `EMPLOYEE_ACTIONS` tool tile "Service Report" → `navigate('OwnerEmployeeWorkingRecord', { via: 'parent' })` (no `employee` param → all-technician mode).
- **Exit points / navigation out**: Any task card tap → `navigate('OwnerPickupServiceDetail', { id: booking.id, booking })`. Filter chips and month stepper are local only.
- **Key UI sections**:
  - "This Month" stats card: month pill with steppers, 4 stat tiles (In Process / Pending / Completed / Total).
  - "Recent Pending" section: one `TaskCard` (most recent pending booking) or an empty state.
  - "In Process" section: one `TaskCard` (most recent in-process booking) or an empty state.
  - "Previous Completed" section: filter chip row (All / Completed / In Process / Pending) + full filtered list of `TaskCard`s.
  - `TaskCard`: date + tracking-id row, device/issue line (+ assignee name, all-mode only), status step line + timestamp footer, and a tappable refresh badge that re-triggers the list load.
- **State & data**: `month`, `year`, `list` (all shop repair bookings), `loading`, `refreshing`, `filter`. `allMode = !employee?.id`. Derives `mineAll` (bookings matched to this employee, or every assigned booking in all-mode), `mine` (month-scoped), `counts`, `sortedDesc`, `recentPending`/`recentInProcess`.
- **API calls**: `listShopRepairBookings()` → `GET /repair-bookings/shop` (`orderApi`, via `src/api/orders.js`) — the only call; fetches the whole shop's bookings client-side, then filters/buckets locally by employee, month, and status.
- **Notable quirks**:
  - Per-employee matching is a workaround, not a real filter: `repair_bookings` has `assignedPickupPersonId` (UUID) for pickup persons but only a denormalized `technicianName` string for service technicians, so a technician's own bookings are matched by **exact name string equality**, not by ID. A code comment flags that a proper `assignedTechnicianId` column would let this become a server-side filter.
  - `bucketize()` maps raw status strings into UI buckets and defaults anything unrecognized to `IN_PROCESS` (not to an "unknown" bucket) — the final `return 'IN_PROCESS'` is a fallback for any status not explicitly matched.
  - All-technician mode is a client-side filter over the *entire shop's* bookings (`GET /repair-bookings/shop`) rather than a distinct all-technicians endpoint.

---

## Related (documented elsewhere)

- **OwnerEmployeePickupReportScreen.js** — pickup-assignment report analogous to Working Record, for employees with the "Pickup Person" role; also has a no-`employee`-param all-pickup-person mode reached from the dashboard's "Pickup Report" tile.
- **OwnerEmployeeSalaryReportScreen.js** — per-employee monthly salary/payslip history list; each row opens `OwnerEmployeePayslipScreen` for that month/year.

Both are covered in a separate Reports-focused document.
