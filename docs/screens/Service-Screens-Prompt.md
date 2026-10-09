# Service Screens — Current-State Spec (GGFIX-Partner-App)

Documents the owner-role device intake / booking / service-status flow as currently built, as of 2026-09-10. Read-only reference — not a redesign proposal.

## Contents

1. [DeviceServicesScreen.js (owner/, top-level)](#device-services-owner)
2. [ShopServiceStatusScreen.js](#shop-service-status)
3. [OwnerPickupServiceListScreen.js](#pickup-service-list)
4. [OwnerPickupServiceDetailScreen.js](#pickup-service-detail)
5. [RepairServiceBookingShop.js](#repair-service-booking-shop)
6. [ChooseDeviceScreen.js](#choose-device)
7. [IdentifyDeviceScreen.js](#identify-device)
8. [ScanImeiScreen.js](#scan-imei)
9. [ScanQrCodeScreen.js](#scan-qr-code)
10. [DeviceInformationScreen.js](#device-information)
11. [DeviceColorStorageScreen.js](#device-color-storage)
12. [DeviceMissingPartsScreen.js](#device-missing-parts)
13. [DeviceSecurityLockSheet.js](#device-security-lock-sheet)
14. [DeviceServicesScreen.js (service-booking-shop/)](#device-services-booking)
15. [ServiceBookingDevicesListScreen.js](#service-booking-devices-list)
16. [ServicePriceEstimateScreen.js](#service-price-estimate)
17. [CustomerDetailsScreen.js](#customer-details)
18. [AssignTechnicianScreen.js](#assign-technician)
19. [BookingStatusScreen.js](#booking-status)
20. [BookingSuccessfulScreen.js](#booking-successful)
21. [BookingThankYouScreen.js](#booking-thank-you)

Route names below are all taken from `src/navigation/OwnerNavigator.js` and `src/screens/owner/service-booking-shop/RepairServiceBookingShop.js` (the nested stack that hosts most of this flow). Entry points were confirmed with repo-wide greps for `navigate(...)`/`replace(...)` calls, not guessed; where none were found this is stated explicitly.

---

<a id="device-services-owner"></a>
## DeviceServicesScreen.js (owner/, top-level)

- **Path**: `src/screens/owner/DeviceServicesScreen.js`
- **Route name**: **None.** Not imported anywhere in `OwnerNavigator.js` or any other file (`grep` for the import path returns zero hits). It is not reachable through any current navigator.
- **Purpose**: Standalone screen that, given a customer/device already picked, lets the owner tick repair services, set a price and warranty per service, and add IMEI/issue notes.
- **Entry points**: None found. No other file references this path.
- **Exit points / navigation out**: `Continue` → `navigation.navigate('ServiceBookingDevicesList', { customer, devices: [devicePayload] })`. That route only exists inside the `RepairServiceBookingShop` nested stack, so this call would fail if this screen were ever mounted standalone — another sign it predates the current wiring.
- **Key UI sections**: header (back button + "Device Services" title); device card (image, computed display name, color); service rows (icon, name, price `TextInput`, "See Last 5 Prices" label, Add/Remove pill, 3/6/12-month warranty chips); "IMEI (optional)" input; "Complaint / Issue (optional)" multiline input; green "Continue" button.
- **State & data**: `selected` (id→bool), `prices` (id→number, seeded `{ display: 10500, battery: 2500 }`), `warranty` (id→code), `imei`, `issueDescription`; `useRepairServices()` hook for the catalog, falling back to a hardcoded `DEFAULT_SERVICES` array of 8 generic repair types.
- **API calls**: `useRepairServices()` (GET `/master/repair-services` under the hood). No other calls.
- **Notable quirks**: Orphaned/dead file — same name as #14 below but a completely different, older implementation (flat list + hardcoded default prices/services vs. the live screen's accordion + custom-issue cart). "See Last 5 Prices" renders but has no `onPress`. Placeholder image URLs point at `https://dummyassets.local/...`. Almost certainly superseded by the `service-booking-shop/DeviceServicesScreen.js` and left in place unremoved.

---

<a id="shop-service-status"></a>
## ShopServiceStatusScreen.js

- **Path**: `src/screens/owner/ShopServiceStatusScreen.js`
- **Route name**: `ShopServiceStatus` (registered on `OwnerNavigator`'s root stack, `headerShown: false`).
- **Purpose**: Lets the shop advance a booking's status along one of two fixed rails — a long repair-service rail (`SERVICE_OPTIONS`, 18 steps from "Assign to Technician" through "Delivered") or a shorter pickup rail (`PICKUP_OPTIONS`, 8 steps) — which lights up matching steps on the customer's timeline.
- **Entry points**: Only one call site found in the whole codebase: `service-booking-shop/BookingStatusScreen.js`'s "Update Customer Service Status" button (`navigation.navigate('ShopServiceStatus')`, no params). That caller itself has no confirmed entry point either (see [BookingStatusScreen.js](#booking-status) quirks), so this screen's practical reachability from the live app could not be fully confirmed.
- **Exit points / navigation out**: None — back button only.
- **Key UI sections**: `ScreenHeader` "Update Service Status"; scrollable list of booking cards (booking number, SERVICE/PICKUP pill, services summary, updated date, current-status `Badge`); "Change Status"/"Close" toggle per card; expanding 2-column grid of status chips, active/saving state per chip.
- **State & data**: `list`, `loading`, `refreshing`, `openId` (expanded card), `savingKey` (per-chip spinner key). No Redux reads.
- **API calls**: `listShopRepairBookings()` → `GET /repair-bookings/shop` on mount + pull-to-refresh; `postShopBookingStatus(id, { status, note })` → `POST /repair-bookings/{id}/shop-status` when a chip is tapped, then reloads the list.
- **Notable quirks**: The list is pre-filtered to `serviceBookings = list.filter(bk => !isPickupBooking(bk))` (pickups excluded), yet the per-row rendering still branches on `isPickupBooking(bk)` to choose `PICKUP_OPTIONS` vs `SERVICE_OPTIONS` — that branch is now dead code since no pickup row ever reaches it. The `SERVICE_OPTIONS` key list is hand-kept in sync with `common/serviceHistoryPhases.js` per an inline comment (see memory: timeline status sites — one status touches 9 edit sites).

---

<a id="pickup-service-list"></a>
## OwnerPickupServiceListScreen.js

- **Path**: `src/screens/owner/OwnerPickupServiceListScreen.js`
- **Route name**: `OwnerPickupServiceList` (root stack, `headerShown: false`).
- **Purpose**: Filterable list of the shop's pickup-mode (`serviceMode === 'PICKUP'`) repair bookings, with status chips (All/Active/New/Completed/Cancelled) and live counts.
- **Entry points**: **None found.** A repo-wide search for `OwnerPickupServiceList` turns up only its own import/registration in `OwnerNavigator.js` and its own file — no screen currently navigates to it.
- **Exit points / navigation out**: Row press → `navigation.navigate('OwnerPickupServiceDetail', { id: item.id, booking: item })`.
- **Key UI sections**: `ScreenHeader` "Pickup Service" / "Shop pickup requests"; horizontal `Chip` filter row with counts; `FlatList` of `PickupRow` cards (icon, booking number, status `Badge`, customer/mobile/date/slot/estimate/ticket detail grid via a `Detail` sub-component, pickup address, repair-service summary, "View details" chevron); `Loader` / `EmptyState`.
- **State & data**: `allItems`, `loading`, `refreshing`, `error`, `statusFilter`; `items` (filtered) and `counts` derived via `useMemo`.
- **API calls**: `listShopRepairBookings()` → `GET /repair-bookings/shop`, filtered client-side to pickups, refetched on `useFocusEffect`.
- **Notable quirks**: Registered as a route but currently has no in-app entry point — the Bookings list and Dashboard use a different pickup surface (see memory: pickup data split). Duplicates `STATUS_VARIANT`/date-formatting logic that also appears, copy-pasted rather than shared, in [OwnerPickupServiceDetailScreen.js](#pickup-service-detail).

---

<a id="pickup-service-detail"></a>
## OwnerPickupServiceDetailScreen.js

- **Path**: `src/screens/owner/OwnerPickupServiceDetailScreen.js`
- **Route name**: `OwnerPickupServiceDetail` (root stack, `headerShown: false`).
- **Purpose**: Full detail view of one pickup booking — device, price summary, complaint, schedule, photos, customer/address — plus the shop-side actions to confirm the order and mark it received at the shop.
- **Entry points**: `navigate('OwnerPickupServiceDetail', { id, booking })` from: `AllBooking/BookingHistoryScreen.js` (two call sites), `OwnerEmployeeWorkingRecordScreen.js`, `OwnerEmployeePickupReportScreen.js`, `OwnerSearchScreen.js` (pickup search hits), and [OwnerPickupServiceListScreen.js](#pickup-service-list)'s own row press.
- **Exit points / navigation out**: None — pure detail/action screen, back button only.
- **Key UI sections**: `ScreenHeader` "Pickup Details"; booking header card; device card (image + label resolved from master-data ids); Price Summary card (line items + total); Complaint Issue card; Service Schedule card (estimated ready/delivery time, customer approval); Device Photos card (front/back/video `MediaTile` slots, always rendered even when empty); Customer & Pickup card; conditional "Confirm pickup request" card (shown when status is `ORDER_PLACED`/`PICKUP_REQUESTED`); read-only Pickup Person card; conditional Shop hand-off card with a "Mark Received" button (status `REACHED_SHOP`) or a "Received" summary (status `RECEIVED_AT_SHOP`).
- **State & data**: `data` (seeded from `route.params.booking` to avoid a loading flash), `loading`, `error`, `device` (brand/model/ram/storage resolved async), `confirming`, `receiving`.
- **API calls**: `getShopRepairBooking(id)` → `GET /repair-bookings/shop/{id}` on focus; `getBrands()` → `GET /master/brands`, `getModelsByBrand(brandId)` → `GET /master/brands/{id}/models`, `getRamOptions()` → `GET /master/ram-options`, `getStorageOptions()` → `GET /master/storage-options` (all four to resolve the device label/image); `confirmShopRepairBooking(id)` → `POST /repair-bookings/{id}/confirm-order` (Confirm button); `markPickupReceivedAtShop(id)` → `POST /shop/pickup-bookings/{id}/receive-at-shop` (Mark Received button).
- **Notable quirks**: `markPickupReceivedAtShop` calls through `ticketApi` while every other call on this screen goes through `orderApi` — a genuine cross-service call (order-service booking, ticket-service hand-off), consistent with the pickup Reached/Received flow using a 50m GPS gate server-side. Assigning/reassigning the pickup person is deliberately NOT done here — an inline comment says that now lives on the Bookings list's "Pickup Assign" sheet; this screen only displays the outcome, read-only.

---

<a id="repair-service-booking-shop"></a>
## RepairServiceBookingShop.js

- **Path**: `src/screens/owner/service-booking-shop/RepairServiceBookingShop.js`
- **Route name**: `RepairServiceBookingShop` on `OwnerNavigator`'s root stack (`headerShown: false`) — but the component itself is a `createNativeStackNavigator()`, not a leaf screen. It hosts the rest of this document's flow (17 nested routes) as its own stack so the whole wizard can be entered/targeted from anywhere via `navigate('RepairServiceBookingShop', { screen, params })`.
- **Purpose**: Container/router for the device-intake and booking wizard.
- **Entry points**: Dashboard "Book Service" quick-action tile (`DashboardScreen.tsx`'s `gotoParent('RepairServiceBookingShop')`, no params → lands on `initialRouteName="CustomerDetails"`); `OwnerSearchScreen.js` "Book" action on a device search hit (`navigate('RepairServiceBookingShop', { screen: 'DeviceColorStorage', params })`); `AllBooking/TicketDetailScreen.js`'s "Re-Assign Technician" action (`navigate('RepairServiceBookingShop', { screen: 'AssignTechnician', params: { tickets, customer, devices, returnToTicketId } })`); `AllBooking/TicketDetailScreen.js`'s "Edit"/"Re-Estimate" action, incl. an `autoEdit` route param that auto-fires it (`navigate('RepairServiceBookingShop', { screen: 'SelectBrand', params: { ...editParams, categoryId, categoryName, flow: 'BOOKING' } })` — this is how the whole prefill/edit path described below gets threaded in).
- **Exit points / navigation out**: N/A (a navigator, not a screen). Its child screens navigate to each other within the nested stack, and out to `ShopServiceStatus` / `OwnerTabs`→`Home` which bubble up to the parent stack.
- **Key sections**: none (no render output besides `Stack.Navigator`).
- **State & data**: none.
- **API calls**: none directly.
- **Notable quirks**: Registers `CustomerDetails` (initial), `IdentifyDevice`, `ChooseDevice`, `SelectBrand`/`SelectSeries`/`SelectModel` (the shared device pickers, re-registered here on purpose — same components `OwnerNavigator` also registers, so nested navigation resolves them without duplicating code), `DeviceColorStorage`, `DeviceServices`, `ServiceBookingDevicesList`, `ServicePriceEstimate`, `DeviceInformation`, `DeviceMissingParts`, `BookingThankYou`, `AssignTechnician`, `BookingSuccessful`, `ScanQrCode`, `ScanImei`, `BookingStatus`. A comment notes a `DeviceSecurity` route was removed — that screen is now the [DeviceSecurityLockSheet](#device-security-lock-sheet) popup. `ScanQrCode`/`ScanImei` are ALSO registered on the outer `OwnerNavigator` stack pointing at the exact same component files (harmless duplication). `BookingStatus`, however, is a genuine route-name collision: the outer stack's `BookingStatus` route points at a **different** file (`owner/BookingStatusScreen.js`, out of this doc's scope), while this nested stack's `BookingStatus` points at [service-booking-shop/BookingStatusScreen.js](#booking-status) — which one resolves depends entirely on which stack the caller is currently inside.

---

<a id="choose-device"></a>
## ChooseDeviceScreen.js

- **Path**: `src/screens/owner/service-booking-shop/ChooseDeviceScreen.js`
- **Route name**: `ChooseDevice` (nested `RepairServiceBookingShop` stack only).
- **Purpose**: 5-across device-category grid ("Select Category") that hands off to the shared brand/series/model picker chain (`SelectBrand` with `flow: 'BOOKING'`).
- **Entry points**: Live: [ServiceBookingDevicesListScreen.js](#service-booking-devices-list)'s "Add another device" button (`navigate('ChooseDevice', { customerId, customer, existingDevices })`). Feature-flagged off: [IdentifyDeviceScreen.js](#identify-device)'s "Skip — choose manually" link (`navigation.replace('ChooseDevice', ...)`) — reachable only if `IdentifyDevice` itself is reachable, which it currently is not (see that screen's quirks). Note the main new-customer flow no longer routes through this screen at all: [CustomerDetailsScreen.js](#customer-details) now opens its own inline category bottom-sheet and jumps straight to `SelectBrand`, bypassing `ChooseDevice` entirely.
- **Exit points / navigation out**: Category tap → `navigation.navigate('SelectBrand', { ...params, flow: 'BOOKING', categoryId, categoryCode, categoryName })`.
- **Key UI sections**: `ScreenHeader` "Select Category"; optional "Booking for {customer}" card when `params.customer` is set; 5-column category grid (icon or `DeviceImage`, name), sorted by a hardcoded `CODE_ORDER` (Mobile → Tablet → Laptop → Smartwatch → Audio) with unranked extras appended alphabetically; `Loader` / `EmptyState`.
- **State & data**: `cats`, `loading`. Column width/thumbnail size computed from `useWindowDimensions()`.
- **API calls**: `getDeviceCategories()` → `GET /master/device-categories` on mount, filtered to `isActive !== false`.
- **Notable quirks**: Its own header comment explicitly distinguishes it from the shared `SelectCategory` route used by the Sell/profile flows — this is the booking-specific one. Now effectively a secondary/legacy entry point (see Entry points) since the primary flow bypasses it.

---

<a id="identify-device"></a>
## IdentifyDeviceScreen.js

- **Path**: `src/screens/owner/service-booking-shop/IdentifyDeviceScreen.js`
- **Route name**: `IdentifyDevice` (nested stack only).
- **Purpose**: Scan or type an IMEI to auto-detect brand/model via IMEI lookup and skip straight to color/RAM/storage.
- **Entry points**: **Currently unreachable in the live app.** Its only caller, [CustomerDetailsScreen.js](#customer-details)'s `save()`, gates the `navigation.replace('IdentifyDevice', ...)` call behind a module constant `IDENTIFY_DEVICE_ENABLED = false` — the comment explains the IMEI.info account isn't funded yet, so it always falls back to manual selection. The code path and screen remain in place, ready to flip on.
- **Exit points / navigation out**: Successful IMEI match → `navigation.navigate('DeviceColorStorage', { ...params, flow: 'BOOKING', categoryId, categoryCode, categoryName, brandId, brandName, seriesId, modelId, modelName, modelImageUrl, imei })`. No match / lookup failure / not configured → `goManual()` → `navigation.replace('ChooseDevice', { customerId, customer })`. "Scan IMEI barcode" card → `navigate('ScanImei', { onScan })`.
- **Key UI sections**: `ScreenHeader` "Identify Device"; hero icon + copy; "Scan IMEI barcode" card; "OR ENTER MANUALLY" divider; manual IMEI `TextInput` (14–17 digit validation); "Detect Device" button (loading state); "Skip — choose the device manually" link; "Powered by IMEI database lookup" trust strip.
- **State & data**: `imei`, `loading`; `lastLookedUpRef` guards against double-firing a paid lookup on a double-tap.
- **API calls**: `lookupImei(digits)` → `GET /master/imei-lookup?imei={digits}` (via `masterApi`), triggered by "Detect Device" or immediately after a successful scan.
- **Notable quirks**: Dead code path today (see Entry points) — the whole screen only becomes reachable again if `IDENTIFY_DEVICE_ENABLED` is flipped to `true` and an `IMEI_API_SERVICE_ID` is configured, per the comment in `CustomerDetailsScreen.js`.

---

<a id="scan-imei"></a>
## ScanImeiScreen.js

- **Path**: `src/screens/owner/service-booking-shop/ScanImeiScreen.js`
- **Route name**: `ScanImei` — registered BOTH on `OwnerNavigator`'s root stack and inside the `RepairServiceBookingShop` nested stack, pointing at this same file in both places.
- **Purpose**: Camera barcode scanner constrained to IMEI-shaped values (14–17 digits), returning the scanned value to the caller via an `onScan` param callback.
- **Entry points**: [IdentifyDeviceScreen.js](#identify-device)'s "Scan IMEI barcode" card (currently dead, see that screen); [ServicePriceEstimateScreen.js](#service-price-estimate)'s "Scan" button next to the IMEI field (live, the only currently-reachable caller found).
- **Exit points / navigation out**: On a valid barcode hit, calls `onScan(imei)` then `navigation.goBack()`. Camera-permission-denied state offers "Cancel" (goBack) or "Grant Camera"/"Open Settings".
- **Key UI sections**: Permission gate screens (loading / denied); full-screen `CameraView` with `code128`/`code39`/`code93`/`ean13`/`ean8`/`upc_a`/`upc_e`/`codabar`/`itf14`/`datamatrix`/`qr` barcode types enabled; cut-out frame with corner brackets + hint text; "Enter manually instead" escape hatch.
- **State & data**: `permission`/`requestPermission` (from `useCameraPermissions`), `scanned`; `handlingRef` debounces multiple detections per frame.
- **API calls**: None — pure camera/permissions, delegates the actual lookup to the caller via `onScan`.
- **Notable quirks**: None beyond the dual-registration noted above (harmless, same component both times).

---

<a id="scan-qr-code"></a>
## ScanQrCodeScreen.js

- **Path**: `src/screens/owner/service-booking-shop/ScanQrCodeScreen.js`
- **Route name**: `ScanQrCode` — also registered both on the root `OwnerNavigator` stack and inside the nested `RepairServiceBookingShop` stack, same file both times.
- **Purpose**: Scan a ticket's printed QR/barcode slip and show its live status + key details inline, without leaving the camera view.
- **Entry points**: Only one live call site found: [BookingThankYouScreen.js](#booking-thank-you)'s "Barcode Print" action tile falls back to `navigate('ScanQrCode')` when the just-created ticket has no id yet.
- **Exit points / navigation out**: None forward — back button (`ChevronLeft`) only; "Scan another" / "Try again" reset in place rather than navigating.
- **Key UI sections**: Full-screen `CameraView` (`qr`/`datamatrix`/`code128`); header overlay with back button; scan-frame overlay (hidden once a result sheet is up); bottom result sheet with three states — loading spinner, found (device/customer/services/price/ready-by/security/technician/issue `DetailRow`s + status chip + "Scan another"), or not-found (AlertTriangle icon + "Try again"). Permission-denied gate mirrors `ScanImeiScreen`.
- **State & data**: `permission`, `scanned`, `loading`, `ticket`, `notFound`; `handlingRef` debounces detections.
- **API calls**: `resolveTicket(raw)` helper — if the scanned value looks like a UUID, `GET /tickets/{id}` first; otherwise (or as a fallback) `GET /tickets?q={value}&size=5` via `ticketApi`, matching on `trackingId`; a last-resort `GET /tickets/{value}` if nothing else hits.
- **Notable quirks**: None significant; well isolated self-contained scan+lookup UI.

---

<a id="device-information"></a>
## DeviceInformationScreen.js

- **Path**: `src/screens/owner/service-booking-shop/DeviceInformationScreen.js`
- **Route name**: `DeviceInformation` (nested stack only).
- **Purpose**: Review bill/complaint/timeline summary, capture the three required-ish device photos (front/back required, coverage video optional), then chain into the Device Security Lock popup and on to Missing Parts.
- **Entry points**: [ServicePriceEstimateScreen.js](#service-price-estimate)'s `onContinue` (`navigate('DeviceInformation', { ...params, imei, complaint, issueAudioUrl, estimatedAt, estimatedDelivery, estimatedReadyIso, estimatedDeliveryIso, durationHours, customerApproved })`) — both for a fresh booking and for the edit/re-estimate path (carrying `editMode`/`editTicketId`/`prefillDevicePhotos`/`prefillLock` through from `TicketDetailScreen`'s `buildEditParams`).
- **Exit points / navigation out**: "Continue" opens the [DeviceSecurityLockSheet](#device-security-lock-sheet) popup (`setLockOpen(true)`); the sheet's own confirm (`onLockConfirm`) then, after a 320ms handoff delay, calls `navigation.navigate('DeviceMissingParts', { ...params, devicePhotos, lock })`.
- **Key UI sections**: white header (back + "Device Information"); device summary card (image, model/ram/storage/color, model-number chip, service-count chip, total chip); Price Summary section (per-service rows + total); Complaint Issue section (text + voice-note playback row, using `expo-audio`'s `createAudioPlayer`); Repair Timeline section (Received/Ready-by columns + Customer Approval indicator); Device Files section — 3-slot photo/video grid (Front/Back required, Full Coverage optional) with camera-or-gallery picker via `Alert.alert`/`ImagePicker`; sticky CTA showing missing-required-photo count; the `DeviceSecurityLockSheet` mounted at the bottom.
- **State & data**: `photos` ({front,back,video} URLs, seeded from `prefillDevicePhotos`), `uploading`, `lockOpen`, `lock`, `isPlayingIssue`; `handoffRef`/`issueSoundRef` for cleanup.
- **API calls**: `uploadMedia(asset, 'repair', { slot })` → `POST /media/upload` (via `masterApi.upload`) per photo/video pick, landing in S3 under `Devicefiles/`.
- **Notable quirks**: Explicit hex colors (`#004C40` "ACCENT") instead of Tailwind tokens throughout, with a comment explaining NativeWind's build-time class cache goes stale after a token change — a recurring pattern across this whole flow's newer screens. The lock→missing-parts handoff uses a deliberate `setTimeout(HANDOFF_MS=320)` because closing one RN `Modal` and opening another in the same tick is unreliable on iOS.

---

<a id="device-color-storage"></a>
## DeviceColorStorageScreen.js

- **Path**: `src/screens/owner/service-booking-shop/DeviceColorStorageScreen.js`
- **Route name**: `DeviceColorStorage` (nested stack only).
- **Purpose**: Pick the device's color, model number (if the model has several), and RAM/Storage variant (or type them freely for an uncataloged "Other" model), then continue to service selection.
- **Entry points**: `shared/device/SelectModelScreen.js` (two call sites) when `flow === 'BOOKING'`; `OwnerSearchScreen.js`'s "Book" action jumping directly into `RepairServiceBookingShop` at this screen; [IdentifyDeviceScreen.js](#identify-device) on an IMEI catalog match (currently dead, see that screen).
- **Exit points / navigation out**: "Continue"/`onSkip` → `navigation.navigate('DeviceServices', { ...params, color, ramOptionId, storageOptionId, ramLabel, storageLabel, modelNumber })` (custom-model path sends typed `color`/`ramLabel`/`storageLabel` with null option ids instead).
- **Key UI sections**: white header (back + "Your Device" + "Skip"); device summary (image, name, brand, model-number chip); optional Model Number picker (`Select`, shown only when the model has >1 model number); Color section (swatch tiles when the model has configured colors, else free-text input); RAM & Storage — combined variant grid when the model defines specs, else two separate RAM/Storage fallback grids; sticky bottom bar summarizing the picked configuration, disabled until required fields are set.
- **State & data**: `loading`, `rams`, `storages`, `specs`, `colorsList`, `color`, `ram`, `storage`, `modelNumbers`, `modelNumber`; `isCustomModel` (true when `params.customModel` or no `modelId`) switches the whole screen to free-text inputs for color/RAM/storage.
- **API calls**: `getModelOptions(params.modelId)` → resolves via `getColors()`/`getRamOptions()`/`getStorageOptions()`/`getModel(modelId)` under the hood (`GET /master/*` family), returning the model's configured colors/specs plus the full master lists as fallback.
- **Notable quirks**: The "Other"/custom-model path exists specifically because an unlisted device previously offered every color/RAM/storage the whole platform knows — the fallback there is typed text, not the full master list. Same `#004C40` explicit-hex pattern as `DeviceInformationScreen`.

---

<a id="device-missing-parts"></a>
## DeviceMissingPartsScreen.js

- **Path**: `src/screens/owner/service-booking-shop/DeviceMissingPartsScreen.js`
- **Route name**: `DeviceMissingParts` (nested stack only).
- **Purpose**: Flag any of 7 fixed parts (Display, Back Panel, SIM Tray, Buttons, Charging Port, Camera, Speaker) as Missing and/or Damaged, with an optional detail note each, before finalizing the device into the booking's device list.
- **Entry points**: [DeviceInformationScreen.js](#device-information)'s `onLockConfirm`, after the security-lock popup is confirmed (`navigate('DeviceMissingParts', { ...params, devicePhotos, lock })`).
- **Exit points / navigation out**: "Continue" → `navigation.navigate('ServiceBookingDevicesList', { ...params, missingParts: flaggedItems })`.
- **Key UI sections**: white header (back + "Device Missing Parts"); status strip ("All parts present" or "N parts flagged" summary); "PART CHECKLIST" section with one card per part — icon, name, "Missing"/"Damage" `FlagPill` toggles, and a detail `TextInput` that appears once either flag is set; sticky CTA showing flagged count.
- **State & data**: `state` (per-part `{missing, damage, detail}`, seeded from `params.prefillMissingParts` for the edit flow); `missingCount`/`damageCount`/`flaggedItems` derived via `useMemo`.
- **API calls**: None — pure local form state, forwarded onward as `missingParts`.
- **Notable quirks**: Uses `KeyboardAwareScrollView` (not the manual keyboard-height dance some sibling sheets use) with a comment explaining this is a real screen (not a `Modal`), so the app's root `KeyboardProvider` already instruments it. Tablet layout caps content width and centers it.

---

<a id="device-security-lock-sheet"></a>
## DeviceSecurityLockSheet.js

- **Path**: `src/screens/owner/service-booking-shop/DeviceSecurityLockSheet.js`
- **Route name**: **N/A — not a navigator route.** A `ResponsiveModal`-based popup component mounted directly inside [DeviceInformationScreen.js](#device-information) (`<DeviceSecurityLockSheet visible={lockOpen} .../>`); it has no route name and cannot be navigated to independently.
- **Purpose**: Capture the device's screen-lock type and value (Numeric PIN, Alphanumeric Password, Pattern, or None) as a two-step popup: pick a type, then enter it.
- **Entry points**: Opened by `DeviceInformationScreen`'s "Continue" button (`setLockOpen(true)`).
- **Exit points / navigation out**: Not a navigation exit — calls `onConfirm(lock)` (which `DeviceInformationScreen` uses to then navigate to `DeviceMissingParts`) or `onClose()` to dismiss without saving.
- **Key UI sections**: drag handle + header (title or back-to-list arrow while entering a value) + close button; type-list step — Current Lock summary card + 4 selectable rows (PIN/Password/Pattern/No Lock); entry steps — a custom drag-to-connect 3×3 `PatternPad` (SVG-drawn, min 4 dots) for Pattern, a numeric keypad + hidden `TextInput` for PIN (4–6 digits), or a password field with a visibility toggle (visible by default) for Password; footer Continue/Save button, disabled until the current step's input is valid.
- **State & data**: `lock` ({type, value}), `step` (`'PIN'|'PASSWORD'|'PATTERN'|null`), `pattern`, `pin`, `password`, `pwMasked`; all re-seeded from `initialLock` every time `visible` flips true.
- **API calls**: None.
- **Notable quirks**: The password field is intentionally shown UNMASKED by default — the comment explains this is the shop writing down the customer's password for a technician to use later, not an auth field, so a masked typo would be undetectable. Explicitly avoids nesting a second `Modal`-in-`Modal` (Android positions those unreliably) by making entry a second "step" of the same sheet instead.

---

<a id="device-services-booking"></a>
## DeviceServicesScreen.js (service-booking-shop/)

- **Path**: `src/screens/owner/service-booking-shop/DeviceServicesScreen.js`
- **Route name**: `DeviceServices` (nested stack only).
- **Purpose**: The live "Add Issue Services" screen — an accordion of repair-service categories (Swiggy/Zomato menu style) where the owner adds catalog services with price/warranty, plus a free-form "Others" custom-issue composer, building a running cart total.
- **Entry points**: [DeviceColorStorageScreen.js](#device-color-storage)'s `onContinue`/`onSkip` (3 call sites) — the only caller, live for both a fresh booking and the edit/re-estimate path (via `prefillServices`).
- **Exit points / navigation out**: "Continue" (floating cart bar) → `navigation.navigate('ServicePriceEstimate', { ...params, services: all })`, where `all` merges catalog picks and custom "Others" issues into one array.
- **Key UI sections**: white header (back + "Add Issue Services"); device summary card; "Recommended Repairs" label; accordion of category groups (tap to expand), each service row showing icon, name, price input, "Last 5 prices" link (non-functional here too), and Add/Remove + warranty chips (3/6/12 months); "Others" accordion group for custom (non-catalog) issues — name + condition-category chips + price input + committed-issue cards with Remove; floating "N items · ₹total · Continue" cart bar (or an "Add a service to continue" hint when empty).
- **State & data**: `services`, `mainCats` (from API), `loading`; `rows` (per-service price/warranty draft), `pickedIds` (Set), `expanded` (per-group), `customIssues` (committed "Others" entries), `otherNameRef`/`otherPriceRef` (uncontrolled drafts to avoid re-render jank), `cartTotal` (memoized).
- **API calls**: `getRepairServices()` → `GET /master/repair-services`, `getRepairCategories()` → `GET /master/repair-categories`, both on mount via `Promise.all`.
- **Notable quirks**: ₹0 is explicitly a valid price ("free / price-to-be-decided") — Add is never gated on a minimum price. Groups auto-expand on mount when entering with prefilled picks (edit mode) but otherwise start collapsed. Same `#004C40`/`#F8F8F8` explicit-hex palette as its sibling screens, with the same "NativeWind cache" comment justifying it.

---

<a id="service-booking-devices-list"></a>
## ServiceBookingDevicesListScreen.js

- **Path**: `src/screens/owner/service-booking-shop/ServiceBookingDevicesListScreen.js`
- **Route name**: `ServiceBookingDevicesList` (nested stack only).
- **Purpose**: Review every device in the current booking (a booking can hold more than one device/ticket), optionally add another device, record a counter payment (Advance/Full), and submit — creating one ticket per device (or `PUT`-updating one ticket in edit mode).
- **Entry points**: [DeviceMissingPartsScreen.js](#device-missing-parts)'s "Continue" (live path); also constructs its device list from `route.params.devices` / `existingDevices` / a freshly-built device object, so it can be entered either freshly or via the edit/re-estimate chain (`editMode`, `editTicketId`, `prefillPaymentType`, `prefillPaymentAmount`).
- **Exit points / navigation out**: "Add another device" → `navigate('ChooseDevice', { customerId, customer, existingDevices: devices })`. "Submit"/"Update" → on success, `navigation.replace('BookingThankYou', { customer, devices, tickets, editMode? })`.
- **Key UI sections**: white header (back + "Service Booking Devices List"); customer card ("VERIFIED" badge); "DEVICES IN THIS BOOKING" section — one card per device (image, name, brand/model-number chips, itemized services, per-device subtotal); "Add another device" dashed CTA (hidden in edit mode); "BILL SUMMARY" card (per-device line + grand total); `PaymentSection` (memoized) — Advance/Full Payment mode picker + amount field with a live balance-due readout; sticky "Grand Total · Submit/Update" CTA.
- **State & data**: `devices` (built once from params, `useState` with no setter — effectively immutable per mount), `submitting`, `createdRef` (remembers which per-device tickets already posted, so a retry after partial failure doesn't duplicate), `paymentType`, `paidText`; `paidSplit` (memoized) — proportionally splits one collected payment across multiple devices' tickets using a largest-remainder rounding method so shares always sum exactly to the amount collected.
- **API calls**: Fresh booking — one `ticketApi.post('/tickets', { body })` per device (looped, `createdRef`-guarded against re-posting). Edit mode — `ticketApi.put('/tickets/{editTicketId}', { body })`, then a best-effort separate `ticketApi.patch('/tickets/{editTicketId}/status', { query: { status: 'QUOTED' } })` to flip the ticket to "Re-Estimated" (failure here is swallowed, non-fatal).
- **Notable quirks**: Payment starts unset on a fresh booking on purpose — defaulting to "Full Payment" would silently record money as received on every walk-in that actually pays on delivery. A half-answered payment (mode without amount, or vice versa) is explicitly rejected before submit. The status-flip-to-QUOTED call is a second, separate request because `TicketRequest` has no status field on the main PUT body.

---

<a id="service-price-estimate"></a>
## ServicePriceEstimateScreen.js

- **Path**: `src/screens/owner/service-booking-shop/ServicePriceEstimateScreen.js`
- **Route name**: `ServicePriceEstimate` (nested stack only).
- **Purpose**: "Service Price & Issue Estimate" — confirm/enter IMEI, describe the issue (typed or as a recorded voice note), set the ready-by duration or an exact ready-by date/time, and record customer approval, before moving to device photos.
- **Entry points**: [DeviceServicesScreen.js (service-booking-shop/)](#device-services-booking)'s "Continue" cart bar.
- **Exit points / navigation out**: "Continue" (footer) → `navigation.navigate('DeviceInformation', { ...params, imei, complaint, issueAudioUrl, estimatedAt, estimatedDelivery, estimatedReadyIso, estimatedDeliveryIso, durationHours, customerApproved })`. "Scan" (IMEI field) → `navigate('ScanImei', { onScan })`.
- **Key UI sections**: header (back + title + overflow "more" menu → "Clear this estimate"); device summary card; Bill Details card (services + total); Device IMEI field + Scan button; Issue Description multiline input; collapsible Voice Note row (record/stop/play/remove, uploads via `expo-audio`); Estimated Delivery block — "Received On" (fixed to now), a Duration `Select` (1–48 hr presets), and an editable "Ready By" row that opens a full custom date/time-picker `ResponsiveModal` (hand-rolled month calendar + hour/minute/AM-PM selects, no native date picker library); Customer Approval checkbox row; sticky footer (Estimated Total + Continue).
- **State & data**: `now` (locked at mount), `imei`, `complaint`, `duration`, `approval`, `readyOverride` (explicit ready-by date, else derived from `duration`), `edOpen`/`edDay`/`calMonth`/`edHour12`/`edMeridiem`/`edMinute` (date/time editor draft), `audioUrl`/`localUri`/`isRecording`/`recordingMs`/`uploadingAudio`/`isPlaying`/`voiceOpen` (voice-note recorder state via `useAudioRecorder`).
- **API calls**: `uploadMedia({ uri, name, type }, 'complaint-audio')` → `POST /media/upload`, fired immediately on `stopRecording()` so the hosted URL is ready before Continue is tapped.
- **Notable quirks**: `now` is deliberately re-anchored to the actual current moment even on a re-estimate (not the ticket's original `estimatedReadyAt`) — the comment explains the old behavior could compute a "ready by" that had already passed. No native date/time picker is used because `android/` is committed to the repo, so adding a new native module would need a full rebuild before anyone could use it — the calendar is hand-built in pure JS instead. Continue is gated on "some issue description (text or audio) AND explicit approval," but NOT on IMEI (optional — not every device class has one).

---

<a id="customer-details"></a>
## CustomerDetailsScreen.js

- **Path**: `src/screens/owner/service-booking-shop/CustomerDetailsScreen.js`
- **Route name**: `CustomerDetails` — the `initialRouteName` of the `RepairServiceBookingShop` nested stack.
- **Purpose**: The wizard's entry screen — search for an existing customer (shop or platform) or type a new one, save/link the customer, then open an in-place category-picker sheet to start the device flow. Per an inline comment, this screen absorbed what used to be a separate "New Booking" screen (the search now lives here; typing directly IS the new-customer path).
- **Entry points**: Reached as the default landing screen whenever something enters `RepairServiceBookingShop` without a specific `screen` param — chiefly the Dashboard "Book Service" tile (see [RepairServiceBookingShop.js](#repair-service-booking-shop)).
- **Exit points / navigation out**: "Save & Continue" saves/links the customer then opens the category `ResponsiveModal`; picking a category → `navigation.navigate('SelectBrand', { customerId, customer, flow: 'BOOKING', categoryId, categoryCode, categoryName })` (identical destination/params to `ChooseDeviceScreen`'s own `onPick`, per its comment). The `IDENTIFY_DEVICE_ENABLED` flag (currently `false`) would instead `navigation.replace('IdentifyDevice', { customerId, customer })`.
- **Key UI sections**: header (back + "Customer Details"); customer search bar (debounced 300ms, dedupes shop-vs-platform hits by name+phone) with result rows ("App user" badge for platform matches); Personal Info section (Name, Mobile w/ +91 prefix, Email); Address section (State/District/Taluk/Area `Select`s + Door No./Street + Pincode, using hardcoded Tamil Nadu district/taluk lists); Upload ID Proof card (camera/gallery, 1MB cap); "Save & Continue" outline button; category-picker `ResponsiveModal` (3-across tiles, ordered Mobile→Tablet→Laptop→Smartwatch→Audio via a hardcoded `CATEGORY_ORDER`).
- **State & data**: `data` (name/phone/email/address fields), `existing` (resolved customer row, invalidated whenever the phone is edited), `q`/`results`/`searching` (customer search), `idProofUrl`/`idProofUploading`, `catOpen`/`cats`/`catsLoading`, `savedCustomer`. Per-field `useCallback` setters keep unrelated inputs from re-rendering on every keystroke (Android caret-jank mitigation, per comment).
- **API calls**: `ticketApi.get('/customers', { query: { q } })` (debounced search); `ticketApi.post('/customers/link', { body: { platformUserId } })` (materialize a platform-only match into a shop-scoped customer); `ticketApi.post('/customers', { body })` (create new, or attach a freshly uploaded ID proof to an existing customer); `uploadMedia(asset, 'customer-id-proof')` → `POST /media/upload`; `getDeviceCategories()` → `GET /master/device-categories` (for the sheet, fetched on mount, not on open, so the sheet appears instantly after Save).
- **Notable quirks**: `IDENTIFY_DEVICE_ENABLED = false` is a deliberate, documented kill-switch (IMEI.info account not yet funded) — flipping it re-enables the whole [IdentifyDeviceScreen](#identify-device) path without further code changes. This is a DIFFERENT file from the orphaned top-level `owner/CustomerDetailsScreen.js`, which still calls `navigate('ChooseDevice', ...)` directly but is not registered in any navigator.

---

<a id="assign-technician"></a>
## AssignTechnicianScreen.js

- **Path**: `src/screens/owner/service-booking-shop/AssignTechnicianScreen.js`
- **Route name**: `AssignTechnician` (nested stack only). A DIFFERENT, unrelated top-level `owner/AssignTechnicianScreen.js` exists too, registered under `LegacyAssignTechnician` on the root stack — not the same file, not documented here.
- **Purpose**: List the shop's technicians and assign one to the just-created ticket(s) — either finishing a fresh booking or re-assigning from an existing ticket's detail page.
- **Entry points**: [BookingThankYouScreen.js](#booking-thank-you)'s "Assign Technician" action tile (`navigate('AssignTechnician', { tickets, customer, devices })`); `AllBooking/TicketDetailScreen.js`'s "Re-Assign Technician" action, via the nested-route form `navigate('RepairServiceBookingShop', { screen: 'AssignTechnician', params: { tickets: [ticket], customer, devices, returnToTicketId: ticket.id } })` — the inline comment explains a flat `navigate('AssignTechnician')` from outside the nested stack fails with "action NAVIGATE ... was not handled" since the outer stack has no such route.
- **Exit points / navigation out**: Assign, when `returnToTicketId` is present (re-assign flow) → `navigation.goBack()` after a toast, so `TicketDetailScreen`'s focus listener refetches. Otherwise (fresh booking) → `navigation.replace('BookingSuccessful', { tickets, customer, devices, assignedTech })`.
- **Key UI sections**: `ScreenHeader` "Technician Assign"; "All Technician List" label; `Card` per technician (`Avatar`, name + code, role label, Available/Unavailable status dot, "Assign" `Button` disabled when unavailable).
- **State & data**: `techs`, `loading`, `busy` (per-row assigning id); reads `selectShopId` from Redux (`useSelector`).
- **API calls**: `authApi.get('/auth/shops/{shopId}/technicians')` on mount; `ticketApi.patch('/tickets/{id}', { body: { assignedTechnicianId } })` once per ticket in `tickets` when Assign is tapped.
- **Notable quirks**: Explicit `style={{ backgroundColor: '#004C40' }}` override on the `Button` with a comment noting the shared `bg-primary` token still renders NativeWind's stale cached green, and that a `bg-purple-500` override used to sit here "and was simply wrong."

---

<a id="booking-status"></a>
## BookingStatusScreen.js

- **Path**: `src/screens/owner/service-booking-shop/BookingStatusScreen.js`
- **Route name**: `BookingStatus`, registered ONLY inside the nested `RepairServiceBookingShop` stack. **This name collides with a different, unrelated route**: the root `OwnerNavigator` stack separately registers `BookingStatus` → `owner/BookingStatusScreen.js` (top-level, out of scope for this doc). Which file resolves depends on which stack the caller is inside.
- **Purpose**: "This Month Booking Status Summary" — 7 colored count tiles (Service Accepted / Technician Assigned / In Service Process / Work Completed / Out of Delivery / Work Pending / Delivered) plus a shortcut into `ShopServiceStatus`.
- **Entry points**: **None found for this specific (nested) copy.** Every `navigate('BookingStatus')`/`gotoParent('BookingStatus')` call site found in the codebase (Dashboard's "Service Status" report tile and its "Today's Summary" section action, both via `gotoParent`) targets the ROOT stack, which resolves to the *other*, top-level `BookingStatusScreen.js` — not this file. No caller was found that reaches this nested-stack copy directly.
- **Exit points / navigation out**: "Update Customer Service Status" button → `navigation.navigate('ShopServiceStatus')` (this call IS live and is [ShopServiceStatusScreen.js](#shop-service-status)'s only known caller, even though this screen's own reachability is unconfirmed).
- **Key UI sections**: `ScreenHeader` "Booking Status"; "This Month Booking Status Summary" label + "Previous Report" link (no `onPress`, dead); "Update Customer Service Status" button; 2-column grid of 7 colored count tiles.
- **State & data**: `counts` (from API), `loading`; refetched via `useFocusEffect`.
- **API calls**: `ticketApi.get('/tickets/counts')` on focus.
- **Notable quirks**: The comment block explains an earlier bug where tile keys were looked up directly against the counts response (which never matched); tiles now map their own `statusList` enum keys onto the response. The old `RE_ASSIGN_TECH` tile was deliberately dropped since reassignment is an event, not a ticket status. "Previous Report" link renders but does nothing. See the route-collision note above — this file's practical reachability could not be confirmed from static analysis.

---

<a id="booking-successful"></a>
## BookingSuccessfulScreen.js

- **Path**: `src/screens/owner/service-booking-shop/BookingSuccessfulScreen.js`
- **Route name**: `BookingSuccessful` (nested stack only).
- **Purpose**: Post-booking receipt screen (used on the "assign technician now" success path) — renders a shareable receipt image and offers WhatsApp/SMS share actions.
- **Entry points**: [AssignTechnicianScreen.js](#assign-technician)'s `assign()`, only on the fresh-booking path (not the `returnToTicketId` re-assign path) → `navigation.replace('BookingSuccessful', { tickets, customer, devices, assignedTech })`.
- **Exit points / navigation out**: Back arrow → `goHome()`, which calls `navigation.popToTop()` then `navigation.navigate('Home')`, each wrapped in its own silent `try/catch`.
- **Key UI sections**: header bar (back, checkmark icon, "Booking Successful" + timestamp, "CONFIRMED" badge); `ViewShot`-wrapped receipt `Card` — Customer Details, one section per device (header, Price Summary line items + subtotal, Service Info incl. complaint/estimated time/delivery date/approval), and a Grand Total row when there's more than one device; bottom action bar — "Share Image" (WhatsApp) and "Send SMS" buttons.
- **State & data**: Derived entirely from `route.params` (`tickets`, `devices`, `customer`) — no local form state beyond the share plumbing (`receiptRef`).
- **API calls**: `uploadMedia({ uri, fileName, mimeType }, 'receipts')` → `POST /media/upload`, used as a fallback to get a link-preview URL when native share/Web Share isn't available.
- **Notable quirks**: `goHome()`'s two calls are both individually wrapped in empty `try {} catch {}` blocks — a defensive pattern suggesting uncertainty about whether `navigate('Home')` reliably resolves out of this nested stack to the `OwnerTabs` "Home" tab (contrast with `BookingThankYouScreen`'s equivalent back button, which uses the more explicit `navigate('OwnerTabs', { screen: 'Home' })` form). Three different WhatsApp-share strategies are layered (Web Share API with a `File`, native `Sharing.shareAsync`, then a `wa.me` text+link fallback).

---

<a id="booking-thank-you"></a>
## BookingThankYouScreen.js

- **Path**: `src/screens/owner/service-booking-shop/BookingThankYouScreen.js`
- **Route name**: `BookingThankYou` (nested stack only).
- **Purpose**: The normal end-of-wizard screen for both a fresh booking and an edit/re-estimate — "Thank You!" receipt with the real shop name, ticket tracking id, device/repair summary, and payment recap, plus three action tiles (Assign Technician, Share Receipt, Barcode Print).
- **Entry points**: [ServiceBookingDevicesListScreen.js](#service-booking-devices-list)'s `submit()`, on both the fresh-booking success path and the edit-mode success path → `navigation.replace('BookingThankYou', { customer, devices, tickets, editMode? })`.
- **Exit points / navigation out**: Back (`ScreenHeader`) → `navigation.navigate('OwnerTabs', { screen: 'Home' })`, with an inline comment explaining `popToTop()` alone would only unwind to the wizard's first step, not out of it. "Assign Technician" tile → `navigate('AssignTechnician', { tickets, customer, devices })`. "Barcode Print" tile → `navigate('BarcodePrint', { ticketId })` if a ticket id exists, else `navigate('ScanQrCode')`. "Share Receipt" opens an in-place bottom-sheet `Modal` (not a navigation) offering "Send image to WhatsApp" / "Send details by SMS".
- **Key UI sections**: `ScreenHeader` (no title, custom back handler); `ViewShot`-wrapped hero card (checkmark, "Thank You!", tracking-id chip, Customer Details / Device & Repair Details / Service Information sections incl. payment recap when a payment was actually recorded); 3 `ActionTile`s (Assign Technician, Share Receipt, Barcode Print); Share Receipt bottom-sheet `Modal`.
- **State & data**: `shopName` (loaded from the session, not the customer record, via `getSession()`), `payment` (derived with `paymentAcrossTickets(tickets, total)` from `AllBooking/ReceiptCard`, reading back off the CREATED tickets rather than what was typed on the previous screen), `shareOpen`.
- **API calls**: None directly for data — all read from `route.params`/session. Sharing uses `captureRef` (from `react-native-view-shot`) to produce the receipt PNG, then either the optional native `react-native-share` module (loaded defensively via `TurboModuleRegistry.get('RNShare')`, never a bare `require` that could crash an un-rebuilt binary) targeting WhatsApp/WhatsApp Business directly, or `Sharing.shareAsync`, or the OS `Share.share` text fallback; SMS uses an `sms:` deep link with a platform-specific separator (`&` iOS / `?` Android).
- **Notable quirks**: `payment` is read back off the tickets the backend actually created, not off whatever the owner typed on the previous screen — the comment is explicit that an unrecorded "Advance Paid ₹5,000" printed on a receipt would be a dispute at the counter later. The WhatsApp share deliberately omits a target phone number (`whatsAppNumber`) because that would silently drop the image attachment in favor of a bare-text intent — the comment calls the image "the half worth keeping."
