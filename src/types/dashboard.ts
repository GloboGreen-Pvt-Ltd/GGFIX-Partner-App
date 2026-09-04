import type { LucideIcon } from 'lucide-react-native';

/** One entry in the Quick Access / Employee Management / Report Management grids. */
export interface DashboardTool {
  key: string;
  label: string;
  icon: LucideIcon;
  color?: string;
  /** Present when the route is a sibling of OwnerTabs on the parent stack. */
  via?: 'parent';
  params?: Record<string, unknown>;
}

/**
 * Loose navigation-prop shape covering exactly what this screen calls.
 * The app has no typed `ParamListBase` anywhere yet (React Navigation is used
 * untyped throughout), so this models the real call sites instead of a full
 * param list that doesn't exist elsewhere in the codebase.
 */
export interface DashboardNavigationProp {
  navigate: (route: string, params?: Record<string, unknown>) => void;
  addListener: (event: 'focus', callback: () => void) => () => void;
  getParent?: () => DashboardNavigationProp | undefined;
  canGoBack?: () => boolean;
}

/** Raw `/tickets/counts` response — a free-form status → count map. */
export interface TicketCountsResponse {
  total?: number;
  assignedCount?: number;
  revenue?: number;
  totalRevenue?: number;
  monthlyRevenue?: number;
  [status: string]: number | undefined;
}

/** Derived, display-ready booking counts. */
export interface DashboardSummary {
  serviceAccepted: number;
  technicianAssigned: number;
  inServiceProcess: number;
  readyForDelivery: number;
  delivered: number;
  cancelled: number;
  workPending: number;
  total: number;
  revenue: number;
}

export interface PickupCounts {
  all: number;
  request: number;
  accepted: number;
}

/** `/tickets` row, plus the two fields Home enriches it with client-side. */
export interface RecentTicket {
  id: string;
  trackingId?: string;
  status?: string;
  createdAt?: string;
  brandId?: string;
  modelId?: string;
  deviceImageUrl?: string | null;
  deviceDisplayName?: string;
  modelName?: string;
  customerName?: string;
  customerFullName?: string;
  customer?: { name?: string; phone?: string };
  customerPhone?: string;
  customerMobile?: string;
  _modelImage?: string | null;
  _modelName?: string | null;
}

export interface DeviceModel {
  id: string;
  name?: string;
  imageUrl?: string;
  imageBase64?: string;
}

export interface DeviceCategory {
  id: string;
  name: string;
  code?: string;
  isActive?: boolean;
  imageBase64?: string;
  imageUrl?: string;
}

export interface ShopSummary {
  id: string;
  name: string;
  slug?: string;
  isActive?: boolean;
  frontImageUrl?: string;
}

export interface SessionData {
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  roles?: string[];
  shopId?: string;
  shopName?: string;
  shopSlug?: string;
  shops?: ShopSummary[];
  activeShop?: ShopSummary | null;
  loginScope?: 'SHOP' | (string & {});
  loginType?: 'SHOP_LOGIN' | (string & {});
}

export interface KycDocuments {
  aadharFrontUrl?: string;
  aadharBackUrl?: string;
  panUrl?: string;
  /** Absent when never submitted. */
  status?: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  rejectReason?: string;
  submittedAt?: string;
  reviewedAt?: string;
}

export interface OverviewStatItem {
  label: string;
  caption: string;
  value: number;
  icon: LucideIcon;
  color: string;
  onPress: () => void;
}

export interface AccountMenuItem {
  route: string;
  label: string;
  sub: string;
  icon: LucideIcon;
  color: string;
}

export interface StatusTone {
  dot: string;
  text: string;
  bg: string;
}

export type SheetMode = 'account' | 'shops';

export type Feature = 'EMPLOYEES' | 'SHOPS' | 'SELL_ORDERS' | 'BUY_PRODUCTS';

export interface LimitUsage {
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  scope?: string;
  allowed: boolean;
  message?: string | null;
}

export interface Entitlements {
  plan?: string | null;
  planName?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  expired?: boolean;
  daysRemaining?: number;
  hasSubscription?: boolean;
  purchasedShopCount?: number;
  enforced?: boolean;
  limits?: Partial<Record<Feature, LimitUsage>>;
  features?: {
    newServiceBooking?: boolean;
    pickupService?: boolean;
    buyProducts?: boolean;
    sellProducts?: boolean;
    multipleShops?: boolean;
  };
}
