import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { LayoutConfig, LayoutState } from './types';

const DARK_THEME_CLASS = 'p-dark';
const DESKTOP_BREAKPOINT = 991;

function toggleDarkThemeClass(): void {
  document.documentElement.classList.toggle(DARK_THEME_CLASS);
}

function isDesktop(): boolean {
  return window.innerWidth > DESKTOP_BREAKPOINT;
}

function toggleDarkMode(): void {
  if (!document.startViewTransition) {
    toggleDarkThemeClass();
    return;
  }

  document.startViewTransition(toggleDarkThemeClass);
}

export const useLayoutStore = defineStore('layout', () => {
  const layoutConfig = ref<LayoutConfig>({
    menuMode: 'static'
  });

  const layoutState = ref<LayoutState>({
    staticMenuInactive: false,
    overlayMenuActive: false,
    profileSidebarVisible: false,
    configSidebarVisible: false,
    mobileMenuActive: false,
    sidebarExpanded: false,
    menuHoverActive: false,
    activeMenuItem: undefined,
    activePath: undefined
  });

  const isDarkTheme = computed<boolean>(
    () => document.documentElement.classList.contains(DARK_THEME_CLASS),
  );

  const hasOpenOverlay = computed<boolean>(() => layoutState.value.overlayMenuActive);

  function toggleMenu(): void {
    if (isDesktop()) {
      layoutState.value.staticMenuInactive = !layoutState.value.staticMenuInactive;
      return;
    }
    layoutState.value.mobileMenuActive = !layoutState.value.mobileMenuActive;
  }

  function toggleConfigSidebar(): void {
    layoutState.value.configSidebarVisible = !layoutState.value.configSidebarVisible;
  }

  function hideMobileMenu(): void {
    layoutState.value.mobileMenuActive = false;
  }

  function setActivePath(path: string | undefined): void {
    layoutState.value.activePath = path;
  }

  function closeMenus(): void {
    layoutState.value.overlayMenuActive = false;
    layoutState.value.mobileMenuActive = false;
    layoutState.value.menuHoverActive = false;
  }

  function openSubmenu(path: string | undefined): void {
    layoutState.value.activePath = path;
    layoutState.value.menuHoverActive = true;
  }

  function collapseSubmenu(pathSegment: string): void {
    if (layoutState.value.activePath) {
      layoutState.value.activePath = layoutState.value.activePath.replace(pathSegment, '');
    }
  }

  function setOverlayMenuActive(active: boolean): void {
    layoutState.value.overlayMenuActive = active;
  }

  return {
    layoutConfig,
    layoutState,
    isDarkTheme,
    hasOpenOverlay,
    toggleDarkMode,
    toggleConfigSidebar,
    toggleMenu,
    hideMobileMenu,
    isDesktop,
    setActivePath,
    closeMenus,
    openSubmenu,
    collapseSubmenu,
    setOverlayMenuActive,
  };
});
