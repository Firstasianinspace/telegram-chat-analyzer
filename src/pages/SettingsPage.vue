<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import { useChatStore } from '@/modules/chat/presentation/composables/store';

const { t } = useI18n();
const confirm = useConfirm();
const toast = useToast();
const chatStore = useChatStore();

const isProcessing = ref(false);

function handleReset(): void {
  confirm.require({
    message: t('settings.confirmResetMessage'),
    header: t('settings.confirmResetHeader'),
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    acceptLabel: t('settings.confirmResetAccept'),
    rejectLabel: t('common.cancel'),
    accept: async () => {
      isProcessing.value = true;
      try {
        await chatStore.clearData();
        toast.add({
          severity: 'success',
          summary: t('common.success'),
          detail: t('settings.resetSuccess'),
          life: 4000,
        });
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: t('common.error'),
          detail: error instanceof Error ? error.message : t('settings.resetError'),
          life: 6000,
        });
      } finally {
        isProcessing.value = false;
      }
    },
  });
}
</script>

<template>
  <div class="page-settings">
    <div class="settings-header">
      <h2 class="settings-header__title">{{ t('settings.title') }}</h2>
      <p class="settings-header__desc">{{ t('settings.description') }}</p>
    </div>

    <section class="settings-section">
      <h3 class="settings-section__title">
        <i class="pi pi-database" />
        {{ t('settings.databaseSection') }}
      </h3>
      <p class="settings-section__desc">{{ t('settings.databaseDesc') }}</p>

      <div class="settings-section__meta">
        <span class="settings-section__badge">
          {{ t('settings.currentRecords', { count: chatStore.totalCount.toLocaleString() }) }}
        </span>
      </div>

      <div class="settings-section__actions">
        <Button severity="danger" :label="t('settings.resetBtn')" icon="pi pi-trash" :loading="isProcessing"
          :disabled="!chatStore.hasData" @click="handleReset" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.page-settings {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 760px;
}

/* ── Header ─────────────────────────────────────────────────────────── */
.settings-header__title {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-color);
}

.settings-header__desc {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-color-secondary);
}

/* ── Section card ────────────────────────────────────────────────────── */
.settings-section {
  padding: 1.25rem 1.5rem;
  border-radius: 12px;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.settings-section__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.settings-section__desc {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.settings-section__meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.settings-section__badge {
  display: inline-flex;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: var(--surface-100);
  color: var(--text-color-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.settings-section__actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
</style>
