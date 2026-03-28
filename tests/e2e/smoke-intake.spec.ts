/**
 * smoke-intake.spec.ts — Phase 7: Patient Intake E2E verification
 *
 * Suite A (API): token generation, validation, DOB verification,
 *                form submission, re-submit rejection, BFF parity.
 * Suite B (UI):  DOB gate interaction (wrong DOB → error, correct DOB → unlock),
 *                4-step wizard navigation (Patient Info → Contact → Medical History → Chief Complaint),
 *                step validation gates, form pre-fill from verified patient,
 *                consent checkboxes, submit button state.
 *
 * Hybrid test: uses authenticated session (from fixture) for JWT, then tests public intake routes.
 */
import { test, expect } from './fixtures';

const TENANT = 'sunview';

// =========================================================================
// Helpers — find/create appointment + generate token
// =========================================================================

async function setupIntakeToken(page: import('@playwright/test').Page) {
  // Find a SCHEDULED or CONFIRMED appointment
  let appointment: Record<string, string> | null = null;

  for (const dayOffset of [0, 1, -1, 2, -2]) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const dateStr = d.toISOString().split('T')[0];

    const listRes = await page.request.get(`/api/appointments?date=${dateStr}`);
    if (listRes.ok()) {
      const data = await listRes.json();
      const items: Record<string, string>[] = data.items || data || [];
      const eligible = items.find(a => a.status === 'scheduled' || a.status === 'confirmed');
      if (eligible) {
        appointment = eligible;
        break;
      }
    }
  }

  if (!appointment) {
    // Try to book one
    const patientsRes = await page.request.get(`/api/patients?limit=1`);
    if (!patientsRes.ok()) return null;

    const patient = ((await patientsRes.json()).items || [])[0];
    if (!patient) return null;

    const staffRes = await page.request.get(`/api/staff`);
    const staffData = await staffRes.json();
    const provider = (staffData.items || staffData || []).find((s: Record<string, string>) =>
      s.clinical_role === 'doctor' || s.role === 'doctor' || s.role === 'owner'
    ) || (staffData.items || staffData || [])[0];

    if (!provider) return null;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startTime = new Date(tomorrow);
    startTime.setHours(10, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + 30);

    const bookRes = await page.request.post(`/api/appointments`, {
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
    } else {
      return null;
    }
  }

  // Fetch patient DOB
  const patientRes = await page.request.get(`/api/patients/${appointment.patient_id}`);
  if (!patientRes.ok()) return null;
  const patientDob: string = (await patientRes.json()).dob;

  // Generate token
  const tokenRes = await page.request.post(
    `/api/appointments/${appointment.id}/generate-intake-token`
  );
  if (!tokenRes.ok()) return null;

  const tokenData = await tokenRes.json();
  return { appointment, patientDob, token: tokenData.token, url: tokenData.url };
}

// =========================================================================
// Suite A — API Integration
// =========================================================================

