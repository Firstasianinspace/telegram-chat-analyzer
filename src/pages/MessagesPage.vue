<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import Checkbox from "primevue/checkbox";
import Button from "primevue/button";
import { useChatStore } from "@/modules/chat/presentation/composables/store";
import MessageTableLazy from "@/modules/chat/presentation/components/MessageTableLazy.vue";
import FileUploadCard from "@/modules/chat/presentation/FileUploadCard.vue";
import MockDataGeneratorCard from "@/modules/chat/presentation/components/MockDataGeneratorCard.vue";
import { useMessageTableSession } from "@/modules/chat/presentation/composables/useMessageTableSession";

const chatStore = useChatStore();
const { t } = useI18n();
const {
  typeOptions,
  selectedTypes,
  allSelected,
  columns,
  messageType,
  pageTitle,
  tableKey,
  toggleAll,
} = useMessageTableSession();

// True once the initial checkHasData() has resolved. Gates the onboarding
// screen so a large existing database (checkHasData() takes noticeably
// longer at 1M+ rows) doesn't cause a flash of "no data, please upload"
// before self-correcting — which could otherwise prompt a user to
// re-upload/re-generate on top of data that was there all along.
const isInitialCheckDone = ref(false);

onMounted(async () => {
  try {
    await chatStore.checkHasData();
  } finally {
    isInitialCheckDone.value = true;
  }
});

// Toggle to show/hide mock generator panel when data is already loaded
const showMockGenerator = ref(false);

// Tracks whether the worker is actively generating so we keep the table
// mounted (preventing the flash to the onboarding grid) even after clearData().
const isMockGenerating = ref(false);

/** True whenever the main content area (table + generator panel) should be rendered. */
const showMainContent = computed(
  () => chatStore.hasData || isMockGenerating.value || showMockGenerator.value,
);

function onGenerationStart(): void {
  isMockGenerating.value = true;
  // Always keep the generator panel visible during generation.
  showMockGenerator.value = true;
}

function onGenerationEnd(): void {
  isMockGenerating.value = false;
}

/** Opens the generator panel from the onboarding shortcut card. */
function openGenerator(): void {
  showMockGenerator.value = true;
}
</script>

<template>
  <div class="page-messages">
    <!-- Initial data check in progress — avoids flashing the onboarding
         screen before we know whether a database already exists. -->
    <div v-if="!isInitialCheckDone" class="initial-check">
      <i class="pi pi-spin pi-spinner" />
      <span>{{ t("common.loading") }}</span>
    </div>

    <!--
      Onboarding grid — visible only when there is no data AND the main content
      area hasn't been activated yet.  MockDataGeneratorCard deliberately lives
      in messages-content only (stable mount point) so its composable + worker
      survive any reactive toggle of hasData.
    -->
    <div v-else-if="!showMainContent" class="onboarding-grid">
      <FileUploadCard />

      <!-- Shortcut card: opens the full generator in messages-content -->
      <div class="onboarding-mock-card" @click="openGenerator">
        <span class="onboarding-mock-card__icon pi pi-bolt" />
        <span class="onboarding-mock-card__title">{{
          t("mockData.title")
          }}</span>
        <span class="onboarding-mock-card__desc">{{
          t("mockData.description")
          }}</span>
        <Button :label="t('mockData.generateBtn')" icon="pi pi-bolt" severity="primary"
          class="onboarding-mock-card__btn" @click.stop="openGenerator" />
      </div>
    </div>

    <!--
      Main content — rendered whenever data exists, generation is in progress,
      or the user explicitly opened the generator panel.
      Keeping this alive for the whole session ensures the stable
      MockDataGeneratorCard instance (and its worker) is never torn down.
    -->
    <div v-else-if="showMainContent" class="messages-content">
      <!-- Collapsible mock generator panel toggle -->
      <div class="mock-generator-toggle">
        <Button :icon="showMockGenerator ? 'pi pi-chevron-up' : 'pi pi-database'" :label="t('mockData.title')"
          severity="secondary" text size="small" @click="showMockGenerator = !showMockGenerator" />
      </div>

      <!--
        MockDataGeneratorCard lives here and ONLY here.
        v-show (not v-if) keeps the composable+worker alive even when the
        panel is collapsed, preventing any mid-generation unmount.
      -->
      <MockDataGeneratorCard v-show="showMockGenerator || isMockGenerating" class="mock-generator-inline"
        :store="chatStore" @generation-start="onGenerationStart" @generation-end="onGenerationEnd" />

      <div class="filters-bar">
        <div class="filter-group types-group">
          <label class="filter-label">{{ t("messages.typeFilter") }}</label>
          <div class="type-options">
            <div class="type-option">
              <Checkbox inputId="type-all" name="messageType" :binary="true" :model-value="allSelected"
                @change="toggleAll" />
              <label for="type-all" class="option-label">{{
                t("messages.typeAll")
                }}</label>
            </div>
            <div v-for="option in typeOptions" :key="option.value" class="type-option">
              <Checkbox v-model="selectedTypes" :inputId="`type-${option.value}`" name="messageType"
                :value="option.value" />
              <label :for="`type-${option.value}`" class="option-label">{{
                option.label
                }}</label>
            </div>
          </div>
        </div>
      </div>

      <MessageTableLazy :key="tableKey" :columns="columns" :title="pageTitle" :message-type="messageType"
        :is-generating="isMockGenerating" :data-revision="chatStore.totalCount" />
    </div>
  </div>
</template>

<style scoped>
.page-messages {
  padding: 1rem;
  height: 100%;
}

.initial-check {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 3rem;
  color: var(--text-color-secondary);
}

/* Two-column onboarding grid (upload | mock generator shortcut) */
.onboarding-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  align-items: start;
}

@media (max-width: 768px) {
  .onboarding-grid {
    grid-template-columns: 1fr;
  }
}

/* ── Onboarding shortcut card ──────────────────────────────────────────── */
.onboarding-mock-card {
  padding: 1.5rem;
  border-radius: 12px;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.onboarding-mock-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 1px var(--primary-color);
}

.onboarding-mock-card__icon {
  font-size: 1.75rem;
  color: var(--primary-color);
}

.onboarding-mock-card__title {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-color);
}

.onboarding-mock-card__desc {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.onboarding-mock-card__btn {
  align-self: flex-start;
}

/* Inline mock generator toggle strip */
.mock-generator-toggle {
  display: flex;
  align-items: center;
}

.mock-generator-inline {
  border-radius: 8px;
}

.messages-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.filters-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--surface-border);
  border-radius: 0.5rem;
  background: var(--surface-card);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.85rem;
  color: var(--text-color-secondary);
}

.types-group {
  flex: 1 1 480px;
}

.type-options {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.type-option {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.option-label {
  font-size: 0.9rem;
}
</style>
