/**
 * smoke-booking.spec.js — Sprint 3.3: Public Booking E2E verification
 *
 * Two test suites in one file:
 *   A) API contract tests — pure fetch, no browser (clinic info, availability,
 *      booking, double-book 409, intake token, BFF parity)
 *   B) UI wizard flow — Playwright browser walk-through of the /book/[slug]
 *      multi-step form (type+provider → date+time → patient info → confirmation)
 *
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-booking.spec.js
 */
const { launchBrowser, printResults, assert, API_URL, TARGET_URL } = require('./helpers/test-utils');

const SLUG = 'sunview';

// Known provider IDs from seed_db.py
const PROVIDER_SARAH = 'c0000000-0000-0000-0000-000000000001';
const PROVIDER_DUY = 'c0000000-0000-0000-0000-000000000003';

/** Next weekday YYYY-MM-DD, skipping weekends */
function getNextWeekday(dayOffset = 7) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ============================================================================
// A) API Contract Tests (no browser needed)
// ============================================================================
async function runApiTests() {
  const results = {};
  const futureDate = getNextWeekday(7);
  console.log(`\nAPI tests — using future date: ${futureDate}`);

  // 1. Clinic info
  try {
    const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/info/`);
    const data = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(data.clinic_name === 'Sunview Eye Care', `Expected clinic name, got: ${data.clinic_name}`);
    assert(data.timezone, 'Missing timezone');
    assert(Array.isArray(data.bookable_types) && data.bookable_types.length >= 1, 'bookable_types missing');
    assert(Array.isArray(data.providers) && data.providers.length >= 1, 'providers missing');
    const typeValues = data.bookable_types.map(t => t.value);
    assert(!typeValues.includes('urgent_care'), 'urgent_care should not be bookable');
    assert(!typeValues.includes('follow_up'), 'follow_up should not be bookable');
    assert(typeValues.includes('comprehensive_exam'), 'comprehensive_exam should be bookable');
    results['clinic_info'] = 'PASS';
  } catch (e) { results['clinic_info'] = `FAIL (${e.message})`; }

  // 2. Invalid slug → 404
  try {
    const res = await fetch(`${API_URL}/api/public/booking/nonexistent-clinic/info/`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
    results['invalid_slug'] = 'PASS';
  } catch (e) { results['invalid_slug'] = `FAIL (${e.message})`; }

  // 3. Availability
  let availableSlot = null;
  try {
    const qs = new URLSearchParams({ date: futureDate, provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam' });
    const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/availability/?${qs}`);
    const data = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(data.date === futureDate, `Expected date ${futureDate}, got ${data.date}`);
    assert(Array.isArray(data.slots) && data.slots.length > 0, 'Should have >= 1 slot');
    assert(data.provider_name, 'Missing provider_name');
    availableSlot = data.slots[0];
    results['availability'] = 'PASS';
  } catch (e) { results['availability'] = `FAIL (${e.message})`; }

  // 4. Past date → 400
  try {
    const qs = new URLSearchParams({ date: '2020-01-01', provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam' });
    const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/availability/?${qs}`);
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    results['past_date_rejection'] = 'PASS';
  } catch (e) { results['past_date_rejection'] = `FAIL (${e.message})`; }

  // 5. Create booking
  let bookingResult = null;
  if (availableSlot) {
    try {
      const payload = {
        first_name: 'Test', last_name: 'BookingPatient', dob: '1990-05-15',
        sex: 'female', phone: '555-0199', email: 'test.booking@example.com',
        provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam',
        start_time: availableSlot, chief_complaint: 'Annual eye exam',
      };
      const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/book/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      results['create_booking'] = 'PASS';
    } catch (e) { results['create_booking'] = `FAIL (${e.message})`; }
  } else {
    results['create_booking'] = 'SKIP (no available slot)';
  }

  // 6. Double-book → 409
  if (availableSlot) {
    try {
      const payload = {
        first_name: 'Another', last_name: 'Patient', dob: '1985-08-20',
        sex: 'male', provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam',
        start_time: availableSlot,
      };
      const res = await fetch(`${API_URL}/api/public/booking/${SLUG}/book/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert(res.status === 409, `Expected 409, got ${res.status}`);
      results['double_book_rejection'] = 'PASS';
    } catch (e) { results['double_book_rejection'] = `FAIL (${e.message})`; }
  } else {
    results['double_book_rejection'] = 'SKIP (no available slot)';
  }

  // 7. Intake token validation
  if (bookingResult?.intake_url) {
    try {
      const token = bookingResult.intake_url.split('/intake/').pop();
      const res = await fetch(`${API_URL}/api/public/intake/${token}/`);
      const data = await res.json();
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      assert(data.clinic_name === 'Sunview Eye Care', `Expected clinic name, got: ${data.clinic_name}`);
      assert(data.requires_dob_verification === true, 'Should require DOB verification');
      results['intake_token_valid'] = 'PASS';
    } catch (e) { results['intake_token_valid'] = `FAIL (${e.message})`; }
  } else {
    results['intake_token_valid'] = 'SKIP (no intake URL)';
  }

  // 8. BFF Parity: clinic info
  try {
    const res = await fetch(`${TARGET_URL}/api/public/booking/${SLUG}/info`);
    const data = await res.json();
    assert(res.status === 200, `BFF expected 200, got ${res.status}`);
    assert(data.clinic_name === 'Sunview Eye Care', `BFF clinic name mismatch: ${data.clinic_name}`);
    assert(Array.isArray(data.bookable_types), 'BFF bookable_types missing');
    assert(Array.isArray(data.providers), 'BFF providers missing');
    results['bff_clinic_info'] = 'PASS';
  } catch (e) { results['bff_clinic_info'] = `FAIL (${e.message})`; }

  // 9. BFF Parity: availability
  try {
    const qs = new URLSearchParams({ date: futureDate, provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam' });
    const res = await fetch(`${TARGET_URL}/api/public/booking/${SLUG}/availability?${qs}`);
    const data = await res.json();
    assert(res.status === 200, `BFF expected 200, got ${res.status}`);
    assert(Array.isArray(data.slots), 'BFF slots missing');
    results['bff_availability'] = 'PASS';
  } catch (e) { results['bff_availability'] = `FAIL (${e.message})`; }

  // 10. BFF Parity: create booking
  try {
    const qs = new URLSearchParams({ date: futureDate, provider_id: PROVIDER_DUY, appointment_type: 'contact_lens_exam' });
    const availRes = await fetch(`${TARGET_URL}/api/public/booking/${SLUG}/availability?${qs}`);
    const availData = await availRes.json();
    assert(availData.slots?.length > 0, 'BFF: no slots for Duy');

    const bffSlot = availData.slots[0];
    const res = await fetch(`${TARGET_URL}/api/public/booking/${SLUG}/book`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: 'BFF', last_name: 'TestPatient', dob: '1988-12-01',
        sex: 'male', phone: '555-0200', provider_id: PROVIDER_DUY,
        appointment_type: 'contact_lens_exam', start_time: bffSlot,
      }),
    });
    const data = await res.json();
    assert(res.status === 201, `BFF expected 201, got ${res.status}: ${JSON.stringify(data)}`);
    assert(data.success === true, 'BFF booking success=false');
    assert(data.intake_url, 'BFF missing intake_url');
    results['bff_create_booking'] = 'PASS';
  } catch (e) { results['bff_create_booking'] = `FAIL (${e.message})`; }

  return results;
}

