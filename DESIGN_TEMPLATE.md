# ClarityOS EHR — Design Template

> Quick-reference for building new pages and components. See `BRAND_GUIDELINES.md` for the full system.

---

## Page Template

```tsx
"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function NewPage() {
  return (
    <div className="space-y-6 stagger">
      {/* Page header */}
      <div>
        <h1 className="text-display">Page Title</h1>
        <p className="text-body mt-1">Brief description of the page.</p>
      </div>

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

---

## Common Patterns

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
