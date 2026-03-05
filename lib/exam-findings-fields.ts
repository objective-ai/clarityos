/**
 * Clinical field metadata for exam findings grids.
 *
 * Separates clinical knowledge (dropdown options, labels) from component logic.
 * Drives the OD/OS grid UI and the WNL macro defaults.
 */

import type { ExamSection, FindingFieldMeta } from "@/types/exam-findings";

export const ANTERIOR_FIELD_META: FindingFieldMeta[] = [
  {
    key: "lids_lashes",
    label: "Lids / Lashes",
    options: ["Normal", "Blepharitis", "Chalazion", "Ptosis", "Dermatochalasis", "Trichiasis", "Other"],
    defaultStatus: "Normal",
  },
  {
    key: "conjunctiva_sclera",
    label: "Conjunctiva / Sclera",
    options: ["White & quiet", "Injection", "Pinguecula", "Pterygium", "Chemosis", "Subconj hemorrhage", "Other"],
    defaultStatus: "White & quiet",
  },
  {
    key: "cornea",
    label: "Cornea",
    options: ["Clear", "SPK", "Scar", "Edema", "Arcus", "Abrasion", "Infiltrate", "Guttata", "Other"],
    defaultStatus: "Clear",
  },
  {
    key: "anterior_chamber",
    label: "Anterior Chamber",
    options: ["Deep & quiet", "Shallow", "Cells", "Flare", "Hyphema", "Other"],
    defaultStatus: "Deep & quiet",
  },
  {
    key: "iris",
    label: "Iris",
    options: ["Flat, normal architecture", "Iris bombe", "Synechiae", "Neovascularization", "Heterochromia", "Other"],
    defaultStatus: "Flat, normal architecture",
  },
  {
    key: "lens",
    label: "Lens",
    options: ["Clear", "Trace cataract", "1+ NS", "2+ NS", "3+ NS", "PSC", "Cortical", "IOL", "Aphakia", "Other"],
    defaultStatus: "Clear",
  },
  {
    key: "tear_film",
    label: "Tear Film",
    options: ["Stable", "Reduced TBUT", "Debris", "Mucus strands", "Foamy", "Other"],
    defaultStatus: "Stable",
  },
  {
    key: "angles",
    label: "Angles",
    options: ["Open (Grade 4)", "Grade 3", "Grade 2", "Narrow (Grade 1)", "Closed"],
    defaultStatus: "Open (Grade 4)",
  },
];

export const POSTERIOR_FIELD_META: FindingFieldMeta[] = [
  {
    key: "cup_to_disc_ratio",
    label: "C/D Ratio",
    options: ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "1.0"],
    defaultStatus: "0.3",
  },
  {
    key: "optic_nerve",
    label: "Optic Nerve",
    options: ["Healthy, pink", "Pallor", "Edema", "Tilted", "Drusen", "Other"],
    defaultStatus: "Healthy, pink",
  },
  {
    key: "macula",
    label: "Macula",
    options: ["Flat & intact", "Drusen", "Pigment changes", "Edema", "Hemorrhage", "ERM", "Hole", "Other"],
    defaultStatus: "Flat & intact",
  },
  {
    key: "vitreous",
    label: "Vitreous",
    options: ["Clear", "Floaters", "Syneresis", "PVD", "Hemorrhage", "Other"],
    defaultStatus: "Clear",
  },
  {
    key: "vessels",
    label: "Vessels",
    options: ["Normal A/V ratio", "AV nicking", "Hemorrhage", "Cotton wool spots", "Neovascularization", "Other"],
    defaultStatus: "Normal A/V ratio",
  },
  {
    key: "periphery",
    label: "Peripheral Retina",
    options: ["Flat & intact", "Lattice", "Hole", "Tear", "Detachment", "Cobblestone", "Other"],
    defaultStatus: "Flat & intact",
  },
];

/** Get field metadata for a given section */
export function getFieldMeta(section: ExamSection): FindingFieldMeta[] {
  return section === "anterior_segment" ? ANTERIOR_FIELD_META : POSTERIOR_FIELD_META;
}
