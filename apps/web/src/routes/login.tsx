import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AuthLayout } from "../components/AuthLayout";
import { LoginForm } from "../features/auth/components/LoginForm";

function LoginPage() {
  const { t } = useTranslation();

  return (
    <AuthLayout title={t("auth:login.title")}>
      <LoginForm />
    </AuthLayout>
  );
}

export const Route = createFileRoute("/login")({ component: LoginPage });
