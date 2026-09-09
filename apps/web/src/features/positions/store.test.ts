import { Decimal, positionSchema, type PositionRecordDto } from "@stockdesk/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { positionDto, positionRecordDto } from "../../test/fixtures";
import { usePositionsStore } from "./store";

const ACCOUNT_ID = "acc-1";
const OTHER_ACCOUNT_ID = "acc-2";

function update(overrides: Partial<PositionRecordDto> = {}) {
  return { type: "position_update" as const, position: positionRecordDto(overrides) };
}

function openPositions(accountId: string) {
  return usePositionsStore.getState().positionsByAccount[accountId] ?? {};
}

beforeEach(() => {
  usePositionsStore.getState().reset();
});

describe("positions store", () => {
  it("keys the loaded positions of an account by symbol and parses them into Decimal values", () => {
    usePositionsStore
      .getState()
      .setPositions(ACCOUNT_ID, [
        positionSchema.parse(positionDto({ symbol: "AAPL", quantity: "10.000000" })),
        positionSchema.parse(positionDto({ symbol: "TSLA", quantity: "-4.000000" })),
      ]);

    const positions = openPositions(ACCOUNT_ID);

    expect(Object.keys(positions).sort()).toEqual(["AAPL", "TSLA"]);
    expect(positions.AAPL?.quantity).toBeInstanceOf(Decimal);
    expect(positions.TSLA?.quantity.toString()).toBe("-4");
    expect(usePositionsStore.getState().statusByAccount[ACCOUNT_ID]).toBe("loaded");
  });

  it("leaves an account that was never loaded idle", () => {
    expect(usePositionsStore.getState().statusByAccount[ACCOUNT_ID]).toBeUndefined();
  });

  it("inserts a pushed position update into the account of the message", () => {
    usePositionsStore.getState().applyPositionUpdate(update({ symbol: "MSFT", quantity: "3.000000" }));

    expect(openPositions(ACCOUNT_ID).MSFT?.quantity.toString()).toBe("3");
  });

  it("replaces the position of the same symbol", () => {
    usePositionsStore.getState().applyPositionUpdate(update({ quantity: "10.000000", averageCost: "180.2500" }));
    usePositionsStore.getState().applyPositionUpdate(update({ quantity: "15.000000", averageCost: "182.0000" }));

    const positions = openPositions(ACCOUNT_ID);

    expect(Object.keys(positions)).toEqual(["AAPL"]);
    expect(positions.AAPL?.quantity.toString()).toBe("15");
    expect(positions.AAPL?.averageCost.toString()).toBe("182");
  });

  it("removes a position that the engine closed", () => {
    usePositionsStore.getState().applyPositionUpdate(update({ quantity: "10.000000" }));
    usePositionsStore
      .getState()
      .applyPositionUpdate(update({ quantity: "0.000000", closedAt: "2026-09-08T15:00:00.000Z" }));

    expect(openPositions(ACCOUNT_ID)).toEqual({});
  });

  it("removes a position whose quantity reached zero without a close timestamp", () => {
    usePositionsStore.getState().applyPositionUpdate(update({ quantity: "10.000000" }));
    usePositionsStore.getState().applyPositionUpdate(update({ quantity: "0.000000" }));

    expect(openPositions(ACCOUNT_ID)).toEqual({});
  });

  it("keeps the positions of the other accounts untouched", () => {
    usePositionsStore.getState().applyPositionUpdate(update({ symbol: "AAPL" }));
    usePositionsStore
      .getState()
      .applyPositionUpdate(update({ accountId: OTHER_ACCOUNT_ID, symbol: "TSLA" }));

    expect(Object.keys(openPositions(ACCOUNT_ID))).toEqual(["AAPL"]);
    expect(Object.keys(openPositions(OTHER_ACCOUNT_ID))).toEqual(["TSLA"]);
  });

  it("drops every account on reset", () => {
    usePositionsStore.getState().setPositions(ACCOUNT_ID, [positionSchema.parse(positionDto())]);

    usePositionsStore.getState().reset();

    expect(usePositionsStore.getState().positionsByAccount).toEqual({});
    expect(usePositionsStore.getState().statusByAccount).toEqual({});
  });
});
