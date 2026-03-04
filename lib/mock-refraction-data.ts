/**
 * lib/mock-refraction-data.ts
 *
 * Realistic mock refraction data for the development demo encounter.
 *
 * Represents a typical myopia + astigmatism patient:
 *   - Habitual: old glasses the patient wore in
 *   - Auto: autorefractor reading from the instrument
 *   - Manifest: final manifest refraction from the doctor's phoropter exam
 *   - Final: the prescription written on the Rx pad (slightly refined from manifest)
 *
 * This mirrors what the server would return from:
 *   GET /api/v1/encounters/{id}/refractions
 *
 * In production, the page Server Component fetches this and passes it as
 * `initialRefractions` to <RefractionGrid />.  The grid initialises its
 * Zustand store from these values so the doctor sees existing data immediately.
 */

import type { RefractionDraft } from "@/types/refraction";

export const DEMO_REFRACTIONS: RefractionDraft[] = [
  // ─── Habitual (old glasses) ────────────────────────────────────────────
  {
    id: "mock-rx-habitual-001",
    refraction_type: "habitual",
    od: {
      sphere:        -2.00,
      cylinder:      -0.75,
      axis:          90,
      add:           null,
      prism:         null,
      prism_base:    null,
      visual_acuity: "20/200",
    },
    os: {
      sphere:        -1.75,
      cylinder:      -0.50,
      axis:          175,
      add:           null,
      prism:         null,
      prism_base:    null,
      visual_acuity: "20/100",
    },
    pd_distance:  null,
    pd_near:      null,
    pd_od:        null,
    pd_os:        null,
    is_final_rx:  false,
    notes:        "Patient's current glasses, 2 years old",
  },

  // ─── Auto refractor ────────────────────────────────────────────────────
  {
    id: "mock-rx-auto-001",
    refraction_type: "auto",
    od: {
      sphere:        -2.50,
      cylinder:      -1.25,
      axis:          88,
      add:           null,
      prism:         null,
      prism_base:    null,
      visual_acuity: null,
    },
    os: {
      sphere:        -2.00,
      cylinder:      -0.75,
      axis:          173,
      add:           null,
      prism:         null,
      prism_base:    null,
      visual_acuity: null,
    },
    pd_distance:  null,
    pd_near:      null,
    pd_od:        null,
    pd_os:        null,
    is_final_rx:  false,
    notes:        "Autorefractor — Topcon KR-800",
  },

  // ─── Manifest refraction ───────────────────────────────────────────────
  {
    id: "mock-rx-manifest-001",
    refraction_type: "manifest",
    od: {
      sphere:        -2.25,
      cylinder:      -1.00,
      axis:          90,
      add:           null,
      prism:         null,
      prism_base:    null,
      visual_acuity: "20/20",
    },
    os: {
      sphere:        -1.75,
      cylinder:      -0.50,
      axis:          175,
      add:           null,
      prism:         null,
      prism_base:    null,
      visual_acuity: "20/20",
    },
    pd_distance:  null,
    pd_near:      null,
    pd_od:        null,
    pd_os:        null,
    is_final_rx:  false,
    notes:        null,
  },

  // ─── Final Rx ──────────────────────────────────────────────────────────
  {
    id: null,  // Not yet saved — doctor is still editing
    refraction_type: "final",
    od: {
      sphere:        -2.25,
      cylinder:      -1.00,
      axis:          90,
      add:           null,
      prism:         null,
      prism_base:    null,
      visual_acuity: "20/20",
    },
    os: {
      sphere:        -1.75,
      cylinder:      -0.50,
      axis:          175,
      add:           null,
      prism:         null,
      prism_base:    null,
      visual_acuity: "20/20",
    },
    pd_distance:  63.5,
    pd_near:      null,
    pd_od:        null,
    pd_os:        null,
    is_final_rx:  true,
    notes:        "Patient preferred slightly more plus at near — may need bifocal at next visit",
  },
];
