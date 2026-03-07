# ClarityOS EHR — Design Template

> Quick-reference for building new pages and components. See `BRAND_GUIDELINES.md` for the full system.

---

## Page Template

```tsx
"use client";

import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function NewPage() {
  // Page subtitle shown in TopNav: "Page Title · subtitle"
  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);
  useEffect(() => {
    setSubtitle("Dynamic context info");
    return () => setSubtitle(null);
  }, [setSubtitle]);

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Content cards */}
      <Card>
        <CardHeader>
          <CardTitle>Section Title</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Content here */}
        </CardContent>
      </Card>
    </div>
  );
}
```

> **Note:** Page titles are rendered by `TopNav` using `getPageTitle(pathname)`.
> Dynamic context (dates, counts) goes in `usePageHeaderStore.setSubtitle()`.
> The outer wrapper should use `flex flex-col gap-6 stagger` (not `space-y-6`).

---

## Common Patterns

### Page Toolbar (Required for pages with controls)

Every page with filters, search, or navigation uses a single toolbar row:
**Left = filters/status/search, Right = actions/nav controls.**

```tsx
{/* Schedule / Optical pattern: badges left, date nav + action right */}
<div className="flex items-center justify-between flex-wrap gap-4">
  <div className="flex items-center gap-2 flex-wrap">
    <Badge variant="outline" className="gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "#22c55e" }} />
      Completed 3
    </Badge>
    <Badge variant="secondary">8 total</Badge>
  </div>
  <div className="flex items-center gap-2">
    <Button variant="ghost" size="icon" title="Previous day">
      {/* chevron-left SVG */}
    </Button>
    <Button variant="ghost" size="sm">Today</Button>
    <Button variant="ghost" size="icon" title="Next day">
      {/* chevron-right SVG */}
    </Button>
    <input type="date" className="glass-input px-3 py-1.5 rounded-lg text-sm" />
    <Button size="sm">+ Book</Button>
  </div>
</div>

{/* Patients pattern: search left, action right */}
<div className="flex items-center justify-between flex-wrap gap-4">
  <SearchInput />
  {/* Future: <Button size="sm">+ Add Patient</Button> */}
</div>
```

### Error Banner (Consistent across all pages)

```tsx
{error && (
  <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-500">
    <span className="flex-1">{error}</span>
    <Button variant="ghost" size="sm" onClick={clearError}>
      Dismiss
    </Button>
  </div>
)}
```

### Loading State (Consistent across all pages)

```tsx
<div className="flex items-center justify-center py-20">
  <div className="flex items-center gap-3 text-[var(--text-muted)]">
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
    <span className="text-body">Loading...</span>
  </div>
</div>
```

### Empty State (Consistent across all pages)

```tsx
<div className="glass-card flex flex-col items-center justify-center py-20 gap-4">
  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
    {/* 20x20 icon SVG using stroke="var(--text-muted)" */}
  </div>
  <div className="text-center">
    <p className="text-subhead">No items found</p>
    <p className="text-caption text-[var(--text-muted)] mt-1">
      Helpful description or next step.
    </p>
  </div>
  <Button variant="outline">Optional CTA</Button>
</div>
```

### Status Badge (Inline, non-interactive label)

Used on appointment cards. Uses hex colors from `STATUS_COLORS` for inline styles.

```tsx
<span
  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase select-none"
  style={{ backgroundColor: `${color}20`, color, border: `1px solid ${color}30` }}
>
  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
  {label}
</span>
```

### Modal / Dialog (Consistent across all modals)

```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
  <div className="relative glass-card p-6 w-full max-w-md mx-4 space-y-4">
    <h2 className="text-heading text-lg">Modal Title</h2>
    {/* Form content with glass-input fields */}
    <div className="flex gap-3 justify-end pt-2">
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button>Confirm</Button>
      {/* Or for destructive: <Button variant="destructive">Delete</Button> */}
    </div>
  </div>
</div>
```

### KPI Row (Dashboard)
```tsx
import { StatCard } from "@/components/ui/stat-card";
import { Users, Calendar, Eye, Clock } from "lucide-react";

<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard label="Patients Seen" value={12} trend="+3 vs yesterday" icon={<Users />} accent />
  <StatCard label="Appointments" value={18} icon={<Calendar />} />
  <StatCard label="Exams Complete" value={8} icon={<Eye />} />
  <StatCard label="Avg Wait" value="12m" icon={<Clock />} />
</div>
```

