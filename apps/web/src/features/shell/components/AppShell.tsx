import { Outlet } from "@tanstack/react-router";
import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useShellStore } from "../store";
import { Header } from "./Header";
import { NavTabs } from "./NavTabs";
import { Sidebar } from "./Sidebar";

const EXPANDED_WIDTH = "lg:w-[280px]";
const COLLAPSED_WIDTH = "lg:w-[56px]";

export function AppShell() {
  const { t } = useTranslation("shell");
  const collapsed = useShellStore((state) => state.sidebarCollapsed);
  const drawerOpen = useShellStore((state) => state.drawerOpen);
  const setDrawerOpen = useShellStore((state) => state.setDrawerOpen);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <NavTabs />
      <div className="flex flex-1">
        <aside className={cn("hidden shrink-0 lg:block", collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH)}>
          <Sidebar />
        </aside>
        {drawerOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <button
              aria-label={t("sidebar.closeMenu")}
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
              type="button"
            />
            <div className="relative z-50 w-[280px] bg-sidebar">
              <Button
                aria-label={t("sidebar.closeMenu")}
                className="absolute top-2 right-2"
                onClick={() => setDrawerOpen(false)}
                size="icon"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
              <Sidebar collapsible={false} />
            </div>
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
