import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  RefreshControl,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3,
  BookText,
  CalendarCheck,
  CalendarOff,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ClipboardPlus,
  Clock,
  IndianRupee,
  MessageCircle,
  Package,
  PackageCheck,
  PackageOpen,
  PackageSearch,
  Pencil,
  Puzzle,
  Timer,
  Truck,
  Users,
  UsersRound,
} from 'lucide-react-native';
import { ticketApi } from '../../api/client';
import { getBanners, getDeviceCategories, getModelsByBrand } from '../../api/masterData';
import { resolveDeviceImageSource } from '../../utils/images';
import { listShopRepairBookings } from '../../api/orders';
import { READY_BAND, SCOPES, countScope, pickupsOnly } from './AllBooking/bookingScopes';
import { getOwnerKycDocuments } from '../../api/shops';
import { getUnreadCount as getNotifUnreadCount } from '../../api/notifications';
import { getSession } from '../../auth/session';
import { fetchMe, switchShop } from '../../api/auth';
import { getTabBarTotalHeight } from '../../navigation/tabBarMetrics';
import { FEATURE, canAddShop as canAddShopOnPlan, fetchEntitlements } from '../../subscription/entitlements';
import { showLimitPopup } from '../../subscription/limitPopup';
import type {
  DashboardNavigationProp,
  DashboardSummary,
  DashboardTool,
  DeviceCategory,
  DeviceModel,
  KycDocuments,
  OverviewStatItem,
  PickupCounts,
  RecentTicket,
  SessionData,
  SheetMode,
  ShopSummary,
  TicketCountsResponse,
} from '../../types/dashboard';
import { ACCENT_TONES, C, getSizeClass, HAIRLINE, OV_TONE, T, Touchable, statusLabel, statusTone } from '../../components/dashboard/theme';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { DashboardSection } from '../../components/dashboard/DashboardSection';
import { DashboardOverviewGrid } from '../../components/dashboard/DashboardOverviewGrid';
import { getDashboardToolColumns } from '../../components/dashboard/DashboardToolsGrid';
import { DashboardMenuTabs } from '../../components/dashboard/DashboardMenuTabs';
import { DashboardBookingCard } from '../../components/dashboard/DashboardBookingCard';
import { DashboardCategoryRail } from '../../components/dashboard/DashboardCategoryRail';
import { DashboardAccountSheet } from '../../components/dashboard/DashboardAccountSheet';
const HOME_REFRESH_STALE_MS = 15000;
const SELL_IMAGES: Record<string, string> = {
  MOBILE: 'https://media.ggfix.in/buy&sell-categories-image/Sell-Phone.png',
  SMARTPHONE: 'https://media.ggfix.in/buy&sell-categories-image/Sell-Phone.png',
  LAPTOP: 'https://media.ggfix.in/buy&sell-categories-image/Sell-Laptop.png',
  SMARTWATCH: 'https://media.ggfix.in/buy&sell-categories-image/Sell-smartWatch.png',
  SMARTWATCHES: 'https://media.ggfix.in/buy&sell-categories-image/Sell-smartWatch.png',
  TABLET: 'https://media.ggfix.in/buy&sell-categories-image/Sell-Tablet.png',
  AUDIO: 'https://media.ggfix.in/buy&sell-categories-image/Sell-AudioDevice.png',
  AUDIO_DEVICE: 'https://media.ggfix.in/buy&sell-categories-image/Sell-AudioDevice.png',
  AUDIO_DEVICES: 'https://media.ggfix.in/buy&sell-categories-image/Sell-AudioDevice.png',
};

// Marketplace tile tints — light, low-saturation pastels (varied per
// category), matching the same key convention as SELL_IMAGES above.
const MARKETPLACE_TILE_COLORS: Record<string, string> = {
  MOBILE: '#EAF6FF',
  SMARTPHONE: '#EAF6FF',
  LAPTOP: '#F3ECFF',
  TABLET: '#EAF3FF',
  AUDIO: '#FFF0F2',
  AUDIO_DEVICE: '#FFF0F2',
  AUDIO_DEVICES: '#FFF0F2',
  SMARTWATCH: '#EAF7F2',
  SMARTWATCHES: '#EAF7F2',
};

// Sell a Device tile tints — the same light-pastel treatment, kept within
// a green/mint family so Sell still reads as its own identity next to
// Marketplace's more varied palette above.
const SELL_TILE_COLORS: Record<string, string> = {
  MOBILE: '#ECFAF3',
  SMARTPHONE: '#ECFAF3',
  LAPTOP: '#EEF8F5',
  TABLET: '#EAF7F1',
  AUDIO: '#EEF9F5',
  AUDIO_DEVICE: '#EEF9F5',
  AUDIO_DEVICES: '#EEF9F5',
  SMARTWATCH: '#EAF7F2',
  SMARTWATCHES: '#EAF7F2',
};

