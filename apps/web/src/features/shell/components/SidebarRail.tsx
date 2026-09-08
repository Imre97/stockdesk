import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useAccounts } from "../../accounts/hooks";

export function SidebarRail() {
  const { t } = useTranslation("shell");
  const { accounts, activeAccountId, setActiveAccount } = useAccounts();

  return (
    <ul aria-label={t("sidebar.accounts")} className="flex flex-col items-center gap-1 py-2">
      {accounts.map((account) => (
        <li key={account.id}>
          <button
            aria-current={account.id === activeAccountId ? "true" : "false"}
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-xs font-semibold",
              account.id === activeAccountId
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground",
            )}
            onClick={() => setActiveAccount(account.id)}
            title={account.name}
            type="button"
          >
            {account.initials}
          </button>
        </li>
      ))}
    </ul>
  );
}
