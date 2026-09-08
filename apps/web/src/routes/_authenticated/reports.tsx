import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

function ReportsPage() {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-lg font-semibold">{t("reports.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("reports.body")}</p>
    </section>
  );
}

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });
