"use client";

import { useOpticalStore } from "@/store/opticalStore";
import { Button } from "@/components/ui/button";
import type { RxPdfData } from "@/types/optical";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRxValue(val: number | null): string {
  if (val == null) return "--";
  const v = Number(val);
  if (isNaN(v)) return "--";
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

function formatAxis(axis: number | null): string {
  if (axis == null) return "--";
  return String(axis).padStart(3, "0");
}

function formatPd(data: RxPdfData): string {
  if (data.pdOd != null && data.pdOs != null) {
    return `OD: ${Number(data.pdOd).toFixed(1)} mm / OS: ${Number(data.pdOs).toFixed(1)} mm`;
  }
  if (data.pdDistance != null) {
    const near = data.pdNear != null ? ` / Near: ${Number(data.pdNear).toFixed(1)} mm` : "";
    return `Distance: ${Number(data.pdDistance).toFixed(1)} mm${near}`;
  }
  return "Not recorded";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Print handler
// ---------------------------------------------------------------------------

function handlePrint() {
  window.print();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RxPrintView() {
  const rxPdfData = useOpticalStore((s) => s.rxPdfData);
  const isPrintPreviewOpen = useOpticalStore((s) => s.isPrintPreviewOpen);
  const closePrintPreview = useOpticalStore((s) => s.closePrintPreview);

  if (!isPrintPreviewOpen) return null;

  if (!rxPdfData) {
    return (
      <>
        <div
          className="fixed inset-0 z-50 print:hidden"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={closePrintPreview}
        />
        <div className="fixed inset-4 z-50 flex items-center justify-center">
          <div className="glass-card p-8 text-center">
            <p className="text-[var(--text-secondary)] mb-4">No prescription data available for this encounter.</p>
            <Button variant="outline" size="sm" onClick={closePrintPreview}>
              Close
            </Button>
          </div>
        </div>
      </>
    );
  }

  const data = rxPdfData;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 print:hidden"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={closePrintPreview}
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex items-start justify-center overflow-y-auto print:static print:inset-0">
        {/* Action bar (hidden in print) */}
        <div className="w-full max-w-[700px]">
          <div className="flex items-center justify-between mb-3 print:hidden">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Rx Print Preview
            </h2>
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm" onClick={handlePrint}>
                Print Prescription
              </Button>
              <Button variant="outline" size="sm" onClick={closePrintPreview}>
                Close
              </Button>
            </div>
          </div>

          {/* Printable Rx document */}
          <div
            id="rx-print-area"
            className="bg-white text-black rounded-lg shadow-xl p-8 print:shadow-none print:rounded-none print:p-6"
            style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
          >
            {/* Header */}
            <div className="text-center border-b-2 border-black pb-4 mb-6">
              <h1 className="text-2xl font-bold tracking-wide">{data.clinicName}</h1>
              {data.clinicAddress && (
                <p className="text-sm mt-1">{data.clinicAddress}</p>
              )}
              {data.clinicPhone && (
                <p className="text-sm">{data.clinicPhone}</p>
              )}
              <p className="text-lg font-semibold mt-3 tracking-widest uppercase">
                Ophthalmic Lens Prescription
              </p>
            </div>

            {/* Patient info */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <span className="font-semibold">Patient: </span>
                {data.patientFirstName} {data.patientLastName}
              </div>
              <div>
                <span className="font-semibold">Date of Birth: </span>
                {formatDate(data.patientDob)}
              </div>
              <div>
                <span className="font-semibold">Date of Examination: </span>
                {formatDate(data.encounterDate)}
              </div>
              <div>
                <span className="font-semibold">Expiration Date: </span>
                {formatDate(data.expirationDate)}
              </div>
            </div>

            {/* Rx table */}
            <table className="w-full border-collapse mb-6">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-3 py-2 text-left text-sm font-semibold">
                    Eye
                  </th>
                  <th className="border border-gray-400 px-3 py-2 text-center text-sm font-semibold">
                    Sphere
                  </th>
                  <th className="border border-gray-400 px-3 py-2 text-center text-sm font-semibold">
                    Cylinder
                  </th>
                  <th className="border border-gray-400 px-3 py-2 text-center text-sm font-semibold">
                    Axis
                  </th>
                  <th className="border border-gray-400 px-3 py-2 text-center text-sm font-semibold">
                    Add
                  </th>
                  <th className="border border-gray-400 px-3 py-2 text-center text-sm font-semibold">
                    Prism
                  </th>
                  <th className="border border-gray-400 px-3 py-2 text-center text-sm font-semibold">
                    VA
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-400 px-3 py-2 font-bold text-sm">
                    OD (Right)
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {formatRxValue(data.od.sphere)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {formatRxValue(data.od.cylinder)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {formatAxis(data.od.axis)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {formatRxValue(data.od.add)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {data.od.prism != null
                      ? `${data.od.prism} ${data.od.prismBase ?? ""}`
                      : "--"}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center text-sm">
                    {data.od.visualAcuity ?? "--"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-400 px-3 py-2 font-bold text-sm">
                    OS (Left)
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {formatRxValue(data.os.sphere)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {formatRxValue(data.os.cylinder)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {formatAxis(data.os.axis)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {formatRxValue(data.os.add)}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center font-mono text-sm">
                    {data.os.prism != null
                      ? `${data.os.prism} ${data.os.prismBase ?? ""}`
                      : "--"}
                  </td>
                  <td className="border border-gray-400 px-3 py-2 text-center text-sm">
                    {data.os.visualAcuity ?? "--"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* PD */}
            <div className="mb-6 text-sm">
              <span className="font-semibold">Pupillary Distance (PD): </span>
              {formatPd(data)}
            </div>

            {/* Rx Change Alert (if applicable) */}
            {data.rxChangeAlert.hasChange && (
              <div className="mb-6 border-2 border-orange-400 bg-orange-50 rounded px-4 py-2 text-sm">
                <span className="font-bold text-orange-700">
                  Rx Change Alert:
                </span>{" "}
                {data.rxChangeAlert.message}
              </div>
            )}

            {/* Provider signature area */}
            <div className="border-t-2 border-black pt-4 mt-8">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="border-b border-gray-400 pb-8 mb-2" />
                  <p className="text-sm font-semibold">
                    {data.providerName}
                  </p>
                  {data.providerLicenseNumber && (
                    <p className="text-xs text-gray-600">
                      License #: {data.providerLicenseNumber}
                    </p>
                  )}
                  {data.providerNpi && (
                    <p className="text-xs text-gray-600">
                      NPI: {data.providerNpi}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 mt-auto pt-10">
                    Date: _______________
                  </p>
                </div>
              </div>
            </div>

            {/* Legal footer */}
            <div className="mt-6 pt-4 border-t border-gray-300 text-xs text-gray-500 text-center">
              <p>
                This prescription is valid for {data.expirationMonths} months
                from the date of examination.
              </p>
              <p className="mt-1">
                Expires: {formatDate(data.expirationDate)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden;
              }
              #rx-print-area,
              #rx-print-area * {
                visibility: visible;
              }
              #rx-print-area {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
              }
            }
          `,
        }}
      />
    </>
  );
}
