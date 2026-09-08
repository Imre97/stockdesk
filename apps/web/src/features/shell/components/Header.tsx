import { MenuIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { MarketStatusBadge } from "../../market/components/MarketStatusBadge";
import { useShellStore } from "../store";
import { ProfileMenu } from "./ProfileMenu";
import { TickerSearch } from "./TickerSearch";

export function Header() {
  const { t } = useTranslation("shell");
  const setDrawerOpen = useShellStore((state) => state.setDrawerOpen);

  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-2">
      <Button
        aria-label={t("sidebar.openMenu")}
        className="lg:hidden"
        onClick={() => setDrawerOpen(true)}
        size="icon"
        variant="ghost"
      >
        <MenuIcon className="size-4" />
      </Button>
      <span className="text-base font-semibold whitespace-nowrap">{t("brand")}</span>
      <div className="flex flex-1 justify-center">
        <TickerSearch />
      </div>
      <MarketStatusBadge />
      <ProfileMenu />
    </header>
  );
}
