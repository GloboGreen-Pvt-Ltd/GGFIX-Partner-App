# Partner Sell module: deployment checklist and rollback

Scope:
- marketplace-service: new `/shop/marketplace/*` and `/customer/marketplace/*` endpoints, plus tighter permissions on the legacy listing endpoints.
- Migration `106_marketplace_sell_module.sql` (in `services/postgres/init`).
- Partner app: the new Sell module and Bulk Listing screens.

Nothing here has been deployed. Each step that touches production needs explicit approval.

## What changes for existing clients

- **Old Partner app builds keep working.** Legacy `/marketplace/products` reads are unchanged. Writes now need a SHOP_OWNER or ADMIN/SUPER_ADMIN token, and only the owner's own shop(s) can be written. The Partner app only uses these from SHOP_OWNER sessions.
- **Legacy `DELETE /marketplace/products/{id}` is now a soft delete** (`status=DELETED`), hidden from every read.
- **The public list never returns DRAFT or DELETED rows.**
- **The new app on the old server** uses the legacy endpoints automatically. Enquiry screens show "server update needed" with an "Open Buyer Chats" button.

## 1. Pre-checks (read-only, production DB)

```sql
-- table exists and is populated (prod API already serves rows, so 68_drop_* was NOT applied)
SELECT count(*), count(*) FILTER (WHERE status IN ('SOLD','COMPLETED')) AS sold FROM marketplace_products;
-- columns the migration expects to find or add
SELECT column_name FROM information_schema.columns WHERE table_name = 'marketplace_products' ORDER BY 1;
-- ownership column used for multi-shop owners
SELECT count(*) FROM information_schema.columns WHERE table_name = 'shops' AND column_name = 'owner_user_id';
-- tables the migration creates must not exist yet (or must have the same shape)
SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'marketplace_enquir%';
```

Stop and investigate if `marketplace_products` is missing, or if `marketplace_enquiries` already exists with a different shape.

## 2. Backup

1. Take an RDS snapshot.
2. Run `pg_dump -t marketplace_products -t shop_notifications` as a quick restore point.
3. Record the currently deployed marketplace-service jar and version.

## 3. Migration (before the new service)

`psql -v ON_ERROR_STOP=1 -f services/postgres/init/106_marketplace_sell_module.sql`

- **Transactional:** the whole file runs in one transaction, so an error leaves nothing half-applied.
- **Idempotent:** it is safe to re-run.
- **What it does:**
  - Adds columns with `IF NOT EXISTS`.
  - Backfills quantity, negotiable, fulfilment and listing type from `assessment_json.sellMeta` (rows saved by the new app on the old server). Invalid JSON is skipped.
  - Sets quantity 0 on already-sold legacy rows.
  - Creates the enquiry tables and indexes.
- **No row is deleted, and no existing value is overwritten.**
- **Safe for the old service:** the old service runs unchanged on the migrated schema; it only adds columns and tables.
- **Tested:** on local PostgreSQL 18, applied twice over the 01â€“29 chain with legacy, sellMeta and invalid-JSON rows. Original values were hash-identical before and after.

## 4. Deploy marketplace-service

1. Build: `mvn -pl marketplace-service package`. Tests: 20 pass, including H2 end-to-end and permission cases.
2. Keep the env as before (`JWT_SECRET`, `DB_*`). No nginx change is needed; everything stays under `/marketplace/`.
3. Startup uses `ddl-auto=validate`. The build was verified booting against the migrated Postgres.
4. Smoke test on **staging**, never production, because it creates rows:
   `BASE=â€¦ JWT_SECRET=â€¦ SHOP_A=â€¦ OWNER_A=â€¦ SHOP_B=â€¦ OWNER_B=â€¦ node scripts/e2e-sell-module.mjs`
   Expected: 59 passed.
5. Production checks without writes:
   - `GET /marketplace/marketplace/products?type=SELL` â†’ 200 with the same rows as before.
   - In the Partner app, Sell Home loads and the counts show.

## 5. Partner app release

1. `expo-document-picker` was added, so a **new native build** (EAS) is needed for CSV file import. Without that build, CSV import tells the user to paste the CSV text instead.
2. Order: backend first or app first both work, thanks to the legacy fallback. Backend first enables enquiries from day one.
3. Before the store upload, test on one Android and one iOS device:
   - Single listing for each type
   - Photos and video upload
   - Draft, then edit, then publish
   - My Listings actions
   - Bulk (sample CSV, retry of failed items)
   - Enquiry â†’ quote â†’ confirm (needs a buyer enquiry created through the API until the customer app has a UI for it)

