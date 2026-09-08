import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

const api = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock("../api", () => api);

import { i18n } from "../../../i18n";
import { useAuthStore } from "../store";
import { LoginForm } from "./LoginForm";

const USER = {
  id: "clx0000000000000000000000",
  email: "trader@example.com",
  displayName: "Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

function renderLoginForm(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <LoginForm />
    </I18nextProvider>,
  );
}

function submitForm(): void {
  fireEvent.click(screen.getByRole("button", { name: i18n.t("auth:login.submit") }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, accessToken: null, status: "idle" });
});

describe("LoginForm", () => {
  it("renders labelled email and password fields plus a submit button", () => {
    renderLoginForm();

    expect(screen.getByLabelText(i18n.t("auth:fields.email"))).toBeInTheDocument();
    expect(screen.getByLabelText(i18n.t("auth:fields.password"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: i18n.t("auth:login.submit") })).toBeInTheDocument();
  });

  it("links to the registration page", () => {
    renderLoginForm();

    expect(screen.getByRole("link", { name: i18n.t("auth:login.registerLink") })).toHaveAttribute(
      "href",
      "/register",
    );
  });

  it("shows a validation message for an invalid email and does not call the api", async () => {
    renderLoginForm();

    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.email")), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.password")), { target: { value: "correct-horse" } });
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("auth:errors.emailInvalid"));
    expect(api.login).not.toHaveBeenCalled();
  });

  it("shows a validation message when the password is empty", async () => {
    renderLoginForm();

    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.email")), { target: { value: "trader@example.com" } });
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("auth:errors.passwordRequired"));
    expect(api.login).not.toHaveBeenCalled();
  });

  it("submits normalized credentials and navigates to the dashboard", async () => {
    api.login.mockResolvedValue({ user: USER, accessToken: "access-token-1" });
    renderLoginForm();

    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.email")), {
      target: { value: "  Trader@Example.COM " },
    });
    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.password")), { target: { value: "correct-horse" } });
    submitForm();

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith({ email: "trader@example.com", password: "correct-horse" });
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: "/" });
    });
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("renders an alert when the request is rejected", async () => {
    api.login.mockRejectedValue(new Error("network down"));
    renderLoginForm();

    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.email")), { target: { value: "trader@example.com" } });
    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.password")), { target: { value: "wrong-password" } });
    submitForm();

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("auth:errors.generic"));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("disables the submit button while the request is in flight", async () => {
    let resolveLogin: ((value: { user: typeof USER; accessToken: string }) => void) | undefined;
    api.login.mockReturnValue(
      new Promise<{ user: typeof USER; accessToken: string }>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    renderLoginForm();

    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.email")), { target: { value: "trader@example.com" } });
    fireEvent.change(screen.getByLabelText(i18n.t("auth:fields.password")), { target: { value: "correct-horse" } });
    submitForm();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: i18n.t("auth:login.submit") })).toBeDisabled();
    });

    resolveLogin?.({ user: USER, accessToken: "access-token-1" });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({ to: "/" });
    });
  });
});
