# Repair Shop SaaS — Mobile App (React Native / Expo)

Role-based React Native (Expo) app for the mobile repair SaaS platform. **All dropdown values come from backend APIs** (no hardcoded options).

## Roles & navigation

After login, the app chooses the navigator from the JWT `roles`:

- **SHOP_OWNER** → Owner flow (tabs + stack)
- **TECHNICIAN** → Technician flow (stack)
- **CUSTOMER** → Customer flow (tabs + stack)

## Folder structure

```
repair-shop-mobile/
├── App.js
├── app.json
├── package.json
├── src/
│   ├── api/
│   │   ├── config.js           # Base URLs per service (auth, master, ticket, …)
│   │   ├── client.js           # Fetch wrapper with JWT; per-service clients
│   │   ├── auth.js             # login, register, logout
│   │   ├── masterData.js       # getBrands, getModelsByBrand, getRamOptions, getStorageOptions, getRepairServices
│   │   ├── hooks/
│   │   │   └── useMasterData.js  # useBrands, useModels, useRamOptions, useStorageOptions, useRepairServices
│   │   └── index.js
│   ├── auth/
│   │   └── session.js          # saveSession, clearSession, getToken, getSession
│   ├── components/
│   │   └── ApiPicker.js        # Dropdown that uses API-backed items (no hardcoded values)
│   ├── navigation/
│   │   ├── RootNavigator.js    # Auth check → Login | OwnerNavigator | TechnicianNavigator | CustomerNavigator
│   │   ├── OwnerNavigator.js   # Tabs + stack (Dashboard, Tickets, Inventory, Marketplace, Pickups, CreateTicket, TicketDetail, AssignTechnician, Reports, MarketplaceSell)
│   │   ├── TechnicianNavigator.js  # Dashboard, AssignedTickets, TechnicianTicketDetail, UpdateStatus, AddRepairNotes, UploadRepairImages
│   │   └── CustomerNavigator.js    # Tabs + stack (Dashboard, Track, Buy, History, BookRepair, ChooseNearbyShop, SchedulePickup)
│   ├── screens/
│   │   ├── LoginScreen.js
│   │   ├── owner/              # Dashboard, CreateTicket, TicketList, TicketDetail, AssignTechnician, Inventory, MarketplaceBuy, MarketplaceSell, PickupRequests, Reports
│   │   ├── technician/          # TechnicianDashboard, AssignedTickets, TechnicianTicketDetail, UpdateStatus, AddRepairNotes, UploadRepairImages
│   │   └── customer/            # CustomerDashboard, BookRepair, ChooseNearbyShop, SchedulePickup, TrackRepair, BuyProducts, PurchaseHistory
│   └── utils/
└── assets/
```

## API integration (dropdowns from backend)

Dropdowns use **only** data from these APIs:

| Data        | API endpoint                          | Used in screens                          |
|------------|----------------------------------------|------------------------------------------|
| Brands     | `GET /master/brands`                    | Create Ticket, Book Repair               |
| Models     | `GET /master/brands/{id}/models`        | Create Ticket, Book Repair               |
| RAM        | `GET /master/ram-options`               | Create Ticket, Book Repair               |
| Storage    | `GET /master/storage-options`           | Create Ticket, Book Repair               |
| Repair svc | `GET /master/repair-services`           | Book Repair                              |

- **`src/api/masterData.js`** – calls `masterApi.get(...)` for each.
- **`src/api/hooks/useMasterData.js`** – React hooks that load and expose lists (and loading/error).
- **`src/components/ApiPicker.js`** – reusable picker that takes `items`, `loading`, `error`, `value`, `onSelect`; used for brand, model, RAM, storage, repair service. **No hardcoded options.**

Other lists (tickets, technicians, inventory, marketplace, pickups, orders) also come from their respective backend endpoints.

## Base URLs (config)

`src/api/config.js` reads from `app.json` → `expo.extra`:

- **API_HOST** – default `localhost`; use `10.0.2.2` for Android emulator, or your machine IP for a physical device.
- Optional overrides: **AUTH_BASE**, **MASTER_BASE**, **TICKET_BASE**, etc. (defaults use host + ports 8081, 8091, 8082, …).

## Run

```bash
cd repair-shop-mobile
npm install
npx expo start
```

Then open on device/emulator. For Android emulator, set `extra.API_HOST` to `10.0.2.2` in `app.json` so it can reach services on the host machine.

## Backend services (ports)

- Auth: 8081  
- Ticket: 8082  
- Shop: 8084  
- Technician: 8085  
- Inventory: 8086  
- Marketplace: 8087  
- Pickup: 8088  
- Master Data: 8091  
- Order: 8092  

Ensure these services are running and that the mobile app’s base URLs match your setup (gateway or direct ports).