function useBookingCounts() {
  const [counts, setCounts] = useState<TicketCountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: TicketCountsResponse = await ticketApi.get('/tickets/counts');
      setCounts(data || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load counts');
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary: DashboardSummary | null = counts
    ? {
        serviceAccepted: Number(counts.CREATED ?? 0),
        technicianAssigned: Number(counts.assignedCount ?? 0),
        inServiceProcess: Number(counts.IN_DIAGNOSIS ?? 0) + Number(counts.IN_REPAIR ?? 0),
        readyForDelivery: (READY_BAND as string[]).reduce((n: number, k: string) => n + Number(counts[k] ?? 0), 0),
        delivered: Number(counts.DELIVERED ?? 0),
        cancelled: Number(counts.CANCELLED ?? 0),
        workPending: Number(counts.QUOTED ?? 0) + Number(counts.APPROVED ?? 0),
        total: Number(counts.total ?? 0),
        revenue: Number(counts.revenue ?? counts.totalRevenue ?? counts.monthlyRevenue ?? 0),
      }
    : null;

  return { summary, loading, error, refresh: load };
}

// One distinct accent per tool (pastel icon box, see DashboardToolCard) —
// reusing theme.tsx's shared ACCENT_TONES (the same 7 colours the Overview
// cards and the Marketplace/Sell category tiles also cycle through) rather
// than inventing new hues, so the whole screen draws from one palette.
const TOOL_TONES = ACCENT_TONES;

// Our Services grid — the iOS-Shortcuts-style entry points into a booking.
export const QUICK_ACTIONS: DashboardTool[] = [
  { key: 'RepairServiceBookingShop', label: 'Book Service', icon: ClipboardPlus, color: TOOL_TONES[0], via: 'parent' },
  { key: 'BookingList', label: 'Requote', icon: Pencil, color: TOOL_TONES[1], via: 'parent', params: { menu: 'RE_ESTIMATED', rowTarget: 'EDIT' } },
  { key: 'BookingList', label: 'Pickups', icon: Truck, color: TOOL_TONES[2], via: 'parent', params: { menu: 'PICKUP', preset: 'PICKUP_ALL' } },
  { key: 'Bookings', label: 'Bookings', icon: ClipboardList, color: TOOL_TONES[3] },
  { key: 'OwnerSearch', label: 'Customers', icon: Users, color: TOOL_TONES[4], via: 'parent' },
  { key: 'ShopChatInbox', label: 'Enquiry', icon: MessageCircle, color: TOOL_TONES[5], via: 'parent' },
  { key: 'OwnerModelCompatibility', label: 'Model\nCompatibility', icon: Puzzle, color: TOOL_TONES[6], via: 'parent' },
];

// Five tiles — one full row at the 5-column breakpoint. All are siblings of
// OwnerTabs on the owner stack, hence `via: 'parent'` on every one.
export const EMPLOYEE_ACTIONS: DashboardTool[] = [
  { key: 'OwnerEmployeeList', label: 'Team', icon: UsersRound, color: TOOL_TONES[0], via: 'parent' },
  { key: 'OwnerStaffReport', label: 'Attendance', icon: CalendarCheck, color: TOOL_TONES[1], via: 'parent', params: { mode: 'attendance' } },
  { key: 'OwnerEmployeeWorkingRecord', label: 'Service Report', icon: ClipboardList, color: TOOL_TONES[2], via: 'parent' },
  { key: 'OwnerEmployeePickupReport', label: 'Pickup Report', icon: PackageSearch, color: TOOL_TONES[4], via: 'parent' },
  { key: 'OwnerLeaveRequests', label: 'Leave', icon: CalendarOff, color: TOOL_TONES[5], via: 'parent' },
  { key: 'OwnerStaffReport', label: 'Permissions', icon: Timer, color: TOOL_TONES[6], via: 'parent', params: { mode: 'permission' } },
];

export const REPORT_ACTIONS: DashboardTool[] = [
  { key: 'OwnerRevenue', label: 'Revenue', icon: IndianRupee, color: TOOL_TONES[0], via: 'parent' },
  { key: 'BookingStatus', label: 'Service Status', icon: BarChart3, color: TOOL_TONES[1], via: 'parent' },
  { key: 'OwnerCashBook', label: 'Cash Book', icon: BookText, color: TOOL_TONES[4], via: 'parent' },
];

function greetingFor(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function formatBookingDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// `master_banners` — admin-managed home banners (Management Portal → Customer
// App Directory → Home Banners), already consumed the same way by
// OwnerBuyListingScreen.js/OwnerSellHomeScreen.js and the customer app's
// HomeScreen.js. Real API fields (MasterBanner entity, GET /master/banners):
// `imageUrl`/`imageBase64`, `linkTarget`, `sortOrder`, `isActive` — NOT the
// `sort`/`active` names a naive guess would reach for.
export interface DashboardBanner {
  id: string;
  title?: string | null;
  imageUrl?: string | null;
  imageBase64?: string | null;
  linkTarget?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
}

function normalizeBannerTitle(value?: string | null): string {
  return value?.trim().toLowerCase() ?? '';
}

// Matches the existing convention in HomeScreen.js: only an explicit `false`
// hides a banner, so a missing/null `isActive` (an older row, or a field the
// admin never touched) still shows rather than silently disappearing.
function isBannerActive(banner: DashboardBanner): boolean {
  return banner.isActive !== false;
}

// Same tolerant image resolution as OwnerBuyListingScreen.js's `bannerImage`
// — base64 wins when present, otherwise the URL; both sides also tolerate a
// stray snake_case response.
function bannerImageUri(banner: DashboardBanner | null | undefined): string | null {
  if (!banner) return null;
  const b64 = ((banner as Record<string, unknown>).imageBase64 || (banner as Record<string, unknown>).image_base64) as string | undefined;
  const trimmedB64 = b64 && String(b64).trim();
  if (trimmedB64) return trimmedB64.startsWith('data:') ? trimmedB64 : `data:image/png;base64,${trimmedB64}`;
  const url = (banner.imageUrl || (banner as Record<string, unknown>).image_url) as string | undefined;
  const trimmedUrl = url && String(url).trim();
  return trimmedUrl || null;
}

export interface DashboardScreenProps {
  navigation: DashboardNavigationProp;
  onLogout?: () => void;
}

export default function DashboardScreen({ navigation, onLogout }: DashboardScreenProps) {
  const { summary, loading, error, refresh } = useBookingCounts();
  const [refreshing, setRefreshing] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [showShopList, setShowShopList] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const [buyCats, setBuyCats] = useState<DeviceCategory[]>([]);
  const [banners, setBanners] = useState<DashboardBanner[]>([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [latest, setLatest] = useState<RecentTicket[]>([]);
  const [pickupCounts, setPickupCounts] = useState<PickupCounts>({ all: 0, request: 0, accepted: 0 });
  const [showSheet, setShowSheet] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode>('account');
  const [sheetRendered, setSheetRendered] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [hasKycDocs, setHasKycDocs] = useState(false);
  const [kycStatus, setKycStatus] = useState<KycDocuments['status'] | null>(null);
  const [toolPanelWidth, setToolPanelWidth] = useState(0);
  const onToolPanelLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setToolPanelWidth((prev) => (prev !== w ? w : prev));
  }, []);
  const latestLoadedAtRef = useRef(0);
  const latestLoadingRef = useRef(false);

  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const sizeClass = getSizeClass(winW);
  const isTablet = sizeClass === 'tablet';
  const PAD = sizeClass === 'tablet' ? 24 : sizeClass === 'large' ? 19 : 16;
  // 20-24 across phone, large phone and tablet, per the section-spacing scale.
  const SECTION_GAP = sizeClass === 'tablet' ? 24 : sizeClass === 'large' ? 22 : 20;

  // Slide the account sheet up from the bottom; keep it mounted through the
  // slide-out so the close animation plays before unmount.
  useEffect(() => {
    if (showSheet) {
      setSheetRendered(true);
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, friction: 22, tension: 140 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setSheetRendered(false);
      });
    }
  }, [showSheet, slideAnim]);

  const refreshNotifs = useCallback(async () => {
    try {
      const count = await getNotifUnreadCount().catch(() => 0);
      setNotifUnread(Number(count) || 0);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (!cancelled) await refreshNotifs();
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshNotifs]);

  // Recent Bookings — newest tickets, enriched with the model's catalog image.
  const loadLatest = useCallback(async () => {
    if (latestLoadingRef.current) return; // dedupe overlapping loads (mount + first focus)
    latestLoadingRef.current = true;
    try {
      const data = await ticketApi.get('/tickets', { query: { page: 0, size: 20 } });
      const content: RecentTicket[] = Array.isArray(data) ? data : data?.content ?? data?.data ?? [];
      const brandIds = Array.from(new Set(content.map((t) => t.brandId).filter(Boolean)));
      const modelById: Record<string, DeviceModel> = {};
      if (brandIds.length) {
        await Promise.all(
          brandIds.map(async (bId) => {
            try {
              ((await getModelsByBrand(bId)) || []).forEach((m: DeviceModel) => {
                modelById[m.id] = m;
              });
            } catch {}
          }),
        );
      }
      const enriched: RecentTicket[] = content.map((t) => {
        const m = t.modelId ? modelById[t.modelId] : null;
        const modelUrl = resolveDeviceImageSource({ url: m?.imageUrl, base64: m?.imageBase64 });
        return {
          ...t,
          _modelImage: t.deviceImageUrl || modelUrl || null,
          _modelName: m?.name || t.deviceDisplayName || t.modelName || null,
        };
      });
      enriched.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      // The rail scrolls horizontally, so it can hold more than a static grid
      // would; "See All" still jumps to the full Bookings screen.
      setLatest(enriched.slice(0, 12));
    } catch {
      // Keep the cached list on a background refresh failure — don't blank
      // the screen (that reads as a jarring reload).
    } finally {
      latestLoadedAtRef.current = Date.now();
      latestLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // Pickup snapshot counts — repair pickups live in order-service
  // repair_bookings (serviceMode === 'PICKUP'), not in /tickets/counts.
  const loadPickups = useCallback(async () => {
    try {
      const rows = pickupsOnly(await listShopRepairBookings());
      setPickupCounts({
        all: countScope(SCOPES.PICKUP_ALL, { pickups: rows }),
        request: countScope(SCOPES.PICKUP_REQUEST, { pickups: rows }),
        accepted: countScope(SCOPES.PICKUP_ACCEPTED, { pickups: rows }),
      });
    } catch {}
  }, []);

  useEffect(() => {
    loadPickups();
  }, [loadPickups]);

  // Refresh the bell badge whenever Home regains focus. The heavier bookings
  // refetch is throttled + silent so returning to Home doesn't visibly reload.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      refreshNotifs();
      loadPickups();
      if (Date.now() - latestLoadedAtRef.current > HOME_REFRESH_STALE_MS) loadLatest();
    });
    return unsub;
  }, [navigation, refreshNotifs, loadLatest, loadPickups]);
  const reloadSession = useCallback(async () => {
    try {
      setSession(await fetchMe());
      return;
    } catch {}
    try {
      setSession(await fetchMe());
      return;
    } catch {}
    try {
      setSession(await getSession());
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    reloadSession();
  }, [reloadSession]);

  // …and again on every focus: the switcher's shop list comes from this
  // session, so after adding a shop a mount-only load left it missing from
  // Switch Account until the app was restarted.
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      reloadSession();
    });
    return unsub;
  }, [navigation, reloadSession]);

  // Category rail — same source as the customer app's Buy home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list: DeviceCategory[] = await getDeviceCategories();
        // Fixed display order: Mobile → Laptop → Tablet → Smartwatches →
        // Audio Device. Unknown categories fall to the end.
        const ORDER = ['mobile', 'laptop', 'tablet', 'smartwatches', 'audio device'];
        const rank = (c: DeviceCategory) => {
          const i = ORDER.indexOf((c.name || '').trim().toLowerCase());
          return i === -1 ? ORDER.length : i;
        };
        if (!cancelled) {
          setBuyCats((list || []).filter((c) => c.isActive !== false).sort((a, b) => rank(a) - rank(b)));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resolve KYC status: `hasKycDocs` routes the sheet row to View vs Intro,
  // `kycStatus` drives the avatar's verification badge. Re-runs on every
  // `showSheet` change so submitting documents refreshes the badge on close.
  useEffect(() => {
    const sid = session?.shopId;
    if (!sid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const kyc: KycDocuments = await getOwnerKycDocuments();
        if (cancelled) return;
        setHasKycDocs(!!(kyc && (kyc.aadharFrontUrl || kyc.aadharBackUrl || kyc.panUrl)));
        setKycStatus(kyc?.status || null);
      } catch {
        if (cancelled) return;
        setHasKycDocs(false);
        setKycStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showSheet, session?.shopId]);

  const shopName = session?.shopName || session?.shops?.find?.((s) => s.isActive)?.name || 'Shop · Owner';
  const shops: ShopSummary[] = session?.shops || [];
  const activeShop: ShopSummary | null = session?.activeShop || shops.find?.((s) => s.isActive) || null;
  // Shop-mobile logins show the SHOP front image; owner logins show the
  // owner's own avatar (falling back to the shop image when unset).
  const isShopLogin = session?.loginScope === 'SHOP' || session?.loginType === 'SHOP_LOGIN';
  const shopImage: string | null = isShopLogin ? activeShop?.frontImageUrl || null : session?.avatarUrl || activeShop?.frontImageUrl || null;
  // Only a true shop OWNER (owner-wide session) may add another business
  // location — not a shop-mobile login, and not any role that falls through
  // to the owner navigator without that role.
  const canAddShop = session?.loginScope !== 'SHOP' && (session?.roles || []).includes('SHOP_OWNER');
  const greeting = useMemo(() => greetingFor(), []);
  // No per-shop `verified` column exists — the only reviewed, admin-approved
  // signal is the OWNER's KYC status, which is owner-wide.
  const isVerified = kycStatus === 'APPROVED';

  // The dashboard's own hero banner is always the row titled "Slider-1" —
  // matched by title, never by array position, since the admin can add/
  // reorder/deactivate rows in the Management Portal at any time. `Repair`/
  // `Buy`/`Sell` rows exist in the same table but are for their own
  // screens (OwnerBuyListingScreen/OwnerSellHomeScreen already read them),
  // not this one.
  const sliderBanner = useMemo(
    () => banners.filter(isBannerActive).find((b) => normalizeBannerTitle(b.title) === 'slider-1') ?? null,
    [banners],
  );
  const sliderBannerImage = bannerImageUri(sliderBanner);

  // The banner's real aspect ratio, read from the actual image bytes —
  // fixing this at a guessed 16:5 was exactly why the artwork looked
  // "zoomed"/cropped: `resizeMode="cover"` filled that wrong-shaped box by
  // cropping the real image to fit it. 16/5 stays only as the very first
  // frame's placeholder, before `Image.getSize` resolves.
  const [bannerRatio, setBannerRatio] = useState(16 / 5);
  const [bannerImageFailed, setBannerImageFailed] = useState(false);
  useEffect(() => {
    setBannerImageFailed(false);
    if (!sliderBannerImage) return;
    Image.getSize(
      sliderBannerImage,
      (w, h) => {
        if (w > 0 && h > 0) setBannerRatio(w / h);
      },
      () => setBannerImageFailed(true),
    );
  }, [sliderBannerImage]);

  // On a wide tablet the banner must NOT stretch edge-to-edge — same
  // width-cap-and-center convention as DashboardHeader's own
  // `maxContentWidth`. Without this, the container was the full device
  // width while the image (rendered via `contain`) stayed at its natural,
  // much narrower size for the clamped height, letterboxing with large
  // empty margins on either side instead of filling the available space.
  const bannerMaxWidth = isTablet ? 1000 : undefined;
  const bannerEffectiveWidth = bannerMaxWidth ? Math.min(winW, bannerMaxWidth) : winW;
  const bannerContentWidth = bannerEffectiveWidth - PAD * 2;
  // The real Slider-1 artwork is ~2.74:1 — at the ~950px content width a
  // capped 1000px tablet container leaves, that needs ~350px of height to
  // actually fill the width; the old 220 cap forced `contain` to shrink
  // the image well below the container width and letterbox it with large
  // empty margins on both sides. 380 comfortably fits this real banner
  // while still bounding a pathological near-square upload.
  const bannerHeight = Math.min(Math.max(Math.round(bannerContentWidth / bannerRatio), 110), isTablet ? 380 : 170);

  const onSliderBannerPress = () => {
    const target = normalizeBannerTitle(sliderBanner?.linkTarget || sliderBanner?.title);
    if (target.includes('buy')) navigation.navigate('Buy', { categoryId: null });
    else if (target.includes('sell')) navigation.navigate('Sell');
    else gotoParent('RepairServiceBookingShop');
  };

  /** Same rule as Add Employee: at the plan's shop ceiling, tapping Add Shop must not open the form. */
  const handleAddShop = async () => {
    const ent = await fetchEntitlements();
    if (ent && !canAddShopOnPlan(ent)) {
      setShowSheet(false);
      await showLimitPopup(navigation, FEATURE.SHOPS, ent, undefined);
      return;
    }
    setShowSheet(false);
    // mode:'create' separates this from the account menu's "Shop Information"
    // row — without it the screen hydrates the ACTIVE shop instead.
    gotoParent('OwnerShopInfo', { mode: 'create' });
  };

  const handleSwitch = async (shopId: string) => {
    if (!shopId || shopId === session?.shopId) {
      setShowShopList(false);
      return;
    }
    setSwitching(true);
    try {
      await switchShop(shopId);
      await reloadSession();
      await refresh();
      await Promise.all([loadLatest(), loadPickups()]);
    } catch {
      // keep the sheet open on failure so the user can retry
    } finally {
      setSwitching(false);
      setShowShopList(false);
      setShowSheet(false);
    }
  };

  // Home banners — admin-managed (Management Portal → Home Banners), so a
  // failed fetch must never block or blank the rest of the dashboard; it
  // just leaves the hero banner hidden. Reused for both the mount load and
  // pull-to-refresh below.
  const loadBanners = useCallback(async () => {
    try {
      const list: DashboardBanner[] = await getBanners();
      // TEMPORARY DEBUG — remove once the banner issue is confirmed fixed.
      console.log('[Dashboard banners] fetched', Array.isArray(list) ? list.length : typeof list, 'rows:', JSON.stringify(list));
      setBanners(Array.isArray(list) ? list : []);
    } catch (e) {
      // TEMPORARY DEBUG — remove once the banner issue is confirmed fixed.
      console.warn('[Dashboard banners] fetch FAILED', e);
      setBanners([]);
    } finally {
      setBannersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadLatest(), loadPickups(), loadBanners()]);
    setRefreshing(false);
  };

  const gotoParent = (route: string, params?: Record<string, unknown>) => {
    const parent = navigation.getParent && navigation.getParent();
    if (parent) parent.navigate(route, params);
    else navigation.navigate(route, params);
  };

  // One handler for every tile grid. `via: 'parent'` routes are siblings of
  // OwnerTabs on the owner stack, which the tab navigator cannot reach itself.
  const openTile = (t: DashboardTool) => {
    if (t.via === 'parent') gotoParent(t.key, t.params);
    else navigation.navigate(t.key, t.params);
  };

  if (loading && !summary) {
    return (
      <View style={{ flex: 1, backgroundColor: C.groupedBg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={C.placeholder} />
      </View>
    );
  }

  const total = summary?.total ?? 0;
  // "Active" = everything still in the pipeline. Derived by subtraction
  // rather than summing individual statuses: assignedCount is orthogonal to
  // status ("has a technician"), so the old sum double-counted assigned
  // in-repair tickets and silently dropped intermediate statuses.
  const activeCount = Math.max(0, total - (summary?.delivered || 0) - (summary?.cancelled || 0));
  const deliveredCount = summary?.delivered || 0;
  const readyForDelivery = summary?.readyForDelivery || 0;

  // Overview cards. Every card opens the bookings list scoped to the matching
  // preset, and its count comes from the same scope predicate the list
  // filters by, so the figure always matches the length of the list it opens.
  const overview: OverviewStatItem[] = [
    { label: 'Service Orders', caption: 'All services', value: total, icon: PackageCheck, color: OV_TONE.total, onPress: () => navigation.navigate('Bookings') },
    { label: 'Active Jobs', caption: 'In progress', value: activeCount, icon: Clock, color: OV_TONE.active, onPress: () => gotoParent('BookingList', { preset: 'ACTIVE' }) },
    { label: 'Pickup Queue', caption: 'All pickups', value: pickupCounts.all, icon: Truck, color: OV_TONE.pickups, onPress: () => gotoParent('BookingList', { menu: 'PICKUP', preset: 'PICKUP_ALL' }) },
    { label: 'Pickup Requests', caption: 'New requests', value: pickupCounts.request, icon: Package, color: OV_TONE.request, onPress: () => gotoParent('BookingList', { menu: 'PICKUP', preset: 'PICKUP_REQUEST' }) },
    { label: 'Pickup Confirmed', caption: 'Accepted', value: pickupCounts.accepted, icon: ClipboardCheck, color: OV_TONE.accepted, onPress: () => gotoParent('BookingList', { menu: 'PICKUP', preset: 'PICKUP_ACCEPTED' }) },
    { label: 'Delivery Ready', caption: 'Ready to hand over', value: readyForDelivery, icon: CheckCircle2, color: OV_TONE.ready, onPress: () => gotoParent('BookingList', { preset: 'READY_FOR_DELIVERY' }) },
    { label: 'Delivered', caption: 'Completed orders', value: deliveredCount, icon: PackageOpen, color: OV_TONE.delivered, onPress: () => gotoParent('BookingList', { preset: 'DELIVERED' }) },
  ];
 const CAT_GAP = 12;
  // Phone tile now scales with width too (was a flat 72) — still clamped to
  // a sensible compact range rather than the raw division, which would
  // shrink below a legible size on a narrow phone or balloon unbounded on
  // a large one.
  const catTile = isTablet
    ? Math.min(140, Math.round((winW - PAD * 2 - CAT_GAP * 4) / 5))
    : Math.min(104, Math.max(76, Math.round((winW - PAD * 2 - CAT_GAP * 3.5) / 4.5)));
  const STAT_GAP = 10;
  // A horizontal scroll rail (not a 2-up grid), sized compact so the phone
  // width shows one full card plus a healthy peek of the next, hinting the
  // rail scrolls, rather than one oversized card filling the row.
  const bookingCardW = winW >= 900 ? 310 : winW >= 600 ? 295 : Math.round(Math.min(Math.max(winW * 0.64, 250), 290));
  const toolPanelRadius = 16;
  const toolGridPad = isTablet ? 12 : 8;
  const toolGap = isTablet ? 12 : 8;
   const toolColumns = getDashboardToolColumns(winW);
  // Prefer the panel's real measured width; fall back to the analytical
  // estimate only for the first frame, before `onToolPanelLayout` has fired.
  const toolGridContentWidth = toolPanelWidth > 0 ? toolPanelWidth - toolGridPad * 2 : Math.max(0, winW - PAD * 2 - toolGridPad * 2);
  const toolCardWidth = Math.floor(Math.max(0, (toolGridContentWidth - toolGap * (toolColumns - 1)) / toolColumns));

  const toolCardStyle = {
    marginHorizontal: PAD,
    backgroundColor: C.card,
    borderRadius: toolPanelRadius,
    borderWidth: HAIRLINE,
    borderColor: C.separator,
    paddingVertical: 10,
    shadowColor: '#0B1F14',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  } as const;

  // Clears the floating bottom tab bar (GlassTabBar in OwnerNavigator.js) —
  // a custom tabBar doesn't reserve scroll space on its own, so the last
  // section would otherwise sit partly behind it. +16 covers the active
  // tab's icon lifting slightly above the bar on selection.
  const scrollBottomPad = getTabBarTotalHeight(isTablet, insets.bottom) + 16;

  return (
    <View style={{ flex: 1, backgroundColor: C.groupedBg }}>
      <DashboardHeader
        insetsTop={insets.top}
        pad={PAD}
        greeting={greeting}
        shopName={shopName}
        shopImage={shopImage}
        isVerified={isVerified}
        notifUnread={notifUnread}
        onAvatarPress={() => navigation.navigate('MyAccount')}
        onIdentityPress={() => {
          setSheetMode('account');
          setShowSheet(true);
        }}
        onSwitchAccountPress={() => {
          setSheetMode('shops');
          setShowShopList(true);
          setShowSheet(true);
        }}
        onNotificationsPress={() => navigation.navigate('OwnerNotifications')}
        onCartPress={() => navigation.navigate('OwnerCart')}
        onSearchPress={() => gotoParent('OwnerSearch')}
      />

      <Animated.ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollBottomPad }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.placeholder} colors={[C.tint]} />}
      >
        {/* Hero banner — "Slider-1" from the admin-managed master_banners
            table. Height is driven by the image's OWN real ratio
            (`bannerRatio`, read via Image.getSize above) rather than a
            guessed constant, and rendered with `contain` so the artwork —
            logo, Repair/Sell/Buy panels, device photos — is never cropped
            or stretched. A skeleton shows while the first fetch is in
            flight; the whole block collapses to nothing (no broken-image
            icon) if there's no active Slider-1 row, no usable image, or
            the image itself fails to load. */}
        {bannersLoading ? (
          <View style={{ marginTop: 16, marginBottom: 20, width: '100%', maxWidth: bannerMaxWidth, alignSelf: 'center', paddingHorizontal: PAD }}>
            <View style={{ height: bannerHeight, borderRadius: 20, backgroundColor: C.fill }} />
          </View>
        ) : sliderBannerImage && !bannerImageFailed ? (
          <View style={{ marginTop: 16, marginBottom: 20, width: '100%', maxWidth: bannerMaxWidth, alignSelf: 'center', paddingHorizontal: PAD }}>
            <Touchable
              onPress={onSliderBannerPress}
              accessibilityRole="button"
              accessibilityLabel={sliderBanner?.title || 'Promotional banner'}
              style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF' }}
              pressedStyle={{ opacity: 0.9 }}
            >
              <Image
                source={{ uri: sliderBannerImage }}
                style={{ width: '100%', height: bannerHeight }}
                resizeMode="contain"
                onError={() => setBannerImageFailed(true)}
              />
            </Touchable>
          </View>
        ) : null}

        <View style={{ marginTop: SECTION_GAP }}>
          <DashboardSection title="Overview" action="Today's Summary" onAction={() => gotoParent('BookingStatus')} pad={PAD} />
          <DashboardOverviewGrid items={overview} pad={PAD} />
        </View>

        <View style={{ marginTop: SECTION_GAP }}>
          <DashboardMenuTabs
            tabs={[
              { label: 'Services', items: QUICK_ACTIONS },
              { label: 'Employee', items: EMPLOYEE_ACTIONS },
              { label: 'Reports', items: REPORT_ACTIONS },
            ]}
            pad={PAD}
            panelStyle={toolCardStyle}
            onPanelLayout={onToolPanelLayout}
            gridPad={toolGridPad}
            columns={toolColumns}
            cardWidth={toolCardWidth}
            gap={toolGap}
            onPress={openTile}
          />
        </View>

        {latest.length > 0 ? (
          <View style={{ marginTop: SECTION_GAP }}>
            <DashboardSection title="Recent Bookings" action="See All" onAction={() => navigation.navigate('Bookings')} pad={PAD} />
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={latest}
              keyExtractor={(t, idx) => t.id || `booking-${idx}`}
              contentContainerStyle={{ paddingHorizontal: PAD, gap: STAT_GAP }}
              renderItem={({ item: t }) => {
                const num = t.trackingId || (t.id ? t.id.slice(0, 8).toUpperCase() : '—');
                const device = t._modelName || t.deviceDisplayName || t.modelName || 'Device';
                const customer = t.customerName || t.customerFullName || t.customer?.name || 'Customer';
                const status = statusLabel(t.status || 'NEW');
                const tone = statusTone(t.status);
                return (
                  <DashboardBookingCard
                    width={bookingCardW}
                    image={t._modelImage}
                    device={device}
                    ticketNo={num}
                    customer={customer}
                    date={formatBookingDate(t.createdAt)}
                    status={status}
                    tone={tone}
                    onPress={() => navigation.navigate('DeviceDetail', { ticketId: t.id })}
                  />
                );
              }}
            />
          </View>
        ) : null}

        {buyCats.length > 0 ? (
          <View style={{ marginTop: SECTION_GAP + 6 }}>
            <DashboardSection title="Marketplace" action="See All" onAction={() => navigation.navigate('Buy', { categoryId: null })} pad={PAD} />
            <DashboardCategoryRail
              pad={PAD}
              tile={catTile}
              categories={buyCats}
              keyPrefix="buy"
              tileColors={MARKETPLACE_TILE_COLORS}
              onPick={(c, code) => navigation.navigate('Buy', { categoryId: c.id, categoryCode: code, categoryName: c.name })}
            />
          </View>
        ) : null}

        {buyCats.length > 0 ? (
          <View style={{ marginTop: SECTION_GAP + 6 }}>
            <DashboardSection title="Sell a Device" action="Sell" onAction={() => navigation.navigate('Sell')} pad={PAD} />
            <DashboardCategoryRail
              pad={PAD}
              tile={catTile}
              categories={buyCats}
              keyPrefix="sell"
              imageOverrides={SELL_IMAGES}
              tileColors={MARKETPLACE_TILE_COLORS}
              onPick={(c, code) => gotoParent('SelectBrand', { flow: 'OWNER_LIST', categoryId: c.id, categoryCode: code, categoryName: c.name })}
            />
          </View>
        ) : null}

        <Text style={{ fontSize: T.footnote, color: C.label2, textAlign: 'center', marginTop: 28, marginHorizontal: PAD + 12, lineHeight: T.footnote + 5 }}>
          {error ? 'Some figures could not be refreshed. Pull down to try again.' : 'Pull down to refresh · GGFix for Shops'}
        </Text>
      </Animated.ScrollView>

      <DashboardAccountSheet
        rendered={sheetRendered}
        anim={slideAnim}
        insets={insets}
        session={session}
        shopName={shopName}
        shopImage={shopImage}
        shops={shops}
        canAddShop={canAddShop}
        showShopList={showShopList}
        switching={switching}
        hasKycDocs={hasKycDocs}
        mode={sheetMode}
        onToggleShopList={() => setShowShopList((v) => !v)}
        onSwitch={handleSwitch}
        onClose={() => setShowSheet(false)}
        onNavigate={(route) => {
          setShowSheet(false);
          gotoParent(route);
        }}
        onLogout={() => {
          setShowSheet(false);
          if (onLogout) onLogout();
        }}
        onAddShop={handleAddShop}
      />
    </View>
  );
}
