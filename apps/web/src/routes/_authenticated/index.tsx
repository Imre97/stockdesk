import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCurrentUser, useLogout } from "../../features/auth/hooks";

function DashboardPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">{t("home.title")}</h1>
      {user !== null && (
        <p className="text-sm text-neutral-600">
          {t("auth:dashboard.greeting", { displayName: user.displayName })}
        </p>
      )}
      <p className="text-sm text-neutral-600">{t("home.placeholder")}</p>
      <button
        className="self-start rounded border border-neutral-300 px-3 py-2 text-sm font-medium"
        onClick={logout}
        type="button"
      >
        {t("auth:dashboard.signOut")}
      </button>
    </main>
  );
}

export const Route = createFileRoute("/_authenticated/")({ component: DashboardPage });
