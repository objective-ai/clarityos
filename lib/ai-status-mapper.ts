/**
 * ai-status-mapper.ts
 *
 * Maps AI scribe status output to valid EHR dropdown options.
 * Handles legacy "normal"/"abnormal" values and fuzzy matching.
 */

import type { ExamSection } from "@/types/exam-findings";
import { getFieldMeta } from "@/lib/exam-findings-fields";

// ---------------------------------------------------------------------------
// Keyword → dropdown mapping for fuzzy matching abnormal notes
// ---------------------------------------------------------------------------

const KEYWORD_MAP: Record<string, Record<string, string>> = {
  // Anterior
  cornea: {
    spk: "SPK",
    punctate: "SPK",
    staining: "SPK",
    scar: "Scar",
    edema: "Edema",
    arcus: "Arcus",
    abrasion: "Abrasion",
    infiltrate: "Infiltrate",
    guttata: "Guttata",
  },
  lens: {
    "trace cataract": "Trace cataract",
    "1+ ns": "1+ NS",
    "1+ns": "1+ NS",
    "grade 1": "1+ NS",
    "nuclear sclerosis": "1+ NS",
    "2+ ns": "2+ NS",
    "2+ns": "2+ NS",
    "grade 2": "2+ NS",
    "3+ ns": "3+ NS",
    "3+ns": "3+ NS",
    "grade 3": "3+ NS",
    psc: "PSC",
    "posterior subcapsular": "PSC",
    cortical: "Cortical",
    iol: "IOL",
    "intraocular lens": "IOL",
    pseudophakia: "IOL",
    aphakia: "Aphakia",
  },
  conjunctiva_sclera: {
    injection: "Injection",
    red: "Injection",
    pinguecula: "Pinguecula",
    pterygium: "Pterygium",
    chemosis: "Chemosis",
    "subconj hemorrhage": "Subconj hemorrhage",
    "subconjunctival": "Subconj hemorrhage",
  },
  lids_lashes: {
    blepharitis: "Blepharitis",
    chalazion: "Chalazion",
    ptosis: "Ptosis",
    dermatochalasis: "Dermatochalasis",
    trichiasis: "Trichiasis",
  },
  anterior_chamber: {
    shallow: "Shallow",
    cells: "Cells",
    flare: "Flare",
    hyphema: "Hyphema",
  },
  iris: {
    bombe: "Iris bombe",
    synechiae: "Synechiae",
    neovascularization: "Neovascularization",
    nvi: "Neovascularization",
    heterochromia: "Heterochromia",
  },
  tear_film: {
    "reduced tbut": "Reduced TBUT",
    tbut: "Reduced TBUT",
    "break-up": "Reduced TBUT",
    debris: "Debris",
    "mucus strands": "Mucus strands",
    foamy: "Foamy",
  },
  angles: {
    "grade 3": "Grade 3",
    "grade 2": "Grade 2",
    "grade 1": "Narrow (Grade 1)",
    narrow: "Narrow (Grade 1)",
    closed: "Closed",
  },
  // Posterior
  optic_nerve: {
    pallor: "Pallor",
    pale: "Pallor",
    edema: "Edema",
    swollen: "Edema",
    tilted: "Tilted",
    drusen: "Drusen",
  },
  macula: {
    drusen: "Drusen",
    "pigment changes": "Pigment changes",
    pigment: "Pigment changes",
    edema: "Edema",
    cme: "Edema",
    hemorrhage: "Hemorrhage",
    erm: "ERM",
    "epiretinal membrane": "ERM",
    hole: "Hole",
  },
  vitreous: {
    floaters: "Floaters",
    syneresis: "Syneresis",
    pvd: "PVD",
    "posterior vitreous detachment": "PVD",
    hemorrhage: "Hemorrhage",
  },
  vessels: {
    "av nicking": "AV nicking",
    nicking: "AV nicking",
    hemorrhage: "Hemorrhage",
    "cotton wool": "Cotton wool spots",
    neovascularization: "Neovascularization",
    nvd: "Neovascularization",
    nve: "Neovascularization",
  },
  periphery: {
    lattice: "Lattice",
    hole: "Hole",
    tear: "Tear",
    detachment: "Detachment",
    cobblestone: "Cobblestone",
  },
};

// ---------------------------------------------------------------------------
// Main mapper
// ---------------------------------------------------------------------------

export function mapAiStatus(
  section: ExamSection,
  structure: string,
  aiStatus: string,
  aiNotes: string,
): { status: string; finding: string } {
  const fields = getFieldMeta(section);
  const field = fields.find((f) => f.key === structure);
  if (!field) return { status: "Other", finding: `${aiStatus}: ${aiNotes}`.trim() };

  // 1. Exact match against dropdown options
  const exactMatch = field.options.find(
    (opt) => opt.toLowerCase() === aiStatus.toLowerCase(),
  );
  if (exactMatch) {
    return { status: exactMatch, finding: aiNotes };
  }

  // 2. Legacy "normal" → default status
  if (aiStatus.toLowerCase() === "normal") {
    return { status: field.defaultStatus, finding: aiNotes };
  }

  // 3. Legacy "abnormal" → fuzzy match notes against keywords
  if (aiStatus.toLowerCase() === "abnormal") {
    const mapped = fuzzyMatchNotes(structure, aiNotes, field.options);
    if (mapped) return mapped;
    // Can't determine → "Other" with notes
    return { status: "Other", finding: aiNotes || aiStatus };
  }

  // 4. Status not in options → try keyword matching on the status text itself
  const mapped = fuzzyMatchNotes(structure, aiStatus, field.options);
  if (mapped) return { status: mapped.status, finding: aiNotes || mapped.finding };

  // 5. Fallback → "Other"
  const hasOther = field.options.includes("Other");
  return {
    status: hasOther ? "Other" : field.defaultStatus,
    finding: aiNotes ? aiNotes : aiStatus,
  };
}

function fuzzyMatchNotes(
  structure: string,
  text: string,
  _options: string[],
): { status: string; finding: string } | null {
  if (!text) return null;

  const keywords = KEYWORD_MAP[structure];
  if (!keywords) return null;

  const lower = text.toLowerCase();

  // Try longest keywords first for better matching
  const sorted = Object.entries(keywords).sort(
    ([a], [b]) => b.length - a.length,
  );

  for (const [keyword, dropdownValue] of sorted) {
    if (lower.includes(keyword)) {
      return { status: dropdownValue, finding: text };
    }
  }

  return null;
}
