# Running the app on a physical device (network)

On a **physical phone**, `localhost` points to the phone, not your computer. So login and API calls will fail until the app is told your computer’s IP.

## 1. Find your computer’s IP

- **Windows:** Open Command Prompt, run `ipconfig`, and use the **IPv4 Address** of your active adapter (e.g. `192.168.1.5`).
- **Mac:** System Preferences → Network, or run `ifconfig` and use the `inet` address (e.g. `192.168.1.5`).

## 2. Set the API host and start Expo

Use that IP as `EXPO_PUBLIC_API_HOST` when starting the app.

If your **master-data** backend is running on a different port (e.g. `8093` instead of `8091`), also set:

- `EXPO_PUBLIC_MASTER_PORT=8093`

**Windows (CMD):**
```cmd
set EXPO_PUBLIC_API_HOST=192.168.1.5
set EXPO_PUBLIC_MASTER_PORT=8093
npx expo start
```

**Windows (PowerShell):**
```powershell
$env:EXPO_PUBLIC_API_HOST="192.168.1.5";
$env:EXPO_PUBLIC_MASTER_PORT="8093";
npx expo start
```

**Mac/Linux:**
```bash
EXPO_PUBLIC_API_HOST=192.168.1.5 EXPO_PUBLIC_MASTER_PORT=8093 npx expo start
```

Replace `192.168.1.5` with your actual IP.

## 3. Restart after changing the IP

If you change the IP or switch networks, set `EXPO_PUBLIC_API_HOST` again and run `npx expo start` again, then reload the app on the device.

## 4. Firewall

Ensure your machine allows incoming connections on the ports used by the backend (e.g. 8081 for auth, 8082 for tickets). If the phone and computer are on the same Wi‑Fi, it usually works.
