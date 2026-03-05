# ClarityOS EHR — Brand & Design Guidelines

> **Version:** 1.0 | **Updated:** 2026-03-04 | **Status:** Production

---

## 1. Brand Identity

| Property | Value |
|----------|-------|
| Product | ClarityOS EHR |
| Domain | Optometry EHR/PMS, multi-tenant SaaS |
| Design Philosophy | "Surgical Precision" — clinical confidence meets modern aesthetics |
| Aesthetic | Glassmorphism + Ambient Gradients + Layered Depth |
| Inspirations | Linear, Stripe, Framer |

---

## 2. Color System

### 2.1 Brand Accent

| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#2DD4BF` (Teal) | Primary actions, links, active states |
| `--accent-dim` | `rgba(45, 212, 191, 0.10)` | Faint background tint |
| `--accent-hover` | `#5EEAD4` | Hover brightened |
| `--accent-glow` | `rgba(45, 212, 191, 0.15)` | Medium glow overlay |
| `--accent-strong` | `rgba(45, 212, 191, 0.25)` | Strong accent overlay |

> Accent is tenant-customizable. All variants derive dynamically from a single hex via `ThemeProvider.tsx`.

### 2.2 Dark Theme (Default)

**Backgrounds — Deep layered surfaces with blue undertone**
```
--bg-base:      #06080D       Deepest background
--bg-surface:   #0C0F16       Cards, sidebar
--bg-elevated:  #12151E       Elevated surfaces
--bg-overlay:   #1A1D28       Modals, dropdowns
--bg-glass:     rgba(255, 255, 255, 0.03)
```

**Text — High-contrast hierarchy**
```
--text-primary:   #F0F2F5      Headings, body text
--text-secondary: #8B95A5      Labels, metadata
--text-muted:     #505868      Disabled, helper text
--text-inverse:   #06080D      On accent backgrounds
```

**Borders — Barely visible glass edges**
```
--border-subtle:  rgba(255, 255, 255, 0.04)
--border-default: rgba(255, 255, 255, 0.08)
--border-strong:  rgba(255, 255, 255, 0.14)
--border-glow:    rgba(45, 212, 191, 0.20)
```

**Shadows**
```
--shadow-sm:   0 1px 2px rgba(0,0,0,0.4), 0 0 1px rgba(0,0,0,0.3)
--shadow-md:   0 4px 12px rgba(0,0,0,0.5), 0 0 1px rgba(0,0,0,0.3)
--shadow-lg:   0 8px 32px rgba(0,0,0,0.6), 0 0 1px rgba(0,0,0,0.3)
--shadow-glow: 0 0 20px rgba(45, 212, 191, 0.08)
```

### 2.3 Light Theme

**Backgrounds**
```
--bg-base:      #F8F9FC       Light base
--bg-surface:   #FFFFFF       White surfaces
--bg-elevated:  #F1F3F9       Subtle elevation
--bg-overlay:   #E8EBF2       Light overlay
--bg-glass:     rgba(255, 255, 255, 0.70)
```

**Text**
```
--text-primary:   #0F1729
--text-secondary: #5E6880
--text-muted:     #9CA3B0
--text-inverse:   #F8F9FC
```

### 2.4 Clinical State Colors

| State | Color | Token |
|-------|-------|-------|
| Normal / Success | `#34D399` | `--state-normal` |
| Warning | `#FBBF24` | `--state-warning` |
| Critical / Error | `#F87171` | `--state-critical` |
| Info | `#60A5FA` | `--state-info` |

### 2.5 Data / Monospace Surfaces

```
--mono-bg:     rgba(45, 212, 191, 0.05)    Code background
--mono-border: rgba(45, 212, 191, 0.20)    Code border
```

---

## 3. Typography

### 3.1 Font Families

| Role | Font | Fallback |
|------|------|----------|
| UI / Body | Plus Jakarta Sans (or Inter) | system-ui, sans-serif |
| Data / Rx | JetBrains Mono (or Monaco) | monospace |

### 3.2 Type Scale

