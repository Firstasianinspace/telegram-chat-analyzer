<script setup lang="ts">
import { useLayout } from './composables/useLayoutState';
import { useLanguage } from '@/shared/composables/useLanguage';
import { useI18n } from 'vue-i18n';
import ToggleSwitch from 'primevue/toggleswitch';

const { toggleMenu } = useLayout();
const { isEnglish, toggleLocale } = useLanguage();
const { t } = useI18n();
</script>

<template>
  <div class="layout-topbar">
    <div class="layout-topbar-logo-container">
      <button class="layout-menu-button layout-topbar-action" @click="toggleMenu">
        <i class="pi pi-bars"></i>
      </button>
      <router-link to="/" class="layout-topbar-logo">
        <span>{{ t('layout.appTitle') }}</span>
      </router-link>
    </div>

    <div class="layout-topbar-actions">
      <button class="layout-topbar-menu-button layout-topbar-action"
        v-styleclass="{ selector: '@next', enterFromClass: 'hidden', enterActiveClass: 'p-anchored-overlay-enter-active', leaveToClass: 'hidden', leaveActiveClass: 'p-anchored-overlay-leave-active', hideOnOutsideClick: true }">
        <i class="pi pi-ellipsis-v"></i>
      </button>

      <div class="layout-topbar-menu hidden lg:block">
        <div class="layout-topbar-menu-content">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 0.875rem;">{{ t('layout.langRu') }}</span>
            <ToggleSwitch :model-value="isEnglish" @update:model-value="toggleLocale" />
            <span style="font-size: 0.875rem;">{{ t('layout.langEn') }}</span>
          </div>
          <!-- <button type="button" class="layout-topbar-action">
            <i class="pi pi-user"></i>
            <span>{{ t('layout.profile') }}</span>
          </button> -->
        </div>
      </div>
    </div>
  </div>
</template>