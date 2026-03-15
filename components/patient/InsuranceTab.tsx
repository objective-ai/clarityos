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
};

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

  const primary = insurance.find((i) => i.priority === "primary") ?? null;
  const secondary = insurance.find((i) => i.priority === "secondary") ?? null;

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Primary Insurance */}
        {primary ? (
          <InsuranceRecordCard
            record={primary}
            label="Primary"
            badgeClass="bg-teal-500/20 text-teal-300 border-teal-500/30"
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
            label="Secondary"
            badgeClass="bg-purple-500/20 text-purple-300 border-purple-500/30"
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
// Insurance Record Card
// ---------------------------------------------------------------------------

function InsuranceRecordCard({
  record,
  label,
  badgeClass,
  onEdit,
  onDelete,
  payers,
}: {
  record: PatientInsurance;
  label: string;
  badgeClass: string;
  onEdit: () => void;
  onDelete: () => void;
  payers: import("@/types/billing").InsurancePayer[];
}) {
  const payerName =
    record.payer?.name ??
    payers.find((p) => p.id === record.payer_id)?.name ??
    "Unknown Payer";

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-caption font-medium border ${badgeClass}`}
            >
              {label}
            </span>
            <h3 className="text-subhead mt-2">{payerName}</h3>
          </div>
          <div className="flex items-center gap-1">
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

        <div className="space-y-2">
          <InsuranceRow label="Plan Type" value={formatPlanType(record.plan_type)} />
          <InsuranceRow label="Subscriber ID" value={record.subscriber_id} />
          <InsuranceRow label="Group Number" value={record.group_number} />
          {record.plan_name && (
            <InsuranceRow label="Plan Name" value={record.plan_name} />
          )}
          <InsuranceRow
            label="Relationship"
            value={formatRelationship(record.relationship_to_subscriber)}
          />
          {record.subscriber_name && (
            <InsuranceRow
              label="Subscriber Name"
              value={record.subscriber_name}
            />
          )}
          {record.subscriber_dob && (
            <InsuranceRow
              label="Subscriber DOB"
              value={record.subscriber_dob}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InsuranceRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-caption text-[var(--text-muted)] shrink-0">
        {label}
      </span>
      <span className="text-body text-[var(--text-primary)] text-right">
        {value || "--"}
      </span>
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
// Insurance Form Modal
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
            {editingRecord ? "Edit Insurance" : `Add ${defaultPriority === "primary" ? "Primary" : "Secondary"} Insurance`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-7 py-4 space-y-5 overflow-y-auto max-h-[55vh]">
            {/* Payer dropdown */}
            <div className="space-y-2">
              <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                Insurance Payer
              </label>
              <select
                value={form.payer_id}
                onChange={(e) => setField("payer_id", e.target.value)}
                required
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
            <div className="space-y-2">
              <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                Plan Type
              </label>
              <select
                value={form.plan_type}
                onChange={(e) =>
                  setField("plan_type", e.target.value as InsuranceFormData["plan_type"])
                }
                className="glass-input w-full text-body h-11 px-4 rounded-xl"
              >
                <option value="vision">Vision</option>
                <option value="medical">Medical</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Priority (read-only) */}
            <div className="space-y-2">
              <label className="text-caption uppercase tracking-widest font-medium text-[var(--text-muted)]">
                Priority
              </label>
              <p className="text-body text-[var(--text-primary)] capitalize">
                {editingRecord ? editingRecord.priority : defaultPriority}
              </p>
            </div>

            {/* Subscriber ID + Group Number */}
            <div className="grid grid-cols-2 gap-3">
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

            {/* Relationship to Subscriber */}
            <div className="space-y-2">
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
                    onChange={(e) => setField("subscriber_name", e.target.value)}
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
                    onChange={(e) => setField("subscriber_dob", e.target.value)}
                    className="glass-input w-full text-body h-11 px-4 rounded-xl"
                  />
                </div>
              </div>
            )}
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
                <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
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
