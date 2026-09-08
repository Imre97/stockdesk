import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLoginForm } from "../hooks";

const ERROR_CLASS = "text-sm text-destructive";

export function LoginForm() {
  const { t } = useTranslation();
  const { values, setField, errors, serverErrorKey, submitting, submit } = useLoginForm();

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">{t("auth:fields.email")}</Label>
        <Input
          autoComplete="email"
          id="login-email"
          name="email"
          onChange={(event) => setField("email", event.target.value)}
          type="email"
          value={values.email}
        />
        {errors.email !== undefined && (
          <p className={ERROR_CLASS} role="alert">
            {t(errors.email)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">{t("auth:fields.password")}</Label>
        <Input
          autoComplete="current-password"
          id="login-password"
          name="password"
          onChange={(event) => setField("password", event.target.value)}
          type="password"
          value={values.password}
        />
        {errors.password !== undefined && (
          <p className={ERROR_CLASS} role="alert">
            {t(errors.password)}
          </p>
        )}
      </div>

      {serverErrorKey !== null && (
        <p className={ERROR_CLASS} role="alert">
          {t(serverErrorKey)}
        </p>
      )}

      <Button disabled={submitting} type="submit">
        {t("auth:login.submit")}
      </Button>

      <p className="text-sm text-muted-foreground">
        {t("auth:login.registerPrompt")}{" "}
        <Link className="text-primary underline-offset-4 hover:underline" to="/register">
          {t("auth:login.registerLink")}
        </Link>
      </p>
    </form>
  );
}
