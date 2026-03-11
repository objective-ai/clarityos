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

| # | Action | Expected Result |
|---|--------|-----------------|
| 7.12 | Click **AI Scribe** button (doctor/owner) | Transcript input area appears |
| 7.13 | Paste sample transcript text | AI generates SOAP note. Streams auto-fill of vitals, exam findings, Rx, diagnoses |
| 7.14 | Review AI output | Accept/Reject/Edit buttons for each auto-filled section |
| 7.15 | Switch to **core_plan** role | AI Scribe button hidden or shows upsell modal |

### AI Scribe Test Scripts

Copy-paste these into the AI Scribe transcript box to test different clinical scenarios:

**Script 1 — Routine Contact Lens**
*Why:* Tests the most common visit type — normal findings with a simple Rx change. Verifies the AI can extract IOP, prescription values, and mark all exam structures as normal.

> "Hi, good to see you. Vision is a bit blurry with your current contacts at the computer? Okay. Your pressure is 14 in the right and 13 in the left, which is perfect. Looking at your eyes, everything is healthy and clear. Your new prescription is minus 3.50 in the right and minus 3.00 in the left. No changes to the astigmatism."

**Expected AI output:** IOP OD 14 / OS 13, Rx OD −3.50 / OS −3.00, anterior/posterior segments normal, chief complaint about blurry vision with contacts at computer.

---

**Script 2 — Glaucoma Suspect**
*Why:* Tests a chronic disease monitoring visit with abnormal values. Verifies the AI can flag elevated IOP, extract optic nerve findings, identify medications, and generate a follow-up plan.

> "So your pressures are a bit high today at 24 and 23. Are you taking your Latanoprost every night? Your nerves look a little thinner than last time, especially on the right side. I see a cup-to-disc ratio of about 0.70. We're going to keep the diagnosis as glaucoma suspect but I want you to come back in three months for a visual field test."

**Expected AI output:** IOP OD 24 / OS 23 (elevated), optic nerve thinning OD, C/D ratio 0.70, diagnosis: glaucoma suspect, plan: visual field in 3 months, medication: Latanoprost.

---

**Script 3 — Corneal Abrasion**
*Why:* Tests an acute injury with single-eye findings. Verifies the AI can assign laterality (OD only), extract measurements, identify the correct diagnosis, and build a treatment plan with prescriptions.

> "So that right eye looks very painful. You've got a lot of redness. I see a small scratch on the surface of the cornea, about 3 millimeters wide. It's a corneal abrasion. I'm going to prescribe some antibiotic drops and a bandage contact lens. No foreign body found."

**Expected AI output:** OD corneal abrasion (3mm), redness, pain, no foreign body, diagnosis: corneal abrasion OD, plan: antibiotic drops + bandage contact lens.

---

**Script 4 — Diabetic Retinopathy**
*Why:* Tests a complex visit with systemic disease context and bilateral retinal findings. Verifies the AI can handle multiple finding types (hemorrhages, microaneurysms), bilateral diagnoses, co-management referrals, and vision acuity extraction.

> "So I'm seeing some changes in the back of your eyes related to your diabetes. There are a few small dot hemorrhages and microaneurysms in both eyes, more so on the right. No macular edema though, which is good. Your vision is still 20/25 in each eye. I'm going to diagnose this as mild nonproliferative diabetic retinopathy in both eyes and I want to send these photos to your primary care doctor. Let's recheck in six months."

**Expected AI output:** VA OD 20/25 / OS 20/25, posterior segment: dot hemorrhages + microaneurysms OU (worse OD), no macular edema, diagnosis: mild NPDR OU, plan: fundus photos to PCP, recheck 6 months.

---

**Script 5 — Comprehensive New Patient (Multiple Diagnoses)**
*Why:* Tests the AI's ability to extract multiple concurrent diagnoses from a single visit — the hardest scenario. Verifies it doesn't collapse findings into one diagnosis and can handle Rx, dry eye, and early cataract simultaneously.

> "So for your new glasses, you're minus 2.25 with minus 0.75 cylinder at 180 in the right, and minus 2.00 with minus 0.50 at 175 in the left. Add plus 1.50 both eyes for reading. Your eyes are pretty dry — I see some punctate staining on both corneas. I'd recommend artificial tears four times a day. Also, I'm noticing the very beginning of cataracts in both lenses, grade one nuclear sclerosis. Nothing to worry about yet but we'll keep an eye on it. Pressures are 16 and 15, nice and normal."

**Expected AI output:** IOP OD 16 / OS 15, Rx OD −2.25 −0.75×180 / OS −2.00 −0.50×175, Add +1.50 OU, corneal punctate staining OU, early nuclear sclerotic cataract OU (grade 1), diagnoses: myopia with astigmatism, dry eye syndrome, early cataract OU, plan: artificial tears QID.

---

**Script 6 — Pediatric / Binocular Vision**
*Why:* Tests terminology unique to pediatric optometry — accommodation, convergence, and binocular vision terms that differ from adult exams. Verifies the AI doesn't misinterpret these as standard refractive or pathological findings.

> "So your child is having trouble reading at school and getting headaches after about 20 minutes. Their distance vision is 20/20 in each eye which is great. But when I test how well their eyes focus up close, their accommodative amplitude is only about 5 diopters which is low for their age. And their convergence is receding to about 15 centimeters. I'm going to diagnose convergence insufficiency and accommodative insufficiency. I'd like to start vision therapy twice a week."

**Expected AI output:** VA OD 20/20 / OS 20/20, accommodative amplitude 5D (low), near point of convergence 15cm (receded), diagnoses: convergence insufficiency + accommodative insufficiency, plan: vision therapy 2x/week, chief complaint: trouble reading + headaches after 20 min.

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
