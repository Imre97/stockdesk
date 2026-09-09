import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderFormUnit } from "../order-form";
import type { QuantityHint } from "../mappers";

export interface QuantityInputProps {
  unit: OrderFormUnit;
  value: string;
  fractionable: boolean;
  hint: QuantityHint | null;
  errorKey: string | null;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: OrderFormUnit) => void;
}

const QUANTITY_FIELD_ID = "order-quantity";
const UNIT_FIELD_ID = "order-unit";
const UNITS: OrderFormUnit[] = ["shares", "usd"];

export function QuantityInput({
  unit,
  value,
  fractionable,
  hint,
  errorKey,
  onValueChange,
  onUnitChange,
}: QuantityInputProps) {
  const { t } = useTranslation("orders");

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={QUANTITY_FIELD_ID}>{t("panel.quantityLabel")}</Label>
      <div className="flex items-center gap-2">
        <Input
          autoComplete="off"
          className="flex-1"
          id={QUANTITY_FIELD_ID}
          inputMode={unit === "usd" || fractionable ? "decimal" : "numeric"}
          onChange={(event) => onValueChange(event.target.value)}
          value={value}
        />
        <Label className="sr-only" htmlFor={UNIT_FIELD_ID}>
          {t("panel.unitLabel")}
        </Label>
        <Select onValueChange={(next) => onUnitChange(next as OrderFormUnit)} value={unit}>
          <SelectTrigger className="w-[110px]" id={UNIT_FIELD_ID}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNITS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`unit.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {hint !== null && <p className="text-xs text-muted-foreground">{t(hint.key, hint.values)}</p>}
      {errorKey !== null && <p className="text-xs text-destructive">{t(errorKey)}</p>}
    </div>
  );
}
