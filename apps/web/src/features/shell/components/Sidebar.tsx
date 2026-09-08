import { useState } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { AccountList } from "../../accounts/components/AccountList";
import { CreateAccountDialog } from "../../accounts/components/CreateAccountDialog";
import { useShellStore } from "../store";
import { SidebarRail } from "./SidebarRail";

export interface SidebarProps {
  collapsible?: boolean;
}

export function Sidebar({ collapsible = true }: SidebarProps) {
  const { t } = useTranslation("shell");
  const collapsed = useShellStore((state) => state.sidebarCollapsed) && collapsible;
  const toggleSidebar = useShellStore((state) => state.toggleSidebar);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-2 border-r border-sidebar-border bg-sidebar py-2">
      <div className="flex items-center justify-between px-2">
        {!collapsed && (
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("sidebar.accounts")}
          </span>
        )}
        {collapsible && (
          <Button
            aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            className="hidden lg:inline-flex"
            onClick={toggleSidebar}
            size="icon"
            variant="ghost"
          >
            {collapsed ? (
              <PanelLeftOpenIcon className="size-4" />
            ) : (
              <PanelLeftCloseIcon className="size-4" />
            )}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1">{collapsed ? <SidebarRail /> : <AccountList />}</div>

      {!collapsed && (
        <div className="px-2">
          <Button className="w-full justify-start gap-2" onClick={() => setCreateOpen(true)} variant="outline">
            <PlusIcon className="size-4" />
            {t("sidebar.newAccount")}
          </Button>
        </div>
      )}

      <CreateAccountDialog onOpenChange={setCreateOpen} open={createOpen} />
    </div>
  );
}
