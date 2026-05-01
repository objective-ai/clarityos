"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import { MessageTimeline } from "@/components/messaging/MessageTimeline";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { ChannelPreferenceChip } from "@/components/messaging/ChannelPreferenceChip";
import { useMessagingStore } from "@/store/messagingStore";
import { messagingApi } from "@/lib/api/messaging";
import type {
  MessageLog,
  ChannelPreference,
  MessageTemplate,
} from "@/types/messaging";

interface Props {
  patientId: string;
  patientFirstName: string;
}

export function MessagesTab({ patientId, patientFirstName }: Props) {
  const [history, setHistory] = useState<MessageLog[]>([]);
  const [prefs, setPrefs] = useState<ChannelPreference | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isComposerOpen = useMessagingStore((s) => s.isComposerOpen);
  const composerPatientId = useMessagingStore((s) => s.composerPatientId);
  const openComposer = useMessagingStore((s) => s.openComposer);
  const closeComposer = useMessagingStore((s) => s.closeComposer);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      messagingApi.getHistory(patientId),
      messagingApi.getPreferences(patientId),
      messagingApi.getTemplates(),
    ])
      .then(([h, p, t]) => {
        if (!alive) return;
        setHistory(h);
        setPrefs(p);
        setTemplates(t);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load messages",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [patientId]);

  const isComposerForThisPatient =
    isComposerOpen && composerPatientId === patientId;

  async function handleSend(payload: {
    body: string;
    subject?: string;
    channel: string;
    templateId?: string;
  }) {
    await messagingApi.sendMessage({
      patient_id: patientId,
      channel: payload.channel,
      body: payload.body,
      template_id: payload.templateId,
    });
    const h = await messagingApi.getHistory(patientId);
    setHistory(h);
  }

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6">Loading messages…</CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6" role="alert">
          <p className="text-body text-[var(--state-critical)]">
            Couldn't load messages: {loadError}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-subhead">Messages</h2>
            {prefs && (
              <ChannelPreferenceChip
                consents={prefs.consents}
                preferredChannel={prefs.preferredChannel}
              />
            )}
          </div>
          <Button
            onClick={() => openComposer(patientId, "patient_header")}
            className="min-h-[var(--touch-target)]"
          >
            <MessageSquare className="w-4 h-4 mr-2" aria-hidden />
            Send Message
          </Button>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-subhead mb-2">
                No messages sent to this patient yet
              </p>
              <p className="text-body text-[var(--text-secondary)]">
                Use the Message button above to send an appointment reminder or note.
              </p>
            </div>
          ) : (
            <MessageTimeline messages={history} />
          )}
        </CardContent>
      </Card>

      {isComposerForThisPatient && prefs && (
        <MessageComposer
          patientId={patientId}
          patientFirstName={patientFirstName}
          consents={prefs.consents}
          templates={templates}
          onSend={handleSend}
          onClose={closeComposer}
        />
      )}
    </div>
  );
}
