import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useMarketStatusBadge } from "../hooks";

export function MarketStatusBadge() {
  const { t } = useTranslation("shell");
  const badge = useMarketStatusBadge();

  if (badge === null) return null;

  return (
    <div
      aria-label={t("status.label")}
      className="hidden items-center gap-2 text-xs whitespace-nowrap sm:flex"
      role="status"
    >
      <span aria-hidden className={cn("size-2 rounded-full", badge.isOpen ? "bg-gain" : "bg-neutral")} />
      <span className="font-medium">{t(badge.statusKey)}</span>
      {badge.nextKey !== null && (
        <span className="text-muted-foreground">{t(badge.nextKey, { time: badge.nextTime })}</span>
      )}
    </div>
  );
}
