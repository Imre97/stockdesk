import { useTranslation } from "react-i18next";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toneClass } from "../../accounts/mappers";
import type { PositionViewModel } from "../mappers";

export interface PositionsTableProps {
  rows: PositionViewModel[];
}

const COLUMNS = [
  "positions.symbol",
  "positions.quantity",
  "positions.averageCost",
  "positions.lastPrice",
  "positions.marketValue",
  "positions.unrealizedPnl",
  "positions.unrealizedPnlPct",
  "positions.dailyChange",
  "positions.dailyChangePct",
] as const;

export function PositionsTable({ rows }: PositionsTableProps) {
  const { t } = useTranslation("dashboard");

  if (rows.length === 0) {
    return <p className="px-2 py-6 text-sm text-muted-foreground">{t("positions.empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => (
            <TableHead key={column}>{t(column)}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.symbol}>
            <TableCell className="font-medium">{row.symbol}</TableCell>
            <TableCell className="tabular-nums">{row.quantity}</TableCell>
            <TableCell className="tabular-nums">{row.averageCost}</TableCell>
            <TableCell className="tabular-nums">{row.lastPrice}</TableCell>
            <TableCell className="tabular-nums">{row.marketValue}</TableCell>
            <TableCell className={cn("tabular-nums", toneClass(row.unrealizedTone))}>
              {row.unrealizedPnl}
            </TableCell>
            <TableCell className={cn("tabular-nums", toneClass(row.unrealizedTone))}>
              {row.unrealizedPnlPct}
            </TableCell>
            <TableCell className={cn("tabular-nums", toneClass(row.dailyTone))}>{row.dailyChange}</TableCell>
            <TableCell className={cn("tabular-nums", toneClass(row.dailyTone))}>{row.dailyChangePct}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
