import { languageSchema, type Language } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface LanguageSwitchProps {
  value: Language;
  onChange: (language: Language) => void;
}

const FIELD_ID = "settings-language";
const OPTIONS: readonly Language[] = ["en", "hu"];

export function LanguageSwitch({ value, onChange }: LanguageSwitchProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={FIELD_ID}>{t("language.label")}</Label>
      <Select onValueChange={(next) => onChange(languageSchema.parse(next))} value={value}>
        <SelectTrigger id={FIELD_ID}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`language.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
