# ClarityOS — Built for the High-Compliance California Practice

**The EHR that treats documentation like clinical infrastructure, not an afterthought.**

---

## Why California Practices Need a Different EHR

California optometrists operate under some of the strictest clinical documentation requirements in the country. Between Board of Optometry oversight, HIPAA mandates, and the increasing complexity of medical optometry (TPA-certified procedures, glaucoma co-management, diabetic eye care), your EHR needs to do more than store notes — it needs to enforce clinical rigor.

Most EHR systems were built for general medicine and retrofitted for optometry. ClarityOS was designed from the ground up for the optometric exam room.

---

## 1. Automated Compliance — Every Encounter is Audit-Ready

**The problem:** Manual attestation steps are error-prone. Unsigned encounters, missing timestamps, and incomplete records create liability exposure during audits.

**How ClarityOS solves it:**

Every finalized encounter carries a **cryptographic-grade audit trail**:

- **Signer identity** — The provider who signs is verified against their active staff record. No generic "Dr. Smith" text entry — the system resolves the authenticated user to their staff profile, license number, and NPI.
- **UTC timestamp** — Both `finalized_at` and `signed_at` are set by the database server clock, not the client. No clock-skew risk.
- **One-way seal** — Once signed, every field is locked. Vitals, refractions, exam findings, diagnoses — all become read-only. There is no "unsign" button. Amendments (Phase 2) will create timestamped addenda without modifying the original record.
- **Soft-delete only** — Clinical records are never hard-deleted. A record marked "deleted" retains its full content with a deletion timestamp, satisfying HIPAA's 6-year retention requirement.

**What you see:** A "Sign & Finalize" dialog that requires Assessment & Plan (minimum 10 characters) before the lock engages. After finalization, a green banner confirms who signed and when.

**What your auditor sees:** An immutable record chain with server-side timestamps and FK-linked signer identity.

---

## 2. WNL Efficiency — Document a Normal Exam in Under 60 Seconds

**The problem:** Documenting "within normal limits" for a healthy patient's anterior and posterior segments takes 5–8 clicks in most systems, scattered across dropdown menus and free-text fields.

**How ClarityOS solves it:**

- **One-click WNL** — For each exam section (Anterior Segment / Posterior Segment), a single "Set WNL" button marks all structures as normal. Done.
- **Structured abnormals** — When something isn't normal, you select the specific structure, choose the finding from a dropdown, and document per-eye (OD/OS) with laterality built in.
- **OD → OS copy** — Symmetric findings? One button copies right-eye documentation to left eye.
- **JSONB storage** — Findings are stored as structured JSON, not free text. This means they're searchable, reportable, and FHIR-exportable without natural language processing.

**Time saved:** 3–5 minutes per normal exam. For a 20-patient day, that's an hour back.

---

## 3. Medical Memory — The Master Patient Problem List (MPPL)

**The problem:** Chronic conditions get re-entered every visit. Glaucoma suspect? Type it again. Diabetic retinopathy? Look up the ICD-10 code again. History lives in past encounter notes that nobody reads.

**How ClarityOS solves it:**

The **Master Patient Problem List** is a persistent, longitudinal record of every active condition for each patient. It travels with them across encounters.

- **One-click promotion** — See "H40.001 — Glaucoma suspect, OD" on the problem list? Click "Bring Forward" and it's copied into the current encounter's diagnoses — complete with ICD-10 code, laterality, and severity. No retyping.
- **Deduplication** — If a condition is already in the encounter's diagnosis list, the "Bring Forward" button is replaced with "Added." No accidental duplicates.
- **Bidirectional sync** — Resolve a condition during an encounter? When you finalize, the master problem list updates automatically. The patient's next provider sees "Resolved" without manual cleanup.
- **Patient ownership validation** — The system verifies that the problem belongs to the encounter's patient before promotion. Cross-patient data leaks are structurally impossible.

**What this means for continuity of care:** Every encounter starts with full clinical context. No "What was the ICD-10 code for their glaucoma again?" — it's right there.

---

## 4. Structured Billing — ICD-10 Codes with Laterality Built In

**The problem:** Billing denials from missing laterality. "H40.11" gets rejected because the payer needs "H40.1130" (right eye, mild stage). Resubmission delays payment by 30–60 days.

**How ClarityOS solves it:**

