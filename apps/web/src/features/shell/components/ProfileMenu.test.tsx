import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../settings/api", () => ({ fetchSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@tanstack/react-router", () => ({
  Link: () => null,
  useNavigate: () => vi.fn(),
}));

import { i18n } from "../../../i18n";
import { useAuthStore } from "../../auth/store";
import { ProfileMenu } from "./ProfileMenu";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

let queryClient: QueryClient;

function renderMenu(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ProfileMenu />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
});

describe("ProfileMenu", () => {
  it("shows the display name on the menu trigger", () => {
    renderMenu();

    expect(screen.getByRole("button", { name: new RegExp(USER.displayName) })).toBeInTheDocument();
  });

  it("labels the sign out item exactly as the end to end suite expects", () => {
    expect(i18n.t("shell:profile.signOut", { lng: "en" })).toBe("Sign out");
  });
});
