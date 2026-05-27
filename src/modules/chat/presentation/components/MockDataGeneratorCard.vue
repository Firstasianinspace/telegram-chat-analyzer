<script setup lang="ts">
/**
 * MockDataGeneratorCard
 *
 * Redesigned UI panel for mock chat data generation.
 *
 * UX flow
 * ────────
 * Idle (no resume):
 *   [−10k] [InputNumber] [+10k]   →   [Generate]
 *   if DB has data: [+10k] [−10k] [Clear]
 *
 * Generating:
 *   ProgressBar (live value) · "{generated} / {target}"
 *   [Stop]
 *
 * Stopping:
 *   ProgressBar (frozen) · "Stopping…"
 *   [Stop] (disabled + spinner)
 *
 * Idle (resumable):
 *   ProgressBar (frozen at stopped position)
 *   [Resume ({left} left)]  [Generate new]
 *
 * Architecture:
 *  - `store` prop (MessageStoreInterface) — no direct Pinia import (DIP).
 *  - Composable handles worker; this component handles orchestration only.
 */
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import ProgressBar from 'primevue/progressbar';
import Message from 'primevue/message';
import type { ChatMessage } from '@/modules/chat/domain/entities/types';
import {
  useMockDataGenerator,
  DEFAULT_TOTAL_MESSAGES,
  DEFAULT_ADD_COUNT,
  DEFAULT_REMOVE_COUNT,
  DEFAULT_SPAN_DAYS,
} from '@/modules/chat/presentation/composables/use-mock-data-generator';

// ---------------------------------------------------------------------------
// Store interface — component depends on this abstraction, not on Pinia
// ---------------------------------------------------------------------------

export interface MessageStoreInterface {
  readonly totalCount: number;
  readonly hasData: boolean;
  appendMessages(messages: ChatMessage[]): Promise<void>;
  clearData(): Promise<void>;
  removeLastMessages(count: number): Promise<void>;
  checkHasData(): Promise<boolean | void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Amount added or removed by the increment / decrement buttons. */
const STEP = 10_000;
const MIN_COUNT = 1000;
const MAX_COUNT = 1_000_000;

// ---------------------------------------------------------------------------
// Props & emits
// ---------------------------------------------------------------------------

const { store } = defineProps<{
  store: MessageStoreInterface;
}>();

const emit = defineEmits<{
  (e: 'generation-start'): void;
  (e: 'generation-end'): void;
}>();

// ---------------------------------------------------------------------------
// Local count state — decoupled from the running generation target
// ---------------------------------------------------------------------------

const messageCount = ref<number>(DEFAULT_TOTAL_MESSAGES);

function increment(): void {
  messageCount.value = Math.min(messageCount.value + STEP, MAX_COUNT);
}

function decrement(): void {
  messageCount.value = Math.max(messageCount.value - STEP, MIN_COUNT);
}

// ---------------------------------------------------------------------------
// Composable wiring
// ---------------------------------------------------------------------------

const { t } = useI18n();

const {
  isGenerating,
  isStopping,
  isIdle,
  canResume,
  pendingResume,
  progress,
  generatedCount,
  targetCount,
  error,
  startGeneration,
  stopGeneration,
  resumeGeneration,
  addMessages,
  acknowledgeRemoval,
} = useMockDataGenerator({
  onChunk: (messages) => store.appendMessages(messages),
  onComplete: async () => { await store.checkHasData(); },
  onStopped: async () => { await store.checkHasData(); },
});

const isActive = computed(() => isGenerating.value || isStopping.value);

const statusLabel = computed<string>(() => {
  if (isStopping.value) return t('mockData.stopping');
  if (isGenerating.value) return t('mockData.generating');
  if (canResume.value) return t('mockData.paused');
  return '';
});

const progressLabel = computed<string>(() =>
  t('mockData.progress', {
    generated: generatedCount.value.toLocaleString(),
    target: targetCount.value.toLocaleString(),
  }),
);

const progressPct = computed<string>(() =>
  t('mockData.progressPct', { pct: progress.value }),
);

const totalLabel = computed<string>(() =>
  t('mockData.total', { count: store.totalCount.toLocaleString() }),
);

const resumeLabel = computed<string>(() =>
  t('mockData.resumeBtn', {
    count: (pendingResume.value?.remaining ?? 0).toLocaleString(),
  }),
);

const incrementLabel = computed(() =>
  t('mockData.incrementBtn', { count: STEP.toLocaleString() }),
);

const decrementLabel = computed(() =>
  t('mockData.decrementBtn', { count: STEP.toLocaleString() }),
);

const showProgress = computed(() => isActive.value || canResume.value);

async function handleGenerate(): Promise<void> {
  emit('generation-start');
  await store.clearData();
  startGeneration({ totalMessages: messageCount.value, spanDays: DEFAULT_SPAN_DAYS });
}

function handleStop(): void {
  stopGeneration();
}

function handleResume(): void {
  resumeGeneration();
}

function handleAdd(): void {
  addMessages({ count: DEFAULT_ADD_COUNT, spanDays: DEFAULT_SPAN_DAYS });
}

async function handleRemove(): Promise<void> {
  if (!isIdle.value) return;
  try {
    await store.removeLastMessages(DEFAULT_REMOVE_COUNT);
    acknowledgeRemoval(DEFAULT_REMOVE_COUNT);
  } catch {

  }
}

async function handleClear(): Promise<void> {
  if (!isIdle.value) return;
  await store.clearData();
}

watch(isActive, (active) => {
  if (active) {
    emit('generation-start');
    return;
  }
  emit('generation-end');
});
</script>

<template>
  <div class="mock-generator-card">

