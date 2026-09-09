import { useTranslation } from "react-i18next";

import { useOrdersPage } from "../page-hooks";
import { CancelOrderDialog } from "./CancelOrderDialog";
import { ModifyOrderDialog } from "./ModifyOrderDialog";
import { OrderDetailsDrawer } from "./OrderDetailsDrawer";
import { OrdersFilters } from "./OrdersFilters";
import { OrdersTable } from "./OrdersTable";

const TITLE_ID = "orders-title";

export function OrdersPage() {
  const { t } = useTranslation("orders");
  const page = useOrdersPage();
  const { dialogs } = page;

  return (
    <section aria-labelledby={TITLE_ID} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold" id={TITLE_ID}>
          {t("page.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
      </div>

      <OrdersFilters
        accountId={page.filters.accountId}
        accounts={page.accounts}
        onAccountChange={page.setAccount}
        onStatusChange={page.setStatus}
        onSymbolChange={page.setSymbol}
        status={page.filters.status}
        statuses={page.statuses}
        symbol={page.filters.symbol}
      />

      <OrdersTable
        onCancel={dialogs.openCancel}
        onDetails={dialogs.openDetails}
        onModify={dialogs.openModify}
        view={page.table}
      />

      <ModifyOrderDialog view={dialogs.modify} />
      <CancelOrderDialog view={dialogs.cancel} />
      <OrderDetailsDrawer view={dialogs.details} />
    </section>
  );
}
