import type { LoginRequest, RegisterRequest, User } from "@stockdesk/shared";
import { create } from "zustand";

import { configureHttp } from "../../lib/http";
import { configureWsSession } from "../../lib/ws-session";
import * as api from "./api";
import { resetSessionState } from "./session-reset";

export type AuthStatus = "idle" | "loading" | "authenticated" | "anonymous";

export interface AuthSession {
  user: User;
  accessToken: string;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: AuthStatus;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setSession: (session: AuthSession) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  status: "idle",

  setSession: ({ user, accessToken }) => {
    set({ user, accessToken, status: "authenticated" });
  },

  clearSession: () => {
    set({ user: null, accessToken: null, status: "anonymous" });
    resetSessionState();
  },

  login: async (input) => {
    set({ status: "loading" });

    try {
      const response = await api.login(input);
      get().setSession(response);
    } catch (error) {
      get().clearSession();
      throw error;
    }
  },

  register: async (input) => {
    set({ status: "loading" });

    try {
      const response = await api.register(input);
      get().setSession(response);
    } catch (error) {
      get().clearSession();
      throw error;
    }
  },

  logout: async () => {
    await api.logout().catch(() => undefined);
    get().clearSession();
  },

  refresh: async () => {
    set({ status: "loading" });

    try {
      const { accessToken } = await api.refresh();
      if (get().user !== null) {
        set({ accessToken, status: "authenticated" });
        return;
      }

      const { user } = await api.me(accessToken);
      get().setSession({ user, accessToken });
    } catch (error) {
      get().clearSession();
      throw error;
    }
  },
}));

configureWsSession({
  getAccessToken: () => useAuthStore.getState().accessToken,
});

configureHttp({
  getAccessToken: () => useAuthStore.getState().accessToken,
  refresh: async () => {
    await useAuthStore.getState().refresh();
  },
  clearSession: () => {
    useAuthStore.getState().clearSession();
  },
});