    <!-- ── Header ─────────────────────────────────────────────────────── -->
    <div class="mock-generator__header">
      <h3 class="mock-generator__title">{{ t('mockData.title') }}</h3>
      <p class="mock-generator__desc">{{ t('mockData.description') }}</p>
    </div>

    <!-- ── Error banner ───────────────────────────────────────────────── -->
    <Message v-if="error" severity="error" :closable="false">
      {{ t('mockData.errorMsg', { error }) }}
    </Message>

    <!-- ── Progress block (generating / stopping / paused) ───────────── -->
    <Transition name="progress-slide">
      <div v-if="showProgress" class="mock-generator__progress">
        <div class="mock-generator__progress-meta">
          <span class="mock-generator__status-label">{{ statusLabel }}</span>
          <span class="mock-generator__progress-fraction">{{ progressLabel }}</span>
          <span class="mock-generator__progress-pct">{{ progressPct }}</span>
        </div>
        <ProgressBar :value="progress" :show-value="false" class="mock-generator__bar"
          :class="{ 'mock-generator__bar--paused': canResume && !isActive }" />
      </div>
    </Transition>

    <!-- ── Total pill ─────────────────────────────────────────────────── -->
    <div v-if="store.totalCount > 0" class="mock-generator__total">
      {{ totalLabel }}
    </div>

    <!-- ── Count input row (shown only when idle) ─────────────────────── -->
    <Transition name="progress-slide">
      <div v-if="isIdle" class="mock-generator__count-row">
        <label class="mock-generator__count-label">{{ t('mockData.countLabel') }}</label>
        <div class="mock-generator__count-input">
          <Button :label="decrementLabel" severity="secondary" outlined size="small"
            :disabled="messageCount <= MIN_COUNT" @click="decrement" />
          <InputNumber v-model="messageCount" :min="MIN_COUNT" :max="MAX_COUNT" :step="STEP" :use-grouping="true"
            input-class="mock-generator__number-input" />
          <Button :label="incrementLabel" severity="secondary" outlined size="small"
            :disabled="messageCount >= MAX_COUNT" @click="increment" />
        </div>
      </div>
    </Transition>

