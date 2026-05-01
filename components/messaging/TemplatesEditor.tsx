"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { scanForPhi } from "@/lib/messaging";
import { messagingApi } from "@/lib/api/messaging";
import type { MessageTemplate } from "@/types/messaging";

interface Props {
  templates: MessageTemplate[];
  onChange: (next: MessageTemplate[]) => void;
}

export function TemplatesEditor({ templates, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [filterLang, setFilterLang] = useState<"en" | "es">("en");

  const filtered = templates.filter((t) => t.language === filterLang);

  async function handleSave(t: MessageTemplate) {
    const next = await messagingApi.updateTemplate(t.id, { body: draftBody });
    onChange(templates.map((x) => (x.id === t.id ? next : x)));
    setEditingId(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["en", "es"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setFilterLang(l)}
            aria-pressed={filterLang === l}
            className={`px-3 py-1 text-caption rounded ${
              filterLang === l
                ? "bg-[var(--accent)] text-[var(--bg-base)]"
                : ""
            }`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      {filtered.map((t) => {
        const isEditing = editingId === t.id;
        const body = isEditing ? draftBody : t.body;
        const phi =
          t.channel === "sms" && t.kind.startsWith("reminder_")
            ? scanForPhi(body)
            : null;
        return (
          <Card key={t.id} className="glass-card">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-subhead">
                  {t.kind} — {t.channel.toUpperCase()}
                </h3>
                <Badge variant={t.isDefault ? "secondary" : "outline"}>
                  {t.isDefault ? "default" : "custom"}
                </Badge>
              </div>
              {isEditing ? (
                <textarea
                  className="glass-input w-full min-h-[100px]"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  aria-label={`${t.kind} body`}
                />
              ) : (
                <pre className="text-body whitespace-pre-wrap p-2 bg-[var(--bg-overlay)] rounded">
                  {t.body}
                </pre>
              )}
              {phi?.hasPhi && (
                <p
                  role="alert"
                  className="text-caption text-[var(--state-warning)]"
                >
                  Detected: {phi.matches.join(", ")} — operational SMS will be blocked at send time.
                </p>
              )}
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button size="sm" onClick={() => handleSave(t)}>
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(t.id);
                      setDraftBody(t.body);
                    }}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
