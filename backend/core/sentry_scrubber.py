"""PHI Scrubber — HIPAA seatbelt for Sentry events (FastAPI runtime).

Every event captured by sentry_sdk passes through ``scrub_event`` via the
``before_send`` hook wired in :mod:`backend.core.sentry_setup`. The scrubber:

  1. Inspects ``hint["exc_info"]`` and DROPS noise we don't want to see
     (ClientDisconnect, HTTPException 401/403) by returning ``None``.
  2. If the request URL path starts with any of :data:`CLINICAL_PREFIXES`,
     drops ``event["request"]["data"]`` in its entirety and tags the event
     with ``route_type=clinical``. This prevents PHI-bearing request bodies
     from ever leaving the process even if an unknown new field is added.
  3. Walks ``event["request"]``, ``event["extra"]``, ``event["contexts"]``,
     and ``event["breadcrumbs"][].data`` recursively, redacting any value
     whose key matches :data:`DENY_KEYS`.
  4. Scrubs deny-listed query-string params in ``request.url``.
  5. Keeps only ``event["user"]["id"]`` — strips email, name, tenant_slug.

The TypeScript counterpart lives at ``lib/sentry/phi-scrubber.ts``; both
modules share the same deny-list and clinical-prefix set so behaviour is
identical on both ends of the stack.
"""
from __future__ import annotations

from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

REDACTED = "[Filtered]"

# ---------------------------------------------------------------------------
# Canonical deny list — MUST match lib/sentry/phi-scrubber.ts verbatim.
# Snake_case covers API / DB shapes; camelCase covers apiFetch-transformed
# shapes when the frontend bubbles an error back through logBufferFlush.
# ---------------------------------------------------------------------------
DENY_KEYS: frozenset[str] = frozenset(
    {
        # Identifiers
        "patient_id",
        "mrn",
        "dob",
        "date_of_birth",
        "ssn",
        # Names
        "first_name",
        "last_name",
        "full_name",
        "patient_name",
        # Contact
        "phone",
        "email",
        "address",
        "street",
        "zip",
        "postal_code",
        # Insurance
        "insurance_number",
        "member_id",
        "policy_number",
        "group_number",
        # Free text clinical
        "chief_complaint",
        "hpi",
        "assessment",
        "plan",
        "soap_text",
        "ai_summary_text",
        "note",
        "notes",
        # camelCase variants
        "patientId",
        "dateOfBirth",
        "firstName",
        "lastName",
        "fullName",
        "patientName",
        "postalCode",
        "insuranceNumber",
        "memberId",
        "policyNumber",
        "groupNumber",
        "chiefComplaint",
        "soapText",
        "aiSummaryText",
    }
)

# Clinical API prefixes. Any Sentry event whose request.url path begins with
# one of these gets its request body dropped AND gets tagged so we can query
# the "did this error happen in a clinical route?" question without PHI.
CLINICAL_PREFIXES: tuple[str, ...] = (
    "/api/encounters",
    "/api/patients",
    "/api/ai-scribe",
    "/api/claims",
    "/api/vitals",
    "/api/exam-findings",
    "/api/superbills",
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _scrub_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, list):
        return [_scrub_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_scrub_value(item) for item in value)
    if isinstance(value, dict):
        return _scrub_object(value)
    if isinstance(value, str):
        return _scrub_url_query(value)
    return value


def _scrub_object(obj: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in obj.items():
        if key in DENY_KEYS:
            out[key] = REDACTED
        else:
            out[key] = _scrub_value(value)
    return out


def _scrub_url_query(value: str) -> str:
    """Redact deny-listed query params inside an URL string.

    Idempotent and safe on non-URL strings: returns the input unchanged if
    there's no ``?`` or parsing fails.
    """
    if "?" not in value:
        return value
    try:
        parsed = urlparse(value)
        if not parsed.query:
            return value
        pairs = parse_qsl(parsed.query, keep_blank_values=True)
        redacted = [
            (key, REDACTED if key in DENY_KEYS else val) for key, val in pairs
        ]
        new_query = urlencode(redacted)
        return urlunparse(parsed._replace(query=new_query))
    except Exception:  # pragma: no cover — defensive; urlparse is permissive
        return value


def _apply_ignore_rules(hint: Optional[dict[str, Any]]) -> bool:
    """Return True if the event should be dropped per ignore rules."""
    if not hint:
        return False
    exc_info = hint.get("exc_info")
    if not exc_info or len(exc_info) < 2:
        return False

    exc_type, exc_value = exc_info[0], exc_info[1]
    if exc_type is None:
        return False

    type_name = getattr(exc_type, "__name__", "")
    if type_name == "ClientDisconnect":
        return True

    if type_name == "HTTPException":
        status = getattr(exc_value, "status_code", None)
        if status in (401, 403):
            return True

    return False


def _apply_clinical_body_drop(event: dict[str, Any]) -> None:
    """Drop request.data + tag route_type=clinical for clinical API paths."""
    request = event.get("request") or {}
    if not isinstance(request, dict):
        return
    url = request.get("url") or ""
    if not url or not isinstance(url, str):
        return
    try:
        path = urlparse(url).path
    except Exception:  # pragma: no cover — defensive
        path = ""
    if not path or not any(path.startswith(prefix) for prefix in CLINICAL_PREFIXES):
        return

    tags = event.setdefault("tags", {})
    if isinstance(tags, dict):
        tags["route_type"] = "clinical"

    if "data" in request:
        del request["data"]
    event["request"] = request


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def scrub_event(
    event: dict[str, Any],
    hint: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    """Scrub a Sentry event before it leaves the process.

    Returns the scrubbed event, or ``None`` to drop the event entirely
    (ClientDisconnect / HTTPException 401 / HTTPException 403).
    """
    # 1. Ignore rules first — cheap, saves work on noise events.
    if _apply_ignore_rules(hint):
        return None

    # 2. Clinical body-drop BEFORE deny-list scrub — it's a superset; dropping
    #    the whole payload is safer than relying on key-based redaction to
    #    catch every new field someone adds to a clinical endpoint.
    _apply_clinical_body_drop(event)

    # 3. Deny-list scrub on the major PII-bearing buckets.
    request = event.get("request")
    if isinstance(request, dict):
        event["request"] = _scrub_object(request)

    extra = event.get("extra")
    if isinstance(extra, dict):
        event["extra"] = _scrub_object(extra)

    contexts = event.get("contexts")
    if isinstance(contexts, dict):
        event["contexts"] = _scrub_object(contexts)

    # 4. Breadcrumbs — urls and messages frequently contain ?mrn=... patterns.
    breadcrumbs = event.get("breadcrumbs")
    if isinstance(breadcrumbs, list):
        new_breadcrumbs = []
        for crumb in breadcrumbs:
            if not isinstance(crumb, dict):
                new_breadcrumbs.append(crumb)
                continue
            scrubbed = dict(crumb)
            data = scrubbed.get("data")
            if isinstance(data, dict):
                scrubbed["data"] = _scrub_object(data)
            message = scrubbed.get("message")
            if isinstance(message, str):
                scrubbed["message"] = _scrub_url_query(message)
            new_breadcrumbs.append(scrubbed)
        event["breadcrumbs"] = new_breadcrumbs

    # 5. User context — keep id ONLY.
    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {"id": user["id"]} if "id" in user else {}

    return event
