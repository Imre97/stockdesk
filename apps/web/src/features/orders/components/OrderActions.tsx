import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { OrderRowView } from "../row-mappers";

export interface OrderActionsProps {
  row: OrderRowView;
  onModify: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  onDetails: (orderId: string) => void;
}

export function OrderActions({ row, onModify, onCancel, onDetails }: OrderActionsProps) {
  const { t } = useTranslation("orders");

  if (!row.isActive) {
    return (
      <Button onClick={() => onDetails(row.id)} size="sm" variant="outline">
        {t("actions.details")}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button onClick={() => onModify(row.id)} size="sm" variant="outline">
        {t("actions.modify")}
      </Button>
      <Button onClick={() => onCancel(row.id)} size="sm" variant="outline">
        {t("actions.cancel")}
      </Button>
    </div>
  );
}
