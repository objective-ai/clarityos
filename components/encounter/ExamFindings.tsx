"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FindingCategory = "slit_lamp_anterior" | "fundus_posterior";

interface FindingField {
  key: string;
  label: string;
  type: "select" | "text";
  options?: string[];
  default: string;
}

interface FindingsData {
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Field definitions per category
// ---------------------------------------------------------------------------

const ANTERIOR_FIELDS: FindingField[] = [
  { key: "lids_od", label: "Lids OD", type: "select", options: ["Normal", "Blepharitis", "Chalazion", "Ptosis", "Other"], default: "Normal" },
  { key: "lids_os", label: "Lids OS", type: "select", options: ["Normal", "Blepharitis", "Chalazion", "Ptosis", "Other"], default: "Normal" },
  { key: "conjunctiva_od", label: "Conjunctiva OD", type: "select", options: ["White & quiet", "Injection", "Pinguecula", "Pterygium", "Other"], default: "White & quiet" },
  { key: "conjunctiva_os", label: "Conjunctiva OS", type: "select", options: ["White & quiet", "Injection", "Pinguecula", "Pterygium", "Other"], default: "White & quiet" },
  { key: "cornea_od", label: "Cornea OD", type: "select", options: ["Clear", "SPK", "Scar", "Edema", "Arcus", "Other"], default: "Clear" },
  { key: "cornea_os", label: "Cornea OS", type: "select", options: ["Clear", "SPK", "Scar", "Edema", "Arcus", "Other"], default: "Clear" },
  { key: "lens_od", label: "Lens OD", type: "select", options: ["Clear", "Trace cataract", "1+ NS", "2+ NS", "3+ NS", "PSC", "Cortical", "IOL"], default: "Clear" },
  { key: "lens_os", label: "Lens OS", type: "select", options: ["Clear", "Trace cataract", "1+ NS", "2+ NS", "3+ NS", "PSC", "Cortical", "IOL"], default: "Clear" },
  { key: "angles", label: "Angles", type: "select", options: ["Open (Grade 4)", "Grade 3", "Grade 2", "Narrow (Grade 1)", "Closed"], default: "Open (Grade 4)" },
  { key: "anterior_notes", label: "Notes", type: "text", default: "" },
];

const POSTERIOR_FIELDS: FindingField[] = [
  { key: "disc_od", label: "Disc OD", type: "select", options: ["Healthy, pink", "Pallor", "Edema", "Cupping 0.3", "Cupping 0.5", "Cupping 0.7", "Cupping 0.8+"], default: "Healthy, pink" },
  { key: "disc_os", label: "Disc OS", type: "select", options: ["Healthy, pink", "Pallor", "Edema", "Cupping 0.3", "Cupping 0.5", "Cupping 0.7", "Cupping 0.8+"], default: "Healthy, pink" },
  { key: "cd_ratio_od", label: "C/D OD", type: "select", options: ["0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9"], default: "0.3" },
  { key: "cd_ratio_os", label: "C/D OS", type: "select", options: ["0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9"], default: "0.3" },
  { key: "macula_od", label: "Macula OD", type: "select", options: ["Flat & intact", "Drusen", "Pigment changes", "Edema", "Hemorrhage", "Other"], default: "Flat & intact" },
  { key: "macula_os", label: "Macula OS", type: "select", options: ["Flat & intact", "Drusen", "Pigment changes", "Edema", "Hemorrhage", "Other"], default: "Flat & intact" },
  { key: "vessels_od", label: "Vessels OD", type: "select", options: ["Normal A/V ratio", "AV nicking", "Hemorrhage", "Neovascularization", "Other"], default: "Normal A/V ratio" },
  { key: "vessels_os", label: "Vessels OS", type: "select", options: ["Normal A/V ratio", "AV nicking", "Hemorrhage", "Neovascularization", "Other"], default: "Normal A/V ratio" },
  { key: "periphery", label: "Periphery", type: "select", options: ["Flat & intact OU", "Lattice", "Hole", "Tear", "Detachment", "Other"], default: "Flat & intact OU" },
  { key: "posterior_notes", label: "Notes", type: "text", default: "" },
];

const CATEGORY_META: Record<FindingCategory, { label: string; fields: FindingField[] }> = {
  slit_lamp_anterior: { label: "Anterior Segment (Slit Lamp)", fields: ANTERIOR_FIELDS },
  fundus_posterior: { label: "Posterior Segment (Fundus)", fields: POSTERIOR_FIELDS },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ExamFindingsProps {
  encounterId: string;
  isReadOnly?: boolean;
}

export function ExamFindings({ encounterId, isReadOnly = false }: ExamFindingsProps) {
  const [expanded, setExpanded] = useState<Record<FindingCategory, boolean>>({
    slit_lamp_anterior: true,
    fundus_posterior: false,
  });

  const [findings, setFindings] = useState<Record<FindingCategory, FindingsData>>(() => {
    const init: Record<string, FindingsData> = {};
    for (const [cat, meta] of Object.entries(CATEGORY_META)) {
      const data: FindingsData = {};
      for (const f of meta.fields) data[f.key] = f.default;
      init[cat] = data;
    }
    return init as Record<FindingCategory, FindingsData>;
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (category: FindingCategory, key: string, value: string) => {
      if (isReadOnly) return;
      setFindings((prev) => ({
        ...prev,
        [category]: { ...prev[category], [key]: value },
      }));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSaveStatus("idle");
      debounceRef.current = setTimeout(() => {
        setSaveStatus("saving");
        setTimeout(() => setSaveStatus("saved"), 400);
      }, 1500);
    },
    [isReadOnly]
  );

  useEffect(() => {
    if (saveStatus === "saved") {
      const t = setTimeout(() => setSaveStatus("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [saveStatus]);

  const toggle = (cat: FindingCategory) => {
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Exam Findings</h2>
          <p className="text-caption mt-0.5 text-[var(--text-muted)]">
            Slit lamp &amp; fundus examination
          </p>
        </div>
        {saveStatus !== "idle" && (
          <Badge variant={saveStatus === "saving" ? "info" : "success"}>
            {saveStatus === "saving" ? "Saving…" : "Saved"}
          </Badge>
        )}
      </div>

      {(Object.keys(CATEGORY_META) as FindingCategory[]).map((cat) => {
        const meta = CATEGORY_META[cat];
        const isOpen = expanded[cat];

        return (
          <div
            key={cat}
            className="rounded-xl overflow-hidden bg-[var(--bg-glass)] border border-[var(--glass-border)]"
          >
            <button
              type="button"
              onClick={() => toggle(cat)}
              className="w-full flex items-center justify-between px-5 py-3 text-left hover-row text-[var(--text-primary)]"
            >
              <span className="text-overline">{meta.label}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className={`text-[var(--text-secondary)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              >
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 grid grid-cols-2 gap-4 border-t border-[var(--border-subtle)]">
                {meta.fields.map((field) => (
                  <div
                    key={field.key}
                    className={field.type === "text" ? "col-span-2" : ""}
                  >
                    <label className="block text-overline mb-1.5 mt-3">{field.label}</label>
                    {field.type === "select" ? (
                      <select
                        value={findings[cat][field.key]}
                        onChange={(e) => handleChange(cat, field.key, e.target.value)}
                        disabled={isReadOnly}
                        className="w-full px-3 py-2 rounded-xl text-xs glass-input"
                      >
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        value={findings[cat][field.key]}
                        onChange={(e) => handleChange(cat, field.key, e.target.value)}
                        disabled={isReadOnly}
                        rows={2}
                        placeholder="Additional notes..."
                        className="w-full px-3 py-2 rounded-xl text-xs glass-input resize-none"
                        style={{ minHeight: "80px" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
