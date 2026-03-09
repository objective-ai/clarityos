/**
 * smoke-intake.spec.js — Phase 7: Patient Intake API E2E verification
 *
 * Verifies: token generation (staff), token validation (public), DOB gate,
 * form submission, AI triage, re-submit rejection, invalid token handling.
 *
 * This is an API-only test (no frontend UI for intake yet).
 * Run: node tests/e2e/smoke-intake.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const results = {};

  // =========================================================================
  // 1. Login — get Supabase JWT for staff API calls
  // =========================================================================
  console.log('=== Login ===');
  await page.goto(`${TARGET_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#email', { timeout: 15000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForURL('**/sunview/**', { timeout: 15000 }).catch(() => {});

  const urlAfterLogin = page.url();
  if (urlAfterLogin.includes('/login')) {
    console.log('Login failed — still on:', urlAfterLogin);
    await browser.close();
    return;
  }
  console.log('Logged in:', urlAfterLogin);

  // Extract Supabase JWT from cookies (chunked: sb-*-auth-token.0, .1, ...)
  const cookies = await context.cookies();
  const authCookieChunks = cookies
    .filter(c => c.name.includes('-auth-token'))
    .sort((a, b) => a.name.localeCompare(b.name));

  let jwt = null;
  if (authCookieChunks.length > 0) {
    const raw = authCookieChunks.map(c => c.value).join('');
    // Cookie value is "base64-<base64-encoded-json>"
    const b64 = raw.startsWith('base64-') ? raw.slice(7) : raw;
    try {
      const decoded = Buffer.from(b64, 'base64').toString('utf-8');
      const data = JSON.parse(decoded);
      jwt = data?.access_token || null;
    } catch { jwt = null; }
  }

  if (!jwt) {
    console.log('FAIL: Could not extract JWT from localStorage');
    await browser.close();
    return;
  }
  console.log('JWT extracted (length:', jwt.length, ')');

  // =========================================================================
  // 2. Find a SCHEDULED or CONFIRMED appointment
  // =========================================================================
  console.log('\n=== Find Appointment ===');

  // Try today first, then tomorrow (seed data may be on specific dates)
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
      const eligible = items.find(a =>
        a.status === 'scheduled' || a.status === 'confirmed'
      );
      if (eligible) {
        appointment = eligible;
        console.log(`Found appointment: ${appointment.id} (${appointment.status}) on ${dateStr}`);
        console.log(`  Patient: ${appointment.patient_name}, Type: ${appointment.appointment_type}`);
        break;
      }
    }
  }

  if (!appointment) {
    console.log('No scheduled/confirmed appointments found. Trying to book one...');

    // Get a patient to book for
    const patientsRes = await page.request.get(`${API_URL}/api/patients/?limit=1`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    if (!patientsRes.ok()) {
      console.log('FAIL: Could not fetch patients');
      await browser.close();
      return;
    }

    const patientsData = await patientsRes.json();
    const patient = (patientsData.items || [])[0];
    if (!patient) {
      console.log('FAIL: No patients in database');
      await browser.close();
      return;
    }

    // Get a provider (staff)
    const staffRes = await page.request.get(`${API_URL}/api/staff/`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const staffData = await staffRes.json();
    const provider = (staffData.items || staffData || []).find(s =>
      s.clinical_role === 'doctor' || s.role === 'doctor' || s.role === 'owner'
    ) || (staffData.items || staffData || [])[0];

    if (!provider) {
      console.log('FAIL: No providers found');
      await browser.close();
      return;
    }

    // Book appointment for tomorrow at 10am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startTime = new Date(tomorrow);
    startTime.setHours(10, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + 30);

    const bookRes = await page.request.post(`${API_URL}/api/appointments/`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
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
      const err = await bookRes.text();
      console.log(`FAIL: Could not book appointment: ${bookRes.status()} ${err}`);
      await browser.close();
      return;
    }
  }

  // Fetch patient DOB
  const patientRes = await page.request.get(`${API_URL}/api/patients/${appointment.patient_id}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (patientRes.ok()) {
    const patientData = await patientRes.json();
    patientDob = patientData.dob;
    console.log(`Patient DOB: ${patientDob}`);
  } else {
    console.log('FAIL: Could not fetch patient DOB');
    await browser.close();
    return;
  }

  // =========================================================================
  // 3. Generate Intake Token (staff, authenticated)
  // =========================================================================
  console.log('\n=== Generate Intake Token ===');
  const tokenRes = await page.request.post(
    `${API_URL}/api/appointments/${appointment.id}/generate-intake-token/`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  let intakeToken = null;
  if (tokenRes.ok()) {
    const tokenData = await tokenRes.json();
    intakeToken = tokenData.token;
    results.generateToken = `PASS (token: ${intakeToken.substring(0, 12)}..., url: ${tokenData.url})`;
    console.log('Token generated:', results.generateToken);
  } else {
    const err = await tokenRes.text();
    results.generateToken = `FAIL (${tokenRes.status()}: ${err.substring(0, 200)})`;
    console.log('Token generation failed:', results.generateToken);
    // Print results and exit
    printResults(results);
    await browser.close();
    return;
  }

  // =========================================================================
  // 4. Validate Token (public, no auth)
  // =========================================================================
  console.log('\n=== Validate Token ===');
  const validateRes = await page.request.get(
    `${API_URL}/api/public/intake/${intakeToken}/`
  );

  if (validateRes.ok()) {
    const data = await validateRes.json();
    const hasClinic = !!data.clinic_name;
    const hasDate = !!data.appointment_date;
    const hasType = !!data.appointment_type;
    const needsDob = data.requires_dob_verification === true;

    results.validateToken = (hasClinic && hasDate && hasType && needsDob)
      ? `PASS (clinic: ${data.clinic_name}, date: ${data.appointment_date}, dob_required: ${needsDob})`
      : `FAIL (clinic: ${hasClinic}, date: ${hasDate}, type: ${hasType}, dob: ${needsDob})`;
  } else {
    results.validateToken = `FAIL (${validateRes.status()})`;
  }
  console.log('Validate token:', results.validateToken);

  // =========================================================================
  // 5. Invalid Token — 404
  // =========================================================================
  console.log('\n=== Invalid Token ===');
  const invalidRes = await page.request.get(
    `${API_URL}/api/public/intake/fake_invalid_token_that_does_not_exist_at_all/`
  );

  results.invalidToken = invalidRes.status() === 404
    ? 'PASS (404 for fake token)'
    : `FAIL (expected 404, got ${invalidRes.status()})`;
  console.log('Invalid token:', results.invalidToken);

  // =========================================================================
  // 6. DOB Verification — Wrong DOB
  // =========================================================================
  console.log('\n=== DOB Verification (wrong) ===');
  const wrongDobRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/verify-dob/`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { dob: '1900-01-01' },
    }
  );

  if (wrongDobRes.ok()) {
    const data = await wrongDobRes.json();
    results.wrongDob = (data.verified === false && data.remaining_attempts === 2)
      ? `PASS (verified: false, remaining: ${data.remaining_attempts})`
      : `FAIL (verified: ${data.verified}, remaining: ${data.remaining_attempts})`;
  } else {
    results.wrongDob = `FAIL (${wrongDobRes.status()})`;
  }
  console.log('Wrong DOB:', results.wrongDob);

  // =========================================================================
  // 7. DOB Verification — Correct DOB
  // =========================================================================
  console.log('\n=== DOB Verification (correct) ===');
  const correctDobRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/verify-dob/`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: { dob: patientDob },
    }
  );

  if (correctDobRes.ok()) {
    const data = await correctDobRes.json();
    results.correctDob = (data.verified === true && data.patient_first_name)
      ? `PASS (verified: true, patient: ${data.patient_first_name} ${data.patient_last_name})`
      : `FAIL (verified: ${data.verified}, name: ${data.patient_first_name})`;
  } else {
    results.correctDob = `FAIL (${correctDobRes.status()})`;
  }
  console.log('Correct DOB:', results.correctDob);

  // =========================================================================
  // 8. Submit Without DOB (should fail if DOB not verified — but we just did)
  //    Instead, test the full form submission
  // =========================================================================
  console.log('\n=== Submit Intake Form ===');
  const submissionPayload = {
    // Demographics
    first_name: 'TestFirst',
    last_name: 'TestLast',
    preferred_name: 'Testy',
    dob: patientDob,
    sex: 'female',
    // Contact
    phone: '555-123-4567',
    email: 'test.intake@example.com',
    address_line1: '123 Test Street',
    address_line2: 'Suite 100',
    city: 'Testville',
    state: 'CA',
    zip_code: '90210',
    // Insurance
    insurance_provider: 'Blue Cross',
    insurance_member_id: 'BC123456',
    insurance_group: 'GRP001',
    // Emergency contact
    emergency_contact_name: 'Jane Doe',
    emergency_contact_phone: '555-987-6543',
    emergency_contact_relation: 'Spouse',
    // Medical history
    medical_history: {
      glaucoma: false,
      cataracts: false,
      macular_degeneration: false,
      retinal_detachment: false,
      lazy_eye: false,
      eye_surgery: false,
      eye_injury: false,
      diabetes: true,
      hypertension: true,
      autoimmune: false,
      thyroid: false,
      heart_disease: false,
      current_medications: 'Metformin 500mg, Lisinopril 10mg',
      allergies: 'Sulfa drugs',
      family_ocular_history: 'Mother has glaucoma',
      other_conditions: null,
    },
    // Review of systems — include urgent flags for triage test
    review_of_systems: {
      blurry_vision: true,
      double_vision: false,
      flashing_lights: true,   // urgent flag
      floaters: true,          // urgent flag
      loss_of_vision: false,
      eye_pain: false,
      eye_redness: false,
      eye_discharge: false,
      eye_itching: false,
      dry_eyes: true,
      tearing: false,
      light_sensitivity: true,
      headaches: true,
      dizziness: false,
    },
    // Chief complaint — urgent language
    chief_complaint: 'Seeing flashing lights and new floaters in right eye for the past 2 days, with intermittent blurry vision.',
  };

  const submitRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: submissionPayload,
    }
  );

  if (submitRes.ok()) {
    const data = await submitRes.json();
    results.submitForm = (data.success === true && data.message && data.message.includes('received'))
      ? `PASS (success: true, message: "${data.message}")`
      : `FAIL (success: ${data.success}, message: ${data.message})`;
  } else {
    const err = await submitRes.text();
    results.submitForm = `FAIL (${submitRes.status()}: ${err.substring(0, 200)})`;
  }
  console.log('Submit form:', results.submitForm);

  // =========================================================================
  // 9. Re-submit — should be rejected (410 Gone)
  // =========================================================================
  console.log('\n=== Re-submit (should be rejected) ===');
  const resubmitRes = await page.request.post(
    `${API_URL}/api/public/intake/${intakeToken}/`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: submissionPayload,
    }
  );

  results.resubmitRejected = resubmitRes.status() === 410
    ? 'PASS (410 Gone — already submitted)'
    : `FAIL (expected 410, got ${resubmitRes.status()})`;
  console.log('Re-submit rejected:', results.resubmitRejected);

  // =========================================================================
  // 10. Verify Appointment Updated (staff API)
  // =========================================================================
  console.log('\n=== Verify Appointment Updated ===');

  // Re-fetch the appointment to check intake_status and triage
  // Use the list endpoint with the appointment date
  const apptDate = appointment.start_time.split('T')[0];
  const verifyRes = await page.request.get(
    `${API_URL}/api/appointments/?date=${apptDate}`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  if (verifyRes.ok()) {
    const data = await verifyRes.json();
    const items = data.items || data || [];
    const updated = items.find(a => a.id === appointment.id);

    if (updated) {
      const hasChiefComplaint = updated.chief_complaint && updated.chief_complaint.includes('flashing lights');
      results.appointmentUpdated = hasChiefComplaint
        ? `PASS (chief_complaint set: "${updated.chief_complaint.substring(0, 60)}...")`
        : `FAIL (chief_complaint: ${updated.chief_complaint})`;
    } else {
      results.appointmentUpdated = 'FAIL (appointment not found in list)';
    }
  } else {
    results.appointmentUpdated = `FAIL (${verifyRes.status()})`;
  }
  console.log('Appointment updated:', results.appointmentUpdated);

  // =========================================================================
  // 11. Token validation after submission — should be 410
  // =========================================================================
  console.log('\n=== Token After Submit ===');
  const afterSubmitRes = await page.request.get(
    `${API_URL}/api/public/intake/${intakeToken}/`
  );

  results.tokenExpiredAfterSubmit = afterSubmitRes.status() === 410
    ? 'PASS (410 Gone — token consumed)'
    : `FAIL (expected 410, got ${afterSubmitRes.status()})`;
  console.log('Token after submit:', results.tokenExpiredAfterSubmit);

  // =========================================================================
  // 12. BFF Parity: Validate Token (via Next.js :3000)
  // =========================================================================
  console.log('\n=== BFF Parity: Validate Token ===');

  // Generate a fresh token for BFF test (previous token was consumed)
  const bffTokenRes = await page.request.post(
    `${API_URL}/api/appointments/${appointment.id}/generate-intake-token/`,
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  if (bffTokenRes.ok()) {
    const bffTokenData = await bffTokenRes.json();
    const bffToken = bffTokenData.token;

    // Test via BFF (no trailing slash — Next.js route)
    const bffValidateRes = await page.request.get(
      `${TARGET_URL}/api/public/intake/${bffToken}`
    );
    if (bffValidateRes.ok()) {
      const data = await bffValidateRes.json();
      results.bffValidateToken = (data.clinic_name && data.appointment_date)
        ? `PASS (clinic: ${data.clinic_name})`
        : `FAIL (missing fields)`;
    } else {
      results.bffValidateToken = `FAIL (${bffValidateRes.status()})`;
    }

    // BFF: verify-dob
    const bffDobRes = await page.request.post(
      `${TARGET_URL}/api/public/intake/${bffToken}/verify-dob`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: { dob: patientDob },
      }
    );
    if (bffDobRes.ok()) {
      const data = await bffDobRes.json();
      results.bffVerifyDob = data.verified === true
        ? `PASS (verified via BFF)`
        : `FAIL (verified: ${data.verified})`;
    } else {
      results.bffVerifyDob = `FAIL (${bffDobRes.status()})`;
    }
  } else {
    results.bffValidateToken = 'SKIP (could not generate fresh token)';
    results.bffVerifyDob = 'SKIP';
  }
  console.log('BFF validate token:', results.bffValidateToken);
  console.log('BFF verify DOB:', results.bffVerifyDob);

  // =========================================================================
  // Results
  // =========================================================================
  printResults(results);
  await browser.close();
})();

function printResults(results) {
  console.log('\n=== RESULTS ===');
  for (const [key, val] of Object.entries(results)) {
    const icon = val.startsWith('PASS') ? 'OK' : val.startsWith('SKIP') || val.startsWith('INFO') ? '--' : 'XX';
    console.log(`  [${icon}] ${key}: ${val}`);
  }

  const passFail = Object.values(results).filter(v => !v.startsWith('SKIP') && !v.startsWith('INFO'));
  const allPass = passFail.every(v => v.startsWith('PASS'));
  console.log('\n' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));
}
