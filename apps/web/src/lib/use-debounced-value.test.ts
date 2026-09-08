import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "./use-debounced-value";

const DELAY_MS = 200;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebouncedValue", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("tsl", DELAY_MS));

    expect(result.current).toBe("tsl");
  });

  it("keeps the previous value until the delay elapsed", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, DELAY_MS), {
      initialProps: { value: "t" },
    });

    rerender({ value: "tsl" });

    expect(result.current).toBe("t");

    act(() => {
      vi.advanceTimersByTime(DELAY_MS);
    });

    expect(result.current).toBe("tsl");
  });

  it("emits only the last value of a burst", () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, DELAY_MS), {
      initialProps: { value: "t" },
    });

    rerender({ value: "ts" });

    act(() => {
      vi.advanceTimersByTime(DELAY_MS - 1);
    });

    rerender({ value: "tsl" });

    act(() => {
      vi.advanceTimersByTime(DELAY_MS);
    });

    expect(result.current).toBe("tsl");
  });
});
