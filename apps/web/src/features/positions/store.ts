import { positionRecordSchema, type PositionUpdateMessage } from "@stockdesk/shared";
import { create } from "zustand";

import { toPositionEntry, type PositionEntry } from "./mappers";

export type PositionsStatus = "loaded";

export interface PositionsState {
  positionsByAccount: Record<string, Record<string, PositionEntry>>;
  statusByAccount: Record<string, PositionsStatus>;
  setPositions: (accountId: string, positions: PositionEntry[]) => void;
  applyPositionUpdate: (message: PositionUpdateMessage) => void;
  reset: () => void;
}

function bySymbol(positions: PositionEntry[]): Record<string, PositionEntry> {
  const map: Record<string, PositionEntry> = {};

  for (const position of positions) map[position.symbol] = toPositionEntry(position);

  return map;
}

export const usePositionsStore = create<PositionsState>((set) => ({
  positionsByAccount: {},
  statusByAccount: {},

  setPositions: (accountId, positions) =>
    set((state) => ({
      positionsByAccount: { ...state.positionsByAccount, [accountId]: bySymbol(positions) },
      statusByAccount: { ...state.statusByAccount, [accountId]: "loaded" },
    })),

  applyPositionUpdate: (message) =>
    set((state) => {
      const record = positionRecordSchema.parse(message.position);
      const { [record.symbol]: _replaced, ...others } = state.positionsByAccount[record.accountId] ?? {};
      const closed = record.closedAt !== null || record.quantity.isZero();
      const open = closed ? others : { ...others, [record.symbol]: toPositionEntry(record) };

      return { positionsByAccount: { ...state.positionsByAccount, [record.accountId]: open } };
    }),

  reset: () => set({ positionsByAccount: {}, statusByAccount: {} }),
}));
