import type { OrderTypeValue, TimeInForce } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderFormErrors, VisibleFields } from "../order-form";

export interface OrderTypeFieldsProps {
  type: OrderTypeValue;
  limitPrice: string;
  stopPrice: string;
  timeInForce: TimeInForce;
  visible: VisibleFields;
  errors: OrderFormErrors;
  onTypeChange: (type: OrderTypeValue) => void;
  onLimitPriceChange: (value: string) => void;
  onStopPriceChange: (value: string) => void;
  onTimeInForceChange: (timeInForce: TimeInForce) => void;
}

const TYPE_FIELD_ID = "order-type";
const LIMIT_FIELD_ID = "order-limit-price";
const STOP_FIELD_ID = "order-stop-price";
const TIME_IN_FORCE_FIELD_ID = "order-time-in-force";
const TYPES: OrderTypeValue[] = ["MARKET", "LIMIT", "STOP", "STOP_LIMIT"];
const TIMES_IN_FORCE: TimeInForce[] = ["GTC", "DAY"];

export function OrderTypeFields({
  type,
  limitPrice,
  stopPrice,
  timeInForce,
  visible,
  errors,
  onTypeChange,
  onLimitPriceChange,
  onStopPriceChange,
  onTimeInForceChange,
}: OrderTypeFieldsProps) {
  const { t } = useTranslation("orders");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={TYPE_FIELD_ID}>{t("panel.typeLabel")}</Label>
        <Select onValueChange={(next) => onTypeChange(next as OrderTypeValue)} value={type}>
          <SelectTrigger id={TYPE_FIELD_ID}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`type.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visible.limitPrice && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={LIMIT_FIELD_ID}>{t("panel.limitPriceLabel")}</Label>
          <Input
            autoComplete="off"
            id={LIMIT_FIELD_ID}
            inputMode="decimal"
            onChange={(event) => onLimitPriceChange(event.target.value)}
            value={limitPrice}
          />
          {errors["limitPrice"] !== undefined && (
            <p className="text-xs text-destructive">{t(errors["limitPrice"])}</p>
          )}
        </div>
      )}

      {visible.stopPrice && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={STOP_FIELD_ID}>{t("panel.stopPriceLabel")}</Label>
          <Input
            autoComplete="off"
            id={STOP_FIELD_ID}
            inputMode="decimal"
            onChange={(event) => onStopPriceChange(event.target.value)}
            value={stopPrice}
          />
          {errors["stopPrice"] !== undefined && (
            <p className="text-xs text-destructive">{t(errors["stopPrice"])}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={TIME_IN_FORCE_FIELD_ID}>{t("panel.timeInForceLabel")}</Label>
        <Select onValueChange={(next) => onTimeInForceChange(next as TimeInForce)} value={timeInForce}>
          <SelectTrigger id={TIME_IN_FORCE_FIELD_ID}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMES_IN_FORCE.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`timeInForce.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
