# ClarityOS EHR — Beta Testing Guide

> **App URL:** https://clarity.objectivesolved.com
> **Clinic slug:** `sunview` (Sunview Eye Care)

---

## 1. Getting Started

### Login
1. Go to **https://clarity.objectivesolved.com/login**
2. Enter email: `duytran@yahoo.com` / password: `123456`
3. **Expected:** Redirected to `/sunview/dashboard`

### Role Switching (Dev Mode)
In the top-right corner, click the green **"Dev mode"** button to switch roles:

| Scenario | Name | Role | What You Can Test |
|----------|------|------|-------------------|
| **owner** | Duy Tran | Owner + Doctor | Everything (default) |
| **premium_doctor** | Sarah Lin | Doctor | Full clinical, no admin |
| **technician** | Marcus Webb | Technician | Vitals, refraction, pre-testing |
| **receptionist** | Emily Nguyen | Receptionist | Scheduling & demographics only |
| **core_plan** | Core Doctor | Doctor (Core plan) | Basic features, upsell modals |

> Switch roles frequently to verify each role sees only what it should.

---

## 2. Dashboard

**URL:** `/sunview/dashboard`

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 2.1 | Load dashboard | 4 stat cards visible: Total Encounters, Finalized, Pending, Next Patient |
| 2.2 | Check Quick Actions | Owner/Admin: "Admin Settings" + "Intake Form". Others: "View Schedule" + "Patient Lookup" + "Intake Form" |
| 2.3 | Click a Recent Encounter card | Navigates to encounter detail page |
| 2.4 | Switch to **receptionist** role | Quick Actions change (no Admin Settings) |

---

## 3. Schedule

**URL:** `/sunview/schedule`

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 3.1 | Load schedule page | Today's appointments visible in Clinic View |
| 3.2 | Toggle **Timeline View** | Switches to per-provider timeline layout |
| 3.3 | Click **"New Appointment"** | Modal opens with: patient search, type selector (Comprehensive, Contact Lens, Pediatric, etc.), provider dropdown, date/time picker |
| 3.4 | Create an appointment | Appointment appears on calendar. Status: "Scheduled" |
| 3.5 | Click an appointment card | Opens appointment detail (patient name, type, time, provider, status) |
| 3.6 | Use date picker / **"Today"** button | Calendar navigates to selected date |
| 3.7 | Click **"Intake Link"** | Modal shows a shareable link + QR code for patient self-check-in |

---

## 4. Patients

**URL:** `/sunview/patients`

### Patient List Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 4.1 | Load patients page | Table shows: Name, DOB/Age, Sex, Phone, Last Visit |
| 4.2 | Type in **search bar** | List filters after ~300ms. Try "Margaret" or "Rodriguez" |
| 4.3 | Click column headers | Rows sort by that column |
| 4.4 | Click a patient row | Navigates to patient detail page |

### Patient Detail Tests

**URL:** `/sunview/patients/{chartNumber}` (click any patient from list)

| # | Action | Expected Result |
|---|--------|-----------------|
| 4.5 | View header card | Avatar, name, age, DOB, sex, phone, chart number, insurance info |
| 4.6 | Click **"Patient Info"** tab | Contact info, insurance, emergency contact, notes, problem list cards |
| 4.7 | Click **"Encounters"** tab | Chronological list of encounters with status badges. Click one to navigate to it |
| 4.8 | Click **"Flowsheets"** tab | Vital sign trends and exam finding history over time |
| 4.9 | Click **"Rx History"** tab | Past prescriptions table. Filter by modality (Glasses / Contacts / Both) |
| 4.10 | Click **"Prep Me"** button | AI generates a pre-visit summary (Premium feature) |
| 4.11 | Edit patient demographics | Click edit icon → modify name/DOB/sex → save. Fields update |

---

## 5. Public Booking (No Login Required)

**URL:** `https://clarity.objectivesolved.com/book/sunview`

> Open in an incognito/private window to test as an unauthenticated patient.

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 5.1 | Load booking page | Step 1 visible: Appointment type selector + provider list |
| 5.2 | Select type + provider, click Next | Step 2: Calendar with available time slots |
| 5.3 | Pick a date + time slot, click Next | Step 3: Patient info form (name, DOB, sex, phone, email, address, insurance) |
| 5.4 | Fill form and submit | Confirmation screen with appointment details, intake form link, and QR code |
| 5.5 | Check mobile layout | Page should be mobile-friendly (try browser dev tools responsive mode) |

