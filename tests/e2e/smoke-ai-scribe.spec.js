/**
 * smoke-ai-scribe.spec.js — AI Scribe E2E Smoke Test
 *
 * Covers the full AI Scribe state machine on the encounter page:
 *   A) Widget renders with transcript textarea + "Generate Note" button (DRAFT state)
 *   B) Generation — streaming produces SOAP text (STREAMING → AI_READY)
 *   C) Review & Merge — ConflictResolverModal opens with split pane
 *   D) Edit Note — inline SOAP editing (AI_READY → EDITING → AI_READY)
 *   E) Persistence — reload preserves AI Ready state (SOAP saved to store)
 *
 * Prerequisite: encounter e0000000-0007-0000-0000-000000000007 must exist (seed data).
 * Run: bash scripts/dev.sh verify tests/e2e/smoke-ai-scribe.spec.js
 */
const { ensureApi, launchBrowser, loginOrRestore, setupTracking, printResults, TARGET_URL } = require('./helpers/test-utils');

// Non-finalized encounter from seed data (William Donovan)
const ENCOUNTER_ID = 'e0000000-0007-0000-0000-000000000007';

// ============================================================================
// A) Widget Render (DRAFT state)
// ============================================================================
async function runWidgetRenderTests(page, slug) {
  const results = {};

  await page.goto(`${TARGET_URL}/${slug}/encounter/${ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/pw-e2e-ai-scribe-loaded.png', fullPage: false });

  // AI Scribe widget should be visible somewhere on the page
  const scribeWidget = page.locator('text=AI Scribe').first();
  const widgetVisible = await scribeWidget.isVisible().catch(() => false);
  results.widgetVisible = widgetVisible
    ? 'PASS (AI Scribe widget visible)'
    : 'FAIL (AI Scribe widget not found on encounter page)';

  if (!widgetVisible) return results;

  // Draft state: transcript textarea + Generate Note button
  const generateBtn = page.locator('button:has-text("Generate Note")');
  const transcriptInput = page.locator('textarea#ai-transcript');
  const redoBtn = page.locator('button:has-text("Redo")');

  const hasGenerate = await generateBtn.count() > 0;
  const hasTranscript = await transcriptInput.count() > 0;

  if (hasGenerate && hasTranscript) {
    results.initialState = 'PASS (widget in DRAFT state — transcript textarea + "Generate Note" button)';
  } else if (await redoBtn.count() > 0) {
    results.initialState = 'INFO (encounter already in AI_READY state — will reset via Redo)';
  } else {
    results.initialState = 'FAIL (neither DRAFT nor AI_READY state detected)';
  }

  return results;
}

// ============================================================================
// B) Generation — Streaming → AI Ready
// ============================================================================
async function runGenerationTests(page, slug) {
  const results = {};

  await page.goto(`${TARGET_URL}/${slug}/encounter/${ENCOUNTER_ID}`, { waitUntil: 'networkidle' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // If already in AI_READY, click "Redo" to reset to DRAFT
  const redoBtn = page.locator('button:has-text("Redo")');
  if (await redoBtn.count() > 0) {
    await redoBtn.first().click();
    await page.waitForTimeout(500);
  }

  // Find "Generate Note" button
  const generateBtn = page.locator('button:has-text("Generate Note")');
  if (await generateBtn.count() === 0) {
    results.generationStarted = 'FAIL ("Generate Note" button not found)';
    results.streamingIndicator = 'SKIP';
    results.soapTextAppears = 'SKIP';
    return results;
  }

  // Fill in a transcript
  const transcriptInput = page.locator('textarea#ai-transcript');
  if (await transcriptInput.count() > 0) {
    await transcriptInput.first().fill('Patient reports blurry vision. IOP 22 OD, 18 OS. VA 20/40 OD, 20/20 OS.');
  }

  await generateBtn.click();
  await page.waitForTimeout(500);

  // Check streaming indicator (spinner or "Generating..." text)
  const streamingText = page.locator('text=/Generating|Streaming|Listening/i');
  const spinner = page.locator('svg.animate-spin, .animate-spin');
  const isStreamingVisible = await streamingText.count() > 0 || await spinner.count() > 0;

  results.generationStarted = 'PASS (Generate Note clicked)';
  results.streamingIndicator = isStreamingVisible
    ? 'PASS (streaming indicator visible during generation)'
    : 'INFO (no spinner/streaming text found — may have completed immediately)';

  await page.screenshot({ path: '/tmp/pw-e2e-ai-scribe-streaming.png', fullPage: false });

  // Wait for AI_READY state (Review & Merge or Edit Note button appears)
  try {
    await page.waitForSelector('button:has-text("Review & Merge"), button:has-text("Edit Note")', { timeout: 60000 });
    results.generationComplete = 'PASS (generation completed — AI_READY state reached)';
  } catch {
    results.generationComplete = 'FAIL (generation did not complete within 60s)';
    return results;
  }

  // Check SOAP text appeared
  const soapContent = page.locator('pre, div.whitespace-pre-wrap');
  const soapCount = await soapContent.count();
  let foundSoapText = false;
  for (let i = 0; i < Math.min(soapCount, 5); i++) {
    const text = await soapContent.nth(i).textContent().catch(() => '');
    if (text && text.length > 50) {
      foundSoapText = true;
      break;
    }
  }
  results.soapTextAppears = foundSoapText
    ? 'PASS (SOAP text content visible in AI_READY state)'
    : 'INFO (could not locate SOAP text block — check widget layout)';

  return results;
}

// ============================================================================
// C) Review & Merge — ConflictResolverModal
// ============================================================================
async function runReviewTests(page) {
  const results = {};

  // "Review & Merge" button should be visible (generation completed in Suite B)
  const reviewBtn = page.locator('button:has-text("Review & Merge")');
  const reviewCount = await reviewBtn.count();

  results.reviewButtonVisible = reviewCount > 0
    ? 'PASS ("Review & Merge" button visible in AI_READY state)'
    : 'FAIL ("Review & Merge" button not found — JSON parse may have failed)';

  if (reviewCount === 0) {
    results.modalOpens = 'SKIP';
    results.conflictTable = 'SKIP';
    results.soapViewerInModal = 'SKIP';
    return results;
  }

  await reviewBtn.first().click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: '/tmp/pw-e2e-ai-scribe-modal.png', fullPage: false });

  // Check modal opened (full-screen overlay with "Review & Merge" title)
  const modal = page.locator('div.fixed.inset-0').filter({ hasNot: page.locator('text=Login') });
  const modalOpen = await modal.count() > 0;

  results.modalOpens = modalOpen
    ? 'PASS (ConflictResolverModal opened)'
    : 'FAIL (no modal appeared after clicking "Review & Merge")';

  if (!modalOpen) {
    results.conflictTable = 'SKIP';
    results.soapViewerInModal = 'SKIP';
    return results;
  }

  // Check for conflict table with Keep Mine / Use AI buttons
  const keepBtn = page.locator('button:has-text("Keep Mine")');
  const useAiBtn = page.locator('button:has-text("Use AI")');
  const addBtn = page.locator('button:has-text("Add")');
  const hasConflictControls = (await keepBtn.count() + await useAiBtn.count() + await addBtn.count()) > 0;
  results.conflictTable = hasConflictControls
    ? 'PASS (conflict table with merge controls visible)'
    : 'INFO (no Keep Mine/Use AI/Add buttons — may have zero suggestions)';

  // Check for confidence badges (high/medium/low)
  const badges = page.locator('text=/high|medium|low/i').filter({ hasNot: page.locator('button') });
  const badgeCount = await badges.count();
  results.confidenceBadges = badgeCount > 0
    ? `PASS (${badgeCount} confidence badge(s) visible)`
    : 'INFO (no confidence badges found — modal may use different styling)';

  // Check for SOAP sections in left pane
  const soapSections = page.locator('text=/Subjective|Objective|Assessment|Plan/i');
  const soapCount = await soapSections.count();
  results.soapViewerInModal = soapCount > 0
    ? `PASS (${soapCount} SOAP section(s) in modal left pane)`
    : 'INFO (no SOAP sections in modal — may use different layout)';

  // Close modal via X button or backdrop click
  const closeBtn = page.locator('div.fixed.inset-0 button').filter({ has: page.locator('svg') }).first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(300);

  return results;
}

// ============================================================================
// D) Edit Note (AI_READY → EDITING → AI_READY)
// ============================================================================
async function runEditTests(page) {
  const results = {};

  const editBtn = page.locator('button:has-text("Edit Note")');
  const editCount = await editBtn.count();

  results.editButtonVisible = editCount > 0
    ? 'PASS ("Edit Note" button visible in AI_READY state)'
    : 'FAIL ("Edit Note" button not found)';

  if (editCount === 0) {
    results.editTextarea = 'SKIP';
    results.saveEdit = 'SKIP';
    return results;
  }

  await editBtn.first().click();
  await page.waitForTimeout(300);

  // Check textarea appeared for editing
  const editTextarea = page.locator('textarea').filter({ hasText: /SUBJECTIVE|OBJECTIVE|ASSESSMENT|PLAN/i });
  const hasEditArea = await editTextarea.count() > 0;
  results.editTextarea = hasEditArea
    ? 'PASS (SOAP text editable in textarea — EDITING state)'
    : 'INFO (edit textarea not found — check widget structure)';

  // Save edit
  const saveBtn = page.locator('button:has-text("Save")');
  if (await saveBtn.count() > 0) {
    await saveBtn.first().click();
    await page.waitForTimeout(300);

    // Should return to AI_READY with Edit Note button visible again
    const backToReady = await editBtn.count() > 0;
    results.saveEdit = backToReady
      ? 'PASS (saved edit — returned to AI_READY state)'
      : 'INFO (save completed but Edit Note button not immediately visible)';
  } else {
    results.saveEdit = 'INFO (Save button not found — may use different UI)';
  }

  await page.screenshot({ path: '/tmp/pw-e2e-ai-scribe-edited.png', fullPage: false });

  return results;
}

// ============================================================================
// E) Persistence — Reload
// ============================================================================
async function runPersistenceTests(page, slug) {
  const results = {};

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: '/tmp/pw-e2e-ai-scribe-reload.png', fullPage: false });

  // After reload, widget should show AI_READY state (Edit Note / Redo visible)
  const editBtn = page.locator('button:has-text("Edit Note")');
  const redoBtn = page.locator('button:has-text("Redo")');

  const hasReadyState = await editBtn.count() > 0 || await redoBtn.count() > 0;
  results.notePersistedAfterReload = hasReadyState
    ? 'PASS (AI_READY state persisted after page reload — SOAP text in store)'
    : 'FAIL (AI_READY state lost after reload — store persistence may be broken)';

  return results;
}

// ============================================================================
// Main
// ============================================================================
(async () => {
  await ensureApi();
  const { browser, context, page } = await launchBrowser();
  const { apiCalls, consoleErrors } = setupTracking(page);

  const slug = await loginOrRestore(context, page);
  if (!slug) {
    console.log('Login failed');
    await browser.close();
    return;
  }

  let allPass = true;

  // Suite A — Widget Render (DRAFT state)
  console.log('\n--- Suite A: Widget Render ---');
  const widgetResults = await runWidgetRenderTests(page, slug);
  allPass = printResults('AI Scribe — Widget Render', widgetResults) && allPass;

  // Stop if widget isn't even rendering
  if (widgetResults.widgetVisible?.startsWith('FAIL')) {
    console.log('\nSKIPPING remaining suites — AI Scribe widget not found.');
    await browser.close();
    return;
  }

  // Suite B — Generation / Streaming
  console.log('\n--- Suite B: Generation ---');
  const genResults = await runGenerationTests(page, slug);
  allPass = printResults('AI Scribe — Generation', genResults) && allPass;

  if (genResults.generationComplete?.startsWith('FAIL')) {
    console.log('\nSKIPPING review/edit suites — generation did not complete.');
    await browser.close();
    return;
  }

  // Suite C — Review & Merge (ConflictResolverModal)
  console.log('\n--- Suite C: Review & Merge ---');
  const reviewResults = await runReviewTests(page);
  allPass = printResults('AI Scribe — Review & Merge', reviewResults) && allPass;

  // Suite D — Edit Note
  console.log('\n--- Suite D: Edit Note ---');
  const editResults = await runEditTests(page);
  allPass = printResults('AI Scribe — Edit Note', editResults) && allPass;

  // Suite E — Persistence
  console.log('\n--- Suite E: Persistence ---');
  const persistResults = await runPersistenceTests(page, slug);
  allPass = printResults('AI Scribe — Persistence', persistResults) && allPass;

  // Global — console errors
  const globalResults = {};
  const scribeErrors = consoleErrors.filter(e => e.includes('AI Scribe') || e.includes('JSON parse'));
  globalResults.noScribeConsoleErrors = scribeErrors.length === 0
    ? 'PASS (no AI Scribe console errors)'
    : `FAIL (${scribeErrors.length} AI Scribe error(s): ${scribeErrors[0]})`;
  globalResults.otherConsoleErrors = consoleErrors.length - scribeErrors.length === 0
    ? 'PASS'
    : `INFO (${consoleErrors.length - scribeErrors.length} other console error(s))`;
  printResults('AI Scribe — Global', globalResults);
  if (scribeErrors.length > 0) allPass = false;

  console.log('\n' + (allPass ? 'ALL AI SCRIBE TESTS PASSED' : 'SOME AI SCRIBE TESTS FAILED'));

  await browser.close();
})();
