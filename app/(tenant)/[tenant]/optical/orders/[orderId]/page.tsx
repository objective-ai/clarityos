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

  // refraction objects loaded via OpticalOrder.final_refraction /
  // habitual_refraction relationships when the BE response includes them.
  const habitualRefraction = (draft as any).habitualRefraction ?? null;
  const finalRefraction = (draft as any).finalRefraction ?? null;

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

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
        <div>
          <RxSideBySidePanel
            habitual={habitualRefraction}
            final={finalRefraction}
          />
        </div>
        <div className="space-y-6">
          <FramePicker orderId={draft.id} fieldErrors={fieldErrors} />
          <LensConfigSection
            orderId={draft.id}
            suggestions={suggestions}
            fieldErrors={fieldErrors}
          />
          <MeasurementsSection
            fitting={draft.fitting}
            fieldErrors={fieldErrors}
          />
          <VisionPlanSection visionPlan={draft.visionPlan} />
        </div>
      </div>

      <ConfiguratorFooter
        status={draft.status}
        placing={placing}
        onPlace={handlePlace}
        onGenerateJobTicket={handleGenerateJobTicket}
        onCancel={() => router.back()}
      />
    </div>
  );
}