    <!-- ── Action buttons ────────────────────────────────────────────── -->
    <div class="mock-generator__actions">

      <!-- Generating / stopping: show Stop button -->
      <template v-if="isActive">
        <Button :label="t('mockData.stopBtn')" icon="pi pi-stop-circle" severity="danger" :loading="isStopping"
          :disabled="isStopping" @click="handleStop" />
      </template>

      <!-- Paused (stopped mid-run): Resume + Generate new -->
      <template v-else-if="canResume">
        <Button :label="resumeLabel" icon="pi pi-play" severity="primary" @click="handleResume" />
        <Button :label="t('mockData.generateNewBtn')" icon="pi pi-refresh" severity="secondary" outlined
          @click="handleGenerate" />
      </template>

      <!-- Idle: Generate button -->
      <template v-else>
        <Button :label="t('mockData.generateBtn')" icon="pi pi-bolt" severity="primary"
          class="mock-generator__btn-generate" @click="handleGenerate" />
      </template>

      <!-- Add / Remove / Clear — only when idle and DB has data -->
      <template v-if="isIdle && store.hasData">
        <div class="mock-generator__data-actions">
          <Button :label="t('mockData.addBtn', { count: DEFAULT_ADD_COUNT.toLocaleString() })" icon="pi pi-plus"
            severity="secondary" outlined size="small" @click="handleAdd" />
          <Button :label="t('mockData.removeBtn', { count: DEFAULT_REMOVE_COUNT.toLocaleString() })" icon="pi pi-minus"
            severity="secondary" outlined size="small" :disabled="store.totalCount < DEFAULT_REMOVE_COUNT"
            @click="handleRemove" />
          <Button :label="t('mockData.clearBtn')" icon="pi pi-trash" severity="danger" text size="small"
            @click="handleClear" />
        </div>
      </template>

    </div>
  </div>
</template>

<style scoped>
.mock-generator-card {
  padding: 1.5rem;
  border-radius: 12px;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* ── Header ───────────────────────────────────────────────────────────── */
.mock-generator__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mock-generator__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-color);
}

.mock-generator__desc {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

/* ── Progress ──────────────────────────────────────────────────────────── */
.mock-generator__progress {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mock-generator__progress-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  flex-wrap: wrap;
}

.mock-generator__status-label {
  font-weight: 600;
  color: var(--primary-color);
}

.mock-generator__progress-fraction {
  color: var(--text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.mock-generator__progress-pct {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-color);
}

.mock-generator__bar {
  height: 10px;
  border-radius: 5px;
}

.mock-generator__bar--paused :deep(.p-progressbar-value) {
  background: var(--surface-400, #94a3b8);
}

/* ── Total pill ────────────────────────────────────────────────────────── */
.mock-generator__total {
  display: inline-flex;
  align-self: flex-start;
  padding: 0.3rem 0.85rem;
  border-radius: 999px;
  background: var(--primary-50, color-mix(in srgb, var(--primary-color) 10%, transparent));
  color: var(--primary-color);
  font-size: 0.8125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ── Count input row ───────────────────────────────────────────────────── */
.mock-generator__count-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mock-generator__count-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.mock-generator__count-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.mock-generator__count-input :deep(.mock-generator__number-input) {
  width: 10rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* ── Actions ───────────────────────────────────────────────────────────── */
.mock-generator__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.mock-generator__btn-generate {
  flex-shrink: 0;
}

.mock-generator__data-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-left: auto;
}

/* ── Transitions ───────────────────────────────────────────────────────── */
.progress-slide-enter-active,
.progress-slide-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease,
    max-height 0.3s ease;
  overflow: hidden;
  max-height: 200px;
}

.progress-slide-enter-from,
.progress-slide-leave-to {
  opacity: 0;
  transform: translateY(-6px);
  max-height: 0;
}
</style>
