"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ConfiguratorFooter } from "@/components/optical/configurator/ConfiguratorFooter";
import { FramePicker } from "@/components/optical/configurator/FramePicker";
import { LensConfigSection } from "@/components/optical/configurator/LensConfigSection";
import { MeasurementsSection } from "@/components/optical/configurator/MeasurementsSection";
import { RxSideBySidePanel } from "@/components/optical/configurator/RxSideBySidePanel";
import { VisionPlanSection } from "@/components/optical/configurator/VisionPlanSection";
import { getAuthHeaders } from "@/lib/api-client";
import { useLensCatalogStore } from "@/store/lensCatalogStore";
import { useOpticalOrderConfigStore } from "@/store/opticalOrderConfigStore";
import { useOpticalOrderStore } from "@/store/opticalOrderStore";

interface FieldError {
  path: string;
  code: string;
  message: string;
}

export default function OpticalOrderConfiguratorPage() {
  const { orderId } = useParams<{ orderId: string; tenant: string }>();
  const router = useRouter();
  const { draft, load, loadSuggestions, flush, suggestions } =
    useOpticalOrderConfigStore();
  const { loadAll: loadCatalogs } = useLensCatalogStore();

  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [placing, setPlacing] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      await load(orderId);
      if (cancelled) return;
      await loadSuggestions();
    })().catch(console.error);
    loadCatalogs().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [orderId, load, loadSuggestions, loadCatalogs]);

  if (!draft) {
    return (
      <div className="p-6 text-[var(--text-secondary)]">
        Loading configurator…
      </div>
    );
  }

  const habitualRefraction = draft.habitualRefraction;
  const finalRefraction = draft.finalRefraction;

  async function handlePlace() {
    setFieldErrors([]);
    setPlacing(true);
    try {
      await flush();
      const headers = await getAuthHeaders();
      const resp = await fetch(`/api/optical-orders/${draft!.id}/place/`, {
        method: "POST",
        headers,
      });
      if (resp.status === 400) {
        const detail = (await resp.json().catch(() => ({}))) as {
          detail?: { field_errors?: FieldError[] };
        };
        if (detail.detail?.field_errors) {
          setFieldErrors(detail.detail.field_errors);
        }
        return;
      }
      if (!resp.ok) {
        console.error(`place ${resp.status}`);
        return;
      }
      await load(draft!.id);
    } catch (e) {
      console.error(e);
    } finally {
      setPlacing(false);
    }
  }

  async function handleCancel() {
    // Plan 14-12: when the user backs out of a fresh draft, cancel the
    // backend row so it doesn't leak as a "Draft pending" pill on the
    // queue card. On failure we DO NOT navigate — surface an inline error
    // banner so the user can retry rather than silently leaking a draft.
    if (draft && draft.status === "draft") {
      try {
        setCancelError(null);
        await useOpticalOrderStore.getState().cancelOrder(draft.id);
      } catch (e) {
        const msg = (e as Error).message || "network error";
        console.error("Discard draft failed", msg);
        setCancelError(msg);
        return;
      }
    }
    router.back();
  }

  async function handleGenerateJobTicket() {
    if (draft!.status !== "placed") return;
    const headers = await getAuthHeaders();
    const resp = await fetch(`/api/optical-orders/${draft!.id}/job-ticket/`, {
      method: "POST",
      headers,
    });
    if (!resp.ok) {
      console.error(`job-ticket ${resp.status}`);
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `job-ticket-${draft!.id.slice(0, 8)}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    await load(draft!.id);
  }

  return (
    <div
      className="min-h-screen bg-[var(--bg-glass)] text-[var(--text-primary)]"
      onBlurCapture={() => {
        flush().catch(console.error);
      }}
    >
      <header className="border-b border-[var(--glass-border)] px-6 py-4">
        <h1 className="text-lg font-semibold">
          Configure Order — <span className="text-[var(--text-secondary)]">{draft.status}</span>
        </h1>
      </header>

      <div className="space-y-6 p-6">
        {/* Rx banner — full width at top */}
        <RxSideBySidePanel
          habitual={habitualRefraction}
          final={finalRefraction}
        />

        {/* Inline error banner — surfaces Discard draft failures so the user
            isn't silently stranded on the configurator. */}
        {cancelError && (
          <div
            role="alert"
            className="rounded border border-[var(--state-critical)] bg-[var(--accent-dim)] px-4 py-2 text-sm text-[var(--state-critical)]"
          >
            Could not discard draft: {cancelError}. Try again or close this tab manually.
          </div>
        )}

        {/* 2-column grid for configurator sections */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <FramePicker orderId={draft.id} fieldErrors={fieldErrors} />
            <LensConfigSection
              orderId={draft.id}
              suggestions={suggestions}
              fieldErrors={fieldErrors}
            />
          </div>
          <div className="space-y-6">
            <MeasurementsSection
              fitting={draft.fitting}
              fieldErrors={fieldErrors}
            />
            <VisionPlanSection visionPlan={draft.visionPlan} />
          </div>
        </div>
      </div>

      <ConfiguratorFooter
        status={draft.status}
        placing={placing}
        onPlace={handlePlace}
        onGenerateJobTicket={handleGenerateJobTicket}
        onCancel={handleCancel}
      />
    </div>
  );
}
