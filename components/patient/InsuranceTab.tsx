"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePayerStore } from "@/store/payerStore";
import type { PatientInsurance } from "@/types/billing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InsuranceFormData {
  payer_id: string;
  plan_type: "medical" | "vision" | "other";
  priority: "primary" | "secondary";
  subscriber_id: string;
  group_number: string;
  plan_name: string;
  relationship_to_subscriber: "self" | "spouse" | "child" | "other";
  subscriber_name: string;
  subscriber_dob: string;
  // Phase 10.1 new fields
  copay_amount: number | null;
  eligibility_status: string;
  eligibility_verified_date: string | null;
  auth_number: string | null;
  auth_expiry: string | null;
  auth_services: string | null;
  is_active: boolean;
}

const EMPTY_FORM: InsuranceFormData = {
  payer_id: "",
  plan_type: "vision",
  priority: "primary",
  subscriber_id: "",
  group_number: "",
  plan_name: "",
  relationship_to_subscriber: "self",
  subscriber_name: "",
  subscriber_dob: "",
  copay_amount: null,
  eligibility_status: "unknown",
  eligibility_verified_date: null,
  auth_number: null,
  auth_expiry: null,
  auth_services: null,
  is_active: true,
};

// ---------------------------------------------------------------------------
// EligibilityBadge
// ---------------------------------------------------------------------------

const ELIGIBILITY_COLORS: Record<string, string> = {
  active: "bg-emerald-400",
  inactive: "bg-red-400",
  pending_verification: "bg-yellow-400",
  expired: "bg-orange-400",
  unknown: "bg-gray-400",
};

const ELIGIBILITY_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  pending_verification: "Pending",
  expired: "Expired",
  unknown: "Unknown",
};

