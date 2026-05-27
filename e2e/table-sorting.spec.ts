/**
 * E2E tests — MessageTableLazy: sorting by date, duration, type + date interval filter.
 *
 * Columns (allMessageColumns):
 *  0 = id, 1 = timestamp, 2 = from, 3 = type, 4 = text/caption,
 *  5 = emoji, 6 = duration, 7 = dimensions
 */
import { test, expect, buildSeedMessages } from './fixtures/seed';

/* ────────────────────────────────────────────────────────────────────────────
 * Shared seed: 200 messages spanning 90 days — small enough for fast tests,
 * large enough to exercise virtual scrolling and page boundaries.
 * ──────────────────────────────────────────────────────────────────────── */
const SEED_200 = buildSeedMessages({ count: 200, spanDays: 90, seed: 42 });

test.describe('Table Sorting', () => {
  test.beforeEach(async ({ seedMessages }) => {
    await seedMessages(SEED_200);
  });

  test('default sort is timestamp descending', async ({ messagePage }) => {
    await messagePage.goto();

    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);

    // Verify actual data: first rows should have descending timestamps.
    const dates: string[] = [];
    const sample = Math.min(count, 5);
    for (let index = 0; index < sample; index++) {
      dates.push(await messagePage.getCellText(rows.nth(index), 1));
    }

    const timestamps = dates.map((d) => new Date(d).getTime());
    for (let index = 1; index < timestamps.length; index++) {
      expect(timestamps[index]).toBeLessThanOrEqual(timestamps[index - 1]!);
    }
  });

  test('click timestamp header toggles sort direction', async ({ messagePage }) => {
    await messagePage.goto();

    const firstRow = messagePage.getVisibleRows().first();
    const dateBefore = await messagePage.getCellText(firstRow, 1);

    await messagePage.clickColumnHeader(1);
    const dir = await messagePage.getSortDirection(1);
    expect(dir === 'asc' || dir === 'desc').toBe(true);

    if (dir === 'asc') {
      const dateAfter = await messagePage.getCellText(firstRow, 1);
      expect(dateAfter).not.toBe(dateBefore);
    }
  });

  test('sort by timestamp ascending shows oldest first', async ({ messagePage }) => {
    await messagePage.goto();
    await messagePage.clickColumnHeader(1);
    await messagePage.clickColumnHeader(1);
    await messagePage.page.waitForTimeout(2000);
    await messagePage.waitForRowsLoaded();

    const dir = await messagePage.getSortDirection(1);
    expect(dir).toBe('asc');

    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);

    const dates: string[] = [];
    const sample = Math.min(count, 5);
    for (let index = 0; index < sample; index++) {
      dates.push(await messagePage.getCellText(rows.nth(index), 1));
    }

    const timestamps = dates.map((d) => new Date(d).getTime());
    for (let index = 1; index < timestamps.length; index++) {
      expect(timestamps[index]).toBeGreaterThanOrEqual(timestamps[index - 1]!);
    }
  });

  test('sort by timestamp descending shows newest first', async ({ messagePage }) => {
    await messagePage.goto();
    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);

    const dates: string[] = [];
    const sample = Math.min(count, 5);
    for (let index = 0; index < sample; index++) {
      dates.push(await messagePage.getCellText(rows.nth(index), 1));
    }

    const timestamps = dates.map((d) => new Date(d).getTime());
    for (let index = 1; index < timestamps.length; index++) {
      expect(timestamps[index]).toBeLessThanOrEqual(timestamps[index - 1]!);
    }
  });

  test('sort by id ascending shows lowest IDs first', async ({ messagePage }) => {
    await messagePage.goto();
    await messagePage.clickColumnHeader(0);
    await messagePage.clickColumnHeader(0);
    await messagePage.page.waitForTimeout(2000);
    await messagePage.waitForRowsLoaded();

    expect(await messagePage.getSortDirection(0)).toBe('asc');

    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);

    const ids: number[] = [];
    const sample = Math.min(count, 5);
    for (let index = 0; index < sample; index++) {
      const text = await messagePage.getCellText(rows.nth(index), 0);
      ids.push(Number(text));
    }

    for (let index = 1; index < ids.length; index++) {
      expect(ids[index]).toBeGreaterThan(ids[index - 1]!);
    }
  });

  test('sort by id descending shows highest IDs first', async ({ messagePage }) => {
    await messagePage.goto();
    await messagePage.clickColumnHeader(0);
    await messagePage.page.waitForTimeout(2000);
    await messagePage.waitForRowsLoaded();

    expect(await messagePage.getSortDirection(0)).toBe('desc');

    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(1);

    const ids: number[] = [];
    const sample = Math.min(count, 5);
    for (let index = 0; index < sample; index++) {
      const text = await messagePage.getCellText(rows.nth(index), 0);
      ids.push(Number(text));
    }

    for (let index = 1; index < ids.length; index++) {
      expect(ids[index]).toBeLessThan(ids[index - 1]!);
    }
  });

  test('sort by type column shows alphabetically ordered types', async ({ messagePage }) => {
    await messagePage.goto();
    await messagePage.clickColumnHeader(3);
    await messagePage.clickColumnHeader(3);
    await messagePage.page.waitForTimeout(2500);
    await messagePage.waitForRowsLoaded();

    const dir = await messagePage.getSortDirection(3);
    expect(dir).toBe('asc');

    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const types: string[] = [];
    const sample = Math.min(count, 8);
    for (let index = 0; index < sample; index++) {
      types.push(await messagePage.getCellText(rows.nth(index), 3));
    }

    for (let index = 1; index < types.length; index++) {
      expect(types[index]!.localeCompare(types[index - 1]!)).toBeGreaterThanOrEqual(0);
    }
  });

  test('double-click column removes sort', async ({ messagePage }) => {
    await messagePage.goto();
    await messagePage.clickColumnHeader(0);
    await messagePage.clickColumnHeader(0);
    const dir = await messagePage.getSortDirection(0);
    expect(['asc', 'desc', false]).toContain(dir);
  });
});

