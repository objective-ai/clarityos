"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { InboxItem } from "@/components/messaging/InboxItem";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { useMessagingStore } from "@/store/messagingStore";
import { messagingApi } from "@/lib/api/messaging";
import type {
  InboundMessage,
  ChannelPreference,
  MessageTemplate,
} from "@/types/messaging";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "reschedule_request", label: "Reschedule" },
  { id: "cancellation", label: "Cancellation" },
  { id: "question_clinical", label: "Question" },
  { id: "thank_you", label: "Other" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

export default function InboxPage() {
  const [items, setItems] = useState<InboundMessage[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<ChannelPreference | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isComposerOpen = useMessagingStore((s) => s.isComposerOpen);
  const composerPatientId = useMessagingStore((s) => s.composerPatientId);
  const openComposer = useMessagingStore((s) => s.openComposer);
  const closeComposer = useMessagingStore((s) => s.closeComposer);
  const setInboxUnreadCount = useMessagingStore((s) => s.setInboxUnreadCount);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    const f = filter === "all" ? undefined : filter;
    Promise.all([messagingApi.getInbox(f), messagingApi.getTemplates()])
      .then(([m, t]) => {
        if (!alive) return;
        setItems(m);
        setTemplates(t);
        setInboxUnreadCount(m.filter((x) => !x.isRead).length);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load inbox",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filter, setInboxUnreadCount]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter(
      (m) =>
        m.body.toLowerCase().includes(lower) || m.fromE164.includes(search),
    );
  }, [items, search]);

  const selected = items.find((x) => x.id === selectedId) ?? null;

  useEffect(() => {
    if (selected?.patientId) {
      messagingApi
        .getPreferences(selected.patientId)
        .then(setPrefs)
        .catch(() => setPrefs(null));
    } else {
      setPrefs(null);
    }
  }, [selected?.patientId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-4 h-[calc(100vh-120px)]">
      <Card className="glass-card flex flex-col">
        <div className="p-4 border-b border-[var(--glass-border)]">
          <div className="relative mb-3">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
              aria-hidden
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search messages…"
              aria-label="Search messages"
              className="glass-input w-full pl-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                role="tab"
                aria-selected={filter === f.id}
                className={`px-3 py-1 text-caption uppercase tracking-widest rounded-full
                  ${
                    filter === f.id
                      ? "bg-[var(--accent)] text-[var(--bg-base)]"
                      : "text-[var(--text-secondary)]"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <CardContent className="flex-1 overflow-y-auto p-0">
          {loading ? (
            <div className="p-4">Loading…</div>
          ) : loadError ? (
            <div className="p-4" role="alert">
              <p className="text-body text-[var(--state-critical)]">
                Couldn't load inbox: {loadError}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-subhead mb-2">No messages yet</p>
              <p className="text-body text-[var(--text-secondary)]">
                Patient replies and inbound messages will appear here. Send a message to get started.
              </p>
            </div>
          ) : (
            filtered.map((m) => (
              <InboxItem
                key={m.id}
                inbound={m}
                patientName={null}
                isSelected={m.id === selectedId}
                onClick={() => setSelectedId(m.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card className="glass-card flex flex-col">
        {selected ? (
          <>
            <div className="p-4 border-b border-[var(--glass-border)]">
              <h2 className="text-subhead">{selected.fromE164}</h2>
              {selected.classification && (
                <span className="text-caption text-[var(--state-info)]">
                  {selected.classification}
                </span>
              )}
            </div>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="bg-[var(--bg-overlay)] rounded p-3 max-w-[80%]">
                <p className="text-body">{selected.body}</p>
                <p className="text-caption text-[var(--text-muted)] mt-2">
                  {new Date(selected.receivedAt).toLocaleString()}
                </p>
              </div>
            </CardContent>
            {selected.patientId && (
              <div className="p-4 border-t border-[var(--glass-border)]">
                <Button
                  onClick={() => openComposer(selected.patientId!, "inbox_reply")}
                  className="w-full min-h-[var(--touch-target)]"
                >
                  Reply
                </Button>
              </div>
            )}
          </>
        ) : (
          <CardContent className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
            <p className="text-body">Select a message to view the thread</p>
          </CardContent>
        )}
      </Card>

      {isComposerOpen && composerPatientId && prefs && (
        <MessageComposer
          patientId={composerPatientId}
          patientFirstName=""
          consents={prefs.consents}
          templates={templates}
          onSend={async (payload) => {
            await messagingApi.sendMessage({
              patient_id: composerPatientId,
              channel: payload.channel,
              body: payload.body,
              template_id: payload.templateId,
            });
            const inbox = await messagingApi.getInbox(
              filter === "all" ? undefined : filter,
            );
            setItems(inbox);
          }}
          onClose={closeComposer}
        />
      )}
    </div>
  );
}
