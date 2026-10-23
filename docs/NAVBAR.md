# Partner App — Bottom Navbar Design

The owner's bottom tab bar: a floating **"liquid glass"** pill with a raised
teal circle marking the active tab (iOS 26 / WhatsApp style).

| | |
|---|---|
| Component | `GlassTabBar` in [`src/navigation/OwnerNavigator.js`](../src/navigation/OwnerNavigator.js) |
| Sizes (single source) | [`src/navigation/tabBarMetrics.ts`](../src/navigation/tabBarMetrics.ts) |
| Navigator | `OwnerTabs` (`createBottomTabNavigator`, `tabBar={GlassTabBar}`) |

---

## 1. Anatomy

```
                 ╭──────╮   ← active circle: teal fill, 4 white ring,
                 │  ⌂   │     white icon; rises ~38% above the bar
 ╭───────────────┴──────┴──────────────────────────────────╮
 │   ·             Home         ▤          🛍        🏷     ⚙  │  ← glass pill (height 68)
 ╰─────────────────────────────────────────────────────────╯
   ↑ 14 side margin (20 on tablet)          ↑ bottom = safe-area inset (min 8)
```

- The bar **floats over the page** (absolute, transparent strip) — it does not
  push content up. Tab screens must pad their scroll content (see §6).
- Inactive tabs show **icon only**; the active tab shows its icon inside the
  circle and its **label** below, in teal.

## 2. Tabs

| # | Route | Label | Icon (lucide) |
|---|---|---|---|
| 1 | `Home` | Home | `House` |
| 2 | `Bookings` | Bookings | `ClipboardList` |
| 3 | `Buy` | Buy | `ShoppingBag` |
| 4 | `Sell` | Sell | `Tag` |
| 5 | `MyAccount` | Settings | `Settings` |

Icons map in `OWNER_TAB_ICONS`. A route can be kept off the bar via `HIDDEN_TABS` (empty today).

## 3. Sizes

All values are design units, scaled per device by `rs()` / `rf()` (base width
375, clamped ×0.88–×1.12). Tablet = window width ≥ 600.

| Element | Phone | Tablet |
|---|---|---|
| Bar height (`TAB_BAR_HEIGHT_*`) | **68** | **76** |
| Corner radius | height ÷ 2 (full pill) | same |
| Side margin | 14 | 20 |
| Max bar width | full width | 660, centred |
| Bottom gap | `max(safe-area bottom, 8)` | same |
| Inner horizontal padding | 6 | 6 |
| White rim (inner border) | 3 | 3 |
| Inactive icon | 22 | 24 |
| Active circle diameter | 50 | 56 |
| Active circle ring | 4 | 4 |
| Active icon (in circle) | 24 | 26 |
| Active label | 11, weight 800 | 12, weight 800 |
| Touch target per tab | ≥ 44 high, full slot width, hitSlop 6 | same |

## 4. Colours

| Token | Value | Used for |
|---|---|---|
| `NAV_TEAL` | `#035C6C` | Active circle fill, active label |
| `ICON_OFF` | `#6B7280` | Inactive icons |
| `GLASS_WASH` | `rgba(255,255,255,0.9)` with blur · `#FFFFFF` without | Bar body |
| `GLASS_RIM` | `#FFFFFF` | 3-unit inner rim |
| `GLASS_OUTLINE` | `rgba(17,17,17,0.08)` | Hairline outer outline |
| Top sheen | `rgba(255,255,255,0.7)` → transparent | Gradient over the top 55% of the bar |
| Bar shadow | `#111111`, opacity 0.10, radius 14, offset (0, 6) | Lift off the page |
| Circle shadow | `#111111`, opacity 0.16, radius 8, offset (0, 3), elevation 5 | Raised circle |

Brand teal matches the app palette — see [`COLORS.md`](COLORS.md).

## 5. Layers (bottom → top)

1. **Blur** — `expo-blur` `BlurView`: iOS intensity 60, tint `systemChromeMaterialLight`; Android intensity 40, tint `light`, `dimezisBlurView` blurring a `BlurTargetView` wrapped round the tab screens.
2. **White wash** — `GLASS_WASH` fill.
3. **Top sheen** — white → transparent gradient.
4. **Tab items** — icons (and the active label).
5. **Active circle** — drawn *outside* the bar's clip so it can rise above it.

**No-blur fallback:** `expo-blur` is native-only. If the running build lacks it
(`requireOptionalNativeModule('ExpoBlur')` is null), the blur layer is skipped
and the wash is solid white — no crash, same look minus the frost.

## 6. Content clearance

The bar reserves no space, so every tab screen must leave room at the bottom:

```js
import { useTabBarSpace } from '../navigation/tabBarMetrics';
const bottom = useTabBarSpace();          // bar + safe area + 16
<ScrollView contentContainerStyle={{ paddingBottom: bottom }} />
```

Because the bar and this padding read the same constants, changing the height
in `tabBarMetrics.ts` updates both.

## 7. Behaviour & motion

| | |
|---|---|
| Switch tab | On **press-in** (finger down), not release — feels instant |
| Circle glide | `withTiming` 180 ms, `Easing.out(cubic)` — no overshoot |
| Circle pulse | scale 1 → 1.08 (70 ms) → 1 (110 ms) on landing |
| Re-tap active tab | Emits `tabPress` only (screens may scroll-to-top / refresh) |
| Long press | Emits `tabLongPress` |
| Preload | After start-up idles, the other tabs mount in the background (600 ms + 250 ms each) so first taps open instantly |

## 8. Accessibility

- Each tab: `accessibilityRole="button"`, `accessibilityState={{ selected }}`, label = tab title, `activate` action.
- Active label uses `allowFontScaling={false}` so a large OS font can't break the pill; sizes still scale with the screen via `rf()`.
- Contrast: teal `#035C6C` on white and white on teal both pass WCAG AA.

## 9. Changing the design

| To change | Edit |
|---|---|
| Height | `TAB_BAR_HEIGHT_PHONE` / `_TABLET` in `tabBarMetrics.ts` |
| Whiteness / transparency | `GLASS_WASH` in `OwnerNavigator.js` |
| Active colour | `NAV_TEAL` (and `ICON_ON`) |
| Inactive colour | `ICON_OFF` |
| Tabs / icons / labels | `OWNER_TAB_ICONS` + the `Tab.Screen` list in `OwnerTabs` |
| Circle size / rise | `circ` and `circTop` in `GlassTabBar` |

## 10. Change log

| Date | Change |
|---|---|
| 2026-10-22 | Bar background whiter: wash 0.42 → 0.9 (blur) and 0.94 → solid white (no blur) |
| 2026-10-22 | Bar height +2: phone 64 → 66, tablet 72 → 74 |
| 2026-10-22 | Bar height +2 again: phone 66 → 68, tablet 74 → 76 |
