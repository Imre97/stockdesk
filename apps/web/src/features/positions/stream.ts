import { useEffect } from "react";

import { wsSession } from "../../lib/ws-session";
import { usePositionsStore } from "./store";

export function usePositionStream(): void {
  const applyPositionUpdate = usePositionsStore((state) => state.applyPositionUpdate);

  useEffect(() => {
    const unsubscribe = wsSession.addMessageListener((message) => {
      if (message.type === "position_update") applyPositionUpdate(message);
    });

    wsSession.connect();

    return unsubscribe;
  }, [applyPositionUpdate]);
}
