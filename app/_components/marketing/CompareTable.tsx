import type { Competitor, CompareRow, SupportLevel } from "@/app/(marketing)/_data/compare";
import { COLORS, FONT_FAMILIES } from "@/app/(marketing)/_data/marketingTokens";

function renderCell(level: SupportLevel): { symbol: string; color: string; label: string } {
  switch (level) {
    case "yes":     return { symbol: "✓", color: COLORS.success, label: "Yes" };
    case "no":      return { symbol: "✗", color: COLORS.neutral,  label: "No" };
    case "partial": return { symbol: "◐", color: COLORS.partial,  label: "Partial" };
    case "unknown":
    default:        return { symbol: "?", color: COLORS.textSubtle, label: "Unknown" };
  }
}

export default function CompareTable({
  competitors,
  rows,
  footnote,
}: {
  competitors: Competitor[];
  rows: CompareRow[];
  footnote: string;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.97rem",
          fontFamily: FONT_FAMILIES.body,
        }}
      >
        <thead>
          <tr style={{ background: COLORS.surfaceAlt }}>
            <th
              scope="col"
              style={{
                textAlign: "left",
                padding: "0.85rem 1rem",
                fontWeight: 600,
                color: COLORS.text,
                borderBottom: `1px solid ${COLORS.border}`,
                minWidth: "200px",
              }}
            >
              Capability
            </th>
            {competitors.map((c) => (
              <th
                key={c.id}
                scope="col"
                style={{
                  textAlign: "center",
                  padding: "0.85rem 1rem",
                  fontWeight: 700,
                  color: c.id === "clarity" ? COLORS.primary : COLORS.text,
                  borderBottom: `1px solid ${COLORS.border}`,
                  minWidth: "130px",
                }}
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id}
              style={{
                background: i % 2 === 0 ? COLORS.surface : COLORS.surfaceAlt,
              }}
            >
              <td
                style={{
                  padding: "0.75rem 1rem",
                  color: COLORS.text,
                  borderBottom: `1px solid ${COLORS.border}`,
                  fontWeight: 500,
                }}
              >
                {row.label}
              </td>
              {competitors.map((c) => {
                const cell = renderCell(row.support[c.id]);
                return (
                  <td
                    key={c.id}
                    aria-label={cell.label}
                    style={{
                      textAlign: "center",
                      padding: "0.75rem 1rem",
                      borderBottom: `1px solid ${COLORS.border}`,
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      color: cell.color,
                    }}
                  >
                    {cell.symbol}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          color: COLORS.textSubtle,
          fontSize: "0.85rem",
          padding: "0.75rem 1rem",
        }}
      >
        {footnote}
      </p>
    </div>
  );
}
