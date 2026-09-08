import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { toneClass, type AccountViewModel } from "../../accounts/mappers";

export interface AccountHeaderProps {
  account: AccountViewModel | null;
}

export function AccountHeader({ account }: AccountHeaderProps) {
  const { t } = useTranslation("dashboard");

  if (account === null) return null;

  return (
    <header className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
      <h1 className="text-lg font-semibold">{account.name}</h1>
      <p className="flex items-baseline gap-2 text-sm">
        <span className="text-muted-foreground">{t("accountHeader.equity")}</span>
        <span className="font-medium tabular-nums">{account.equity}</span>
      </p>
      <p className="flex items-baseline gap-2 text-sm">
        <span className="text-muted-foreground">{t("accountHeader.daily")}</span>
        <span className={cn("font-medium tabular-nums", toneClass(account.dailyTone))}>
          {account.dailyPnl}
        </span>
        <span className={cn("tabular-nums", toneClass(account.dailyTone))}>{account.dailyPnlPct}</span>
      </p>
    </header>
  );
}
