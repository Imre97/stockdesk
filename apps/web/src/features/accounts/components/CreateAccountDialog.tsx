import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateAccountForm } from "../form";

export interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAME_FIELD_ID = "create-account-name";

export function CreateAccountDialog({ open, onOpenChange }: CreateAccountDialogProps) {
  const { t } = useTranslation("accounts");
  const form = useCreateAccountForm(() => onOpenChange(false));

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={NAME_FIELD_ID}>{t("create.nameLabel")}</Label>
            <Input
              autoComplete="off"
              id={NAME_FIELD_ID}
              onChange={(event) => form.setName(event.target.value)}
              value={form.name}
            />
          </div>
          {form.errorKey !== null && (
            <p className="text-sm text-destructive" role="alert">
              {t(form.errorKey)}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              {t("cancel")}
            </Button>
            <Button disabled={form.pending} type="submit">
              {t("create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
