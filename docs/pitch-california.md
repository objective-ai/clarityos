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
- **One-way seal** — Once signed, every field is locked. Vitals, refractions, exam findings, diagnoses — all become read-only. There is no "unsign" button.
- **Soft-delete only** — Clinical records are never hard-deleted. A record marked "deleted" retains its full content with a deletion timestamp, satisfying HIPAA's 6-year retention requirement.

**What you see:** A "Sign & Finalize" dialog that requires Assessment & Plan (minimum 10 characters) before the lock engages. After finalization, a green banner confirms who signed and when.

**What your auditor sees:** An immutable record chain with server-side timestamps and FK-linked signer identity.

---

## 2. WNL Efficiency — Document a Normal Exam in Under 60 Seconds

**The problem:** Documenting "within normal limits" for a healthy patient's anterior and posterior segments takes 5-8 clicks in most systems, scattered across dropdown menus and free-text fields.

**How ClarityOS solves it:**

- **One-click WNL** — For each exam section (Anterior Segment / Posterior Segment), a single "Set WNL" button marks all structures as normal. Done.
- **Structured abnormals** — When something isn't normal, you select the specific structure, choose the finding from a dropdown, and document per-eye (OD/OS) with laterality built in.
- **OD to OS copy** — Symmetric findings? One button copies right-eye documentation to left eye.
- **JSONB storage** — Findings are stored as structured JSON, not free text. This means they're searchable, reportable, and FHIR-exportable without natural language processing.

**Time saved:** 3-5 minutes per normal exam. For a 20-patient day, that's an hour back.

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

**The problem:** Billing denials from missing laterality. "H40.11" gets rejected because the payer needs "H40.1130" (right eye, mild stage). Resubmission delays payment by 30-60 days.

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

The **Patient Header** — visible at the top of every encounter page — derives IOP alerts directly from the vitals data:

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
- **Exit guard** — If the doctor has unsaved transcript text and tries to close the tab or navigate away, the browser prompts "Leave site? Changes you made may not be lost." This catches the 90% case: accidental refreshes and tab closures.
- **Finalization-aware** — Once an encounter is signed and sealed, the exit guard deactivates. A finalized chart has nothing to lose.
- **1.5s debounced auto-save to server** — Clinical data (vitals, refractions, findings, diagnoses) auto-saves to the database after 1.5 seconds of inactivity plus a flush on field blur. No manual save buttons. Data survives device switches, not just tab crashes.

**What this means in practice:** Your doctors dictate without anxiety. If something goes wrong — a browser crash, an accidental Command+W, a power blip — their work is waiting for them when they come back.

---

## 7. Refraction Grid — Keyboard-First Prescription Entry

**The problem:** Entering a manifest refraction with a mouse means clicking through 14+ fields. With a phoropter in one hand and a patient waiting, that's too slow.

**How ClarityOS solves it:**

- **Keyboard navigation** — Tab through sphere -> cylinder -> axis -> add for each eye. Arrow keys adjust values in standard optometric steps (0.25 D for sphere/cylinder, 1 degree for axis).
- **Quarter-diopter steps** — Sphere and cylinder snap to 0.25 D increments. No invalid entries.
- **Axis range enforcement** — 1-180 degrees only. Database CHECK constraints back up the frontend validation.
- **Multiple refraction types** — Habitual, auto, manifest, cycloplegic, and final prescriptions are separate records on the same encounter. Compare them side by side.
- **Final Rx validation** — Marking a refraction as the dispensed prescription requires PD values. You can't generate a spectacle order without pupillary distance.

---

## 8. Multi-Tenant Security — Your Data, Your Schema

**The problem:** Shared-database EHR systems create anxiety about data isolation. "Can another clinic see my patients?" should never be a question.

**How ClarityOS solves it:**

- **Schema-per-tenant** — Each clinic operates in a separate PostgreSQL schema. Not just separate tables — separate schemas. A SQL query physically cannot cross tenant boundaries.
- **JWT-scoped access** — Every API request carries a Supabase-verified JWT with the clinic's tenant ID, role, staff ID, and plan name injected via a custom access token hook. The backend resolves the authenticated user to their staff record before allowing any clinical action.
- **Role-based entitlements** — ClarityOS ships with five distinct roles: **Doctor**, **Technician**, **Receptionist**, **Admin**, and **Owner**. Each role carries a precise set of 16 permissions — from full clinical access (Doctor) to scheduling-only (Receptionist) to practice-wide administration (Owner). Permissions are enforced both server-side (TenantContext) and client-side (useEntitlements hook).

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

## 9. AI Scribe — Ambient Dictation Engine

**The problem:** Between pre-test data entry, exam findings, diagnoses, refractions, and the SOAP note, a single encounter can require 40+ discrete field entries. Time spent documenting is time not spent with patients.

**How ClarityOS solves it:**