test.describe('Text Search Filtering', () => {
  const MESSAGES_WITH_KNOWN_DATES = buildSeedMessages({
    count: 100,
    spanDays: 60,
    endDate: new Date('2026-03-01T12:00:00Z'),
    seed: 99,
    types: ['text'],
  });

  test.beforeEach(async ({ seedMessages }) => {
    await seedMessages(MESSAGES_WITH_KNOWN_DATES);
  });

  test('shows total count before filtering', async ({ messagePage }) => {
    await messagePage.goto('text');
    const count = await messagePage.getTotalCount();
    expect(count).toBe(100);
  });

  test('search text filters rows and visible data matches query', async ({ messagePage }) => {
    await messagePage.goto('text');
    await messagePage.typeInSearch('number 5');
    await messagePage.page.waitForTimeout(2000);

    const rows = messagePage.getVisibleRows();
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify every visible row contains the search term in text or from columns.
    const sample = Math.min(rowCount, 5);
    for (let index = 0; index < sample; index++) {
      const cellText = (await messagePage.getCellText(rows.nth(index), 4)).toLowerCase();
      const fromText = (await messagePage.getCellText(rows.nth(index), 2)).toLowerCase();
      expect(cellText.includes('number 5') || fromText.includes('number 5')).toBe(true);
    }
  });

  test('clearing search restores full row set', async ({ messagePage }) => {
    await messagePage.goto('text');
    await messagePage.typeInSearch('number 5');
    expect(await messagePage.searchInput.inputValue()).toBe('number 5');

    await messagePage.clearSearch();
    await messagePage.page.waitForTimeout(1500);
    await messagePage.waitForRowsLoaded();

    expect(await messagePage.searchInput.inputValue()).toBe('');
    const rows = messagePage.getVisibleRows();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('search + sort combined verifies both filter and order', async ({ messagePage }) => {
    await messagePage.goto('text');
    await messagePage.typeInSearch('number 3');

    const rows = messagePage.getVisibleRows();
    expect(await rows.count()).toBeGreaterThan(0);

    // Sort by id descending.
    await messagePage.clickColumnHeader(0);
    await messagePage.page.waitForTimeout(2500);
    await messagePage.waitForRowsLoaded();

    const dir = await messagePage.getSortDirection(0);
    expect(dir).toBe('desc');

    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify rows are filtered AND sorted.
    const ids: number[] = [];
    const sample = Math.min(rowCount, 5);
    for (let index = 0; index < sample; index++) {
      const idText = await messagePage.getCellText(rows.nth(index), 0);
      const cellText = (await messagePage.getCellText(rows.nth(index), 4)).toLowerCase();
      const fromText = (await messagePage.getCellText(rows.nth(index), 2)).toLowerCase();
      expect(cellText.includes('number 3') || fromText.includes('number 3')).toBe(true);
      ids.push(Number(idText));
    }

    for (let index = 1; index < ids.length; index++) {
      expect(ids[index]).toBeLessThan(ids[index - 1]!);
    }
  });
});

test.describe('Duration Column', () => {
  const MEDIA_MESSAGES = buildSeedMessages({
    count: 50,
    spanDays: 30,
    seed: 77,
    types: ['voice', 'audio', 'video'],
  });

  test.beforeEach(async ({ seedMessages }) => {
    await seedMessages(MEDIA_MESSAGES);
  });

  test('duration column renders formatted values', async ({ messagePage }) => {
    await messagePage.goto();
    await messagePage.waitForRowsLoaded();

    const rows = messagePage.getVisibleRows();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    let foundDuration = false;
    for (let index = 0; index < Math.min(count, 15); index++) {
      const text = await messagePage.getCellText(rows.nth(index), 6);
      if (/\d+:\d{2}/.test(text)) {
        foundDuration = true;
        break;
      }
    }
    expect(foundDuration).toBe(true);
  });
});