import { test } from "./fixtures";

test.describe("Schedule Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sunview/schedule");
    await page.waitForLoadState("networkidle");
  });

  test("renders WeekStrip with 7 day cells", async ({}) => {
    test.fixme();
  });

  test("renders 5 view mode tabs", async ({}) => {
    test.fixme();
  });

  test("clicking a day in WeekStrip changes selected date", async ({}) => {
    test.fixme();
  });

  test("view mode persists to localStorage", async ({}) => {
    test.fixme();
  });

  test("clicking appointment card opens detail drawer", async ({}) => {
    test.fixme();
  });

  test("booking drawer opens via Book Appointment button", async ({}) => {
    test.fixme();
  });

  test("flow board shows 4 Kanban columns", async ({}) => {
    test.fixme();
  });

  test("week view shows 7-day grid", async ({}) => {
    test.fixme();
  });
});