---

## 6. Public Intake Form (No Login Required)

**URL:** Generated from the booking confirmation or intake link modal in Schedule.

> You need a valid intake token. Create one via Schedule → Intake Link, or complete a public booking.

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 6.1 | Open intake link | Step 1: DOB verification gate |
| 6.2 | Enter matching DOB | Form unlocks → Step 2: Patient info (name, DOB, sex, phone, email, address, insurance) |
| 6.3 | Enter wrong DOB | Error message: DOB doesn't match |
| 6.4 | Fill patient info, click Next | Step 3: Medical history (ocular: glaucoma, cataracts, etc. / systemic: diabetes, HTN, etc. / medications, allergies, family history) |
| 6.5 | Fill medical history, click Next | Step 4: Review of Systems + Chief Complaint (vision symptoms, eye symptoms, general symptoms, free-text complaint, consent checkboxes) |
| 6.6 | Submit form | Success screen: "Thank you" + appointment confirmation |

---

## 7. Encounter Workflow

**URL:** `/sunview/encounter/{encounterId}`

> Use a non-finalized encounter. Seed encounter: `e0000000-0007-0000-0000-000000000007` (William Donovan). Or start a new one from the Schedule page.

### Status Lifecycle

The encounter progresses through 3 stages via the bottom status stepper:
**Pre-Test → In Exam → Finalized**

### Pre-Test Phase

| # | Action | Expected Result |
|---|--------|-----------------|
| 7.1 | Load encounter page | Bottom tabs visible: Complaint, Vitals, Rx, Exam, Dx, Plan. Status shows "Pre-Test" |
| 7.2 | Edit **Chief Complaint** | Textarea accepts input. Auto-saves after 1.5s or on blur |
| 7.3 | Fill **Vitals** form | Fields: SpO2, Blood Pressure (systolic/diastolic), Temperature, IOP (OD/OS), Vision Screening. Auto-saves on blur |
| 7.4 | Click bottom tab buttons | Page scrolls to corresponding section |
| 7.5 | Click **"Advance to In Exam"** | Status badge changes to "In Exam". Vitals section becomes read-only card |

### In Exam Phase (Doctor/Owner only)

| # | Action | Expected Result |
|---|--------|-----------------|
| 7.6 | Edit **Refraction Grid** | Columns: History, Final Rx, Dispensed. Rows: OD/OS Sphere, Cylinder, Axis, Add. Use +/- spinners. Saves on blur |
| 7.7 | Edit **Exam Findings** | 2-column layout: Anterior Segment (Lid, Cornea, Lens) + Posterior Segment (Retina, etc.). Per-structure: Status (Normal/Abnormal) + notes. Click edit icon to toggle |
| 7.8 | Add **Diagnoses** | ICD-10 code picker. Select laterality (OD/OS/OU/Both). Add/remove buttons |
| 7.9 | View **Continuity Sidebar** | Master problem list from patient's chart appears in sidebar |
| 7.10 | Switch to **technician** role | Exam Findings and Diagnoses sections become read-only. Vitals and refraction still editable |
| 7.11 | Switch to **receptionist** role | Entire encounter is read-only |

### AI Scribe (Premium Only)

The AI Scribe is a card widget in the **Assessment & Plan** section of the encounter. It has a 4-state flow: `draft` → `streaming` → `ai_ready` → `editing`.

| # | Action | Expected Result |
|---|--------|-----------------|
| 7.12 | Scroll to **Assessment & Plan** section (doctor/owner, premium plan) | "AI Scribe" card visible with transcript textarea and "Generate Note" button |
| 7.13 | Paste a transcript, click **Generate Note** | SOAP note streams word-by-word. Animated cursor visible. Button disabled during stream |
| 7.14 | Stream completes | SOAP note displayed read-only. **"Review & Merge (N)"** button appears — N = number of AI suggestions. Amber color if conflicts exist, teal if all are additions |
| 7.15 | Click **Review & Merge** | Inline panel opens below: left pane = SOAP note (syntax-highlighted), right pane = field-by-field comparison table grouped by section |
| 7.16 | Review conflict table | Each row shows: field name, your current value, AI suggestion, confidence badge (HIGH/MEDIUM/LOW), and Keep/Use AI toggle |
| 7.17 | Click **Approve All Safe (N)** | Approves all non-conflict, non-diagnosis rows instantly. Diagnoses require manual confirmation (clinical safety) |
| 7.18 | Toggle individual rows, click **Apply N Selected** | Selected AI values written to clinical stores (vitals, exam, Rx, diagnoses, A&P). Audit log entry created |
| 7.19 | After merge, scroll to Vitals / Exam / Rx sections | Fields updated with AI values. Dirty save indicators appear briefly then clear |
| 7.20 | Click **Edit Note** | SOAP textarea opens for manual edits. Click Save to commit changes |
| 7.21 | Click **Redo Note** | Clears SOAP + structured data. Returns to transcript draft view |
| 7.22 | Switch to **core_plan** role | Assessment & Plan shows manual textarea editor instead of AI Scribe. Upsell prompt visible at bottom |
| 7.23 | Click the upsell prompt (core_plan) | Upgrade modal appears listing AI Scribe features |