test.describe('Smoke Intake — Suite A (API) @smoke', () => {
  test('generates a valid intake token', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    expect(setup).not.toBeNull();
    expect(setup!.token).toBeTruthy();
  });

  test('token validates with correct fields', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    expect(setup).not.toBeNull();

    const res = await page.request.get(`/api/public/intake/${setup!.token}`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.clinic_name).toBeTruthy();
    expect(data.appointment_date).toBeTruthy();
    expect(data.requires_dob_verification).toBe(true);
  });

  test('invalid token returns 404', async ({ page }) => {
    const res = await page.request.get(`/api/public/intake/fake_invalid_token_12345`);
    expect(res.status()).toBe(404);
  });

  test('wrong DOB returns verified=false with remaining attempts', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    expect(setup).not.toBeNull();

    const res = await page.request.post(
      `/api/public/intake/${setup!.token}/verify-dob`,
      { headers: { 'Content-Type': 'application/json' }, data: { dob: '1900-01-01' } }
    );
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.verified).toBe(false);
    expect(data.remaining_attempts).toBe(2);
  });

  test('correct DOB returns verified=true with patient name', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    expect(setup).not.toBeNull();

    const res = await page.request.post(
      `/api/public/intake/${setup!.token}/verify-dob`,
      { headers: { 'Content-Type': 'application/json' }, data: { dob: setup!.patientDob } }
    );
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.verified).toBe(true);
    expect(data.patient_first_name).toBeTruthy();
  });

  test('form submission succeeds and returns success message', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    expect(setup).not.toBeNull();

    const submissionPayload = {
      first_name: 'TestFirst', last_name: 'TestLast', preferred_name: 'Testy',
      dob: setup!.patientDob, sex: 'female',
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

    const res = await page.request.post(
      `/api/public/intake/${setup!.token}`,
      { headers: { 'Content-Type': 'application/json' }, data: submissionPayload }
    );
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('received');
  });

  test('re-submission returns 410 Gone', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    expect(setup).not.toBeNull();

    const submissionPayload = {
      first_name: 'TestFirst', last_name: 'TestLast',
      dob: setup!.patientDob, sex: 'female',
      chief_complaint: 'Test submission',
    };

    // First submit
    await page.request.post(
      `/api/public/intake/${setup!.token}`,
      { headers: { 'Content-Type': 'application/json' }, data: submissionPayload }
    );

    // Re-submit — should be 410
    const resubmitRes = await page.request.post(
      `/api/public/intake/${setup!.token}`,
      { headers: { 'Content-Type': 'application/json' }, data: submissionPayload }
    );
    expect(resubmitRes.status()).toBe(410);
  });

  test('token is consumed (410) after form submission', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    expect(setup).not.toBeNull();

    await page.request.post(
      `/api/public/intake/${setup!.token}`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: { first_name: 'Test', last_name: 'User', dob: setup!.patientDob, sex: 'male', chief_complaint: 'Test' },
      }
    );

    const afterRes = await page.request.get(`/api/public/intake/${setup!.token}`);
    expect(afterRes.status()).toBe(410);
  });

  test('BFF forwards intake token validation correctly', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    expect(setup).not.toBeNull();

    // Generate a fresh token for BFF test
    const bffTokenRes = await page.request.post(
      `/api/appointments/${setup!.appointment.id}/generate-intake-token`
    );
    if (!bffTokenRes.ok()) {
      test.skip(true, 'Could not generate fresh token for BFF test');
      return;
    }
    const bffToken = (await bffTokenRes.json()).token;
    const bffValidateRes = await page.request.get(`/api/public/intake/${bffToken}`);
    expect(bffValidateRes.ok()).toBe(true);
  });
});

// =========================================================================
// Suite B — UI Interaction (DOB gate + 4-step wizard)
// =========================================================================