function EligibilityBadge({
  status,
  verifiedDate,
}: {
  status: string | null;
  verifiedDate: string | null;
}) {
  const resolvedStatus = status ?? "unknown";
  const isStale = verifiedDate
    ? Date.now() - new Date(verifiedDate).getTime() > 30 * 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${ELIGIBILITY_COLORS[resolvedStatus] ?? "bg-gray-400"}`}
      />
      <span className="text-[13px] font-medium">
        {ELIGIBILITY_LABELS[resolvedStatus] ?? resolvedStatus}
      </span>
      {verifiedDate && (
        <span
          className={`text-[11px] ${isStale ? "text-orange-400" : "text-[var(--text-muted)]"}`}
        >
          {isStale && "⚠ "}verified {verifiedDate}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InsuranceTab Component
// ---------------------------------------------------------------------------

export function InsuranceTab({ patientId }: { patientId: string }) {
  const [insurance, setInsurance] = useState<PatientInsurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PatientInsurance | null>(
    null,
  );
  const [defaultPriority, setDefaultPriority] = useState<
    "primary" | "secondary"
  >("primary");

  const { payers, loadPayers } = usePayerStore();

  useEffect(() => {
    if (payers.length === 0) {
      loadPayers();
    }
  }, [payers.length, loadPayers]);

  const fetchInsurance = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/insurance`);
      if (!res.ok) throw new Error("Failed to load insurance records");
      const data = await res.json();
      setInsurance(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsurance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Active/inactive split
  const activeInsurance = insurance.filter((r) => r.is_active);
  const inactiveInsurance = insurance.filter((r) => !r.is_active);

  const primary = activeInsurance.find((i) => i.priority === "primary") ?? null;
  const secondary =
    activeInsurance.find((i) => i.priority === "secondary") ?? null;

  const openAdd = (priority: "primary" | "secondary") => {
    setEditingRecord(null);
    setDefaultPriority(priority);
    setModalOpen(true);
  };

  const openEdit = (record: PatientInsurance) => {
    setEditingRecord(record);
    setDefaultPriority(record.priority);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this insurance record?")) return;
    try {
      const res = await fetch(`/api/patients/${patientId}/insurance/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove insurance");
      await fetchInsurance();
    } catch (e) {
      alert(String(e));
    }
  };

  const handleSubmit = async (formData: InsuranceFormData) => {
    try {
      const payload = {
        ...formData,
        priority: editingRecord ? editingRecord.priority : defaultPriority,
      };

      if (editingRecord) {
        const res = await fetch(
          `/api/patients/${patientId}/insurance/${editingRecord.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) throw new Error("Failed to update insurance");
      } else {
        const res = await fetch(`/api/patients/${patientId}/insurance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Failed to create insurance");
      }

      setModalOpen(false);
      setEditingRecord(null);
      await fetchInsurance();
    } catch (e) {
      alert(String(e));
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="glass-card p-6 rounded-2xl animate-pulse h-48"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-body text-red-400 mb-4">{error}</p>
        <Button variant="outline" onClick={fetchInsurance}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Insurance Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Primary Insurance */}
        {primary ? (
          <InsuranceRecordCard
            record={primary}
            onEdit={() => openEdit(primary)}
            onDelete={() => handleDelete(primary.id)}
            payers={payers}
          />
        ) : (
          <EmptyInsuranceCard
            label="Primary Insurance"
            onAdd={() => openAdd("primary")}
          />
        )}

        {/* Secondary Insurance */}
        {secondary ? (
          <InsuranceRecordCard
            record={secondary}
            onEdit={() => openEdit(secondary)}
            onDelete={() => handleDelete(secondary.id)}
            payers={payers}
          />
        ) : (
          <EmptyInsuranceCard
            label="Secondary Insurance"
            onAdd={() => openAdd("secondary")}
          />
        )}
      </div>

      {/* Past Insurance Section */}
      {inactiveInsurance.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">
            Past Insurance
          </h3>
          <div className="space-y-3 opacity-60">
            {inactiveInsurance.map((ins) => (
              <InsuranceRecordCard
                key={ins.id}
                record={ins}
                onEdit={() => openEdit(ins)}
                onDelete={() => handleDelete(ins.id)}
                payers={payers}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <InsuranceFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRecord(null);
        }}
        onSubmit={handleSubmit}
        editingRecord={editingRecord}
        defaultPriority={defaultPriority}
        payers={payers}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insurance Record Card — 4 grouped sections
// ---------------------------------------------------------------------------

function InsuranceRecordCard({
  record,
  onEdit,
  onDelete,
  payers,
}: {
  record: PatientInsurance;
  onEdit: () => void;
  onDelete: () => void;
  payers: import("@/types/billing").InsurancePayer[];
}) {
  const payerName =
    record.payer?.name ??
    payers.find((p) => p.id === record.payer_id)?.name ??
    "Unknown Payer";

  const showSubscriber = record.relationship_to_subscriber !== "self";

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        {/* Section 1 — Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                record.priority === "primary"
                  ? "bg-teal-500/20 text-teal-300 border-teal-500/30"
                  : "bg-purple-500/20 text-purple-300 border-purple-500/30"
              }`}
            >
              {record.priority === "primary" ? "Primary" : "Secondary"}
            </span>
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              {payerName}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!record.is_active && (
              <span className="text-[11px] text-[var(--text-muted)] border border-[var(--border-default)] px-2 py-0.5 rounded-md mr-1">
                Inactive
              </span>
            )}
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Section 2 — Plan Info */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
            Plan Info
          </p>
          <div className="grid grid-cols-2 gap-3">
            <InsuranceCell
              label="Plan Type"
              value={formatPlanType(record.plan_type)}
            />
            <InsuranceCell label="Subscriber ID" value={record.subscriber_id} />
            <InsuranceCell
              label="Group Number"
              value={record.group_number}
            />
            {record.plan_name && (
              <InsuranceCell label="Plan Name" value={record.plan_name} />
            )}
          </div>
        </div>

        {/* Section 3 — Coverage */}
        <div className="mt-3 pt-3 border-t border-[var(--border-default)]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
            Coverage
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-caption text-[var(--text-muted)]">Copay</p>
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                {record.copay_amount != null
                  ? `$${record.copay_amount.toFixed(2)}`
                  : "Not set"}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)]">
                Eligibility
              </p>
              <EligibilityBadge
                status={record.eligibility_status}
                verifiedDate={record.eligibility_verified_date}
              />
            </div>
            {record.auth_number && (
              <>
                <div>
                  <p className="text-caption text-[var(--text-muted)]">
                    Auth #
                  </p>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">
                    {record.auth_number}
                  </p>
                </div>
                <div>
                  <p className="text-caption text-[var(--text-muted)]">
                    Auth Expires
                  </p>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">
                    {record.auth_expiry ?? "No expiry"}
                  </p>
                </div>
              </>
            )}
            {record.auth_services && (
              <div className="col-span-2">
                <p className="text-caption text-[var(--text-muted)]">
                  Authorized Services
                </p>
                <p className="text-[13px] font-medium text-[var(--text-primary)]">
                  {record.auth_services}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Section 4 — Subscriber (shown only when not self) */}
        {showSubscriber && (
          <div className="mt-3 pt-3 border-t border-[var(--border-default)]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">
              Subscriber
            </p>
            <div className="grid grid-cols-2 gap-3">
              <InsuranceCell
                label="Relationship"
                value={formatRelationship(record.relationship_to_subscriber)}
              />
              {record.subscriber_name && (
                <InsuranceCell
                  label="Subscriber Name"
                  value={record.subscriber_name}
                />
              )}
              {record.subscriber_dob && (
                <InsuranceCell
                  label="Subscriber DOB"
                  value={record.subscriber_dob}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsuranceCell({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-caption text-[var(--text-muted)]">{label}</p>
      <p className="text-[13px] font-medium text-[var(--text-primary)]">
        {value || "--"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty Insurance Card
// ---------------------------------------------------------------------------

function EmptyInsuranceCard({
  label,
  onAdd,
}: {
  label: string;
  onAdd: () => void;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-5 flex flex-col items-center justify-center min-h-[160px] gap-3">
        <p className="text-body text-[var(--text-muted)]">No {label} on file</p>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-caption text-[var(--accent)] hover:bg-[var(--accent-dim)] px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add {label}
        </button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Insurance Form Modal — 3 sections with dividers
// ---------------------------------------------------------------------------

function InsuranceFormModal({
  open,
  onClose,
  onSubmit,
  editingRecord,
  defaultPriority,
  payers,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: InsuranceFormData) => Promise<void>;
  editingRecord: PatientInsurance | null;
  defaultPriority: "primary" | "secondary";
  payers: import("@/types/billing").InsurancePayer[];
}) {
  const [form, setForm] = useState<InsuranceFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Sync form when editing record changes
  useEffect(() => {
    if (editingRecord) {
      setForm({
        payer_id: editingRecord.payer_id,
        plan_type: editingRecord.plan_type,
        priority: editingRecord.priority,
        subscriber_id: editingRecord.subscriber_id ?? "",
        group_number: editingRecord.group_number ?? "",
        plan_name: editingRecord.plan_name ?? "",
        relationship_to_subscriber: editingRecord.relationship_to_subscriber,
        subscriber_name: editingRecord.subscriber_name ?? "",
        subscriber_dob: editingRecord.subscriber_dob ?? "",
        copay_amount: editingRecord.copay_amount,
        eligibility_status: editingRecord.eligibility_status ?? "unknown",
        eligibility_verified_date: editingRecord.eligibility_verified_date,
        auth_number: editingRecord.auth_number,
        auth_expiry: editingRecord.auth_expiry,
        auth_services: editingRecord.auth_services,
        is_active: editingRecord.is_active,
      });
    } else {
      setForm({ ...EMPTY_FORM, priority: defaultPriority });
    }
  }, [editingRecord, defaultPriority, open]);

  const setField = <K extends keyof InsuranceFormData>(
    key: K,
    value: InsuranceFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  };

  const showSubscriberFields = form.relationship_to_subscriber !== "self";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <DialogHeader>
          <DialogTitle>
            {editingRecord
              ? "Edit Insurance"
              : `Add ${defaultPriority === "primary" ? "Primary" : "Secondary"} Insurance`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-7 py-4 space-y-5 overflow-y-auto max-h-[60vh]">
            {/* ---- Section: Plan Information ---- */}
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">
                Plan Information
              </p>

              {/* Payer dropdown */}
              <div className="space-y-2 mb-4">
                <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                  Insurance Payer
                </label>
                <select
                  value={form.payer_id}
                  onChange={(e) => setField("payer_id", e.target.value)}
                  required
                  aria-label="Insurance Payer"
                  className="glass-input w-full text-body h-11 px-4 rounded-xl"
                >
                  <option value="">Select payer...</option>
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Plan Type */}
              <div className="space-y-2 mb-4">
                <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                  Plan Type
                </label>
                <select
                  value={form.plan_type}
                  onChange={(e) =>
                    setField(
                      "plan_type",
                      e.target.value as InsuranceFormData["plan_type"],
                    )
                  }
                  aria-label="Plan Type"
                  className="glass-input w-full text-body h-11 px-4 rounded-xl"
                >
                  <option value="vision">Vision</option>
                  <option value="medical">Medical</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Priority (read-only) */}
              <div className="space-y-2 mb-4">
                <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                  Priority
                </label>
                <p className="text-body text-[var(--text-primary)] capitalize">
                  {editingRecord ? editingRecord.priority : defaultPriority}
                </p>
              </div>

              {/* Subscriber ID + Group Number */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="space-y-2">
                  <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                    Subscriber ID
                  </label>
                  <input
                    type="text"
                    value={form.subscriber_id}
                    onChange={(e) => setField("subscriber_id", e.target.value)}
                    placeholder="Member ID"
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                    Group Number
                  </label>
                  <input
                    type="text"
                    value={form.group_number}
                    onChange={(e) => setField("group_number", e.target.value)}
                    placeholder="Group #"
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                  />
                </div>
              </div>

              {/* Plan Name */}
              <div className="space-y-2">
                <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                  Plan Name
                </label>
                <input
                  type="text"
                  value={form.plan_name}
                  onChange={(e) => setField("plan_name", e.target.value)}
                  placeholder="e.g. VSP Choice Plan"
                  className="glass-input w-full text-body h-11 px-4 rounded-xl"
                />
              </div>
            </div>

            {/* ---- Section: Coverage Details ---- */}
            <div className="mb-4 pt-4 border-t border-[var(--border-default)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">
                Coverage Details
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                    Copay Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                    value={form.copay_amount ?? ""}
                    onChange={(e) =>
                      setField(
                        "copay_amount",
                        e.target.value ? parseFloat(e.target.value) : null,
                      )
                    }
                    placeholder="e.g. 25.00"
                  />
                </div>
                <div>
                  <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                    Eligibility Status
                  </label>
                  <select
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                    aria-label="Eligibility Status"
                    value={form.eligibility_status}
                    onChange={(e) =>
                      setField("eligibility_status", e.target.value)
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="pending_verification">
                      Pending Verification
                    </option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                <div>
                  <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                    Eligibility Verified Date
                  </label>
                  <input
                    type="date"
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                    value={form.eligibility_verified_date ?? ""}
                    onChange={(e) =>
                      setField(
                        "eligibility_verified_date",
                        e.target.value || null,
                      )
                    }
                  />
                </div>
                <div /> {/* spacer for alignment */}
                <div>
                  <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                    Auth Number
                  </label>
                  <input
                    type="text"
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                    value={form.auth_number ?? ""}
                    onChange={(e) =>
                      setField("auth_number", e.target.value || null)
                    }
                    placeholder="Authorization #"
                  />
                </div>
                <div>
                  <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                    Auth Expiry
                  </label>
                  <input
                    type="date"
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                    value={form.auth_expiry ?? ""}
                    onChange={(e) =>
                      setField("auth_expiry", e.target.value || null)
                    }
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                    Authorized Services
                  </label>
                  <input
                    type="text"
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                    value={form.auth_services ?? ""}
                    onChange={(e) =>
                      setField("auth_services", e.target.value || null)
                    }
                    placeholder='e.g. "6 visits" or "contact lens fitting"'
                  />
                </div>
              </div>
            </div>

            {/* ---- Section: Subscriber Info ---- */}
            <div className="mb-4 pt-4 border-t border-[var(--border-default)]">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-3">
                Subscriber Info
              </p>

              {/* Relationship to Subscriber */}
              <div className="space-y-2 mb-4">
                <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                  Relationship to Subscriber
                </label>
                <select
                  value={form.relationship_to_subscriber}
                  onChange={(e) =>
                    setField(
                      "relationship_to_subscriber",
                      e.target.value as InsuranceFormData["relationship_to_subscriber"],
                    )
                  }
                  aria-label="Relationship to Subscriber"
                  className="glass-input w-full text-body h-11 px-4 rounded-xl"
                >
                  <option value="self">Self</option>
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Subscriber Name + DOB (shown when not self) */}
              {showSubscriberFields && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                      Subscriber Name
                    </label>
                    <input
                      type="text"
                      value={form.subscriber_name}
                      onChange={(e) =>
                        setField("subscriber_name", e.target.value)
                      }
                      placeholder="Full name"
                      className="glass-input w-full text-body h-11 px-4 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                      Subscriber DOB
                    </label>
                    <input
                      type="date"
                      value={form.subscriber_dob}
                      onChange={(e) =>
                        setField("subscriber_dob", e.target.value)
                      }
                      aria-label="Subscriber Date of Birth"
                      className="glass-input w-full text-body h-11 px-4 rounded-xl"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ---- Active Toggle ---- */}
            <div className="pt-4 border-t border-[var(--border-default)]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setField("is_active", e.target.checked)}
                  className="rounded border-[var(--border-default)]"
                />
                <span className="text-[13px]">Active insurance</span>
              </label>
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                Inactive records will be moved to Past Insurance.
              </p>
            </div>
          </div>

          <DialogFooter className="py-5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{
                background: "var(--bg-glass)",
                color: "var(--text-secondary)",
                border: "1px solid var(--glass-border)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.payer_id}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
              }}
            >
              {saving ? (
                <span
                  className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                  aria-hidden
                />
              ) : null}
              {editingRecord ? "Save Changes" : "Add Insurance"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPlanType(type: string): string {
  switch (type) {
    case "medical":
      return "Medical";
    case "vision":
      return "Vision";
    default:
      return "Other";
  }
}

function formatRelationship(rel: string): string {
  switch (rel) {
    case "self":
      return "Self";
    case "spouse":
      return "Spouse";
    case "child":
      return "Child";
    default:
      return "Other";
  }
}
