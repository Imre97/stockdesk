import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccounts } from "../../accounts/hooks";
import { useSettingsForm } from "../form";
import { LanguageSwitch } from "./LanguageSwitch";
import { ThemeSwitch } from "./ThemeSwitch";

const ACCOUNT_FIELD_ID = "settings-default-account";

export function SettingsForm() {
  const { t } = useTranslation("settings");
  const { accounts } = useAccounts();
  const form = useSettingsForm();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    form.save();
  };

  return (
    <form className="flex max-w-md flex-col gap-4" onSubmit={submit}>
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      <LanguageSwitch onChange={form.setLanguage} value={form.language} />
      <ThemeSwitch onChange={form.setTheme} value={form.theme} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={ACCOUNT_FIELD_ID}>{t("defaultAccount.label")}</Label>
        <Select onValueChange={form.setDefaultAccountId} value={form.defaultAccountId ?? ""}>
          <SelectTrigger id={ACCOUNT_FIELD_ID}>
            <SelectValue placeholder={t("defaultAccount.none")} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button className="self-start" disabled={form.pending} type="submit">
        {t("save")}
      </Button>
    </form>
  );
}
