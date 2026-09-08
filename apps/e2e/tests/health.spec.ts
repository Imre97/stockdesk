import { expect, test } from "@playwright/test";
import { API_BASE_URL } from "./helpers";

test("reports a healthy api and a reachable database", async ({ request }) => {
  const response = await request.get(`${API_BASE_URL}/api/v1/health`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: "ok", database: "ok" });
});
