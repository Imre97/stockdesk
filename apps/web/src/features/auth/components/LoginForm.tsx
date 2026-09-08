import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useLoginForm } from "../hooks";

const FIELD_CLASS = "rounded border border-neutral-300 px-3 py-2 text-sm";
const LABEL_CLASS = "text-sm font-medium text-neutral-700";
const ERROR_CLASS = "text-sm text-red-700";

export function LoginForm() {
  const { t } = useTranslation();
  const { values, setField, errors, serverErrorKey, submitting, submit } = useLoginForm();

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="login-email">
          {t("auth:fields.email")}
        </label>
        <input
          autoComplete="email"
          className={FIELD_CLASS}
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

      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="login-password">
          {t("auth:fields.password")}
        </label>
        <input
          autoComplete="current-password"
          className={FIELD_CLASS}
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

      <button
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={submitting}
        type="submit"
      >
        {t("auth:login.submit")}
      </button>

      <p className="text-sm text-neutral-600">
        {t("auth:login.registerPrompt")} <Link to="/register">{t("auth:login.registerLink")}</Link>
      </p>
    </form>
  );
}
