"""Template rendering, PHI scrubber, and SMS segment counter.

Token rendering is plain string replacement against a closed allowlist —
no eval, no Jinja, no f-string injection. Caller passes a tokens dict;
unknown keys are left untouched, missing required keys raise.

PHI scrubbing only applies to operational SMS (HIPAA minimum-necessary).
Email is not scrubbed — the channel is for richer clinic-PHI content
when the patient opts in.

Originally a single ``templates.py`` module; promoted to a package in
Plan 15-06 so the receipt email renderer can live alongside
(``templates/receipt_email.py``) without colliding with the module name.
"""
from __future__ import annotations

import math
import re
from typing import Final

ALLOWED_TOKENS: Final[frozenset[str]] = frozenset(
    {
        "patient_first_name",
        "appt_time",
        "appt_date",
        "provider_name",
        "clinic_name",
        "reschedule_link",
        "confirm_link",
    }
)

_DIAGNOSIS_TERMS: Final[tuple[str, ...]] = (
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
)
_RX_TERMS: Final[tuple[str, ...]] = (
    "latanoprost",
    "timolol",
    "brimonidine",
    "dorzolamide",
    "bimatoprost",
)

_ICD10_RE = re.compile(r"\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b")
_RX_VALUE_RE = re.compile(r"\b(?:OD|OS|OU)\s*[+-]?\d+\.\d{2}", re.IGNORECASE)
_ACUITY_RE = re.compile(r"\b20/\d{2,4}\b")
_ADD_POWER_RE = re.compile(r"[+-]\d+\.\d{2}\s*add", re.IGNORECASE)


class TemplateRenderError(ValueError):
    """Raised when a required token is missing from the render payload."""


class PHIInTemplate(ValueError):
    """Raised when an operational SMS body matches the PHI denylist."""

    def __init__(self, matches: list[str]) -> None:
        super().__init__(f"PHI detected in operational SMS: {matches}")
        self.matches = matches


def render_template(
    *,
    body: str,
    tokens: dict[str, str],
    required: set[str] | None = None,
) -> str:
    """Replace `{{token}}` markers in `body` with values from `tokens`.

    Required tokens missing/empty → TemplateRenderError. Unknown tokens are
    left in place — callers can validate the rendered string separately.
    """
    required = required or set()
    missing = [k for k in required if not tokens.get(k)]
    if missing:
        raise TemplateRenderError(f"Missing required tokens: {missing}")

    rendered = body
    for token, value in tokens.items():
        rendered = rendered.replace(f"{{{{{token}}}}}", value)
    return rendered


def scrub_phi_for_operational_sms(body: str) -> None:
    """Raise PHIInTemplate if `body` matches diagnosis/Rx/ICD-10/acuity patterns.

    Operational SMS must stay minimum-necessary per HIPAA + 12-CONTEXT rules.
    Email is exempt — treat scrubbing as a guard at the SMS choke point only.
    """
    lower = body.lower()
    matches: list[str] = []
    for term in _DIAGNOSIS_TERMS + _RX_TERMS:
        if term in lower:
            matches.append(term)
    icd_match = _ICD10_RE.search(body)
    if icd_match:
        matches.append(icd_match.group(0))
    rx_match = _RX_VALUE_RE.search(body)
    if rx_match:
        matches.append(rx_match.group(0))
    acuity_match = _ACUITY_RE.search(body)
    if acuity_match:
        matches.append(acuity_match.group(0))
    add_match = _ADD_POWER_RE.search(body)
    if add_match:
        matches.append(add_match.group(0))
    if matches:
        raise PHIInTemplate(matches)


_GSM7_CHARS: Final[frozenset[str]] = frozenset(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ "
    "!\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§"
    "¿abcdefghijklmnopqrstuvwxyzäöñüà"
)


def count_sms_segments(body: str) -> tuple[int, str]:
    """Return ``(segment_count, encoding)`` for an SMS body.

    GSM-7: 160 chars/segment standalone, 153 chars/segment when concatenated.
    UCS-2 (any non-GSM-7 char like emoji/accented): 70 / 67 chars per segment.
    """
    if all(c in _GSM7_CHARS for c in body):
        if len(body) <= 160:
            return (1, "GSM-7")
        return (math.ceil(len(body) / 153), "GSM-7")

    if len(body) <= 70:
        return (1, "UCS-2")
    return (math.ceil(len(body) / 67), "UCS-2")
