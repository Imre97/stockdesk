import { create } from "zustand";

export const SIDEBAR_STORAGE_KEY = "stockdesk.sidebarCollapsed";

const COLLAPSED_VALUE = "true";
const EXPANDED_VALUE = "false";

export interface ShellState {
  sidebarCollapsed: boolean;
  drawerOpen: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setDrawerOpen: (open: boolean) => void;
}

export function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === COLLAPSED_VALUE;
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? COLLAPSED_VALUE : EXPANDED_VALUE);
  } catch {
    return;
  }
}

export const useShellStore = create<ShellState>((set, get) => ({
  sidebarCollapsed: readSidebarCollapsed(),
  drawerOpen: false,

  setSidebarCollapsed: (collapsed) => {
    writeSidebarCollapsed(collapsed);
    set({ sidebarCollapsed: collapsed });
  },

  toggleSidebar: () => get().setSidebarCollapsed(!get().sidebarCollapsed),

  setDrawerOpen: (open) => set({ drawerOpen: open }),
}));
