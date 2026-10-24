# GGFIX Partner App — Changes on 23 Oct 2026

Every change requested today, written as a prompt (what to do) plus what was built and where.
Paths are relative to `GGFIX-Partner-App/` unless marked **Server**.

---

## 1. Delivery Invoice — device details

**Prompt**
> On the Delivery Invoice, show the serviced mobile's details: the exact device name, model number, variant (storage / colour) and IMEI.

**Done**
- **Deliver Invoice** (report + PDF) and **Delivery Invoice** screens show the device. The name is split the same way as Device Details: "Apple iPhone 13 · A2633".
- IMEI is printed for mobile phones only (`imeiApplies`).
- `splitDisplayName` is now exported from `DeviceDetailScreen.js` and reused.

**Files:** `src/screens/owner/AllBooking/DeliveryInvoiceReportScreen.js`, `DeliveryInvoiceScreen.js`, `DeviceDetailScreen.js`

---

## 2. Delivery Invoice — full Device Information section and layout

**Prompt**
> Add a compact **Device Information** section to the Delivery Invoice:
> - Fields: Device Category, Brand, Model, Model Number, IMEI/Serial, Color, Storage, Device Condition, Reported Issue, Repair Completed, Replaced Parts, Warranty.
> - Fill everything automatically from the booking. Hide missing optional fields.
> - Order: Shop → Invoice No/Date → Customer → Device Information → Charges / Tax / Total → Payment Status → Warranty & Terms → Signatures.
> - Make it A4/PDF and thermal-print friendly. Keep the existing totals, APIs and features.

**Done**
- `deviceInfoRows()` builds the rows from:
  - the ticket fields;
  - master data (brand, model, category and RAM/storage labels are looked up by ID);
  - the specs inside `deviceDisplayName`, e.g. "(128 GB / Midnight)";
  - the intake checklist `missingPartsJson` (Condition);
  - `priceItemsJson` (Repair Completed);
  - the invoice spare rows (Replaced Parts).
- It also reads nested `device` / `deviceInfo` objects and alternate field names (`colour`, `serialNo`, `imeiNumber`, `imei1`).
- **Payment Status** badge: PAID / PARTIALLY PAID / UNPAID.
- **Warranty & Terms** card (per-part and per-service warranty, standard terms, declaration), placed before the signatures.
- PDF: a 2-column device grid on A4. Narrow (thermal) paper switches to a single column with no tinted fills.

**File:** `src/screens/owner/AllBooking/DeliveryInvoiceReportScreen.js`

---

## 3. Delivery Invoice — trace missing device data (GTS-037)

**Prompt**
> Mobile device details are missing on the Delivery Invoice. Trace booking ID → API response → invoice mapping, fix field-name mismatches and missing API fields, and show the real saved values on the preview and the PDF.

**Root cause**
- `imei` is saved on the ticket, but the server never returned it.
- Model number, serial number, accessories and the RAM/storage labels have no DB columns. Only master IDs are stored, plus `deviceDisplayName`.

**Done**
- **Server:** `TicketResponse` gained an `imei` field, and `TicketService.toResponse()` now sets `.imei(t.getImei())`.
- **App:** master-data lookups, display-name parsing, nested fields, and a catalogue-image fallback for the device image.

**Files**
- **Server** `services/ticket-service/src/main/java/com/repairshop/saas/ticket/dto/TicketResponse.java`
- **Server** `services/ticket-service/src/main/java/com/repairshop/saas/ticket/service/TicketService.java`
- `src/screens/owner/AllBooking/DeliveryInvoiceReportScreen.js`

> ⚠️ **Pending:** rebuild and deploy ticket-service, otherwise IMEI stays empty. It was not compiled locally because Maven isn't installed.

---

## 4. Delivery Invoice — address and TO block

**Prompt**
> - Address is optional on Customer Details. Don't print auto-filled text like "Tamil Nadu, Tamil Nadu"; show the address only if one was entered.
> - TO block order: Customer Name → Address (optional) → Mobile → Device Model → IMEI (mobile only).

**Done**
- `enteredAddress()` removes repeated parts and hides an address made only of state, district or city names.
- The customer record is now always looked up by phone so its region names are known.
- TO block updated on screen and in the PDF.

**File:** `src/screens/owner/AllBooking/DeliveryInvoiceReportScreen.js`

---

## 5. Delivered booking card — Invoice button

**Prompt**
> Add a compact Invoice button to the Delivered booking card. It opens the Delivery Invoice filled from that booking, with PDF Download, Print and Share. Keep the existing card design.

**Done**
- **INVOICE** pill under the amount, shown on Delivered bookings only. It opens the saved invoice if one exists, otherwise the Delivery Invoice screen.
- Deliver Invoice gained a **Print** button (`expo-print` `printAsync`), a Ticket No. row, and the device image.

