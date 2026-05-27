<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <div class="layout-footer">
    <a href="https://arabdaev.com" target="_blank" rel="noopener noreferrer"
      class="text-primary font-bold hover:underline">{{ t('layout.footerLink') }}</a>
  </div>
</template>

<style scoped></style>