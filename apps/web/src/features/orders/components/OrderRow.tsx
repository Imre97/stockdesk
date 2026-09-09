import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { OrderRowView } from "../row-mappers";
import { OrderActions } from "./OrderActions";

export interface OrderRowProps {
  row: OrderRowView;
  expanded: boolean;
  isChild: boolean;
  onToggle: (orderId: string) => void;
  onModify: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onDetails: (orderId: string) => void;
}

export function OrderRow({
  row,
  expanded,
  isChild,
  onToggle,
  onModify,
  onCancel,
  onDetails,
}: OrderRowProps) {
  const { t } = useTranslation("orders");
  const missing = t("table.missing");

  return (
    <TableRow className={cn(isChild && "bg-muted/40")} data-order-id={row.id}>
      <TableCell className="w-8 p-1">
        {row.isEntryWithChildren && (
          <Button
            aria-expanded={expanded}
            aria-label={t(expanded ? "table.collapse" : "table.expand", { symbol: row.symbol })}
            onClick={() => onToggle(row.id)}
            size="icon"
            variant="ghost"
          >
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </Button>
        )}
        {row.parentOrderId !== null && (
          <Button
            className="h-auto p-0 text-xs"
            onClick={() => onDetails(row.parentOrderId ?? "")}
            variant="link"
          >
            {t("table.parentLink")}
          </Button>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">{row.createdAt}</TableCell>
      <TableCell>{row.accountName ?? missing}</TableCell>
      <TableCell>
        <span className="flex items-center gap-1">
          <span className="font-medium">{row.symbol}</span>
          {row.roleBadgeKey !== null && <Badge variant="secondary">{t(row.roleBadgeKey)}</Badge>}
        </span>
      </TableCell>
      <TableCell>{t(row.sideKey)}</TableCell>
      <TableCell>{t(row.typeKey)}</TableCell>
      <TableCell className="tabular-nums">{row.quantity}</TableCell>
      <TableCell className="tabular-nums">{row.limitPrice ?? missing}</TableCell>
      <TableCell className="tabular-nums">{row.stopPrice ?? missing}</TableCell>
      <TableCell>{t(row.statusKey)}</TableCell>
      <TableCell className="tabular-nums">{row.filledPrice ?? missing}</TableCell>
      <TableCell className="whitespace-nowrap">{row.filledAt ?? missing}</TableCell>
      <TableCell>{t(row.timeInForceKey)}</TableCell>
      <TableCell>
        <OrderActions onCancel={onCancel} onDetails={onDetails} onModify={onModify} row={row} />
      </TableCell>
    </TableRow>
  );
}
