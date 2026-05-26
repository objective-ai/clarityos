"use client";

import { useMemo } from "react";

interface RxLike {
  od_sphere?: string | number | null;
  od_cylinder?: string | number | null;
  od_axis?: number | null;
  od_add?: string | number | null;
  os_sphere?: string | number | null;
  os_cylinder?: string | number | null;
  os_axis?: number | null;
  os_add?: string | number | null;
  // camelCase fallback in case the response came through apiFetch path
  odSphere?: string | number | null;
  odCylinder?: string | number | null;
  odAxis?: number | null;
  odAdd?: string | number | null;
  osSphere?: string | number | null;
  osCylinder?: string | number | null;
  osAxis?: number | null;
  osAdd?: string | number | null;
}

const DELTA_THRESHOLD_SE = 0.5;

function readField(
  rx: RxLike | null | undefined,
  eye: "od" | "os",
  attr: "sphere" | "cylinder" | "axis" | "add",
): string | null {
  if (!rx) return null;
  const snake = (rx as any)[`${eye}_${attr}`];
  if (snake !== undefined && snake !== null && snake !== "") return String(snake);
  const camel =
    attr === "add"
      ? (rx as any)[`${eye}Add`]
      : (rx as any)[
          `${eye}${attr[0].toUpperCase() + attr.slice(1)}`
        ];
  if (camel !== undefined && camel !== null && camel !== "") return String(camel);
  return null;
}

function sphericalEquivalent(
  rx: RxLike | null | undefined,
  eye: "od" | "os",
): number | null {
  const s = parseFloat(readField(rx, eye, "sphere") ?? "");
  const c = parseFloat(readField(rx, eye, "cylinder") ?? "");
  if (Number.isNaN(s)) return null;
  return s + (Number.isNaN(c) ? 0 : c / 2);
}

interface Props {
  habitual: RxLike | null;
  final: RxLike | null;
}

export function RxSideBySidePanel({ habitual, final }: Props) {
  const flagged = useMemo(() => {
    const f: ("OD" | "OS")[] = [];
    for (const eye of ["od", "os"] as const) {
      const h = sphericalEquivalent(habitual, eye);
      const fi = sphericalEquivalent(final, eye);
      if (h !== null && fi !== null && Math.abs(fi - h) > DELTA_THRESHOLD_SE) {
        f.push(eye.toUpperCase() as "OD" | "OS");
      }
    }
    return f;
  }, [habitual, final]);

  if (!habitual && !final) {
    return (
      <div className="rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] p-4 text-[var(--text-secondary)]">
        No refraction data on this order. PD will need to be measured with a
        pupillometer.
      </div>
    );
  }

  return (
    <section className="rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] p-4">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
        Refraction (Habitual | Final)
      </h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <RxColumn label="Habitual" rx={habitual} />
        <RxColumn label="Final" rx={final} />
      </div>
      {flagged.length > 0 && (
        <div className="mt-3 rounded bg-amber-500/10 px-3 py-2 text-xs text-[var(--text-secondary)]">
          Significant Rx change detected: {flagged.join(", ")} (|Δ SE| &gt; 0.50D)
        </div>
      )}
    </section>
  );
}

function RxColumn({ label, rx }: { label: string; rx: RxLike | null }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase text-[var(--text-muted)]">
        {label}
      </div>
      <table className="w-full text-xs">
        <thead className="text-[var(--text-muted)]">
          <tr>
            <th className="text-left">Eye</th>
            <th className="text-left">Sph</th>
            <th className="text-left">Cyl</th>
            <th className="text-left">Axis</th>
            <th className="text-left">Add</th>
          </tr>
        </thead>
        <tbody className="text-[var(--text-primary)]">
          {(["od", "os"] as const).map((eye) => (
            <tr key={eye}>
              <td className="font-semibold">{eye.toUpperCase()}</td>
              <td>{readField(rx, eye, "sphere") ?? "—"}</td>
              <td>{readField(rx, eye, "cylinder") ?? "—"}</td>
              <td>{readField(rx, eye, "axis") ?? "—"}</td>
              <td>{readField(rx, eye, "add") ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
