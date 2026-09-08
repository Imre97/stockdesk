import type { TradeSide } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OrderSlotPlaceholderProps {
  symbol: string;
  side: TradeSide;
  onBack: () => void;
}

const SIDE_CLASSES: Record<TradeSide, string> = {
  BUY: "bg-gain/15 text-gain",
  SELL: "bg-loss/15 text-loss",
};

export function OrderSlotPlaceholder({ symbol, side, onBack }: OrderSlotPlaceholderProps) {
  const { t } = useTranslation("market");

  return (
    <section
      aria-label={t("orderSlot.title")}
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{t("orderSlot.title")}</span>
        <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", SIDE_CLASSES[side])}>
          {t(`trades.side.${side}`)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{symbol}</p>
      <p className="text-sm text-muted-foreground">{t("orderSlot.placeholder")}</p>
      <Button onClick={onBack} size="sm" variant="outline">
        {t("side.back")}
      </Button>
    </section>
  );
}
