"use client";

/**
 * components/schedule/IntakeLinkModal.tsx
 *
 * Modal shown after generating an intake token.
 * Displays a copyable URL for the patient intake form.
 */

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

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
  const [showQR, setShowQR] = useState(false);

  if (!isOpen) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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

        {/* Tab toggle: Link / QR Code */}
        <div className="flex gap-1 mb-4 rounded-lg bg-white/5 p-1">
          <button
            onClick={() => setShowQR(false)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${
              !showQR
                ? "bg-white/10 text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            Link
          </button>
          <button
            onClick={() => setShowQR(true)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition ${
              showQR
                ? "bg-white/10 text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            QR Code
          </button>
        </div>

        {showQR ? (
          /* QR Code display */
          <div className="flex flex-col items-center gap-3 mb-4">
            <div className="rounded-xl bg-white p-4">
              <QRCodeSVG value={url} size={200} level="M" />
            </div>
            <p className="text-xs text-[var(--text-muted)] text-center">
              Patient can scan this with their phone camera
            </p>
          </div>
        ) : (
          /* URL display */
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
        )}

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