| Class | Size | Weight | Tracking | Use Case |
|-------|------|--------|----------|----------|
| `.text-display` | 32px | 700 | -0.02em | Page hero titles |
| `.text-heading` | 20px | 600 | -0.01em | Section/card titles |
| `.text-subhead` | 14px | 600 | -0.005em | Field labels, subsections |
| `.text-body` | 14px | 400 | 0 | Paragraph text |
| `.text-caption` | 12px | 500 | 0 | Descriptions, metadata |
| `.text-overline` | 11px | 600 | 0.06em | Labels, stat tags (uppercase) |

### 3.3 Base Settings

```
Root font-size: 14px
Body line-height: 1.6
Font smoothing: antialiased + grayscale
```

---

## 4. Glassmorphism System

### 4.1 Glass Tokens

```
--glass-blur:   16px
--glass-bg:     rgba(12, 15, 22, 0.70)         Dark glass base
--glass-border: rgba(255, 255, 255, 0.06)      Glass edge
```

### 4.2 Glass Utility Classes

| Class | Effect |
|-------|--------|
| `.glass-card` | Semi-transparent bg + blur + border + 16px radius + shadow |
| `.glass-card-hover` | Adds lift on hover (translateY -2px + glow shadow) |
| `.glass-card-accent` | Accent glow border + glow shadow |
| `.glass-input` | Elevated bg + border + 12px radius + focus ring |

### 4.3 Ambient Background

Applied via `.ambient-bg` — three radial gradient orbs:
- **Teal orb** (20% 30%): `rgba(45, 212, 191, 0.06)`, 600px radius
- **Blue orb** (80% 60%): `rgba(96, 165, 250, 0.04)`, 500px radius
- **Purple orb** (50% 80%): `rgba(167, 139, 250, 0.04)`, 400px radius

---

## 5. Spacing & Sizing

### 5.1 Layout Constants

```
--header-height:  64px       TopNav
--sticky-height:  72px       Patient sticky header
--sidebar-width:  260px      Expanded sidebar
Collapsed sidebar: 60px
```

### 5.2 Common Padding

| Context | Padding |
|---------|---------|
| Cards | `p-5` or `p-6` |
| Card headers | `p-6 pb-0` |
| Card content | `p-6` |
| Rows / list items | `px-5 py-3.5` |
| Page content | `p-6 lg:p-8` |

### 5.3 Border Radius

| Element | Radius |
|---------|--------|
| Cards | `16px` (`rounded-card`) |
| Buttons / inputs | `12px` (`rounded-xl`) |
| Inner elements | `8px` (`rounded-lg`) |
| Avatars / pills | `9999px` (`rounded-full`) |

### 5.4 Touch Targets

```
--touch-target: 44px
```
Enforced on mobile via `@media (pointer: coarse)` for buttons, inputs, nav items.

---

## 6. Component Library

### 6.1 Card (shadcn/ui)

```jsx
<Card>               {/* glass-card glass-card-hover */}
  <CardHeader>       {/* p-6 pb-0 */}
    <CardTitle>      {/* .text-heading */}
    <CardDescription>{/* .text-caption */}
  </CardHeader>
  <CardContent>      {/* p-6 */}
  <CardFooter>       {/* p-6 pt-0 */}
</Card>
```

### 6.2 Badge — 7 Variants

| Variant | Background | Border | Text |
|---------|-----------|--------|------|
| `default` | accent-dim | mono-border | accent |
| `secondary` | glass | glass-border | text-secondary |
| `destructive` | red 10% | red 25% | state-critical |
| `success` | green 10% | green 25% | state-normal |
| `warning` | amber 10% | amber 25% | state-warning |
| `info` | blue 10% | blue 25% | state-info |
| `outline` | transparent | border-default | text-secondary |

All badges are pill-shaped (`rounded-full`).

### 6.3 Button — 6 Variants, 4 Sizes

**Variants:** `default` (accent bg), `destructive` (red glass), `outline` (border), `secondary` (elevated), `ghost` (transparent), `link` (underline)

