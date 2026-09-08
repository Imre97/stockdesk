import { useEffect, useState, type FormEvent } from "react";
import { renameAccountSchema } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toAccountErrorKey } from "../error-keys";
import { useRenameAccount } from "../hooks";

export interface RenameAccountDialogProps {
  accountId: string | null;
  currentName: string;
  onOpenChange: (open: boolean) => void;
}

const NAME_FIELD_ID = "rename-account-name";

export function RenameAccountDialog({ accountId, currentName, onOpenChange }: RenameAccountDialogProps) {
  const { t } = useTranslation("accounts");
  const [name, setName] = useState(currentName);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mutation = useRenameAccount();

  useEffect(() => setName(currentName), [currentName]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setErrorKey(null);

    const parsed = renameAccountSchema.safeParse({ name });

    if (!parsed.success || accountId === null) {
      setErrorKey("errors.generic");
      return;
    }

    mutation.mutate(
      { accountId, name: parsed.data.name },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => setErrorKey(toAccountErrorKey(error)),
      },
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={accountId !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rename.title")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={NAME_FIELD_ID}>{t("rename.nameLabel")}</Label>
            <Input
              autoComplete="off"
              id={NAME_FIELD_ID}
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </div>
          {errorKey !== null && (
            <p className="text-sm text-destructive" role="alert">
              {t(errorKey)}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              {t("cancel")}
            </Button>
            <Button disabled={mutation.isPending} type="submit">
              {t("rename.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
