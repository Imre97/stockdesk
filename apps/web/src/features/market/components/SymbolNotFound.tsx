import { useTranslation } from "react-i18next";

import { TickerSearch } from "../../shell/components/TickerSearch";

export function SymbolNotFound() {
  const { t } = useTranslation("market");

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-lg font-semibold">{t("page.notFound.title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t("page.notFound.body")}</p>
      <div aria-label={t("page.notFound.searchLabel")} className="w-full max-w-md">
        <TickerSearch />
      </div>
    </div>
  );
}
