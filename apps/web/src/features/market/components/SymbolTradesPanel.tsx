import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toneClass } from "../../accounts/mappers";
import { useSymbolTradeRows } from "../page-hooks";

export interface SymbolTradesPanelProps {
  symbol: string;
}

const COLUMNS = [
  "trades.columns.executedAt",
  "trades.columns.side",
  "trades.columns.quantity",
  "trades.columns.price",
  "trades.columns.amount",
  "trades.columns.realizedPnl",
] as const;

export function SymbolTradesPanel({ symbol }: SymbolTradesPanelProps) {
  const { t } = useTranslation("market");
  const { rows, hasMore, loadMore } = useSymbolTradeRows(symbol);

  if (rows.length === 0) {
    return <p className="px-2 py-6 text-sm text-muted-foreground">{t("trades.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
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
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{row.executedAt}</TableCell>
              <TableCell>{t(row.sideKey)}</TableCell>
              <TableCell className="tabular-nums">{row.quantity}</TableCell>
              <TableCell className="tabular-nums">{row.price}</TableCell>
              <TableCell className={cn("tabular-nums", toneClass(row.amountTone))}>{row.amount}</TableCell>
              <TableCell className={cn("tabular-nums", toneClass(row.realizedTone))}>
                {row.realizedPnl ?? t("stats.missing")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasMore && (
        <Button className="self-start" onClick={loadMore} size="sm" variant="outline">
          {t("trades.loadMore")}
        </Button>
      )}
    </div>
  );
}