- **ICD-10-CM validation** — Every diagnosis code is validated against the ICD-10-CM format at entry. Invalid codes are rejected before they reach your billing queue.
- **Laterality enforcement** — OD / OS / OU is a first-class field on every diagnosis, not an afterthought appended to free text.
- **Severity tracking** — Mild, moderate, severe — captured at the point of care, not reconstructed by billers from narrative notes.
- **Copy-on-promotion** — When a problem is promoted from the MPPL, all billing-critical metadata (code, laterality, severity) copies over exactly. No transcription errors.

**Result:** Claims go out clean the first time. Your billers spend less time on resubmissions and more time on collections.

---

## 5. Clinical Safety Alerts — IOP Elevation in Real Time

**The problem:** Elevated IOP is easy to miss when it's buried in a vitals table. A technician records 24 mmHg OD, the doctor starts the exam, and nobody flags it until the chart review.

**How ClarityOS solves it:**

The **Patient Sticky Header** — visible at the top of every encounter page — derives IOP alerts directly from the vitals data:

- **Threshold:** > 21 mmHg triggers a warning badge
- **Per-eye:** Separate `IOP OD` and `IOP OS` badges
- **Real-time:** Alerts update as soon as the technician saves vitals — no page refresh needed
- **Combined with patient alerts:** Drug allergies, critical medical history, and IOP elevation all appear in the same alert row

**Why this matters:** The doctor sees the IOP alert before they even sit down at the slit lamp. Clinical decisions are informed from the first moment.

---

## 6. Zero-Loss Data Protection — Auto-Save & Exit Guards

**The problem:** A doctor dictates three minutes of clinical notes into the AI Scribe, then accidentally closes the browser tab. In most EHR systems, that work is gone. Retyping from memory introduces errors and costs time.

**How ClarityOS solves it:**

- **Auto-save to local storage** — Every keystroke in the AI Scribe transcript is continuously backed up to the browser's local storage. If the tab crashes, the browser updates, or the doctor accidentally refreshes — the transcript is silently restored on the next load. No "Save Draft" button. No manual action required.
- **Exit guard** — If the doctor has unsaved transcript text and tries to close the tab or navigate away, the browser prompts "Leave site? Changes you made may not be lost." This is the same confirmation dialog used by Gmail, Google Docs, and other enterprise tools. It catches the 90% case: accidental refreshes and tab closures.
- **Finalization-aware** — Once an encounter is signed and sealed, the exit guard deactivates. A finalized chart has nothing to lose — the doctor navigates freely without interruption.
- **Performance-first architecture** — The auto-save runs entirely within the AI Scribe component. It does not trigger re-renders on the vitals grid, refraction table, or exam findings panels. Typing latency is zero — the doctor never waits for a save cycle.

**What this means in practice:** Your doctors dictate without anxiety. If something goes wrong — a browser crash, an accidental Command+W, a power blip — their work is waiting for them when they come back.

---

## 7. Refraction Grid — Keyboard-First Prescription Entry

**The problem:** Entering a manifest refraction with a mouse means clicking through 14+ fields. With a phoropter in one hand and a patient waiting, that's too slow.

**How ClarityOS solves it:**

- **Keyboard navigation** — Tab through sphere → cylinder → axis → add for each eye. Arrow keys adjust values in standard optometric steps (0.25 D for sphere/cylinder, 1° for axis).
- **Quarter-diopter steps** — Sphere and cylinder snap to 0.25 D increments. No invalid entries.
- **Axis range enforcement** — 1–180° only. Database CHECK constraints back up the frontend validation.
- **Multiple refraction types** — Habitual, auto, manifest, cycloplegic, and final prescriptions are separate records on the same encounter. Compare them side by side.
- **Final Rx validation** — Marking a refraction as the dispensed prescription requires PD values. You can't generate a spectacle order without pupillary distance.

---

## 8. Multi-Tenant Security — Your Data, Your Schema

**The problem:** Shared-database EHR systems create anxiety about data isolation. "Can another clinic see my patients?" should never be a question.

**How ClarityOS solves it:**

- **Schema-per-tenant** — Each clinic operates in a separate PostgreSQL schema. Not just separate tables — separate schemas. A SQL query physically cannot cross tenant boundaries.
- **JWT-scoped access** — Every API request carries a verified JWT with the clinic's tenant ID. The backend resolves the authenticated user to their staff record before allowing any clinical action.
- **Role-based entitlements** — ClarityOS ships with five distinct roles: **Doctor**, **Technician**, **Receptionist**, **Admin**, and **Owner**. Each role carries a precise set of permissions — from full clinical access (Doctor) to scheduling-only (Receptionist) to practice-wide administration (Owner). Permissions are enforced both server-side (TenantContext) and client-side (useEntitlements hook).

