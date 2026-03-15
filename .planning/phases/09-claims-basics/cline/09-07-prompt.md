# Phase 9 Wave 6 — Download PDF Buttons + Human Verification Checkpoint

## Goal
Wire "Download PDF" buttons on the billing dashboard and in SuperbillEditor so users can download CMS-1500 PDFs directly from the UI. Then run a human verification checkpoint across all 6 Phase 9 features.

**Depends on:** 09-06 complete (SuperbillEditor + billingStore wired)
**Also requires:** 09-03 complete (PDF BFF route exists at `/api/encounters/[encounterId]/superbill/pdf`)

## Read These Files First
1. `app/(tenant)/[tenant]/billing/page.tsx` — find: row action button area, existing action buttons pattern, STATUS_STYLES, superbill row structure
2. `components/billing/SuperbillEditor.tsx` — find: where existing action buttons are (e.g., "Post Superbill", "Export JSON"), component state

## Context

**PDF download helper function pattern:**
```typescript
async function downloadPdf(encounterId: string, setLoading: (v: boolean) => void) {
  setLoading(true);
  try {
    const res = await fetch(`/api/encounters/${encounterId}/superbill/pdf`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("PDF download failed:", err);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `claim-${encounterId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } finally {
    setLoading(false);
  }
}
```

**Button labels:**
```typescript
const isDraft = superbill.claim_status === "draft";
const pdfButtonLabel = isDraft ? "Preview PDF (Draft)" : "Download PDF";
// Icon: Eye for draft, FileDown for non-draft (both from lucide-react)
```

**No status gate** — show the button for ALL claim statuses.

**"Last printed" display:**
```typescript
// Show when last_pdf_generated_at is set:
// "Last printed: X days ago"
import { formatDistanceToNow } from "date-fns"; // if date-fns is available
// OR manually: Math.floor((Date.now() - new Date(last_pdf_generated_at).getTime()) / 86400000)
```

## Do NOT / Instead
- Do NOT gate the button behind any status check — all statuses show the button
- Do NOT call `window.open(url)` — use the fetch → blob → anchor click pattern (handles auth cookies correctly)
- Do NOT change the superbill's claim status when downloading a PDF
- Do NOT use a global loading state — use per-row loading state `useState<Record<string, boolean>>({})` so multiple rows can load independently

## Instructions

### Task 1 — Add Download PDF button to `app/(tenant)/[tenant]/billing/page.tsx`

Read the file first.

1. Add the `downloadPdf` helper function (above the component or as a named function inside the file):
   ```typescript
   async function downloadPdf(encounterId: string, setLoading: (v: boolean) => void) {
     setLoading(true);
     try {
       const res = await fetch(`/api/encounters/${encounterId}/superbill/pdf`);
       if (!res.ok) {
         const err = await res.json().catch(() => ({}));
         console.error("PDF download failed:", err);
         return;
       }
       const blob = await res.blob();
       const url = URL.createObjectURL(blob);
       const a = document.createElement("a");
       a.href = url;
       a.download = `claim-${encounterId.slice(0, 8)}.pdf`;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       URL.revokeObjectURL(url);
     } finally {
       setLoading(false);
     }
   }
   ```

2. Add per-row PDF loading state inside the component:
   ```typescript
   const [pdfLoading, setPdfLoading] = useState<Record<string, boolean>>({});
   ```

3. In the billing row action area (wherever existing action buttons are), add the PDF button for each row:
   ```tsx
   {/* All statuses show this button */}
   <button
     onClick={() => downloadPdf(
       row.encounter_id,
       (v) => setPdfLoading((prev) => ({ ...prev, [row.id]: v }))
     )}
     disabled={pdfLoading[row.id]}
     className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white disabled:opacity-40"
     title={row.claim_status === "draft" ? "Preview PDF (Draft)" : "Download PDF"}
   >
     {pdfLoading[row.id] ? (
       <Loader2 className="w-4 h-4 animate-spin" />
     ) : row.claim_status === "draft" ? (
       <Eye className="w-4 h-4" />
     ) : (
       <FileDown className="w-4 h-4" />
     )}
   </button>
   ```

4. If `last_pdf_generated_at` is available on the row, show "Last printed: X days ago" near the status badge:
   ```tsx
   {row.last_pdf_generated_at && (
     <span className="text-xs text-gray-500 ml-2">
       Last printed: {Math.floor((Date.now() - new Date(row.last_pdf_generated_at).getTime()) / 86400000)}d ago
     </span>
   )}
   ```

5. Add imports for new icons: `import { FileDown, Eye, Loader2 } from "lucide-react";`

### Task 2 — Add Download PDF button to `components/billing/SuperbillEditor.tsx`

Read the file first.

1. Add local loading state: `const [pdfLoading, setPdfLoading] = useState(false);`

2. Add the same `downloadPdf` helper inline (or inline the logic):
   ```typescript
   const handleDownloadPdf = async () => {
     if (!superbill?.encounter_id) return;
     setPdfLoading(true);
     try {
       const res = await fetch(`/api/encounters/${encounterId}/superbill/pdf`);
       if (!res.ok) { console.error("PDF download failed"); return; }
       const blob = await res.blob();
       const url = URL.createObjectURL(blob);
       const a = document.createElement("a");
       a.href = url;
       a.download = `claim-${encounterId.slice(0, 8)}.pdf`;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       URL.revokeObjectURL(url);
     } finally {
       setPdfLoading(false);
     }
   };
   ```

3. Find existing action buttons (e.g., "Post Superbill" or "Export JSON"). Add alongside them:
   ```tsx
   <button
     onClick={handleDownloadPdf}
     disabled={pdfLoading || !superbill}
     className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm glass-card hover:bg-white/10 disabled:opacity-40"
   >
     {pdfLoading ? (
       <Loader2 className="w-4 h-4 animate-spin" />
     ) : superbill?.claim_status === "draft" ? (
       <Eye className="w-4 h-4" />
     ) : (
       <FileDown className="w-4 h-4" />
     )}
     {superbill?.claim_status === "draft" ? "Preview PDF (Draft)" : "Download PDF"}
   </button>
   ```

4. Import new icons: `Eye`, `FileDown`, `Loader2` from `lucide-react`.

## Verify
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0"
```

