"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FileText, Plus, AlertTriangle } from "lucide-react";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load addenda on mount
  const loadAddenda = useCallback(async () => {
    try {
      const data = await apiFetch<Addendum[]>(
        `/api/encounters/${encounterId}/addenda`
      );
      setAddenda(data ?? []);
    } catch {
      // Silently fail — empty list is fine for first load
    } finally {
      setLoading(false);
    }
  }, [encounterId]);

  // Focus and scroll textarea into view when form opens.
  // autoFocus is unreliable on dynamically-rendered elements; this ensures
  // the textarea is always interactive and not hidden behind the fixed nav bar.
  useEffect(() => {
    if (!showForm) return;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [showForm]);

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
      if (newAddendum) setAddenda((prev) => [...prev, newAddendum]);
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
          <FileText className="w-4 h-4 text-teal-400" />
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
              ref={textareaRef}
              className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-teal-400/50 resize-y min-h-[80px]"
              placeholder="Type your addendum here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
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
            <Plus className="w-4 h-4 mr-1.5" />
            Add Addendum
          </Button>
        )}
      </CardContent>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="glass-card border-white/10 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
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
