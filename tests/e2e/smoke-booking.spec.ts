/**
 * smoke-booking.spec.ts — Sprint 3.3: Public Booking E2E verification
 *
 * Suite A: API contract tests — clinic info, availability, booking, double-book 409,
 *          intake token, BFF parity.
 * Suite B: UI wizard flow — /book/[slug] multi-step form
 *          (type+provider → date+time → patient info → confirmation)
 *
 * Note: public routes, no auth required.
 */
import { test, expect } from './fixtures';

const TENANT = 'sunview';

// Known provider IDs from seed_db.py
const PROVIDER_SARAH = 'c0000000-0000-0000-0000-000000000001';
const PROVIDER_DUY = 'c0000000-0000-0000-0000-000000000003';

/** Next weekday YYYY-MM-DD, skipping weekends */
function getNextWeekday(dayOffset = 7): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ============================================================================
// Suite A — API Contract Tests
// ============================================================================

test.describe('Public Booking — API Contracts @smoke', () => {
  test('clinic info returns correct data', async ({ request }) => {
    const res = await request.get(`/api/public/booking/${TENANT}/info`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.clinic_name).toBe('Sunview Eye Care');
    expect(data.timezone).toBeTruthy();
    expect(Array.isArray(data.bookable_types)).toBe(true);
    expect(data.bookable_types.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.providers)).toBe(true);
    expect(data.providers.length).toBeGreaterThanOrEqual(1);
    const typeValues = data.bookable_types.map((t: { value: string }) => t.value);
    expect(typeValues).not.toContain('urgent_care');
    expect(typeValues).not.toContain('follow_up');
    expect(typeValues).toContain('comprehensive_exam');
  });

  test('invalid slug returns 404', async ({ request }) => {
    const res = await request.get(`/api/public/booking/nonexistent-clinic/info`);
    expect(res.status()).toBe(404);
  });

  test('availability returns slots for future date', async ({ request }) => {
    const futureDate = getNextWeekday(7);
    const res = await request.get(`/api/public/booking/${TENANT}/availability`, {
      params: {
        date: futureDate,
        provider_id: PROVIDER_SARAH,
        appointment_type: 'comprehensive_exam',
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.date).toBe(futureDate);
    expect(Array.isArray(data.slots)).toBe(true);
    expect(data.slots.length).toBeGreaterThan(0);
    expect(data.provider_name).toBeTruthy();
  });

  test('past date availability returns 400', async ({ request }) => {
    const res = await request.get(`/api/public/booking/${TENANT}/availability`, {
      params: {
        date: '2020-01-01',
        provider_id: PROVIDER_SARAH,
        appointment_type: 'comprehensive_exam',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('create booking returns 201 with intake URL', async ({ request }) => {
    const futureDate = getNextWeekday(7);
    // Get an available slot first
    const availRes = await request.get(`/api/public/booking/${TENANT}/availability`, {
      params: {
        date: futureDate,
        provider_id: PROVIDER_SARAH,
        appointment_type: 'comprehensive_exam',
      },
    });
    const availData = await availRes.json();
    expect(availData.slots?.length).toBeGreaterThan(0);
    const availableSlot = availData.slots[0];

    const res = await request.post(`/api/public/booking/${TENANT}/book`, {
      data: {
        first_name: 'Test', last_name: 'BookingPatient', dob: '1990-05-15',
        sex: 'female', phone: '555-0199', email: 'test.booking@example.com',
        provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam',
        start_time: availableSlot, chief_complaint: 'Annual eye exam',
      },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.appointment_id).toBeTruthy();
    expect(data.intake_url).toBeTruthy();
    expect(data.provider_name).toBeTruthy();
    expect(data.appointment_type_label).toBe('Comprehensive Exam');
  });

  test('double-booking same slot returns 409', async ({ request }) => {
    const futureDate = getNextWeekday(8);
    const availRes = await request.get(`/api/public/booking/${TENANT}/availability`, {
      params: {
        date: futureDate,
        provider_id: PROVIDER_SARAH,
        appointment_type: 'comprehensive_exam',
      },
    });
    const availData = await availRes.json();
    if (!availData.slots?.length) {
      test.skip(true, 'No available slot for double-book test');
      return;
    }
    const availableSlot = availData.slots[0];

    // First booking
    await request.post(`/api/public/booking/${TENANT}/book`, {
      data: {
        first_name: 'First', last_name: 'Booker', dob: '1990-05-15',
        sex: 'female', provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam',
        start_time: availableSlot,
      },
    });

    // Second booking — same slot
    const res = await request.post(`/api/public/booking/${TENANT}/book`, {
      data: {
        first_name: 'Another', last_name: 'Patient', dob: '1985-08-20',
        sex: 'male', provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam',
        start_time: availableSlot,
      },
    });
    expect(res.status()).toBe(409);
  });

  test('intake token from booking is valid', async ({ request }) => {
    const futureDate = getNextWeekday(9);
    const availRes = await request.get(`/api/public/booking/${TENANT}/availability`, {
      params: {
        date: futureDate,
        provider_id: PROVIDER_SARAH,
        appointment_type: 'comprehensive_exam',
      },
    });
    const availData = await availRes.json();
    if (!availData.slots?.length) {
      test.skip(true, 'No available slot for intake token test');
      return;
    }

    const bookRes = await request.post(`/api/public/booking/${TENANT}/book`, {
      data: {
        first_name: 'Token', last_name: 'Tester', dob: '1992-03-10',
        sex: 'female', phone: '555-0111', email: 'token@example.com',
        provider_id: PROVIDER_SARAH, appointment_type: 'comprehensive_exam',
        start_time: availData.slots[0],
      },
    });
    const bookData = await bookRes.json();
    expect(bookData.intake_url).toBeTruthy();

    const token = bookData.intake_url.split('/intake/').pop();
    const tokenRes = await request.get(`/api/public/intake/${token}`);
    expect(tokenRes.status()).toBe(200);
    const tokenData = await tokenRes.json();
    expect(tokenData.clinic_name).toBe('Sunview Eye Care');
    expect(tokenData.requires_dob_verification).toBe(true);
  });

  test('BFF parity — clinic info', async ({ request }) => {
    const res = await request.get(`/api/public/booking/${TENANT}/info`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.clinic_name).toBe('Sunview Eye Care');
    expect(Array.isArray(data.bookable_types)).toBe(true);
    expect(Array.isArray(data.providers)).toBe(true);
  });

  test('BFF parity — availability', async ({ request }) => {
    const futureDate = getNextWeekday(7);
    const res = await request.get(`/api/public/booking/${TENANT}/availability`, {
      params: {
        date: futureDate,
        provider_id: PROVIDER_SARAH,
        appointment_type: 'comprehensive_exam',
      },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.slots)).toBe(true);
  });

  test('BFF parity — create booking via Duy provider', async ({ request }) => {
    const futureDate = getNextWeekday(10);
    const availRes = await request.get(`/api/public/booking/${TENANT}/availability`, {
      params: {
        date: futureDate,
        provider_id: PROVIDER_DUY,
        appointment_type: 'contact_lens_exam',
      },
    });
    const availData = await availRes.json();
    expect(availData.slots?.length).toBeGreaterThan(0);

    const res = await request.post(`/api/public/booking/${TENANT}/book`, {
      data: {
        first_name: 'BFF', last_name: 'TestPatient', dob: '1988-12-01',
        sex: 'male', phone: '555-0200', provider_id: PROVIDER_DUY,
        appointment_type: 'contact_lens_exam', start_time: availData.slots[0],
      },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.intake_url).toBeTruthy();
  });
});

// ============================================================================
// Suite B — UI Wizard Flow
// ============================================================================

test.describe('Public Booking — UI Wizard @smoke', () => {
  test('booking wizard completes end-to-end', async ({ page }) => {
    const futureDate = getNextWeekday(14); // Use different date to avoid slot conflicts with API tests

    // Navigate to public booking page (no auth required)
    await page.goto(`/book/${TENANT}`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

    // Page should load with clinic name
    const clinicName = await page.locator('h1').first().textContent().catch(() => '');
    expect(clinicName).toContain('Sunview');

    // Step 1: Select Type + Provider
    const typeBtn = page.locator('button:has-text("Comprehensive Exam")');
    expect(await typeBtn.count()).toBeGreaterThan(0);
    await typeBtn.click();

    const providerBtns = page.locator('button:has-text("Dr.")');
    expect(await providerBtns.count()).toBeGreaterThan(0);
    await providerBtns.first().click();

    await page.locator('button:has-text("Continue")').click();
    await page.waitForLoadState('domcontentloaded');

    // Step 2: Pick Date + Time
    const dateInput = page.locator('input[type="date"]');
    expect(await dateInput.count()).toBeGreaterThan(0);
    await dateInput.fill(futureDate);
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('button:has-text(/\\d+:\\d+ [AP]M/)', { timeout: 5000 }).catch(() => {});
    const timeSlots = page.locator('button:has-text(/\\d+:\\d+ [AP]M/)');
    const slotCount = await timeSlots.count();
    expect(slotCount).toBeGreaterThan(0);
    await timeSlots.first().click();

    const continueBtn2 = page.locator('button:has-text("Continue")');
    if (await continueBtn2.count() > 0) {
      await continueBtn2.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Step 3: Patient Info + Validation — empty submit should show validation errors
    const bookBtn = page.locator('button:has-text("Book Appointment")');
    expect(await bookBtn.count()).toBeGreaterThan(0);
    await bookBtn.click();
    await page.waitForLoadState('domcontentloaded');

    const requiredErrors = await page.locator('text=Required').count();
    expect(requiredErrors).toBeGreaterThan(0);

    // Fill out the form
    const firstNameInput = page.locator('input[placeholder="First name"]');
    expect(await firstNameInput.count()).toBeGreaterThan(0);
    await firstNameInput.fill('Playwright');
    await page.locator('input[placeholder="Last name"]').fill('Tester');
    await page.locator('input[type="date"]').fill('1985-06-15');
    await page.locator('select').selectOption('female');
    await page.locator('input[type="tel"]').fill('555-0199');
    await page.locator('input[type="email"]').fill('playwright@example.com');

    // Submit
    await bookBtn.click();
    await page.waitForSelector('text=Appointment Booked!', { timeout: 10000 }).catch(() => {});

    // Step 4: Confirmation
    const confirmedHeading = await page.locator('text=Appointment Booked!').count();
    expect(confirmedHeading).toBeGreaterThan(0);

    // Intake form link
    const intakeLink = page.locator('a:has-text("Complete Intake Form")');
    expect(await intakeLink.count()).toBeGreaterThan(0);
    const href = await intakeLink.getAttribute('href');
    expect(href).toContain('/intake/');

    // Copy intake link button
    const copyBtn = await page.locator('button:has-text("Copy Intake Link")').count();
    expect(copyBtn).toBeGreaterThan(0);
  });
});
