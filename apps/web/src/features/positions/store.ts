import { positionRecordSchema, type PositionRecord, type PositionUpdateMessage } from "@stockdesk/shared";
import { create } from "zustand";

import { toPositionEntry, type PositionEntry } from "./mappers";

export type PositionsStatus = "loaded";

export interface PositionsState {
  positionsByAccount: Record<string, Record<string, PositionEntry>>;
  statusByAccount: Record<string, PositionsStatus>;
  setPositions: (accountId: string, positions: PositionEntry[]) => void;
  upsertPosition: (record: PositionRecord) => void;
  applyPositionUpdate: (message: PositionUpdateMessage) => void;
  reset: () => void;
}

function bySymbol(positions: PositionEntry[]): Record<string, PositionEntry> {
  const map: Record<string, PositionEntry> = {};

  for (const position of positions) map[position.symbol] = toPositionEntry(position);

  return map;
}

function withPosition(state: PositionsState, record: PositionRecord): Partial<PositionsState> {
  const { [record.symbol]: _replaced, ...others } = state.positionsByAccount[record.accountId] ?? {};
  const closed = record.closedAt !== null || record.quantity.isZero();
  const open = closed ? others : { ...others, [record.symbol]: toPositionEntry(record) };

  return { positionsByAccount: { ...state.positionsByAccount, [record.accountId]: open } };
}

export const usePositionsStore = create<PositionsState>((set) => ({
  positionsByAccount: {},
  statusByAccount: {},

  setPositions: (accountId, positions) =>
    set((state) => ({
      positionsByAccount: { ...state.positionsByAccount, [accountId]: bySymbol(positions) },
      statusByAccount: { ...state.statusByAccount, [accountId]: "loaded" },
    })),

  upsertPosition: (record) => set((state) => withPosition(state, record)),

  applyPositionUpdate: (message) =>
    set((state) => withPosition(state, positionRecordSchema.parse(message.position))),

  reset: () => set({ positionsByAccount: {}, statusByAccount: {} }),
}));
