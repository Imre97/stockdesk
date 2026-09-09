import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OrdersTableView } from "../page-hooks";
import { OrderRow } from "./OrderRow";

export interface OrdersTableProps {
  view: OrdersTableView;
  onModify: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onDetails: (orderId: string) => void;
}

const COLUMNS = [
  "table.columns.createdAt",
  "table.columns.account",
  "table.columns.symbol",
  "table.columns.side",
  "table.columns.type",
  "table.columns.quantity",
  "table.columns.limitPrice",
  "table.columns.stopPrice",
  "table.columns.status",
  "table.columns.filledPrice",
  "table.columns.filledAt",
  "table.columns.timeInForce",
  "table.columns.actions",
] as const;

const SPAN = COLUMNS.length + 1;

export function OrdersTable({ view, onModify, onCancel, onDetails }: OrdersTableProps) {
  const { t } = useTranslation("orders");

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              {COLUMNS.map((column) => (
                <TableHead key={column}>{t(column)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.groups.length === 0 && (
              <TableRow>
                <TableCell className="py-6 text-sm text-muted-foreground" colSpan={SPAN}>
                  {t(view.isLoading ? "table.loading" : "table.empty")}
                </TableCell>
              </TableRow>
            )}
            {view.groups.map((group) => (
              <Fragment key={group.row.id}>
                <OrderRow
                  expanded={group.expanded}
                  isChild={false}
                  onCancel={onCancel}
                  onDetails={onDetails}
                  onModify={onModify}
                  onToggle={view.toggle}
                  row={group.row}
                />
                {group.expanded &&
                  group.children.map((child) => (
                    <OrderRow
                      expanded={false}
                      isChild
                      key={child.id}
                      onCancel={onCancel}
                      onDetails={onDetails}
                      onModify={onModify}
                      onToggle={view.toggle}
                      row={child}
                    />
                  ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      {view.hasMore && (
        <Button className="self-start" onClick={view.loadMore} size="sm" variant="outline">
          {t("table.loadMore")}
        </Button>
      )}
    </div>
  );
}
