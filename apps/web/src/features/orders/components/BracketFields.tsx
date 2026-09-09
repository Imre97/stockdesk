import { useTranslation } from "react-i18next";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OrderFormErrors } from "../order-form";

export interface BracketFieldsProps {
  allowed: boolean;
  stopLossEnabled: boolean;
  stopLossPrice: string;
  takeProfitEnabled: boolean;
  takeProfitPrice: string;
  errors: OrderFormErrors;
  onToggleStopLoss: (enabled: boolean) => void;
  onStopLossPriceChange: (value: string) => void;
  onToggleTakeProfit: (enabled: boolean) => void;
  onTakeProfitPriceChange: (value: string) => void;
}

const STOP_LOSS_FIELD_ID = "order-stop-loss";
const STOP_LOSS_PRICE_FIELD_ID = "order-stop-loss-price";
const TAKE_PROFIT_FIELD_ID = "order-take-profit";
const TAKE_PROFIT_PRICE_FIELD_ID = "order-take-profit-price";

export function BracketFields({
  allowed,
  stopLossEnabled,
  stopLossPrice,
  takeProfitEnabled,
  takeProfitPrice,
  errors,
  onToggleStopLoss,
  onStopLossPriceChange,
  onToggleTakeProfit,
  onTakeProfitPriceChange,
}: BracketFieldsProps) {
  const { t } = useTranslation("orders");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={stopLossEnabled}
            disabled={!allowed}
            id={STOP_LOSS_FIELD_ID}
            onCheckedChange={(next) => onToggleStopLoss(next === true)}
          />
          <Label htmlFor={STOP_LOSS_FIELD_ID}>{t("bracket.stopLoss")}</Label>
        </div>
        {stopLossEnabled && (
          <>
            <Label className="sr-only" htmlFor={STOP_LOSS_PRICE_FIELD_ID}>
              {t("bracket.stopLossPriceLabel")}
            </Label>
            <Input
              autoComplete="off"
              id={STOP_LOSS_PRICE_FIELD_ID}
              inputMode="decimal"
              onChange={(event) => onStopLossPriceChange(event.target.value)}
              value={stopLossPrice}
            />
            {errors["stopLossPrice"] !== undefined && (
              <p className="text-xs text-destructive">{t(errors["stopLossPrice"])}</p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={takeProfitEnabled}
            disabled={!allowed}
            id={TAKE_PROFIT_FIELD_ID}
            onCheckedChange={(next) => onToggleTakeProfit(next === true)}
          />
          <Label htmlFor={TAKE_PROFIT_FIELD_ID}>{t("bracket.takeProfit")}</Label>
        </div>
        {takeProfitEnabled && (
          <>
            <Label className="sr-only" htmlFor={TAKE_PROFIT_PRICE_FIELD_ID}>
              {t("bracket.takeProfitPriceLabel")}
            </Label>
            <Input
              autoComplete="off"
              id={TAKE_PROFIT_PRICE_FIELD_ID}
              inputMode="decimal"
              onChange={(event) => onTakeProfitPriceChange(event.target.value)}
              value={takeProfitPrice}
            />
            {errors["takeProfitPrice"] !== undefined && (
              <p className="text-xs text-destructive">{t(errors["takeProfitPrice"])}</p>
            )}
          </>
        )}
      </div>

      {!allowed && <p className="text-xs text-muted-foreground">{t("bracket.notAllowed")}</p>}
    </div>
  );
}
