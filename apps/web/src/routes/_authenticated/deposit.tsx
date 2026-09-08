import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DepositForm } from "../../features/funding/components/DepositForm";
import { TransactionsList } from "../../features/funding/components/TransactionsList";
import { useSelectedFundingAccountId, useTransactionRows } from "../../features/funding/hooks";
import { ensureNamespaces } from "../../i18n";

function DepositPage() {
  const { t } = useTranslation("funding");
  const accountId = useSelectedFundingAccountId();
  const rows = useTransactionRows(accountId);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{t("deposit.title")}</h1>
        <DepositForm />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t("transactions.title")}</h2>
        <TransactionsList rows={rows} />
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/deposit")({
  loader: () => ensureNamespaces("funding"),
  component: DepositPage,
});
