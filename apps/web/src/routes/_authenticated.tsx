import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolveAuthGuard } from "../features/auth/guard";
import { bootstrapAuthenticatedApp } from "../features/shell/bootstrap";
import { AppShell } from "../features/shell/components/AppShell";
import { useAccountSummaryStream } from "../features/shell/hooks";

function AuthenticatedLayout() {
  useAccountSummaryStream();

  return <AppShell />;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    if ((await resolveAuthGuard(context.auth)) === "redirect") {
      throw redirect({ to: "/login" });
    }

    await bootstrapAuthenticatedApp();
  },
  component: AuthenticatedLayout,
});
