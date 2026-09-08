import { useState, type FormEvent } from "react";
import { createAccountSchema } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateAccount } from "../hooks";
import { toAccountErrorKey } from "../error-keys";

export interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAME_FIELD_ID = "create-account-name";

export function CreateAccountDialog({ open, onOpenChange }: CreateAccountDialogProps) {
  const { t } = useTranslation("accounts");
  const [name, setName] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mutation = useCreateAccount();

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setErrorKey(null);

    const parsed = createAccountSchema.safeParse({ name });

    if (!parsed.success) {
      setErrorKey("errors.generic");
      return;
    }

    mutation.mutate(parsed.data, {
      onSuccess: () => {
        setName("");
        onOpenChange(false);
      },
      onError: (error) => setErrorKey(toAccountErrorKey(error)),
    });
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor={NAME_FIELD_ID}>{t("create.nameLabel")}</Label>
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
              {t("create.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
