import type { SymbolDetail } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useSidePanel } from "../page-hooks";
import { KeyStats } from "./KeyStats";
import { OrderSlotPlaceholder } from "./OrderSlotPlaceholder";

export interface SidePanelProps {
  symbol: string;
  detail: SymbolDetail | null;
}

const BUY_CLASS = "flex-1 bg-gain text-white hover:bg-gain/90";
const SELL_CLASS = "flex-1 bg-loss text-white hover:bg-loss/90";

export function SidePanel({ symbol, detail }: SidePanelProps) {
  const { t } = useTranslation("market");
  const panel = useSidePanel();

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div className="flex gap-2">
        <Button className={BUY_CLASS} onClick={() => panel.openOrder("BUY")}>
          {t("side.buy")}
        </Button>
        <Button className={SELL_CLASS} onClick={() => panel.openOrder("SELL")}>
          {t("side.sell")}
        </Button>
      </div>
      {panel.mode === "order" && panel.side !== null ? (
        <OrderSlotPlaceholder onBack={panel.back} side={panel.side} symbol={symbol} />
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("stats.title")}</h2>
          <KeyStats detail={detail} />
        </section>
      )}
    </div>
  );
}
