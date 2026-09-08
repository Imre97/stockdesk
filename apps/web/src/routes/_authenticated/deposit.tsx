import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useActiveAccountId } from "../../features/accounts/hooks";
import { DepositForm } from "../../features/funding/components/DepositForm";
import { TransactionsList } from "../../features/funding/components/TransactionsList";
import { useTransactionRows } from "../../features/funding/hooks";

function DepositPage() {
  const { t } = useTranslation("funding");
  const accountId = useActiveAccountId();
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

export const Route = createFileRoute("/_authenticated/deposit")({ component: DepositPage });