**Sizes:** `default` (36px), `sm` (32px), `lg` (40px), `icon` (32x32)

**Focus:** `ring-2 ring-accent ring-offset-2 ring-offset-bg-base`

### 6.4 StatCard

KPI display with optional accent glow line. Props: `label`, `value`, `trend?`, `icon?`, `accent?`.

### 6.5 DropdownMenu

Radix-based with glass-card styling, `rounded-xl` content, `rounded-lg` items.

---

## 7. Motion & Animation

### 7.1 Easing

```
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)
```

### 7.2 Transitions

| Context | Duration |
|---------|----------|
| Hover states | 200ms |
| Card hover | 250ms |
| Fast micro-interactions | 120ms |

### 7.3 Keyframe Animations

| Name | Effect | Duration |
|------|--------|----------|
| `fade-in-up` | Slide up + fade in | 500ms ease-out-expo |
| `pulse-glow` | Accent ring pulse | 2s infinite |
| `slide-down` | Slide down + fade in | 200ms |
| `fade-in` | Simple opacity | 200ms |
| `pulse-dot` | Opacity pulse | 1.5s infinite |
| `spin-arc` | Rotation spinner | 0.8s linear |

### 7.4 Stagger System

`.stagger > *` — children animate sequentially with 50ms delay increments (up to 7 children).

---

## 8. Interactive States

| Class | Behavior |
|-------|----------|
| `.hover-row` | Transparent → glass bg on hover |
| `.hover-card` | Lift + glow + stronger border |
| `.hover-btn` | Color shift + border strengthen |
| `.hover-danger` | Text turns critical red |
| `.hover-laterality` | Accent glow bg + border |
| `.input-focus` | Accent border + 3px accent-dim ring |
| `.nav-item` | Glass hover + accent glow when `.active` |

---

## 9. Navigation Patterns

### Sidebar
- Fixed left, collapsible (260px ↔ 60px)
- Glass surface bg with glass-border right edge
- Active items: accent glow bg + 3px left accent stripe
- Locked items: opacity-50 + lock icon

### TopNav
- Sticky, 64px, glass backdrop blur(20px)
- Left: page title + gear icon → settings
- Right: Sun/Moon theme toggle + user avatar

---

## 10. Customization

### Per-Tenant
- **Logo:** Drag-and-drop upload, stored as data URL
- **Accent color:** 8 presets + custom hex picker
- **WCAG indicator:** Shows AA pass/fail for chosen accent

### Theme
- Light/dark only (no system detection)
- Toggle via TopNav Sun/Moon icon
- Persisted to localStorage

### Accent Derivation
From a single hex, `ThemeProvider` computes:
`--accent`, `--accent-dim`, `--accent-hover`, `--accent-glow`, `--accent-strong`, `--mono-bg`, `--mono-border`, `--border-glow`, `--shadow-glow`

---

## 11. Accessibility

- WCAG AA contrast ratios verified for all text colors
- 44px minimum touch targets on mobile
- Focus rings on all interactive elements
- Semantic HTML throughout
- `aria-label` on icon-only buttons

---

## 12. File Reference

| File | Role |
|------|------|
| `app/globals.css` | All CSS tokens, utilities, keyframes |
| `tailwind.config.ts` | Theme extensions, color aliases |
| `components/ui/card.tsx` | Card + subcomponents |
| `components/ui/badge.tsx` | 7 badge variants |
| `components/ui/button.tsx` | 6 button variants + 4 sizes |
| `components/ui/stat-card.tsx` | KPI stat card |
| `components/ui/dropdown-menu.tsx` | Glass dropdown |
| `components/Sidebar.tsx` | Navigation sidebar |
| `components/TopNav.tsx` | Header + theme toggle |
| `components/ThemeProvider.tsx` | Accent color syncing |
| `lib/color-utils.ts` | Hex/RGB/HSL + WCAG contrast |
| `store/themeStore.ts` | Dark/light state |
| `store/tenantCustomizationStore.ts` | Logo + accent state |
