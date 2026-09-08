import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRenameAccountForm } from "../form";

export interface RenameAccountDialogProps {
  accountId: string | null;
  currentName: string;
  onOpenChange: (open: boolean) => void;
}

const NAME_FIELD_ID = "rename-account-name";

export function RenameAccountDialog({ accountId, currentName, onOpenChange }: RenameAccountDialogProps) {
  const { t } = useTranslation("accounts");
  const form = useRenameAccountForm(accountId, currentName, () => onOpenChange(false));

  return (
    <Dialog onOpenChange={onOpenChange} open={accountId !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rename.title")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={NAME_FIELD_ID}>{t("rename.nameLabel")}</Label>
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
              {t("rename.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
