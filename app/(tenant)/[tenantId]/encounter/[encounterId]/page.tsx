"use client";

import { useState, useEffect } from "react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Entitlement, ENTITLEMENT_META } from "@/lib/entitlements";
import type { EntitlementKey } from "@/types/session";
import { useEncounterStore } from "@/store/encounterStore";
import { RefractionGrid } from "@/components/encounter/RefractionGrid";
import { ExamFindings } from "@/components/encounter/ExamFindings";
import { DiagnosisPicker } from "@/components/encounter/DiagnosisPicker";
import { DEMO_REFRACTIONS } from "@/lib/mock-refraction-data";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Vitals Card
// ---------------------------------------------------------------------------

function VitalsCard({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const vitals = {
    iop_od: "23",
    iop_os: "18",
    ucva_od: "20/200",
    ucva_os: "20/100",
    bcva_od: "20/25",
    bcva_os: "20/20",
    blood_pressure: "128/82",
    pulse: "72",
  };

  const isElevated = (val: string) => parseFloat(val) > 21;

  return (
    <Card className={isReadOnly ? "opacity-75" : ""}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Vitals &amp; Pre-Test</CardTitle>
          <CardDescription>Recorded by technician</CardDescription>
        </div>
        {isReadOnly && (
          <Badge variant="outline" className="gap-1.5 text-[var(--text-muted)]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1.5" y="5.5" width="9" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Locked
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* IOP */}
          <div className="rounded-xl p-5 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
            <div className="text-overline mb-4">Intraocular Pressure</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { eye: "OD", val: vitals.iop_od },
                { eye: "OS", val: vitals.iop_os },
              ].map(({ eye, val }) => {
                const elevated = isElevated(val);
                return (
                  <div
                    key={eye}
                    className={`flex flex-col items-center p-4 rounded-xl border ${
                      elevated
                        ? "bg-[rgba(251,191,36,0.06)] border-[rgba(251,191,36,0.20)]"
                        : "bg-[var(--bg-elevated)] border-[var(--border-subtle)]"
                    }`}
                  >
                    <span className="text-overline">{eye}</span>
                    <span
                      className={`text-3xl data-value my-1 ${
                        elevated ? "text-[var(--state-warning)]" : ""
                      }`}
                    >
                      {val}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      mmHg {elevated && (
                        <Badge variant="warning" className="ml-1 text-[10px] px-1.5 py-0">elevated</Badge>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Visual Acuity */}
          <div className="rounded-xl p-5 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
            <div className="text-overline mb-4">Visual Acuity</div>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left pb-2 text-overline">Measure</th>
                  <th className="text-center pb-2 text-overline">OD</th>
                  <th className="text-center pb-2 text-overline">OS</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "UCVA", od: vitals.ucva_od, os: vitals.ucva_os },
                  { label: "BCVA", od: vitals.bcva_od, os: vitals.bcva_os },
                ].map((row) => (
                  <tr key={row.label} className="border-t border-[var(--border-subtle)]">
                    <td className="py-2.5 text-overline" style={{ textTransform: "none" }}>{row.label}</td>
                    <td className="py-2.5 text-center text-base data-value">{row.od}</td>
                    <td className="py-2.5 text-center text-base data-value">{row.os}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--border-subtle)]">
                  <td className="py-2.5 text-overline" style={{ textTransform: "none" }}>BP</td>
                  <td colSpan={2} className="py-2.5 text-center text-base data-value">{vitals.blood_pressure}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// UpsellModal
// ---------------------------------------------------------------------------

interface UpsellModalProps {
  feature: EntitlementKey;
  onClose: () => void;
}

function UpsellModal({ feature, onClose }: UpsellModalProps) {
  const meta = ENTITLEMENT_META[feature];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm glass-card animate-slide-down overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-start justify-between gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[var(--accent-dim)] border border-[var(--mono-border)]">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 2L10.8 6.5H15.5L11.8 9.2L13.5 14L9 11L4.5 14L6.2 9.2L2.5 6.5H7.2L9 2Z" stroke="var(--accent)" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-overline text-[var(--accent)] mb-1">{meta.plan} Feature</div>
              <h3 className="text-subhead">{meta.label}</h3>
            </div>
            <button onClick={onClose} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              &times;
            </button>
          </div>
        </div>

        <div className="px-5 py-5">
          <p className="text-body mb-4">{meta.description}</p>
          <div className="rounded-xl p-4 mb-4 bg-[var(--bg-glass)] border border-[var(--glass-border)]">
            <div className="text-overline mb-2">What you unlock:</div>
            <ul className="space-y-2">
              {feature === "ai_scribe" && [
                "AI-generated SOAP notes in seconds",
                "Saves 12\u201315 min per encounter",
                "Learns your documentation style",
                "Streams directly into your text fields",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-caption text-[var(--text-secondary)]">
                  <span className="text-[var(--state-normal)]">&check;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <button className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110">
            Upgrade to {meta.plan} &rarr;
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 text-xs mt-2 hover-btn text-[var(--text-muted)]"
          >
            Not right now
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Scribe Widget
// ---------------------------------------------------------------------------

function AiScribeWidget() {
  const { has } = useEntitlements();
  const hasAiScribe = has(Entitlement.AI_SCRIBE);
  const [showUpsell, setShowUpsell] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);

  const handleGenerate = () => {
    if (!hasAiScribe) {
      setShowUpsell(true);
      return;
    }
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setGenerated(
        "SUBJECTIVE: Patient presents for comprehensive eye examination. Chief complaint: blurred vision at distance. " +
        "Denies diplopia, pain, or flashes.\n\n" +
        "OBJECTIVE: IOP OD 23 mmHg (elevated), OS 18 mmHg. UCVA 20/200 OD, 20/100 OS. " +
        "BCVA 20/25 OD, 20/20 OS with manifest refraction.\n\n" +
        "ASSESSMENT: Myopia, progressive (H52.13). Elevated IOP OD \u2014 glaucoma suspect (H40.001). " +
        "Recommend OCT optic nerve and visual fields.\n\n" +
        "PLAN: Updated spectacle prescription dispensed. Refer for glaucoma workup. Follow-up 6 months."
      );
    }, 2500);
  };

  return (
    <>
      <Card className={hasAiScribe ? "glass-card-accent" : ""}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>AI Scribe</CardTitle>
            <CardDescription>
              {hasAiScribe ? "Generate SOAP note from encounter data" : "Premium feature \u2014 upgrade to unlock"}
            </CardDescription>
          </div>
          <Badge variant={hasAiScribe ? "default" : "outline"}>
            {hasAiScribe ? "Premium" : "Locked"}
          </Badge>
        </CardHeader>
        <CardContent>
          {!generated ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
                  hasAiScribe
                    ? "bg-[var(--accent-dim)] border-[var(--mono-border)]"
                    : "bg-[var(--bg-elevated)] border-[var(--border-subtle)]"
                }`}
              >
                {isGenerating ? (
                  <div className="w-6 h-6 rounded-full border-2 animate-spin-arc border-[var(--accent)] border-t-transparent" />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <path
                      d="M11 3L13 8.5H18.5L14 11.8L16 17.5L11 14L6 17.5L8 11.8L3.5 8.5H9L11 3Z"
                      stroke={hasAiScribe ? "var(--accent)" : "var(--text-muted)"}
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>

              <div className="text-center">
                <p className="text-subhead mb-1">
                  {isGenerating ? "Generating SOAP note…" : "Generate AI Visit Summary"}
                </p>
                <p className="text-caption text-[var(--text-muted)]">
                  {isGenerating
                    ? "Analyzing vitals, refractions, and findings…"
                    : hasAiScribe
                    ? "Analyzes the full encounter and writes structured clinical notes"
                    : "Saves 12\u201315 minutes of documentation time per exam"}
                </p>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                  hasAiScribe
                    ? "bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)]"
                    : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-default)] hover-btn"
                }`}
              >
                {hasAiScribe ? (isGenerating ? "Generating…" : "Generate Note") : "Upgrade to Unlock"}
              </button>
            </div>
          ) : (
            <div>
              <pre className="text-xs leading-relaxed whitespace-pre-wrap p-5 rounded-xl font-mono bg-[var(--bg-glass)] text-[var(--text-secondary)] border border-[var(--glass-border)]">
                {generated}
              </pre>
              <div className="flex items-center gap-2 mt-4">
                <button className="text-xs px-4 py-2 rounded-xl font-medium bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--mono-border)] hover:bg-[var(--accent-strong)] transition-all">
                  {"\u2713"} Accept note
                </button>
                <button
                  onClick={() => setGenerated(null)}
                  className="text-xs px-4 py-2 rounded-xl font-medium text-[var(--text-muted)] border border-[var(--border-subtle)] hover-btn"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {showUpsell && (
        <UpsellModal
          feature={Entitlement.AI_SCRIBE}
          onClose={() => setShowUpsell(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function EncounterPage({
  params,
}: {
  params: { tenantId: string; encounterId: string };
}) {
  const initEncounter = useEncounterStore((s) => s.initEncounter);
  const encounterState = useEncounterStore((s) => s.encounters[params.encounterId]);
  const isFinalized = encounterState?.isFinalized ?? false;

  // Initialize encounter in store on mount (layout doesn't own this)
  useEffect(() => {
    initEncounter(params.encounterId, {
      status: "pre_test",
      encounterDate: new Date().toISOString().slice(0, 10),
      providerName: "Dr. Sarah Lin, OD",
      iopOdElevated: true,
      iopOsElevated: false,
    });
  }, [params.encounterId, initEncounter]);

  return (
    <div className="flex flex-col gap-6 stagger">
      {/* Finalized banner */}
      {isFinalized && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.20)] text-sm text-[var(--state-normal)]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
            <rect x="2.5" y="7" width="11" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="font-medium">This encounter has been finalized.</span>
          <span className="text-[var(--text-secondary)]">All fields are locked.</span>
        </div>
      )}

      <VitalsCard isReadOnly={isFinalized} />

      {/* Refraction */}
      <Card>
        <CardContent className="p-6">
          <RefractionGrid
            encounterId={params.encounterId}
            initialRefractions={DEMO_REFRACTIONS}
            isReadOnly={isFinalized}
          />
        </CardContent>
      </Card>

      {/* Exam Findings + Diagnoses — side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <ExamFindings encounterId={params.encounterId} isReadOnly={isFinalized} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <DiagnosisPicker encounterId={params.encounterId} isReadOnly={isFinalized} />
          </CardContent>
        </Card>
      </div>

      <AiScribeWidget />
    </div>
  );
}
