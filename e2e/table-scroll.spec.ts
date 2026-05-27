/**
 * E2E tests — MessageTableLazy: infinite / virtual scroll.
 *
 * Verifies that:
 *  - Scrolling down loads new rows dynamically.
 *  - `data-index` values increase as we scroll.
 *  - Scrolling back up restores earlier rows.
 *  - Large datasets (5 000 rows) work without freezing.
 *  - Rapid scrolling doesn't corrupt visible data.
 */
import { test, expect, buildSeedMessages } from './fixtures/seed';

/* ────────────────────────────────────────────────────────────────────────────
 * Small seed for fast scroll tests.
 * ──────────────────────────────────────────────────────────────────────── */
const SEED_500 = buildSeedMessages({ count: 500, spanDays: 60, seed: 11 });

test.describe('Infinite Scroll — basic', () => {
  test.beforeEach(async ({ seedMessages }) => {
    await seedMessages(SEED_500);
  });

  test('initial load shows virtual rows', async ({ messagePage }) => {
    await messagePage.goto();
    const rowCount = await messagePage.getVisibleRowCount();
    // With an estimated row height of 50 px the viewport should render
    // a handful of rows (depends on viewport height, but > 0).
    expect(rowCount).toBeGreaterThan(0);
  });

  test('total count matches seeded data', async ({ messagePage }) => {
    await messagePage.goto();
    const total = await messagePage.getTotalCount();
    expect(total).toBe(500);
  });

  test('scrolling down loads higher-index rows', async ({ messagePage }) => {
    await messagePage.goto();

    const firstIndex = await messagePage.getFirstVisibleIndex();

    // Scroll down by several viewport heights.
    await messagePage.scrollBy(2000);
    // Generous wait for virtualizer + data proxy.
    await messagePage.page.waitForTimeout(2000);
    await messagePage.waitForRowsLoaded();

    const newFirst = await messagePage.getFirstVisibleIndex();
    expect(newFirst).toBeGreaterThan(firstIndex);
  });

  test('scrolling to bottom reaches last rows', async ({ messagePage }) => {
    await messagePage.goto();

    await messagePage.scrollToBottom();
    await messagePage.page.waitForTimeout(1500);
    await messagePage.waitForRowsLoaded();

    const lastIndex = await messagePage.getLastVisibleIndex();
    // Should be near the end of the dataset (within overscan / pageSize tolerance).
    expect(lastIndex).toBeGreaterThanOrEqual(490);
  });

  test('scrolling back up restores earlier rows', async ({ messagePage }) => {
    await messagePage.goto();

    // Scroll down, then back up.
    await messagePage.scrollBy(3000);
    await messagePage.page.waitForTimeout(800);

    await messagePage.scrollToTop();
    await messagePage.page.waitForTimeout(800);
    await messagePage.waitForRowsLoaded();

    const firstIndex = await messagePage.getFirstVisibleIndex();
    expect(firstIndex).toBe(0);
  });

  test('visible rows have data-index attributes', async ({ messagePage }) => {
    await messagePage.goto();

    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Every visible row should have a numeric data-index.
    for (let index = 0; index < count; index++) {
      const attribute = await rows.nth(index).getAttribute('data-index');
      expect(attribute).not.toBeNull();
      expect(Number(attribute)).toBeGreaterThanOrEqual(0);
    }
  });

  test('rows contain non-empty cell data after load', async ({ messagePage }) => {
    await messagePage.goto();

    const rows = messagePage.getVisibleRows();
    const count = await rows.count();

    // Wait a bit for actual data (not skeletons) to appear.
    await messagePage.page.waitForTimeout(1000);

    // Check id column (col 0) is not empty for the first few rows.
    const sample = Math.min(count, 5);
    for (let index = 0; index < sample; index++) {
      const id = await messagePage.getCellText(rows.nth(index), 0);
      // Skeleton rows render <Skeleton> components; rendered rows have text.
      // Allow for skeleton being present but expect at least one real row in sample.
      if (id && /^\d+$/.test(id)) {
        expect(Number(id)).toBeGreaterThan(0);
        return; // success — at least one real row found
      }
    }

    // If we exit the loop, all sampled rows were skeletons — fail.
    expect(true).toBe(false); // at least one row should have rendered
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Large dataset — 5 000 rows.
 * Validates that the virtual table doesn't choke on bigger data.
 * ──────────────────────────────────────────────────────────────────────── */
const SEED_5000 = buildSeedMessages({ count: 5000, spanDays: 180, seed: 55 });

test.describe('Infinite Scroll — large dataset (5 000 rows)', () => {
  test.beforeEach(async ({ seedMessages }) => {
    await seedMessages(SEED_5000);
  });

  test('total count shows 5 000', async ({ messagePage }) => {
    await messagePage.goto();
    const total = await messagePage.getTotalCount();
    expect(total).toBe(5000);
  });

  test('scroll to middle shows mid-range indexes', async ({ messagePage }) => {
    await messagePage.goto();

    // Scroll to ~50 % of the virtual height.
    await messagePage.tableWrapper.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    await messagePage.page.waitForTimeout(1500);
    await messagePage.waitForRowsLoaded();

    const firstIndex = await messagePage.getFirstVisibleIndex();
    // Should be somewhere in the middle ± tolerance.
    expect(firstIndex).toBeGreaterThan(1000);
    expect(firstIndex).toBeLessThan(4000);
  });

  test('scroll to bottom then back to top', async ({ messagePage }) => {
    await messagePage.goto();

    // Scroll all the way down.
    await messagePage.scrollToBottom();
    await messagePage.page.waitForTimeout(1500);
    const lastIndex = await messagePage.getLastVisibleIndex();
    expect(lastIndex).toBeGreaterThanOrEqual(4990);

    // Back to top.
    await messagePage.scrollToTop();
    await messagePage.page.waitForTimeout(1500);
    await messagePage.waitForRowsLoaded();
    expect(await messagePage.getFirstVisibleIndex()).toBe(0);
  });

  test('rapid scrolling does not produce errors', async ({ messagePage }) => {
    await messagePage.goto();

    const errors: string[] = [];
    messagePage.page.on('pageerror', (error) => errors.push(error.message));

    // Rapid scroll bursts.
    for (let index = 0; index < 10; index++) {
      await messagePage.scrollBy(800);
      await messagePage.page.waitForTimeout(50);
    }

    await messagePage.page.waitForTimeout(2000);

    expect(errors).toEqual([]);

    // Table should still be visible and functional.
    const rowCount = await messagePage.getVisibleRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Scroll + filter interaction.
 * ──────────────────────────────────────────────────────────────────────── */

test.describe('Infinite Scroll — filter interaction', () => {
  const SEED_TEXT = buildSeedMessages({ count: 300, types: ['text'], seed: 33 });

  test.beforeEach(async ({ seedMessages }) => {
    await seedMessages(SEED_TEXT);
  });

  test('applying search filter keeps table functional', async ({ messagePage }) => {
    await messagePage.goto('text');

    // Scroll down first.
    await messagePage.scrollBy(2000);
    await messagePage.page.waitForTimeout(800);

    // Apply filter.
    await messagePage.typeInSearch('number 5');

    // Verify search input is populated and table still renders rows.
    expect(await messagePage.searchInput.inputValue()).toBe('number 5');
    const rowCount = await messagePage.getVisibleRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('scrolling works after filter is applied', async ({ messagePage }) => {
    await messagePage.goto('text');
    await messagePage.typeInSearch('number 1');

    const totalAfterFilter = await messagePage.getTotalCount();
    expect(totalAfterFilter).toBeGreaterThan(0);

    // Scroll down inside filtered result set.
    if (totalAfterFilter > 15) {
      await messagePage.scrollBy(2000);
      await messagePage.page.waitForTimeout(1200);
      await messagePage.waitForRowsLoaded();

      const firstIndex = await messagePage.getFirstVisibleIndex();
      expect(firstIndex).toBeGreaterThanOrEqual(0);
    }
  });
});
