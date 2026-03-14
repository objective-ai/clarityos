"use client";

import { SOAPViewer } from "../validation-station/SOAPViewer";

interface StickySoapNoteProps {
  soapText: string;
  generatedAt?: string;
}

export function StickySoapNote({ soapText, generatedAt }: StickySoapNoteProps) {
  return (
    <div className="sticky top-0 h-[calc(100vh-160px)] flex flex-col rounded-xl overflow-hidden border border-[var(--glass-border)] bg-[var(--bg-surface)]">
      <SOAPViewer soapText={soapText} generatedAt={generatedAt} />
    </div>
  );
}