## 6. Quotes on Customer Sell Leads (order-service)

- **Migration 107** (`services/postgres/init/107_listing_sell_order_link.sql`; order-service also adds the column at startup) adds `marketplace_listings.sell_order_id`. It's idempotent, adds one nullable column and an index, and changes no data. Apply it before deploying order-service.
- **order-service** has two new endpoints for shop-owner sessions:
  - `POST /sell-orders/listing-quotations` with `{listingId, quotationPrice, note?, fulfilment: PICKUP|SHOP_VISIT}`
  - `GET /sell-orders/listing-quotations/{listingId}`
- **What submitting does:**
  - Links the lead to the customer's open sell order for the same model, created within 2 hours. If there's no such order, it creates one and its `customer_orders` SELL row, so the customer sees it in their orders.
  - Adds this shop's quote, or revises it. The order row is locked, so a double submit can't create two quotes.
  - Notifies the customer.
  - After the customer chooses a quote, further quotes get 409.
- **Fulfilment** is written into the quote note ("Free pickup from your location" / "Visit the shop to sell"), so the customer app shows it without any change.
- **Smoke test (staging):** `ORDER=â€¦ JWT_SECRET=â€¦ SHOP_A=â€¦ OWNER_A=â€¦ SHOP_B=â€¦ OWNER_B=â€¦ PSQL=â€¦ PGDB=â€¦ node scripts/e2e-listing-quotes.mjs`. Expected: 22 passed.
- **Rollback:** redeploy the previous order-service jar. The new column is ignored by old code.

## 7. Quote status, Purchase Orders, Order Details (order-service + marketplace-service)

Partner Buy pages 5â€“7 (Lead Details â†’ Quote status â†’ Purchase Orders â†’ Order Details). No migration: the new code uses existing `sell_orders` columns (`shop_id`, `final_price`, `pickup_date`, `pickup_slot_start/end`). At startup, order-service also makes sure `shop_notifications.ticket_id` exists (migration 86).

- **order-service**
  - `GET /sell-orders/listing-quotations/{listingId}` now also returns `sellNumber`, plus `purchaseOrderId` and `customer {name, phone}`. The last two are filled in only for the shop whose quote the customer accepted.
  - `POST /sell-orders/{id}/choose-quotation` now also notifies the winning shop (`shop_notifications`, type `purchase`, key `SELL_QUOTE_ACCEPTED`).
  - New, for shop-owner sessions: `GET /sell-orders/shop-purchases`, `GET /sell-orders/shop-purchases/{id}`, `POST â€¦/{id}/schedule` `{pickupDate, slotStart, slotEnd?}` and `POST â€¦/{id}/complete`.
  - Status flow: `SELL_CONFIRMED` (New) â†’ `PICKUP_SCHEDULED` (In Progress) â†’ `COMPLETED` (Completed, payment shown as Paid). Completing also sets the customer order to COMPLETED and the listing to SOLD. The customer is notified on schedule, reschedule and completion.
- **marketplace-service:** new `POST /shop/chats/listing/{listingId}`. It opens a chat with the lead's customer, and only for a shop that has quoted on that lead. A new thread doesn't store the customer's mobile, so the phone stays hidden until the customer accepts.
- **Older servers:** the app shows a "needs the latest server update" notice. Purchase Orders still lists marketplace orders.
- **Smoke test (staging):** `ORDER=â€¦ MARKET=â€¦ JWT_SECRET=â€¦ SHOP_A=â€¦ OWNER_A=â€¦ SHOP_B=â€¦ OWNER_B=â€¦ PSQL=â€¦ PGDB=â€¦ node scripts/e2e-shop-purchases.mjs`. Expected: 37 passed.
- **Rollback:** redeploy the previous jars. No schema or data changes need undoing.

## 8. Accepted quote â†’ purchase workflow (order-service + ticket-service + all three apps)

