import { ChevronDownIcon, ChevronRightIcon, PencilIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { toneClass, type AccountViewModel } from "../mappers";

export interface AccountRowProps {
  account: AccountViewModel;
  active: boolean;
  expanded: boolean;
  onSelect: (accountId: string) => void;
  onToggle: (accountId: string) => void;
  onRename?: ((accountId: string) => void) | undefined;
}

export function AccountRow({ account, active, expanded, onSelect, onToggle, onRename }: AccountRowProps) {
  const { t } = useTranslation("accounts");

  return (
    <li className={cn("rounded-md", active && "bg-sidebar-accent")}>
      <div className="flex items-center gap-1 px-1">
        <button
          aria-label={expanded ? t("row.collapse") : t("row.expand")}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => onToggle(account.id)}
          type="button"
        >
          {expanded ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
        </button>
        <button
          aria-current={active ? "true" : "false"}
          className={cn(
            "flex-1 rounded px-1 py-row text-left text-sm font-medium",
            active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground",
          )}
          onClick={() => onSelect(account.id)}
          type="button"
        >
          {account.name}
        </button>
        {onRename !== undefined && (
          <button
            aria-label={t("row.rename")}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            onClick={() => onRename(account.id)}
            type="button"
          >
            <PencilIcon className="size-3.5" />
          </button>
        )}
      </div>
      {expanded && (
        <dl className="grid grid-cols-2 gap-x-2 px-8 pb-1 text-xs">
          <dt className="text-muted-foreground">{t("row.equity")}</dt>
          <dd className="text-right tabular-nums">{account.equity}</dd>
          <dt className="text-muted-foreground">{t("row.unrealized")}</dt>
          <dd className={cn("text-right tabular-nums", toneClass(account.unrealizedTone))}>
            {account.unrealizedPnl}
          </dd>
          <dt className="text-muted-foreground">{t("row.daily")}</dt>
          <dd className={cn("text-right tabular-nums", toneClass(account.dailyTone))}>{account.dailyPnl}</dd>
        </dl>
      )}
    </li>
  );
}
