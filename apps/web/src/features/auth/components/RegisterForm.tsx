import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useRegisterForm } from "../hooks";

const FIELD_CLASS = "rounded border border-neutral-300 px-3 py-2 text-sm";
const LABEL_CLASS = "text-sm font-medium text-neutral-700";
const ERROR_CLASS = "text-sm text-red-700";

export function RegisterForm() {
  const { t } = useTranslation();
  const { values, setField, errors, serverErrorKey, submitting, submit } = useRegisterForm();

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="register-display-name">
          {t("auth:fields.displayName")}
        </label>
        <input
          autoComplete="nickname"
          className={FIELD_CLASS}
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

      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="register-email">
          {t("auth:fields.email")}
        </label>
        <input
          autoComplete="email"
          className={FIELD_CLASS}
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

      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="register-password">
          {t("auth:fields.password")}
        </label>
        <input
          autoComplete="new-password"
          className={FIELD_CLASS}
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

      <button
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={submitting}
        type="submit"
      >
        {t("auth:register.submit")}
      </button>

      <p className="text-sm text-neutral-600">
        {t("auth:register.loginPrompt")} <Link to="/login">{t("auth:register.loginLink")}</Link>
      </p>
    </form>
  );
}
