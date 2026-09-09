import type { OrdersStatusFilter } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ALL_ACCOUNTS } from "../list-selectors";
import type { AccountOption } from "../page-hooks";

export interface OrdersFiltersProps {
  status: OrdersStatusFilter;
  statuses: readonly OrdersStatusFilter[];
  accountId: string;
  accounts: AccountOption[];
  symbol: string;
  onStatusChange: (status: OrdersStatusFilter) => void;
  onAccountChange: (accountId: string) => void;
  onSymbolChange: (symbol: string) => void;
}

const ACCOUNT_FIELD_ID = "orders-account";
const SYMBOL_FIELD_ID = "orders-symbol";

export function OrdersFilters({
  status,
  statuses,
  accountId,
  accounts,
  symbol,
  onStatusChange,
  onAccountChange,
  onSymbolChange,
}: OrdersFiltersProps) {
  const { t } = useTranslation("orders");

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div
        aria-label={t("filters.statusLabel")}
        className="inline-flex items-center gap-1 rounded-lg bg-muted p-[3px]"
        role="group"
      >
        {statuses.map((option) => (
          <button
            aria-pressed={option === status}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              option === status ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
            key={option}
            onClick={() => onStatusChange(option)}
            type="button"
          >
            {t(`filters.status.${option}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ACCOUNT_FIELD_ID}>{t("filters.accountLabel")}</Label>
        <Select onValueChange={onAccountChange} value={accountId}>
          <SelectTrigger className="w-[200px]" id={ACCOUNT_FIELD_ID}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ACCOUNTS}>{t("filters.allAccounts")}</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={SYMBOL_FIELD_ID}>{t("filters.symbolLabel")}</Label>
        <Input
          autoComplete="off"
          className="w-[160px]"
          id={SYMBOL_FIELD_ID}
          onChange={(event) => onSymbolChange(event.target.value)}
          placeholder={t("filters.symbolPlaceholder")}
          value={symbol}
        />
      </div>
    </div>
  );
}
