import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { directionClass, type SymbolHeaderView } from "../header-mappers";

export interface SymbolHeaderProps {
  view: SymbolHeaderView | null;
}

export function SymbolHeader({ view }: SymbolHeaderProps) {
  const { t } = useTranslation("market");

  if (view === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-40" />
      </div>
    );
  }

  const tone = directionClass(view.direction);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-semibold">{view.symbol}</h1>
        <span className="text-sm text-muted-foreground">{view.name}</span>
        <span className="text-xs text-muted-foreground">{view.exchange}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-3">
        <span aria-label={t("header.lastPrice")} className="text-3xl font-semibold tabular-nums">
          {view.priceText ?? t("stats.missing")}
        </span>
        {view.changeText !== null && (
          <span aria-label={t("header.change")} className={cn("text-sm font-medium tabular-nums", tone)}>
            {view.changeText}
          </span>
        )}
        {view.changePctText !== null && (
          <span className={cn("text-sm font-medium tabular-nums", tone)}>{view.changePctText}</span>
        )}
        {view.asOfText !== null && <span className="text-xs text-muted-foreground">{view.asOfText}</span>}
      </div>
    </div>
  );
}
