import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { useMarketStatusBadge } from "../../market/hooks";
import type { BuyingPowerShortfall, OrderSummaryView } from "../mappers";

export interface OrderSummaryProps {
  summary: OrderSummaryView | null;
  opensShort: boolean;
  marginRequirement: string | null;
  errorKey: string | null;
  shortfall: BuyingPowerShortfall | null;
}

const MARGIN_DEFICIT_KEY = "orders:errors.MARGIN_DEFICIT";

export function OrderSummary({
  summary,
  opensShort,
  marginRequirement,
  errorKey,
  shortfall,
}: OrderSummaryProps) {
  const { t } = useTranslation(["orders", "shell"]);
  const marketStatus = useMarketStatusBadge();

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
      {summary === null ? (
        <p className="text-xs text-muted-foreground">{t("orders:summary.loading")}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("orders:summary.estimatedCost")}</span>
            <span className="tabular-nums">{summary.estimatedCost}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("orders:summary.buyingPowerAfter")}</span>
            <span className="tabular-nums">{summary.buyingPowerAfter}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("orders:summary.positionEffect")}</span>
            <span>{t(summary.positionEffectKey)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t(summary.expectedExecutionKey)}</p>
          {summary.warningKeys.map((key) => (
            <p className="text-xs text-muted-foreground" key={key}>
              {t(key)}
            </p>
          ))}
        </>
      )}

      {marketStatus !== null && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{t("orders:summary.marketStatus")}</span>
          <span>{t(marketStatus.statusKey, { ns: "shell" })}</span>
        </div>
      )}

      {opensShort && (
        <div className="flex items-center gap-2">
          <Badge variant="outline">{t("orders:summary.short")}</Badge>
          {marginRequirement !== null && (
            <span className="text-xs text-muted-foreground">
              {t("orders:summary.marginRequirement", { amount: marginRequirement })}
            </span>
          )}
        </div>
      )}

      {errorKey !== null && (
        <div className="flex flex-col gap-1 text-sm text-destructive" role="alert">
          <span>{t(errorKey)}</span>
          {shortfall !== null && (
            <span>
              {t("orders:errors.buyingPowerDetails", {
                required: shortfall.required,
                available: shortfall.available,
              })}
            </span>
          )}
          {errorKey === MARGIN_DEFICIT_KEY && (
            <Link className="underline" to="/">
              {t("orders:summary.marginDeficitLink")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
