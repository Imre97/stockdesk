import { createRouter } from "@tanstack/react-router";
import { useAuthStore } from "../features/auth/store";
import { routeTree } from "../routeTree.gen";

export const router = createRouter({
  routeTree,
  context: { auth: () => useAuthStore.getState() },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
