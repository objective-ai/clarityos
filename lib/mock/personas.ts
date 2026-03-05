/**
 * lib/mock/personas.ts
 *
 * High-fidelity clinical personas for the ClarityOS EHR demo.
 *
 * Two persona systems:
 *
 * 1. PERSONA_DATA (keyed by patientId) — existing patients, vitals + refractions only.
 *    Covers today's active queue (2026-03-04): pat-001, pat-002, pat-003, pat-008, pat-009.
 *
 * 2. DEMO_ENCOUNTERS (keyed by encounterId) — three deep clinical demo encounters:
 *    enc-P01: Margaret Chen (28F) — Routine Annual, simple myopia, CL wearer
 *    enc-P02: James Wilson (68M)  — Medical Case, Glaucoma Suspect, HTN, T2DM
 *    enc-P03: Elena Rodriguez (42F) — Acute Medical, Corneal Abrasion OD
 *
 * Use getInitialStoreState(encounterId, patientId) to get a unified PersonaStoreState
 * that initialises all encounter stores.
 */

import type { VitalsDraft } from "@/types/vitals";
import type { RefractionDraft } from "@/types/refraction";
import type { FindingsDraft } from "@/types/exam-findings";
import type { Diagnosis } from "@/types/diagnosis";
import type { PatientProblem } from "@/types/patient-problem";
import {
  blankAnteriorFindings,
  blankPosteriorFindings,
} from "@/types/exam-findings";
import { DEMO_VITALS } from "@/lib/mock-vitals-data";
import { DEMO_REFRACTIONS } from "@/lib/mock-refraction-data";

// ---------------------------------------------------------------------------
// Full-featured type (encounterId-keyed, all stores)
// ---------------------------------------------------------------------------

