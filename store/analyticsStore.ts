/**
 * store/analyticsStore.ts
 *
 * Zustand store for the analytics dashboard.
 * Fetches all 7 chart datasets + 4 KPI values in a single aggregate request.
 */
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { apiFetch } from "@/lib/api-client";

export type DateRange = "7d" | "30d" | "90d" | "6mo";

const RANGE_DAYS: Record<DateRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "6mo": 180,
};

function toDateParams(range: DateRange): { date_from: string; date_to: string } {
  const days = RANGE_DAYS[range];
  const dateTo = new Date();
  const dateFrom = new Date(Date.now() - days * 86_400_000);
  return {
    date_from: dateFrom.toISOString().slice(0, 10),
    date_to: dateTo.toISOString().slice(0, 10),
  };
}

// Mirror backend AnalyticsDashboardResponse (camelCase after apiFetch conversion)
export interface KpiCard {
  value: number | string;
  previousValue: number | string | null;
  pctChange: number | null;
}

export interface EncounterVolumePoint { date: string; count: number }
export interface RevenueTrendPoint { date: string; revenue: number }
export interface TopDiagnosisItem { icd10Code: string; description: string; count: number }
export interface ClaimsPipelineItem { claimStatus: string; count: number }
export interface AppointmentUtilizationData { total: number; completed: number; noShow: number; cancelled: number }
export interface PatientGrowthPoint { date: string; newPatients: number }
export interface RxOpticalItem { rxModality: string; count: number }

export interface AnalyticsDashboardData {
  kpiTotalPatients: KpiCard;
  kpiExams: KpiCard;
  kpiAvgExamDuration: KpiCard;
  kpiRevenue: KpiCard;
  encounterVolume: EncounterVolumePoint[];
  revenueTrend: RevenueTrendPoint[];
  topDiagnoses: TopDiagnosisItem[];
  claimsPipeline: ClaimsPipelineItem[];
  appointmentUtilization: AppointmentUtilizationData;
  patientGrowth: PatientGrowthPoint[];
  rxOpticalMetrics: RxOpticalItem[];
  actualDays: number;
  requestedDays: number;
}

interface AnalyticsState {
  data: AnalyticsDashboardData | null;
  loading: boolean;
  error: string | null;
  dateRange: DateRange;
}

interface AnalyticsActions {
  fetch: (range: DateRange) => Promise<void>;
  setDateRange: (range: DateRange) => void;
}

type AnalyticsStore = AnalyticsState & AnalyticsActions;

export const useAnalyticsStore = create<AnalyticsStore>()(
  devtools(
    (set, get) => ({
      data: null,
      loading: false,
      error: null,
      dateRange: "30d",

      fetch: async (range) => {
        set({ loading: true, error: null }, false, "analytics/fetch/start");
        try {
          const { date_from, date_to } = toDateParams(range);
          const data = await apiFetch<AnalyticsDashboardData>(
            `/api/analytics?date_from=${date_from}&date_to=${date_to}`
          );
          set({ data, loading: false }, false, "analytics/fetch/success");
        } catch (err) {
          set(
            { loading: false, error: err instanceof Error ? err.message : "Failed to load analytics" },
            false,
            "analytics/fetch/error",
          );
        }
      },

      setDateRange: (range) => {
        set({ dateRange: range }, false, "analytics/setDateRange");
        get().fetch(range);
      },
    }),
    { name: "ClarityOS/Analytics" },
  ),
);
