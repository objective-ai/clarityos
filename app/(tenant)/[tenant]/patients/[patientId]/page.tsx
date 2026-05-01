"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Lock, Pencil, X, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import dynamic from "next/dynamic";
import { usePatientStore } from "@/store/patientStore";
import type { PatientDetail, PatientUpdatePayload } from "@/types/patient";
import { formatClinicDate } from "@/lib/timezone";

const EncounterTimeline = dynamic(
  () => import("@/components/patient/EncounterTimeline").then((m) => ({ default: m.EncounterTimeline })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const ClinicalFlowsheet = dynamic(
  () => import("@/components/patient/ClinicalFlowsheet").then((m) => ({ default: m.ClinicalFlowsheet })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const RxHistoryTable = dynamic(
  () => import("@/components/patient/RxHistoryTable").then((m) => ({ default: m.RxHistoryTable })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const ProblemListCard = dynamic(
  () => import("@/components/patient/ProblemListCard").then((m) => ({ default: m.ProblemListCard })),
  { loading: () => <div className="animate-pulse h-32 bg-white/5 rounded-xl" />, ssr: false },
);
const PrepMeButton = dynamic(
  () => import("@/components/patient/PrepMeButton").then((m) => ({ default: m.PrepMeButton })),
  { loading: () => <div className="animate-pulse h-10 w-24 bg-white/5 rounded-xl" />, ssr: false },
);
const InsuranceTab = dynamic(
  () => import("@/components/patient/InsuranceTab").then((m) => ({ default: m.InsuranceTab })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const PatientBillingTab = dynamic(
  () => import("@/components/patient/PatientBillingTab").then((m) => ({ default: m.PatientBillingTab })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);
const MessagesTab = dynamic(
  () => import("@/components/patients/MessagesTab").then((m) => ({ default: m.MessagesTab })),
  { loading: () => <div className="animate-pulse h-48 bg-white/5 rounded-xl" />, ssr: false },
);

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabKey = "demographics" | "encounters" | "flowsheets" | "rx-history" | "insurance" | "billing" | "messages";

const TABS: { key: TabKey; label: string }[] = [
  { key: "demographics", label: "Patient Info" },
  { key: "encounters", label: "Encounters" },
  { key: "flowsheets", label: "Flowsheets" },
  { key: "rx-history", label: "Rx History" },
  { key: "insurance", label: "Insurance" },
  { key: "billing", label: "Billing" },
  { key: "messages", label: "Messages" },
];

// ---------------------------------------------------------------------------
// Editable section hook
// ---------------------------------------------------------------------------

function useEditableSection<T extends Record<string, unknown>>(
  initialValues: T,
  patientId: string,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(initialValues);
  const [saving, setSaving] = useState(false);
  const updatePatient = usePatientStore((s) => s.updatePatient);

  // Stable serialized key so useEffect doesn't loop on object identity
  const valuesKey = JSON.stringify(initialValues);

  // Sync draft when patient data changes externally
  useEffect(() => {
    if (!editing) setDraft(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, editing]);

  const startEdit = useCallback(() => {
    setDraft(initialValues);
    setEditing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey]);

  const cancel = useCallback(() => setEditing(false), []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updatePatient(patientId, draft as unknown as PatientUpdatePayload);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [updatePatient, patientId, draft]);

  const setField = useCallback(
    <K extends keyof T>(key: K, value: T[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    [],
  );

  return { editing, draft, saving, startEdit, cancel, save, setField };
}

// ---------------------------------------------------------------------------
// Section header with edit/save/cancel controls
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  editing,
  saving,
  onEdit,
  onSave,
  onCancel,
}: {
  icon?: React.ReactNode;
  title: string;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-subhead flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={onCancel}
            disabled={saving}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--mono-border)] transition-colors"
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
            title="Save"
          >
            {saving ? (
              <div className="h-4 w-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </button>
        </div>
      ) : (
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editable field helpers
// ---------------------------------------------------------------------------

function EditableInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-caption text-[var(--text-muted)]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="glass-input w-full text-body"
      />
    </div>
  );
}

function EditableSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-caption text-[var(--text-muted)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="glass-input w-full text-body"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Patient Info tab (formerly Demographics)
// ---------------------------------------------------------------------------

function DemographicsTab({ patient, patientId }: { patient: PatientDetail; patientId: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ContactInfoCard patient={patient} patientId={patientId} />
        <EmergencyContactCard patient={patient} patientId={patientId} />
        <NotesCard patient={patient} patientId={patientId} />
      </div>
      {/* Active problems — spans full width */}
      <ProblemListCard patientId={patientId} />
    </div>
  );
}

// --- Contact Info Card ---

function ContactInfoCard({ patient, patientId }: { patient: PatientDetail; patientId: string }) {
  const { editing, draft, saving, startEdit, cancel, save, setField } =
    useEditableSection(
      {
        phone: patient.phone ?? "",
        email: patient.email ?? "",
        addressLine1: patient.addressLine1 ?? "",
        addressLine2: patient.addressLine2 ?? "",
        city: patient.city ?? "",
        state: patient.state ?? "",
        zipCode: patient.zipCode ?? "",
      },
      patientId,
    );

  const icon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5" r="3" stroke="var(--text-muted)" strokeWidth="1.2" />
      <path d="M2 14c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <SectionHeader
          icon={icon}
          title="Contact Information"
          editing={editing}
          saving={saving}
          onEdit={startEdit}
          onSave={save}
          onCancel={cancel}
        />
        {editing ? (
          <div className="space-y-3">
            <EditableInput label="Phone" value={draft.phone} onChange={(v) => setField("phone", v)} type="tel" />
            <EditableInput label="Email" value={draft.email} onChange={(v) => setField("email", v)} type="email" />
            <EditableInput label="Address Line 1" value={draft.addressLine1} onChange={(v) => setField("addressLine1", v)} />
            <EditableInput label="Address Line 2" value={draft.addressLine2} onChange={(v) => setField("addressLine2", v)} />
            <div className="grid grid-cols-3 gap-3">
              <EditableInput label="City" value={draft.city} onChange={(v) => setField("city", v)} />
              <EditableInput label="State" value={draft.state} onChange={(v) => setField("state", v)} />
              <EditableInput label="ZIP" value={draft.zipCode} onChange={(v) => setField("zipCode", v)} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <InfoRow label="Phone" value={patient.phone} />
            <InfoRow label="Email" value={patient.email} />
            <InfoRow label="Address" value={formatAddress(patient)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Emergency Contact Card ---

function EmergencyContactCard({ patient, patientId }: { patient: PatientDetail; patientId: string }) {
  const { editing, draft, saving, startEdit, cancel, save, setField } =
    useEditableSection(
      {
        emergencyContactName: patient.emergencyContactName ?? "",
        emergencyContactPhone: patient.emergencyContactPhone ?? "",
        emergencyContactRelation: patient.emergencyContactRelation ?? "",
      },
      patientId,
    );

  const icon = (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2v12M2 8h12" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <SectionHeader
          icon={icon}
          title="Emergency Contact"
          editing={editing}
          saving={saving}
          onEdit={startEdit}
          onSave={save}
          onCancel={cancel}
        />
        {editing ? (
          <div className="space-y-3">
            <EditableInput label="Name" value={draft.emergencyContactName} onChange={(v) => setField("emergencyContactName", v)} />
            <EditableInput label="Phone" value={draft.emergencyContactPhone} onChange={(v) => setField("emergencyContactPhone", v)} type="tel" />
            <EditableInput label="Relation" value={draft.emergencyContactRelation} onChange={(v) => setField("emergencyContactRelation", v)} />
          </div>
        ) : (
          <div className="space-y-3">
            <InfoRow label="Name" value={patient.emergencyContactName} />
            <InfoRow label="Phone" value={patient.emergencyContactPhone} />
            <InfoRow label="Relation" value={patient.emergencyContactRelation} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Notes Card ---

function NotesCard({ patient, patientId }: { patient: PatientDetail; patientId: string }) {
  const { editing, draft, saving, startEdit, cancel, save, setField } =
    useEditableSection({ notes: patient.notes ?? "" }, patientId);

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <SectionHeader
          title="Notes"
          editing={editing}
          saving={saving}
          onEdit={startEdit}
          onSave={save}
          onCancel={cancel}
        />
        {editing ? (
          <textarea
            value={draft.notes}
            onChange={(e) => setField("notes", e.target.value)}
            rows={4}
            placeholder="Patient notes..."
            className="glass-input w-full text-body resize-y"
          />
        ) : (
          <p className="text-body text-[var(--text-secondary)] whitespace-pre-wrap">
            {patient.notes || "--"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-caption text-[var(--text-muted)] shrink-0">{label}</span>
      <span className="text-body text-[var(--text-primary)] text-right">
        {value || "--"}
      </span>
    </div>
  );
}

function formatAddress(patient: PatientDetail): string | null {
  const parts = [
    patient.addressLine1,
    patient.addressLine2,
    [patient.city, patient.state].filter(Boolean).join(", "),
    patient.zipCode,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

// ---------------------------------------------------------------------------
// Patient Detail Page
// ---------------------------------------------------------------------------

export default function PatientDetailPage() {
  const { tenant, patientId } = useParams<{
    tenant: string;
    patientId: string;
  }>();
  const { has } = useEntitlements();
  const [activeTab, setActiveTab] = useState<TabKey>("demographics");

  const patient = usePatientStore((s) => s.activePatient);
  const loading = usePatientStore((s) => s.detailLoading);
  const error = usePatientStore((s) => s.detailError);
  const fetchPatient = usePatientStore((s) => s.fetchPatient);
  const clearActivePatient = usePatientStore((s) => s.clearActivePatient);

  useEffect(() => {
    if (patientId) {
      fetchPatient(patientId);
    }
    return () => clearActivePatient();
  }, [patientId, fetchPatient, clearActivePatient]);

  // Entitlement gate
  if (!has(Entitlement.PATIENT_DEMOGRAPHICS)) {
    const meta = ENTITLEMENT_META.patient_demographics;
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md text-center">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--accent-dim)] border border-[var(--mono-border)]">
              <Lock className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-heading mb-1">{meta.label}</h2>
              <p className="text-body">{meta.description}</p>
            </div>
            <Badge variant="default">{meta.plan} Plan</Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col gap-6 stagger">
        <Link
          href={`/${tenant}/patients`}
          className="flex items-center gap-1.5 text-caption text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All Patients
        </Link>
        <div className="glass-card p-8 text-center">
          <p className="text-body text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={() => fetchPatient(patientId)}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // No patient
  if (!patient) {
    return null;
  }

  const age = calculateAge(patient.dob);
  const dobFormatted = formatClinicDate(patient.dob);

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Back link */}
      <Link
        href={`/${tenant}/patients`}
        className="flex items-center gap-1.5 text-caption text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors w-fit"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All Patients
      </Link>

      {/* Patient header */}
      <PatientHeaderCard patient={patient} patientId={patientId} age={age} dobFormatted={dobFormatted} />

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--border-subtle)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-body font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "demographics" && <DemographicsTab patient={patient} patientId={patientId} />}
        {activeTab === "encounters" && (
          <EncounterTimeline patientId={patientId} />
        )}
        {activeTab === "flowsheets" && (
          <ClinicalFlowsheet patientId={patientId} />
        )}
        {activeTab === "rx-history" && (
          <RxHistoryTable patientId={patientId} />
        )}
        {activeTab === "insurance" && <InsuranceTab patientId={patientId} />}
        {activeTab === "billing" && <PatientBillingTab patientId={patientId} />}
        {activeTab === "messages" && (
          <MessagesTab patientId={patientId} patientFirstName={patient.firstName} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Patient Header Card (editable name, DOB, sex)
// ---------------------------------------------------------------------------

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

function PatientHeaderCard({
  patient,
  patientId,
  age,
  dobFormatted,
}: {
  patient: PatientDetail;
  patientId: string;
  age: number;
  dobFormatted: string;
}) {
  const { editing, draft, saving, startEdit, cancel, save, setField } =
    useEditableSection(
      {
        firstName: patient.firstName,
        lastName: patient.lastName,
        preferredName: patient.preferredName ?? "",
        dob: patient.dob,
        sex: patient.sex,
      },
      patientId,
    );

  return (
    <Card className="glass-card">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center text-heading font-semibold text-[var(--accent)]">
              {patient.firstName[0]}
              {patient.lastName[0]}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <EditableInput label="First Name" value={draft.firstName} onChange={(v) => setField("firstName", v)} />
                  <EditableInput label="Last Name" value={draft.lastName} onChange={(v) => setField("lastName", v)} />
                </div>
                <EditableInput label="Preferred Name" value={draft.preferredName} onChange={(v) => setField("preferredName", v)} placeholder="Nickname (optional)" />
                <div className="grid grid-cols-2 gap-3">
                  <EditableInput label="Date of Birth" value={draft.dob} onChange={(v) => setField("dob", v)} type="date" />
                  <EditableSelect label="Sex" value={draft.sex} onChange={(v) => setField("sex", v as typeof draft.sex)} options={SEX_OPTIONS} />
                </div>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={cancel}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-caption text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--mono-border)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-caption text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors flex items-center gap-1.5"
                  >
                    {saving ? (
                      <div className="h-3.5 w-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-display text-xl">
                    {patient.lastName}, {patient.firstName}
                    {patient.preferredName ? ` "${patient.preferredName}"` : ""}
                  </h1>
                  <button
                    onClick={startEdit}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-dim)] transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <Badge variant="outline">#{patient.chartNumber}</Badge>
                  <span className="text-body text-[var(--text-secondary)]">
                    {dobFormatted} ({age} y/o)
                  </span>
                  <Badge variant="outline">{sexLabel(patient.sex)}</Badge>
                  {patient.phone && (
                    <span className="text-body text-[var(--text-secondary)]">
                      {patient.phone}
                    </span>
                  )}
                  {patient.email && (
                    <span className="text-body text-[var(--text-muted)]">
                      {patient.email}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Alerts */}
        {patient.alerts.length > 0 && (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {patient.alerts.map((alert, i) => (
              <Badge
                key={i}
                variant={
                  alert.severity === "critical"
                    ? "destructive"
                    : alert.severity === "warning"
                    ? "warning"
                    : "info"
                }
              >
                {alert.label}
              </Badge>
            ))}
          </div>
        )}

        {/* Prep Me — inline AI pre-visit summary */}
        {!editing && <PrepMeButton patientId={patientId} />}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sexLabel(sex: string): string {
  switch (sex) {
    case "male": return "Male";
    case "female": return "Female";
    case "other": return "Other";
    default: return sex;
  }
}

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