> **DEV mode**: In development (`NODE_ENV=development`), a "[DEV] Load scenario" dropdown appears in the widget header. Select any of 9 test scenarios to pre-load the transcript.

### AI Scribe Test Scripts

Copy-paste these into the AI Scribe transcript textarea to test different clinical scenarios. All 9 are also available via the DEV scenario selector dropdown.

---

**Script 1 — Routine Contact Lens**
*Why:* Most common visit type — normal findings with a simple Rx change. Verifies IOP extraction, prescription values, and WNL segment mapping.

> "Hi, good to see you. Vision is a bit blurry with your current contacts at the computer? Okay. Your pressure is 14 in the right and 13 in the left, which is perfect. Looking at your eyes, everything is healthy and clear. Your new prescription is minus 3.50 in the right and minus 3.00 in the left. No changes to the astigmatism."

**Expected:** IOP OD 14 / OS 13, Rx OD −3.50 / OS −3.00, anterior + posterior segments normal, chief complaint: blurry vision with contacts at computer.

---

**Script 2 — Glaucoma Suspect**
*Why:* Chronic disease monitoring — elevated IOP, optic nerve findings, medication, follow-up plan.

> "So your pressures are a bit high today at 24 and 23. Are you taking your Latanoprost every night? Your nerves look a little thinner than last time, especially on the right side. I see a cup-to-disc ratio of about 0.70. We're going to keep the diagnosis as glaucoma suspect but I want you to come back in three months for a visual field test."

**Expected:** IOP OD 24 / OS 23, optic nerve thinning OD, C/D 0.70, dx: glaucoma suspect, plan: VF in 3 months.

---

**Script 3 — Corneal Abrasion**
*Why:* Acute injury — single-eye laterality, measurements, treatment plan.

> "So that right eye looks very painful. You've got a lot of redness. I see a small scratch on the surface of the cornea, about 3 millimeters wide. It's a corneal abrasion. I'm going to prescribe some antibiotic drops and a bandage contact lens. No foreign body found."

**Expected:** OD abrasion (3mm), conjunctival injection, dx: corneal abrasion OD, plan: antibiotic drops + bandage CL.

---

**Script 4 — Diabetic Retinopathy**
*Why:* Bilateral retinal findings, co-management referral, VA extraction.

> "So I'm seeing some changes in the back of your eyes related to your diabetes. There are a few small dot hemorrhages and microaneurysms in both eyes, more so on the right. No macular edema though, which is good. Your vision is still 20/25 in each eye. I'm going to diagnose this as mild nonproliferative diabetic retinopathy in both eyes and I want to send these photos to your primary care doctor. Let's recheck in six months."

**Expected:** VA OD/OS 20/25, posterior: dot hemorrhages + microaneurysms OU (worse OD), no macular edema, dx: mild NPDR OU, plan: fundus photos to PCP, recheck 6 months.

---

**Script 5 — Comprehensive New Patient (Multiple Diagnoses)**
*Why:* Hardest scenario — multiple concurrent diagnoses. Tests that AI doesn't collapse findings.

> "So for your new glasses, you're minus 2.25 with minus 0.75 cylinder at 180 in the right, and minus 2.00 with minus 0.50 at 175 in the left. Add plus 1.50 both eyes for reading. Your eyes are pretty dry — I see some punctate staining on both corneas. I'd recommend artificial tears four times a day. Also, I'm noticing the very beginning of cataracts in both lenses, grade one nuclear sclerosis. Nothing to worry about yet but we'll keep an eye on it. Pressures are 16 and 15, nice and normal."

