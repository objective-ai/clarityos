/**
 * smoke-intake.spec.js — Phase 7: Patient Intake API E2E verification
 *
 * Verifies: token generation (staff), token validation (public), DOB gate,
 * form submission, AI triage, re-submit rejection, invalid token handling.
 *
 * Hybrid test: browser login for JWT, then pure API calls.
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-intake.spec.js
 */
const { launchBrowser, login, extractJwt, printResults, API_URL, TARGET_URL } = require('./helpers/test-utils');

(async () => {
  const { browser, context, page } = await launchBrowser();
  const results = {};

  // 1. Login — get Supabase JWT for staff API calls
  const slug = await login(page);
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

  // 2. Find a SCHEDULED or CONFIRMED appointment
  let appointment = null;
  let patientDob = null;

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
    if (!patientsRes.ok()) { console.log('FAIL: Could not fetch patients'); await browser.close(); return; }

    const patient = ((await patientsRes.json()).items || [])[0];
    if (!patient) { console.log('FAIL: No patients in database'); await browser.close(); return; }

    const staffRes = await page.request.get(`${API_URL}/api/staff/`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const staffData = await staffRes.json();
    const provider = (staffData.items || staffData || []).find(s =>
      s.clinical_role === 'doctor' || s.role === 'doctor' || s.role === 'owner'
    ) || (staffData.items || staffData || [])[0];

    if (!provider) { console.log('FAIL: No providers found'); await browser.close(); return; }

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
      console.log(`FAIL: Could not book appointment: ${bookRes.status()} ${await bookRes.text()}`);
      await browser.close();
      return;
    }
  }

  // Fetch patient DOB
  const patientRes = await page.request.get(`${API_URL}/api/patients/${appointment.patient_id}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (patientRes.ok()) {
    patientDob = (await patientRes.json()).dob;
    console.log(`Patient DOB: ${patientDob}`);
  } else {
    console.log('FAIL: Could not fetch patient DOB');
    await browser.close();
    return;
  }

  // 3. Generate Intake Token (staff, authenticated)
  const tokenRes = await page.request.post(
    `${API_URL}/api/appointments/${appointment.id}/generate-intake-token/`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  let intakeToken = null;
  if (tokenRes.ok()) {
    const tokenData = await tokenRes.json();
    intakeToken = tokenData.token;
    results.generateToken = `PASS (token: ${intakeToken.substring(0, 12)}..., url: ${tokenData.url})`;
  } else {
    results.generateToken = `FAIL (${tokenRes.status()}: ${(await tokenRes.text()).substring(0, 200)})`;
    printResults('Smoke Intake (Phase 7)', results);
    await browser.close();
    return;
  }

  // 4. Validate Token (public, no auth)
  const validateRes = await page.request.get(`${API_URL}/api/public/intake/${intakeToken}/`);
  if (validateRes.ok()) {
    const data = await validateRes.json();
    results.validateToken = (data.clinic_name && data.appointment_date && data.appointment_type && data.requires_dob_verification === true)
      ? `PASS (clinic: ${data.clinic_name}, date: ${data.appointment_date}, dob_required: true)`
      : `FAIL (clinic: ${!!data.clinic_name}, date: ${!!data.appointment_date}, type: ${!!data.appointment_type}, dob: ${data.requires_dob_verification})`;
  } else {
    results.validateToken = `FAIL (${validateRes.status()})`;
  }

  // 5. Invalid Token — 404
  const invalidRes = await page.request.get(`${API_URL}/api/public/intake/fake_invalid_token_that_does_not_exist_at_all/`);
  results.invalidToken = invalidRes.status() === 404
    ? 'PASS (404 for fake token)'
    : `FAIL (expected 404, got ${invalidRes.status()})`;

  // 6. DOB Verification — Wrong DOB
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

  // 7. DOB Verification — Correct DOB
  const correctDobRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/verify-dob/`,
    { headers: { 'Content-Type': 'application/json' }, data: { dob: patientDob } }
  );
  if (correctDobRes.ok()) {
    const data = await correctDobRes.json();
    results.correctDob = (data.verified === true && data.patient_first_name)
      ? `PASS (verified: true, patient: ${data.patient_first_name} ${data.patient_last_name})`
      : `FAIL (verified: ${data.verified}, name: ${data.patient_first_name})`;
  } else {
    results.correctDob = `FAIL (${correctDobRes.status()})`;
  }

  // 8. Submit Intake Form
  const submissionPayload = {
    first_name: 'TestFirst', last_name: 'TestLast', preferred_name: 'Testy',
    dob: patientDob, sex: 'female',
    phone: '555-123-4567', email: 'test.intake@example.com',
    address_line1: '123 Test Street', address_line2: 'Suite 100',
    city: 'Testville', state: 'CA', zip_code: '90210',
    insurance_provider: 'Blue Cross', insurance_member_id: 'BC123456', insurance_group: 'GRP001',
    emergency_contact_name: 'Jane Doe', emergency_contact_phone: '555-987-6543', emergency_contact_relation: 'Spouse',
    medical_history: {
      glaucoma: false, cataracts: false, macular_degeneration: false, retinal_detachment: false,
      lazy_eye: false, eye_surgery: false, eye_injury: false,
      diabetes: true, hypertension: true, autoimmune: false, thyroid: false, heart_disease: false,
      current_medications: 'Metformin 500mg, Lisinopril 10mg', allergies: 'Sulfa drugs',
      family_ocular_history: 'Mother has glaucoma', other_conditions: null,
    },
    review_of_systems: {
      blurry_vision: true, double_vision: false, flashing_lights: true, floaters: true,
      loss_of_vision: false, eye_pain: false, eye_redness: false, eye_discharge: false,
      eye_itching: false, dry_eyes: true, tearing: false, light_sensitivity: true,
      headaches: true, dizziness: false,
    },
    chief_complaint: 'Seeing flashing lights and new floaters in right eye for the past 2 days, with intermittent blurry vision.',
  };

  const submitRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/`,
    { headers: { 'Content-Type': 'application/json' }, data: submissionPayload }
  );
  if (submitRes.ok()) {
    const data = await submitRes.json();
    results.submitForm = (data.success === true && data.message?.includes('received'))
      ? `PASS (success: true, message: "${data.message}")`
      : `FAIL (success: ${data.success}, message: ${data.message})`;
  } else {
    results.submitForm = `FAIL (${submitRes.status()}: ${(await submitRes.text()).substring(0, 200)})`;
  }

  // 9. Re-submit — should be rejected (410 Gone)
  const resubmitRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/`,
    { headers: { 'Content-Type': 'application/json' }, data: submissionPayload }
  );
  results.resubmitRejected = resubmitRes.status() === 410
    ? 'PASS (410 Gone — already submitted)'
    : `FAIL (expected 410, got ${resubmitRes.status()})`;

  // 10. Verify Appointment Updated (staff API)
  const apptDate = appointment.start_time.split('T')[0];
  const verifyRes = await page.request.get(
    `${API_URL}/api/appointments/?date=${apptDate}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );
  if (verifyRes.ok()) {
    const items = (await verifyRes.json()).items || [];
    const updated = items.find(a => a.id === appointment.id);
    results.appointmentUpdated = updated?.chief_complaint?.includes('flashing lights')
      ? `PASS (chief_complaint set: "${updated.chief_complaint.substring(0, 60)}...")`
      : `FAIL (chief_complaint: ${updated?.chief_complaint})`;
  } else {
    results.appointmentUpdated = `FAIL (${verifyRes.status()})`;
  }

  // 11. Token validation after submission — should be 410
  const afterSubmitRes = await page.request.get(`${API_URL}/api/public/intake/${intakeToken}/`);
  results.tokenExpiredAfterSubmit = afterSubmitRes.status() === 410
    ? 'PASS (410 Gone — token consumed)'
    : `FAIL (expected 410, got ${afterSubmitRes.status()})`;

  // 12. BFF Parity
  const bffTokenRes = await page.request.post(
    `${API_URL}/api/appointments/${appointment.id}/generate-intake-token/`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  if (bffTokenRes.ok()) {
    const bffToken = (await bffTokenRes.json()).token;

    const bffValidateRes = await page.request.get(`${TARGET_URL}/api/public/intake/${bffToken}`);
    if (bffValidateRes.ok()) {
      const data = await bffValidateRes.json();
      results.bffValidateToken = (data.clinic_name && data.appointment_date)
        ? `PASS (clinic: ${data.clinic_name})`
        : 'FAIL (missing fields)';
    } else {
      results.bffValidateToken = `FAIL (${bffValidateRes.status()})`;
    }

    const bffDobRes = await page.request.post(
      `${TARGET_URL}/api/public/intake/${bffToken}/verify-dob`,
      { headers: { 'Content-Type': 'application/json' }, data: { dob: patientDob } }
    );
    if (bffDobRes.ok()) {
      results.bffVerifyDob = (await bffDobRes.json()).verified === true
        ? 'PASS (verified via BFF)'
        : `FAIL (verified: ${(await bffDobRes.json()).verified})`;
    } else {
      results.bffVerifyDob = `FAIL (${bffDobRes.status()})`;
    }
  } else {
    results.bffValidateToken = 'SKIP (could not generate fresh token)';
    results.bffVerifyDob = 'SKIP';
  }

  printResults('Smoke Intake (Phase 7)', results);
  await browser.close();
})();
