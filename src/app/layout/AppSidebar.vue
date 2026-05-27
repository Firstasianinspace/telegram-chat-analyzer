<script setup lang="ts">
import { useLayout } from './composables/useLayoutState';
import { watch, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import { onClickOutside } from '@vueuse/core';
import AppMenu from './AppMenu.vue';

const { setActivePath, closeMenus, setOverlayMenuActive, isDesktop } = useLayout();
const route = useRoute();
const sidebarRef = useTemplateRef<HTMLDivElement>('sidebarRef');

watch(
  () => route.path,
  (newPath: string) => {
    setActivePath(isDesktop() ? undefined : newPath);
    closeMenus();
  },
  { immediate: true }
);

onClickOutside(sidebarRef, () => {
  setOverlayMenuActive(false);
});
</script>

<template>
  <div ref="sidebarRef" class="layout-sidebar">
    <AppMenu />
  </div>
</template>