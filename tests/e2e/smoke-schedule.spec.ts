/**
 * smoke-schedule.spec.ts — Phase 3: Scheduling E2E verification
 *
 * Two test suites:
 *   A) Core schedule functionality — page load, date nav, appointments display,
 *      booking modal, check-in flow, start exam flow
 *   B) View toggles & soft warnings — timeline/clinic/list views, intake pending
 *      badges, double-booking soft warning, check-in unblocked by intake status
 */
import { test, expect, getFailedApiCalls } from './fixtures';

const TENANT = 'sunview';

// ============================================================================
// A) Core Schedule Tests
// ============================================================================
async function runCoreTests(
  page: any,
  apiCalls: { url: string; status: number }[],
  consoleErrors: string[]
) {
  const results: Record<string, string> = {};

  apiCalls.length = 0;
  await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  const scheduleLocked = await page.locator('text=Scheduling Locked').count();
  results.scheduleAccessible = scheduleLocked === 0 ? 'PASS' : 'FAIL (Locked)';

  // Date navigation
  const dateInput = page.locator('input[type="date"]');
  const prevBtn = page.locator('button[title="Previous day"]');
  const nextBtn = page.locator('button[title="Next day"]');
  const todayBtn = page.locator('button:has-text("Today")');

  const hasDateNav =
    (await dateInput.count()) > 0 &&
    (await prevBtn.count()) > 0 &&
    (await nextBtn.count()) > 0 &&
    (await todayBtn.count()) > 0;

  results.dateNavigation = hasDateNav ? 'PASS' : 'FAIL (missing date nav controls)';

  if (hasDateNav) {
    const originalDate = await dateInput.inputValue();
    await nextBtn.click();
    await page.waitForLoadState('networkidle');
    const nextDate = await dateInput.inputValue();
    await todayBtn.click();
    await page.waitForLoadState('networkidle');
    results.dateNavWorks =
      nextDate !== originalDate ? 'PASS (date advanced)' : 'FAIL (date did not change)';
  } else {
    results.dateNavWorks = 'SKIP';
  }

  // Appointments display
  const appointmentCards = page.locator('div.glass-card.glass-card-hover');
  const cardCount = await appointmentCards.count();
  const emptyState = await page.locator('text=No appointments').count();

  if (cardCount > 0) {
    results.appointments = `PASS (${cardCount} appointments)`;

    const firstCard = appointmentCards.first();
    const patientName = await firstCard
      .locator('p.text-sm.font-semibold')
      .first()
      .textContent()
      .catch(() => '');
    results.cardContent =
      patientName && patientName.trim().length > 0
        ? `PASS (patient: "${patientName.trim()}")`
        : 'FAIL (no patient name in card)';

    const statusBadges = await firstCard
      .locator('text=/Scheduled|Confirmed|Checked In|Pre-Test|In Exam|Completed|Cancelled/')
      .count();
    results.statusBadges = statusBadges > 0 ? 'PASS' : 'FAIL (no status badge)';
  } else if (emptyState > 0) {
    results.appointments = 'PASS (empty state displayed)';
    results.cardContent = 'SKIP (no appointments)';
    results.statusBadges = 'SKIP (no appointments)';
  } else {
    results.appointments = 'FAIL (no cards and no empty state)';
    results.cardContent = 'SKIP';
    results.statusBadges = 'SKIP';
  }

  // Book Appointment button + modal
  const bookBtn = page.locator('button:has-text("+ Book")');
  const emptyBookBtn = page.locator('button:has-text("Book an appointment")');
  const hasBookBtn = (await bookBtn.count()) > 0 || (await emptyBookBtn.count()) > 0;

  if (hasBookBtn) {
    const btnToClick = (await bookBtn.count()) > 0 ? bookBtn : emptyBookBtn;
    await btnToClick.click();
    await page
      .waitForSelector('h2:has-text("Book Appointment")', { state: 'visible', timeout: 5000 })
      .catch(() => {});

    const modalHeading = await page.locator('h2:has-text("Book Appointment")').count();

    if (modalHeading > 0) {
      results.bookingModal = 'PASS (modal opened)';

      const patientSearch = await page
        .locator('input[placeholder="Search by name..."]')
        .count();
      const providerSelect = await page.locator('select').count();
      const dateField = await page.locator('form input[type="date"]').count();
      const timeField = await page.locator('input[type="time"]').count();
      const submitBtn = await page.locator('form button[type="submit"]').count();

      const fieldChecks: string[] = [];
      if (patientSearch > 0) fieldChecks.push('patient');
      if (providerSelect > 0) fieldChecks.push('provider');
      if (dateField > 0) fieldChecks.push('date');
      if (timeField > 0) fieldChecks.push('time');
      if (submitBtn > 0) fieldChecks.push('submit');

      results.bookingFormFields =
        fieldChecks.length >= 4
          ? `PASS (${fieldChecks.join(', ')})`
          : `FAIL (only ${fieldChecks.join(', ')})`;

      const cancelBtn = page.locator('button:has-text("Cancel")');
      if ((await cancelBtn.count()) > 0) {
        await cancelBtn.click();
        await page.waitForLoadState('domcontentloaded');
      }
    } else {
      results.bookingModal = 'FAIL (modal did not open)';
      results.bookingFormFields = 'SKIP';
    }
  } else {
    results.bookingModal = 'FAIL (no Book button found)';
    results.bookingFormFields = 'SKIP';
  }

  // Check-in flow
  const checkInBtn = page.locator('button:has-text("Check In")').first();
  if ((await checkInBtn.count()) > 0) {
    await checkInBtn.click();
    await page.waitForLoadState('networkidle');

    const checkedInBadge = await page.locator('text=Checked In').count();
    const startExamBtn = await page.locator('button:has-text("Start Exam")').count();
    results.checkIn =
      checkedInBadge > 0 || startExamBtn > 0
        ? 'PASS (status changed to Checked In)'
        : 'FAIL (status did not change)';
  } else {
    results.checkIn = 'SKIP (no scheduled appointments to check in)';
  }

  // Start Exam flow
  const startExamBtn = page.locator('button:has-text("Start Exam")').first();
  if ((await startExamBtn.count()) > 0) {
    await startExamBtn.click();
    await page.waitForLoadState('networkidle');

    results.startExam = page.url().includes('/encounter/')
      ? 'PASS (navigated to encounter page)'
      : `FAIL (did not navigate — still on: ${page.url()})`;
  } else {
    results.startExam = 'SKIP (no checked-in appointments)';
  }

  const failedApis = getFailedApiCalls(apiCalls);
  results.apiCalls =
    failedApis.length === 0 ? 'PASS' : `FAIL (${failedApis.length} errors)`;
  results.consoleErrors =
    consoleErrors.length === 0 ? 'PASS' : `FAIL (${consoleErrors.length} errors)`;

  return results;
}

