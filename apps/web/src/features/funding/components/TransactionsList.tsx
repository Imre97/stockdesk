import { useTranslation } from "react-i18next";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toneClass } from "../../accounts/mappers";
import type { TransactionViewModel } from "../mappers";

export interface TransactionsListProps {
  rows: TransactionViewModel[];
}

export function TransactionsList({ rows }: TransactionsListProps) {
  const { t } = useTranslation("funding");

  if (rows.length === 0) {
    return <p className="px-2 py-6 text-sm text-muted-foreground">{t("transactions.empty")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("transactions.date")}</TableHead>
          <TableHead>{t("transactions.type")}</TableHead>
          <TableHead>{t("transactions.amount")}</TableHead>
          <TableHead>{t("transactions.balanceAfter")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.date}</TableCell>
            <TableCell>{row.type}</TableCell>
            <TableCell className={cn("tabular-nums", toneClass(row.tone))}>{row.amount}</TableCell>
            <TableCell className="tabular-nums">{row.balanceAfter}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