### Least-Privilege by Design

**Our system ensures your staff only sees what they need to see, reducing your liability and keeping your practice 100% HIPAA compliant.**

This isn't a suggestion — it's structural. ClarityOS enforces a **five-role permission model**, each scoped to the minimum access required for that job function:

- **Doctors (OD / MD)** have full clinical access — exam findings, diagnoses, refractions, sign & finalize. Their NPI is linked to their staff profile, and every signed encounter carries their verified provider identity.
- **Technicians** can enter vitals, auto-refraction, and pre-test data — but they cannot view provider notes, modify exam findings, or sign encounters. The "Sign & Finalize" button doesn't exist in their interface.
- **Receptionists** see demographics, insurance information, and the schedule — but clinical findings, diagnoses, and exam data are invisible to them. Not hidden behind a click — absent from the API response entirely.
- **Admins** manage staff and practice settings but do not have inherent clinical access. They can onboard team members, adjust roles, and configure the practice — without touching patient charts.
- **Owners** get full administrative control over the practice. But here's where ClarityOS gets smart: **if the owner is also a practicing OD**, the system supports a dual role. One staff profile, two permission layers — administrative authority plus full clinical access, with their NPI tracked and their clinical actions linked to their provider identity. If the owner is a non-practicing investor or business manager, they can be configured as administrative-only — full practice oversight without ever seeing PHI. This isn't a workaround. It's a first-class configuration.

This enforcement is **dual-layered**: the server rejects unauthorized API requests before they reach the database, and the UI removes controls entirely rather than just disabling them. There is no "gray button" your staff can ask you to unlock. If their role doesn't include it, the system doesn't serve it.

### Admin Command Center

**ClarityOS gives you total control over your practice.** From the Admin Command Center, you can onboard your team in seconds and rest easy knowing your Technicians can't sign your charts and your Front Desk can't see your clinical findings. It's security that works as hard as you do.

- **One-step staff onboarding** — Invite a new team member, assign their role (Doctor, Technician, Receptionist, Admin, or Owner), and they're ready to work. No IT department. No support tickets. No waiting.
- **Owner + Practitioner in one profile** — For the OD who owns their practice and sees patients every day, ClarityOS doesn't force a choice between "admin account" and "doctor account." Set the role to Owner, select "Doctor" as the clinical overlay, enter your NPI — and you get full admin control alongside full clinical access. Your chart signatures carry your provider identity. Your staff management actions carry your admin identity. One login, zero confusion.
- **Instant role management** — Promote a technician? Change their role and their access updates immediately across every screen and API endpoint. Revoke access for a departing employee in one click — their session is invalidated and clinical data access stops immediately.
- **Complete audit trail** — Every access event is logged: who viewed which patient record, when, and from where. If a question comes up during a HIPAA review or Board inquiry, you have the receipts — timestamped, immutable, and exportable.

**Why this matters for California practices:** The California Board of Optometry and HIPAA both require that access to protected health information be limited to the minimum necessary for each job function. ClarityOS doesn't just help you comply — it makes non-compliance structurally impossible.

---

## 9. Phase 2: Intelligent Clinical Workflow

### AI Scribe — Ambient Dictation Engine

**The problem:** Between pre-test data entry, exam findings, diagnoses, refractions, and the SOAP note, a single encounter can require 40+ discrete field entries. Time spent documenting is time not spent with patients.

**How ClarityOS solves it:**

The AI Scribe is an **ambient data-entry engine**, not a post-exam summarizer. The doctor dictates naturally during the exam — "IOP is 14 and 16, BCVA 20/25 both eyes, anterior segments clear, cup-to-disc 0.3 OU, impression glaucoma suspect" — and Claude does the rest.

- **Streaming SOAP note** — A complete, structured note streams to the screen word-by-word in real time, in standard SOAP format. No waiting.
- **Simultaneous structured autofill** — While the narrative streams, Claude silently extracts structured data: IOP values go to the vitals grid, cup-to-disc ratio goes to the posterior segment findings, glaucoma suspect populates the ICD-10 diagnosis picker.
- **Covers all 5 clinical grids** — Vitals, refraction, anterior/posterior exam findings, diagnoses, and chief complaint are all auto-populated in a single dictation session.
- **Full audit trail** — Every field the scribe touched is logged with a diff: what it was before, what it set it to. Model version (`claude-sonnet-4-6`) is recorded in the audit entry.
- **Premium entitlement gate** — Available on the Doctor and Owner roles. Upsell modal for Core/Plus subscribers.