## Done When
- Download PDF button visible in billing dashboard rows (all statuses)
- Download PDF button visible in SuperbillEditor (all statuses)
- Draft rows/superbills show "Preview PDF (Draft)" label with Eye icon
- Non-draft show "Download PDF" with FileDown icon
- `npx tsc --noEmit` shows 0 errors

---

## Human Verification Checkpoint

After implementation, verify all 6 Phase 9 features manually in the browser.

First, ensure servers are running:
```bash
bash scripts/dev.sh ensure-api
```

### Verify 1 — Admin Payers Tab
- Go to Admin panel (`/[tenant]/admin`)
- Click "Payers" tab
- Confirm 10 CA payers are listed (VSP, EyeMed, Aetna, etc.)
- Create a new test payer → confirm it appears in the list
- Click a payer row → confirm fee schedule view shows CPT codes with editable fee fields

### Verify 2 — Base Fee Catalog
- In Payers tab, find "Base Fee Catalog" section
- Confirm 11 CPT codes with fees from seed data

### Verify 3 — Patient Insurance Tab
- Go to any patient detail page
- Click "Insurance" tab
- Confirm "Primary Insurance" and "Secondary Insurance" glass cards appear (or empty state)
- Click "Add Primary Insurance" → confirm modal opens with payer dropdown showing seeded payers
- Add a test insurance record → confirm it appears as primary card

### Verify 4 — Payer Selection at Superbill Creation
- Open a finalized encounter
- Click "Create Superbill" (or equivalent trigger)
- Confirm payer selection modal appears with patient's insurance options + "Self-Pay"
- Select an insurance option → confirm superbill creates with payer pre-set
- Confirm line items have fee source indicators (asterisk/yellow on base-rate items)

### Verify 5 — Download PDF
- On billing dashboard, find any superbill row
- Click "Download PDF" (or "Preview PDF (Draft)" for drafts) → confirm browser downloads a PDF file
- Open the PDF → confirm it contains patient name, payer name, service lines, and total
- Confirm the superbill's claim status did NOT change after download

### Verify 6 — Patient Billing Tab
- Go to the patient used in Verify 3/4
- Click "Billing" tab
- Confirm the superbill appears with correct date, status badge, E&M code, CPT codes, and total

**Type "approved" in the chat when all 6 verifications pass, or describe what failed.**

## Commit
```
feat(claims-ui): add Download PDF buttons to billing dashboard and SuperbillEditor
```
