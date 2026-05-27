/**
 * Message Factory — Factory Pattern (GoF) + DIP.
 *
 * Defines a generic MessageFactory<T> interface so the generator loop stays
 * agnostic of the concrete domain model.  The ChatMessageFactory provides the
 * Telegram-style implementation.  Swap it with an OrderMessageFactory (or any
 * other) without touching the generator or worker controller.
 *
 * Data pools live here rather than in the worker, keeping the worker a thin
 * dispatcher (SRP).
 */

import type { ChatMessage, MessageType } from '../../../domain/entities/types';

// ---------------------------------------------------------------------------
// Generic interface (DIP)
// ---------------------------------------------------------------------------

/**
 * A pure factory that builds one message from deterministic inputs.
 * No side-effects; fully unit-testable.
 */
export interface MessageFactory<T> {
  /**
   * @param index     Zero-based position in the current generation run.
   * @param startMs   Epoch ms at the start of the time window.
   * @param spanMs    Length of the time window in milliseconds.
   * @param rand      Seeded pseudo-random function returning [0, 1).
   */
  build(
    index: number,
    startMs: number,
    spanMs: number,
    rand: () => number,
  ): T;
}

// ---------------------------------------------------------------------------
// Sample data pools (injected into the factory, not scattered globally)
// ---------------------------------------------------------------------------

interface ChatFactoryConfig {
  participants: ReadonlyArray<{ id: string; name: string }>;
  textSamples: ReadonlyArray<string>;
  stickerEmojis: ReadonlyArray<string>;
  mimeTypes: ReadonlyArray<string>;
  /** Pairs of [MessageType, weight]. Higher weight = more frequent. */
  typeWeights: ReadonlyArray<readonly [MessageType, number]>;
}

const DEFAULT_CONFIG: ChatFactoryConfig = {
  participants: [
    { id: 'user_001', name: 'Alice' },
    { id: 'user_002', name: 'Bob' },
  ],
  textSamples: [
    'Hey, how are you doing?',
    'What time is the meeting?',
    'Did you see the game last night?',
    'I will be there in 10 minutes.',
    'Can you send me the file?',
    'That sounds like a great idea!',
    'No way, seriously?',
    'Let me check and get back to you.',
    'Perfect, see you then!',
    'I was just thinking about that.',
    'Have you had lunch yet?',
    'Call me when you are free.',
    'Happy birthday! 🎉',
    'Thanks, really appreciate it.',
    'Sorry, I missed your message.',
    'On my way!',
    'Can we reschedule? Something came up.',
    'Good morning! ☀️',
    'Good night, sleep well.',
    'Did you get my last message?',
    'This is hilarious 😂',
    'I totally agree.',
    'Not sure about that one.',
    "Let's talk tomorrow.",
    'Got it, thanks!',
    'Working on it now.',
    'Almost done with that report.',
    'Can you call me?',
    'What do you think?',
    'Sounds good to me.',
  ],
  stickerEmojis: ['👍', '❤️', '😂', '🔥', '🎉', '😎', '🙌', '✨'],
  mimeTypes: ['image/jpeg', 'image/png', 'video/mp4', 'audio/mpeg', 'audio/ogg'],
  typeWeights: [
    ['text', 70],
    ['sticker', 8],
    ['photo', 8],
    ['voice', 6],
    ['video', 4],
    ['audio', 2],
    ['animation', 2],
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCumulativeWeights(
  weights: ReadonlyArray<readonly [MessageType, number]>,
): { cumulative: number[]; total: number } {
  let sum = 0;
  const cumulative = weights.map(([, w]) => (sum += w));
  return { cumulative, total: sum };
}

function pickWeightedType(
  rand: () => number,
  weights: ReadonlyArray<readonly [MessageType, number]>,
  cumulative: number[],
  total: number,
): MessageType {
  const r = rand() * total;
  for (const [index, element] of cumulative.entries()) {
    if (r < element!) return weights[index]![0];
  }
  return 'text';
}

function pickItem<T>(array: ReadonlyArray<T>, rand: () => number): T {
  return array[Math.floor(rand() * array.length)]!;
}

// ---------------------------------------------------------------------------
// Concrete factory — ChatMessage domain
// ---------------------------------------------------------------------------

/**
 * Produces `ChatMessage` instances deterministically.
 * Constructed with an optional config to allow unit-testing with custom pools.
 */
export class ChatMessageFactory implements MessageFactory<ChatMessage> {
  readonly #config: ChatFactoryConfig;
  readonly #cumulative: number[];
  readonly #totalWeight: number;

  constructor(config: ChatFactoryConfig = DEFAULT_CONFIG) {
    this.#config = config;
    const { cumulative, total } = buildCumulativeWeights(config.typeWeights);
    this.#cumulative = cumulative;
    this.#totalWeight = total;
  }

  build(
    index: number,
    startMs: number,
    spanMs: number,
    rand: () => number,
  ): ChatMessage {
    const id = index + 1;
    const type = pickWeightedType(
      rand,
      this.#config.typeWeights,
      this.#cumulative,
      this.#totalWeight,
    );

    const timestampMs = startMs + Math.floor(rand() * spanMs);
    const participant = pickItem(this.#config.participants, rand);

    const base: ChatMessage = {
      id,
      type,
      timestamp: new Date(timestampMs),
      from: participant.name,
      fromId: participant.id,
    };

    switch (type) {
      case 'text': {
        base.text = pickItem(this.#config.textSamples, rand);
        break;
      }

      case 'sticker': {
        base.file = { stickerEmoji: pickItem(this.#config.stickerEmojis, rand) };
        break;
      }

      case 'photo': {
        base.file = {
          mimeType: 'image/jpeg',
          width: 640 + Math.floor(rand() * 640),
          height: 480 + Math.floor(rand() * 480),
          size: 50_000 + Math.floor(rand() * 450_000),
        };
        break;
      }

      case 'video': {
        base.file = {
          mimeType: 'video/mp4',
          duration: Math.floor(rand() * 120) + 5,
          size: 500_000 + Math.floor(rand() * 4_500_000),
        };
        break;
      }

      case 'voice': {
        base.file = {
          mimeType: 'audio/ogg',
          duration: Math.floor(rand() * 60) + 1,
          size: 10_000 + Math.floor(rand() * 90_000),
        };
        break;
      }

      case 'audio': {
        base.file = {
          mimeType: 'audio/mpeg',
          name: `track_${id}.mp3`,
          duration: 180 + Math.floor(rand() * 180),
          size: 3_000_000 + Math.floor(rand() * 5_000_000),
        };
        break;
      }

      case 'animation': {
        base.file = {
          mimeType: pickItem(this.#config.mimeTypes, rand),
          width: 300,
          height: 300,
          size: 100_000 + Math.floor(rand() * 900_000),
        };
        break;
      }

      case 'service': {
        base.serviceAction = 'phone_call';
        base.serviceActor = participant.name;
        break;
      }
    }

    return base;
  }
}
