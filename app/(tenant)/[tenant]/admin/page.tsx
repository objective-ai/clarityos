"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useCurrentTenant } from "@/store/sessionStore";
import { usePageHeaderStore } from "@/store/pageHeaderStore";
import { useThemeStore } from "@/store/themeStore";
import {
  useTenantCustomizationStore,
} from "@/store/tenantCustomizationStore";
import { contrastRatio, meetsAALarge } from "@/lib/color-utils";
import type { ThemePreference } from "@/store/themeStore";
import type { StaffRole } from "@/types/session";

// ---------------------------------------------------------------------------
// Staff type — maps to /api/staff backend response (snake_case → camelCase)
// ---------------------------------------------------------------------------

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: StaffRole;
  clinicalRole?: StaffRole;
  npi?: string;
  isActive: boolean;
  createdAt: string;
  userId?: string | null;  // Supabase Auth user UUID (null = unlinked)
}
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Section definitions
// ---------------------------------------------------------------------------

type SectionKey = "general" | "staff" | "compliance";

const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  {
    key: "general",
    label: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.7 3.7l1.4 1.4M10.9 10.9l1.4 1.4M3.7 12.3l1.4-1.4M10.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "staff",
    label: "Staff",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1 13c0-2.761 2.015-4.5 4.5-4.5S10 10.239 10 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <circle cx="11.5" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M10 13c0-2.21 1.343-3.5 3-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "compliance",
    label: "Compliance",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5L2.5 4v4c0 3.314 2.343 5.431 5.5 6.5 3.157-1.069 5.5-3.186 5.5-6.5V4L8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// General Settings section constants
// ---------------------------------------------------------------------------

const PRESET_COLORS = [
  { hex: "#2DD4BF", label: "Teal" },
  { hex: "#60A5FA", label: "Blue" },
  { hex: "#818CF8", label: "Indigo" },
  { hex: "#A78BFA", label: "Purple" },
  { hex: "#F472B6", label: "Pink" },
  { hex: "#FB923C", label: "Orange" },
  { hex: "#FBBF24", label: "Amber" },
  { hex: "#34D399", label: "Emerald" },
];

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.7 3.7l1.4 1.4M10.9 10.9l1.4 1.4M3.7 12.3l1.4-1.4M10.9 5.1l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13 9a5.5 5.5 0 01-7-7A5.5 5.5 0 1013 9z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

// ---------------------------------------------------------------------------
// Staff section constants
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: StaffRole[] = ["doctor", "technician", "receptionist", "admin", "owner"];

const ROLE_LABEL: Record<StaffRole, string> = {
  doctor: "Doctor",
  technician: "Technician",
  receptionist: "Receptionist",
  admin: "Admin",
  owner: "Owner",
};

// bg, text used for both the role badge and avatar
const ROLE_COLORS: Record<StaffRole, { bg: string; text: string; border: string }> = {
  doctor:       { bg: "rgba(45,212,191,0.12)",  text: "#2DD4BF", border: "rgba(45,212,191,0.3)"  },
  technician:   { bg: "rgba(96,165,250,0.12)",  text: "#60A5FA", border: "rgba(96,165,250,0.3)"  },
  receptionist: { bg: "rgba(167,139,250,0.12)", text: "#A78BFA", border: "rgba(167,139,250,0.3)" },
  admin:        { bg: "rgba(251,191,36,0.12)",  text: "#FBBF24", border: "rgba(251,191,36,0.3)"  },
  owner:        { bg: "rgba(251,113,133,0.12)", text: "#FB7185", border: "rgba(251,113,133,0.3)" },
};

// ---------------------------------------------------------------------------
// General Settings Section
// ---------------------------------------------------------------------------

function GeneralSettingsSection() {
  const tenant = useCurrentTenant();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const logoUrl = useTenantCustomizationStore((s) => s.logoUrl);
  const accentColor = useTenantCustomizationStore((s) => s.accentColor);
  const setLogo = useTenantCustomizationStore((s) => s.setLogo);
  const setAccentColor = useTenantCustomizationStore((s) => s.setAccentColor);
  const resetToDefaults = useTenantCustomizationStore((s) => s.resetToDefaults);

  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setUploadError(null);
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setUploadError("Invalid format. Use PNG, JPG, or SVG.");
        return;
      }
      if (file.size > MAX_LOGO_SIZE) {
        setUploadError("File too large. Maximum 2 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setLogo(reader.result as string);
      reader.readAsDataURL(file);
    },
    [setLogo]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile]
  );

  const darkBg = "#06080D";
  const lightBg = "#F8F9FC";
  const passesOnDark = meetsAALarge(accentColor, darkBg);
  const passesOnLight = meetsAALarge(accentColor, lightBg);
  const ratio = Math.min(
    contrastRatio(accentColor, darkBg),
    contrastRatio(accentColor, lightBg)
  );
  const passesAA = passesOnDark && passesOnLight;

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="text-overline mb-1">Clinic Name</div>
            <div className="text-sm text-[var(--text-primary)]">
              {tenant?.clinicName ?? "\u2014"}
            </div>
          </div>

          <div>
            <div className="text-overline mb-2">Clinic Logo</div>
            {logoUrl ? (
              <div className="flex items-center gap-4">
                <img
                  src={logoUrl}
                  alt="Clinic logo"
                  className="w-16 h-16 rounded-xl object-cover border border-[var(--border-default)]"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLogo(null);
                      setUploadError(null);
                    }}
                    className="text-[var(--text-muted)] hover:text-[var(--state-critical)]"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center py-8 rounded-xl cursor-pointer transition-all border-2 border-dashed ${
                  dragOver
                    ? "border-[var(--accent)] bg-[var(--accent-dim)]"
                    : "border-[var(--border-default)] hover:border-[var(--border-strong)]"
                }`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--text-muted)]">
                  <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-sm mt-2 text-[var(--text-secondary)]">
                  Drop logo here or click to upload
                </span>
                <span className="text-[11px] mt-1 text-[var(--text-muted)]">
                  PNG, JPG, or SVG &mdash; max 2 MB
                </span>
              </div>
            )}

            {uploadError && (
              <p className="text-xs mt-2 text-[var(--state-critical)]">{uploadError}</p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.svg"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[16px]">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme selector */}
          <div>
            <div className="text-overline mb-3">Theme</div>
            <div className="inline-flex rounded-xl overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-glass)]">
              {THEME_OPTIONS.map((opt) => {
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTheme(opt.value)}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                    style={{
                      borderRight: opt.value !== "dark" ? "1px solid var(--glass-border)" : undefined,
                    }}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Accent color picker */}
          <div>
            <div className="text-overline mb-3">Accent Color</div>
            <div className="flex items-center gap-3 flex-wrap">
              {PRESET_COLORS.map((preset) => {
                const active = accentColor.toUpperCase() === preset.hex.toUpperCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.label}
                    onClick={() => setAccentColor(preset.hex)}
                    className={`relative flex items-center justify-center rounded-full transition-all w-9 h-9 ${
                      active ? "ring-2 ring-[var(--text-primary)] ring-offset-2 ring-offset-[var(--bg-base)]" : ""
                    }`}
                    style={{ background: preset.hex }}
                  >
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}

              <label className="flex items-center gap-2 cursor-pointer" title="Custom color">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-9 h-9 rounded-full cursor-pointer border-2 border-[var(--border-default)] p-0 bg-transparent"
                />
                <span className="text-xs text-[var(--text-muted)]">Custom</span>
              </label>
            </div>

            {/* Contrast indicator */}
            <div className="flex items-center gap-2 mt-3">
              <Badge variant={passesAA ? "success" : "destructive"}>
                AA {passesAA ? "\u2713" : "\u2717"}
              </Badge>
              <span className="text-[11px] text-[var(--text-muted)]">
                Contrast {ratio.toFixed(1)}:1 against both backgrounds
              </span>
            </div>
          </div>

          {/* Reset */}
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetToDefaults();
                setTheme("dark");
              }}
            >
              Reset to Defaults
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Staff Form Dialog
// ---------------------------------------------------------------------------

const CLINICAL_ROLES: StaffRole[] = ["doctor", "technician"];

interface StaffFormDialogProps {
  open: boolean;
  member: StaffMember | null;
  onClose: () => void;
  onSave: (data: Omit<StaffMember, "id" | "createdAt"> & { id?: string }) => void;
}

function StaffFormDialog({ open, member, onClose, onSave }: StaffFormDialogProps) {
  const isEdit = member !== null;

  const [form, setForm] = useState(() => ({
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    role: (member?.role ?? "receptionist") as StaffRole,
    clinicalRole: (member?.clinicalRole ?? "") as StaffRole | "",
    npi: member?.npi ?? "",
    isActive: member?.isActive ?? true,
  }));

  // Reset form when dialog opens with new member
  const prevMemberRef = useRef(member);
  if (prevMemberRef.current !== member) {
    prevMemberRef.current = member;
    form.firstName = member?.firstName ?? "";
    form.lastName = member?.lastName ?? "";
    form.email = member?.email ?? "";
    form.phone = member?.phone ?? "";
    form.role = (member?.role ?? "receptionist") as StaffRole;
    form.clinicalRole = (member?.clinicalRole ?? "") as StaffRole | "";
    form.npi = member?.npi ?? "";
    form.isActive = member?.isActive ?? true;
  }

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveClinicalRole = form.role === "owner" && form.clinicalRole ? form.clinicalRole : undefined;
    const showsNpi = CLINICAL_ROLES.includes(form.role) || (effectiveClinicalRole && CLINICAL_ROLES.includes(effectiveClinicalRole));
    onSave({
      ...(isEdit ? { id: member!.id } : {}),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
      clinicalRole: effectiveClinicalRole,
      npi: showsNpi && form.npi.trim() ? form.npi.trim() : undefined,
      isActive: form.isActive,
    });
    onClose();
  };

  const showClinicalRole = form.role === "owner";
  const showNpi = CLINICAL_ROLES.includes(form.role) || (showClinicalRole && !!form.clinicalRole && CLINICAL_ROLES.includes(form.clinicalRole as StaffRole));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 pb-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-overline">First Name</label>
              <input
                required
                value={form.firstName}
                onChange={set("firstName")}
                className="px-4 h-10 rounded-xl text-sm glass-input"
                placeholder="First"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-overline">Last Name</label>
              <input
                required
                value={form.lastName}
                onChange={set("lastName")}
                className="px-4 h-10 rounded-xl text-sm glass-input"
                placeholder="Last"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-overline">Work Email</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={set("email")}
              className="px-4 h-10 rounded-xl text-sm glass-input"
              placeholder="name@clinic.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-overline">Work Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                className="px-4 h-10 rounded-xl text-sm glass-input"
                placeholder="(555) 000-0000"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-overline">Role</label>
              <select
                value={form.role}
                onChange={set("role")}
                className="px-3 h-10 rounded-xl text-sm bg-[var(--bg-glass)] border border-[var(--glass-border)] text-[var(--text-primary)] cursor-pointer"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
          </div>

          {showClinicalRole && (
            <div className="flex flex-col gap-1.5">
              <label className="text-overline">
                Clinical Role{" "}
                <span className="text-[var(--text-muted)] normal-case font-normal">(if owner also practices)</span>
              </label>
              <select
                value={form.clinicalRole}
                onChange={(e) => setForm((prev) => ({ ...prev, clinicalRole: e.target.value as StaffRole | "" }))}
                className="px-3 h-10 rounded-xl text-sm bg-[var(--bg-glass)] border border-[var(--glass-border)] text-[var(--text-primary)] cursor-pointer"
              >
                <option value="">None — administrative owner only</option>
                <option value="doctor">Doctor (OD / MD)</option>
                <option value="technician">Technician</option>
              </select>
            </div>
          )}

          {showNpi && (
            <div className="flex flex-col gap-1.5">
              <label className="text-overline">NPI Number <span className="text-[var(--text-muted)] normal-case font-normal">(optional)</span></label>
              <input
                type="text"
                value={form.npi}
                onChange={set("npi")}
                className="px-4 h-10 rounded-xl text-sm glass-input"
                placeholder="10-digit NPI"
                maxLength={10}
              />
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <Button type="submit" variant="default" size="sm">
              {isEdit ? "Save Changes" : "Add Staff Member"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Staff Management Section
// ---------------------------------------------------------------------------

function StaffManagementSection() {
  const [search, setSearch] = useState("");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);

  // Map snake_case API response to camelCase frontend
  const mapStaff = (s: Record<string, unknown>): StaffMember => ({
    id: String(s.id),
    firstName: String(s.first_name ?? ""),
    lastName: String(s.last_name ?? ""),
    email: "",
    role: String(s.role ?? "receptionist") as StaffRole,
    npi: s.npi_number ? String(s.npi_number) : undefined,
    isActive: Boolean(s.is_active),
    createdAt: String(s.created_at ?? ""),
    userId: s.user_id ? String(s.user_id) : null,
  });

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/staff");
      if (res.ok) {
        const data = await res.json();
        setStaffList(Array.isArray(data) ? data.map(mapStaff) : []);
      }
    } catch {
      // silent — staff list stays empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const filtered = useMemo(() => {
    if (!search.trim()) return staffList;
    const q = search.toLowerCase();
    return staffList.filter(
      (s) =>
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.role.toLowerCase().includes(q)
    );
  }, [search, staffList]);

  const activeCount = staffList.filter((s) => s.isActive).length;

  const handleToggleActive = async (id: string) => {
    const member = staffList.find((s) => s.id === id);
    if (!member) return;
    // Optimistic update
    setStaffList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive: !s.isActive } : s))
    );
    try {
      const res = await fetch(`/api/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !member.isActive }),
      });
      if (!res.ok) fetchStaff(); // revert on failure
    } catch {
      fetchStaff();
    }
  };

  const handleSave = async (data: Omit<StaffMember, "id" | "createdAt"> & { id?: string }) => {
    if (data.id) {
      // Update existing
      setStaffList((prev) =>
        prev.map((s) => s.id === data.id ? { ...s, ...data } as StaffMember : s)
      );
      try {
        await fetch(`/api/staff/${data.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: data.firstName,
            last_name: data.lastName,
            role: data.role,
            npi_number: data.npi || null,
          }),
        });
      } catch {
        fetchStaff();
      }
    } else {
      // Create new
      try {
        const res = await fetch("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: data.firstName,
            last_name: data.lastName,
            role: data.role,
            npi_number: data.npi || null,
          }),
        });
        if (res.ok) {
          fetchStaff(); // reload to get server-generated ID
        }
      } catch {
        // silent
      }
    }
  };

  // --- Auth user linking ---
  const [linkingStaffId, setLinkingStaffId] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkResults, setLinkResults] = useState<{ id: string; email: string }[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);

  const handleSearchAuthUsers = async () => {
    if (!linkEmail.trim()) return;
    setLinkSearching(true);
    try {
      const res = await fetch(`/api/staff/auth-users?email=${encodeURIComponent(linkEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setLinkResults(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ } finally {
      setLinkSearching(false);
    }
  };

  const handleLinkUser = async (staffId: string, authUserId: string) => {
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: authUserId }),
      });
      if (res.ok) {
        setLinkingStaffId(null);
        setLinkEmail("");
        setLinkResults([]);
        fetchStaff();
      }
    } catch { /* silent */ }
  };

  const handleUnlinkUser = async (staffId: string) => {
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "" }),
      });
      if (res.ok) fetchStaff();
    } catch { /* silent */ }
  };

  const openAdd = () => { setEditingMember(null); setDialogOpen(true); };
  const openEdit = (m: StaffMember) => { setEditingMember(m); setDialogOpen(true); };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-body text-[var(--text-secondary)]">
          {staffList.length} staff members &middot; {activeCount} active
        </p>
        <Button variant="default" size="sm" onClick={openAdd}>
          + Add Staff
        </Button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, email, or role…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md px-4 h-11 rounded-xl text-sm glass-input"
      />

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left px-5 py-3.5 text-overline w-12" />
                <th className="text-left px-4 py-3.5 text-overline whitespace-nowrap">Name</th>
                <th className="text-left px-4 py-3.5 text-overline">Email</th>
                <th className="text-left px-4 py-3.5 text-overline whitespace-nowrap">Phone</th>
                <th className="text-left px-4 py-3.5 text-overline">Role</th>
                <th className="text-left px-4 py-3.5 text-overline">Status</th>
                <th className="text-left px-4 pr-5 py-3.5 text-overline" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((member) => (
                <tr
                  key={member.id}
                  className="hover-row border-t border-[var(--border-subtle)]"
                >
                  {/* Avatar */}
                  <td className="pl-5 py-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-mono border"
                      style={member.isActive ? {
                        background: ROLE_COLORS[member.role].bg,
                        color: ROLE_COLORS[member.role].text,
                        borderColor: ROLE_COLORS[member.role].border,
                      } : {
                        background: "var(--bg-elevated)",
                        color: "var(--text-muted)",
                        borderColor: "var(--border-subtle)",
                      }}
                    >
                      {member.firstName[0]}{member.lastName[0]}
                    </div>
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`font-semibold ${member.isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                      {member.lastName}, {member.firstName}
                    </span>
                  </td>

                  {/* Email */}
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {member.email}
                  </td>

                  {/* Phone */}
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                    {member.phone ?? <span className="text-[var(--text-muted)]">—</span>}
                  </td>

                  {/* Role badge */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span
                        className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border w-fit"
                        style={{
                          background: ROLE_COLORS[member.role].bg,
                          color: member.isActive ? ROLE_COLORS[member.role].text : "var(--text-muted)",
                          borderColor: ROLE_COLORS[member.role].border,
                        }}
                      >
                        {ROLE_LABEL[member.role]}
                      </span>
                      {member.clinicalRole && (
                        <span className="text-[10px] text-[var(--text-muted)] pl-0.5">
                          + {ROLE_LABEL[member.clinicalRole]}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <Badge variant={member.isActive ? "default" : "secondary"}>
                        {member.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {member.userId ? (
                        <span className="text-[10px] text-[var(--accent)] font-medium">Linked</span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">No login</span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 pr-5 py-3">
                    <div className="flex items-center gap-2">
                      {/* Edit */}
                      <button
                        onClick={() => openEdit(member)}
                        title="Edit"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-glass)] transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {/* Link / Unlink auth user */}
                      {member.userId ? (
                        <button
                          onClick={() => handleUnlinkUser(member.id)}
                          title="Unlink auth user"
                          className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors whitespace-nowrap text-orange-500 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                        >
                          Unlink
                        </button>
                      ) : (
                        <button
                          onClick={() => { setLinkingStaffId(member.id); setLinkEmail(""); setLinkResults([]); }}
                          title="Link to auth user"
                          className="text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors whitespace-nowrap text-[var(--accent)] border-[var(--accent)] hover:bg-[var(--accent-dim)]"
                        >
                          Link User
                        </button>
                      )}
                      {/* Toggle active */}
                      <button
                        onClick={() => handleToggleActive(member.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors whitespace-nowrap ${
                          member.isActive
                            ? "text-[var(--text-muted)] border-[var(--border-subtle)] hover-btn"
                            : "text-[var(--accent)] border-[var(--accent)] hover:bg-[var(--accent-dim)]"
                        }`}
                      >
                        {member.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-caption text-[var(--text-muted)]">
                    {search ? `No staff members match "${search}"` : "No staff members yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <StaffFormDialog
        open={dialogOpen}
        member={editingMember}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />

      {/* Link Auth User Dialog */}
      <Dialog open={linkingStaffId !== null} onOpenChange={(open) => { if (!open) setLinkingStaffId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Auth User</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Search by email to find an existing Supabase Auth user and link them to this staff record.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Search by email…"
              value={linkEmail}
              onChange={(e) => setLinkEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearchAuthUsers(); }}
              className="flex-1 px-3 h-10 rounded-lg text-sm glass-input"
            />
            <Button size="sm" onClick={handleSearchAuthUsers} disabled={linkSearching || !linkEmail.trim()}>
              {linkSearching ? "Searching…" : "Search"}
            </Button>
          </div>
          {linkResults.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--border-subtle)] border border-[var(--border-default)] rounded-lg overflow-hidden">
              {linkResults.map((user) => (
                <li key={user.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-[var(--bg-glass)] transition-colors">
                  <span className="text-sm text-[var(--text-primary)]">{user.email}</span>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => linkingStaffId && handleLinkUser(linkingStaffId, user.id)}
                  >
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {linkResults.length === 0 && linkEmail && !linkSearching && (
            <p className="mt-3 text-xs text-[var(--text-muted)] text-center">No results. Try a different email.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance & Audit Section
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user_id: string;
  staff_name: string | null;
  encounter_id: string | null;
  patient_id: string | null;
  action_type: string;
  resource_type: string;
  detail: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface AuditLogPage {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  per_page: number;
}

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "finalize", label: "Finalize" },
  { value: "ai_scribe_generated", label: "AI Scribe Generated" },
  { value: "ai_scribe_autofill", label: "AI Scribe Auto-Fill" },
  { value: "manual_edit", label: "Manual Edit" },
  { value: "phi_viewed", label: "PHI Viewed" },
];

function ComplianceSection() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const perPage = 25;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      if (actionFilter) params.set("action", actionFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);

      const res = await fetch(`/api/audit-logs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AuditLogPage = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / perPage);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    window.open(`/api/audit-logs/export?${params}`, "_blank");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-body text-[var(--text-secondary)]">
          HIPAA compliance audit trail. All clinical data access and modifications are logged.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-overline">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="px-3 h-10 rounded-xl text-sm bg-[var(--bg-glass)] border border-[var(--glass-border)] text-[var(--text-primary)] cursor-pointer"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-overline">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 h-10 rounded-xl text-sm glass-input"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-overline">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 h-10 rounded-xl text-sm glass-input"
          />
        </div>

        <Button variant="outline" size="sm" onClick={handleExport} className="h-10">
          Export CSV
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <p className="text-sm text-[var(--state-critical)]">Failed to load: {error}</p>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                <th className="text-left px-5 py-3.5 text-overline">Timestamp</th>
                <th className="text-left px-4 py-3.5 text-overline">User</th>
                <th className="text-left px-4 py-3.5 text-overline">Action</th>
                <th className="text-left px-4 py-3.5 text-overline">Resource</th>
                <th className="text-left px-4 py-3.5 text-overline">Detail</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-caption text-[var(--text-muted)]">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-caption text-[var(--text-muted)]">
                    No audit logs found for the selected filters.
                  </td>
                </tr>
              )}
              {!loading && logs.map((log) => {
                const isAi = log.action_type.startsWith("ai_scribe");
                return (
                  <tr key={log.id} className="hover-row border-t border-[var(--border-subtle)]">
                    <td className="px-5 py-3 whitespace-nowrap text-[var(--text-secondary)]">
                      {new Date(log.timestamp).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
                      })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[var(--text-primary)] font-medium">
                      {log.staff_name ?? "System"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={isAi ? "default" : "secondary"}>
                        {isAi && "AI "}{ACTION_OPTIONS.find((a) => a.value === log.action_type)?.label ?? log.action_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {log.resource_type}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] max-w-xs truncate">
                      {log.detail ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            {total} total entries &middot; Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const { requireRole } = useEntitlements();
  const [activeSection, setActiveSection] = useState<SectionKey>("general");
  const setSubtitle = usePageHeaderStore((s) => s.setSubtitle);

  useEffect(() => {
    setSubtitle("Clinic settings");
    return () => setSubtitle(null);
  }, [setSubtitle]);

  // Gate: admin/owner only
  if (!requireRole("admin", "owner")) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center glass-card p-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="3" y="8" width="14" height="10" rx="2" stroke="var(--text-muted)" strokeWidth="1.4" />
              <path d="M6 8V6a4 4 0 018 0v2" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-subhead mb-2">Admin Access Required</h2>
          <p className="text-caption text-[var(--text-muted)]">
            Only administrators and owners can access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 stagger">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
        {/* Section nav */}
        <nav className="flex flex-row flex-wrap gap-1 lg:flex-col lg:w-44 lg:flex-shrink-0">
          {SECTIONS.map((section) => {
            const active = activeSection === section.key;
            return (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`flex items-center gap-2 px-3 py-2 lg:gap-3 lg:px-4 lg:py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  active
                    ? "bg-[var(--accent-dim)] text-[var(--accent)] border-l-2 border-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-glass)]"
                }`}
              >
                {section.icon}
                {section.label}
              </button>
            );
          })}
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0">
          {activeSection === "general" && <GeneralSettingsSection />}
          {activeSection === "staff" && <StaffManagementSection />}
          {activeSection === "compliance" && <ComplianceSection />}
        </div>
      </div>
    </div>
  );
}
