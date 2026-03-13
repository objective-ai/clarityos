"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";
import { formatClinicDateTime, useClinicTimezone } from "@/lib/timezone";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Addendum {
  id: string;
  encounterId: string;
  content: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
}

interface AddendumSectionProps {
  encounterId: string;
}

// ---------------------------------------------------------------------------
// AddendumSection
// ---------------------------------------------------------------------------

export function AddendumSection({ encounterId }: AddendumSectionProps) {
  const [addenda, setAddenda] = useState<Addendum[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Load addenda on mount
  const loadAddenda = useCallback(async () => {
    try {
      const data = await apiFetch<Addendum[]>(
        `/api/encounters/${encounterId}/addenda`
      );
      setAddenda(data);
    } catch {
      // Silently fail — empty list is fine for first load
    } finally {
      setLoading(false);
    }
  }, [encounterId]);

  useEffect(() => {
    loadAddenda();
  }, [loadAddenda]);

  const handleSubmit = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const newAddendum = await apiFetch<Addendum>(
        `/api/encounters/${encounterId}/addenda`,
        { method: "POST", body: JSON.stringify({ content }) }
      );
      setAddenda((prev) => [...prev, newAddendum]);
      setContent("");
      setShowForm(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit addendum"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const tz = useClinicTimezone();
  const formatDate = (iso: string) => formatClinicDateTime(iso, tz);

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <svg
            className="w-4 h-4 text-teal-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          Addenda
          {addenda.length > 0 && (
            <span className="text-xs text-white/50 font-normal">
              ({addenda.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Existing addenda list */}
        {loading && (
          <p className="text-sm text-white/40 animate-pulse">Loading...</p>
        )}

        {!loading && addenda.length === 0 && !showForm && (
          <p className="text-sm text-white/40">
            No addenda have been added to this encounter.
          </p>
        )}

        {addenda.map((a) => (
          <div
            key={a.id}
            className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-1"
          >
            <div className="flex items-center justify-between text-xs text-white/50">
              <span className="font-medium text-teal-400/80">
                {a.createdByName}
              </span>
              <span>{formatDate(a.createdAt)}</span>
            </div>
            <p className="text-sm text-white/80 whitespace-pre-wrap">
              {a.content}
            </p>
          </div>
        ))}

        {/* Add addendum form */}
        {showForm && (
          <div className="space-y-2">
            <textarea
              className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-teal-400/50 resize-y min-h-[80px]"
              placeholder="Type your addendum here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              autoFocus
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false);
                  setContent("");
                  setError(null);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={content.trim().length === 0 || submitting}
                className="bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 border border-teal-500/30"
              >
                {submitting ? "Submitting..." : "Submit Addendum"}
              </Button>
            </div>
          </div>
        )}

        {/* Add button */}
        {!showForm && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowForm(true)}
            className="text-teal-400 hover:text-teal-300 hover:bg-teal-500/10"
          >
            <svg
              className="w-4 h-4 mr-1.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Add Addendum
          </Button>
        )}
      </CardContent>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="glass-card border-white/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
              Confirm Addendum
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Once submitted, addenda are permanent and cannot be deleted or
              edited. This is a legal amendment to the clinical record.
              Continue?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              className="bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 border border-teal-500/30"
            >
              Submit Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
