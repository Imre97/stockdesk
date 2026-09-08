import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthLayout } from "./AuthLayout";

describe("AuthLayout", () => {
  it("renders the title and the children inside a centered card", () => {
    const { container } = render(
      <AuthLayout title="Sign in">
        <p>form</p>
      </AuthLayout>,
    );

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("form")).toBeInTheDocument();
    expect(container.querySelector("main")?.className).toContain("min-h-screen");
    expect(container.querySelector("[data-slot='card']")?.className).toContain("max-w-sm");
  });
})
