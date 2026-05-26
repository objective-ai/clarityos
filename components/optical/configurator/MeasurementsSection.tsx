"use client";

import { useMemo } from "react";

import { useLensCatalogStore } from "@/store/lensCatalogStore";
import { useOpticalOrderConfigStore } from "@/store/opticalOrderConfigStore";

interface FieldError {
  path: string;
  message: string;
}

interface Props {
  fitting: Record<string, any> | null | undefined;
  fieldErrors: FieldError[];
}

const FITTING_FIELDS: Array<[string, string]> = [
  ["pd_distance", "PD Distance"],
  ["pd_near", "PD Near"],
  ["pd_monocular_od", "Mono PD OD"],
  ["pd_monocular_os", "Mono PD OS"],
  ["seg_height_od", "Seg Height OD"],
  ["seg_height_os", "Seg Height OS"],
  ["vertex_distance", "Vertex Distance"],
  ["pantoscopic_tilt", "Pantoscopic Tilt"],
];

export function MeasurementsSection({ fitting, fieldErrors }: Props) {
  const { draft, patchFitting, flush } = useOpticalOrderConfigStore();
  const { lensTypes } = useLensCatalogStore();

  const { requiresSegHeight, requiresVertex } = useMemo(() => {
    const lensLine = (draft?.lineItems ?? []).find(
      (li) => li.lensConfig != null,
    );
    const lensTypeId = lensLine?.lensConfig?.lens_type_id ?? null;
    const lensType = lensTypeId
      ? lensTypes.find((t) => t.id === lensTypeId)
      : null;
    return {
      requiresSegHeight: !!lensType?.requiresSegHeight,
      requiresVertex: !!lensType?.requiresVertex,
    };
  }, [draft, lensTypes]);

  return (
    <section className="rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Measurements
      </h2>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {FITTING_FIELDS.map(([key, label]) => {
          const required =
            (key.startsWith("seg_height") && requiresSegHeight) ||
            (key === "vertex_distance" && requiresVertex);
          const fieldError = fieldErrors.find((e) => e.path.includes(key));
          return (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[var(--text-muted)]">
                {label}
                {required && (
                  <span className="ml-1 text-red-400" aria-label="required">
                    *
                  </span>
                )}
              </span>
              <input
                type="number"
                step="0.1"
                value={fitting?.[key] ?? ""}
                onChange={(e) =>
                  patchFitting({
                    ...(fitting ?? {}),
                    [key]: e.target.value,
                  })
                }
                onBlur={() => flush()}
                className={`rounded border bg-transparent px-2 py-1 text-[var(--text-primary)] ${
                  fieldError
                    ? "border-red-400"
                    : "border-[var(--glass-border)]"
                }`}
              />
              {fieldError && (
                <span className="text-red-400">{fieldError.message}</span>
              )}
            </label>
          );
        })}
      </div>
      {requiresSegHeight && (
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          Seg height required for progressives — measure from pupil center to
          bottom of lens.
        </p>
      )}
      {requiresVertex && (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Vertex distance required for this lens type.
        </p>
      )}
    </section>
  );
}
