import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "../../accounts/hooks";
import { useDepositForm } from "../hooks";

const ACCOUNT_FIELD_ID = "deposit-account";
const AMOUNT_FIELD_ID = "deposit-amount";
const NOTE_FIELD_ID = "deposit-note";

export function DepositForm() {
  const { t } = useTranslation("funding");
  const { accounts } = useAccounts();
  const form = useDepositForm();

  return (
    <form className="flex max-w-md flex-col gap-4" onSubmit={form.submit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ACCOUNT_FIELD_ID}>{t("deposit.accountLabel")}</Label>
        <Select onValueChange={form.setAccountId} value={form.accountId ?? ""}>
          <SelectTrigger id={ACCOUNT_FIELD_ID}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {`${account.name} (${account.cash})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={AMOUNT_FIELD_ID}>{t("deposit.amountLabel")}</Label>
        <div className="flex items-center gap-2">
          <Input
            autoComplete="off"
            id={AMOUNT_FIELD_ID}
            inputMode="decimal"
            onChange={(event) => form.setAmount(event.target.value)}
            value={form.amount}
          />
          <span className="text-sm text-muted-foreground">{t("deposit.currency")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={NOTE_FIELD_ID}>{t("deposit.noteLabel")}</Label>
        <Input
          id={NOTE_FIELD_ID}
          onChange={(event) => form.setNote(event.target.value)}
          placeholder={t("deposit.notePlaceholder")}
          value={form.note}
        />
      </div>

      {form.errorKey !== null && (
        <p className="text-sm text-destructive" role="alert">
          {t(form.errorKey)}
        </p>
      )}

      <Button className="self-start" disabled={form.pending} type="submit">
        {t("deposit.submit")}
      </Button>
    </form>
  );
}
