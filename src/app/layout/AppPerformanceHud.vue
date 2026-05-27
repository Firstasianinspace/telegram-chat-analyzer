<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppPerformanceHud } from './composables/useAppPerformanceHud';

const { t } = useI18n();

const {
  fps,
  frameTimeMs,
  fpsTone,
  longTaskCount,
  longTaskDurationMs,
  usedHeapMb,
  heapLimitMb,
  hasLongTaskSupport,
  hasMemorySupport,
} = useAppPerformanceHud();

const longTaskDurationLabel = computed(() => Number(longTaskDurationMs.value.toFixed(0)));
const heapLabel = computed(() => {
  if (!hasMemorySupport.value || usedHeapMb.value === undefined) {
    return t('common.na');
  }

  if (heapLimitMb.value === undefined) {
    return t('perfHud.heapUsed', { used: usedHeapMb.value });
  }

  return t('perfHud.heapUsedOfLimit', {
    used: usedHeapMb.value,
    limit: heapLimitMb.value,
  });
});
</script>

<template>
  <aside class="perf-hud" aria-live="polite" :aria-label="t('perfHud.ariaLabel')">
    <div class="perf-hud__row">
      <span class="perf-hud__label">{{ t('perfHud.fps') }}</span>
      <strong class="perf-hud__value" :class="`perf-hud__value--${fpsTone}`">{{ fps }}</strong>
    </div>

    <div class="perf-hud__row">
      <span class="perf-hud__label">{{ t('perfHud.frame') }}</span>
      <strong class="perf-hud__value">{{ t('perfHud.frameMs', { value: frameTimeMs }) }}</strong>
    </div>

    <div class="perf-hud__row">
      <span class="perf-hud__label">{{ t('perfHud.longTasks') }}</span>
      <strong class="perf-hud__value">
        <template v-if="hasLongTaskSupport">{{ t('perfHud.longTaskValue', { count: longTaskCount, duration: longTaskDurationLabel }) }}</template>
        <template v-else>{{ t('common.na') }}</template>
      </strong>
    </div>

    <div class="perf-hud__row">
      <span class="perf-hud__label">{{ t('perfHud.heap') }}</span>
      <strong class="perf-hud__value">{{ heapLabel }}</strong>
    </div>
  </aside>
</template>

<style scoped>
.perf-hud {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 1200;
  width: 220px;
  padding: 0.7rem 0.8rem;
  border: 1px solid color-mix(in srgb, var(--surface-border) 70%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-card) 88%, transparent);
  backdrop-filter: blur(5px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.14);
  pointer-events: none;
  font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
}

.perf-hud__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.perf-hud__row + .perf-hud__row {
  margin-top: 0.35rem;
}

.perf-hud__label {
  color: var(--text-color-secondary);
  font-size: 0.72rem;
  letter-spacing: 0.02em;
}

.perf-hud__value {
  color: var(--text-color);
  font-size: 0.78rem;
  font-weight: 600;
}

.perf-hud__value--good {
  color: #1f9d57;
}

.perf-hud__value--warn {
  color: #d48806;
}

.perf-hud__value--bad {
  color: #cf1322;
}

@media (max-width: 768px) {
  .perf-hud {
    right: 0.5rem;
    bottom: 0.5rem;
    width: 188px;
  }
}
</style>
