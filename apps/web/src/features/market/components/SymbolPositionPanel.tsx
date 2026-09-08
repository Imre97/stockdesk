import { useTranslation } from "react-i18next";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toneClass } from "../../accounts/mappers";
import { useSymbolPosition } from "../page-hooks";

export interface SymbolPositionPanelProps {
  symbol: string;
}

const COLUMNS = [
  "position.columns.quantity",
  "position.columns.averageCost",
  "position.columns.lastPrice",
  "position.columns.marketValue",
  "position.columns.unrealizedPnl",
  "position.columns.dailyChange",
] as const;

export function SymbolPositionPanel({ symbol }: SymbolPositionPanelProps) {
  const { t } = useTranslation("market");
  const row = useSymbolPosition(symbol);

  if (row === null) {
    return <p className="px-2 py-6 text-sm text-muted-foreground">{t("position.empty")}</p>;
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
        <TableRow>
          <TableCell className="tabular-nums">{row.quantity}</TableCell>
          <TableCell className="tabular-nums">{row.averageCost}</TableCell>
          <TableCell className="tabular-nums">{row.lastPrice}</TableCell>
          <TableCell className="tabular-nums">{row.marketValue}</TableCell>
          <TableCell className={cn("tabular-nums", toneClass(row.unrealizedTone))}>
            {row.unrealizedPnl}
          </TableCell>
          <TableCell className={cn("tabular-nums", toneClass(row.dailyTone))}>{row.dailyChange}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