export interface PersonaStoreState {
  patientId: string;
  encounter: { chiefComplaint: string };
  vitals: Partial<VitalsDraft>;
  refractions: RefractionDraft[];
  anteriorFindings: Partial<FindingsDraft>;
  posteriorFindings: Partial<FindingsDraft>;
  diagnoses: Diagnosis[];
  problems: PatientProblem[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function wnlAnterior(): Partial<FindingsDraft> {
  return {
    is_normal_wnl: true,
    findings_od: blankAnteriorFindings(),
    findings_os: blankAnteriorFindings(),
    provider_notes: "",
  };
}

function wnlPosterior(): Partial<FindingsDraft> {
  return {
    is_normal_wnl: true,
    findings_od: blankPosteriorFindings(),
    findings_os: blankPosteriorFindings(),
    provider_notes: "",
  };
}

/** Build a full 4-column refraction set from partial eye drafts */
function buildRx(
  habitualOd: Partial<RefractionDraft["od"]>,
  habitualOs: Partial<RefractionDraft["os"]>,
  autoOd: Partial<RefractionDraft["od"]>,
  autoOs: Partial<RefractionDraft["os"]>,
  manifestOd: Partial<RefractionDraft["od"]>,
  manifestOs: Partial<RefractionDraft["os"]>,
  finalOd: Partial<RefractionDraft["od"]>,
  finalOs: Partial<RefractionDraft["os"]>,
  opts?: {
    habitualNotes?: string;
    autoNotes?: string;
    manifestNotes?: string;
    finalNotes?: string;
    pdDistance?: number;
  }
): RefractionDraft[] {
  const blank = {
    sphere: null, cylinder: null, axis: null, add: null,
    prism: null, prism_base: null, visual_acuity: null,
  };
  return [
    {
      id: null, refraction_type: "habitual",
      od: { ...blank, ...habitualOd }, os: { ...blank, ...habitualOs },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: opts?.habitualNotes ?? "Patient's current correction",
    },
    {
      id: null, refraction_type: "auto",
      od: { ...blank, ...autoOd }, os: { ...blank, ...autoOs },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: opts?.autoNotes ?? "Autorefractor \u2014 Topcon KR-800",
    },
    {
      id: null, refraction_type: "manifest",
      od: { ...blank, ...manifestOd }, os: { ...blank, ...manifestOs },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: opts?.manifestNotes ?? null,
    },
    {
      id: null, refraction_type: "final",
      od: { ...blank, ...finalOd }, os: { ...blank, ...finalOs },
      pd_distance: opts?.pdDistance ?? null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: true, notes: opts?.finalNotes ?? null,
    },
  ];
}

// ===========================================================================
// SECTION 1 — patientId-keyed personas (all stores)
// ===========================================================================

/** pat-001 — Linda Chen, 68F — Digital eye strain / moderate myopia + presbyopia */
const LINDA_CHEN: PersonaStoreState = {
  patientId: "pat-001",
  encounter: { chiefComplaint: "" },
  vitals: {
    iop_od: 16, iop_os: 15, iop_method: "goldmann",
    ucva_od: "20/200", ucva_os: "20/150",
    bcva_od: "20/20", bcva_os: "20/20",
    near_va_od: "20/40", near_va_os: "20/40",
    blood_pressure: "134/84", pulse: 68,
    pupils_equal_round_reactive: true, relative_afferent_pupillary_defect: false,
    cover_test_notes: "Orthophoric at distance and near",
    technician_notes: "Patient reports 6\u20138 h/day screen time. Symptoms worse by afternoon.",
  },
  refractions: buildRx(
    { sphere: -2.75, cylinder: -0.50, axis: 95, visual_acuity: "20/200" },
    { sphere: -2.50, cylinder: -0.50, axis: 82, visual_acuity: "20/150" },
    { sphere: -3.00, cylinder: -0.75, axis: 93 }, { sphere: -2.75, cylinder: -0.50, axis: 80 },
    { sphere: -2.75, cylinder: -0.50, axis: 92, visual_acuity: "20/20", add: 2.25 },
    { sphere: -2.50, cylinder: -0.50, axis: 82, visual_acuity: "20/20", add: 2.25 },
    { sphere: -2.75, cylinder: -0.50, axis: 92, visual_acuity: "20/20", add: 2.25 },
    { sphere: -2.50, cylinder: -0.50, axis: 82, visual_acuity: "20/20", add: 2.25 },
    { habitualNotes: "2-year-old progressive lenses, patient dissatisfied with intermediate zone",
      finalNotes: "Updated progressive \u2014 +0.25 sphere OU for intermediate improvement. Recommend anti-fatigue AR coat.",
      pdDistance: 62.0 }
  ),
  anteriorFindings: wnlAnterior(),
  posteriorFindings: wnlPosterior(),
  diagnoses: [
    {
      id: "mock-dx-001-1", encounter_id: "apt-007",
      icd10_code: "H52.13", description: "Myopia, bilateral",
      eye_affected: "OU", severity: "Mild", status: "Active",
      notes: "Stable moderate myopia. Progressive lenses updated today.",
      created_at: "2026-03-04T13:00:00Z", updated_at: "2026-03-04T13:00:00Z",
    },
    {
      id: "mock-dx-001-2", encounter_id: "apt-007",
      icd10_code: "H52.4", description: "Presbyopia",
      eye_affected: "OU", severity: "Mild", status: "Active",
      notes: "Add +2.25 OU. Updated progressive lenses.",
      created_at: "2026-03-04T13:00:00Z", updated_at: "2026-03-04T13:00:00Z",
    },
  ],
  problems: [
    {
      id: "mock-prb-001-1", patient_id: "pat-001",
      icd10_code: "H52.13", description: "Myopia, bilateral",
      eye_affected: "OU", severity: "Mild", status: "active",
      onset_date: "2002-06-15", resolved_date: null, source_encounter_id: null,
      notes: "Stable for 5+ years. Annual monitoring.",
      is_deleted: false, created_at: "2002-06-15T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
    {
      id: "mock-prb-001-2", patient_id: "pat-001",
      icd10_code: "H52.4", description: "Presbyopia",
      eye_affected: "OU", severity: "Mild", status: "active",
      onset_date: "2018-03-01", resolved_date: null, source_encounter_id: null,
      notes: "Progressive lenses. Add increasing annually.",
      is_deleted: false, created_at: "2018-03-01T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
  ],
};

/** pat-002 — Robert Kim, 53M — Diabetic retinopathy follow-up */
const ROBERT_KIM: PersonaStoreState = {
  patientId: "pat-002",
  encounter: { chiefComplaint: "" },
  vitals: {
    iop_od: 18, iop_os: 22, iop_method: "goldmann",
    ucva_od: "20/100", ucva_os: "20/200",
    bcva_od: "20/25", bcva_os: "20/40",
    blood_pressure: "148/92", pulse: 78,
    pupils_equal_round_reactive: true, relative_afferent_pupillary_defect: false,
    technician_notes: "BP elevated \u2014 pt aware. Last HbA1c 8.2% (3 months ago).",
  },
  refractions: buildRx(
    { sphere: -1.50, cylinder: -0.75, axis: 10, visual_acuity: "20/100" },
    { sphere: -0.75, cylinder: -1.00, axis: 165, visual_acuity: "20/200" },
    { sphere: -1.75, cylinder: -1.00, axis: 12 }, { sphere: -1.00, cylinder: -1.25, axis: 163 },
    { sphere: -1.75, cylinder: -0.75, axis: 12, visual_acuity: "20/25", add: 2.00 },
    { sphere: -1.00, cylinder: -1.25, axis: 165, visual_acuity: "20/40", add: 2.00 },
    { sphere: -1.75, cylinder: -0.75, axis: 12, visual_acuity: "20/25", add: 2.00 },
    { sphere: -1.00, cylinder: -1.25, axis: 165, visual_acuity: "20/40", add: 2.00 },
    { finalNotes: "Rx stable OD. OS BCVA limited by early CSME \u2014 refer retina if VA does not improve.",
      pdDistance: 64.0 }
  ),
  anteriorFindings: wnlAnterior(),
  posteriorFindings: {
    is_normal_wnl: false,
    findings_od: {
      cup_to_disc_ratio: { status: "0.4", severity: null, finding: "Normal CDR, healthy rim tissue" },
      optic_nerve: { status: "Healthy, pink", severity: null, finding: "" },
      macula: { status: "Flat & intact", severity: null, finding: "No macular edema OD" },
      vitreous: { status: "Clear", severity: null, finding: "" },
      vessels: { status: "Mild A/V nicking", severity: "Mild", finding: "Mild arteriovenous nicking at 2-3 crossings OD \u2014 hypertensive change" },
      periphery: { status: "Flat & intact", severity: null, finding: "" },
    },
    findings_os: {
      cup_to_disc_ratio: { status: "0.4", severity: null, finding: "Normal CDR" },
      optic_nerve: { status: "Healthy, pink", severity: null, finding: "" },
      macula: { status: "Dot/blot hemorrhages", severity: "Moderate", finding: "Dot/blot hemorrhages, suspected early CSME \u2014 OCT macula ordered OS" },
      vitreous: { status: "Clear", severity: null, finding: "" },
      vessels: { status: "Mild A/V nicking", severity: "Mild", finding: "Mild A/V nicking OS, similar to OD" },
      periphery: { status: "Flat & intact", severity: null, finding: "" },
    },
    provider_notes: "Mild NPDR OS \u2014 dot/blot hemorrhages, early CSME suspect. OCT macula ordered OS. OD clear. Reinforce glycemic control (HbA1c 8.2%). Refer retina OS if VA does not improve.",
  },
  diagnoses: [
    {
      id: "mock-dx-002-1", encounter_id: "apt-008",
      icd10_code: "E11.3211", description: "Type 2 DM with mild nonproliferative diabetic retinopathy, right eye, without macular edema",
      eye_affected: "OD", severity: "Mild", status: "Active",
      notes: "OD clear. Stable mild NPDR.",
      created_at: "2026-03-04T14:30:00Z", updated_at: "2026-03-04T14:30:00Z",
    },
    {
      id: "mock-dx-002-2", encounter_id: "apt-008",
      icd10_code: "E11.3212", description: "Type 2 DM with mild nonproliferative diabetic retinopathy, left eye, with macular edema",
      eye_affected: "OS", severity: "Moderate", status: "Active",
      notes: "Dot/blot hemorrhages OS, early CSME. OCT macula ordered. Refer retina if no improvement.",
      created_at: "2026-03-04T14:30:00Z", updated_at: "2026-03-04T14:30:00Z",
    },
  ],
  problems: [
    {
      id: "mock-prb-002-1", patient_id: "pat-002",
      icd10_code: "E11.9", description: "Type 2 diabetes mellitus without complications",
      eye_affected: null, severity: "Moderate", status: "active",
      onset_date: "2018-04-12", resolved_date: null, source_encounter_id: null,
      notes: "HbA1c 8.2% (Dec 2025). Metformin 1000 mg BID. Annual dilated eye exam.",
      is_deleted: false, created_at: "2018-04-12T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
    {
      id: "mock-prb-002-2", patient_id: "pat-002",
      icd10_code: "I10", description: "Essential hypertension",
      eye_affected: null, severity: "Mild", status: "active",
      onset_date: "2015-09-01", resolved_date: null, source_encounter_id: null,
      notes: "Lisinopril 10 mg QD. BP 148/92 today \u2014 PCP follow-up advised.",
      is_deleted: false, created_at: "2015-09-01T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
    {
      id: "mock-prb-002-3", patient_id: "pat-002",
      icd10_code: "H36.039", description: "Diabetic retinopathy, unspecified, bilateral",
      eye_affected: "OU", severity: "Mild", status: "active",
      onset_date: "2024-03-10", resolved_date: null, source_encounter_id: null,
      notes: "Mild NPDR OU. Annual retinal screening. CSME suspect OS \u2014 monitoring.",
      is_deleted: false, created_at: "2024-03-10T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
  ],
};

/** pat-003 — Sarah Johnson, 35F — Acute red eye / anterior uveitis suspect */
const SARAH_JOHNSON: PersonaStoreState = {
  patientId: "pat-003",
  encounter: { chiefComplaint: "" },
  vitals: {
    iop_od: 26, iop_os: 14, iop_method: "goldmann",
    ucva_od: "20/80", ucva_os: "20/20",
    bcva_od: "20/40", bcva_os: "20/20",
    blood_pressure: "118/74", pulse: 82,
    pupils_equal_round_reactive: false, relative_afferent_pupillary_defect: false,
    technician_notes: "OD: ciliary flush, anterior chamber flare. Pupil sluggish OD. Photophobia, aching pain. No trauma.",
  },
  refractions: buildRx(
    { sphere: 0, visual_acuity: "20/80" }, { sphere: 0, visual_acuity: "20/20" },
    { sphere: 0, cylinder: -0.25, axis: 90 }, { sphere: 0 },
    { sphere: 0, cylinder: -0.25, axis: 90, visual_acuity: "20/40" }, { sphere: 0, visual_acuity: "20/20" },
    { sphere: 0, cylinder: -0.25, axis: 90, visual_acuity: "20/40" }, { sphere: 0, visual_acuity: "20/20" },
    { finalNotes: "Defer final Rx until uveitis resolves. Rx prednisolone acetate 1% q2h OD.", pdDistance: 61.5 }
  ),
  anteriorFindings: {
    is_normal_wnl: false,
    findings_od: {
      lids_lashes: { status: "Normal", severity: null, finding: "" },
      conjunctiva_sclera: { status: "Circumcorneal injection", severity: "Moderate", finding: "360\u00b0 circumcorneal injection with ciliary flush, no discharge" },
      cornea: { status: "Clear", severity: null, finding: "No keratic precipitates. Epithelium intact." },
      anterior_chamber: { status: "2+ cells, 1+ flare", severity: "Moderate", finding: "Anterior chamber 2+ cells, 1+ flare on slit lamp \u2014 consistent with active uveitis" },
      iris: { status: "Sluggish pupil", severity: "Mild", finding: "Pupil sluggish OD, no posterior synechiae visible" },
      lens: { status: "Clear", severity: null, finding: "" },
      tear_film: { status: "Reflex tearing", severity: "Mild", finding: "Reflex tearing present OD secondary to inflammation" },
      angles: { status: "Open (Grade 4)", severity: null, finding: "" },
    },
    findings_os: blankAnteriorFindings(),
    provider_notes: "Acute anterior uveitis OD \u2014 no keratic precipitates. IOP 26 OD likely from trabecular inflammation. Prescribing prednisolone acetate 1% q2h + cyclopentolate 1% BID OD. RTC 1 week.",
  },
  posteriorFindings: wnlPosterior(),
  diagnoses: [
    {
      id: "mock-dx-003-1", encounter_id: "apt-009",
      icd10_code: "H20.01", description: "Acute and subacute iridocyclitis, right eye",
      eye_affected: "OD", severity: "Moderate", status: "Active",
      notes: "2+ cells, 1+ flare OD. IOP 26 OD. Prednisolone acetate 1% q2h + cyclopentolate 1% BID OD. RTC 1 week.",
      created_at: "2026-03-04T15:00:00Z", updated_at: "2026-03-04T15:00:00Z",
    },
  ],
  problems: [],
};

/** pat-008 — Michael Torres, 47M — First-time CL fitting, high myopia */
const MICHAEL_TORRES: PersonaStoreState = {
  patientId: "pat-008",
  encounter: { chiefComplaint: "" },
  vitals: {
    iop_od: 13, iop_os: 14, iop_method: "goldmann",
    ucva_od: "20/800", ucva_os: "20/600",
    bcva_od: "20/15", bcva_os: "20/15",
    blood_pressure: "122/76", pulse: 64,
    pupils_equal_round_reactive: true, relative_afferent_pupillary_defect: false,
    technician_notes: "Motivated patient \u2014 office job. Interested in daily disposable SiHy lenses.",
  },
  refractions: buildRx(
    { sphere: -6.00, cylinder: -0.75, axis: 170, visual_acuity: "20/800" },
    { sphere: -5.75, cylinder: -1.00, axis: 168, visual_acuity: "20/600" },
    { sphere: -6.25, cylinder: -1.25, axis: 172 }, { sphere: -5.75, cylinder: -1.00, axis: 168 },
    { sphere: -6.25, cylinder: -1.00, axis: 170, visual_acuity: "20/15" },
    { sphere: -5.75, cylinder: -0.75, axis: 168, visual_acuity: "20/15" },
    { sphere: -6.25, cylinder: -1.00, axis: 170, visual_acuity: "20/15" },
    { sphere: -5.75, cylinder: -0.75, axis: 168, visual_acuity: "20/15" },
    { finalNotes: "Trial fit: B&L Ultra 8.5/14.2. OD \u22126.25 sph, OS \u22125.75 \u22120.75\u00d7170 (toric). 4-hour trial scheduled.",
      pdDistance: 66.0 }
  ),
  anteriorFindings: {
    ...wnlAnterior(),
    provider_notes: "Corneal topography: regular with-the-rule astigmatism OU. No corneal irregularity. TBUT 8s OU \u2014 adequate for CL wear. Suitable for toric SiHy daily disposable CL.",
  },
  posteriorFindings: {
    is_normal_wnl: false,
    findings_od: {
      cup_to_disc_ratio: { status: "0.3", severity: null, finding: "Normal CDR, healthy rim tissue" },
      optic_nerve: { status: "Tilted disc, temporal crescent", severity: "Mild", finding: "Temporal crescent present OD \u2014 high myopia sign. No pallor." },
      macula: { status: "Flat & intact", severity: null, finding: "No Fuchs spot. Macula flat and intact." },
      vitreous: { status: "Clear", severity: null, finding: "" },
      vessels: { status: "Normal A/V ratio", severity: null, finding: "" },
      periphery: { status: "Lattice degeneration", severity: "Mild", finding: "Lattice degeneration \u2014 1 clock hour supero-temporal OD. No breaks or holes visible." },
    },
    findings_os: {
      cup_to_disc_ratio: { status: "0.3", severity: null, finding: "Normal CDR" },
      optic_nerve: { status: "Tilted disc, temporal crescent", severity: "Mild", finding: "Temporal crescent OS \u2014 similar to OD. No pallor." },
      macula: { status: "Flat & intact", severity: null, finding: "No macular pathology OS." },
      vitreous: { status: "Clear", severity: null, finding: "" },
      vessels: { status: "Normal A/V ratio", severity: null, finding: "" },
      periphery: { status: "Flat & intact", severity: null, finding: "" },
    },
    provider_notes: "High myope fundus OU \u2014 temporal crescents, tilted discs. Lattice degeneration supero-temporal OD (1 clock hour) \u2014 patient counselled re: retinal detachment risk, symptoms to watch for. No breaks or holes. Annual dilated exam recommended.",
  },
  diagnoses: [
    {
      id: "mock-dx-008-1", encounter_id: "apt-010",
      icd10_code: "H52.12", description: "Myopia, bilateral — high grade",
      eye_affected: "OU", severity: "Severe", status: "Active",
      notes: "High myopia OU (\u22126.25 OD / \u22125.75 OS). Lattice degeneration OD. Annual dilation.",
      created_at: "2026-03-04T15:45:00Z", updated_at: "2026-03-04T15:45:00Z",
    },
  ],
  problems: [
    {
      id: "mock-prb-008-1", patient_id: "pat-008",
      icd10_code: "H52.12", description: "High myopia, bilateral",
      eye_affected: "OU", severity: "Severe", status: "active",
      onset_date: "2005-08-20", resolved_date: null, source_encounter_id: null,
      notes: "Stable high myopia. Lattice OD found today. Annual dilation. CL fitting initiated.",
      is_deleted: false, created_at: "2005-08-20T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
  ],
};

/** pat-009 — Karen White, 65F — 2-week post cataract check (pseudophakic OD) */
const KAREN_WHITE: PersonaStoreState = {
  patientId: "pat-009",
  encounter: { chiefComplaint: "" },
  vitals: {
    iop_od: 12, iop_os: 16, iop_method: "goldmann",
    ucva_od: "20/25", ucva_os: "20/200",
    bcva_od: "20/20", bcva_os: "20/30",
    near_va_od: "20/50", near_va_os: "20/60",
    blood_pressure: "138/86", pulse: 70,
    pupils_equal_round_reactive: true, relative_afferent_pupillary_defect: false,
    technician_notes: "OD post-op week 2 \u2014 cornea slightly edematous superiorly. IOL well centred. Prednisolone taper in progress.",
  },
  refractions: buildRx(
    { sphere: -3.50, cylinder: -0.75, axis: 10, visual_acuity: "20/200" },
    { sphere: -2.25, cylinder: -1.00, axis: 165, visual_acuity: "20/200" },
    { sphere: -0.25, cylinder: -0.50, axis: 90 }, { sphere: -1.75, cylinder: -0.75, axis: 162 },
    { sphere: 0.25, cylinder: -0.50, axis: 90, visual_acuity: "20/20" },
    { sphere: -2.25, cylinder: -0.75, axis: 165, visual_acuity: "20/30" },
    { sphere: 0.25, cylinder: -0.50, axis: 90, visual_acuity: "20/20", add: 2.50 },
    { sphere: -2.25, cylinder: -0.75, axis: 165, visual_acuity: "20/30", add: 2.50 },
    { finalNotes: "OD pseudophakic \u2014 minor residual astigmatism. Defer spectacle Rx until 6 weeks post-op.", pdDistance: 62.5 }
  ),
  anteriorFindings: {
    is_normal_wnl: false,
    findings_od: {
      lids_lashes: { status: "Normal", severity: null, finding: "" },
      conjunctiva_sclera: { status: "Mild injection", severity: "Mild", finding: "Mild conjunctival injection at limbus OD \u2014 post-op expected" },
      cornea: { status: "Mild SPK superior", severity: "Mild", finding: "Superficial punctate keratitis superior OD \u2014 post-op corneal oedema resolving. No Descemet\u2019s folds." },
      anterior_chamber: { status: "Deep & quiet", severity: null, finding: "Deep and quiet, no cells or flare" },
      iris: { status: "Round, reactive", severity: null, finding: "" },
      lens: { status: "Pseudophakic IOL", severity: "Mild", finding: "Monofocal IOL well centred OD. Posterior capsule clear. No PCO." },
      tear_film: { status: "Reduced TBUT", severity: "Mild", finding: "TBUT 5s OD \u2014 post-op dry eye. Refresh Optive QID." },
      angles: { status: "Open (Grade 4)", severity: null, finding: "" },
    },
    findings_os: {
      lids_lashes: { status: "Normal", severity: null, finding: "" },
      conjunctiva_sclera: { status: "Clear", severity: null, finding: "" },
      cornea: { status: "Clear", severity: null, finding: "" },
      anterior_chamber: { status: "Deep & quiet", severity: null, finding: "" },
      iris: { status: "Round, reactive", severity: null, finding: "" },
      lens: { status: "Dense nuclear sclerosis +3", severity: "Moderate", finding: "Dense nuclear sclerotic cataract OS (+3). Surgery discussed \u2014 scheduled next month." },
      tear_film: { status: "Clear", severity: null, finding: "" },
      angles: { status: "Open (Grade 4)", severity: null, finding: "" },
    },
    provider_notes: "OD 2 weeks post phaco \u2014 IOL well centred, mild corneal oedema resolving superiorly. SPK present \u2014 Refresh Optive QID OD. OS: dense nuclear cataract +3, surgery scheduled next month.",
  },
  posteriorFindings: wnlPosterior(),
  diagnoses: [
    {
      id: "mock-dx-009-1", encounter_id: "apt-011",
      icd10_code: "Z98.41", description: "Cataract extraction status, right eye",
      eye_affected: "OD", severity: null, status: "Active",
      notes: "2-week post phaco OD. IOL well centred. Minor corneal oedema resolving. Continue prednisolone taper.",
      created_at: "2026-03-04T16:30:00Z", updated_at: "2026-03-04T16:30:00Z",
    },
    {
      id: "mock-dx-009-2", encounter_id: "apt-011",
      icd10_code: "H26.9", description: "Unspecified cataract, left eye",
      eye_affected: "OS", severity: "Moderate", status: "Active",
      notes: "Dense nuclear sclerotic cataract OS (+3). Surgical planning in progress.",
      created_at: "2026-03-04T16:30:00Z", updated_at: "2026-03-04T16:30:00Z",
    },
  ],
  problems: [
    {
      id: "mock-prb-009-1", patient_id: "pat-009",
      icd10_code: "Z98.41", description: "Cataract extraction status, right eye",
      eye_affected: "OD", severity: null, status: "resolved",
      onset_date: "2026-02-19", resolved_date: "2026-02-19", source_encounter_id: null,
      notes: "Phacoemulsification + IOL OD 2026-02-19. Post-op recovery week 2.",
      is_deleted: false, created_at: "2026-02-19T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
    {
      id: "mock-prb-009-2", patient_id: "pat-009",
      icd10_code: "H26.9", description: "Unspecified cataract, left eye",
      eye_affected: "OS", severity: "Moderate", status: "active",
      onset_date: "2025-09-01", resolved_date: null, source_encounter_id: null,
      notes: "Dense nuclear sclerosis OS. Surgery planned April 2026.",
      is_deleted: false, created_at: "2025-09-01T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
  ],
};

/** Full patientId-keyed map */
export const PERSONA_DATA: Record<string, PersonaStoreState> = {
  "pat-001": LINDA_CHEN,
  "pat-002": ROBERT_KIM,
  "pat-003": SARAH_JOHNSON,
  "pat-008": MICHAEL_TORRES,
  "pat-009": KAREN_WHITE,
};

// ===========================================================================
// SECTION 2 — Full-featured clinical demo encounters (encounterId-keyed)
// ===========================================================================

// ---------------------------------------------------------------------------
// enc-P01 — Margaret Chen, 28F — Routine Annual
// Goal: Demonstrate AI Scribe speed — simple Rx, all WNL, quick note generation.
// ---------------------------------------------------------------------------

const DEMO_ENC_P01: PersonaStoreState = {
  patientId: "pat-101",
  encounter: {
    chiefComplaint: "Annual comprehensive eye exam \u2014 contact lens prescription renewal. No new vision complaints. Computer use 8+ hrs/day.",
  },
  vitals: {
    iop_od: 14, iop_os: 13, iop_method: "icare",
    ucva_od: "20/400", ucva_os: "20/200",
    bcva_od: "20/20", bcva_os: "20/20",
    blood_pressure: "118/74", pulse: 68,
    pupils_equal_round_reactive: true, relative_afferent_pupillary_defect: false,
    technician_notes: "Contact lenses removed prior to testing.",
  },
  refractions: [
    {
      id: "mock-rx-p01-habitual", refraction_type: "habitual",
      od: { sphere: -3.50, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      os: { sphere: -3.00, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: "Current daily contact lenses \u2014 Acuvue Oasys 1-Day",
    },
    {
      id: "mock-rx-p01-auto", refraction_type: "auto",
      od: { sphere: -3.75, cylinder: -0.25, axis: 85, add: null, prism: null, prism_base: null, visual_acuity: null },
      os: { sphere: -3.25, cylinder: -0.25, axis: 90, add: null, prism: null, prism_base: null, visual_acuity: null },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: "Topcon KR-800",
    },
    {
      id: "mock-rx-p01-manifest", refraction_type: "manifest",
      od: { sphere: -3.50, cylinder: -0.25, axis: 90, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      os: { sphere: -3.00, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: null,
    },
    {
      id: null, refraction_type: "final",
      od: { sphere: -3.50, cylinder: -0.25, axis: 90, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      os: { sphere: -3.00, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      pd_distance: 62.0, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: true, notes: "Patient stable \u2014 no Rx change from prior year. CL trial: SiH 1-day.",
    },
  ],
  anteriorFindings: wnlAnterior(),
  posteriorFindings: wnlPosterior(),
  diagnoses: [
    {
      id: "mock-dx-p01-1", encounter_id: "enc-P01",
      icd10_code: "H52.13", description: "Myopia, bilateral",
      eye_affected: "OU", severity: "Mild", status: "Active",
      notes: "Stable for 5 years. No progression.",
      created_at: "2026-03-04T13:00:00Z", updated_at: "2026-03-04T13:00:00Z",
    },
  ],
  problems: [
    {
      id: "mock-prb-p101-1", patient_id: "pat-101",
      icd10_code: "H52.13", description: "Myopia, bilateral",
      eye_affected: "OU", severity: "Mild", status: "active",
      onset_date: "2019-03-01", resolved_date: null, source_encounter_id: null,
      notes: "Stable, no progression. Annual monitoring.",
      is_deleted: false, created_at: "2019-03-01T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
  ],
};

// ---------------------------------------------------------------------------
// enc-P02 — James Wilson, 68M — Medical Case: Glaucoma Suspect
// Goal: Demonstrate safety — elevated IOPs trigger alert, MPPL shows HTN + T2DM.
// ---------------------------------------------------------------------------

const DEMO_ENC_P02: PersonaStoreState = {
  patientId: "pat-102",
  encounter: {
    chiefComplaint: "Annual comprehensive exam \u2014 IOP monitoring and glaucoma suspect follow-up. Occasional headaches. Using Latanoprost QHS.",
  },
  vitals: {
    iop_od: 24, iop_os: 23, iop_method: "goldmann",
    ucva_od: "20/40", ucva_os: "20/30",
    bcva_od: "20/20", bcva_os: "20/20",
    near_va_od: "20/25", near_va_os: "20/25",
    blood_pressure: "142/88", pulse: 76,
    pupils_equal_round_reactive: true, relative_afferent_pupillary_defect: false,
    technician_notes: "IOP averaged x2 each eye. Patient reports Latanoprost QHS \u2014 last drop last night.",
  },
  refractions: [
    {
      id: "mock-rx-p02-habitual", refraction_type: "habitual",
      od: { sphere: 1.50, cylinder: -0.75, axis: 30, add: null, prism: null, prism_base: null, visual_acuity: "20/40" },
      os: { sphere: 1.75, cylinder: -0.50, axis: 150, add: null, prism: null, prism_base: null, visual_acuity: "20/30" },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: "Current glasses \u2014 2 years old",
    },
    {
      id: "mock-rx-p02-auto", refraction_type: "auto",
      od: { sphere: 1.75, cylinder: -1.00, axis: 25, add: null, prism: null, prism_base: null, visual_acuity: null },
      os: { sphere: 2.00, cylinder: -0.75, axis: 155, add: null, prism: null, prism_base: null, visual_acuity: null },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: "Topcon KR-800",
    },
    {
      id: "mock-rx-p02-manifest", refraction_type: "manifest",
      od: { sphere: 1.50, cylinder: -0.75, axis: 25, add: 2.50, prism: null, prism_base: null, visual_acuity: "20/20" },
      os: { sphere: 1.75, cylinder: -0.50, axis: 155, add: 2.50, prism: null, prism_base: null, visual_acuity: "20/20" },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: null,
    },
    {
      id: null, refraction_type: "final",
      od: { sphere: 1.50, cylinder: -0.75, axis: 25, add: 2.50, prism: null, prism_base: null, visual_acuity: "20/20" },
      os: { sphere: 1.75, cylinder: -0.50, axis: 155, add: 2.50, prism: null, prism_base: null, visual_acuity: "20/20" },
      pd_distance: 64.0, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: true, notes: "Progressive lenses. Scheduling VF + OCT RNFL. Latanoprost compliance reinforced.",
    },
  ],
  anteriorFindings: wnlAnterior(),
  posteriorFindings: {
    is_normal_wnl: false,
    findings_od: {
      cup_to_disc_ratio: { status: "0.7", severity: "Moderate", finding: "CDR 0.70, suspicious rim thinning at inferior pole, ISNT rule violated" },
      optic_nerve: { status: "Healthy, pink", severity: null, finding: "" },
      macula: { status: "Flat & intact", severity: null, finding: "" },
      vitreous: { status: "Clear", severity: null, finding: "" },
      vessels: { status: "Normal A/V ratio", severity: null, finding: "" },
      periphery: { status: "Flat & intact", severity: null, finding: "" },
    },
    findings_os: {
      cup_to_disc_ratio: { status: "0.6", severity: "Mild", finding: "CDR 0.65, asymmetric vs OD \u2014 monitoring" },
      optic_nerve: { status: "Healthy, pink", severity: null, finding: "" },
      macula: { status: "Flat & intact", severity: null, finding: "" },
      vitreous: { status: "Clear", severity: null, finding: "" },
      vessels: { status: "Normal A/V ratio", severity: null, finding: "" },
      periphery: { status: "Flat & intact", severity: null, finding: "" },
    },
    provider_notes: "C/D asymmetry OD > OS. VF 24-2 + OCT RNFL scheduled. IOP still above target (<18 mmHg) on Latanoprost \u2014 discussing adjunctive therapy.",
  },
  diagnoses: [
    {
      id: "mock-dx-p02-1", encounter_id: "enc-P02",
      icd10_code: "H40.001", description: "Glaucoma suspect, right eye",
      eye_affected: "OD", severity: "Moderate", status: "Active",
      notes: "IOP OD 24 mmHg. CDR 0.70 with inferior rim thinning.",
      created_at: "2026-03-04T14:00:00Z", updated_at: "2026-03-04T14:00:00Z",
    },
    {
      id: "mock-dx-p02-2", encounter_id: "enc-P02",
      icd10_code: "H40.002", description: "Glaucoma suspect, left eye",
      eye_affected: "OS", severity: "Mild", status: "Active",
      notes: "IOP OS 23 mmHg. CDR 0.65.",
      created_at: "2026-03-04T14:00:00Z", updated_at: "2026-03-04T14:00:00Z",
    },
  ],
  problems: [
    {
      id: "mock-prb-p102-1", patient_id: "pat-102",
      icd10_code: "H40.009", description: "Glaucoma suspect, unspecified eye",
      eye_affected: "OU", severity: "Moderate", status: "active",
      onset_date: "2024-09-15", resolved_date: null, source_encounter_id: null,
      notes: "On Latanoprost QHS. Annual VF + OCT RNFL. IOP target <18 mmHg.",
      is_deleted: false, created_at: "2024-09-15T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
    {
      id: "mock-prb-p102-2", patient_id: "pat-102",
      icd10_code: "I10", description: "Essential hypertension",
      eye_affected: null, severity: "Mild", status: "active",
      onset_date: "2018-06-01", resolved_date: null, source_encounter_id: null,
      notes: "Managed by PCP. On Lisinopril 10 mg QD.",
      is_deleted: false, created_at: "2018-06-01T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
    {
      id: "mock-prb-p102-3", patient_id: "pat-102",
      icd10_code: "E11.9", description: "Type 2 diabetes mellitus without complications",
      eye_affected: null, severity: "Mild", status: "active",
      onset_date: "2020-03-10", resolved_date: null, source_encounter_id: null,
      notes: "HbA1c 7.2% (2025-12). Metformin. Annual dilated exam.",
      is_deleted: false, created_at: "2020-03-10T00:00:00Z", updated_at: "2026-03-04T00:00:00Z",
    },
  ],
};

// ---------------------------------------------------------------------------
// enc-P03 — Elena Rodriguez, 42F — Acute Medical: Corneal Abrasion OD
// Goal: Demonstrate diagnostic accuracy — AI must parse abrasion and suggest S05.01XA.
// ---------------------------------------------------------------------------

const DEMO_ENC_P03: PersonaStoreState = {
  patientId: "pat-103",
  encounter: {
    chiefComplaint: "Right eye pain and redness since this morning \u2014 woke up with foreign body sensation and tearing. Photophobia OD. No prior eye injuries.",
  },
  vitals: {
    iop_od: 16, iop_os: 14, iop_method: "icare",
    ucva_od: "20/200", ucva_os: "20/20",
    bcva_od: null, bcva_os: null,
    blood_pressure: "128/80", pulse: 88,
    pupils_equal_round_reactive: true, relative_afferent_pupillary_defect: false,
    technician_notes: "Patient photophobic OD \u2014 pinhole VA OD 20/25. IOP OD limited by discomfort. BCVA deferred.",
  },
  refractions: [
    {
      id: "mock-rx-p03-habitual", refraction_type: "habitual",
      od: { sphere: null, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: "20/200" },
      os: { sphere: null, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: "No glasses or contacts. Plano OU.",
    },
    {
      id: "mock-rx-p03-auto", refraction_type: "auto",
      od: { sphere: null, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: null },
      os: { sphere: null, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: null },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: "Autorefractor deferred OD (photophobia). OS plano.",
    },
    {
      id: "mock-rx-p03-manifest", refraction_type: "manifest",
      od: { sphere: null, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: null },
      os: { sphere: null, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: "Manifest deferred OD due to acute pain and photophobia.",
    },
    {
      id: null, refraction_type: "final",
      od: { sphere: null, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: null },
      os: { sphere: null, cylinder: null, axis: null, add: null, prism: null, prism_base: null, visual_acuity: "20/20" },
      pd_distance: null, pd_near: null, pd_od: null, pd_os: null,
      is_final_rx: false, notes: "No Rx indicated. Bandage CL applied OD. RTC 24h for wound check.",
    },
  ],
  anteriorFindings: {
    is_normal_wnl: false,
    findings_od: {
      lids_lashes: { status: "Normal", severity: null, finding: "" },
      conjunctiva_sclera: { status: "Injection", severity: "Moderate", finding: "360\u00b0 circumcorneal injection with ciliary flush, no discharge" },
      cornea: { status: "Abrasion", severity: "Moderate", finding: "Epithelial defect with positive NaFl staining \u2014 ~3\u00d72mm central corneal abrasion. No infiltrate." },
      anterior_chamber: { status: "Deep & quiet", severity: null, finding: "Deep and quiet, no cells or flare" },
      iris: { status: "Flat, normal architecture", severity: null, finding: "" },
      lens: { status: "Clear", severity: null, finding: "" },
      tear_film: { status: "Reduced TBUT", severity: "Mild", finding: "Reflex tearing present OD" },
      angles: { status: "Open (Grade 4)", severity: null, finding: "" },
    },
    findings_os: blankAnteriorFindings(),
    provider_notes: "NaFl staining confirms corneal abrasion OD. No FB visualized under SL or lid eversion. Prescribing Moxifloxacin 0.5% QID x5 days + bandage SCL. RTC 24h.",
  },
  posteriorFindings: wnlPosterior(),
  diagnoses: [
    {
      id: "mock-dx-p03-1", encounter_id: "enc-P03",
      icd10_code: "S05.01XA",
      description: "Injury of conjunctiva and corneal abrasion without foreign body, right eye, initial encounter",
      eye_affected: "OD", severity: "Moderate", status: "Active",
      notes: "~3\u00d72mm central corneal abrasion confirmed with NaFl. Bandage CL applied.",
      created_at: "2026-03-04T15:00:00Z", updated_at: "2026-03-04T15:00:00Z",
    },
  ],
  problems: [],
};

/** Full-featured encounter map keyed by encounterId */
const DEMO_ENCOUNTERS: Record<string, PersonaStoreState> = {
  "enc-P01": DEMO_ENC_P01,
  "enc-P02": DEMO_ENC_P02,
  "enc-P03": DEMO_ENC_P03,
};

// ===========================================================================
// Unified helper — returns a PersonaStoreState for any encounterId/patientId
// ===========================================================================

const DEFAULT_STATE: PersonaStoreState = {
  patientId: "pat-demo",
  encounter: { chiefComplaint: "" },
  vitals: DEMO_VITALS,
  refractions: DEMO_REFRACTIONS,
  anteriorFindings: { is_normal_wnl: false },
  posteriorFindings: { is_normal_wnl: false },
  diagnoses: [],
  problems: [],
};

/**
 * Returns the initial store state for a given encounter.
 * Priority: encounter-specific persona > patient-specific legacy persona > default.
 */
export function getInitialStoreState(encounterId: string, patientId?: string): PersonaStoreState {
  // 1. Encounter-specific (full-featured demo encounters)
  const byEncounter = DEMO_ENCOUNTERS[encounterId];
  if (byEncounter) return byEncounter;

  // 2. Patient-specific (full store state)
  if (patientId) {
    const byPatient = PERSONA_DATA[patientId];
    if (byPatient) return byPatient;
  }

  // 3. Generic default
  return { ...DEFAULT_STATE, patientId: patientId ?? DEFAULT_STATE.patientId };
}
