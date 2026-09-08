import type { AuthState } from "./store";

export type AuthGuardResult = "allow" | "redirect";

export async function resolveAuthGuard(readAuthState: () => AuthState): Promise<AuthGuardResult> {
  if (readAuthState().status === "idle") {
    try {
      await readAuthState().refresh();
    } catch {
      return "redirect";
    }
  }

  return readAuthState().status === "authenticated" ? "allow" : "redirect";
}
