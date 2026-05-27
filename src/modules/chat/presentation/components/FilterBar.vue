<script setup lang="ts">
/**
 * @fileoverview FilterBar component for analytics dashboard
 * @component FilterBar
 * 
 * Reusable filter UI component that orchestrates:
 * - Date range picker (PrimeVue Calendar)
 * - Message type dropdown (PrimeVue Dropdown)
 * - Clear/reset actions
 * 
 * Integrates with useFilterBar composable for state management and URL sync.
 * All state lives in the composable; this component is pure presentation.
 */

import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Calendar from 'primevue/calendar';
import Dropdown from 'primevue/dropdown';
import Button from 'primevue/button';
import { useFilterBar } from '@/modules/chat/presentation/composables/useFilterBar';
import type { MessageType } from '@/modules/chat/domain/entities/types';

// =============================================================================
// Props & Emits
// =============================================================================

/**
 * Component can be used standalone (manages its own state via useFilterBar)
 * or controlled externally via v-model (not implemented yet for simplicity).
 */
const {
  hideDateRange = false,
  hideType = false,
} = defineProps<{
  /**
   * Optional: hide certain filter controls.
   */
  hideDateRange?: boolean;
  hideType?: boolean;
}>();

// =============================================================================
// State & Data
// =============================================================================

const { filters, resetFilters, clearFilters, hasActiveFilters } = useFilterBar();
const { t } = useI18n();

/**
 * Message type options for dropdown.
 */
const typeOptions = computed<Array<{ label: string; value: MessageType | undefined }>>(() => [
  { label: t('filters.allTypesOption'), value: undefined },
  { label: t('messages.text'), value: 'text' },
  { label: t('messages.voice'), value: 'voice' },
  { label: t('messages.video'), value: 'video' },
  { label: t('messages.photo'), value: 'photo' },
  { label: t('messages.sticker'), value: 'sticker' },
  { label: t('messages.animation'), value: 'animation' },
  { label: t('messages.service'), value: 'service' },
]);

// =============================================================================
// Computed
// =============================================================================

/**
 * Date range as array for PrimeVue Calendar (expects [Date, Date] or null).
 */
const dateRangeArray = computed({
  get: () => {
    const { start, end } = filters.value.dateRange;
    if (!start && !end) return;
    // eslint-disable-next-line unicorn/no-null -- PrimeVue Calendar requires null in array items
    return [start ?? null, end ?? null] as [Date | null, Date | null];
  },
  set: (range: [Date | null, Date | null] | undefined) => {
    filters.value.dateRange = range ? {
        start: range[0] ?? undefined,
        end: range[1] ?? undefined,
      } : { start: undefined, end: undefined };
  },
});

/**
 * Selected message type (two-way binding).
 */
const selectedType = computed({
  get: () => filters.value.type,
  set: (value: MessageType | undefined) => {
    filters.value.type = value;
  },
});
</script>

<template>
  <div class="filter-bar">
    <div class="filter-bar__header">
      <h3 class="filter-bar__title">{{ t('filters.title') }}</h3>
      <div class="filter-bar__actions">
        <Button v-if="hasActiveFilters" :label="t('filters.clear')" icon="pi pi-times" severity="secondary" text
          size="small" @click="clearFilters" />
        <Button :label="t('filters.resetLast30Days')" icon="pi pi-refresh" severity="secondary" text size="small"
          @click="resetFilters" />
      </div>
    </div>

    <div class="filter-bar__controls">
      <!-- Date Range Picker -->
      <div v-if="!hideDateRange" class="filter-control">
        <label for="filter-daterange" class="filter-label">{{ t('filters.dateRange') }}</label>
        <Calendar id="filter-daterange" v-model="dateRangeArray" selection-mode="range" :manual-input="false"
          date-format="yy-mm-dd" show-icon icon-display="input" :placeholder="t('filters.dateRangePlaceholder')"
          class="filter-input" />
      </div>

      <!-- Message Type Dropdown -->
      <div v-if="!hideType" class="filter-control">
        <label for="filter-type" class="filter-label">{{ t('filters.messageType') }}</label>
        <Dropdown id="filter-type" v-model="selectedType" :options="typeOptions" option-label="label"
          option-value="value" :placeholder="t('filters.allTypes')" class="filter-input" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid var(--surface-border);
  border-radius: 0.5rem;
  background: var(--surface-card);
}

.filter-bar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.filter-bar__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
}

.filter-bar__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-bar__controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

.filter-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.filter-input {
  width: 100%;
}

/* Responsive: stack on small screens */
@media (max-width: 768px) {
  .filter-bar__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .filter-bar__controls {
    grid-template-columns: 1fr;
  }
}
</style>
