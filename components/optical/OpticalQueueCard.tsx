"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { useOpticalStore } from "@/store/opticalStore";
import type { OpticalQueueItem, OpticalStatus } from "@/types/optical";
import { formatClinicTime, formatClinicDate, useClinicTimezone } from "@/lib/timezone";
import { CreateWalkInOrderModal } from "@/components/orders/CreateWalkInOrderModal";
import { Entitlement } from "@/lib/entitlements";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useCurrentUser } from "@/store/sessionStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRx(
  sphere: number | null,
  cylinder: number | null,
  axis: number | null
): string {
  if (sphere == null) return "--";
  const s = Number(sphere);
  if (isNaN(s)) return "--";
  const sph = s >= 0 ? `+${s.toFixed(2)}` : s.toFixed(2);
  if (cylinder == null || Number(cylinder) === 0) return sph;
  const c = Number(cylinder);
  if (isNaN(c)) return sph;
  const cyl = c >= 0 ? `+${c.toFixed(2)}` : c.toFixed(2);
  return `${sph} / ${cyl} x ${axis ?? "--"}`;
}

function formatAdd(add: number | null): string {
  if (add == null) return "--";
  const a = Number(add);
  if (isNaN(a)) return "--";
  return `+${a.toFixed(2)}`;
}

function formatPd(
  pdDistance: number | null,
  pdNear: number | null,
  pdOd: number | null,
  pdOs: number | null
): string {
  if (pdOd != null && pdOs != null) {
    return `${Number(pdOd).toFixed(1)} / ${Number(pdOs).toFixed(1)} mm (mono)`;
  }
  if (pdDistance != null) {
    const near = pdNear != null ? ` / ${Number(pdNear).toFixed(1)} near` : "";
    return `${Number(pdDistance).toFixed(1)}${near} mm`;
  }
  return "--";
}

function formatTime(isoString: string, tz: string): string {
  return formatClinicTime(isoString, tz);
}

function formatDob(dob: string): string {
  return formatClinicDate(dob);
}

const STATUS_CONFIG: Record<
  OpticalStatus,
  { label: string; variant: "default" | "warning" | "success" }
> = {
  waiting: { label: "Waiting", variant: "warning" },
  in_progress: { label: "In Progress", variant: "default" },
  dispensed: { label: "Dispensed", variant: "success" },
};

const STATUS_TRANSITIONS: Record<OpticalStatus, OpticalStatus | null> = {
  waiting: "in_progress",
  in_progress: "dispensed",
  dispensed: null,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface OpticalQueueCardProps {
  item: OpticalQueueItem;
}

export function OpticalQueueCard({ item }: OpticalQueueCardProps) {
  const tz = useClinicTimezone();
  const updateItemStatus = useOpticalStore((s) => s.updateItemStatus);
  const openPrintPreview = useOpticalStore((s) => s.openPrintPreview);
  const fetchQueue = useOpticalStore((s) => s.fetchQueue);

  const { has } = useEntitlements();
  const currentUser = useCurrentUser();
  const role = (currentUser?.role ?? "").toLowerCase();
  const canCreateOrder =
    has(Entitlement.RETAIL_POS) &&
    ["owner", "admin", "technician", "receptionist"].includes(role);

  const [orderModalOpen, setOrderModalOpen] = useState(false);

  const statusConfig = STATUS_CONFIG[item.status];
  const nextStatus = STATUS_TRANSITIONS[item.status];

  const handleAdvanceStatus = () => {
    if (nextStatus) {
      updateItemStatus(item.encounterId, nextStatus);
    }
  };

  return (
    <Card data-testid="optical-queue-card" className="glass-card glass-card-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold">
              {item.patientLastName}, {item.patientFirstName}
            </CardTitle>
            <div className="text-caption text-[var(--text-secondary)] mt-0.5">
              DOB: {formatDob(item.patientDob)}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {item.rxChangeAlert.hasChange && (
              <Badge variant="warning" className="text-xs font-medium animate-pulse">
                Rx Changed &gt;0.50D
              </Badge>
            )}
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Provider + time */}
        <div className="flex items-center justify-between text-caption text-[var(--text-secondary)]">
          <span>
            Dr. {item.providerName}
            {item.providerLicenseNumber && (
              <span className="ml-1 opacity-60">
                (Lic# {item.providerLicenseNumber})
              </span>
            )}
          </span>
          <span>Finalized {formatTime(item.finalizedAt, tz)}</span>
        </div>

        {/* Rx table */}
        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-overline text-[var(--text-muted)]"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <th className="text-left px-3 py-1.5">Eye</th>
                <th className="text-left px-3 py-1.5">Sphere / Cyl x Axis</th>
                <th className="text-left px-3 py-1.5">Add</th>
                <th className="text-left px-3 py-1.5">VA</th>
              </tr>
            </thead>
            <tbody className="text-[var(--text-primary)] font-mono text-xs">
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-1.5 font-semibold text-[var(--accent)]">OD</td>
                <td className="px-3 py-1.5">
                  {formatRx(item.od.sphere, item.od.cylinder, item.od.axis)}
                </td>
                <td className="px-3 py-1.5">{formatAdd(item.od.add)}</td>
                <td className="px-3 py-1.5">{item.od.visualAcuity ?? "--"}</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 font-semibold text-[var(--accent)]">OS</td>
                <td className="px-3 py-1.5">
                  {formatRx(item.os.sphere, item.os.cylinder, item.os.axis)}
                </td>
                <td className="px-3 py-1.5">{formatAdd(item.os.add)}</td>
                <td className="px-3 py-1.5">{item.os.visualAcuity ?? "--"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* PD */}
        <div className="text-caption text-[var(--text-secondary)]">
          PD: {formatPd(item.pdDistance, item.pdNear, item.pdOd, item.pdOs)}
        </div>

        {/* Rx Change Alert detail */}
        {item.rxChangeAlert.hasChange && (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.2)",
              color: "var(--text-primary)",
            }}
          >
            <span className="font-semibold" style={{ color: "#FBBF24" }}>
              Rx Change Alert:
            </span>{" "}
            {item.rxChangeAlert.message}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openPrintPreview(item.encounterId)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="mr-1.5"
            >
              <rect
                x="3"
                y="1"
                width="8"
                height="4"
                rx="0.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="1"
                y="5"
                width="12"
                height="6"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="3.5"
                y="9"
                width="7"
                height="4"
                rx="0.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
            Print Rx
          </Button>

          {nextStatus && (
            <Button variant="default" size="sm" onClick={handleAdvanceStatus}>
              {nextStatus === "in_progress"
                ? "Start Processing"
                : "Mark Dispensed"}
            </Button>
          )}

          {canCreateOrder && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setOrderModalOpen(true)}
            >
              + Create Order
            </Button>
          )}
        </div>
      </CardContent>

      <CreateWalkInOrderModal
        open={orderModalOpen}
        patientId={item.patientId}
        encounterId={item.encounterId}
        onClose={() => {
          setOrderModalOpen(false);
          void fetchQueue();
        }}
        onCreated={(_created, warnings) => {
          if (warnings && warnings.length > 0) {
            alert(
              `Order placed with warning:\n\n${warnings
                .map((w) => `• ${w.message}`)
                .join("\n")}`,
            );
          }
        }}
      />
    </Card>
  );
}
