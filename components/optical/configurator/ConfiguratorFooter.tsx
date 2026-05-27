"use client";

interface Props {
  status: string;
  onPlace: () => Promise<void> | void;
  onGenerateJobTicket: () => Promise<void> | void;
  onCancel: () => void;
  placing?: boolean;
}

export function ConfiguratorFooter({
  status,
  onPlace,
  onGenerateJobTicket,
  onCancel,
  placing,
}: Props) {
  const canPlace = status === "draft" && !placing;
  const canGenerate = status === "placed";

  return (
    <footer className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-[var(--glass-border)] bg-[var(--bg-glass-solid)] p-4 backdrop-blur-md">
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-[var(--glass-border)] px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        {status === "draft" ? "Discard draft" : "Cancel"}
      </button>
      <button
        type="button"
        onClick={onPlace}
        disabled={!canPlace}
        className="rounded bg-[#2DD4BF] px-4 py-2 font-medium text-[var(--text-on-accent,#0a0a0a)] disabled:opacity-40"
      >
        {placing ? "Placing…" : "Place Order"}
      </button>
      <button
        type="button"
        onClick={onGenerateJobTicket}
        disabled={!canGenerate}
        title={canGenerate ? "" : "Place order first"}
        className="rounded border border-[var(--glass-border)] px-4 py-2 text-[var(--text-primary)] disabled:opacity-40"
      >
        Generate Job Ticket
      </button>
    </footer>
  );
}