---

### Clinical Diff Viewer — Transparent AI Review

**The problem:** AI autofill without review is a documentation liability. If a model misheard a value, the doctor needs to catch it before it's in the record.

**How ClarityOS solves it:**

Before the doctor accepts any AI suggestion, they see a **field-by-field comparison** of every proposed change:

- **Red strikethrough** = what was in the field before
- **Green bold** = what the AI is proposing
- **Per-field revert button** — Reject any individual change without canceling the whole autofill. Keep the IOP, revert the wrong axis value.
- **Diagnoses reviewed separately** — Each proposed ICD-10 code appears as a reviewable chip. The doctor confirms or removes each one individually.
- **AI never locks in changes** — The "Accept" button dispatches all accepted diffs simultaneously. Until Accept is clicked, nothing has changed.

**For audit purposes:** Past autofill events in the AuditTrailSidebar embed a read-only version of the diff viewer. Any reviewer can see exactly what the AI changed in any past session.

---

### Finalize Modal — Sign & Seal Workflow

**The problem:** "Click to sign" is a liability. Rushed finalization with missing diagnoses, unsigned assessment sections, or unreviewed IOP alerts is exactly what creates malpractice exposure and Board inquiries.

**How ClarityOS solves it:**

The Finalize Modal is a **guided 7-step review** that the doctor must walk through before the encounter is sealed:

1. **Chief complaint** — Read-only review of what was recorded
2. **Vitals summary** — Flags IOP > 21 mmHg with an alert badge (glaucoma risk threshold)
3. **Diagnoses** — **Hard block** if no diagnoses have been recorded — the "Sign & Seal Chart" button cannot be clicked. A chart without at least one ICD-10 code cannot be legally billed or audited. ClarityOS prevents this structurally, not with a warning
4. **Final Rx** — OD and OS prescription columns, side by side
5. **Assessment & Plan** — Free-text field, minimum 10 characters enforced (no blank A&P fields)
6. **Attestation** — "I attest this documentation is accurate and complete" — required checkbox
7. **Sign & Seal Chart** — Disabled until A&P and attestation gates are both satisfied

**After signing:** Every field locks. The encounter becomes read-only. The AI Scribe widget is replaced with a read-only saved summary. A confirmation banner displays the signer's name and UTC timestamp.

**Gate logic (actual code):**
```typescript
const canSubmit =
  attested &&
  assessmentPlan.trim().length >= 10 &&
  activeDiagnoses.length > 0 &&  // Diagnosis guardrail
  !isSubmitting;
```

**Architectural note:** The Finalize Modal is rendered exactly once in the React tree at the encounter page level, triggered via a Zustand store toggle (`encounterStore.finalizeModalOpen`). Both the sticky header and bottom tabs dispatch to the same modal — no duplicate component instances.

**California compliance:** Attestation satisfies Civil Code § 1633.7 (electronic signatures). Provider identity linked to the sealed record satisfies B&P 3041 (license number + NPI on file).

---

## Roadmap — What's Coming

| Phase | Feature | Status |
|-------|---------|--------|
| **Phase 1** | Core EHR (vitals, refractions, exam findings, diagnoses, MPPL, finalization) | Complete |
| **Phase 2** | AI Scribe — Ambient dictation → streaming SOAP + structured autofill | **Complete** |
| **Phase 2** | Clinical Diff Viewer — Field-level AI change review with per-field revert | **Complete** |
| **Phase 2** | Finalize Modal — Guided 7-step Sign & Seal workflow | **Complete** |
| **Phase 2** | Patient detail page with Rx history and encounter timeline | Planned |
| **Phase 2** | Encounter addenda (timestamped amendments without reopening) | Planned |
| **Phase 3** | OCT & visual field integration (device import) | Planned |
| **Phase 3** | FHIR R4 export endpoints (Patient, Encounter, Condition) | Planned |
| **Phase 3** | Real-time scheduling with appointment workflow | Planned |
| **Phase 4** | Patient portal (online booking, Rx access, secure messaging) | Planned |
| **Phase 4** | Billing integration (claim submission, ERA processing) | Planned |

---

## The Bottom Line

ClarityOS doesn't ask you to change how you practice. It encodes how California optometry actually works — structured exams, persistent problem lists, ICD-10 laterality, and tamper-proof documentation — into software that gets out of your way.

**Built for the exam room. Designed for the audit.**