The AI Scribe is an **ambient data-entry engine**, not a post-exam summarizer. The doctor dictates naturally during the exam — "IOP is 14 and 16, BCVA 20/25 both eyes, anterior segments clear, cup-to-disc 0.3 OU, impression glaucoma suspect" — and Claude does the rest.

- **Streaming SOAP note** — A complete, structured note streams to the screen word-by-word in real time, in standard SOAP format. No waiting.
- **Simultaneous structured autofill** — While the narrative streams, Claude silently extracts structured data: IOP values go to the vitals grid, cup-to-disc ratio goes to the posterior segment findings, glaucoma suspect populates the ICD-10 diagnosis picker.
- **Covers all 5 clinical grids** — Vitals, refraction, anterior/posterior exam findings, diagnoses, and chief complaint are all auto-populated in a single dictation session.
- **Full audit trail** — Every field the scribe touched is logged with a diff: what it was before, what it set it to. Model version is recorded in the audit entry.
- **Premium entitlement gate** — Available on the Doctor and Owner roles. Upsell modal for Core/Plus subscribers.

### Clinical Diff Viewer — Transparent AI Review

Before the doctor accepts any AI suggestion, they see a **field-by-field comparison** of every proposed change:

- **Red strikethrough** = what was in the field before
- **Green bold** = what the AI is proposing
- **Per-field revert button** — Reject any individual change without canceling the whole autofill. Keep the IOP, revert the wrong axis value.
- **Diagnoses reviewed separately** — Each proposed ICD-10 code appears as a reviewable chip. The doctor confirms or removes each one individually.
- **AI never locks in changes** — The "Accept" button dispatches all accepted diffs simultaneously. Until Accept is clicked, nothing has changed.

### Finalize Modal — Sign & Seal Workflow

The Finalize Modal is a **guided 7-step review** that the doctor must walk through before the encounter is sealed:

1. **Chief complaint** — Read-only review of what was recorded
2. **Vitals summary** — Flags IOP > 21 mmHg with an alert badge (glaucoma risk threshold)
3. **Diagnoses** — **Hard block** if no diagnoses have been recorded — the "Sign & Seal Chart" button cannot be clicked
4. **Final Rx** — OD and OS prescription columns, side by side
5. **Assessment & Plan** — Free-text field, minimum 10 characters enforced
6. **Attestation** — "I attest this documentation is accurate and complete" — required checkbox
7. **Sign & Seal Chart** — Disabled until A&P and attestation gates are both satisfied

**California compliance:** Attestation satisfies Civil Code 1633.7 (electronic signatures). Provider identity linked to the sealed record satisfies B&P 3041 (license number + NPI on file).

---

## 10. Real-Time Scheduling — From Booking to Exam Room

**The problem:** Scheduling in legacy EHR systems is disconnected from clinical workflow. Booking an appointment doesn't set up the encounter. Checking in a patient doesn't notify the provider. The front desk and the exam room are in different worlds.

**How ClarityOS solves it:**

- **Day view with date navigation** — Staff see today's schedule at a glance with prev/next/today/date picker navigation. Appointments display as timeline cards with patient name, type, provider, and status.
- **One-click booking** — Select a time slot, pick the patient and provider, set the type and duration, add a chief complaint. The appointment is created and visible to the whole team immediately.
- **Status-driven workflow** — Every appointment follows a clear path: `scheduled -> confirmed -> checked_in -> in_exam -> completed`. Each transition is role-appropriate — receptionists check in, providers start exams.
- **Start Exam creates the encounter** — When a provider clicks "Start Exam" on a checked-in appointment, ClarityOS automatically creates a linked encounter record, transitions the appointment to `in_exam`, and navigates directly to the clinical workspace. No duplicate encounters — the action is idempotent.
- **Cancel with audit trail** — Cancellations require a reason (minimum 3 characters). The reason and the staff member who cancelled are permanently logged.

**What this means for your front desk:** One screen, one workflow. Book, check in, hand off to the provider — all without switching between a scheduling app and an EHR.

---

## 11. Superbill & Billing — From Diagnosis to Claim

**The problem:** After a 20-minute exam, the doctor spends 5 more minutes building a superbill manually — looking up CPT codes, cross-referencing diagnoses, calculating the E&M level. Errors mean denied claims and delayed payment.

**How ClarityOS solves it:**

- **Auto-generated superbill** — When an encounter is finalized, ClarityOS generates a superbill with AI-suggested CPT codes mapped to the encounter's ICD-10 diagnoses. The doctor reviews and approves — not builds from scratch.
- **AI MDM calculator** — The system evaluates Medical Decision Making complexity using the 2021 E&M guidelines (2-of-3 rule: number/complexity of problems, data reviewed, risk of complications). It suggests the correct E&M level — 99213, 99214, or 99215 — based on what's actually documented.
- **Diagnosis pointer validation** — Every CPT code on the superbill must link to a supporting ICD-10 diagnosis. If a code lacks a pointer, the system warns before submission. No more "missing diagnosis" rejections.
- **CMS-1500 JSON export** — One click generates a standard clearinghouse-format JSON document with all required fields: patient demographics, provider NPI, diagnosis codes, procedure codes, modifiers, place of service. Ready for electronic submission.

