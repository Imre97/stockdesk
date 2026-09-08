import { beforeEach, describe, expect, it } from "vitest";

import { SIDEBAR_STORAGE_KEY, readSidebarCollapsed, useShellStore } from "./store";

beforeEach(() => {
  window.localStorage.clear();
  useShellStore.setState({ sidebarCollapsed: false, drawerOpen: false });
});

describe("readSidebarCollapsed", () => {
  it("returns false when nothing is stored", () => {
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("reads the persisted collapsed flag", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "true");

    expect(readSidebarCollapsed()).toBe(true);
  });

  it("treats a corrupt value as expanded", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "{oops");

    expect(readSidebarCollapsed()).toBe(false);
  });
});

describe("shell store", () => {
  it("persists the collapsed sidebar under the documented key", () => {
    useShellStore.getState().setSidebarCollapsed(true);

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("true");
    expect(useShellStore.getState().sidebarCollapsed).toBe(true);
  });

  it("toggles the sidebar and persists the new state", () => {
    useShellStore.getState().toggleSidebar();
    useShellStore.getState().toggleSidebar();

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("false");
    expect(useShellStore.getState().sidebarCollapsed).toBe(false);
  });

  it("opens and closes the responsive drawer without persisting it", () => {
    useShellStore.getState().setDrawerOpen(true);

    expect(useShellStore.getState().drawerOpen).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();

    useShellStore.getState().setDrawerOpen(false);

    expect(useShellStore.getState().drawerOpen).toBe(false);
  });
});
