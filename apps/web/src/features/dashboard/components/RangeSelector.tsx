import type { EquityRange } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { EQUITY_RANGES } from "../hooks";

export interface RangeSelectorProps {
  value: EquityRange;
  onChange: (range: EquityRange) => void;
}

const RANGE_LABEL_KEYS: Record<EquityRange, string> = {
  "1D": "equityChart.range.oneDay",
  "5D": "equityChart.range.fiveDays",
  "1W": "equityChart.range.oneWeek",
  "1M": "equityChart.range.oneMonth",
  "1Y": "equityChart.range.oneYear",
};

export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  const { t } = useTranslation("dashboard");

  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-[3px]" role="group">
      {EQUITY_RANGES.map((range) => (
        <button
          aria-pressed={range === value}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            range === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
          )}
          key={range}
          onClick={() => onChange(range)}
          type="button"
        >
          {t(RANGE_LABEL_KEYS[range])}
        </button>
      ))}
    </div>
  );
}
