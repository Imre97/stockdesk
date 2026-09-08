import { useTranslation } from "react-i18next";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useChartPrefs, useSymbolPage, useSymbolPageTitle } from "../page-hooks";
import { ChartTypeToggle } from "./ChartTypeToggle";
import { IntervalSelector } from "./IntervalSelector";
import { PriceChart } from "./PriceChart";
import { SidePanel } from "./SidePanel";
import { SymbolHeader } from "./SymbolHeader";
import { SymbolPositionPanel } from "./SymbolPositionPanel";
import { SymbolTradesPanel } from "./SymbolTradesPanel";

export interface SymbolPageProps {
  symbol: string;
}

const POSITION_TAB = "position";
const TRADES_TAB = "trades";

export function SymbolPage({ symbol }: SymbolPageProps) {
  const { t } = useTranslation("market");
  const { header, detail } = useSymbolPage(symbol);
  const { interval, chartType, setInterval, setChartType } = useChartPrefs();

  useSymbolPageTitle(symbol);

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <SymbolHeader view={header} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <IntervalSelector onChange={setInterval} value={interval} />
          <ChartTypeToggle onChange={setChartType} value={chartType} />
        </div>
        <PriceChart chartType={chartType} interval={interval} symbol={symbol} />
        <Tabs defaultValue={POSITION_TAB}>
          <TabsList>
            <TabsTrigger value={POSITION_TAB}>{t("tabs.position")}</TabsTrigger>
            <TabsTrigger value={TRADES_TAB}>{t("tabs.trades")}</TabsTrigger>
          </TabsList>
          <TabsContent value={POSITION_TAB}>
            <SymbolPositionPanel symbol={symbol} />
          </TabsContent>
          <TabsContent value={TRADES_TAB}>
            <SymbolTradesPanel symbol={symbol} />
          </TabsContent>
        </Tabs>
      </div>
      <div className="w-full shrink-0 xl:w-[320px]">
        <SidePanel detail={detail} symbol={symbol} />
      </div>
    </div>
  );
}
