import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolveAuthGuard } from "../features/auth/guard";
import { useMarketStream } from "../features/market/stream";
import { useOrderStream } from "../features/orders/stream";
import { usePositionStream } from "../features/positions/stream";
import { bootstrapAuthenticatedApp } from "../features/shell/bootstrap";
import { AppShell } from "../features/shell/components/AppShell";
import { useAccountSummaryStream } from "../features/shell/hooks";
import { ensureNamespaces } from "../i18n";

function AuthenticatedLayout() {
  useAccountSummaryStream();
  useMarketStream();
  usePositionStream();
  useOrderStream();

  return <AppShell />;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    if ((await resolveAuthGuard(context.auth)) === "redirect") {
      throw redirect({ to: "/login" });
    }

    await bootstrapAuthenticatedApp();
  },
  loader: () => ensureNamespaces("accounts", "settings"),
  component: AuthenticatedLayout,
});
