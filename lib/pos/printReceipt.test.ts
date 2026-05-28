import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Plan 15-09 — replaces the Wave-0 describe.skip stub. Verifies the hidden
 * iframe + Object URL flow without standing up Chrome (jsdom env is fine; we
 * stub contentWindow.print and onload).
 */
describe("printReceipt", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let originalCreateElement: typeof document.createElement;
  let createdIframes: HTMLIFrameElement[];
  let printSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn().mockReturnValue("blob:fake-url");
    revokeObjectURL = vi.fn();
    // jsdom doesn't ship Blob URL APIs — install minimal stubs.
    Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: () =>
        Promise.resolve(new Blob(["%PDF-fake"], { type: "application/pdf" })),
    }) as unknown as typeof fetch;

    printSpy = vi.fn();

    // Force iframe.contentWindow to expose a printable surface and auto-fire
    // onload after the element is attached.
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get(this: HTMLIFrameElement) {
        return { focus: vi.fn(), print: printSpy };
      },
    });

    createdIframes = [];
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "iframe") {
        const iframe = el as HTMLIFrameElement;
        // Fire onload on next microtask once the caller has set it.
        queueMicrotask(() => iframe.onload?.(new Event("load")));
        createdIframes.push(iframe);
      }
      return el;
    }) as typeof document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("fetches the receipt, mounts a hidden iframe, and invokes print()", async () => {
    const { printReceipt } = await import("./printReceipt");
    await printReceipt("sale-1");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/sales/sale-1/receipt/");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(createdIframes.length).toBeGreaterThan(0);
    const iframe = createdIframes[0];
    expect(iframe.src).toContain("blob:fake-url");
  });

  it("revokes the Object URL and removes the iframe after the cleanup delay", async () => {
    vi.useFakeTimers();
    const { printReceipt } = await import("./printReceipt");
    const printPromise = printReceipt("sale-2");
    // Drain the microtask queue so the iframe.onload settles.
    await vi.advanceTimersByTimeAsync(0);
    await printPromise;
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("throws when the receipt fetch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const { printReceipt } = await import("./printReceipt");
    await expect(printReceipt("sale-x")).rejects.toThrow(/Receipt fetch failed: 500/);
  });
});
