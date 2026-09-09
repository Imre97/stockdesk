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
import type { CancelDialogView } from "../dialog-hooks";

export interface CancelOrderDialogProps {
  view: CancelDialogView | null;
}

export function CancelOrderDialog({ view }: CancelOrderDialogProps) {
  const { t } = useTranslation("orders");

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : view?.close())} open={view !== null}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("cancelDialog.title")}</DialogTitle>
          <DialogDescription>
            {view === null
              ? ""
              : t("cancelDialog.description", {
                  side: t(view.description.sideKey),
                  quantity: view.description.quantity,
                  symbol: view.description.symbol,
                })}
          </DialogDescription>
        </DialogHeader>

        {view?.errorKey != null && (
          <p className="text-sm text-destructive" role="alert">
            {t(view.errorKey)}
          </p>
        )}

        <DialogFooter>
          <Button onClick={() => view?.close()} variant="outline">
            {t("cancelDialog.dismiss")}
          </Button>
          <Button
            disabled={view === null || view.pending}
            onClick={() => view?.confirm()}
            variant="destructive"
          >
            {t("cancelDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
