import type { Locator, Page } from '@playwright/test';

/**
 * Page Object for the MessageTableLazy virtual-scroll table.
 *
 * Encapsulates selectors and common interactions so E2E tests remain
 * stable when the component's DOM changes.
 */
export class MessageTablePage {
  readonly page: Page;

  /* ── Root containers ──────────────────────────────────────────────── */
  readonly container: Locator;
  readonly tableWrapper: Locator;
  readonly dataTable: Locator;

  /* ── Header ───────────────────────────────────────────────────────── */
  readonly title: Locator;
  readonly countBadge: Locator;
  readonly loadingIndicator: Locator;
  readonly errorIndicator: Locator;

  /* ── Filters ──────────────────────────────────────────────────────── */
  readonly dateRangePicker: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('.message-table-container');
    this.tableWrapper = page.locator('.table-wrapper');
    this.dataTable = page.locator('table.data-table');

    this.title = page.locator('.message-table-container .title');
    this.countBadge = page.locator('.message-table-container .count');
    this.loadingIndicator = page.locator('.loading-indicator');
    this.errorIndicator = page.locator('.error-indicator');

    this.dateRangePicker = page.getByPlaceholder('Выберите период');
    this.searchInput = page.locator('.search-input');
  }

  /* ── Navigation ───────────────────────────────────────────────────── */

  async goto(typeFilter?: string) {
    const url = typeFilter ? `/messages?type=${typeFilter}` : '/messages';
    await this.page.goto(url);
    await this.waitForTableReady();
  }

  async gotoServiceCalls() {
    await this.page.goto('/service/calls');
    await this.waitForTableReady();
  }

  /* ── Readiness ────────────────────────────────────────────────────── */

  async waitForTableReady() {
    await this.container.waitFor({ state: 'visible', timeout: 15_000 });
    // Wait for the table header rows (thead) to appear.
    await this.dataTable.locator('thead th').first().waitFor({ state: 'visible', timeout: 10_000 });
    // Wait for loading to finish — polling until no loading indicator.
    await this.page.waitForFunction(
      () => !document.querySelector('.loading-indicator'),
      { timeout: 15_000 },
    );
  }

  async waitForRowsLoaded(minRows = 1) {
    await this.page.waitForFunction(
      (min) => document.querySelectorAll('tr[data-index]').length >= min,
      minRows,
      { timeout: 15_000 },
    );
  }

  /* ── Count ────────────────────────────────────────────────────────── */

  async getTotalCount(): Promise<number> {
    const text = await this.countBadge.textContent() ?? '';
    const match = text.replaceAll(/\s/g, '').match(/[\d,]+/);
    return match ? Number(match[0].replaceAll(',', '')) : 0;
  }

  /* ── Rows ─────────────────────────────────────────────────────────── */

  getVisibleRows(): Locator {
    return this.dataTable.locator('tbody tr[data-index]');
  }

  async getVisibleRowCount(): Promise<number> {
    return this.getVisibleRows().count();
  }

  /** Get the `data-index` of the first visible virtual row. */
  async getFirstVisibleIndex(): Promise<number> {
    const row = this.getVisibleRows().first();
    const attribute = await row.getAttribute('data-index');
    return Number(attribute ?? '0');
  }

  /** Get the `data-index` of the last visible virtual row. */
  async getLastVisibleIndex(): Promise<number> {
    const row = this.getVisibleRows().last();
    const attribute = await row.getAttribute('data-index');
    return Number(attribute ?? '0');
  }

  /** Read plain-text cell content at a row/column position. */
  async getCellText(rowLocator: Locator, colIndex: number): Promise<string> {
    return (await rowLocator.locator('td').nth(colIndex).textContent() ?? '').trim();
  }

  /* ── Sorting ──────────────────────────────────────────────────────── */

  /** Return all `<th>` locators in the first header row. */
  getHeaderCells(): Locator {
    return this.dataTable.locator('thead tr').first().locator('th');
  }

  /** Click a column header to toggle sorting.  `colIndex` is 0-based. */
  async clickColumnHeader(colIndex: number) {
    await this.getHeaderCells().nth(colIndex).click();
    // Wait for debounce (400ms) + worker round-trip + DOM update.
    await this.page.waitForTimeout(1500);
    await this.waitForRowsLoaded();
  }

  /** Check whether a column is currently sorted and in which direction. */
  async getSortDirection(colIndex: number): Promise<'asc' | 'desc' | false> {
    const th = this.getHeaderCells().nth(colIndex);
    const indicator = th.locator('.sort-indicator');
    if (await indicator.count() === 0) return false;
    const text = (await indicator.textContent() ?? '').trim();
    if (text.includes('↑')) return 'asc';
    if (text.includes('↓')) return 'desc';
    return false;
  }

  /** Check whether a column header has the `sorted` CSS class. */
  async isSorted(colIndex: number): Promise<boolean> {
    const th = this.getHeaderCells().nth(colIndex);
    const classes = await th.getAttribute('class') ?? '';
    return classes.includes('sorted');
  }

  /* ── Scrolling ────────────────────────────────────────────────────── */

  /** Scroll the table wrapper by a pixel delta. */
  async scrollBy(deltaY: number) {
    await this.tableWrapper.evaluate((element, dy) => {
      element.scrollBy({ top: dy });
    }, deltaY);
  }

  /** Scroll to the very bottom of the virtual list. */
  async scrollToBottom() {
    await this.tableWrapper.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
  }

  /** Scroll to the very top. */
  async scrollToTop() {
    await this.tableWrapper.evaluate((element) => {
      element.scrollTop = 0;
    });
  }

  /** Get the container's current scrollTop. */
  async getScrollTop(): Promise<number> {
    return this.tableWrapper.evaluate((element) => element.scrollTop);
  }

  /* ── Filters ──────────────────────────────────────────────────────── */

  async typeInSearch(query: string) {
    await this.searchInput.fill(query);
    // Debounce 400ms + refetch
    await this.page.waitForTimeout(800);
    await this.waitForRowsLoaded();
  }

  async clearSearch() {
    await this.searchInput.fill('');
    await this.page.waitForTimeout(800);
  }

  /* ── Date Range Picker ────────────────────────────────────────────── */

  /**
   * Set a date range by interacting with the PrimeVue DatePicker.
   * Opens the calendar popup, navigates to the month of the start date,
   * clicks start day, navigates to end month if different, clicks end day.
   */
  async setDateRange(start: Date, end: Date) {
    // Click the date picker input to open the calendar popup.
    await this.dateRangePicker.click();
    await this.page.waitForTimeout(300);

    // Navigate to the start month and click the start day.
    await this.navigateCalendarTo(start);
    await this.clickCalendarDay(start.getDate());
    await this.page.waitForTimeout(200);

    // If end month differs, navigate to it.
    if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) {
      await this.navigateCalendarTo(end);
    }
    await this.clickCalendarDay(end.getDate());

    // Close the popup by clicking outside.
    await this.page.locator('.table-header').click();
    // Wait for debounce + data reload.
    await this.page.waitForTimeout(1500);
    await this.waitForRowsLoaded();
  }

  /**
   * Navigate the PrimeVue DatePicker popup to the month/year of the target date.
   * Uses the prev/next month buttons in the calendar header.
   */
  private async navigateCalendarTo(target: Date) {
    const panel = this.page.locator('.p-datepicker-panel');
    const maxAttempts = 24;

    for (let index = 0; index < maxAttempts; index++) {
      const titleText = await panel.locator('button.p-datepicker-select-month').textContent() ?? '';
      const yearText = await panel.locator('button.p-datepicker-select-year').textContent() ?? '';

      const currentTitle = `${titleText} ${yearText}`.toLowerCase();
      const targetMonth = target.toLocaleString('en', { month: 'long' }).toLowerCase();
      const targetYear = String(target.getFullYear());

      if (currentTitle.includes(targetMonth) && currentTitle.includes(targetYear)) {
        return; // We're on the correct month
      }

      // Determine direction: click next or prev.
      const displayedYear = Number.parseInt(yearText.trim(), 10) || new Date().getFullYear();
      const displayedMonthIndex = new Date(`${titleText.trim()} 1, 2000`).getMonth();
      const targetDate = new Date(target.getFullYear(), target.getMonth(), 1);
      const displayedDate = new Date(displayedYear, displayedMonthIndex, 1);

      await (targetDate > displayedDate ? panel.locator('button.p-datepicker-next-button').click() : panel.locator('button.p-datepicker-prev-button').click());
      await this.page.waitForTimeout(200);
    }
  }

  /**
   * Click a specific day number in the currently displayed calendar month.
   */
  private async clickCalendarDay(day: number) {
    const panel = this.page.locator('.p-datepicker-panel');
    // PrimeVue v4: day cells are <td class="p-datepicker-day-cell"><span class="p-datepicker-day">
    // Exclude other-month cells to avoid clicking the wrong month's day.
    const dayCell = panel.locator(
      `td.p-datepicker-day-cell:not(.p-datepicker-other-month) span.p-datepicker-day:text-is("${day}")`,
    );
    await dayCell.click();
  }

  async clearDateRange() {
    // The DatePicker input is readonly, so use Ctrl+A then Backspace to clear.
    await this.dateRangePicker.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Backspace');
    await this.page.locator('.table-header').click();
    await this.page.waitForTimeout(800);
    await this.waitForRowsLoaded();
  }
}
