import type { Language, Theme } from "@stockdesk/shared";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProfileMenu } from "../hooks";

export interface ProfileMenuProps {
  defaultOpen?: boolean | undefined;
}

const LANGUAGES: readonly Language[] = ["en", "hu"];
const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function ProfileMenu({ defaultOpen }: ProfileMenuProps) {
  const { t } = useTranslation("shell");
  const { displayName, language, theme, setLanguage, setTheme, signOut } = useProfileMenu();

  return (
    <DropdownMenu defaultOpen={defaultOpen ?? false} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button className="gap-2" title={t("profile.menu")} variant="ghost">
          <span className="max-w-40 truncate text-sm font-medium">{displayName}</span>
          <ChevronDownIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("profile.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          onValueChange={setLanguage}
          value={language}
        >
          {LANGUAGES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t(`settings:language.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("profile.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={setTheme} value={theme}>
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {t(`settings:theme.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">{t("profile.settings")}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>{t("profile.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
