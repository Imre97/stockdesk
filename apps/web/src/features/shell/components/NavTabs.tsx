import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const TAB_CLASS =
  "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";
const ACTIVE_TAB_CLASS = "border-foreground text-foreground";

const TABS = [
  { to: "/", labelKey: "nav.portfolio" },
  { to: "/reports", labelKey: "nav.reports" },
  { to: "/deposit", labelKey: "nav.deposit" },
] as const;

export function NavTabs() {
  const { t } = useTranslation("shell");

  return (
    <nav className="flex items-center gap-1 border-b border-border px-4">
      {TABS.map((tab) => (
        <Link
          activeOptions={{ exact: tab.to === "/" }}
          activeProps={{ className: `${TAB_CLASS} ${ACTIVE_TAB_CLASS}` }}
          className={TAB_CLASS}
          key={tab.to}
          to={tab.to}
        >
          {t(tab.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