- **Migration 108** (`services/postgres/init/108_sell_purchase_workflow.sql`) adds nullable workflow columns to `sell_orders`. order-service also adds them at startup. Apply it before deploying either service.
- **order-service**
  - Owner endpoints on `/sell-orders/shop-purchases/{id}`: `fulfilment` `{fulfilment: PICKUP|SHOP_VISIT}` (before the journey starts; rewrites the accepted quote's note and releases any pickup person), `assign`, `receive`, `inspection`, `price/confirm`, `price/revise`, `payout`, `complete`, `cancel`, and `schedule` (only before the journey starts).
  - Customer endpoints: `GET /sell-orders/{id}/purchase`, `POST â€¦/revision/approve|reject`, `POST â€¦/payout/confirm|dispute`.
  - A customer can no longer cancel once the device has been picked up.
- **ticket-service:** new `/technicians/me/sell-pickups` endpoints (list, accept, decline, status) for the Employee App, using the repair-pickup status codes.
- **Status flow:** SELL_CONFIRMED â†’ PICKUP_ASSIGNED â†’ OUT_FOR_PICKUP â†’ PICKED_UP â†’ DEVICE_RECEIVED â†’ INSPECTED â†’ PRICE_CONFIRMED, or PRICE_REVISION_PENDING â†’ (customer) â†’ PAYMENT_PENDING â†’ PAID (customer confirms) â†’ COMPLETED.
- **Rules:** completion requires a payment the customer confirmed and a received device. The shop can't cancel after the payment is recorded.
- **Smoke test (staging):** run `scripts/e2e-purchase-workflow.mjs` in three phases (`PHASE=order1` with ORDER, `ticket` with TICKET, `order2` with ORDER; plus `STATE=<json file>`). Expected: 16 + 17 + 30 passed.
- **Partner pages (2026-11-04 mockup):** Purchase Management â†’ Assign Pickup â†’ Pickup Tracking â†’ Device Inspection (checklist) â†’ Final Price Approval â†’ Payment Confirmation â†’ Purchase Completed â†’ Purchase Receipt (PDF via expo-print). Server additions for them:
  - The inspection takes a checklist: display required; `batteryHealth` (1â€“100) and `accessories` optional; the other functional checks are optional.
  - Payout `method` can be `CASH` (UTR optional). The account is optional for UPI and bank, but UPI and bank still need the UTR. The customer always confirms.
  - The purchase list returns `pickupPersonId`.
  - Test: `scripts/e2e-purchase-fulfilment.mjs` (`TECH_A=<technician id>`), expected 25 passed.
- **Not connected:** inventory (inventory-service has no item API in the source) and push to the Employee App (it re-reads its pickup list, as for repair pickups).

## 9. Production: pickup assignment fix ("Could not assign â€“ server update")

**Root cause:** the production order-service has no `/sell-orders/shop-purchases/{id}/assign`, and ticket-service has no `/technicians/me/sell-pickups`. The app turns that "No static resource" answer into the server-update message.

**Code (already in `server monday`, built and tested locally):**
- order-service:
  - New: `ShopPurchaseController`, `CustomerSellPurchaseController`.
  - Changed: `ListingQuotationController` (`sellNumber`, `purchaseOrderId`, winner's contact), `SellOrderController` (customer can't cancel after pickup; shop notified), `DatabaseSchemaInitializer` (migration-110 columns).
- ticket-service: new `SellPickupController`.
- Migration: `services/postgres/init/110_sell_purchase_workflow.sql`. It was renumbered because 108 and 109 are taken in this repo.

**Order:** RDS snapshot â†’ migration 110 â†’ order-service â†’ ticket-service â†’ apps.

Placeholders below: `RDS=ggfixservice.cdaiqaog82ho.ap-south-1.rds.amazonaws.com`, `CONN="host=$RDS port=5432 dbname=ggfixservice user=postgres sslmode=require"`.

1. **Pre-check (read-only).** The query must return 0 rows; any row returned is a missing column:
   ```sql
   SELECT t, c FROM (VALUES ('sell_orders','shop_id'),('sell_orders','final_price'),('sell_orders','pickup_date'),('sell_orders','pickup_slot_start'),
     ('sell_orders','pickup_slot_end'),('sell_orders','imei'),('sell_order_quotations','note'),('technicians','user_id'),
     ('marketplace_listings','sell_order_id'),('shop_notifications','booking_number'),('customer_notifications','status_key')) v(t, c)
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = v.t AND column_name = v.c);
   ```
2. **Backup.** Run `aws rds create-db-snapshot --db-instance-identifier <instance> --db-snapshot-identifier ggfix-pre-110-20261104` and wait until it's available.
3. **Migrate.** Run `psql "$CONN" -v ON_ERROR_STOP=1 -f services/postgres/init/110_sell_purchase_workflow.sql`.
   - It adds 25 nullable columns and an index, in one transaction.
   - It's safe to re-run and changes no rows (tested locally: applied twice, row hash identical).
4. **Deploy, option A (normal).** Commit the files above to the server repo and push to `main`. "Deploy Backend to AWS EC2" builds every service, restarts them, and gates on health.
   **Deploy, option B (only these two services):**
   ```bash
   scp services/order-service/target/order-service-1.0.0-SNAPSHOT.jar services/ticket-service/target/ticket-service-1.0.0-SNAPSHOT.jar <EC2_USER>@<EC2_HOST>:/tmp/
   ssh <EC2_USER>@<EC2_HOST>
   D=/opt/repair-shop-saas/services
   for s in order-service ticket-service; do sudo cp $D/$s/$s.jar $D/$s/$s.jar.bak-20261104; done
   sudo install -o repairshop -g repairshop -m 0644 /tmp/order-service-1.0.0-SNAPSHOT.jar $D/order-service/order-service.jar && sudo systemctl restart repair-shop-saas@order-service
   curl -s https://api.neargfix.com/order/actuator/health      # wait for {"status":"UP"}
   sudo install -o repairshop -g repairshop -m 0644 /tmp/ticket-service-1.0.0-SNAPSHOT.jar $D/ticket-service/ticket-service.jar && sudo systemctl restart repair-shop-saas@ticket-service
   curl -s https://api.neargfix.com/ticket/actuator/health
   ```
   Both options deploy everything else that differs in `server monday` from what's live, so review that diff first.
5. **Verify:**
   - `sudo journalctl -u repair-shop-saas@order-service -n 80 --no-pager`: look for `Started OrderServiceApplication` and no `ERROR`.
   - In the apps:
     - Partner: Quote Accepted â†’ Manage Pickup â†’ assign the employee shows "Pickup sent".
     - Employee App: the sell pickup appears â†’ Accept â†’ Start â†’ Picked Up â†’ Hand Over.
     - Partner tracking and the customer's order show each step.
   - Employees with no app login are now refused with a clear message.
6. **Rollback:**
   - On EC2, for each service: `sudo cp $D/$s/$s.jar.bak-20261104 $D/$s/$s.jar && sudo systemctl restart repair-shop-saas@$s`.
   - The new columns stay; they're nullable and the old jars ignore them.
   - To fully reverse, restore the RDS snapshot. That's destructive and needs approval.

## Rollback

| Problem | Action |
|---|---|
| New service misbehaves | Redeploy the previous jar. It runs on the migrated schema (new columns and tables are ignored). The new app falls back to the legacy endpoints by itself. |
| Migration must be reverted (rarely needed) | Restore from the snapshot, or run the down-script below **after** the old jar is back. This deletes enquiry data and the new listing fields. |
| App build is bad | Halt the store rollout. Old app builds are unaffected by the backend change. |

Down-script (destructive; run only with approval):

```sql
BEGIN;
DROP TABLE IF EXISTS marketplace_enquiry_offers;
DROP TABLE IF EXISTS marketplace_enquiries;
DROP INDEX IF EXISTS uq_marketplace_products_shop_client_ref, idx_marketplace_products_batch,
  idx_marketplace_products_shop_updated, idx_marketplace_products_shop_imei;
ALTER TABLE marketplace_products
  DROP COLUMN IF EXISTS listing_type, DROP COLUMN IF EXISTS item_condition, DROP COLUMN IF EXISTS quantity,
  DROP COLUMN IF EXISTS sold_quantity, DROP COLUMN IF EXISTS negotiable, DROP COLUMN IF EXISTS fulfilment_options,
  DROP COLUMN IF EXISTS video_url, DROP COLUMN IF EXISTS client_ref, DROP COLUMN IF EXISTS batch_id;
UPDATE marketplace_products SET status = 'CANCELLED' WHERE status = 'DELETED'; -- old code doesn't know DELETED
COMMIT;
```

## Known gaps (not blockers)

- The customer app has no screen yet to create enquiries. The endpoints exist (`/customer/marketplace/*`).
- Excel (.xlsx) import is not supported; save the sheet as CSV.
- Admin tooling that writes listings must use an ADMIN/SUPER_ADMIN token.
