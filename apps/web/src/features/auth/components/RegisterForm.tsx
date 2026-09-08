import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegisterForm } from "../hooks";

const ERROR_CLASS = "text-sm text-destructive";

export function RegisterForm() {
  const { t } = useTranslation();
  const { values, setField, errors, serverErrorKey, submitting, submit } = useRegisterForm();

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="register-display-name">{t("auth:fields.displayName")}</Label>
        <Input
          autoComplete="nickname"
          id="register-display-name"
          name="displayName"
          onChange={(event) => setField("displayName", event.target.value)}
          type="text"
          value={values.displayName}
        />
        {errors.displayName !== undefined && (
          <p className={ERROR_CLASS} role="alert">
            {t(errors.displayName)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="register-email">{t("auth:fields.email")}</Label>
        <Input
          autoComplete="email"
          id="register-email"
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
        <Label htmlFor="register-password">{t("auth:fields.password")}</Label>
        <Input
          autoComplete="new-password"
          id="register-password"
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
        {t("auth:register.submit")}
      </Button>

      <p className="text-sm text-muted-foreground">
        {t("auth:register.loginPrompt")}{" "}
        <Link className="text-primary underline-offset-4 hover:underline" to="/login">
          {t("auth:register.loginLink")}
        </Link>
      </p>
    </form>
  );
}
