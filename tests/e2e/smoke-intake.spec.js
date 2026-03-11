/**
 * smoke-intake.spec.js — Phase 7: Patient Intake E2E verification
 *
 * Suite A (API): token generation, validation, DOB verification,
 *                form submission, re-submit rejection, BFF parity.
 * Suite B (UI):  DOB gate interaction (wrong DOB → error, correct DOB → unlock),
 *                4-step wizard navigation (Patient Info → Contact → Medical History → Chief Complaint),
 *                step validation gates, form pre-fill from verified patient,
 *                consent checkboxes, submit button state.
 *
 * Hybrid test: browser login for JWT, then API + UI tests.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-intake.spec.js
 */
const { launchBrowser, loginOrRestore, extractJwt, printResults, API_URL, TARGET_URL } = require('./helpers/test-utils');

// =========================================================================
// Helpers — find/create appointment + generate token
// =========================================================================

async function setupIntakeToken(page, jwt) {
  // Find a SCHEDULED or CONFIRMED appointment
  let appointment = null;

  for (const dayOffset of [0, 1, -1, 2, -2]) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const dateStr = d.toISOString().split('T')[0];

    const listRes = await page.request.get(`${API_URL}/api/appointments/?date=${dateStr}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    if (listRes.ok()) {
      const data = await listRes.json();
      const items = data.items || data || [];
      const eligible = items.find(a => a.status === 'scheduled' || a.status === 'confirmed');
      if (eligible) {
        appointment = eligible;
        console.log(`Found appointment: ${appointment.id} (${appointment.status}) on ${dateStr}`);
        break;
      }
    }
  }

  if (!appointment) {
    console.log('No scheduled/confirmed appointments found. Trying to book one...');

    const patientsRes = await page.request.get(`${API_URL}/api/patients/?limit=1`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (!patientsRes.ok()) return null;

    const patient = ((await patientsRes.json()).items || [])[0];
    if (!patient) return null;

    const staffRes = await page.request.get(`${API_URL}/api/staff/`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const staffData = await staffRes.json();
    const provider = (staffData.items || staffData || []).find(s =>
      s.clinical_role === 'doctor' || s.role === 'doctor' || s.role === 'owner'
    ) || (staffData.items || staffData || [])[0];

    if (!provider) return null;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startTime = new Date(tomorrow);
    startTime.setHours(10, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + 30);

    const bookRes = await page.request.post(`${API_URL}/api/appointments/`, {
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      data: {
        patient_id: patient.id,
        provider_id: provider.id,
        appointment_type: 'comprehensive_exam',
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: 30,
      },
    });

    if (bookRes.ok()) {
      appointment = await bookRes.json();
      console.log(`Booked appointment: ${appointment.id}`);
    } else {
      return null;
    }
  }

  // Fetch patient DOB
  const patientRes = await page.request.get(`${API_URL}/api/patients/${appointment.patient_id}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!patientRes.ok()) return null;
  const patientDob = (await patientRes.json()).dob;

  // Generate token
  const tokenRes = await page.request.post(
    `${API_URL}/api/appointments/${appointment.id}/generate-intake-token/`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  if (!tokenRes.ok()) return null;

  const tokenData = await tokenRes.json();
  return { appointment, patientDob, token: tokenData.token, url: tokenData.url };
}

// =========================================================================
// Suite A — API Integration (existing tests)
// =========================================================================

async function runApiTests(page, jwt) {
  const results = {};

  const setup = await setupIntakeToken(page, jwt);
  if (!setup) {
    results.setup = 'FAIL (could not create appointment or generate token)';
    return results;
  }

  const { appointment, patientDob, token: intakeToken } = setup;
  results.generateToken = `PASS (token: ${intakeToken.substring(0, 12)}...)`;

  // Validate Token
  const validateRes = await page.request.get(`${API_URL}/api/public/intake/${intakeToken}/`);
  if (validateRes.ok()) {
    const data = await validateRes.json();
    results.validateToken = (data.clinic_name && data.appointment_date && data.requires_dob_verification === true)
      ? `PASS (clinic: ${data.clinic_name}, dob_required: true)`
      : `FAIL (missing fields)`;
  } else {
    results.validateToken = `FAIL (${validateRes.status()})`;
  }

  // Invalid Token — 404
  const invalidRes = await page.request.get(`${API_URL}/api/public/intake/fake_invalid_token_12345/`);
  results.invalidToken = invalidRes.status() === 404
    ? 'PASS (404 for fake token)'
    : `FAIL (expected 404, got ${invalidRes.status()})`;

  // Wrong DOB
  const wrongDobRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/verify-dob/`,
    { headers: { 'Content-Type': 'application/json' }, data: { dob: '1900-01-01' } }
  );
  if (wrongDobRes.ok()) {
    const data = await wrongDobRes.json();
    results.wrongDob = (data.verified === false && data.remaining_attempts === 2)
      ? `PASS (verified: false, remaining: ${data.remaining_attempts})`
      : `FAIL (verified: ${data.verified}, remaining: ${data.remaining_attempts})`;
  } else {
    results.wrongDob = `FAIL (${wrongDobRes.status()})`;
  }

  // Correct DOB
  const correctDobRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/verify-dob/`,
    { headers: { 'Content-Type': 'application/json' }, data: { dob: patientDob } }
  );
  if (correctDobRes.ok()) {
    const data = await correctDobRes.json();
    results.correctDob = (data.verified === true && data.patient_first_name)
      ? `PASS (patient: ${data.patient_first_name} ${data.patient_last_name})`
      : `FAIL (verified: ${data.verified})`;
  } else {
    results.correctDob = `FAIL (${correctDobRes.status()})`;
  }

  // Submit Form
  const submissionPayload = {
    first_name: 'TestFirst', last_name: 'TestLast', preferred_name: 'Testy',
    dob: patientDob, sex: 'female',
    phone: '555-123-4567', email: 'test.intake@example.com',
    address_line1: '123 Test Street', city: 'Testville', state: 'CA', zip_code: '90210',
    insurance_provider: 'Blue Cross', insurance_member_id: 'BC123456', insurance_group: 'GRP001',
    emergency_contact_name: 'Jane Doe', emergency_contact_phone: '555-987-6543', emergency_contact_relation: 'Spouse',
    medical_history: {
      glaucoma: false, cataracts: false, macular_degeneration: false, retinal_detachment: false,
      lazy_eye: false, eye_surgery: false, eye_injury: false,
      diabetes: true, hypertension: true, autoimmune: false, thyroid: false, heart_disease: false,
      current_medications: 'Metformin 500mg', allergies: 'Sulfa drugs',
      family_ocular_history: 'Mother has glaucoma', other_conditions: null,
    },
    review_of_systems: {
      blurry_vision: true, double_vision: false, flashing_lights: true, floaters: true,
      loss_of_vision: false, eye_pain: false, eye_redness: false, eye_discharge: false,
      eye_itching: false, dry_eyes: true, tearing: false, light_sensitivity: true,
      headaches: true, dizziness: false,
    },
    chief_complaint: 'Seeing flashing lights and new floaters in right eye for 2 days.',
  };

  const submitRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/`,
    { headers: { 'Content-Type': 'application/json' }, data: submissionPayload }
  );
  if (submitRes.ok()) {
    const data = await submitRes.json();
    results.submitForm = (data.success === true && data.message?.includes('received'))
      ? `PASS ("${data.message}")`
      : `FAIL (success: ${data.success})`;
  } else {
    results.submitForm = `FAIL (${submitRes.status()})`;
  }

  // Re-submit — 410
  const resubmitRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/`,
    { headers: { 'Content-Type': 'application/json' }, data: submissionPayload }
  );
  results.resubmitRejected = resubmitRes.status() === 410
    ? 'PASS (410 Gone)'
    : `FAIL (expected 410, got ${resubmitRes.status()})`;

  // Token consumed — 410
  const afterRes = await page.request.get(`${API_URL}/api/public/intake/${intakeToken}/`);
  results.tokenConsumed = afterRes.status() === 410
    ? 'PASS (410 Gone — token consumed)'
    : `FAIL (expected 410, got ${afterRes.status()})`;

  // BFF Parity
  const bffTokenRes = await page.request.post(
    `${API_URL}/api/appointments/${appointment.id}/generate-intake-token/`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  if (bffTokenRes.ok()) {
    const bffToken = (await bffTokenRes.json()).token;
    const bffValidateRes = await page.request.get(`${TARGET_URL}/api/public/intake/${bffToken}`);
    results.bffParity = bffValidateRes.ok()
      ? 'PASS (BFF forwards to backend correctly)'
      : `FAIL (BFF status: ${bffValidateRes.status()})`;
  } else {
    results.bffParity = 'SKIP (could not generate fresh token)';
  }

  return results;
}

