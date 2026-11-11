# Partner Sell module: API contract

The marketplace-service runs behind nginx `location /marketplace/` (the prefix is stripped). The app calls these paths through `marketplaceApi` (`src/api/client.js`). Client wrappers are in `src/api/sellListings.js`.

The JWT filter sets the request attributes `userId`, `shopId`, and `role`. Every `/shop/marketplace/**` endpoint needs a `shopId` attribute (otherwise 403) and only touches rows where `shop_id = shopId`. Another shop's id returns **404**, so ids can't be probed. Every `/customer/marketplace/**` endpoint needs `userId`.

## Product (listing) fields

Existing `ProductRequest` / `ProductResponse` fields stay as they are. These fields are added:

| field | type | notes |
|---|---|---|
| `listingType` | `DEVICE` \| `SPARE_PART` \| `ACCESSORY` | column `listing_type` |
| `itemCondition` | `NEW` \| `USED` \| `REFURBISHED` | column `item_condition` |
| `quantity` | int ≥ 0 | default 1; remaining stock |
| `soldQuantity` | int ≥ 0 | default 0; response only |
| `negotiable` | bool | default false |
| `fulfilmentOptions` | `["PICKUP","SHIPPING"]` | stored as a comma-separated string |
| `videoUrl` | string | optional |
| `clientRef` | string ≤ 64 | idempotency key, unique per `(shop_id, client_ref)` |
| `batchId` | uuid | set on rows created by a bulk upload |
| `updatedAt` | instant | response only |

**Statuses:** `DRAFT`, `ACTIVE`, `INACTIVE`, `SOLD`, `DELETED` (soft delete, never returned). Legacy `COMPLETED` counts as SOLD and legacy `CANCELLED` counts as INACTIVE.

**Publishable** means status ACTIVE is allowed. It requires a title, price > 0, and quantity ≥ 1. For `listingType=DEVICE` it also requires 3–10 images (`imageUrl` + `extraImageUrls`). Every type is capped at 10 images.

## Shop listing endpoints

| method | path | body / query | result |
|---|---|---|---|
| GET | `/shop/marketplace/products` | `status=ALL\|ACTIVE\|DRAFT\|SOLD\|INACTIVE`, `q`, `page` (0-based), `size` (≤100) | `{content:[Product], page, size, totalElements, totalPages, counts:{ALL,ACTIVE,DRAFT,SOLD,INACTIVE}}`, newest `updatedAt` first |
| GET | `/shop/marketplace/summary` | – | `{active, draft, sold, inactive, enquiriesOpen, purchaseRequestsOpen, enquiriesUnread}` |
| GET | `/shop/marketplace/products/{id}` | – | Product |
| POST | `/shop/marketplace/products` | ProductRequest + `clientRef`; `status` must be DRAFT or ACTIVE | Product. A repeated `clientRef` returns the existing row with the header `Idempotent-Replay: true` |
| PUT | `/shop/marketplace/products/{id}` | partial ProductRequest (null = unchanged) | Product; 409 if SOLD/DELETED; ACTIVE result must still be publishable |
| PATCH | `/shop/marketplace/products/{id}/status` | `{status, quantitySold?}` | Product; see the transitions below |
| DELETE | `/shop/marketplace/products/{id}` | – | 204; soft delete and cancels open enquiries |
| POST | `/shop/marketplace/products/bulk` | `{batchId, publish, items:[ProductRequest + clientRef]}` (≤100) | see below |

**Status transitions (PATCH):**
- DRAFT → ACTIVE (must be publishable)
- ACTIVE ↔ INACTIVE
- ACTIVE/INACTIVE → DRAFT
- ACTIVE/INACTIVE → SOLD. If `quantitySold` is given and is less than quantity, quantity goes down, soldQuantity goes up, and the status stays the same. Otherwise quantity becomes 0 and the status becomes SOLD.
- Any other transition returns **409** `{message}`.

**Bulk result:** `{batchId, created, existing, failed, published, drafts, results:[{index, clientRef, outcome: CREATED|EXISTING|FAILED, status, productId, errors:[string], warnings:[string]}]}`
- Each item is saved in its own transaction, so one bad row never rolls back the others.
- When `publish=true`, an item that is valid but not publishable (for example, missing photos) is saved as a **DRAFT** with `warnings`.
- Bad UUIDs, a missing title, or an IMEI that duplicates another live listing of the same shop give `outcome=FAILED` with `errors`.
- A retry with the same `clientRef` returns `EXISTING` and never creates a duplicate.

## Enquiries and quotations (buyer ↔ shop, on a listing)

This flow is separate from customer → shop sell-order quotations (`/sell-orders/{id}/quotations`), and the two must stay separate.

**Enquiry statuses:**
- `OPEN`: the buyer asked
- `QUOTED`: the shop's offer is the latest
- `COUNTERED`: the buyer's offer is the latest
- `ACCEPTED`: a price is agreed
- `CONFIRMED`: the deal is confirmed and stock is updated
- `REJECTED` and `CANCELLED`: terminal

