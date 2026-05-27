<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useChatStore } from '@/modules/chat/presentation/composables/store';
import MessageTableLazy from '@/modules/chat/presentation/components/MessageTableLazy.vue';
import FileUploadCard from '@/modules/chat/presentation/FileUploadCard.vue';
import { getColumnsForType } from '@/modules/chat/presentation/composables/tableColumns';

const chatStore = useChatStore();
const columns = getColumnsForType('service');
const { t } = useI18n();

</script>

<template>
  <div class="page-service-calls">
    <FileUploadCard v-if="!chatStore.hasData" />
    <MessageTableLazy v-else :columns="columns" :message-type="['service']" :title="t('messages.serviceCalls')" />
  </div>
</template>

<style scoped>
.page-service-calls {
  padding: 1rem;
  height: 100%;
}
</style>