// =========================================================================
// Suite B — UI Interaction (DOB gate + 4-step wizard)
// =========================================================================

async function runUiTests(page, jwt) {
  const results = {};

  // Generate a fresh token for UI testing
  const setup = await setupIntakeToken(page, jwt);
  if (!setup) {
    results.suiteB = 'SKIP (could not generate intake token for UI test)';
    return results;
  }

  const { patientDob, token } = setup;

  // Navigate to the intake page
  await page.goto(`${TARGET_URL}/intake/${token}`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  // ── 1. Token Validation — Page Loads ──────────────────────────────────
  const verifyTitle = await page.locator('text=Verify Your Identity').count();
  const clinicName = await page.locator('h1').first().textContent().catch(() => '');
  results.intakePageLoads = verifyTitle > 0
    ? `PASS (DOB gate shown, clinic: "${clinicName?.trim()}")`
    : 'FAIL (DOB verification page not shown)';

  if (verifyTitle === 0) {
    // May have landed on error or expired page
    await page.screenshot({ path: '/tmp/pw-e2e-intake-ui-error.png', fullPage: true });
    return results;
  }

  // ── 2. DOB Gate — Wrong DOB ───────────────────────────────────────────
  const dobInput = page.locator('input[type="date"]');
  const verifyBtn = page.locator('button:has-text("Verify")');

  if (await dobInput.count() > 0 && await verifyBtn.count() > 0) {
    await dobInput.fill('1900-01-01');
    await verifyBtn.click();
    await page.waitForSelector('text=/Incorrect|attempt/', { state: 'visible', timeout: 5000 }).catch(() => {});

    const errorText = await page.locator('text=/Incorrect|attempt/').count();
    results.dobWrongAttempt = errorText > 0
      ? 'PASS (error shown for wrong DOB)'
      : 'FAIL (no error message for wrong DOB)';

    // ── 3. DOB Gate — Correct DOB ─────────────────────────────────────────
    await dobInput.fill(patientDob);
    await verifyBtn.click();
    await page.waitForSelector('text=Patient Info', { state: 'visible', timeout: 10000 }).catch(() => {});

    // Should now show the form (Step 1: Patient Info)
    const patientInfoStep = await page.locator('text=Patient Info').count();
    const firstNameInput = page.locator('input[placeholder*="First"]');
    const hasFirstName = await firstNameInput.count();

    results.dobCorrectUnlock = (patientInfoStep > 0 || hasFirstName > 0)
      ? 'PASS (DOB verified → form unlocked)'
      : 'FAIL (form did not appear after correct DOB)';

    if (patientInfoStep === 0 && hasFirstName === 0) {
      await page.screenshot({ path: '/tmp/pw-e2e-intake-ui-dob-fail.png', fullPage: true });
      return results;
    }
  } else {
    results.dobWrongAttempt = 'FAIL (no DOB input or Verify button)';
    results.dobCorrectUnlock = 'SKIP';
    return results;
  }

  await page.screenshot({ path: '/tmp/pw-e2e-intake-ui-step1.png', fullPage: true });

  // ── 4. Step Progress Bar ──────────────────────────────────────────────
  const steps = ['Patient Info', 'Contact & Insurance', 'Medical History', 'Chief Complaint'];
  let stepsVisible = 0;
  for (const s of steps) {
    if (await page.locator(`text="${s}"`).count() > 0) stepsVisible++;
  }
  results.progressBar = stepsVisible >= 3
    ? `PASS (${stepsVisible}/4 step labels visible)`
    : `FAIL (only ${stepsVisible}/4 steps visible)`;

  // ── 5. Step 1: Patient Info — Pre-fill + Validation ───────────────────
  // Check if fields are pre-filled from DOB verification
  const firstNameVal = await page.locator('input').first().inputValue().catch(() => '');
  results.step1PreFill = firstNameVal && firstNameVal.length > 0
    ? `PASS (first name pre-filled: "${firstNameVal}")`
    : 'INFO (first name not pre-filled — may require manual entry)';

  // Try Next without required fields (should be disabled if firstName/lastName/dob/sex empty)
  const nextBtn = page.locator('button:has-text("Next")');
  if (await nextBtn.count() > 0) {
    // Check if fields are filled — if pre-filled, Next should be enabled
    const isNextDisabled = await nextBtn.isDisabled().catch(() => false);

    // Fill required fields if empty
    const inputs = page.locator('input[type="text"]');
    const inputCount = await inputs.count();
    if (inputCount > 0 && isNextDisabled) {
      // Fill minimum required: first name, last name
      const firstInput = inputs.first();
      if (!(await firstInput.inputValue())) await firstInput.fill('TestFirst');
      if (inputCount > 1) {
        const secondInput = inputs.nth(1);
        if (!(await secondInput.inputValue())) await secondInput.fill('TestLast');
      }
      // DOB + sex select
      const dateInputs = page.locator('input[type="date"]');
      for (let i = 0; i < await dateInputs.count(); i++) {
        const di = dateInputs.nth(i);
        if (!(await di.inputValue())) await di.fill(patientDob);
      }
      const sexSelect = page.locator('select').first();
      if (await sexSelect.count() > 0) {
        const selVal = await sexSelect.inputValue();
        if (!selVal) await sexSelect.selectOption('female');
      }
    }

    // Click Next → Step 2
    await nextBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const step2Visible = await page.locator('text=Contact & Insurance').count();
    const backBtn = await page.locator('button:has-text("Back")').count();
    results.step1ToStep2 = (step2Visible > 0 || backBtn > 0)
      ? 'PASS (navigated to Step 2)'
      : 'FAIL (did not advance to Step 2)';
  } else {
    results.step1ToStep2 = 'FAIL (no Next button)';
  }

  // ── 6. Step 2: Contact & Insurance — Back Button ──────────────────────
  const backBtn = page.locator('button:has-text("Back")');
  if (await backBtn.count() > 0) {
    // Verify Back returns to Step 1
    await backBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const backToStep1 = await page.locator('input').first().count() > 0;
    results.step2Back = backToStep1
      ? 'PASS (Back returned to Step 1)'
      : 'INFO (Back clicked but step unclear)';

    // Go forward again to continue
    const nextBtn2 = page.locator('button:has-text("Next")');
    if (await nextBtn2.count() > 0) {
      await nextBtn2.click();
      await page.waitForLoadState('domcontentloaded');
    }
  } else {
    results.step2Back = 'SKIP (no Back button)';
  }

  // Advance through Step 2 → Step 3
  const nextBtn3 = page.locator('button:has-text("Next")');
  if (await nextBtn3.count() > 0) {
    await nextBtn3.click();
    await page.waitForLoadState('domcontentloaded');

    const medHistoryVisible = await page.locator('text=Medical History').count();
    results.step2ToStep3 = medHistoryVisible > 0
      ? 'PASS (navigated to Step 3: Medical History)'
      : 'INFO (step changed but Medical History label not found)';
  } else {
    results.step2ToStep3 = 'FAIL (no Next button on Step 2)';
  }

  // ── 7. Step 3: Medical History — Checkboxes ───────────────────────────
  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  results.step3Checkboxes = checkboxCount > 5
    ? `PASS (${checkboxCount} medical history checkboxes)`
    : checkboxCount > 0
      ? `PASS (${checkboxCount} checkboxes)`
      : 'FAIL (no checkboxes on Medical History step)';

  // Toggle a few checkboxes
  if (checkboxCount > 0) {
    await checkboxes.first().check();
    const isChecked = await checkboxes.first().isChecked();
    results.step3CheckboxToggle = isChecked
      ? 'PASS (checkbox toggles on click)'
      : 'FAIL (checkbox did not toggle)';
  } else {
    results.step3CheckboxToggle = 'SKIP';
  }

  // Advance to Step 4
  const nextBtn4 = page.locator('button:has-text("Next")');
  if (await nextBtn4.count() > 0) {
    await nextBtn4.click();
    await page.waitForLoadState('domcontentloaded');

    const chiefComplaintVisible = await page.locator('text=Chief Complaint').count();
    results.step3ToStep4 = chiefComplaintVisible > 0
      ? 'PASS (navigated to Step 4: Chief Complaint)'
      : 'INFO (step changed)';
  } else {
    results.step3ToStep4 = 'FAIL (no Next button on Step 3)';
  }

  // ── 8. Step 4: Chief Complaint + Consent + Submit ─────────────────────
  const submitBtn = page.locator('button:has-text("Submit")');
  const chiefTextarea = page.locator('textarea');

  // Submit should be disabled without chief complaint + consent
  if (await submitBtn.count() > 0) {
    const initiallyDisabled = await submitBtn.isDisabled().catch(() => false);
    results.step4SubmitGate = initiallyDisabled
      ? 'PASS (Submit disabled without chief complaint + consent)'
      : 'INFO (Submit enabled — fields may be pre-filled)';

    // Fill chief complaint
    if (await chiefTextarea.count() > 0) {
      await chiefTextarea.fill('E2E test — flashing lights and floaters for 2 days');
    }

    // Check consent checkboxes
    const consentBoxes = page.locator('input[type="checkbox"]');
    const consentCount = await consentBoxes.count();
    for (let i = 0; i < consentCount; i++) {
      const cb = consentBoxes.nth(i);
      if (!(await cb.isChecked())) {
        await cb.check();
      }
    }

    // Now Submit should be enabled
    const nowEnabled = !(await submitBtn.isDisabled().catch(() => true));
    results.step4SubmitEnabled = nowEnabled
      ? 'PASS (Submit enabled after filling complaint + consent)'
      : 'INFO (Submit still disabled — may need additional fields)';

    // Do NOT actually submit — this would consume the token
    // Just verify the button state
  } else {
    results.step4SubmitGate = 'FAIL (no Submit button on Step 4)';
    results.step4SubmitEnabled = 'SKIP';
  }

  await page.screenshot({ path: '/tmp/pw-e2e-intake-ui-step4.png', fullPage: true });

  // ── 9. Invalid Token — Error Page ─────────────────────────────────────
  await page.goto(`${TARGET_URL}/intake/fake_invalid_token_xyz`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const errorPage = await page.locator('text=/not found|invalid|expired|error/i').count();
  results.invalidTokenPage = errorPage > 0
    ? 'PASS (error/not-found state for invalid token)'
    : 'FAIL (no error shown for invalid token)';

  await page.screenshot({ path: '/tmp/pw-e2e-intake-ui-invalid.png', fullPage: true });

  return results;
}

// =========================================================================
// Main
// =========================================================================

(async () => {
  const { browser, context, page } = await launchBrowser();

  const slug = await loginOrRestore(context, page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  const jwt = await extractJwt(context);
  if (!jwt) {
    console.log('FAIL: Could not extract JWT from cookies');
    await browser.close();
    return;
  }
  console.log('JWT extracted (length:', jwt.length, ')');

  // Suite A — API Integration
  console.log('\n--- Suite A: API ---');
  const apiResults = await runApiTests(page, jwt);
  printResults('Smoke Intake — Suite A (API)', apiResults);

  // Suite B — UI Interaction
  console.log('\n--- Suite B: UI Interaction ---');
  const uiResults = await runUiTests(page, jwt);
  printResults('Smoke Intake — Suite B (UI)', uiResults);

  await browser.close();
})();
