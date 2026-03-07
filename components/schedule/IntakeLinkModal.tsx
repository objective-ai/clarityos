"use client";

/**
 * components/schedule/IntakeLinkModal.tsx
 *
 * Modal shown after generating an intake token.
 * Displays a copyable URL for the patient intake form.
 */

import { useState } from "react";

interface IntakeLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  patientName: string;
  appointmentDate: string;
}

export default function IntakeLinkModal({
  isOpen,
  onClose,
  url,
  patientName,
  appointmentDate,
}: IntakeLinkModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-xl border border-white/8 bg-[var(--bg-elevated)] p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
          Intake Form Link Generated
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Send this link to <span className="text-[var(--text-primary)] font-medium">{patientName}</span>
          {appointmentDate && <> for their {appointmentDate} appointment</>}.
        </p>

        {/* URL display */}
        <div className="flex gap-2 mb-4">
          <input
            readOnly
            value={url}
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-[var(--text-secondary)] font-mono truncate"
          />
          <button
            onClick={copyLink}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              copied
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-[var(--accent)] text-[var(--text-inverse)] hover:bg-[var(--accent-hover)]"
            }`}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <p className="text-xs text-[var(--text-muted)] mb-4">
          This link expires in 72 hours. The patient will need to verify their date of birth before accessing the form.
        </p>

        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg border border-white/10 text-[var(--text-secondary)] text-sm font-medium hover:bg-white/5 transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
