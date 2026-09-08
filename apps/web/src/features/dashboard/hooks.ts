import { useCallback, useMemo, useState } from "react";
import type { EquityRange } from "@stockdesk/shared";

import { useActiveAccountId, useEquity, usePositions } from "../accounts/hooks";
import { useSettingsLocale } from "../settings/hooks";
import { toEquitySeries, toPositionViewModel, type EquitySeriesPoint, type PositionViewModel } from "./mappers";

export const EQUITY_RANGES: readonly EquityRange[] = ["1D", "5D", "1W", "1M", "1Y"];
export const DEFAULT_EQUITY_RANGE: EquityRange = "1D";

export interface EquityChartData {
  series: EquitySeriesPoint[];
  isEmpty: boolean;
  isLoading: boolean;
}

export interface EquityRangeControls {
  range: EquityRange;
  setRange: (range: EquityRange) => void;
}

export function useEquityRange(): EquityRangeControls {
  const [range, setRangeState] = useState<EquityRange>(DEFAULT_EQUITY_RANGE);
  const setRange = useCallback((next: EquityRange) => setRangeState(next), []);

  return { range, setRange };
}

export function useEquityChartData(range: EquityRange): EquityChartData {
  const accountId = useActiveAccountId();
  const query = useEquity(accountId, range);
  const points = query.data?.points;

  const series = useMemo(() => toEquitySeries(points ?? []), [points]);

  return { series, isEmpty: series.length === 0, isLoading: query.isPending };
}

export function usePositionRows(): PositionViewModel[] {
  const accountId = useActiveAccountId();
  const query = usePositions(accountId);
  const locale = useSettingsLocale();
  const positions = query.data?.positions;

  return useMemo(
    () => (positions ?? []).map((position) => toPositionViewModel(position, locale)),
    [positions, locale],
  );
}
