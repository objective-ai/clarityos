/**
 * PHI scan — TS port of backend scrub_phi_for_operational_sms denylist
 * (backend/services/messaging/templates.py). Client-side soft-warn only;
 * server still re-validates.
 */

const DIAGNOSIS_TERMS = [
  "glaucoma",
  "diabetic retinopathy",
  "macular degeneration",
  "cataract",
  "amblyopia",
  "strabismus",
  "keratoconus",
  "retinal detachment",
  "uveitis",
  "conjunctivitis",
  "iritis",
  "papilledema",
  "diabetic",
  "macular",
] as const;

const RX_TERMS = [
  "latanoprost",
  "timolol",
  "brimonidine",
  "dorzolamide",
  "bimatoprost",
] as const;

const ICD10_RE = /\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b/;
const RX_VALUE_RE = /\b(?:OD|OS|OU)\s*[+-]?\d+\.\d{2}/i;
const ACUITY_RE = /\b20\/\d{2,4}\b/;
const ADD_POWER_RE = /[+-]\d+\.\d{2}\s*add/i;

export interface PhiScanResult {
  hasPhi: boolean;
  matches: string[];
}

export function scanForPhi(body: string): PhiScanResult {
  const lower = body.toLowerCase();
  const matches: string[] = [];

  for (const term of [...DIAGNOSIS_TERMS, ...RX_TERMS]) {
    if (lower.includes(term)) matches.push(term);
  }

  for (const re of [ICD10_RE, RX_VALUE_RE, ACUITY_RE, ADD_POWER_RE]) {
    const m = body.match(re);
    if (m) matches.push(m[0]);
  }

  return { hasPhi: matches.length > 0, matches };
}
