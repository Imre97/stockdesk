import { useCallback, useMemo, useState, type FormEvent } from "react";
import { loginSchema, registerSchema, type LoginRequest, type RegisterRequest } from "@stockdesk/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { getErrorCode } from "../../lib/http";
import { toUserViewModel, type UserViewModel } from "./mappers";
import { resetClientState } from "./session-reset";
import { useAuthStore } from "./store";
import {
  LOGIN_FIELD_ERROR_KEYS,
  REGISTER_FIELD_ERROR_KEYS,
  toFieldErrorKeys,
  toServerErrorKey,
  type FieldErrorKeys,
  type IssueLike,
} from "./error-keys";

export function useCurrentUser(): UserViewModel | null {
  const user = useAuthStore((state) => state.user);

  return useMemo(() => (user === null ? null : toUserViewModel(user)), [user]);
}

export function useLogout(): () => Promise<void> {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await logout();
    resetClientState({ queryClient });
    await navigate({ to: "/login" });
  }, [logout, navigate, queryClient]);
}

export interface AuthFormState<TValues> {
  values: TValues;
  setField: (field: keyof TValues, value: string) => void;
  errors: FieldErrorKeys;
  serverErrorKey: string | null;
  submitting: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

interface FormConfig<TValues, TInput> {
  initialValues: TValues;
  parse: (values: TValues) => { success: true; data: TInput } | { success: false; issues: readonly IssueLike[] };
  fieldErrorKeys: FieldErrorKeys;
  action: (input: TInput) => Promise<void>;
}

function useAuthForm<TValues extends Record<string, string>, TInput>(
  config: FormConfig<TValues, TInput>,
): AuthFormState<TValues> {
  const navigate = useNavigate();
  const [values, setValues] = useState<TValues>(config.initialValues);
  const [errors, setErrors] = useState<FieldErrorKeys>({});
  const [serverErrorKey, setServerErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = useCallback((field: keyof TValues, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
  }, []);

  const { parse, fieldErrorKeys, action } = config;

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setServerErrorKey(null);

      const result = parse(values);

      if (!result.success) {
        setErrors(toFieldErrorKeys(result.issues, fieldErrorKeys));
        return;
      }

      setErrors({});
      setSubmitting(true);

      try {
        await action(result.data);
        await navigate({ to: "/" });
      } catch (error) {
        setServerErrorKey(toServerErrorKey(getErrorCode(error)));
      } finally {
        setSubmitting(false);
      }
    },
    [action, fieldErrorKeys, navigate, parse, values],
  );

  return { values, setField, errors, serverErrorKey, submitting, submit };
}

export type LoginValues = { email: string; password: string };
export type RegisterValues = LoginValues & { displayName: string };

export function useLoginForm(): AuthFormState<LoginValues> {
  const login = useAuthStore((state) => state.login);

  return useAuthForm<LoginValues, LoginRequest>({
    initialValues: { email: "", password: "" },
    parse: (values) => {
      const result = loginSchema.safeParse(values);
      return result.success ? { success: true, data: result.data } : { success: false, issues: result.error.issues };
    },
    fieldErrorKeys: LOGIN_FIELD_ERROR_KEYS,
    action: login,
  });
}

export function useRegisterForm(): AuthFormState<RegisterValues> {
  const register = useAuthStore((state) => state.register);

  return useAuthForm<RegisterValues, RegisterRequest>({
    initialValues: { email: "", password: "", displayName: "" },
    parse: (values) => {
      const result = registerSchema.safeParse(values);
      return result.success ? { success: true, data: result.data } : { success: false, issues: result.error.issues };
    },
    fieldErrorKeys: REGISTER_FIELD_ERROR_KEYS,
    action: register,
  });
}
