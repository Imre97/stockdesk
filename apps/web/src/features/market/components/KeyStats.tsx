import type { SymbolDetail } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { useKeyStats } from "../page-hooks";

export interface KeyStatsProps {
  detail: SymbolDetail | null;
}

export function KeyStats({ detail }: KeyStatsProps) {
  const { t } = useTranslation("market");
  const rows = useKeyStats(detail);

  if (rows === null) return null;

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {rows.map((row) => (
        <div className="contents" key={row.labelKey}>
          <dt className="text-muted-foreground">{t(row.labelKey)}</dt>
          <dd className="text-right tabular-nums">{row.value ?? t("stats.missing")}</dd>
        </div>
      ))}
    </dl>
  );
}
