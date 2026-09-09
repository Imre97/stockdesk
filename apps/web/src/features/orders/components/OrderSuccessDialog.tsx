import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OrderSuccessView } from "../mappers";

export interface OrderSuccessDialogProps {
  view: OrderSuccessView | null;
  onClose: () => void;
}

export function OrderSuccessDialog({ view, onClose }: OrderSuccessDialogProps) {
  const { t } = useTranslation("orders");

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open={view !== null}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("success.title")}</DialogTitle>
          <DialogDescription>
            {view === null ? "" : t(view.statusKey, view.statusValues)}
          </DialogDescription>
        </DialogHeader>
        {view !== null && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("success.quantity")}</span>
              <span className="tabular-nums">{view.quantity}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t(view.costLabelKey)}</span>
              <span className="tabular-nums">{view.cost}</span>
            </div>
            {view.children.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-border pt-2">
                <span className="text-muted-foreground">{t("success.children")}</span>
                {view.children.map((child) => (
                  <div className="flex items-center justify-between gap-2" key={child.roleKey}>
                    <span>{t(child.roleKey)}</span>
                    <span className="tabular-nums">{child.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button asChild variant="outline">
            <Link to="/orders">{t("success.viewOrders")}</Link>
          </Button>
          <Button onClick={onClose}>{t("success.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
