import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { wsSession } from "../../lib/ws-session";
import { useCurrentUserId } from "../auth/hooks";
import { symbolTradesQueryKey } from "../market/hooks";
import { useOrdersStore } from "./store";

export function useOrderStream(): void {
  const applyOrderUpdate = useOrdersStore((state) => state.applyOrderUpdate);
  const applyTrade = useOrdersStore((state) => state.applyTrade);
  const queryClient = useQueryClient();
  const userId = useCurrentUserId();

  useEffect(() => {
    const unsubscribe = wsSession.addMessageListener((message) => {
      if (message.type === "order_update") applyOrderUpdate(message);

      if (message.type === "trade") {
        applyTrade(message);
        void queryClient.invalidateQueries({
          queryKey: symbolTradesQueryKey(userId, message.trade.accountId, message.trade.symbol),
        });
      }
    });

    wsSession.connect();

    return unsubscribe;
  }, [applyOrderUpdate, applyTrade, queryClient, userId]);
}
