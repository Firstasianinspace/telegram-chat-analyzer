<script setup lang="ts">
import { useLayout } from './composables/useLayoutState';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const { layoutState, isDesktop, setActivePath, closeMenus, openSubmenu, collapseSubmenu } = useLayout();

interface MenuItem {
  label: string;
  icon?: string;
  to?: string;
  url?: string;
  target?: string;
  path?: string;
  items?: MenuItem[];
  visible?: boolean;
  disabled?: boolean;
  command?: (event: { originalEvent: MouseEvent; item: MenuItem }) => void;
  class?: string;
}

const route = useRoute();

const { item, root = true, parentPath } = defineProps<{
  item: MenuItem;
  root?: boolean;
  parentPath?: string;
}>();

const fullPath = computed<string | undefined>(() => {
  if (!item.path) return;
  return parentPath ? parentPath + item.path : item.path;
});

const isActiveRoute = computed<boolean>(() => {
  if (!item.to || item.items) return false;
  const [itemPath, itemQueryString] = item.to.split('?');
  if (route.path !== itemPath) return false;
  if (!itemQueryString) return Object.keys(route.query).length === 0;
  const itemQuery = Object.fromEntries(new URLSearchParams(itemQueryString));
  return Object.entries(itemQuery).every(([key, value]) => route.query[key] === value);
});

const isActive = computed<boolean>(() => {
  return item.path
    ? (layoutState.activePath?.startsWith(fullPath.value ?? '') ?? false)
    : isActiveRoute.value;
});

const itemClick = (event: MouseEvent, item: MenuItem): void => {
  if (item.disabled) {
    event.preventDefault();
    return;
  }

  if (item.command) {
    item.command({ originalEvent: event, item: item });
  }

  if (item.items) {
    if (isActive.value && layoutState.activePath) {
      collapseSubmenu(item.path ?? '');
    }
    if (!isActive.value || !layoutState.activePath) {
      openSubmenu(fullPath.value);
    }
    return;
  }

  closeMenus();
};

const onMouseEnter = (): void => {
  const canActivateSubmenu = isDesktop() && root && item.items && layoutState.menuHoverActive;
  if (canActivateSubmenu) {
    setActivePath(fullPath.value);
  }
};
</script>

<template>
  <li :class="{ 'layout-root-menuitem': root, 'active-menuitem': isActive }">
    <div v-if="root && item.visible !== false" class="layout-menuitem-root-text">{{ item.label }}
    </div>
    <a v-if="(!item.to || item.items) && item.visible !== false" :href="item.url"
      @click="itemClick($event, item)" :class="item.class" :target="item.target" tabindex="0"
      @mouseenter="onMouseEnter">
      <i :class="item.icon" class="layout-menuitem-icon" />
      <span class="layout-menuitem-text">{{ item.label }}</span>
      <i class="pi pi-fw pi-angle-down layout-submenu-toggler" v-if="item.items" />
    </a>
    <router-link v-if="item.to && !item.items && item.visible !== false"
      @click="itemClick($event, item)" activeClass="" exactActiveClass=""
      :class="[item.class, { 'active-route': isActiveRoute }]" tabindex="0" :to="item.to"
      @mouseenter="onMouseEnter">
      <i :class="item.icon" class="layout-menuitem-icon" />
      <span class="layout-menuitem-text">{{ item.label }}</span>
      <i class="pi pi-fw pi-angle-down layout-submenu-toggler" v-if="item.items" />
    </router-link>
    <Transition v-if="item.items && item.visible !== false" name="layout-submenu">
      <ul v-show="root ? true : isActive" class="layout-submenu">
        <app-menu-item v-for="child in item.items" :key="child.label + '_' + (child.to || child.path)"
          :item="child" :root="false" :parentPath="fullPath" />
      </ul>
    </Transition>
  </li>
</template>