import { createFileRoute } from "@tanstack/react-router";

import { SettingsForm } from "../../features/settings/components/SettingsForm";
import { useSettingsSync } from "../../features/settings/sync";

function SettingsPage() {
  useSettingsSync();

  return <SettingsForm />;
}

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });
