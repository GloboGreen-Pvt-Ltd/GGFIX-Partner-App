# GGFIX Partner App — Color List

Source of truth: `src/theme/colors.js` and `tailwind.config.js` (the two must stay in step).
Scanned 2026-10-17 across `src/` (303 files, 179 distinct hex values).

## 1. Brand palette

| Name | Hex | Used for |
|---|---|---|
| Teal (primary) | `#035C6C` | Buttons, active navigation, highlights, progress, links |
| Light Teal | `#E5F3F5` | Selected cards, icon backgrounds, soft fills |
| Teal line | `#C7E6EA` | Borders on light-teal surfaces |
| Green (success) | `#609138` | Success / positive status |
| Black (text) | `#111111` | Headings, primary text, shadows |
| Dark Gray | `#6B7280` | Secondary text |
| Subtle Gray | `#9CA3AF` | Subtle text, placeholders |
| Light Gray (page) | `#F3F4F6` | Page / section backgrounds |
| White | `#FFFFFF` | Cards, surfaces |
| Border Gray | `#E5E7EB` | Borders, dividers |
| Border strong | `#D1D5DB` | Stronger borders, inactive dots |
| Red (danger) | `#F84141` | Danger / error |
| Yellow (attention) | `#F3BF23` | Pending / warning (dark text only) |

## 2. Theme tokens (`theme/colors.js`)

| Token | Hex |
|---|---|
| `primary`, `primaryBright`, `primaryLight`, `primaryDark` | `#035C6C` |
| `primarySoft` | `#E5F3F5` |
| `accent`, `accentDark` | `#035C6C` |
| `accentLight` | `#C7E6EA` |
| `accentSoft` | `#E5F3F5` |
| `attention` | `#F3BF23` |
| `attentionLight` | `#F8D66B` |
| `attentionDark` | `#8A6A00` |
| `attentionSoft` | `#FFF8E1` |
| `background`, `pageBackground`, `surfaceMuted` | `#F3F4F6` |
| `card`, `surface` | `#FFFFFF` |
| `text` | `#111111` |
| `textMuted` | `#6B7280` |
| `textSubtle` | `#9CA3AF` |
| `border` | `#E5E7EB` |
| `borderStrong` | `#D1D5DB` |
| `success` | `#609138` |
| `warning` | `#F3BF23` |
| `danger`, `error` | `#F84141` |
| `info` | `#035C6C` |

## 3. Tailwind color scales (`tailwind.config.js`)

### Teal (key name `green`, used by `primary` / `accent` / `secondary`)

| Step | Hex |
|---|---|
| 50 | `#E5F3F5` |
| 100 | `#E5F3F5` |
| 200 | `#C7E6EA` |
| 300 | `#8CC3CC` |
| 400 | `#357D89` |
| 500 | `#035C6C` |
| 600 | `#035C6C` |
| 700 | `#024B58` |
| 800 | `#023F4A` |
| 900 | `#012A31` |

### Amber (`attention`, `warning`)

| Step | Hex |
|---|---|
| 50 | `#FFFBEA` |
| 100 | `#FFF8E1` |
| 200 | `#FBE7A6` |
| 300 | `#F8D66B` |
| 500 | `#F3BF23` |
| 600 | `#D9A60F` |
| 700 | `#8A6A00` |
| 800 | `#6B5200` |

### Red (`danger`, `error`)

| Step | Hex |
|---|---|
| 50 | `#FEECEC` |
| 100 | `#FDDADA` |
| 200 | `#FBB9B9` |
| 300 | `#FA8A8A` |
| 500 | `#F84141` |
| 700 | `#C82A2A` |

### Other Tailwind tokens

| Token | Hex |
|---|---|
| `background` | `#F3F4F6` |
| `card`, `surface` | `#FFFFFF` |
| `surface.muted` | `#F3F4F6` |
| `text` | `#111111` |
| `text.muted` | `#6B7280` |
| `text.subtle` | `#9CA3AF` |
| `border` | `#E5E7EB` |
| `border.strong` | `#D1D5DB` |
| `success` | `#609138` |

## 4. Most-used hex values in code

Count = times the value appears in `src/`; Files = how many files use it.

| Hex | Count | Files | Common constant names |
|---|---:|---:|---|
| `#FFFFFF` | 946 | 157 | `CARD_BG`, `SCREEN_BG` |
| `#035C6C` | 658 | 151 | `GREEN`, `ACCENT` |
| `#111111` | 458 | 144 | `INK`, `TEXT_PRIMARY` |
| `#E5F3F5` | 393 | 114 | `MINT`, `G_LIGHT` |
| `#F3F4F6` | 295 | 104 | `PAGE_BG`, `SOFT_MINT` |
| `#6B7280` | 270 | 105 | `MUTED`, `TEXT_SECONDARY` |
| `#E5E7EB` | 208 | 92 | `BORDER`, `LINE` |
| `#9CA3AF` | 195 | 77 | `SUBTLE`, `PLACEHOLDER` |
| `#C7E6EA` | 85 | 55 | `MINT_LINE`, `HEADER_BORDER` |
| `#B45309` | 66 | 29 | `CREATED_FG`, `CREDIT_AMBER` |
| `#F84141` | 55 | 31 | `RED`, `DANGER` |
| `#DC2626` | 52 | 36 | `ASSIGNED_RED`, `DANGER` |
| `#D1D5DB` | 43 | 32 | `DOT_BORDER`, `DOT` |
| `#FEF3C7` | 38 | 22 | `CREDIT_AMBER_BG`, `AMBER_TINT` |
| `#357D89` | 34 | 18 | `NEON`, `TEAL_MID` |
| `#F3BF23` | 30 | 21 | `YELLOW`, `BRAND_AMBER` |
| `#B91C1C` | 29 | 17 | — |
| `#FEECEC` | 28 | 21 | `DANGER_TINT`, `RED_TINT` |
| `#FFF8E1` | 28 | 24 | `YELLOW_TINT`, `AMBER_BG` |
| `#FEE2E2` | 26 | 17 | — |
| `#F59E0B` | 25 | 23 | `AMBER`, `TRIAL_ACCENT` |
| `#000000` | 23 | 7 | — |
| `#8A6A00` | 22 | 21 | `YELLOW_TEXT`, `AMBER_TEXT` |
| `#5E9440` | 16 | 8 | — |
| `#3B82F6` | 15 | 10 | — |
| `#609138` | 11 | 10 | `ACTIVE_GREEN` |
| `#FBD0D0` | 10 | 8 | `RED_LINE` |
| `#92400E` | 9 | 6 | — |
| `#D63232` | 9 | 7 | `RED_TEXT`, `DAMAGE_TEXT` |
| `#FCA5A5` | 8 | 8 | — |
| `#D97706` | 7 | 6 | — |
| `#FFFBEB` | 6 | 5 | — |
| `#FEF2F2` | 6 | 5 | — |
| `#FDE68A` | 6 | 6 | — |
| `#FECACA` | 6 | 5 | — |
| `#2563EB` | 6 | 6 | — |
| `#7C3AED` | 5 | 3 | — |
| `#EA580C` | 5 | 3 | — |
| `#8B5CF6` | 4 | 4 | `PRO_ACCENT` |

The remaining ~140 values are each used 1–3 times (one-off tints, category colours, chart and illustration colours).
