"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Plus, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBillingStore } from "@/store/billingStore";
import { CPT_CATALOG } from "@/types/billing";
import type { CptEntry, MdmLevel } from "@/types/billing";

// ---------------------------------------------------------------------------
// MDM level colour map
// ---------------------------------------------------------------------------

const MDM_COLORS: Record<MdmLevel, string> = {
  straightforward: "#2DD4BF",
  low: "#60A5FA",
  moderate: "#FBBF24",
  high: "#FB7185",
};

// ---------------------------------------------------------------------------
// CptAddDropdown — inline sub-component
// ---------------------------------------------------------------------------

function CptAddDropdown({
  encounterId,
  existingCodes,
}: {
  encounterId: string;
  existingCodes: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const addLineItem = useBillingStore((s) => s.addLineItem);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = CPT_CATALOG.filter(
    (c: CptEntry) =>
      !existingCodes.includes(c.code) &&
      (c.code.includes(search) ||
        c.description.toLowerCase().includes(search.toLowerCase())),
  );

  const handleSelect = async (entry: CptEntry) => {
    await addLineItem(encounterId, {
      cptCode: entry.code,
      description: entry.description,
      fee: entry.defaultFee,
      units: 1,
    });
    setOpen(false);
    setSearch("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium
          bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--glass-border)]
          hover:bg-[var(--accent)]/20 transition-colors"
      >
        <Plus size={14} />
        Add CPT
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setSearch("");
          }
        }}
        placeholder="Search CPT code or description..."
        className="glass-input w-64 text-sm"
      />

      {filtered.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-80 max-h-56 overflow-y-auto rounded-lg
            border border-[var(--glass-border)] bg-[var(--bg-elevated)] shadow-xl"
        >
          {filtered.map((entry) => (
            <li key={entry.code}>
              <button
                type="button"
                onClick={() => handleSelect(entry)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm
                  hover:bg-[var(--bg-surface)] transition-colors"
              >
                <span className="font-mono text-[var(--accent)]">
                  {entry.code}
                </span>
                <span className="flex-1 truncate text-[var(--text-secondary)]">
                  {entry.description}
                </span>
                <span className="text-[var(--text-muted)]">
                  ${entry.defaultFee.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filtered.length === 0 && search && (
        <div
          className="absolute z-50 mt-1 w-80 rounded-lg border border-[var(--glass-border)]
            bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)]"
        >
          No matching CPT codes
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SuperbillEditor — main component
// ---------------------------------------------------------------------------

export default function SuperbillEditor({
  encounterId,
}: {
  encounterId: string;
}) {
  const slice = useBillingStore(
    (s) => s.encounters[encounterId] ?? null,
  );
  const loadSuperbill = useBillingStore((s) => s.loadSuperbill);
  const createSuperbill = useBillingStore((s) => s.createSuperbill);
  const calculateMdm = useBillingStore((s) => s.calculateMdm);
  const removeLineItem = useBillingStore((s) => s.removeLineItem);
  const reset = useBillingStore((s) => s.reset);

  const loadStatus = slice?.loadStatus ?? "idle";
  const superbill = slice?.superbill ?? null;
  const mdm = slice?.mdm ?? null;
  const warnings = slice?.warnings ?? [];
  const error = slice?.error ?? null;
  const isSaving = slice?.isSaving ?? false;

  // Track whether we already triggered create to avoid double-fire
  const createdRef = useRef(false);

  // On mount: reset any stale state then load
  useEffect(() => {
    reset(encounterId);
    loadSuperbill(encounterId);
  }, [encounterId]); // eslint-disable-line react-hooks/exhaustive-deps

  // After load: if no superbill exists, create one with auto-suggested CPTs
  useEffect(() => {
    if (loadStatus === "loaded" && !superbill && !createdRef.current) {
      createdRef.current = true;
      createSuperbill(encounterId);
    }
  }, [loadStatus, superbill, encounterId, createSuperbill]);

  // Fetch MDM calculation
  useEffect(() => {
    if (loadStatus === "loaded") {
      calculateMdm(encounterId);
    }
  }, [loadStatus, encounterId, calculateMdm]);

  // ── Loading state ──────────────────────────────────────────────────────
  if (loadStatus === "loading" || (loadStatus === "loaded" && !superbill && !error)) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
        <div className="animate-spin mr-3 h-5 w-5 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        Preparing superbill...
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (loadStatus === "error" || error) {
    return (
      <div className="rounded-lg border border-[var(--state-critical)]/30 bg-[var(--state-critical)]/10 px-4 py-3 text-sm text-[var(--state-critical)]">
        {error ?? "Failed to load superbill"}
      </div>
    );
  }

  if (!superbill) return null;

  const lineItems = superbill.lineItems ?? [];
  const existingCodes = lineItems.map((li) => li.cptCode);
  const mdmColor = mdm?.mdmLevel ? MDM_COLORS[mdm.mdmLevel] : undefined;

  return (
    <div className="space-y-4">
      {/* ── MDM Glass Card ──────────────────────────────────────────────── */}
      {mdm && (
        <div
          className="rounded-xl border border-[var(--glass-border)] bg-[var(--bg-glass)] p-4
            backdrop-blur-md"
        >
          <div className="flex items-center gap-3 mb-2">
            <Zap size={18} style={{ color: mdmColor }} />
            <h3 className="text-subhead text-[var(--text-primary)] font-semibold">
              MDM Analysis
            </h3>
            <Badge
              className="ml-auto"
              style={{
                borderColor: `${mdmColor}40`,
                backgroundColor: `${mdmColor}18`,
                color: mdmColor,
              }}
            >
              {mdm.mdmLevel}
            </Badge>
          </div>

          <div className="flex items-center gap-4 mb-2">
            <span className="text-caption text-[var(--text-muted)]">
              Suggested E&M:
            </span>
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: mdmColor }}
            >
              {mdm.suggestedEmCode}
            </span>
          </div>

          {mdm.reasoning && (
            <p className="text-caption text-[var(--text-secondary)] leading-relaxed">
              {mdm.reasoning}
            </p>
          )}
        </div>
      )}

      {/* ── Warnings ────────────────────────────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div
              key={`${w.cptCode}-${i}`}
              className="rounded-lg border border-[var(--state-caution)]/30
                bg-[var(--state-caution)]/10 px-3 py-2 text-sm text-[var(--state-caution)]"
            >
              <span className="font-mono font-semibold">{w.cptCode}</span>{" "}
              &mdash; {w.warning}
            </div>
          ))}
        </div>
      )}

      {/* ── Line Item Table ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--glass-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--bg-glass)] text-left text-caption text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">CPT</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium text-right">Fee</th>
              <th className="px-4 py-2 font-medium">Modifiers</th>
              <th className="px-4 py-2 font-medium w-10" />
            </tr>
          </thead>
          <tbody>
            {lineItems.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-[var(--text-muted)]"
                >
                  No line items yet. Add a CPT code below.
                </td>
              </tr>
            )}
            {lineItems.map((li, idx) => (
              <tr
                key={li.id}
                className={
                  idx % 2 === 0
                    ? "bg-[var(--bg-surface)]"
                    : "bg-[var(--bg-elevated)]"
                }
              >
                <td className="px-4 py-2 font-mono text-[var(--accent)]">
                  {li.cptCode}
                </td>
                <td className="px-4 py-2 text-[var(--text-secondary)]">
                  {li.description}
                </td>
                <td className="px-4 py-2 text-right text-[var(--text-primary)] tabular-nums">
                  ${li.fee.toFixed(2)}
                </td>
                <td className="px-4 py-2">
                  {li.modifiers.length > 0 ? (
                    <div className="flex gap-1">
                      {li.modifiers.map((m) => (
                        <Badge key={m} variant="secondary" className="text-xs">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[var(--text-muted)]">&mdash;</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeLineItem(encounterId, li.id)}
                    className="text-[var(--text-muted)] hover:text-[var(--state-critical)] transition-colors"
                    aria-label={`Remove ${li.cptCode}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer: Add CPT + Total ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <CptAddDropdown
          encounterId={encounterId}
          existingCodes={existingCodes}
        />

        <div className="flex items-center gap-2">
          {isSaving && (
            <div className="animate-spin h-4 w-4 rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          )}
          <span className="text-caption text-[var(--text-muted)]">Total:</span>
          <span className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">
            ${superbill.totalFee.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
