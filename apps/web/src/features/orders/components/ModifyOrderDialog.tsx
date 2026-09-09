import type { TimeInForce } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ModifyDialogView, ModifyTextField } from "../dialog-hooks";

export interface ModifyOrderDialogProps {
  view: ModifyDialogView | null;
}

const TIME_IN_FORCE_FIELD_ID = "modify-time-in-force";
const TIMES_IN_FORCE: TimeInForce[] = ["GTC", "DAY"];

const FIELDS: { field: ModifyTextField; id: string; labelKey: string }[] = [
  { field: "quantity", id: "modify-quantity", labelKey: "modify.quantityLabel" },
  { field: "limitPrice", id: "modify-limit-price", labelKey: "modify.limitPriceLabel" },
  { field: "stopPrice", id: "modify-stop-price", labelKey: "modify.stopPriceLabel" },
  { field: "stopLossPrice", id: "modify-stop-loss-price", labelKey: "modify.stopLossPriceLabel" },
  { field: "takeProfitPrice", id: "modify-take-profit-price", labelKey: "modify.takeProfitPriceLabel" },
];

export function ModifyOrderDialog({ view }: ModifyOrderDialogProps) {
  const { t } = useTranslation("orders");

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : view?.close())} open={view !== null}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("modify.title")}</DialogTitle>
          <DialogDescription>
            {view === null
              ? ""
              : t("modify.description", {
                  side: t(view.description.sideKey),
                  quantity: view.description.quantity,
                  symbol: view.description.symbol,
                })}
          </DialogDescription>
        </DialogHeader>

        {view !== null && (
          <div className="flex flex-col gap-3">
            {FIELDS.filter((entry) => view.editable[entry.field]).map((entry) => (
              <div className="flex flex-col gap-2" key={entry.field}>
                <Label htmlFor={entry.id}>{t(entry.labelKey)}</Label>
                <Input
                  autoComplete="off"
                  id={entry.id}
                  inputMode="decimal"
                  onChange={(event) => view.setValue(entry.field, event.target.value)}
                  value={view.values[entry.field]}
                />
                {view.errors[entry.field] !== undefined && (
                  <p className="text-xs text-destructive">{t(view.errors[entry.field] ?? "")}</p>
                )}
              </div>
            ))}

            {view.editable.timeInForce && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={TIME_IN_FORCE_FIELD_ID}>{t("modify.timeInForceLabel")}</Label>
                <Select
                  onValueChange={(next) => view.setTimeInForce(next as TimeInForce)}
                  value={view.values.timeInForce}
                >
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
            )}

            {view.errorKey !== null && (
              <p className="text-sm text-destructive" role="alert">
                {t(view.errorKey)}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {view?.versionConflict === true && (
            <Button onClick={view.reload} variant="secondary">
              {t("modify.reload")}
            </Button>
          )}
          <Button onClick={() => view?.close()} variant="outline">
            {t("modify.close")}
          </Button>
          <Button disabled={view === null || !view.submittable} onClick={() => view?.submit()}>
            {t("modify.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