**Expected:** IOP OD 16 / OS 15, Rx OD −2.25 −0.75×180 / OS −2.00 −0.50×175, Add +1.50 OU, SPK OU, grade 1 NS OU, dx: myopia + dry eye + early cataract OU.

---

**Script 6 — Pediatric / Binocular Vision**
*Why:* Pediatric terminology — accommodation and convergence terms that differ from adult exams.

> "So your child is having trouble reading at school and getting headaches after about 20 minutes. Their distance vision is 20/20 in each eye which is great. But when I test how well their eyes focus up close, their accommodative amplitude is only about 5 diopters which is low for their age. And their convergence is receding to about 15 centimeters. I'm going to diagnose convergence insufficiency and accommodative insufficiency. I'd like to start vision therapy twice a week."

**Expected:** VA OD/OS 20/20, accommodative amplitude 5D (low), NPC 15cm, dx: convergence insufficiency + accommodative insufficiency, plan: vision therapy 2x/week.

---

**Script 7 — Standard Annual (All Normal)**
*Why:* Tests WNL mapping for every structure and spoken Rx numbers ("minus one-fifty").

> "Alright, let's get started with your annual. Any changes? No? Great. Patient is here for a routine checkup. Vision is 20/20 in both eyes uncorrected at distance. Pressures look good, let's see... 14 in the right and 15 in the left using the iCare. Looking at the front of the eye now. Lids and lashes are clear. Conjunctiva is white and quiet. Corneas are nice and clear OU. Anterior chamber is deep and quiet, no cells or flare. Iris is flat and brown. Lens is clear, no signs of cataracts. Moving to the back. Cup to disc ratio is a healthy 0.3 in both eyes. Nerves are pink and well-rimmed. Macula is flat, no edema. Vessels look great, standard A/V ratio. Periphery is totally intact, no holes or tears 360. Refraction today is just a tiny bit of nearsightedness. OD is minus one-fifty sphere, OS is minus one-seventy-five sphere. No astigmatism. No change to your plan, just come back and see me in a year."

**Expected:** VA 20/20 OU, IOP OD 14 / OS 15, all anterior + posterior structures normal, Rx OD −1.50 / OS −1.75, dx: myopia bilateral, plan: return 12 months.

---

**Script 8 — Pathology Case (Multi-Diagnosis)**
*Why:* Tests spoken Rx normalization ("minus one-twenty-five axis ninety") and multi-diagnosis extraction (dry eye, cataract, AMD).

> "Patient is presenting with significant dry eye and blurry near vision. Entering VAs with current glasses are 20/40 OD and 20/40 OS. Pressures are a bit elevated at 21 in the right and 20 in the left. Slit lamp shows some issues. Lids have trace blepharitis. The tear film is very unstable, high debris. Corneas show 2+ punctate epithelial staining, mostly inferiorly in both eyes. The lens is showing some early changes, Grade 1 nuclear sclerosis in both eyes. In the back, the nerves look okay, C/D is 0.4. But I'm seeing some drusen in the macula OU, very early dry AMD changes. Manifest refraction: Right eye is minus two-fifty, minus one-twenty-five axis ninety. Left eye is minus two-seventy-five, minus one-zero-zero axis eighty-five. We're adding a plus two-zero-zero for reading. Assessment is dry eye syndrome, early cataracts, and mild dry macular degeneration. Start using Refresh tears four times a day and let's get you into some high-quality bifocal lenses. Follow up in six months."

**Expected:** VA 20/40 OU, IOP OD 21 / OS 20, blepharitis + SPK 2+ OU, grade 1 NS OU, macula drusen OU, Rx OD −2.50 −1.25×90 / OS −2.75 −1.00×85 Add +2.00, dx: dry eye + cataract + dry AMD OU.

---

**Script 9 — Conversational Mess (Noise Filtering)**
*Why:* Tests noise filtering — social chat, non-linear findings, forgotten mid-exam checks.

> "Hey Duy, how are the kids? Good? Glad to hear it. Let's take a look at these eyes. So you said the left one is itchy? Okay. Let me check the pressure first... hold still... okay, 18 in the right. And... 17 in the left. Your vision today is actually still 20/20 with your old glasses. Let's see if we can sharpen that. Which is better, one... or two? Let's go with minus three-zero-zero sphere for both. Simple. Look at my ear for a second. Yeah, that left cornea has a little scratch, probably from rubbing it. Right one is clear. Nerves look good, point-three cup. Everything else in the back is normal. Oh, I forgot to check the lens — lenses are clear, no cataracts. So, for that itchiness, it's just a bit of allergic conjunctivitis. I'll give you a sample of Pataday. Use it once a day in the left eye. Otherwise, eyes are healthy. See you next time!"

