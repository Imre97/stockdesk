import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ensureNamespaces } from "../../../i18n";

function SymbolPage() {
  const { t } = useTranslation("market");

  return <p className="text-sm text-muted-foreground">{t("page.loading")}</p>;
}

export const Route = createFileRoute("/_authenticated/symbols/$symbol")({
  loader: () => ensureNamespaces("market"),
  component: SymbolPage,
});
