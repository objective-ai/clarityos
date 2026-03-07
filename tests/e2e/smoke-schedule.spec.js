/**
 * smoke-schedule.spec.js — Phase 3: Scheduling E2E verification
 *
 * Verifies: schedule page loads, appointments display, date navigation,
 * booking modal, check-in flow, start exam flow.
 * Run: node tests/e2e/smoke-schedule.spec.js
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const EMAIL = 'duytran@yahoo.com';
const PASSWORD = '123456';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const apiCalls = [];
  const consoleErrors = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      apiCalls.push({ url, status: response.status() });
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (text.includes('data-theme') || text.includes('Extra attributes from the server')) return;
      if (text.includes('Failed to load resource')) return;
      consoleErrors.push(text);
    }
  });

  const results = {};

  // =========================================================================
  // Login
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
  const slugMatch = urlAfterLogin.match(/localhost:3000\/([^/]+)/);
  const slug = slugMatch ? slugMatch[1] : null;

  if (!slug || slug === 'login') {
    console.log('Login failed — still on:', urlAfterLogin);
    await browser.close();
    return;
  }
  console.log('Logged in, slug:', slug);

  // =========================================================================
  // 1. Schedule page loads
  // =========================================================================
  console.log('\n=== Schedule Page ===');
  apiCalls.length = 0;
  await page.goto(`${TARGET_URL}/${slug}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check not locked
  const scheduleLocked = await page.locator('text=Scheduling Locked').count();
  results.scheduleAccessible = scheduleLocked === 0 ? 'PASS' : 'FAIL (Locked)';
  console.log('Schedule accessible:', results.scheduleAccessible);

  await page.screenshot({ path: '/tmp/pw-e2e-schedule-page.png', fullPage: true });

  // =========================================================================
  // 2. Date navigation
  // =========================================================================
  console.log('\n=== Date Navigation ===');
  const dateInput = page.locator('input[type="date"]');
  const prevBtn = page.locator('button[title="Previous day"]');
  const nextBtn = page.locator('button[title="Next day"]');
  const todayBtn = page.locator('button:has-text("Today")');

  const hasDateNav = (await dateInput.count()) > 0
    && (await prevBtn.count()) > 0
    && (await nextBtn.count()) > 0
    && (await todayBtn.count()) > 0;

  results.dateNavigation = hasDateNav ? 'PASS' : 'FAIL (missing date nav controls)';
  console.log('Date navigation:', results.dateNavigation);

  // Test date navigation — click next then today
  if (hasDateNav) {
    const originalDate = await dateInput.inputValue();
    await nextBtn.click();
    await page.waitForTimeout(1500);
    const nextDate = await dateInput.inputValue();
    const dateChanged = nextDate !== originalDate;

    await todayBtn.click();
    await page.waitForTimeout(1500);

    results.dateNavWorks = dateChanged ? 'PASS (date advanced)' : 'FAIL (date did not change)';
  } else {
    results.dateNavWorks = 'SKIP';
  }
  console.log('Date nav works:', results.dateNavWorks);

  // =========================================================================
  // 3. Appointments display
  // =========================================================================
  console.log('\n=== Appointments ===');
  const appointmentCards = page.locator('div.glass-card.glass-card-hover');
  const cardCount = await appointmentCards.count();
  const emptyState = await page.locator('text=No appointments').count();

  if (cardCount > 0) {
    results.appointments = `PASS (${cardCount} appointments)`;

    // Check card content — patient name and time
    const firstCard = appointmentCards.first();
    const patientName = await firstCard.locator('p.text-sm.font-semibold').first().textContent().catch(() => '');
    results.cardContent = patientName && patientName.trim().length > 0
      ? `PASS (patient: "${patientName.trim()}")`
      : 'FAIL (no patient name in card)';

    // Check for status badges
    const statusBadges = await firstCard.locator('text=/Scheduled|Confirmed|Checked In|Pre-Test|In Exam|Completed|Cancelled/').count();
    results.statusBadges = statusBadges > 0 ? 'PASS' : 'FAIL (no status badge)';

    await page.screenshot({ path: '/tmp/pw-e2e-schedule-cards.png', fullPage: true });
  } else if (emptyState > 0) {
    results.appointments = 'PASS (empty state displayed)';
    results.cardContent = 'SKIP (no appointments)';
    results.statusBadges = 'SKIP (no appointments)';
  } else {
    results.appointments = 'FAIL (no cards and no empty state)';
    results.cardContent = 'SKIP';
    results.statusBadges = 'SKIP';
  }
  console.log('Appointments:', results.appointments);
  console.log('Card content:', results.cardContent);
  console.log('Status badges:', results.statusBadges);

  // =========================================================================
  // 4. Book Appointment button + modal
  // =========================================================================
  console.log('\n=== Booking Modal ===');
  const bookBtn = page.locator('button:has-text("+ Book")');
  const emptyBookBtn = page.locator('button:has-text("Book an appointment")');
  const hasBookBtn = (await bookBtn.count()) > 0 || (await emptyBookBtn.count()) > 0;

  if (hasBookBtn) {
    // Click whichever book button exists
    const btnToClick = (await bookBtn.count()) > 0 ? bookBtn : emptyBookBtn;
    await btnToClick.click();
    await page.waitForTimeout(1000);

    // Check modal opened
    const modalHeading = await page.locator('h2:has-text("Book Appointment")').count();
    const modalForm = await page.locator('form').count();

    if (modalHeading > 0) {
      results.bookingModal = 'PASS (modal opened)';

      // Check form fields exist
      const patientSearch = await page.locator('input[placeholder="Search by name..."]').count();
      const providerSelect = await page.locator('select').count();
      const dateField = await page.locator('form input[type="date"]').count();
      const timeField = await page.locator('input[type="time"]').count();
      const submitBtn = await page.locator('form button[type="submit"]').count();

      const fieldChecks = [];
      if (patientSearch > 0) fieldChecks.push('patient');
      if (providerSelect > 0) fieldChecks.push('provider');
      if (dateField > 0) fieldChecks.push('date');
      if (timeField > 0) fieldChecks.push('time');
      if (submitBtn > 0) fieldChecks.push('submit');

      results.bookingFormFields = fieldChecks.length >= 4
        ? `PASS (${fieldChecks.join(', ')})`
        : `FAIL (only ${fieldChecks.join(', ')})`;

      await page.screenshot({ path: '/tmp/pw-e2e-schedule-booking.png', fullPage: true });

      // Close modal
      const cancelBtn = page.locator('button:has-text("Cancel")');
      if ((await cancelBtn.count()) > 0) {
        await cancelBtn.click();
        await page.waitForTimeout(500);
      }
    } else {
      results.bookingModal = 'FAIL (modal did not open)';
      results.bookingFormFields = 'SKIP';
    }
  } else {
    results.bookingModal = 'FAIL (no Book button found)';
    results.bookingFormFields = 'SKIP';
  }
  console.log('Booking modal:', results.bookingModal);
  console.log('Booking form fields:', results.bookingFormFields);

  // =========================================================================
  // 5. Check-in flow (if a scheduled/confirmed appointment exists)
  // =========================================================================
  console.log('\n=== Check-In Flow ===');
  const checkInBtn = page.locator('button:has-text("Check In")').first();
  const hasCheckIn = await checkInBtn.count();

  if (hasCheckIn > 0) {
    await checkInBtn.click();
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle');

    // Verify status changed — look for "Checked In" badge or "Start Exam" button
    const checkedInBadge = await page.locator('text=Checked In').count();
    const startExamBtn = await page.locator('button:has-text("Start Exam")').count();

    results.checkIn = (checkedInBadge > 0 || startExamBtn > 0)
      ? 'PASS (status changed to Checked In)'
      : 'FAIL (status did not change)';

    await page.screenshot({ path: '/tmp/pw-e2e-schedule-checkin.png', fullPage: true });
  } else {
    results.checkIn = 'SKIP (no scheduled appointments to check in)';
  }
  console.log('Check-in:', results.checkIn);

  // =========================================================================
  // 6. Start Exam flow (if a checked-in appointment exists)
  // =========================================================================
  console.log('\n=== Start Exam Flow ===');
  const startExamBtn = page.locator('button:has-text("Start Exam")').first();
  const hasStartExam = await startExamBtn.count();

  if (hasStartExam > 0) {
    await startExamBtn.click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    // Start exam should navigate to encounter page
    const currentUrl = page.url();
    const navigatedToEncounter = currentUrl.includes('/encounter/');

    results.startExam = navigatedToEncounter
      ? 'PASS (navigated to encounter page)'
      : 'FAIL (did not navigate — still on: ' + currentUrl + ')';

    await page.screenshot({ path: '/tmp/pw-e2e-schedule-startexam.png', fullPage: true });
  } else {
    results.startExam = 'SKIP (no checked-in appointments)';
  }
  console.log('Start exam:', results.startExam);

  // =========================================================================
  // API + console summary
  // =========================================================================
  const failedApis = apiCalls.filter(c => c.status >= 400);
  results.apiCalls = failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors = consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  console.log('\n=== RESULTS ===');
  for (const [key, val] of Object.entries(results)) {
    const icon = val.startsWith('PASS') ? 'OK' : val.startsWith('SKIP') ? '--' : 'XX';
    console.log(`  [${icon}] ${key}: ${val}`);
  }

  if (failedApis.length > 0) {
    console.log('\nFailed API calls:');
    for (const c of failedApis) {
      console.log(`  [${c.status}] ${c.url.substring(0, 120)}`);
    }
  }

  if (consoleErrors.length > 0) {
    console.log('\nConsole errors:');
    for (const e of consoleErrors) {
      console.log(`  ${e.substring(0, 200)}`);
    }
  }

  const passFail = Object.values(results).filter(v => !v.startsWith('SKIP'));
  const allPass = passFail.every(v => v.startsWith('PASS'));
  console.log('\n' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'));

  await browser.close();
})();
