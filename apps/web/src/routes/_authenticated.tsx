import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { resolveAuthGuard } from "../features/auth/guard";

function AuthenticatedLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
    if ((await resolveAuthGuard(context.auth)) === "redirect") {
      throw redirect({ to: "/login" });
    }
  },
  component: AuthenticatedLayout,
});