**Result:** Your billing team gets clean, complete superbills. Your claims go out right the first time.

---

## 12. Patient Profiles — Complete Clinical History at a Glance

**The problem:** Opening a patient chart in legacy systems means clicking through tabs, loading separate modules, and piecing together a clinical picture from fragments. The doctor wastes time finding information before they can use it.

**How ClarityOS solves it:**

- **Patient detail page** — One page shows everything: demographics, contact info, insurance, emergency contacts, medical history, active problem list, and a chronological encounter timeline.
- **Encounter timeline** — Every past visit listed with date, provider, chief complaint, and key diagnoses. Click to open the full encounter record.
- **Clinical flowsheets** — IOP and refraction data tracked across visits in a tabular format. Spot trends (rising IOP, progressive myopia) without digging through individual encounter notes.
- **AI Prep Me** — Before a patient's appointment, press "Prep Me" to generate a 2-sentence AI summary of their last 3 finalized visits. The doctor walks into the exam room already briefed.

**What this means for clinical care:** Context isn't something you search for — it's presented to you.

---

## 13. Optical Handoff — Seamless Rx to Dispensing

**The problem:** After the exam, the optical team needs the prescription. In most systems, they print a paper slip, walk to the optical department, and manually enter the Rx into their dispensing system. Lost prescriptions, transcription errors, and "Was that -2.25 or -2.75?" conversations are daily occurrences.

**How ClarityOS solves it:**

- **Automatic optical queue** — When an encounter is finalized with a final Rx, the patient automatically appears in the Optical Dashboard. No manual handoff. The optical team sees a live queue of patients waiting for glasses.
- **Rx PDF with provider credentials** — One click generates a printable prescription with the doctor's signature, license number (OD-CA-XXXX), NPI, and a 1-year expiration date. Meets California Board of Optometry requirements for spectacle prescriptions.
- **Rx Change Alert** — If today's prescription differs from last year's by more than 0.50D spherical equivalent, a bright badge alerts the optical team. This flags clinically significant changes that may require patient counseling about adaptation.
- **Status tracking** — Optical staff update each patient's status: `waiting -> in_progress -> dispensed`. The provider can see at a glance who's been taken care of.

---

## 14. Patient Intake — Before They Walk In

**The problem:** Patients arrive 15 minutes early and spend it filling out paper forms. The front desk then manually enters that data into the EHR — duplicate work that's error-prone and wastes clinical time.

**How ClarityOS solves it:**

- **Mobile-first intake form** — Patients receive a link (or scan a QR code at the front desk) that opens a multi-step form on their phone: demographics, medical history, review of systems, and chief complaint. No app download. No login required.
- **Token-based security** — Each intake link is tied to a specific appointment via a time-limited, DOB-verified token. Patients prove their identity by entering their date of birth (3 attempt lockout). The token expires after the appointment.
- **AI triage** — When the patient submits their chief complaint, ClarityOS's AI classifies it as routine, moderate, or urgent. "Blurry vision getting worse" = routine. "Flashing lights and new floaters" = urgent (possible retinal detachment). The classification appears as a colored badge on the schedule view.
- **QR code sharing** — Staff can generate a QR code that the patient scans with their phone camera. The form opens immediately — no typing a URL, no searching for an email.

**What this means for your practice:** Patients do their own data entry before they arrive. Your front desk spends less time typing and more time greeting. And if someone reports an urgent symptom, you know about it before they're in the chair.

---

## The Bottom Line

ClarityOS doesn't ask you to change how you practice. It encodes how California optometry actually works — structured exams, persistent problem lists, ICD-10 laterality, real-time scheduling, AI-assisted documentation, automated billing, optical handoff, and tamper-proof records — into software that gets out of your way.

**Built for the exam room. Designed for the audit.**

---

## Feature Summary

| Category | Capability |
|----------|-----------|
| **Clinical Workflow** | Vitals, refractions, exam findings, ICD-10 diagnoses, MPPL, finalize & sign |
| **AI** | Scribe (SOAP + autofill), Diff Viewer, Prep Me, Triage, MDM Calculator |
| **Scheduling** | Day view, booking, check-in, start exam, cancel with reason |
| **Billing** | Auto-superbill, CPT/ICD mapping, MDM scoring, CMS-1500 export |
| **Patient Management** | CRUD, detail page, encounter timeline, clinical flowsheets |
| **Optical** | Auto-queue, Rx PDF, change alerts, status tracking |
| **Intake** | Mobile forms, QR code, DOB verification, AI triage badges |
| **Security** | Supabase Auth, schema-per-tenant, 5-role RBAC, HIPAA audit trail |
| **Design** | Glassmorphism, light/dark theme, customizable accent, responsive |
