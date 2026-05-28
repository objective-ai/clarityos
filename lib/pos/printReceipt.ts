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
 * Auth is handled by the BFF — the routes live behind the Next.js middleware
 * and forward the Supabase Bearer token to FastAPI. No need for
 * `getAuthHeaders()` here.
 *
 * Sale + refund flows are spelled out separately (not factored into a shared
 * helper) so each side's revokeObjectURL cleanup is obvious at the call site.
 */

const CLEANUP_DELAY_MS = 60_000;

/** Print a sale receipt PDF. */
export async function printReceipt(saleId: string): Promise<void> {
  const res = await fetch(`/api/sales/${saleId}/receipt/`);
  if (!res.ok) {
    throw new Error(`Receipt fetch failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "-9999px";
  iframe.style.bottom = "-9999px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      resolve();
    };
  });

  setTimeout(() => {
    URL.revokeObjectURL(url);
    iframe.remove();
  }, CLEANUP_DELAY_MS);
}

/** Print a refund receipt PDF. */
export async function printRefundReceipt(refundId: string): Promise<void> {
  const res = await fetch(`/api/refunds/${refundId}/receipt/`);
  if (!res.ok) {
    throw new Error(`Refund receipt fetch failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "-9999px";
  iframe.style.bottom = "-9999px";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.src = url;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve) => {
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      resolve();
    };
  });

  setTimeout(() => {
    URL.revokeObjectURL(url);
    iframe.remove();
  }, CLEANUP_DELAY_MS);
}
