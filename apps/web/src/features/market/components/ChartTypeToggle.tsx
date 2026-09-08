import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { CHART_TYPES, type ChartType } from "../chart-prefs";

export interface ChartTypeToggleProps {
  value: ChartType;
  onChange: (chartType: ChartType) => void;
}

export function ChartTypeToggle({ value, onChange }: ChartTypeToggleProps) {
  const { t } = useTranslation("market");

  return (
    <div aria-label={t("chartType.label")} className="flex gap-1" role="group">
      {CHART_TYPES.map((chartType) => (
        <Button
          aria-pressed={chartType === value}
          key={chartType}
          onClick={() => onChange(chartType)}
          size="sm"
          variant={chartType === value ? "secondary" : "ghost"}
        >
          {t(`chartType.${chartType}`)}
        </Button>
      ))}
    </div>
  );
}