**Expected:** Social chat filtered out, IOP OD 18 / OS 17, VA 20/20 OU, Rx −3.00 OU, OD cornea clear / OS corneal abrasion, lenses clear, dx: acute atopic conjunctivitis OS, plan: Pataday QD OS.

### Auto-Save & Dirty Guard

| # | Action | Expected Result |
|---|--------|-----------------|
| 7.16 | Edit any field, then try to navigate away | Browser warns "You have unsaved changes" if data is dirty |
| 7.17 | Edit a field and wait 1.5s | Field auto-saves (no manual save button needed) |

---

## 8. Finalization & Billing (2-Step Modal)

> Requires doctor or owner role. Encounter must be in "In Exam" status with clinical data entered.

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 8.1 | Click **"Finalize"** button in bottom nav | Modal opens at **Step 1: Clinical Review** |
| 8.2 | Review Step 1 | Summary of vitals, refraction, exam findings, diagnoses. Attestation statement visible |
| 8.3 | Click **"Sign & Continue to Billing"** | Step indicator updates. Modal advances to **Step 2: Billing** |
| 8.4 | View **Superbill Editor** | MDM glass card (complexity level + E&M code suggestion). CPT line items table |
| 8.5 | Click **"Calculate MDM"** | System calculates Medical Decision Making level (Straightforward/Low/Moderate/High) based on diagnoses, data, and risk. Suggested E&M code appears |
| 8.6 | Add CPT code via dropdown | Search/select from catalog (92004, 92014, 92015, 99213, etc.). Code + description + default fee added to table |
| 8.7 | Remove a CPT line item | Click remove button. Line disappears. Total fee recalculates |
| 8.8 | Click **"Post to Billing & Seal"** | Encounter locks (finalized). Superbill status → "ready_to_bill". Redirected to finalized view |
| 8.9 | Click **"Skip Billing"** instead | Encounter locks (finalized) but superbill stays "draft". Can be edited later from billing dashboard |
| 8.10 | View finalized encounter | Banner: "Signed by [Name] on [Date]". All fields read-only. Addenda button available |

### Post-Finalization

| # | Action | Expected Result |
|---|--------|-----------------|
| 8.11 | Click **"Add Addendum"** | Text input for timestamped amendment. Saved with author + timestamp |
| 8.12 | Try editing any clinical field | All fields locked. No edit buttons visible |

---

## 9. Optical Queue

**URL:** `/sunview/optical`

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 9.1 | Load optical page | Grid of queue cards for today's date. Summary badges: Total, Waiting, In Progress, Dispensed, Rx Changes |
| 9.2 | Use **date navigation** (Prev/Next/Today) | Queue updates to show encounters for selected date |
| 9.3 | View a queue card | Patient name, encounter date, Final Rx (OD/OS sphere/cylinder/axis/add) |
| 9.4 | Check **Rx Change alert** | If new Rx differs from previous, an alert badge appears on the card |
| 9.5 | Change status: **Waiting → In Progress** | Status dropdown updates. Card visual changes |
| 9.6 | Change status: **In Progress → Dispensed** | Card shows dispensed state |
| 9.7 | Click **"Print Rx"** | Print-friendly prescription sheet opens (patient info, provider, final Rx, instructions) |
| 9.8 | Add/edit **notes** on a card | Notes field saves |

---

## 10. Billing Dashboard

**URL:** `/sunview/billing`

> Requires **doctor**, **admin**, or **owner** role.

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 10.1 | Load billing page | Table of superbills with columns: Date, Patient, Provider, CPT Codes, Total ($), Status |
| 10.2 | Click **"All"** filter tab | Shows all superbills regardless of status |
| 10.3 | Click **"Draft"** tab | Shows only draft superbills |
| 10.4 | Click **"Posted"** tab | Shows only "ready_to_bill" superbills |
| 10.5 | Click **"Export Posted Claims (CSV)"** | Downloads CSV file containing only posted claims. Open in Excel to verify columns |
| 10.6 | Click a **patient name** link | Navigates to patient detail page |
| 10.7 | Verify status badges | Color-coded: Draft (gray), Posted (teal), Submitted (blue), Accepted (green), Rejected (red) |
| 10.8 | Switch to **technician** role | Billing page not visible in sidebar. Direct URL shows access denied |
| 10.9 | Switch to **receptionist** role | Same as above — no billing access |

