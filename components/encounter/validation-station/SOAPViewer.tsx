"use client";

import { highlightSOAP } from "./soap-highlighter";
import { formatClinicTime, useClinicTimezone } from "@/lib/timezone";

interface SOAPViewerProps {
  soapText: string;
  generatedAt?: string;
}

export function SOAPViewer({ soapText, generatedAt }: SOAPViewerProps) {
  const tz = useClinicTimezone();
  // Split SOAP text into sections and render with highlighting
  const lines = soapText.split("\n");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI-Generated Note</h3>
        {generatedAt && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            {formatClinicTime(generatedAt, tz)}
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-5 py-2 border-b border-[var(--glass-border)] bg-[var(--bg-glass)]">
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-[#2DD4BF]" /> Measurements
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-[#22C55E]" /> ICD-10
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-[#60A5FA]" /> Anatomy
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <span className="w-2 h-2 rounded-full bg-[#F97316]" /> Refraction
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-[var(--text-secondary)]">
          {lines.map((line, i) => {
            // Style SOAP section headers
            const isHeader = /^(SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN):/.test(line);
            if (isHeader) {
              return (
                <div key={i} className="mt-4 first:mt-0 mb-1">
                  <span className="text-[var(--text-primary)] font-bold text-xs tracking-wide">
                    {line}
                  </span>
                </div>
              );
            }
            return (
              <div key={i}>
                {highlightSOAP(line)}
                {"\n"}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
