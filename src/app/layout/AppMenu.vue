<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AppMenuItem from './AppMenuItem.vue';

const { t } = useI18n();

const model = [
  {
    label: t('menu.analytics'),
    items: [
      {
        label: t('menu.charts'),
        icon: 'pi pi-fw pi-chart-bar',
        to: '/charts'
      }
    ]
  },
  {
    label: t('menu.messages'),
    items: [
      {
        label: t('menu.allMessages'),
        icon: 'pi pi-fw pi-inbox',
        to: '/messages'
      },
    ]
  },
  {
    label: t('menu.service'),
    items: [
      {
        label: t('menu.calls'),
        icon: 'pi pi-fw pi-phone',
        to: '/service/calls'
      },
    ]
  },
  {
    label: t('menu.settings'),
    items: [
      {
        label: t('menu.database'),
        icon: 'pi pi-fw pi-cog',
        to: '/settings'
      },
    ]
  },
]
</script>

<template>
  <ul class="layout-menu">
    <template v-for="(item, i) in model" :key="item.label || i">
      <AppMenuItem v-if="!('separator' in item)" :key="item.label || i" :item="item"></AppMenuItem>
      <li v-else class="menu-separator" :key="'sep_' + i"></li>
    </template>
  </ul>
</template>

<style lang="scss" scoped></style>