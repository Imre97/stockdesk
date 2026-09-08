import type { Theme } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ThemeSwitchProps {
  value: Theme;
  onChange: (value: string) => void;
}

const FIELD_ID = "settings-theme";
const OPTIONS: readonly Theme[] = ["light", "dark", "system"];

export function ThemeSwitch({ value, onChange }: ThemeSwitchProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={FIELD_ID}>{t("theme.label")}</Label>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger id={FIELD_ID}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`theme.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
