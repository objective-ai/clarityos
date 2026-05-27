"use client";

import { useMemo } from "react";

import { useLensCatalogStore } from "@/store/lensCatalogStore";
import { useOpticalOrderConfigStore } from "@/store/opticalOrderConfigStore";

import { SuggestionChip } from "./SuggestionChip";

interface Suggestion {
  field: string;
  value: string | string[];
  matched: string[];
}

interface FieldError {
  path: string;
  message: string;
}

interface Props {
  orderId: string;
  suggestions: Suggestion[];
  fieldErrors: FieldError[];
}

export function LensConfigSection({ suggestions, fieldErrors }: Props) {
  const { lensTypes, lensMaterials, lensCoatings } = useLensCatalogStore();
  const { draft, patchLineItemLensConfig, flush } = useOpticalOrderConfigStore();

  // Pick the first line item with lens_config_jsonb if present, else the
  // first line item (likely a frame line awaiting spectacle config).
  const lensLine = useMemo(() => {
    const items = draft?.lineItems ?? [];
    return items.find((li) => li.lensConfig != null) ?? items[0] ?? null;
  }, [draft]);

  const lc: Record<string, any> = lensLine?.lensConfig ?? {};
  const noLines = !lensLine;

  const lensTypeSuggestion = suggestions.find((s) => s.field === "lens_type");
  const materialSuggestion = suggestions.find((s) => s.field === "material");
  const coatingSuggestion = suggestions.find((s) => s.field === "coatings");

  function setField(key: string, value: any) {
    if (!lensLine) return;
    patchLineItemLensConfig(lensLine.id, { ...lc, [key]: value });
  }

  const errorsFor = (segment: string) =>
    fieldErrors.filter((e) => e.path.includes(segment));

  return (
    <section className="rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Lens Configuration
      </h2>
      {noLines && (
        <div className="mb-3 rounded border border-dashed border-[var(--glass-border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          Select a frame above to configure lenses.
        </div>
      )}
      <div className="space-y-3">
        <Row label="Type" suggestion={lensTypeSuggestion} onAccept={() => {
          const v = lensTypeSuggestion?.value;
          if (typeof v !== "string") return;
          const t = lensTypes.find((x) => x.name.toLowerCase().includes(v));
          if (t) setField("lens_type_id", t.id);
        }}>
          <select
            value={lc.lens_type_id ?? ""}
            onChange={(e) => setField("lens_type_id", e.target.value || null)}
            onBlur={() => flush()}
            disabled={noLines}
            className="w-full rounded border border-[var(--glass-border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select lens type…</option>
            {lensTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {errorsFor("lens_type_id").map((e) => (
            <div key={e.path} className="mt-1 text-xs text-red-400">
              {e.message}
            </div>
          ))}
        </Row>

        <Row label="Material" suggestion={materialSuggestion} onAccept={() => {
          const v = materialSuggestion?.value;
          if (typeof v !== "string") return;
          const m = lensMaterials.find((x) => x.name.toLowerCase().includes(v));
          if (m) setField("material_id", m.id);
        }}>
          <select
            value={lc.material_id ?? ""}
            onChange={(e) => setField("material_id", e.target.value || null)}
            onBlur={() => flush()}
            disabled={noLines}
            className="w-full rounded border border-[var(--glass-border)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select material…</option>
            {lensMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {errorsFor("material_id").map((e) => (
            <div key={e.path} className="mt-1 text-xs text-red-400">
              {e.message}
            </div>
          ))}
        </Row>

        <Row label="Coatings" suggestion={coatingSuggestion} onAccept={() => {
          if (!Array.isArray(coatingSuggestion?.value)) return;
          const ids = coatingSuggestion.value
            .map((name) =>
              lensCoatings.find((c) =>
                c.name.toLowerCase().includes(name.toLowerCase()),
              )?.id,
            )
            .filter((id): id is string => Boolean(id));
          setField("coating_ids", ids);
        }}>
          <div className="flex flex-wrap gap-2">
            {lensCoatings.map((c) => {
              const checked = (lc.coating_ids ?? []).includes(c.id);
              return (
                <label
                  key={c.id}
                  className="flex items-center gap-1 text-xs text-[var(--text-secondary)]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={noLines}
                    onChange={() => {
                      const cur = new Set<string>(lc.coating_ids ?? []);
                      if (checked) cur.delete(c.id);
                      else cur.add(c.id);
                      setField("coating_ids", Array.from(cur));
                    }}
                    onBlur={() => flush()}
                    className="disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {c.name}
                </label>
              );
            })}
          </div>
        </Row>
      </div>
    </section>
  );
}

function Row({
  label,
  suggestion,
  onAccept,
  children,
}: {
  label: string;
  suggestion?: Suggestion;
  onAccept: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs uppercase text-[var(--text-muted)]">
          {label}
        </span>
        {suggestion && (
          <SuggestionChip
            suggestion={suggestion}
            onAccept={onAccept}
            fieldName={suggestion.field}
          />
        )}
      </div>
      {children}
    </div>
  );
}