**Files:** `src/screens/owner/AllBooking/BookingHistoryScreen.js`, `DeliveryInvoiceReportScreen.js`

---

## 6. Customer Details — pincode → District / Area

**Prompt**
> On Customer Details, entering a pincode should fill the District and Area automatically.

**Done**
- New **Pincode**, **District** and **Area** fields. Address now holds the house number and street only.
- 6 digits fill District and State. One area auto-fills; several areas appear as chips to pick from.
- Values the user typed are never overwritten. An unknown pincode shows a hint to enter details manually.
- Saved as `addressLine` / `locality` / `city` / `state` / `pincode`.
- Data source: India Post's `api.postalpincode.in` (keyless).
  - The Google keys were tested and both were rejected (REQUEST_DENIED): the backend key is restricted to the server's IP, and the website key is referrer-restricted, which the Geocoding API rejects.
  - Using Google would need a small server endpoint.
- ⚠️ Rotate both Google keys, since they were shared in chat.

**Files:** `src/api/pincode.js` (new), `src/screens/owner/service-booking-shop/CustomerDetailsScreen.js`

---

## 7. Booking flow — data must never be lost

**Prompts**
> - Adding another mobile deletes the details already entered. Going back must keep the data.
> - Apply the same rule to every booking screen.
> - Persistent draft:
>   - Add a **Preview (eye icon)** on all data-entry screens.
>   - Auto-save all entries (text, selections, photos, device details) as a persistent draft.
>   - Back/Next, preview, backgrounding and screen switching must never clear data.
>   - Restore after an app restart, and allow editing from Preview.
>   - Clear only on a successful submit or a confirmed discard.
>   - Keep the UI, APIs and navigation unchanged, and prevent duplicate bookings.

**Done**
- **Back / Next drafts**: every screen uses `useRestoredParams` + `useKeepOnBack`.

  | Screen | Kept |
  |---|---|
  | Customer Details | name, mobile, email, address, pincode, district, area |
  | Device Details | category → brand → model → colour / RAM / storage / model no. |
  | Colour & Storage | colour, model no., RAM/storage, manual mode |
  | Device Services | services, prices, warranties, "Other" issues |
  | Price Estimate | IMEI, serial, accessories, lock, complaint, voice note, photos |
  | Device Information | prices, photos, security lock |
  | Missing Parts | flags and notes |
  | Devices List | payment type and amount, plus the devices already added |

- **Persistent draft**: the booking stack plus each screen's live values are saved to AsyncStorage.
  - Saves 400 ms after each change, and immediately when the app goes to the background.
  - Edit-booking flows are excluded. Drafts are kept for 7 days.
- **Resume**: opening Customer Details with a saved draft asks *Resume / Discard*. Discard asks for a second confirmation. Resume resets the stack to the saved screen.
- **Preview**: a floating eye button on the 8 data-entry screens, added through the navigator's `screenLayout`.
  - Shows the customer, devices added, the device in progress and payment, and updates live.
  - **Edit** pops back to the screen that holds the value; the screens after it keep their data.
- **No duplicates**: a synchronous double-tap guard. Each created ticket is stored in the draft before the next one is posted, so a retry, even after a restart, skips devices already booked.

**Files**
- `src/screens/owner/service-booking-shop/bookingDraft.js` (new)
- `src/screens/owner/service-booking-shop/BookingPreview.js` (new)
- `src/screens/owner/service-booking-shop/RepairServiceBookingShop.js`
- `src/screens/owner/service-booking-shop/` — `CustomerDetailsScreen.js`, `DeviceDetailsScreen.js`, `DeviceColorStorageScreen.js`, `DeviceServicesScreen.js`, `ServicePriceEstimateScreen.js`, `DeviceInformationScreen.js`, `DeviceMissingPartsScreen.js`, `ServiceBookingDevicesListScreen.js`

**Known limits**
- Brands and models typed through "Other" are not re-selected on Device Details.
- Laptop and watch spec fields on Colour & Storage are not kept.

---

## Server files changed (all of today)

| File | Change |
|---|---|
| `Server/services/ticket-service/.../dto/TicketResponse.java` | `imei` field added |
| `Server/services/ticket-service/.../service/TicketService.java` | `.imei(t.getImei())` in `toResponse()` |

No other server changes. Features 1, 2 and 4–7 are app-only.

---

## Checks done / still to do

- ✅ All edited files pass a Babel syntax check.
- ✅ Mapping tests with a GTS-037-shaped payload (flat and nested), the address filter, the live pincode lookup, and the draft save → restart → restore → submit cycle.
- ⏳ Not yet verified on a device. The phone was running an old bundle: connect the dev build to `http://192.168.100.102:8181` and reload.
- ⏳ Deploy ticket-service so IMEI shows.
- ⏳ Rotate the Google Maps / Geocoding keys.
