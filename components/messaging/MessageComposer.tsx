"use client";

import { useMemo, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { previewMessage } from "@/lib/messaging/composer-preview";
import { useMessagingStore } from "@/store/messagingStore";
import type {
  ConsentFlags,
  MessageChannel,
  MessagePurpose,
  MessageTemplate,
} from "@/types/messaging";
import { OptOutWarning } from "./OptOutWarning";

export interface MessageComposerSendPayload {
  body: string;
  subject?: string;
  channel: MessageChannel;
  templateId?: string;
}

interface MessageComposerProps {
  patientId: string;
  patientFirstName: string;
  consents: ConsentFlags;
  templates: MessageTemplate[];
  defaultChannel?: MessageChannel;
  defaultPurpose?: MessagePurpose;
  appointmentId?: string;
  /** > 0 → bulk mode. Caller reads recipients via useMessagingStore selector. */
  bulkRecipientCount?: number;
  onSend: (payload: MessageComposerSendPayload) => Promise<void>;
  onClose: () => void;
}

export function MessageComposer({
  patientId,
  patientFirstName,
  consents,
  templates,
  defaultChannel = "sms",
  defaultPurpose = "manual",
  appointmentId,
  bulkRecipientCount = 0,
  onSend,
  onClose,
}: MessageComposerProps) {
  const isBulk = bulkRecipientCount > 0;
  const bulkRecipients = useMessagingStore((s) => s.bulkRecipients);

  const [channel, setChannel] = useState<MessageChannel>(defaultChannel);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiIntent, setAiIntent] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const tokens: Record<string, string> = useMemo(
    () => ({ patient_first_name: patientFirstName }),
    [patientFirstName]
  );

  const preview = useMemo(
    () =>
      previewMessage({
        body,
        tokens,
        channel,
        purpose: defaultPurpose,
        consents,
      }),
    [body, tokens, channel, defaultPurpose, consents]
  );

  const charCountText = preview.segments
    ? `${preview.segments.totalChars} / ${preview.segments.perSegmentLimit} chars (${preview.segments.count} segment${preview.segments.count > 1 ? "s" : ""})`
    : "";

  const sendDisabled =
    body.trim().length === 0 || preview.blocked || isSending;

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((tpl) => tpl.id === id);
    if (t) {
      setBody(t.body);
      if (t.subject) setSubject(t.subject);
    }
  }

  async function handleSend() {
    if (sendDisabled) return;
    if (isBulk && !showBulkConfirm) {
      setShowBulkConfirm(true);
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      await onSend({
        body,
        subject: channel === "email" ? subject : undefined,
        channel,
        templateId: templateId || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setIsSending(false);
      setShowBulkConfirm(false);
    }
  }

  async function handleAiDraft() {
    if (!aiIntent.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/messaging/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patientId,
          appointment_id: appointmentId ?? null,
          channel,
          intent: aiIntent,
        }),
      });
      if (!res.ok) throw new Error(`AI draft failed (${res.status})`);
      const data = await res.json();
      const draftBody: string = data.body ?? data.draft ?? "";
      if (draftBody) setBody(draftBody);
      setShowAiInput(false);
      setAiIntent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI draft failed");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="glass-card flex flex-col gap-4 rounded-2xl p-4">
      {isBulk && (
        <div className="flex items-center justify-between">
          <Badge variant="info">Sending to {bulkRecipientCount} patients</Badge>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-caption" style={{ color: "var(--text-muted)" }}>
          Channel
        </span>
        <Button
          type="button"
          size="sm"
          variant={channel === "sms" ? "default" : "outline"}
          onClick={() => setChannel("sms")}
          aria-pressed={channel === "sms"}
          aria-label="SMS channel"
        >
          SMS
        </Button>
        <Button
          type="button"
          size="sm"
          variant={channel === "email" ? "default" : "outline"}
          onClick={() => setChannel("email")}
          aria-pressed={channel === "email"}
          aria-label="Email channel"
        >
          Email
        </Button>
      </div>

      {templates.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-caption" style={{ color: "var(--text-muted)" }}>
            Template
          </span>
          <select
            className="glass-input"
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            aria-label="Template"
          >
            <option value="">No template — write from scratch</option>
            {templates
              .filter((t) => t.channel === channel)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.kind} ({t.language})
                </option>
              ))}
          </select>
        </label>
      )}

      {channel === "email" && (
        <label className="flex flex-col gap-1">
          <span className="text-caption" style={{ color: "var(--text-muted)" }}>
            Subject
          </span>
          <input
            type="text"
            className="glass-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label="Email subject"
          />
        </label>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-caption" style={{ color: "var(--text-muted)" }}>
          Message
        </span>
        <textarea
          className="glass-input min-h-[120px]"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Hi ${patientFirstName},`}
          aria-label="Message body"
        />
      </label>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowAiInput((v) => !v)}
        className="self-start"
        aria-label="Draft with AI"
      >
        <Sparkles size={14} className="mr-1.5" aria-hidden="true" />
        Draft with AI
      </Button>

      {showAiInput && (
        <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border-subtle)" }}>
          <input
            type="text"
            className="glass-input"
            placeholder="What do you want to tell the patient?"
            value={aiIntent}
            onChange={(e) => setAiIntent(e.target.value)}
            aria-label="AI draft intent"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleAiDraft}
              disabled={!aiIntent.trim() || aiLoading}
            >
              {aiLoading && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" />}
              Generate
            </Button>
          </div>
        </div>
      )}

      {channel === "sms" && body.length > 0 && (
        <div className="flex items-center justify-between">
          <span
            className="font-mono-data text-caption"
            style={{
              color:
                (preview.segments?.count ?? 0) >= 2
                  ? "var(--state-warning)"
                  : "var(--text-muted)",
            }}
          >
            {charCountText}
          </span>
          {preview.softWarn && (
            <Badge variant="warning">
              This message may contain clinical details. SMS is not encrypted — review before sending.
            </Badge>
          )}
        </div>
      )}

      {preview.blocked && preview.blockReason && (
        <OptOutWarning
          channel={channel}
          reason={preview.blockReason}
          pausedUntil={consents.pausedUntil ?? undefined}
        />
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border px-3 py-2 text-xs"
          style={{
            borderColor: "rgba(248,113,113,0.25)",
            background: "rgba(248,113,113,0.08)",
            color: "var(--state-critical)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isSending}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleSend}
          disabled={sendDisabled}
          className={cn("min-h-[var(--touch-target)]")}
          aria-label="Send Message"
        >
          {isSending ? (
            <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" />
          ) : (
            <Send size={14} className="mr-2" aria-hidden="true" />
          )}
          Send Message
        </Button>
      </div>

      {isBulk && (
        <Dialog open={showBulkConfirm} onOpenChange={setShowBulkConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send to {bulkRecipientCount} patients?</DialogTitle>
              <DialogDescription>
                This will send {channel === "sms" ? "SMS" : "email"} messages to {bulkRecipientCount} patients.
                Review the rendered preview below before confirming.
              </DialogDescription>
            </DialogHeader>
            <div
              className="rounded-xl border p-3 text-sm"
              style={{
                borderColor: "var(--border-subtle)",
                background: "var(--bg-overlay)",
                color: "var(--text-secondary)",
              }}
            >
              {preview.rendered || body}
            </div>
            {bulkRecipients.length > 0 && (
              <p className="text-caption" style={{ color: "var(--text-muted)" }}>
                Confirmed recipients in store: {bulkRecipients.length}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowBulkConfirm(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSend} disabled={isSending}>
                {isSending && <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" />}
                Confirm Send
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
