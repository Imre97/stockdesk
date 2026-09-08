import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RegisterForm } from "../features/auth/components/RegisterForm";

function RegisterPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">{t("auth:register.title")}</h1>
      <RegisterForm />
    </main>
  );
}

export const Route = createFileRoute("/register")({ component: RegisterPage });