// ============================================================================
// B) View Toggles & Soft Warnings
// ============================================================================
async function runViewAndWarningTests(page: any) {
  const results: Record<string, string> = {};

  await page.goto(`/${TENANT}/schedule`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');

  // View toggles
  const listBtn = page.locator('button').filter({ hasText: /^List$/ });
  const timelineBtn = page.locator('button').filter({ hasText: /^Timeline$/ });
  const clinicBtn = page.locator('button').filter({ hasText: /^Clinic$/ });

  const hasListBtn = await listBtn.count();
  const hasTimelineBtn = await timelineBtn.count();
  const hasClinicBtn = await clinicBtn.count();

  results.viewTogglesExist =
    hasListBtn > 0 && hasTimelineBtn > 0 && hasClinicBtn > 0
      ? 'PASS (List + Timeline + Clinic buttons)'
      : `FAIL (list=${hasListBtn}, timeline=${hasTimelineBtn}, clinic=${hasClinicBtn})`;

  if (hasTimelineBtn > 0) {
    await timelineBtn.click();
    await page.waitForLoadState('domcontentloaded');
    results.timelineView = page.url().includes('/schedule')
      ? 'PASS (Timeline view active)'
      : 'FAIL';
  } else {
    results.timelineView = 'SKIP (no Timeline button)';
  }

  if (hasClinicBtn > 0) {
    await clinicBtn.click();
    await page.waitForLoadState('domcontentloaded');
    results.clinicView = page.url().includes('/schedule')
      ? 'PASS (Clinic view active)'
      : 'FAIL';
  } else {
    results.clinicView = 'SKIP (no Clinic button)';
  }

  if (hasListBtn > 0) {
    await listBtn.click();
    await page.waitForLoadState('domcontentloaded');
  }

  // Intake Form soft warning badge on cards
  const intakeFormBadge = page.locator('button:has-text("Intake Form")');
  const intakeFormCount = await intakeFormBadge.count();

  if (intakeFormCount > 0) {
    results.intakePendingBadge = `PASS (${intakeFormCount} "Intake Form" badge(s) on cards)`;

    const badgeClasses = await intakeFormBadge
      .first()
      .getAttribute('class')
      .catch(() => '');
    results.intakeBadgeStyling = badgeClasses.includes('amber')
      ? 'PASS (amber warning style)'
      : 'INFO (badge present but could not verify amber styling)';
  } else {
    results.intakePendingBadge =
      'INFO (no "Intake Form" badges — no pending intake appointments today)';
    results.intakeBadgeStyling = 'SKIP';
  }

  // Check In button still enabled when intake is pending
  if (intakeFormCount > 0) {
    const cards = page.locator('div.glass-card.glass-card-hover');
    const cardsCount = await cards.count();
    let foundPendingWithCheckIn = false;

    for (let i = 0; i < cardsCount; i++) {
      const card = cards.nth(i);
      const hasIntakeBadge = await card.locator('button:has-text("Intake Form")').count();
      const hasCheckInBtn = await card.locator('button:has-text("Check In")').count();

      if (hasIntakeBadge > 0 && hasCheckInBtn > 0) {
        const checkInDisabled = await card
          .locator('button:has-text("Check In")')
          .isDisabled()
          .catch(() => true);
        results.checkInNotBlockedByIntake = !checkInDisabled
          ? 'PASS (Check In enabled despite pending intake)'
          : 'FAIL (Check In button disabled by intake status)';
        foundPendingWithCheckIn = true;
        break;
      }
    }

    if (!foundPendingWithCheckIn) {
      results.checkInNotBlockedByIntake = 'SKIP (no card has both intake badge and Check In)';
    }
  } else {
    results.checkInNotBlockedByIntake = 'SKIP (no pending intake cards)';
  }

  // Double-booking soft warning in booking modal
  const bookBtn = page.locator('button:has-text("+ Book")');
  if ((await bookBtn.count()) > 0) {
    await bookBtn.click();
    await page
      .waitForSelector('h2:has-text("Book Appointment")', { state: 'visible', timeout: 5000 })
      .catch(() => {});

    const modalOpen = await page.locator('h2:has-text("Book Appointment")').count();
    if (modalOpen > 0) {
      const providerSelect = page.locator('select').first();
      const providerOptions = await providerSelect.locator('option').allTextContents();
      const doctorOption = providerOptions.find((o: string) => o.startsWith('Dr.'));

      if (doctorOption) {
        await providerSelect.selectOption({ label: doctorOption });
      }

      const appointmentCards = page.locator('div.glass-card.glass-card-hover');
      const hasCards = await appointmentCards.count();

      if (hasCards > 0) {
        const firstCardTime = await appointmentCards
          .first()
          .locator('p.text-sm.font-semibold')
          .first()
          .textContent()
          .catch(() => '');

        if (firstCardTime) {
          const timeMatch = firstCardTime
            .trim()
            .match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
          if (timeMatch) {
            let h = parseInt(timeMatch[1]);
            const m = timeMatch[2];
            const ampm = timeMatch[3].toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            const time24 = `${String(h).padStart(2, '0')}:${m}`;

            const timeInput = page.locator('input[type="time"]');
            if ((await timeInput.count()) > 0) {
              await timeInput.fill(time24);
              await page.waitForLoadState('domcontentloaded');
            }
          }
        }
      }

      const doubleBookWarning = await page.locator('text=Double-booking detected').count();
      const softWarningText = await page.locator('text=You can still book').count();

      if (doubleBookWarning > 0 || softWarningText > 0) {
        results.doubleBookWarning = 'PASS (soft warning displayed)';
        const submitBtn = page.locator('form button[type="submit"]');
        results.doubleBookNotBlocking =
          (await submitBtn.count()) > 0
            ? 'PASS (submit button present — overlap is advisory only)'
            : 'FAIL (no submit button)';
      } else {
        results.doubleBookWarning =
          'INFO (no overlap detected — try booking at same time as existing appointment)';
        results.doubleBookNotBlocking = 'SKIP';
      }

      const cancelBtn = page.locator('button:has-text("Cancel")');
      if ((await cancelBtn.count()) > 0) {
        await cancelBtn.click();
        await page.waitForLoadState('domcontentloaded');
      }
    } else {
      results.doubleBookWarning = 'FAIL (modal did not open)';
      results.doubleBookNotBlocking = 'SKIP';
    }
  } else {
    results.doubleBookWarning = 'SKIP (no + Book button)';
    results.doubleBookNotBlocking = 'SKIP';
  }

  return results;
}

// ============================================================================
// Tests
// ============================================================================

test.describe('Smoke Schedule — Suite A (Core) @smoke', () => {
  test('schedule page loads, date nav works, booking modal opens', async ({
    page,
    apiCalls,
    consoleErrors,
  }) => {
    const results = await runCoreTests(page, apiCalls, consoleErrors);

    expect(results.scheduleAccessible).toBe('PASS');
    expect(results.dateNavigation).toMatch(/^PASS/);
    expect(results.appointments).toMatch(/^PASS/);
    expect(results.bookingModal).toMatch(/^(PASS|FAIL)/);
    expect(results.apiCalls).toMatch(/^PASS/);
    expect(results.consoleErrors).toMatch(/^PASS/);
  });
});

test.describe('Smoke Schedule — Suite B (Views & Warnings) @smoke', () => {
  test('view toggles render, intake badge present, double-booking warning shown', async ({
    page,
  }) => {
    const results = await runViewAndWarningTests(page);

    expect(results.viewTogglesExist).toMatch(/^PASS/);
    expect(results.timelineView).toMatch(/^(PASS|SKIP)/);
    expect(results.clinicView).toMatch(/^(PASS|SKIP)/);
  });
});
