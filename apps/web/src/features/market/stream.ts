import { useEffect } from "react";

import { wsSession } from "../../lib/ws-session";
import { useMarketStore } from "./store";

export function useMarketStream(): void {
  const applyQuote = useMarketStore((state) => state.applyQuote);
  const applyBar = useMarketStore((state) => state.applyBar);
  const applyMarketStatus = useMarketStore((state) => state.applyMarketStatus);

  useEffect(() => {
    const unsubscribe = wsSession.addMessageListener((message) => {
      if (message.type === "quote") applyQuote(message);
      if (message.type === "bar") applyBar(message);
      if (message.type === "market_status") applyMarketStatus(message);
    });

    wsSession.connect();

    return unsubscribe;
  }, [applyBar, applyMarketStatus, applyQuote]);
}
