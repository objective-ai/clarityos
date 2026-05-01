"use client";

import { Button } from "@/components/ui/button";
import { MessageSquare, X } from "lucide-react";
import { useMessagingStore, type BulkRecipientStub } from "@/store/messagingStore";

interface Props {
  selectedAppointmentIds: string[];
  selectedPatientData: BulkRecipientStub[];
  onClearSelection: () => void;
}

const MAX_BULK = 50;

export function BulkSelectToolbar({
  selectedAppointmentIds,
  selectedPatientData,
  onClearSelection,
}: Props) {
  const openComposer = useMessagingStore((s) => s.openComposer);
  const setBulkRecipients = useMessagingStore((s) => s.setBulkRecipients);
  const count = selectedAppointmentIds.length;
  if (count === 0) return null;
  const exceeds = count > MAX_BULK;

  function handleOpenBulkComposer() {
    setBulkRecipients(selectedPatientData);
    openComposer(`bulk:${Date.now()}`, "bulk");
  }

  return (
    <div role="toolbar" className="glass-card flex items-center justify-between p-4 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <span className="text-subhead">{count} selected</span>
        {exceeds && (
          <span className="text-caption text-[var(--state-critical)]">
            Max {MAX_BULK} per send — please reduce selection
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          disabled={exceeds || count === 0}
          onClick={handleOpenBulkComposer}
          className="min-h-[var(--touch-target)]"
        >
          <MessageSquare className="w-4 h-4 mr-2" aria-hidden />
          Send Message ({count})
        </Button>
        <Button variant="ghost" onClick={onClearSelection} aria-label="Clear selection">
          <X className="w-4 h-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
