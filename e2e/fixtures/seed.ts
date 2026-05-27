import { test as base, type Page } from '@playwright/test';
import { MessageTablePage } from '../pages/MessageTablePage';

/**
 * Deterministic PRNG (same LCG as the app's `makePrng`).
 * Allows generating the exact same messages in Node and in browser.
 */
function makePrng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) & 0x7f_ff_ff_ff;
    return s / 0x7f_ff_ff_ff;
  };
}

export interface SeedMessage {
  id: number;
  type: string;
  timestamp: string; // ISO string — serialisable
  from: string;
  fromId: string;
  text?: string;
  file?: {
    name?: string;
    size?: number;
    mimeType?: string;
    duration?: number;
    width?: number;
    height?: number;
    stickerEmoji?: string;
  };
  serviceAction?: string;
  serviceActor?: string;
}

const TYPES = ['text', 'sticker', 'photo', 'video', 'audio', 'voice', 'animation', 'service'] as const;
const SENDERS = [
  { name: 'Alice', id: 'user_1' },
  { name: 'Bob', id: 'user_2' },
];

/**
 * Build an array of deterministic test messages in Node.js.
 *
 * Messages are spaced uniformly across `spanDays` *backwards* from `endDate`,
 * newest-first (id=0 is oldest, id=count-1 is newest).  This mirrors what
 * the app's mock-data generator produces.
 */
export function buildSeedMessages(options: {
  count: number;
  spanDays?: number;
  endDate?: Date;
  seed?: number;
  /** Restrict to specific types for deterministic assertions. */
  types?: typeof TYPES[number][];
}): SeedMessage[] {
  const {
    count,
    spanDays = 90,
    endDate = new Date('2026-03-01T12:00:00Z'),
    seed = 42,
    types = [...TYPES],
  } = options;

  const rand = makePrng(seed);
  const endMs = endDate.getTime();
  const spanMs = spanDays * 86_400_000;
  const startMs = endMs - spanMs;

  const messages: SeedMessage[] = [];

  for (let index = 0; index < count; index++) {
    // Distribute timestamps evenly across the span + tiny jitter.
    const fraction = count > 1 ? index / (count - 1) : 0;
    const jitter = (rand() - 0.5) * (spanMs / count);
    const ts = new Date(startMs + fraction * spanMs + jitter);

    const sender = SENDERS[Math.floor(rand() * SENDERS.length)]!;
    const type = types[Math.floor(rand() * types.length)]!;

    const message: SeedMessage = {
      id: index + 1,
      type,
      timestamp: ts.toISOString(),
      from: sender.name,
      fromId: sender.id,
    };

    switch (type) {
      case 'text': {
        message.text = `Message number ${index + 1} from ${sender.name}`;

        break;
      }
      case 'voice':
      case 'audio':
      case 'video': {
        message.file = {
          name: `file_${index + 1}.${type === 'voice' ? 'ogg' : type === 'audio' ? 'mp3' : 'mp4'}`,
          size: Math.floor(rand() * 10_000_000),
          mimeType: type === 'voice' ? 'audio/ogg' : type === 'audio' ? 'audio/mpeg' : 'video/mp4',
          duration: Math.floor(rand() * 600),
          width: type === 'video' ? 1920 : undefined,
          height: type === 'video' ? 1080 : undefined,
        };

        break;
      }
      case 'photo':
      case 'animation': {
        message.file = {
          name: `img_${index + 1}.${type === 'photo' ? 'jpg' : 'gif'}`,
          size: Math.floor(rand() * 5_000_000),
          mimeType: type === 'photo' ? 'image/jpeg' : 'image/gif',
          width: Math.floor(rand() * 3000) + 100,
          height: Math.floor(rand() * 3000) + 100,
        };

        break;
      }
      case 'sticker': {
        message.file = { stickerEmoji: '😀' };
        message.text = 'sticker caption';

        break;
      }
      case 'service': {
        message.serviceAction = 'phone_call';
        message.serviceActor = sender.name;

        break;
      }
      // No default
    }

    messages.push(message);
  }

  return messages;
}

/**
 * Seed IndexedDB inside the browser with pre-generated messages.
 *
 * Strategy: let the app's Dexie instance create / open the database
 * (so the schema version always matches), then bulk-insert test data
 * via the app's own `database` module exposed on `window.__testDB`.
 *
 * For this to work the page must have been navigated to the app origin
 * already (so Dexie's `ChatDatabase` is initialised).
 *
 * We seed through raw IndexedDB using the *existing* database version
 * (detected at runtime) to avoid version-mismatch errors.
 */
export async function seedDatabase(page: Page, messages: SeedMessage[]) {
  await page.evaluate(async (msgs) => {
    const DB_NAME = 'ChatDatabase';

    function computeDerived(ts: Date) {
      const year = ts.getFullYear();
      const month = String(ts.getMonth() + 1).padStart(2, '0');
      const day = String(ts.getDate()).padStart(2, '0');
      return {
        date: `${year}-${month}-${day}`,
        hour: ts.getHours(),
        dayOfWeek: ts.getDay(),
      };
    }

    // Open *without* specifying a version so IndexedDB returns whatever
    // version Dexie already created (avoids VersionError).
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    // Clear existing messages & participants.
    const clearTx = database.transaction(['messages', 'participants'], 'readwrite');
    clearTx.objectStore('messages').clear();
    clearTx.objectStore('participants').clear();
    await new Promise<void>((res, rej) => {
      clearTx.oncomplete = () => res();
      clearTx.onerror = () => rej(clearTx.error);
    });

    // Insert messages.
    const tx = database.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');

    for (const raw of msgs) {
      const ts = new Date(raw.timestamp);
      const derived = computeDerived(ts);
      store.put({
        ...raw,
        timestamp: ts,
        ...derived,
      });
    }

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    // Insert participants.
    const ptx = database.transaction('participants', 'readwrite');
    const pStore = ptx.objectStore('participants');
    pStore.put({ id: 'user_1', name: 'Alice', isMe: true });
    pStore.put({ id: 'user_2', name: 'Bob', isMe: false });
    await new Promise<void>((res, rej) => {
      ptx.oncomplete = () => res();
      ptx.onerror = () => rej(ptx.error);
    });

    database.close();
  }, messages);
}

/** Delete the ChatDatabase so tests start from a clean slate. */
export async function clearDatabase(page: Page) {
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const database of dbs) {
      if (database.name === 'ChatDatabase') {
        indexedDB.deleteDatabase(database.name);
      }
    }
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Playwright test fixture — extends `test` with `messagePage` and
 * `seedMessages` helpers.
 * ──────────────────────────────────────────────────────────────────────── */

type Fixtures = {
  messagePage: MessageTablePage;
  seedMessages: (msgs: SeedMessage[]) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  messagePage: async ({ page }, use) => {
    await use(new MessageTablePage(page));
  },
  seedMessages: async ({ page }, use) => {
    await use(async (msgs: SeedMessage[]) => {
      // Navigate to the app first so Dexie creates / opens the DB with
      // the correct schema version.  Wait until the page is idle.
      await page.goto('/', { waitUntil: 'networkidle' });
      // Small delay to let Dexie's async open() complete.
      await page.waitForTimeout(500);
      await seedDatabase(page, msgs);
      // Reload so the Pinia store picks up the seeded data.
      await page.reload({ waitUntil: 'networkidle' });
    });
  },
});

export { expect } from '@playwright/test';
