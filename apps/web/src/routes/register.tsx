import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AuthLayout } from "../components/AuthLayout";
import { RegisterForm } from "../features/auth/components/RegisterForm";
import { ensureNamespaces } from "../i18n";

function RegisterPage() {
  const { t } = useTranslation();

  return (
    <AuthLayout title={t("auth:register.title")}>
      <RegisterForm />
    </AuthLayout>
  );
}

export const Route = createFileRoute("/register")({
  loader: () => ensureNamespaces("auth"),
  component: RegisterPage,
});
