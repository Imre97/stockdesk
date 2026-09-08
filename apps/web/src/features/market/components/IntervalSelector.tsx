import { TIMEFRAMES, type Timeframe } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export interface IntervalSelectorProps {
  value: Timeframe;
  onChange: (interval: Timeframe) => void;
}

export function IntervalSelector({ value, onChange }: IntervalSelectorProps) {
  const { t } = useTranslation("market");

  return (
    <div aria-label={t("interval.label")} className="flex flex-wrap gap-1" role="group">
      {TIMEFRAMES.map((timeframe) => (
        <Button
          aria-pressed={timeframe === value}
          key={timeframe}
          onClick={() => onChange(timeframe)}
          size="sm"
          variant={timeframe === value ? "secondary" : "ghost"}
        >
          {t(`interval.${timeframe}`)}
        </Button>
      ))}
    </div>
  );
}
