/**
 * smoke-booking.spec.js — Sprint 3.3: Public Booking API E2E verification
 *
 * Verifies: clinic info endpoint, availability endpoint, public booking
 * (patient + appointment + intake token creation), double-booking rejection.
 *
 * These are public (unauthenticated) endpoints — no login required.
 * Run: node tests/e2e/smoke-booking.spec.js
 */

const API_URL = 'http://localhost:8000';
const BFF_URL = 'http://localhost:3000';
const SLUG = 'sunview';

// Known provider IDs from seed_db.py (Sarah Lin = doctor, Duy Tran = owner)
const PROVIDER_SARAH = 'c0000000-0000-0000-0000-000000000001';
const PROVIDER_DUY = 'c0000000-0000-0000-0000-000000000003';

function assert(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

(async () => {
  const results = {};

  // Helper: generate a future date string (next Monday)
  function getNextWeekday(dayOffset = 7) {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    // Skip weekends
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  const futureDate = getNextWeekday(7);
  console.log(`Using future date: ${futureDate}`);

  // =========================================================================
  // 1. GET /api/public/booking/{slug}/info/ — clinic info
  // =========================================================================
  console.log('\n=== 1. Clinic Info ===');
  try {
    const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/info/`);
    const data = await res.json();

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(data.clinic_name === 'Sunview Eye Care', `Expected clinic name, got: ${data.clinic_name}`);
    assert(data.timezone, 'Missing timezone');
    assert(Array.isArray(data.bookable_types), 'bookable_types should be array');
    assert(data.bookable_types.length >= 1, 'Should have at least 1 bookable type');
    assert(Array.isArray(data.providers), 'providers should be array');
    assert(data.providers.length >= 1, 'Should have at least 1 provider');

    // Verify bookable types don't include urgent_care or follow_up
    const typeValues = data.bookable_types.map(t => t.value);
    assert(!typeValues.includes('urgent_care'), 'urgent_care should not be bookable');
    assert(!typeValues.includes('follow_up'), 'follow_up should not be bookable');
    assert(typeValues.includes('comprehensive_exam'), 'comprehensive_exam should be bookable');

    console.log(`  Clinic: ${data.clinic_name}`);
    console.log(`  Types: ${typeValues.join(', ')}`);
    console.log(`  Providers: ${data.providers.map(p => `${p.first_name} ${p.last_name}`).join(', ')}`);
    results['clinic_info'] = 'PASS';
  } catch (e) {
    console.error('  ', e.message);
    results['clinic_info'] = 'FAIL';
  }

  // =========================================================================
  // 2. GET /api/public/booking/{slug}/info/ — invalid slug → 404
  // =========================================================================
  console.log('\n=== 2. Invalid Slug → 404 ===');
  try {
    const res = await fetch(`${API_URL}/api/public/booking/nonexistent-clinic/info/`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
    console.log('  Got 404 as expected');
    results['invalid_slug'] = 'PASS';
  } catch (e) {
    console.error('  ', e.message);
    results['invalid_slug'] = 'FAIL';
  }

  // =========================================================================
  // 3. GET /api/public/booking/{slug}/availability/ — available slots
  // =========================================================================
  console.log('\n=== 3. Availability ===');
  let availableSlot = null;
  try {
    const qs = new URLSearchParams({
      date: futureDate,
      provider_id: PROVIDER_SARAH,
      appointment_type: 'comprehensive_exam',
    });
    const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/availability/?${qs}`);
    const data = await res.json();

    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(data.date === futureDate, `Expected date ${futureDate}, got ${data.date}`);
    assert(Array.isArray(data.slots), 'slots should be array');
    assert(data.slots.length > 0, 'Should have at least 1 available slot');
    assert(data.provider_name, 'Missing provider_name');

    availableSlot = data.slots[0]; // Use first available slot
    console.log(`  Provider: ${data.provider_name}`);
    console.log(`  Available slots: ${data.slots.length}`);
    console.log(`  First slot: ${availableSlot}`);
    results['availability'] = 'PASS';
  } catch (e) {
    console.error('  ', e.message);
    results['availability'] = 'FAIL';
  }

  // =========================================================================
  // 4. Availability — past date → 400
  // =========================================================================
  console.log('\n=== 4. Past Date → 400 ===');
  try {
    const qs = new URLSearchParams({
      date: '2020-01-01',
      provider_id: PROVIDER_SARAH,
      appointment_type: 'comprehensive_exam',
    });
    const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/availability/?${qs}`);
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    console.log('  Got 400 as expected');
    results['past_date_rejection'] = 'PASS';
  } catch (e) {
    console.error('  ', e.message);
    results['past_date_rejection'] = 'FAIL';
  }

  // =========================================================================
  // 5. POST /api/public/booking/{slug}/book/ — successful booking
  // =========================================================================
  console.log('\n=== 5. Create Public Booking ===');
  let bookingResult = null;
  if (availableSlot) {
    try {
      const payload = {
        first_name: 'Test',
        last_name: 'BookingPatient',
        dob: '1990-05-15',
        sex: 'female',
        phone: '555-0199',
        email: 'test.booking@example.com',
        provider_id: PROVIDER_SARAH,
        appointment_type: 'comprehensive_exam',
        start_time: availableSlot,
        chief_complaint: 'Annual eye exam',
      };

      const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/book/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(data)}`);
      assert(data.success === true, 'Expected success=true');
      assert(data.appointment_id, 'Missing appointment_id');
      assert(data.intake_url, 'Missing intake_url');
      assert(data.provider_name, 'Missing provider_name');
      assert(data.appointment_type_label === 'Comprehensive Exam', `Unexpected label: ${data.appointment_type_label}`);

      bookingResult = data;
      console.log(`  Appointment: ${data.appointment_id}`);
      console.log(`  Date: ${data.appointment_date}`);
      console.log(`  Provider: ${data.provider_name}`);
      console.log(`  Intake URL: ${data.intake_url}`);
      results['create_booking'] = 'PASS';
    } catch (e) {
      console.error('  ', e.message);
      results['create_booking'] = 'FAIL';
    }
  } else {
    console.log('  SKIP — no available slot from step 3');
    results['create_booking'] = 'SKIP';
  }

  // =========================================================================
  // 6. POST same slot again → 409 Conflict (double-booking prevention)
  // =========================================================================
  console.log('\n=== 6. Double-Book → 409 ===');
  if (availableSlot) {
    try {
      const payload = {
        first_name: 'Another',
        last_name: 'Patient',
        dob: '1985-08-20',
        sex: 'male',
        provider_id: PROVIDER_SARAH,
        appointment_type: 'comprehensive_exam',
        start_time: availableSlot,
      };

      const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/book/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      assert(res.status === 409, `Expected 409, got ${res.status}`);
      console.log('  Got 409 Conflict as expected (double-booking prevented)');
      results['double_book_rejection'] = 'PASS';
    } catch (e) {
      console.error('  ', e.message);
      results['double_book_rejection'] = 'FAIL';
    }
  } else {
    console.log('  SKIP — no available slot');
    results['double_book_rejection'] = 'SKIP';
  }

  // =========================================================================
  // 7. Verify the intake token is valid (public endpoint)
  // =========================================================================
  console.log('\n=== 7. Validate Intake Token ===');
  if (bookingResult?.intake_url) {
    try {
      // Extract token from URL: .../intake/{token}
      const token = bookingResult.intake_url.split('/intake/').pop();
      const res = await fetch(`${API_URL}/api/public/intake/${token}/`);
      const data = await res.json();

      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(data.clinic_name === 'Sunview Eye Care', `Expected clinic name, got: ${data.clinic_name}`);
      assert(data.requires_dob_verification === true, 'Should require DOB verification');

      console.log(`  Token valid. Clinic: ${data.clinic_name}`);
      console.log(`  Appointment: ${data.appointment_date}`);
      results['intake_token_valid'] = 'PASS';
    } catch (e) {
      console.error('  ', e.message);
      results['intake_token_valid'] = 'FAIL';
    }
  } else {
    console.log('  SKIP — no intake URL from booking');
    results['intake_token_valid'] = 'SKIP';
  }

  // =========================================================================
  // 8. BFF Parity: GET /api/public/booking/{slug}/info (via Next.js :3000)
  // =========================================================================
  console.log('\n=== 8. BFF Parity: Clinic Info ===');
  try {
    const res = await fetch(`${BFF_URL}/api/public/booking/${SLUG}/info`);
    const data = await res.json();

    assert(res.status === 200, `BFF expected 200, got ${res.status}`);
    assert(data.clinic_name === 'Sunview Eye Care', `BFF clinic name mismatch: ${data.clinic_name}`);
    assert(Array.isArray(data.bookable_types), 'BFF bookable_types missing');
    assert(Array.isArray(data.providers), 'BFF providers missing');

    console.log(`  BFF clinic info OK: ${data.clinic_name}, ${data.providers.length} providers`);
    results['bff_clinic_info'] = 'PASS';
  } catch (e) {
    console.error('  ', e.message);
    results['bff_clinic_info'] = 'FAIL';
  }

  // =========================================================================
  // 9. BFF Parity: GET /api/public/booking/{slug}/availability (via :3000)
  // =========================================================================
  console.log('\n=== 9. BFF Parity: Availability ===');
  try {
    const qs = new URLSearchParams({
      date: futureDate,
      provider_id: PROVIDER_SARAH,
      appointment_type: 'comprehensive_exam',
    });
    const res = await fetch(`${BFF_URL}/api/public/booking/${SLUG}/availability?${qs}`);
    const data = await res.json();

    assert(res.status === 200, `BFF expected 200, got ${res.status}`);
    assert(Array.isArray(data.slots), 'BFF slots missing');

    console.log(`  BFF availability OK: ${data.slots.length} slots`);
    results['bff_availability'] = 'PASS';
  } catch (e) {
    console.error('  ', e.message);
    results['bff_availability'] = 'FAIL';
  }

  // =========================================================================
  // 10. BFF Parity: POST /api/public/booking/{slug}/book (via :3000)
  // =========================================================================
  console.log('\n=== 10. BFF Parity: Create Booking ===');
  try {
    // Use a different slot (second available) to avoid conflict with test 5
    const qs = new URLSearchParams({
      date: futureDate,
      provider_id: PROVIDER_DUY, // different provider to avoid overlap
      appointment_type: 'contact_lens_exam',
    });
    const availRes = await fetch(`${BFF_URL}/api/public/booking/${SLUG}/availability?${qs}`);
    const availData = await availRes.json();
    assert(availData.slots?.length > 0, 'BFF: no slots for Duy');

    const bffSlot = availData.slots[0];
    const res = await fetch(`${BFF_URL}/api/public/booking/${SLUG}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: 'BFF',
        last_name: 'TestPatient',
        dob: '1988-12-01',
        sex: 'male',
        phone: '555-0200',
        provider_id: PROVIDER_DUY,
        appointment_type: 'contact_lens_exam',
        start_time: bffSlot,
      }),
    });
    const data = await res.json();

    assert(res.status === 201, `BFF expected 201, got ${res.status}: ${JSON.stringify(data)}`);
    assert(data.success === true, 'BFF booking success=false');
    assert(data.intake_url, 'BFF missing intake_url');

    console.log(`  BFF booking OK: ${data.appointment_id}, intake: ${data.intake_url.substring(0, 50)}...`);
    results['bff_create_booking'] = 'PASS';
  } catch (e) {
    console.error('  ', e.message);
    results['bff_create_booking'] = 'FAIL';
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n========================================');
  console.log('  Public Booking E2E Results');
  console.log('========================================');
  let allPass = true;
  for (const [test, result] of Object.entries(results)) {
    const icon = result === 'PASS' ? 'v' : result === 'SKIP' ? '-' : 'X';
    console.log(`  [${icon}] ${test}: ${result}`);
    if (result === 'FAIL') allPass = false;
  }
  console.log('========================================');
  console.log(allPass ? '  ALL TESTS PASSED' : '  SOME TESTS FAILED');
  console.log('========================================');

  process.exit(allPass ? 0 : 1);
})();
