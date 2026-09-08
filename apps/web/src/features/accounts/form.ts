import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createAccountSchema, renameAccountSchema } from "@stockdesk/shared";

import { toAccountErrorKey } from "./error-keys";
import { useCreateAccount, useRenameAccount } from "./hooks";

const GENERIC_ERROR_KEY = "errors.generic";

export interface AccountNameFormState {
  name: string;
  errorKey: string | null;
  pending: boolean;
  setName: (name: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}

export function useCreateAccountForm(onDone: () => void): AccountNameFormState {
  const [name, setName] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mutation = useCreateAccount();
  const { mutate } = mutation;

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorKey(null);

      const parsed = createAccountSchema.safeParse({ name });

      if (!parsed.success) {
        setErrorKey(GENERIC_ERROR_KEY);
        return;
      }

      mutate(parsed.data, {
        onSuccess: () => {
          setName("");
          onDone();
        },
        onError: (error) => setErrorKey(toAccountErrorKey(error)),
      });
    },
    [mutate, name, onDone],
  );

  return { name, errorKey, pending: mutation.isPending, setName, submit };
}

export function useRenameAccountForm(
  accountId: string | null,
  currentName: string,
  onDone: () => void,
): AccountNameFormState {
  const [name, setName] = useState(currentName);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mutation = useRenameAccount();
  const { mutate } = mutation;

  useEffect(() => setName(currentName), [currentName]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorKey(null);

      const parsed = renameAccountSchema.safeParse({ name });

      if (!parsed.success || accountId === null) {
        setErrorKey(GENERIC_ERROR_KEY);
        return;
      }

      mutate(
        { accountId, name: parsed.data.name },
        {
          onSuccess: () => onDone(),
          onError: (error) => setErrorKey(toAccountErrorKey(error)),
        },
      );
    },
    [accountId, mutate, name, onDone],
  );

  return { name, errorKey, pending: mutation.isPending, setName, submit };
}
