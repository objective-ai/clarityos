# ClarityOS: Security Incident Response Plan

**Policy Objective:** To define the immediate actions required in the event of unauthorized access, use, or disclosure of Protected Health Information (PHI) in compliance with HIPAA and the California Confidentiality of Medical Information Act (CMIA).

---

## Phase 1: Detection & Immediate Containment (Hours 0-24)

1. **Identify the Breach:** Detect unauthorized access via Supabase logs, `/audit-logs/` anomalies, or user reports.
2. **Contain the Threat:**
   - Immediately revoke compromised JWTs/API Keys.
   - Force password resets for affected `Staff` accounts.
   - If necessary, take the affected tenant's environment offline or restrict to read-only.
3. **Assess the Scope:** Query the `audit_logs` table to determine exactly which patient records (PHI) were accessed or exfiltrated.

## Phase 2: Internal Investigation (Hours 24-72)

1. **Root Cause Analysis:** Determine if the breach was due to a system vulnerability (e.g., BFF proxy leak, SQL injection) or human error (e.g., compromised password).
2. **Patch & Verify:** Deploy hotfixes to the FastAPI backend or Next.js frontend to close the vulnerability. Verify the fix using staging environments.

## Phase 3: California CMIA & HIPAA Notification (Deadline: 15 Days)

*California law dictates a strict 15-day reporting window for state-level compliance.*

1. **State Notification:** Within 15 days of detecting the breach, notify the California Department of Public Health (CDPH) and the California Attorney General (if more than 500 residents are affected).
2. **Patient Notification:** Within 15 days, issue written notices to all affected California patients detailing:
   - What happened and when.
   - What specific PHI was involved.
   - What steps ClarityOS has taken to mitigate the breach.
3. **Federal Notification (HIPAA):** Log the breach via the HHS OCR portal (must be done within 60 days, but we default to the 15-day CA timeline for operational simplicity).

## Phase 4: Post-Incident Review

1. Conduct a post-mortem meeting to review the incident.
2. Update this Response Plan and our Security Risk Assessment (SRA) to reflect lessons learned.