// ============================================================================
// B) UI Wizard Flow (browser-based)
// ============================================================================
async function runUiTests() {
  const results = {};
  const futureDate = getNextWeekday(14); // Use a different date to avoid slot conflicts with API tests

  const { browser, page } = await launchBrowser();

  try {
    // Navigate to public booking page (no auth required)
    await page.goto(`${TARGET_URL}/book/${SLUG}`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    // Page should load with clinic name and step 1 visible
    const clinicName = await page.locator('h1').first().textContent().catch(() => '');
    results.ui_page_loads = clinicName.includes('Sunview')
      ? 'PASS (clinic name visible)'
      : `FAIL (h1 text: "${clinicName}")`;

    // -----------------------------------------------------------------------
    // Step 1: Select Type + Provider
    // -----------------------------------------------------------------------
    const typeBtn = page.locator('button:has-text("Comprehensive Exam")');
    if (await typeBtn.count() > 0) {
      await typeBtn.click();
      results.ui_select_type = 'PASS';
    } else {
      results.ui_select_type = 'FAIL (no Comprehensive Exam button)';
    }

    // Pick first provider
    const providerBtns = page.locator('button:has-text("Dr.")');
    if (await providerBtns.count() > 0) {
      await providerBtns.first().click();
      results.ui_select_provider = 'PASS';
    } else {
      results.ui_select_provider = 'FAIL (no provider buttons)';
    }

    // Click Continue
    const continueBtn = page.locator('button:has-text("Continue")');
    await continueBtn.click();
    await page.waitForLoadState('domcontentloaded');

    // -----------------------------------------------------------------------
    // Step 2: Pick Date + Time
    // -----------------------------------------------------------------------
    const dateInput = page.locator('input[type="date"]');
    if (await dateInput.count() > 0) {
      await dateInput.fill(futureDate);
      await page.waitForLoadState('networkidle'); // wait for availability fetch
      results.ui_date_input = 'PASS';
    } else {
      results.ui_date_input = 'FAIL (no date input)';
    }

    // Wait for time slots to appear (Morning/Afternoon sections)
    await page.waitForSelector('button:has-text(/\\d+:\\d+ [AP]M/)', { timeout: 5000 }).catch(() => {});

    // Click first available time slot button (they render as plain buttons with time text)
    const timeSlots = page.locator('button:has-text(/\\d+:\\d+ [AP]M/)');
    const slotCount = await timeSlots.count();
    if (slotCount > 0) {
      await timeSlots.first().click();
      results.ui_select_slot = `PASS (${slotCount} slots available)`;
    } else {
      results.ui_select_slot = 'FAIL (no time slots rendered)';
    }

    // Continue to step 3
    const continueBtn2 = page.locator('button:has-text("Continue")');
    if (await continueBtn2.count() > 0) {
      await continueBtn2.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // -----------------------------------------------------------------------
    // Step 3: Patient Info + Validation
    // -----------------------------------------------------------------------

    // Try submitting empty form — validation should fire
    const bookBtn = page.locator('button:has-text("Book Appointment")');
    if (await bookBtn.count() > 0) {
      await bookBtn.click();
      await page.waitForLoadState('domcontentloaded');

      // Check for "Required" validation messages
      const requiredErrors = await page.locator('text=Required').count();
      results.ui_validation = requiredErrors > 0
        ? `PASS (${requiredErrors} "Required" errors shown)`
        : 'FAIL (no validation errors after empty submit)';
    } else {
      results.ui_validation = 'FAIL (no "Book Appointment" button)';
    }

    // Fill out the form
    const firstNameInput = page.locator('input[placeholder="First name"]');
    const lastNameInput = page.locator('input[placeholder="Last name"]');
    const dobInput = page.locator('input[type="date"]');
    const sexSelect = page.locator('select');
    const phoneInput = page.locator('input[type="tel"]');
    const emailInput = page.locator('input[type="email"]');

    if (await firstNameInput.count() > 0) {
      await firstNameInput.fill('Playwright');
      await lastNameInput.fill('Tester');
      await dobInput.fill('1985-06-15');
      await sexSelect.selectOption('female');
      await phoneInput.fill('555-0199');
      await emailInput.fill('playwright@example.com');
      results.ui_fill_form = 'PASS';
    } else {
      results.ui_fill_form = 'FAIL (form fields not found)';
    }

    await page.screenshot({ path: '/tmp/pw-e2e-booking-form.png', fullPage: true });

    // Submit
    if (await bookBtn.count() > 0) {
      await bookBtn.click();
      await page.waitForSelector('text=Appointment Booked!', { timeout: 10000 }).catch(() => {});
    }

    // -----------------------------------------------------------------------
    // Step 4: Confirmation
    // -----------------------------------------------------------------------
    const confirmedHeading = await page.locator('text=Appointment Booked!').count();
    results.ui_confirmation = confirmedHeading > 0
      ? 'PASS (confirmation page visible)'
      : 'FAIL (no "Appointment Booked!" text)';

    // Check for intake form link
    const intakeLink = page.locator('a:has-text("Complete Intake Form")');
    if (await intakeLink.count() > 0) {
      const href = await intakeLink.getAttribute('href');
      results.ui_intake_link = href && href.includes('/intake/')
        ? `PASS (href: ${href.substring(0, 50)}...)`
        : `FAIL (href: ${href})`;
    } else {
      results.ui_intake_link = 'FAIL (no "Complete Intake Form" link)';
    }

    // Check for copy link button
    const copyBtn = await page.locator('button:has-text("Copy Intake Link")').count();
    results.ui_copy_button = copyBtn > 0 ? 'PASS' : 'FAIL (no "Copy Intake Link" button)';

    await page.screenshot({ path: '/tmp/pw-e2e-booking-confirmed.png', fullPage: true });

  } catch (err) {
    results.ui_error = `FAIL (${err.message.substring(0, 200)})`;
    await page.screenshot({ path: '/tmp/pw-e2e-booking-error.png', fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }

  return results;
}

// ============================================================================
// Main — run both suites
// ============================================================================
(async () => {
  // API tests first (fast, no browser)
  const apiResults = await runApiTests();
  const apiPass = printResults('Public Booking — API Contracts', apiResults);

  // UI wizard test (slower, needs browser)
  const uiResults = await runUiTests();
  const uiPass = printResults('Public Booking — UI Wizard', uiResults);

  // Overall
  const allPass = apiPass && uiPass;
  console.log('\n' + (allPass ? 'ALL BOOKING TESTS PASSED' : 'SOME BOOKING TESTS FAILED'));
  process.exit(allPass ? 0 : 1);
})();
