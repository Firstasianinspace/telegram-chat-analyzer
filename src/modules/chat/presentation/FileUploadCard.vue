<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import FileUpload from 'primevue/fileupload';
import ProgressBar from 'primevue/progressbar';
import Message from 'primevue/message';
import { useFileUpload } from '@/modules/chat/presentation/composables/useFileUpload';
import { useChatStore } from '@/modules/chat/presentation/composables/store';
import { createChatIngestionSession } from '@/modules/chat/application/useCases/chatIngestionSession';

const chatStore = useChatStore();
const { t } = useI18n();
const { isUploading, uploadProgress, uploadError, parsingStage, parseFileStreaming, reset } = useFileUpload();

const ingestionSession = createChatIngestionSession(
  {
    parseFileStreaming,
    reset,
  },
  {
    clearData: () => chatStore.clearData(),
    appendMessages: (messages) => chatStore.appendMessages(messages),
    finalize: () => chatStore.checkHasData().then(() => {}),
  },
);

const emit = defineEmits<{
  (e: 'upload-complete'): void;
}>();

async function onFileSelect(event: { files: File[] }): Promise<void> {
  const file = event.files[0];
  if (!file) return;

  try {
    await ingestionSession.ingestFile(file);
    emit('upload-complete');
  } catch (error) {
    console.error('Upload failed:', error);
  }
}

function handleClearData(): void {
  if (confirm(t('chat.clearDataConfirm'))) {
    chatStore.clearData();
  }
}

const stageText = {
  reading: 'chat.stageReading',
  parsing: 'chat.stageParsing',
  saving: 'chat.stageSaving',
  complete: 'chat.stageComplete',
};
</script>

<template>
  <div class="upload-container">
    <div class="upload-header">
      <h2>{{ t('chat.uploadTitle') }}</h2>
      <p>{{ t('chat.uploadDescription') }}</p>
    </div>

    <div v-if="uploadError" class="mb-4">
      <Message severity="error" :closable="true" @close="reset">
        {{ uploadError }}
      </Message>
    </div>

    <div v-if="!chatStore.hasData" class="upload-section">
      <FileUpload mode="basic" name="telegram-export" accept=".json" :auto="true"
        :disabled="isUploading || chatStore.isSaving" @select="onFileSelect" :choose-label="t('chat.selectJsonFile')"
        class="mb-4" />

      <div v-if="isUploading || chatStore.isSaving">
        <p class="stage-text">{{ t(stageText[parsingStage]) }}</p>
        <ProgressBar :value="isUploading ? uploadProgress : chatStore.saveProgress" class="mb-2" />
        <p v-if="chatStore.isSaving" class="text-sm text-color-secondary">
          {{ t('chat.savingMessages', { count: chatStore.totalCount.toLocaleString() }) }}
        </p>
      </div>
    </div>

    <div v-else class="data-info">
      <Message severity="success">
        <div class="flex items-center justify-between w-full">
          <div>
            <strong>{{ t('chat.dataLoaded') }}</strong> {{ chatStore.stats.total.toLocaleString() }} {{
              t('common.messages') }}
          </div>
          <Button :label="t('chat.clearData')" severity="danger" size="small" outlined @click="handleClearData" />
        </div>
      </Message>

      <div class="stats-grid mt-4">
        <div class="stat-card">
          <div class="stat-label">{{ t('chat.statText') }}</div>
          <div class="stat-value">{{ chatStore.stats.text.toLocaleString() }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('chat.statPhotos') }}</div>
          <div class="stat-value">{{ chatStore.stats.photos.toLocaleString() }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('chat.statVideos') }}</div>
          <div class="stat-value">{{ chatStore.stats.videos.toLocaleString() }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('chat.statAudio') }}</div>
          <div class="stat-value">{{ chatStore.stats.audio.toLocaleString() }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('chat.statStickers') }}</div>
          <div class="stat-value">{{ chatStore.stats.stickers.toLocaleString() }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">{{ t('chat.statService') }}</div>
          <div class="stat-value">{{ chatStore.stats.service.toLocaleString() }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.upload-container {
  padding: 2rem;
}

.upload-header h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.75rem;
  font-weight: 600;
}

.upload-header p {
  margin: 0;
  color: var(--text-color-secondary);
}

.upload-section {
  margin-top: 2rem;
}

.stage-text {
  margin: 1rem 0 0.5rem 0;
  font-weight: 500;
  color: var(--text-color);
}

.data-info {
  margin-top: 2rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.stat-card {
  padding: 1rem;
  border-radius: 8px;
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--text-color-secondary);
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--primary-color);
}
</style>
