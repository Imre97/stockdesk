import { useCallback, useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useSymbolSearch } from "../market/hooks";
import { pushRecentSymbol, readRecentSymbols, type RecentSymbol } from "../market/recent-symbols";

const NO_ACTIVE_INDEX = -1;

export type TickerSearchOption = RecentSymbol;

export interface TickerSearchState {
  query: string;
  open: boolean;
  activeIndex: number;
  options: TickerSearchOption[];
  isRecent: boolean;
  showNoResults: boolean;
  listboxId: string;
  activeOptionId: string | undefined;
  optionId: (index: number) => string;
  onQueryChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onOptionMouseDown: (event: MouseEvent<HTMLElement>) => void;
  select: (option: TickerSearchOption) => void;
}

function nextIndex(current: number, length: number): number {
  return length === 0 || current + 1 >= length ? 0 : current + 1;
}

function previousIndex(current: number, length: number): number {
  return length === 0 || current <= 0 ? length - 1 : current - 1;
}

export function useTickerSearch(): TickerSearchState {
  const navigate = useNavigate();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(NO_ACTIVE_INDEX);
  const [recent, setRecent] = useState<RecentSymbol[]>([]);

  const search = useSymbolSearch(query);
  const isRecent = query.trim() === "";

  const options = useMemo<TickerSearchOption[]>(
    () =>
      isRecent
        ? recent
        : search.results.map((result) => ({
            symbol: result.symbol,
            name: result.name,
            exchange: result.exchange,
          })),
    [isRecent, recent, search.results],
  );

  const optionId = useCallback((index: number) => `${listboxId}-option-${String(index)}`, [listboxId]);

  const select = useCallback(
    (option: TickerSearchOption) => {
      const upper = option.symbol.toUpperCase();

      pushRecentSymbol({ ...option, symbol: upper });
      setQuery("");
      setOpen(false);
      setActiveIndex(NO_ACTIVE_INDEX);
      setRecent(readRecentSymbols());
      void navigate({ to: "/symbols/$symbol", params: { symbol: upper } });
    },
    [navigate],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        setOpen(false);
        setActiveIndex(NO_ACTIVE_INDEX);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setOpen(true);
        setActiveIndex((current) => nextIndex(current, options.length));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setOpen(true);
        setActiveIndex((current) => previousIndex(current, options.length));
        return;
      }

      if (event.key !== "Enter") return;

      const chosen = options[activeIndex];

      if (chosen === undefined) return;

      event.preventDefault();
      select(chosen);
    },
    [activeIndex, options, select],
  );

  return {
    query,
    open,
    activeIndex,
    options,
    isRecent,
    showNoResults: open && !isRecent && !search.isLoading && options.length === 0,
    listboxId,
    activeOptionId: activeIndex === NO_ACTIVE_INDEX ? undefined : optionId(activeIndex),
    optionId,

    onQueryChange: (value) => {
      setQuery(value);
      setOpen(true);
      setActiveIndex(NO_ACTIVE_INDEX);
    },

    onFocus: () => {
      setRecent(readRecentSymbols());
      setOpen(true);
    },

    onBlur: () => {
      setOpen(false);
      setActiveIndex(NO_ACTIVE_INDEX);
    },

    onKeyDown,
    onOptionMouseDown: (event) => event.preventDefault(),
    select,
  };
}
