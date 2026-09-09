import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toneClass } from "../../accounts/mappers";
import type { DetailsDrawerView } from "../dialog-hooks";

export interface OrderDetailsDrawerProps {
  view: DetailsDrawerView | null;
}

const TRADE_COLUMNS = [
  "details.tradeColumns.executedAt",
  "details.tradeColumns.side",
  "details.tradeColumns.quantity",
  "details.tradeColumns.price",
  "details.tradeColumns.amount",
  "details.tradeColumns.realizedPnl",
] as const;

export function OrderDetailsDrawer({ view }: OrderDetailsDrawerProps) {
  const { t } = useTranslation("orders");
  const missing = t("table.missing");

  return (
    <Sheet onOpenChange={(open) => (open ? undefined : view?.close())} open={view !== null}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{t("details.title")}</SheetTitle>
          <SheetDescription>
            {view === null
              ? ""
              : t("details.description", {
                  side: t(view.description.sideKey),
                  quantity: view.description.quantity,
                  symbol: view.description.symbol,
                })}
          </SheetDescription>
        </SheetHeader>

        {view !== null && (
          <div className="flex flex-col gap-6 px-4 pb-6">
            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{t("details.order")}</h3>
              {view.fields.map((field) => (
                <div className="flex items-center justify-between gap-2 text-sm" key={field.labelKey}>
                  <span className="text-muted-foreground">{t(field.labelKey)}</span>
                  <span className="tabular-nums">
                    {field.valueKey !== null ? t(field.valueKey) : (field.value ?? missing)}
                  </span>
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{t("details.children")}</h3>
              {view.children.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("details.noChildren")}</p>
              )}
              {view.children.map((child) => (
                <div className="flex items-center justify-between gap-2 text-sm" key={child.id}>
                  <span className="flex items-center gap-2">
                    {child.roleBadgeKey !== null && (
                      <Badge variant="secondary">{t(child.roleBadgeKey)}</Badge>
                    )}
                    <span>{t(child.typeKey)}</span>
                    <span className="text-muted-foreground">{t(child.statusKey)}</span>
                  </span>
                  <span className="tabular-nums">
                    {child.quantity} {child.price ?? missing}
                  </span>
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{t("details.trades")}</h3>
              {view.isLoading && <p className="text-sm text-muted-foreground">{t("details.loading")}</p>}
              {!view.isLoading && view.trades.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("details.noTrades")}</p>
              )}
              {view.trades.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {TRADE_COLUMNS.map((column) => (
                        <TableHead key={column}>{t(column)}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell className="whitespace-nowrap">{trade.executedAt}</TableCell>
                        <TableCell>{t(trade.sideKey)}</TableCell>
                        <TableCell className="tabular-nums">{trade.quantity}</TableCell>
                        <TableCell className="tabular-nums">{trade.price}</TableCell>
                        <TableCell className={cn("tabular-nums", toneClass(trade.amountTone))}>
                          {trade.amount}
                        </TableCell>
                        <TableCell className={cn("tabular-nums", toneClass(trade.realizedTone))}>
                          {trade.realizedPnl ?? missing}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
