import { createFileRoute } from "@tanstack/react-router";

import { SettingsForm } from "../../features/settings/components/SettingsForm";
import { useSettingsSync } from "../../features/settings/sync";
import { ensureNamespaces } from "../../i18n";

function SettingsPage() {
  useSettingsSync();

  return <SettingsForm />;
}

export const Route = createFileRoute("/_authenticated/settings")({
  loader: () => ensureNamespaces("settings"),
  component: SettingsPage,
});
