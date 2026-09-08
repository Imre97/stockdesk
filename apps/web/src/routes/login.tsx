import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LoginForm } from "../features/auth/components/LoginForm";

function LoginPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">{t("auth:login.title")}</h1>
      <LoginForm />
    </main>
  );
}

export const Route = createFileRoute("/login")({ component: LoginPage });
