// Where the app talks to the backend. Two URL shapes are supported.
//
// 1. DIRECT to a service — `http://<host>:<port>` (LAN dev, or an EC2 box with
//    the service ports exposed). Call-site paths are already service-relative
//    (`/auth/login`, `/tickets/123`), so the wire URL is just base + path.
//
// 2. Through the TLS EDGE at api.ggfix.in. nginx routes on a per-service prefix
//    and STRIPS it before proxying:
//        location /auth/ { proxy_pass http://127.0.0.1:8081/; }
//    so `/auth/auth/login` reaches the service as `:8081/auth/login`. The Spring
//    controller is still @RequestMapping("/auth"), which is why the service name
//    appears TWICE in the public URL — once for nginx to route on, once for the
//    mapping. Each edge base therefore keeps its `/<service>` suffix and the call
//    sites keep their own path unchanged.
//
//    master-data-service is the exception: the edge maps /master/ -> :8091/master/
//    WITHOUT stripping, so MASTER_BASE stays the bare origin and the call sites
//    already spell the full public path (`/master/brands`). Its media controller
//    is @RequestMapping("/media") and is only reachable beneath that routing
//    prefix (/master/media/ -> :8091/media/) — see MEDIA_UPLOAD_PATH.
//
// Because a base can now carry a path prefix, client.js must CONCATENATE base and
// path. `new URL(path, base)` would drop the prefix whenever path starts with "/".

const EDGE_ORIGIN = (process.env.EXPO_PUBLIC_API_ORIGIN || 'https://api.ggfix.in').trim();

// Set EXPO_PUBLIC_API_HOST for direct host:port dev (this PC on the LAN). Leaving
// it empty selects the edge.
const host = (process.env.EXPO_PUBLIC_API_HOST || '').trim();

const trimSlash = (v) => v.replace(/\/+$/, '');
const edge = trimSlash(EDGE_ORIGIN);

/**
 * Resolve one service base. An explicit EXPO_PUBLIC_*_BASE always wins; then
 * host+port for direct dev; then the edge with the service's routing prefix.
 * Never returns a trailing slash — client.js appends the path itself.
 */
function svc(envValue, prefix, port) {
  const v = typeof envValue === 'string' ? envValue.trim() : '';
  if (v) return trimSlash(v);
  if (host) return `http://${host}:${port}`;
  return prefix ? `${edge}/${prefix}` : edge;
}

// A direct service origin always names a port; the edge is plain 443.
const isDirectServiceOrigin = (base) => /:\d+$/.test(base);

export const API_BASE_URL      = host ? `http://${host}:8080` : edge;
export const AUTH_BASE         = svc(process.env.EXPO_PUBLIC_AUTH_BASE, 'auth', 8081);
export const TICKET_BASE       = svc(process.env.EXPO_PUBLIC_TICKET_BASE, 'ticket', 8082);
export const USER_BASE         = svc(process.env.EXPO_PUBLIC_USER_BASE, 'user', 8083);
export const SHOP_BASE         = svc(process.env.EXPO_PUBLIC_SHOP_BASE, 'shop', 8084);
export const TECHNICIAN_BASE   = svc(process.env.EXPO_PUBLIC_TECHNICIAN_BASE, 'technician', 8085);
export const INVENTORY_BASE    = svc(process.env.EXPO_PUBLIC_INVENTORY_BASE, 'inventory', 8086);
export const MARKETPLACE_BASE  = svc(process.env.EXPO_PUBLIC_MARKETPLACE_BASE, 'marketplace', 8087);
export const PICKUP_BASE       = svc(process.env.EXPO_PUBLIC_PICKUP_BASE, 'pickup', 8088);
export const NOTIFICATION_BASE = svc(process.env.EXPO_PUBLIC_NOTIFICATION_BASE, 'notification', 8089);
export const SUBSCRIPTION_BASE = svc(process.env.EXPO_PUBLIC_SUBSCRIPTION_BASE, 'subscription', 8090);
export const ORDER_BASE        = svc(process.env.EXPO_PUBLIC_ORDER_BASE, 'order', 8092);

// Bare origin — call sites supply `/master/…` themselves. A deploy variable that
// still carries the old `/master` suffix is tolerated: leaving it on would double
// the segment and push uploads to /master/master/media/upload, which 404s.
export const MASTER_BASE = trimSlash(
  svc(process.env.EXPO_PUBLIC_MASTER_DATA_BASE, '', 8091).replace(/\/master$/, ''),
);

// The one path that differs between the two shapes. Centralised here rather than
// respelled at the upload call site.
export const MEDIA_UPLOAD_PATH = isDirectServiceOrigin(MASTER_BASE)
  ? '/media/upload'
  : '/master/media/upload';

// The Visual Device Scanner's image-to-image matching (see
// ggfix-visual-search-service/, a sibling repo/service, and
// api/masterData.js's `visualSearch`). This does NOT live on
// master-data-service — it's a standalone Python/CLIP microservice that
// reads the real GGFIX catalog over the SAME public /master/brands and
// /master/models endpoints the app itself calls, and keeps its own local
// vector index rather than touching production Postgres/AWS credentials
// this app was never given. See that service's README.md for the
// pgvector/production-deployment migration path.
//
// EXPO_PUBLIC_VISUAL_SEARCH_BASE points at wherever that service is
// actually running. Falling back to EXPO_PUBLIC_API_HOST (the same "this PC
// on the LAN" dev variable every other direct-service base already uses)
// means a phone on the same Wi-Fi as the dev machine needs no extra config.
// Empty when neither is set — there is no public deployment of this service
// yet, and callers must treat that as "not configured", never silently fall
// back to another service's base.
export const VISUAL_SEARCH_BASE = (() => {
  const explicit = (process.env.EXPO_PUBLIC_VISUAL_SEARCH_BASE || '').trim();
  if (explicit) return trimSlash(explicit);
  if (host) return `http://${host}:8199`;
  return '';
})();
export const VISUAL_SEARCH_PATH = '/visual-search/device';
