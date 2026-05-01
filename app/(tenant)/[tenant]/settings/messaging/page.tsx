"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CostCapBar } from "@/components/messaging/CostCapBar";
import { TemplatesEditor } from "@/components/messaging/TemplatesEditor";
import { messagingApi } from "@/lib/api/messaging";
import type { MessageTemplate, MessagingSettings } from "@/types/messaging";

export default function MessagingSettingsPage() {
  const [tab, setTab] = useState<"templates" | "preferences">("templates");
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [settings, setSettings] = useState<MessagingSettings | null>(null);
  const [capDraft, setCapDraft] = useState(2500);
  const [enabledDraft, setEnabledDraft] = useState(false);

  useEffect(() => {
    Promise.all([messagingApi.getTemplates(), messagingApi.getSettings()]).then(
      ([t, s]) => {
        setTemplates(t);
        setSettings(s);
        setCapDraft(s.dailySmsCapCents ?? 2500);
        setEnabledDraft(s.messagingEnabled);
      },
    );
  }, []);

  async function handleSaveSettings() {
    const next = await messagingApi.updateSettings({
      messagingEnabled: enabledDraft,
      dailySmsCapCents: capDraft,
    });
    setSettings(next);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-heading">Messaging Settings</h1>
      <div
        className="flex gap-2 border-b border-[var(--glass-border)]"
        role="tablist"
      >
        {(["templates", "preferences"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-subhead ${
              tab === id ? "border-b-2 border-[var(--accent)]" : ""
            }`}
          >
            {id === "templates" ? "Templates" : "Preferences"}
          </button>
        ))}
      </div>
      {tab === "templates" && (
        <TemplatesEditor templates={templates} onChange={setTemplates} />
      )}
      {tab === "preferences" && settings && (
        <div className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <h2 className="text-subhead">Messaging Enabled</h2>
            </CardHeader>
            <CardContent>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={enabledDraft}
                  onChange={(e) => setEnabledDraft(e.target.checked)}
                />
                <span className="text-body">
                  Enable automated reminders + recall + manual messaging
                </span>
              </label>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader>
              <h2 className="text-subhead">Daily Cost Cap</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <CostCapBar spentCents={0} capCents={capDraft} />
              <input
                type="range"
                min={500}
                max={10000}
                step={500}
                value={capDraft}
                onChange={(e) => setCapDraft(Number(e.target.value))}
                className="w-full"
                aria-label="Daily cost cap dollars"
              />
              <p className="text-caption">
                ${(capDraft / 100).toFixed(2)} per day
              </p>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader>
              <h2 className="text-subhead">Quiet Hours</h2>
            </CardHeader>
            <CardContent>
              <p className="text-body text-[var(--text-secondary)]">
                Messages are sent only between 8:00 AM and 9:00 PM patient-local time. (Per-clinic override coming soon.)
              </p>
            </CardContent>
          </Card>
          <Button onClick={handleSaveSettings}>Save Preferences</Button>
        </div>
      )}
    </div>
  );
}
