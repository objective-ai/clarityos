/**
 * POS-03 — receipt printing via hidden iframe.
 *
 * Mirrors Phase 6 Rx PDF print pattern (RESEARCH §Pattern 9):
 *   1. Fetch the receipt PDF Blob from the BFF.
 *   2. Wrap the Blob in an Object URL.
 *   3. Mount a hidden iframe pointing at the URL.
 *   4. On iframe load, invoke `iframe.contentWindow.print()`.
 *   5. Revoke the Object URL and remove the iframe after a generous delay
 *      (covers Save-as-PDF flows where the dialog stays open).
 *
 * Auth is handled by the BFF — these routes live behind the Next.js
 * middleware and forward the Supabase Bearer token to FastAPI. No need for
 * `getAuthHeaders()` here.
 */

const CLEANUP_DELAY_MS = 60_000;

/** Print a sale receipt PDF. */
export async function printReceipt(saleId: string): Promise<void> {
  await printPdfFromUrl(`/api/sales/${saleId}/receipt/`, "Receipt fetch failed");
}

/** Print a refund receipt PDF. */
export async function printRefundReceipt(refundId: string): Promise<void> {
  await printPdfFromUrl(
    `/api/refunds/${refundId}/receipt/`,
    "Refund receipt fetch failed",
  );
}

async function printPdfFromUrl(url: string, errorPrefix: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${errorPrefix}: ${res.status}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "-9999px";
  iframe.style.bottom = "-9999px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = objectUrl;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      resolve();
    };
  });

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    iframe.remove();
  }, CLEANUP_DELAY_MS);
}
