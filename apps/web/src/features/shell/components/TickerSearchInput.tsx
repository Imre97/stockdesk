import { SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function TickerSearchInput() {
  const { t } = useTranslation("shell");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative w-full max-w-md">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              disabled
              placeholder={t("search.placeholder")}
              readOnly
              type="search"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{t("search.disabledTooltip")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