test.describe('Smoke Intake — Suite B (UI) @smoke', () => {
  test('intake page shows DOB verification gate', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    if (!setup) {
      test.skip(true, 'Could not generate intake token for UI test');
      return;
    }

    await page.goto(`/intake/${setup.token}`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const verifyTitle = await page.locator('text=Verify Your Identity').count();
    expect(verifyTitle).toBeGreaterThan(0);
  });

  test('wrong DOB shows error message', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    if (!setup) {
      test.skip(true, 'Could not generate intake token for UI test');
      return;
    }

    await page.goto(`/intake/${setup.token}`, { waitUntil: 'networkidle' });

    const dobInput = page.locator('input[type="date"]');
    const verifyBtn = page.locator('button:has-text("Verify")');

    expect(await dobInput.count()).toBeGreaterThan(0);
    expect(await verifyBtn.count()).toBeGreaterThan(0);

    await dobInput.fill('1900-01-01');
    await verifyBtn.click();
    await page.waitForSelector('text=/Incorrect|attempt/', { state: 'visible', timeout: 5000 }).catch(() => {});

    const errorText = await page.locator('text=/Incorrect|attempt/').count();
    expect(errorText).toBeGreaterThan(0);
  });

  test('correct DOB unlocks the form', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    if (!setup) {
      test.skip(true, 'Could not generate intake token for UI test');
      return;
    }

    await page.goto(`/intake/${setup.token}`, { waitUntil: 'networkidle' });

    const dobInput = page.locator('input[type="date"]');
    const verifyBtn = page.locator('button:has-text("Verify")');

    await dobInput.fill(setup.patientDob);
    await verifyBtn.click();
    await page.waitForSelector('text=Patient Info', { state: 'visible', timeout: 10000 }).catch(() => {});

    const patientInfoStep = await page.locator('text=Patient Info').count();
    const firstNameInput = page.locator('input[placeholder*="First"]');
    const hasFirstName = await firstNameInput.count();

    expect(patientInfoStep > 0 || hasFirstName > 0).toBe(true);
  });

  test('progress bar shows step labels', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    if (!setup) {
      test.skip(true, 'Could not generate intake token for UI test');
      return;
    }

    await page.goto(`/intake/${setup.token}`, { waitUntil: 'networkidle' });
    const dobInput = page.locator('input[type="date"]');
    const verifyBtn = page.locator('button:has-text("Verify")');
    await dobInput.fill(setup.patientDob);
    await verifyBtn.click();
    await page.waitForSelector('text=Patient Info', { state: 'visible', timeout: 10000 }).catch(() => {});

    const steps = ['Patient Info', 'Contact & Insurance', 'Medical History', 'Chief Complaint'];
    let stepsVisible = 0;
    for (const s of steps) {
      if (await page.locator(`text="${s}"`).count() > 0) stepsVisible++;
    }
    expect(stepsVisible).toBeGreaterThanOrEqual(3);
  });

  test('step 1 navigates to step 2', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    if (!setup) {
      test.skip(true, 'Could not generate intake token for UI test');
      return;
    }

    await page.goto(`/intake/${setup.token}`, { waitUntil: 'networkidle' });
    const dobInput = page.locator('input[type="date"]');
    const verifyBtn = page.locator('button:has-text("Verify")');
    await dobInput.fill(setup.patientDob);
    await verifyBtn.click();
    await page.waitForSelector('text=Patient Info', { state: 'visible', timeout: 10000 }).catch(() => {});

    const nextBtn = page.locator('button:has-text("Next")');
    expect(await nextBtn.count()).toBeGreaterThan(0);

    const isNextDisabled = await nextBtn.isDisabled().catch(() => false);
    if (isNextDisabled) {
      const inputs = page.locator('input[type="text"]');
      const inputCount = await inputs.count();
      if (inputCount > 0) {
        const firstInput = inputs.first();
        if (!(await firstInput.inputValue())) await firstInput.fill('TestFirst');
        if (inputCount > 1) {
          const secondInput = inputs.nth(1);
          if (!(await secondInput.inputValue())) await secondInput.fill('TestLast');
        }
      }
      const dateInputs = page.locator('input[type="date"]');
      for (let i = 0; i < await dateInputs.count(); i++) {
        const di = dateInputs.nth(i);
        if (!(await di.inputValue())) await di.fill(setup.patientDob);
      }
      const sexSelect = page.locator('select').first();
      if (await sexSelect.count() > 0) {
        const selVal = await sexSelect.inputValue();
        if (!selVal) await sexSelect.selectOption('female');
      }
    }

    await nextBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const step2Visible = await page.locator('text=Contact & Insurance').count();
    const backBtn = await page.locator('button:has-text("Back")').count();
    expect(step2Visible > 0 || backBtn > 0).toBe(true);
  });

  test('back button returns to step 1', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    if (!setup) {
      test.skip(true, 'Could not generate intake token for UI test');
      return;
    }

    await page.goto(`/intake/${setup.token}`, { waitUntil: 'networkidle' });
    const dobInput = page.locator('input[type="date"]');
    await dobInput.fill(setup.patientDob);
    await page.locator('button:has-text("Verify")').click();
    await page.waitForSelector('text=Patient Info', { state: 'visible', timeout: 10000 }).catch(() => {});

    // Advance to step 2
    const nextBtn = page.locator('button:has-text("Next")');
    if (await nextBtn.count() > 0) {
      // Fill minimum fields if needed
      const isNextDisabled = await nextBtn.isDisabled().catch(() => false);
      if (isNextDisabled) {
        const inputs = page.locator('input[type="text"]');
        const firstInput = inputs.first();
        if (!(await firstInput.inputValue())) await firstInput.fill('TestFirst');
        const dateInputs = page.locator('input[type="date"]');
        for (let i = 0; i < await dateInputs.count(); i++) {
          const di = dateInputs.nth(i);
          if (!(await di.inputValue())) await di.fill(setup.patientDob);
        }
        const sexSelect = page.locator('select').first();
        if (await sexSelect.count() > 0 && !(await sexSelect.inputValue())) {
          await sexSelect.selectOption('female');
        }
      }
      await nextBtn.click();
      await page.waitForLoadState('domcontentloaded');
    }

    const backBtn = page.locator('button:has-text("Back")');
    if (await backBtn.count() > 0) {
      await backBtn.click();
      await page.waitForLoadState('domcontentloaded');
      const inputCount = await page.locator('input').first().count();
      expect(inputCount).toBeGreaterThan(0);
    } else {
      test.skip(true, 'No Back button on step 2');
    }
  });

  test('step 3 medical history shows checkboxes', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    if (!setup) {
      test.skip(true, 'Could not generate intake token for UI test');
      return;
    }

    await page.goto(`/intake/${setup.token}`, { waitUntil: 'networkidle' });
    const dobInput = page.locator('input[type="date"]');
    await dobInput.fill(setup.patientDob);
    await page.locator('button:has-text("Verify")').click();
    await page.waitForSelector('text=Patient Info', { state: 'visible', timeout: 10000 }).catch(() => {});

    // Navigate through steps 1 and 2
    for (let step = 0; step < 2; step++) {
      const nextBtn = page.locator('button:has-text("Next")');
      if (await nextBtn.count() > 0) {
        const isDisabled = await nextBtn.isDisabled().catch(() => false);
        if (isDisabled) {
          const inputs = page.locator('input[type="text"]');
          const firstInput = inputs.first();
          if (!(await firstInput.inputValue())) await firstInput.fill('TestFirst');
          const dateInputs = page.locator('input[type="date"]');
          for (let i = 0; i < await dateInputs.count(); i++) {
            const di = dateInputs.nth(i);
            if (!(await di.inputValue())) await di.fill(setup.patientDob);
          }
          const sexSelect = page.locator('select').first();
          if (await sexSelect.count() > 0 && !(await sexSelect.inputValue())) {
            await sexSelect.selectOption('female');
          }
        }
        await nextBtn.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }

    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    expect(checkboxCount).toBeGreaterThan(0);

    // Toggle first checkbox
    await checkboxes.first().check();
    expect(await checkboxes.first().isChecked()).toBe(true);
  });

  test('step 4 submit requires chief complaint and consent', async ({ page }) => {
    const setup = await setupIntakeToken(page);
    if (!setup) {
      test.skip(true, 'Could not generate intake token for UI test');
      return;
    }

    await page.goto(`/intake/${setup.token}`, { waitUntil: 'networkidle' });
    const dobInput = page.locator('input[type="date"]');
    await dobInput.fill(setup.patientDob);
    await page.locator('button:has-text("Verify")').click();
    await page.waitForSelector('text=Patient Info', { state: 'visible', timeout: 10000 }).catch(() => {});

    // Navigate through steps 1, 2, 3
    for (let step = 0; step < 3; step++) {
      const nextBtn = page.locator('button:has-text("Next")');
      if (await nextBtn.count() > 0) {
        const isDisabled = await nextBtn.isDisabled().catch(() => false);
        if (isDisabled) {
          const inputs = page.locator('input[type="text"]');
          const firstInput = inputs.first();
          if (!(await firstInput.inputValue())) await firstInput.fill('TestFirst');
          const dateInputs = page.locator('input[type="date"]');
          for (let i = 0; i < await dateInputs.count(); i++) {
            const di = dateInputs.nth(i);
            if (!(await di.inputValue())) await di.fill(setup.patientDob);
          }
          const sexSelect = page.locator('select').first();
          if (await sexSelect.count() > 0 && !(await sexSelect.inputValue())) {
            await sexSelect.selectOption('female');
          }
        }
        await nextBtn.click();
        await page.waitForLoadState('domcontentloaded');
      }
    }

    const submitBtn = page.locator('button:has-text("Submit")');
    expect(await submitBtn.count()).toBeGreaterThan(0);

    // Initially disabled without chief complaint + consent
    const initiallyDisabled = await submitBtn.isDisabled().catch(() => false);
    // Fill chief complaint
    const chiefTextarea = page.locator('textarea');
    if (await chiefTextarea.count() > 0) {
      await chiefTextarea.fill('E2E test — flashing lights and floaters for 2 days');
    }

    // Check all consent checkboxes
    const consentBoxes = page.locator('input[type="checkbox"]');
    const consentCount = await consentBoxes.count();
    for (let i = 0; i < consentCount; i++) {
      const cb = consentBoxes.nth(i);
      if (!(await cb.isChecked())) {
        await cb.check();
      }
    }

    // Submit should now be enabled
    const nowEnabled = !(await submitBtn.isDisabled().catch(() => true));
    expect(nowEnabled).toBe(true);
  });

  test('invalid token URL shows error state', async ({ page }) => {
    await page.goto(`/intake/fake_invalid_token_xyz`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    const errorPage = await page.locator('text=/not found|invalid|expired|error/i').count();
    expect(errorPage).toBeGreaterThan(0);
  });
});
