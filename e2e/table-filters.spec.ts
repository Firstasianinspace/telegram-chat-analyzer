/**
 * E2E tests — MessageTableLazy: date-range filter and multi-filter combinations.
 *
 * Validates that:
 *  - Date-range picker narrows results to the selected interval.
 *  - Multiple filters (date + search + sort) work in combination.
 *  - Clearing filters restores the full dataset.
 *
 * Columns (textMessageColumns): 0 = id, 1 = timestamp, 2 = from, 3 = text, 4 = length
 */
import { test, expect, buildSeedMessages } from './fixtures/seed';

/* ────────────────────────────────────────────────────────────────────────────
 * Seed: 200 text messages spanning Jan 1 → Mar 1 2026, evenly distributed.
 * ──────────────────────────────────────────────────────────────────────── */
const SEED_DATE = buildSeedMessages({
  count: 200,
  spanDays: 60,
  endDate: new Date('2026-03-01T12:00:00Z'),
  seed: 88,
  types: ['text'],
});

test.describe('Date Range Filtering', () => {
  test.beforeEach(async ({ seedMessages }) => {
    await seedMessages(SEED_DATE);
  });

  test('total count is 200 before filtering', async ({ messagePage }) => {
    await messagePage.goto('text');
    const count = await messagePage.getTotalCount();
    expect(count).toBe(200);
  });

  test('date range picker narrows results to selected interval', async ({ messagePage }) => {
    await messagePage.goto('text');
    const countBefore = await messagePage.getTotalCount();
    expect(countBefore).toBe(200);

    // Set date range to February 2026 (should exclude Jan and late Feb).
    const start = new Date(2026, 1, 1);   // Feb 1, 2026
    const end = new Date(2026, 1, 15);    // Feb 15, 2026
    await messagePage.setDateRange(start, end);

    // After filtering, total count should decrease.
    const countAfter = await messagePage.getTotalCount();
    expect(countAfter).toBeLessThan(countBefore);
    expect(countAfter).toBeGreaterThan(0);

    // Verify visible rows have timestamps within the selected range.
    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const sample = Math.min(count, 5);
    for (let index = 0; index < sample; index++) {
      const dateText = await messagePage.getCellText(rows.nth(index), 1);
      const date = new Date(dateText);
      // Allow 1 day tolerance for timezone edge cases.
      expect(date.getTime()).toBeGreaterThanOrEqual(new Date(2025, 12, 31).getTime());
      expect(date.getTime()).toBeLessThanOrEqual(new Date(2026, 1, 17).getTime());
    }
  });
});

test.describe('Multi-Filter Combinations', () => {
  test.beforeEach(async ({ seedMessages }) => {
    await seedMessages(SEED_DATE);
  });

  test('search + sort: filtered rows are in correct order', async ({ messagePage }) => {
    await messagePage.goto('text');

    // Apply search filter first.
    await messagePage.typeInSearch('Alice');
    await messagePage.page.waitForTimeout(1500);

    const rows = messagePage.getVisibleRows();
    const countAfterSearch = await rows.count();
    expect(countAfterSearch).toBeGreaterThan(0);

    // Now sort by id ascending.
    await messagePage.clickColumnHeader(0);
    await messagePage.clickColumnHeader(0);
    await messagePage.page.waitForTimeout(2500);
    await messagePage.waitForRowsLoaded();

    expect(await messagePage.getSortDirection(0)).toBe('asc');

    // Verify rows are filtered (contain 'Alice') AND sorted (id ascending).
    const ids: number[] = [];
    const rowCount = await rows.count();
    const sample = Math.min(rowCount, 5);
    for (let index = 0; index < sample; index++) {
      const idText = await messagePage.getCellText(rows.nth(index), 0);
      const fromText = (await messagePage.getCellText(rows.nth(index), 2)).toLowerCase();
      const textContent = (await messagePage.getCellText(rows.nth(index), 3)).toLowerCase();
      expect(fromText.includes('alice') || textContent.includes('alice')).toBe(true);
      ids.push(Number(idText));
    }

    for (let index = 1; index < ids.length; index++) {
      expect(ids[index]).toBeGreaterThan(ids[index - 1]!);
    }
  });

  test('clearing search restores original count', async ({ messagePage }) => {
    await messagePage.goto('text');
    const fullCount = await messagePage.getTotalCount();
    expect(fullCount).toBe(200);

    await messagePage.typeInSearch('Alice');
    await messagePage.page.waitForTimeout(2000);

    const filteredCount = await messagePage.getTotalCount();
    expect(filteredCount).toBeLessThan(fullCount);
    expect(filteredCount).toBeGreaterThan(0);

    await messagePage.clearSearch();
    await messagePage.page.waitForTimeout(2000);
    await messagePage.waitForRowsLoaded();

    const restoredCount = await messagePage.getTotalCount();
    expect(restoredCount).toBe(fullCount);
  });

  test('sort persists after clearing search', async ({ messagePage }) => {
    await messagePage.goto('text');

    // Sort by id desc.
    await messagePage.clickColumnHeader(0);
    await messagePage.page.waitForTimeout(2000);
    await messagePage.waitForRowsLoaded();
    expect(await messagePage.getSortDirection(0)).toBe('desc');

    // Apply search, then clear it.
    await messagePage.typeInSearch('Bob');
    await messagePage.page.waitForTimeout(1500);
    await messagePage.clearSearch();
    await messagePage.page.waitForTimeout(2000);
    await messagePage.waitForRowsLoaded();

    // Sort direction should still be active.
    const dir = await messagePage.getSortDirection(0);
    expect(dir).toBe('desc');

    // Verify IDs are descending.
    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    const ids: number[] = [];
    const sample = Math.min(count, 5);
    for (let index = 0; index < sample; index++) {
      ids.push(Number(await messagePage.getCellText(rows.nth(index), 0)));
    }

    for (let index = 1; index < ids.length; index++) {
      expect(ids[index]).toBeLessThan(ids[index - 1]!);
    }
  });
});
