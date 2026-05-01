"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RecallQueueRow } from "@/components/messaging/RecallQueueRow";
import { useRecallQueueStore } from "@/store/recallQueueStore";
import { messagingApi } from "@/lib/api/messaging";
import type { MessageTemplate } from "@/types/messaging";

export default function RecallQueuePage() {
  const candidates = useRecallQueueStore((s) => s.candidates);
  const selectedIds = useRecallQueueStore((s) => s.selectedIds);
  const isLoading = useRecallQueueStore((s) => s.isLoading);
  const isSending = useRecallQueueStore((s) => s.isSending);
  const lastError = useRecallQueueStore((s) => s.lastError);
  const setCandidates = useRecallQueueStore((s) => s.setCandidates);
  const toggleSelect = useRecallQueueStore((s) => s.toggleSelect);
  const selectAll = useRecallQueueStore((s) => s.selectAll);
  const clearSelection = useRecallQueueStore((s) => s.clearSelection);
  const setLoading = useRecallQueueStore((s) => s.setLoading);
  const setSending = useRecallQueueStore((s) => s.setSending);
  const setError = useRecallQueueStore((s) => s.setError);

  const [showConfirm, setShowConfirm] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [channel, setChannel] = useState<"sms" | "email">("sms");

  useEffect(() => {
    setLoading(true);
    Promise.all([messagingApi.getRecallQueue(), messagingApi.getTemplates()])
      .then(([r, t]) => {
        setCandidates(r.candidates);
        setTemplates(
          t.filter((x) => x.kind === "recall_m12" || x.kind === "recall_m14"),
        );
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [setCandidates, setLoading, setError]);

  const excludedCount = candidates.filter(
    (c) => !c.hasMarketingConsentSms && !c.hasMarketingConsentEmail,
  ).length;

  async function handleSendAll() {
    setSending(true);
    setShowConfirm(false);
    try {
      const template = templates.find(
        (t) => t.kind === "recall_m12" && t.channel === channel,
      );
      if (!template) {
        setError("No recall template found for chosen channel");
        return;
      }
      await messagingApi.sendRecallBatch({
        candidate_patient_ids: [...selectedIds],
        template_id: template.id,
        channel,
      });
      const r = await messagingApi.getRecallQueue();
      setCandidates(r.candidates);
      clearSelection();
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  if (isLoading) return <div className="p-6">Loading recall queue…</div>;

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-heading">Recall Queue</h1>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={clearSelection}>
              Clear ({selectedIds.size})
            </Button>
            <Button onClick={() => setShowConfirm(true)} disabled={isSending}>
              Send All Recalls ({selectedIds.size})
            </Button>
          </div>
        )}
      </header>

      {lastError && (
        <div role="alert" className="text-[var(--state-critical)] text-body">
          {lastError}
        </div>
      )}

      {candidates.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <p className="text-subhead mb-2">No patients due for recall</p>
            <p className="text-body text-[var(--text-secondary)]">
              Patients with no visit in the last 12 months and no upcoming appointment will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <CardContent className="p-0">
            {excludedCount > 0 && (
              <div className="p-3 text-caption text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                {excludedCount} excluded — opted out of marketing or no valid contact
              </div>
            )}
            <div className="flex items-center gap-2 p-3 border-b border-[var(--glass-border)]">
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Select all
              </Button>
              <span className="text-caption text-[var(--text-muted)]">·</span>
              <span className="text-caption">Channel:</span>
              <button
                onClick={() => setChannel("sms")}
                aria-pressed={channel === "sms"}
                className={`px-2 py-1 text-caption rounded ${
                  channel === "sms"
                    ? "bg-[var(--accent)] text-[var(--bg-base)]"
                    : ""
                }`}
              >
                SMS
              </button>
              <button
                onClick={() => setChannel("email")}
                aria-pressed={channel === "email"}
                className={`px-2 py-1 text-caption rounded ${
                  channel === "email"
                    ? "bg-[var(--accent)] text-[var(--bg-base)]"
                    : ""
                }`}
              >
                Email
              </button>
            </div>
            <table className="w-full">
              <caption className="sr-only">Recall candidates</caption>
              <thead>
                <tr className="text-caption uppercase tracking-widest text-[var(--text-muted)]">
                  <th></th>
                  <th>Patient</th>
                  <th>Last visit</th>
                  <th>Channels</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <RecallQueueRow
                    key={c.patientId}
                    candidate={c}
                    isSelected={selectedIds.has(c.patientId)}
                    onSelectChange={() => toggleSelect(c.patientId)}
                    onSendOne={() => {
                      // Single-row send deferred to Plan 12-10. For v1, the
                      // mandatory preview-confirm gate covers the volume case.
                    }}
                    onRemove={() => toggleSelect(c.patientId)}
                  />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Send recall messages to {selectedIds.size} patients?
            </DialogTitle>
          </DialogHeader>
          <p className="text-body">
            This will send {channel === "sms" ? "SMS" : "email"} recall messages to {selectedIds.size} patients.
            Patients without marketing consent will be skipped automatically.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendAll} disabled={isSending}>
              {isSending ? "Sending…" : "Send All Recalls"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
