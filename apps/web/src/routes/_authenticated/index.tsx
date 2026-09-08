import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useActiveAccountView } from "../../features/accounts/hooks";
import { AccountHeader } from "../../features/dashboard/components/AccountHeader";
import { EquityChart } from "../../features/dashboard/components/EquityChart";
import { PositionsTable } from "../../features/dashboard/components/PositionsTable";
import { RangeSelector } from "../../features/dashboard/components/RangeSelector";
import { useEquityRange, usePositionRows } from "../../features/dashboard/hooks";
import { ensureNamespaces } from "../../i18n";

function PortfolioPage() {
  const { t } = useTranslation("dashboard");
  const account = useActiveAccountView();
  const { range, setRange } = useEquityRange();
  const rows = usePositionRows();

  return (
    <div className="flex flex-col gap-4">
      <AccountHeader account={account} />
      <section className="flex flex-col gap-2">
        <RangeSelector onChange={setRange} value={range} />
        <EquityChart range={range} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t("positions.title")}</h2>
        <PositionsTable rows={rows} />
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/")({
  loader: () => ensureNamespaces("dashboard"),
  component: PortfolioPage,
});