### Data Table
```tsx
<Card>
  <CardHeader>
    <CardTitle>Table Title</CardTitle>
  </CardHeader>
  <CardContent className="p-0">
    {/* Header row */}
    <div className="grid grid-cols-4 gap-4 px-5 py-3 border-b border-[var(--border-subtle)]">
      <span className="text-overline">Column</span>
    </div>
    {/* Data rows */}
    {items.map((item) => (
      <div key={item.id} className="grid grid-cols-4 gap-4 px-5 py-3.5 hover-row">
        <span className="text-sm text-[var(--text-primary)]">{item.name}</span>
        <Badge variant="success">Status</Badge>
      </div>
    ))}
  </CardContent>
</Card>
```

### Glass Input (Search / Form)
```tsx
<input
  type="text"
  placeholder="Search…"
  className="glass-input w-full px-4 py-2.5 text-sm"
/>
```

### Two-Column Layout
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <Card>...</Card>
  <Card>...</Card>
</div>
```

### Sidebar + Main Split
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
  <Card>{/* Narrower panel */}</Card>
  <Card>{/* Wider content */}</Card>
</div>
```

---

## Badge Usage

```tsx
<Badge variant="default">Accent</Badge>
<Badge variant="secondary">Muted</Badge>
<Badge variant="destructive">Allergy</Badge>
<Badge variant="success">Completed</Badge>
<Badge variant="warning">Elevated IOP</Badge>
<Badge variant="info">In Progress</Badge>
<Badge variant="outline">Neutral</Badge>
```

---

## Button Usage

```tsx
<Button>Primary Action</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Subtle</Button>
<Button variant="destructive">Delete</Button>
<Button variant="ghost" size="icon"><Settings className="h-4 w-4" /></Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

---

## Typography Cheat Sheet

```tsx
<h1 className="text-display">Hero / Page Title</h1>
<h2 className="text-heading">Section Title</h2>
<h3 className="text-subhead">Subsection</h3>
<p className="text-body">Body paragraph text.</p>
<span className="text-caption">Metadata, descriptions</span>
<span className="text-overline">LABEL / TAG</span>
```

---

## Data Display

```tsx
{/* Prescription value */}
<span className="rx-value">-2.50</span>

{/* Label + value pair */}
<div>
  <span className="data-label">IOP</span>
  <span className="data-value">18</span>
</div>

{/* Status dot */}
<span className="status-dot bg-[var(--state-normal)]" />
<span className="status-dot status-dot-pulse bg-[var(--accent)]" />
```

---

## Animation Patterns

```tsx
{/* Staggered entrance for children */}
<div className="stagger">
  <Card>...</Card>  {/* 50ms delay */}
  <Card>...</Card>  {/* 100ms delay */}
  <Card>...</Card>  {/* 150ms delay */}
</div>

{/* Single element entrance */}
<div className="animate-enter">...</div>

{/* Pulsing glow (live indicators) */}
<span className="animate-glow" />

{/* Slide-down (dropdowns, expanding content) */}
<div className="animate-slide-down">...</div>
```

---

## Glass Card Variants

```tsx
{/* Standard card with hover lift */}
<div className="glass-card glass-card-hover p-6">...</div>

{/* Highlighted / accent card */}
<div className="glass-card glass-card-accent p-6">...</div>

{/* Static card (no hover effect) */}
<div className="glass-card p-6">...</div>
```

---

## Interactive Elements

```tsx
{/* Clickable row */}
<div className="hover-row px-5 py-3.5 rounded-xl">...</div>

{/* Clickable card */}
<div className="glass-card hover-card p-5">...</div>

{/* Nav item */}
<a className="nav-item">
  <Icon className="h-4 w-4" />
  <span>Label</span>
</a>
<a className="nav-item active">...</a>

{/* Laterality toggle (OD/OS/OU) */}
<button className="hover-laterality px-3 py-1.5 rounded-lg border border-[var(--border-default)]">
  OD
</button>
```

---

## Color Reference (Quick)

| Use | CSS Variable | Dark Value |
|-----|-------------|------------|
| Page background | `var(--bg-base)` | `#06080D` |
| Card background | `var(--bg-surface)` | `#0C0F16` |
| Primary text | `var(--text-primary)` | `#F0F2F5` |
| Secondary text | `var(--text-secondary)` | `#8B95A5` |
| Accent | `var(--accent)` | `#2DD4BF` |
| Success | `var(--state-normal)` | `#34D399` |
| Warning | `var(--state-warning)` | `#FBBF24` |
| Error | `var(--state-critical)` | `#F87171` |
| Info | `var(--state-info)` | `#60A5FA` |
