"use client";

import { useState, useCallback } from "react";
import type { ScribeStructuredDataV2 } from "@/types/scribe";
import { SOAPViewer } from "./validation-station/SOAPViewer";
import { FieldReviewer } from "./validation-station/FieldReviewer";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ValidationStationModalProps {
  open: boolean;
  onClose: () => void;
  soapText: string;
  structuredData: ScribeStructuredDataV2;
  generatedAt?: string;
  onAccept: (data: ScribeStructuredDataV2) => void;
  onDiscard: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ValidationStationModal({
  open,
  onClose,
  soapText,
  structuredData,
  generatedAt,
  onAccept,
  onDiscard,
}: ValidationStationModalProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<ScribeStructuredDataV2>(
    () => structuredClone(structuredData),
  );
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleAccept = useCallback(() => {
    onAccept(editedData);
    onClose();
  }, [editedData, onAccept, onClose]);

  const handleDiscard = useCallback(() => {
    if (!showDiscardConfirm) {
      setShowDiscardConfirm(true);
      return;
    }
    onDiscard();
    onClose();
  }, [showDiscardConfirm, onDiscard, onClose]);

  const handleEditToggle = useCallback(() => {
    if (editMode) {
      // Leaving edit mode — no-op, keep edits
      setEditMode(false);
    } else {
      // Reset editedData to fresh clone when entering edit mode
      setEditedData(structuredClone(structuredData));
      setEditMode(true);
    }
  }, [editMode, structuredData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 flex flex-col w-full max-w-[1400px] m-4 rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--glass-border)] bg-[var(--bg-glass)]">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              AI Scribe Review
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
              Validation Station
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        {/* Split pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: SOAP Narrative */}
          <div className="w-1/2 border-r border-[var(--glass-border)] overflow-hidden">
            <SOAPViewer soapText={soapText} generatedAt={generatedAt} />
          </div>

          {/* Right: Proposed Fields */}
          <div className="w-1/2 overflow-hidden">
            <FieldReviewer
              data={editedData}
              editMode={editMode}
              onChange={setEditedData}
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--glass-border)] bg-[var(--bg-glass)]">
          {/* Left: discard */}
          <div>
            {showDiscardConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--state-critical)]">
                  Discard all extracted data?
                </span>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Yes, Discard
                </button>
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDiscard}
                className="text-xs px-4 py-2 rounded-xl font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
              >
                Discard Scribe
              </button>
            )}
          </div>

          {/* Right: edit + accept */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleEditToggle}
              className={`text-xs px-4 py-2 rounded-xl font-medium transition-all ${
                editMode
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                  : "text-[var(--text-secondary)] border border-[var(--glass-border)] hover-btn"
              }`}
            >
              {editMode ? "Done Editing" : "Edit Values"}
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="text-xs px-5 py-2 rounded-xl font-semibold bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)] transition-all"
            >
              Accept All & Populate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
