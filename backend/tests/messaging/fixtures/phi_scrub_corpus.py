"""PHI scrub denylist corpus for operational SMS templates.

Each entry MUST trigger a block in `scrub_phi_for_operational_sms()` (Plan 12-03).
"""
from __future__ import annotations

DIAGNOSIS_TERMS = [
    "glaucoma", "diabetic retinopathy", "macular degeneration", "cataract",
    "amblyopia", "strabismus", "keratoconus", "retinal detachment",
    "uveitis", "conjunctivitis", "iritis", "papilledema",
]

ICD10_PATTERNS = [
    "H40.10", "E11.319", "H35.31", "H25.9", "H53.0",
]

RX_TERMS = [
    "latanoprost", "timolol", "brimonidine", "dorzolamide",
    "OD -2.50 -1.00 x 180", "+2.00 add", "20/40 OS",
]

# Each tuple: (string, expected_match_token)
TEST_CORPUS = (
    [(t, t) for t in DIAGNOSIS_TERMS]
    + [(c, c) for c in ICD10_PATTERNS]
    + [(r, r) for r in RX_TERMS]
)
