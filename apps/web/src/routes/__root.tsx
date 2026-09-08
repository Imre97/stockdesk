import { QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { i18n } from "../i18n";
import { queryClient } from "../lib/query-client";
import type { AuthRouterContext } from "../lib/router-context";

function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-white text-neutral-900">
          <Outlet />
        </div>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

export const Route = createRootRouteWithContext<AuthRouterContext>()({ component: RootLayout });