`kind` is `ENQUIRY` or `PURCHASE_REQUEST`. A purchase request is a price request with an optional offer amount.

**EnquiryResponse:**

```
{ id, productId, shopId, kind, status, message, quantity,
  lastOfferAmount, lastOfferBy: SHOP|BUYER|null, agreedAmount, fulfilment: PICKUP|SHIPPING|null,
  createdAt, updatedAt, unread,
  buyer: { userId, name, phone /* shop side: only when ACCEPTED or CONFIRMED */ },
  product: { id, title, imageUrl, price, status, storageLabel, ramLabel, conditionLabel, quantity, fulfilmentOptions },
  chatThreadId /* existing customer↔shop chat thread, or null */,
  allowedActions: [SEND_OFFER, ACCEPT, REJECT, CONFIRM, CANCEL] /* for the caller */,
  offers: [{ id, author: SHOP|BUYER|SYSTEM, action: ENQUIRY|OFFER|COUNTER|ACCEPT|REJECT|CONFIRM|CANCEL, amount, note, createdAt }] /* detail only */ }
```

| method | path | body | rule |
|---|---|---|---|
| GET | `/shop/marketplace/enquiries` | `status=ACTIVE\|HISTORY\|ALL`, `kind`, `productId`, `page`, `size` | ACTIVE = OPEN/QUOTED/COUNTERED/ACCEPTED; HISTORY = CONFIRMED/REJECTED/CANCELLED. Result: `{content, page, size, totalElements, totalPages, counts:{ACTIVE, HISTORY, ALL, ENQUIRY, PURCHASE_REQUEST}}` |
| GET | `/shop/marketplace/enquiries/{id}` | – | includes `offers`; marks the enquiry read for the shop |
| POST | `/shop/marketplace/enquiries/{id}/offers` | `{amount, note}` | allowed in OPEN or COUNTERED (or QUOTED to revise its own quote) → QUOTED |
| POST | `/shop/marketplace/enquiries/{id}/accept` | – | needs `lastOfferBy=BUYER`, or a PURCHASE_REQUEST with no offer (agreed = listing price) → ACCEPTED |
| POST | `/shop/marketplace/enquiries/{id}/reject` | `{reason?}` | any non-terminal status → REJECTED |
| POST | `/shop/marketplace/enquiries/{id}/confirm` | `{fulfilment}` | needs ACCEPTED, and the fulfilment must be one of the product's options. Locks the product row and decrements quantity; at 0 the product becomes SOLD and other open enquiries become CANCELLED → CONFIRMED |
| POST | `/customer/marketplace/products/{id}/enquiries` | `{kind, message, offerAmount?, quantity?}` | product must be ACTIVE and not owned by the caller; one non-terminal enquiry per buyer and product (returns the existing one) |
| GET | `/customer/marketplace/enquiries` | – | the caller's enquiries |
| GET | `/customer/marketplace/enquiries/{id}` | – | detail |
| POST | `/customer/marketplace/enquiries/{id}/offers` | `{amount, note}` | counter-offer when the latest offer is not the buyer's → COUNTERED |
| POST | `/customer/marketplace/enquiries/{id}/accept` | – | needs `lastOfferBy=SHOP` → ACCEPTED |
| POST | `/customer/marketplace/enquiries/{id}/cancel` | – | any non-terminal status → CANCELLED |

Invalid transitions return **409** `{message}`. Validation errors return **400** `{message}`.

## Legacy endpoints (kept)

- `GET/POST /marketplace/products` and `GET /marketplace/products/{id}` keep working.
- `PUT/DELETE /marketplace/products/{id}` now reject (403) a shop session that does not own the row.
- The public list never returns DRAFT or DELETED rows.
- Old servers without the endpoints above: `src/api/sellListings.js` falls back to the legacy listing calls. Enquiry calls throw `SERVER_UPDATE_REQUIRED`.

## Implementation notes (marketplace-service, 2026-11-03)

- A listing that is not publishable returns **400** (not 409) on POST/PUT/PATCH to ACTIVE. A same-status PATCH returns 409.
- Shop list, counts and summary cover `type=SELL` rows only.
- Selling out by PATCH or PUT also cancels open enquiries on that listing.
- New-enquiry, buyer counter and buyer accept events write a `shop_notifications` row with `type='sell_enquiry'`. The app opens Buyer Enquiries for that type; plain `sell` stays the customer Sell Requests feed.
- `GET /customer/marketplace/enquiries` returns a plain array. A repeated enquiry create returns the existing one with `Idempotent-Replay: true`.
- Known gap: the legacy `POST /marketplace/products` still trusts a body `shopId` that differs from the token's shop.

## Migration

`GGFIX-Server/services/postgres/init/106_marketplace_sell_module.sql`
