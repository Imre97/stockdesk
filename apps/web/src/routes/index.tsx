import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("home.title")}</h1>
      <p className="text-sm text-neutral-600">{t("home.placeholder")}</p>
    </main>
  );
}

export const Route = createFileRoute("/")({ component: HomePage });
