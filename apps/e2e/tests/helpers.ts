import type { APIRequestContext } from "@playwright/test";

export const API_BASE_URL = "http://localhost:3000";
export const TEST_PASSWORD = "Password123!";
export const WRONG_PASSWORD = "WrongPassword123!";

export interface TestUser {
  email: string;
  password: string;
  displayName: string;
}

let sequence = 0;

export function uniqueEmail(): string {
  sequence += 1;
  return `e2e-${Date.now()}-${sequence}@example.com`;
}

export function makeTestUser(): TestUser {
  return { email: uniqueEmail(), password: TEST_PASSWORD, displayName: "E2E Trader" };
}

export async function registerViaApi(request: APIRequestContext, user: TestUser): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/v1/auth/register`, {
    data: { email: user.email, password: user.password, displayName: user.displayName },
  });

  if (!response.ok()) {
    throw new Error(
      `Registration through the API failed with status ${response.status()}: ${await response.text()}`,
    );
  }
}
