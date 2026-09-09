import type { TradeSide } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useOrderPanel } from "../panel-hooks";
import { BracketFields } from "./BracketFields";
import { OrderSuccessDialog } from "./OrderSuccessDialog";
import { OrderSummary } from "./OrderSummary";
import { OrderTypeFields } from "./OrderTypeFields";
import { QuantityInput } from "./QuantityInput";

export interface OrderPanelProps {
  symbol: string;
  side: TradeSide;
  onBack: () => void;
}

const ACCOUNT_FIELD_ID = "order-account";
const SIDES: TradeSide[] = ["BUY", "SELL"];
const SIDE_CLASSES: Record<TradeSide, string> = {
  BUY: "bg-gain text-white hover:bg-gain/90",
  SELL: "bg-loss text-white hover:bg-loss/90",
};

export function OrderPanel({ symbol, side, onBack }: OrderPanelProps) {
  const { t } = useTranslation(["orders", "market"]);
  const panel = useOrderPanel(symbol, side, onBack);
  const { form } = panel;

  return (
    <section
      aria-label={t("market:orderSlot.title")}
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1" role="group">
          {SIDES.map((option) => (
            <Button
              aria-pressed={form.state.side === option}
              className={cn("px-3", form.state.side === option ? SIDE_CLASSES[option] : undefined)}
              key={option}
              onClick={() => form.setSide(option)}
              size="sm"
              variant={form.state.side === option ? "default" : "outline"}
            >
              {t(`market:trades.side.${option}`)}
            </Button>
          ))}
        </div>
        <Button onClick={onBack} size="sm" variant="outline">
          {t("market:side.back")}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={ACCOUNT_FIELD_ID}>{t("orders:panel.accountLabel")}</Label>
        <Select onValueChange={form.selectAccount} value={form.state.accountId ?? ""}>
          <SelectTrigger id={ACCOUNT_FIELD_ID}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {form.accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {t("orders:panel.accountOption", {
                  name: account.name,
                  buyingPower: account.buyingPower,
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <QuantityInput
        errorKey={form.errors[form.state.unit === "usd" ? "amount" : "quantity"] ?? null}
        fractionable={form.inputs.fractionable}
        hint={panel.hint}
        onUnitChange={form.setUnit}
        onValueChange={form.state.unit === "usd" ? form.setAmountInput : form.setQuantityInput}
        unit={form.state.unit}
        value={form.state.unit === "usd" ? form.state.amountInput : form.state.quantityInput}
      />

      <OrderTypeFields
        errors={form.errors}
        limitPrice={form.state.limitPrice}
        onLimitPriceChange={form.setLimitPrice}
        onStopPriceChange={form.setStopPrice}
        onTimeInForceChange={form.setTimeInForce}
        onTypeChange={form.setType}
        stopPrice={form.state.stopPrice}
        timeInForce={form.state.timeInForce}
        type={form.state.type}
        visible={form.visible}
      />

      <BracketFields
        allowed={form.bracketsAllowed}
        errors={form.errors}
        onStopLossPriceChange={form.setStopLossPrice}
        onTakeProfitPriceChange={form.setTakeProfitPrice}
        onToggleStopLoss={form.toggleStopLoss}
        onToggleTakeProfit={form.toggleTakeProfit}
        stopLossEnabled={form.state.stopLossEnabled}
        stopLossPrice={form.state.stopLossPrice}
        takeProfitEnabled={form.state.takeProfitEnabled}
        takeProfitPrice={form.state.takeProfitPrice}
      />

      <OrderSummary
        errorKey={panel.errorKey}
        marginRequirement={panel.marginRequirement}
        opensShort={form.opensShort}
        shortfall={panel.shortfall}
        summary={panel.summary}
      />

      <Button
        className={SIDE_CLASSES[form.state.side]}
        disabled={!form.submittable || panel.pending}
        onClick={panel.submit}
      >
        {t(panel.submitLabel.key, panel.submitLabel.values)}
      </Button>

      <OrderSuccessDialog onClose={panel.closeSuccess} view={panel.success} />
    </section>
  );
}
