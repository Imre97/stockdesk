import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { SymbolNotFound } from "../../../features/market/components/SymbolNotFound";
import { SymbolPage } from "../../../features/market/components/SymbolPage";
import { loadSymbolDetail, normalizeSymbolParam } from "../../../features/market/route-loader";
import { ensureNamespaces } from "../../../i18n";

function SymbolRoute() {
  const { symbol } = Route.useParams();

  return <SymbolPage symbol={symbol} />;
}

export const Route = createFileRoute("/_authenticated/symbols/$symbol")({
  beforeLoad: ({ params }) => {
    const symbol = normalizeSymbolParam(params.symbol);

    if (symbol !== params.symbol) {
      throw redirect({ to: "/symbols/$symbol", params: { symbol } });
    }
  },
  loader: async ({ params }) => {
    await ensureNamespaces("market", "orders");

    if ((await loadSymbolDetail(params.symbol)) === "not-found") throw notFound();
  },
  component: SymbolRoute,
  notFoundComponent: SymbolNotFound,
});
