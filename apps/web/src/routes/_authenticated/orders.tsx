import { createFileRoute } from "@tanstack/react-router";

import { OrdersPage } from "../../features/orders/components/OrdersPage";
import { ensureNamespaces } from "../../i18n";

export const Route = createFileRoute("/_authenticated/orders")({
  loader: () => ensureNamespaces("orders"),
  component: OrdersPage,
});
