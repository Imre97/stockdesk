import type { QueryClient } from "@tanstack/react-query";

import { getErrorCode } from "../../lib/http";
import { queryClient as appQueryClient } from "../../lib/query-client";
import { useAuthStore } from "../auth/store";
import * as api from "./api";
import { symbolDetailQueryKey } from "./hooks";

export type SymbolLoadResult = "ok" | "not-found";

const SYMBOL_NOT_FOUND = "SYMBOL_NOT_FOUND";

export function normalizeSymbolParam(param: string): string {
  return param.trim().toUpperCase();
}

/**
 * Warms the detail query the page reads and turns the one expected failure into a result the
 * route can render; every other failure stays an error so the router shows its error boundary.
 */
export async function loadSymbolDetail(
  symbol: string,
  client: QueryClient = appQueryClient,
): Promise<SymbolLoadResult> {
  const userId = useAuthStore.getState().user?.id ?? null;

  try {
    await client.ensureQueryData({
      queryKey: symbolDetailQueryKey(userId, symbol),
      queryFn: () => api.getSymbol(symbol),
    });
  } catch (error) {
    if (getErrorCode(error) === SYMBOL_NOT_FOUND) return "not-found";

    throw error;
  }

  return "ok";
}
