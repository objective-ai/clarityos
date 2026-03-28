# ClarityOS Design System

## Direction
Premium Glassmorphism — dark-first, ambient gradients, glass surfaces, teal accent.
Inspired by Linear, Stripe, Framer.

## Foundation
| Token | Value | Var |
|-------|-------|-----|
| Base color | Deep blue-black | `--bg-base` |
| Accent | Teal | `--accent` |
| Font | Plus Jakarta Sans | `--font-jakarta` |
| Mono | System monospace | `--font-mono` |
| Base size | 14px | html `font-size` |

## Depth
Glass-first: blur(16px) + layered shadows. Borders for structure, blur for depth.
- Surfaces: `--bg-base` → `--bg-surface` → `--bg-elevated` → `--bg-overlay` → `--bg-glass`
- Borders: `--border-subtle` → `--border-default` → `--border-strong` → `--border-glow`
- Shadows: `--shadow-sm` → `--shadow-md` → `--shadow-lg` → `--shadow-glow`
- Light theme: `[data-theme="light"]` overrides all vars in `globals.css`

## Spacing
Base 4px. Scale: **4, 8, 12, 16, 20, 24, 32**.

> Drift: 6px, 10px, 14px appear in nav/input padding — inherited from early components, not part of the intended scale.

Card padding: `p-5` (20px) or `p-6` (24px).

## Radius
| Use | Value | Class |
|-----|-------|-------|
| Data chips | 6px | `rounded-md` |
| Small elements | 8px | `rounded-lg` |
| Interactive | 12px | `rounded-xl` |
| Cards | 16px | `rounded-2xl` |
| Pills/badges | full | `rounded-full` |

## Typography
| Class | Size | Weight | Use |
|-------|------|--------|-----|
| `.text-display` | 32px | 700 | KPI values |
| `.section-title` | 18px | 700 | Section headers |
| `.text-heading` | 20px | 600 | Card titles |
| `.text-subhead` | 14px | 600 | Labels |
| `.text-body` | 14px | 400 | Default text |
| `.text-caption` | 12px | 500 | Hints, metadata |
| `.text-overline` | 11px | 600 UC | Stat labels |
| `.data-label` | 11px | 600 UC | Same as overline (alias) |

## Clinical States
Pattern: `text: full` / `bg: 10%` / `border: 25%`

| State | Var | Use |
|-------|-----|-----|
| Normal | `--state-normal` | Healthy, complete |
| Warning | `--state-warning` | Needs attention |
| Critical | `--state-critical` | Urgent, errors |
| Info | `--state-info` | Neutral alerts |

Badge variants map 1:1: `success`, `warning`, `destructive`, `info`.

## Components

**Card** — `glass-card` + `glass-card-hover` (lift -2px on hover). Accent: `glass-card-accent`.

**Button** — 4 sizes, 6 variants via cva:
| Size | Height | Padding | Radius |
|------|--------|---------|--------|
| default | 36px | px-4 | xl (12px) |
| sm | 32px | px-3 | lg (8px) |
| lg | 40px | px-8 | xl (12px) |
| icon | 32x32 | — | lg (8px) |

**Badge** — `rounded-full`, px-2.5 py-0.5, text-xs semibold. 7 variants.

**Glass Input** — `glass-input` class. 12px radius, 3px left accent border, focus ring `--accent-dim`.

**Nav Item** — `nav-item` class. 12px radius, active = inset 3px accent left.

**Stat Card** — `StatCard` component. glass-card + p-5, overline label → display value.

**Data Display** — `rx-value` class. Mono font, 6px radius, tinted bg.

## Motion
| Animation | Duration | Use |
|-----------|----------|-----|
| fade-in-up | 500ms | Page enters |
| slide-down | 200ms | Dropdowns |
| fade-in | 200ms | Overlays |
| pulse-glow | 2s loop | Status dots |
| spin-arc | 0.8s loop | Loaders |
| stagger | +50ms/child | Lists |

Transitions: **fast** 120ms / **base** 200ms. Easing: `cubic-bezier(0.16, 1, 0.3, 1)`.

## Layout
| Token | Value | Var |
|-------|-------|-----|
| Header | 64px | `--header-height` |
| Sticky header | 72px | `--sticky-height` |
| Sidebar | 220px | `--sidebar-width` |
| Touch target | 44px min | `--touch-target` |

Ambient bg: 3 radial gradient orbs (teal, blue, purple) via `.ambient-bg::before`.
