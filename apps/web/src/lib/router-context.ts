import type { AuthState } from "../features/auth/store";

export interface AuthRouterContext {
  auth: () => AuthState;
}
