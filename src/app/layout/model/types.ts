export interface LayoutConfig {
  menuMode: 'static';
}

export interface LayoutState {
  staticMenuInactive: boolean;
  overlayMenuActive: boolean;
  profileSidebarVisible: boolean;
  configSidebarVisible: boolean;
  mobileMenuActive: boolean;
  sidebarExpanded: boolean;
  menuHoverActive: boolean;
  activeMenuItem: string | undefined;
  activePath: string | undefined;
}
