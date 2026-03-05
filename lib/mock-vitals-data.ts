import type { VitalsDraft } from "@/types/vitals";

export const DEMO_VITALS: Partial<VitalsDraft> = {
  iop_od: 23,
  iop_os: 18,
  iop_method: "goldmann",
  ucva_od: "20/200",
  ucva_os: "20/100",
  bcva_od: "20/25",
  bcva_os: "20/20",
  near_va_od: null,
  near_va_os: null,
  blood_pressure: "128/82",
  pulse: 72,
  pupils_equal_round_reactive: true,
  relative_afferent_pupillary_defect: false,
  cover_test_notes: null,
  technician_notes: null,
};