---

## 11. Admin Panel

**URL:** `/sunview/admin`

> Requires **admin** or **owner** role.

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 11.1 | Load admin page | Tabs visible: General, Staff, Compliance |
| 11.2 | **General** tab: View clinic info | Clinic name, address, phone, logo, theme settings |
| 11.3 | Change **theme color** | Select from palette or enter custom hex. App accent color updates |
| 11.4 | Toggle **dark/light mode** | Theme switches across the app |
| 11.5 | **Staff** tab: View staff table | All staff listed with: Name, Email, Phone, Role, NPI, Status |
| 11.6 | Edit a staff member | Change role, deactivate/activate, update NPI |
| 11.7 | **Compliance** tab | HIPAA notices and data retention policies displayed |
| 11.8 | Switch to **doctor** role | Admin page not in sidebar. Direct URL shows access denied |

---

## 12. Analytics

**URL:** `/sunview/analytics`

### Tests

| # | Action | Expected Result |
|---|--------|-----------------|
| 12.1 | Load analytics page | Stat cards: Total Patients, Exams This Month, Avg Wait Time, Revenue |
| 12.2 | View charts | Placeholder charts for: Patient Volume, Revenue Trend, Top Diagnoses, Rx Trends |
| 12.3 | Switch to **core_plan** role | Page may show upsell modal (Advanced Analytics is Premium-only) |

> **Note:** Analytics charts are currently placeholders. Data is not yet live.

---

## 13. Role Permission Matrix

Test each role by switching via Dev Mode and verifying visibility:

| Feature | Owner | Doctor | Technician | Receptionist | Admin |
|---------|:-----:|:------:|:----------:|:------------:|:-----:|
| Dashboard | Yes | Yes | Yes | Yes | Yes |
| Schedule | Yes | Yes | Yes | Yes | Yes |
| Patients list | Yes | Yes | Yes | Yes | Yes |
| Patient detail | Yes | Yes | Yes | Yes | Yes |
| Encounter — view | Yes | Yes | Yes | Yes | No |
| Encounter — edit vitals | Yes | Yes | Yes | No | No |
| Encounter — edit exam findings | Yes | Yes | No | No | No |
| Encounter — add diagnoses | Yes | Yes | No | No | No |
| Encounter — AI Scribe | Yes | Yes | No | No | No |
| Encounter — finalize | Yes | Yes | No | No | No |
| Encounter — audit trail | Yes | No | No | No | Yes |
| Optical queue | Yes | Yes | Yes | Yes | Yes |
| Billing dashboard | Yes | Yes | No | No | Yes |
| Admin panel | Yes | No | No | No | Yes |
| Analytics | Yes | Yes | Yes | Yes | Yes |

### How to Test Permissions
1. Switch to a role that should NOT have access
2. Check sidebar — restricted pages should be hidden
3. Try navigating directly to the URL (e.g., `/sunview/billing`)
4. **Expected:** Access denied message or redirect

---

## 14. Known Limitations

| Item | Status |
|------|--------|
| Analytics charts | Placeholder — no live data yet |
| Timezone setting | Pending (uses server timezone) |
| Claim submission to payers | CSV export only — no EDI integration yet |
| Multi-tenant | Only Sunview Eye Care seeded for testing |
| Public booking availability | Depends on provider schedule data being seeded |

---

## Test Data Reference

### Seed Patients
| Name | Chart ID Suffix |
|------|-----------------|
| Margaret Chen | d0..0001 |
| James Rodriguez | d0..0002 |
| Aisha Patel | d0..0003 |
| Robert Kim | d0..0004 |

### Non-Finalized Encounter
- **William Donovan** — Encounter ID: `e0000000-0007-0000-0000-000000000007`
- Use this to test the full encounter → finalization → billing flow

---

## Reporting Bugs

When reporting issues, please include:
1. **Role** you were using (from Dev Mode dropdown)
2. **URL** of the page
3. **Steps** to reproduce
4. **Expected** vs **actual** result
5. **Screenshot** if possible (browser dev tools: F12 → Console tab for errors)
