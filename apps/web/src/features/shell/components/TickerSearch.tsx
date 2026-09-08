import { SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTickerSearch } from "../ticker-search";

const ROW_CLASS = "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm";

export function TickerSearch() {
  const { t } = useTranslation("shell");
  const search = useTickerSearch();

  return (
    <div className="relative w-full max-w-md">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        aria-activedescendant={search.activeOptionId}
        aria-autocomplete="list"
        aria-controls={search.listboxId}
        aria-expanded={search.open}
        autoComplete="off"
        className="pl-8"
        onBlur={search.onBlur}
        onChange={(event) => search.onQueryChange(event.target.value)}
        onFocus={search.onFocus}
        onKeyDown={search.onKeyDown}
        placeholder={t("search.placeholder")}
        role="combobox"
        type="search"
        value={search.query}
      />
      {search.open && (
        <ul
          aria-label={t("search.listLabel")}
          className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md"
          id={search.listboxId}
          role="listbox"
        >
          {search.isRecent && search.options.length > 0 && (
            <li className="px-3 py-1 text-xs text-muted-foreground" role="presentation">
              {t("search.recent")}
            </li>
          )}
          {search.options.map((option, index) => (
            <li
              aria-selected={index === search.activeIndex}
              className={cn(ROW_CLASS, index === search.activeIndex && "bg-accent text-accent-foreground")}
              id={search.optionId(index)}
              key={option.symbol}
              onClick={() => search.select(option.symbol)}
              onMouseDown={search.onOptionMouseDown}
              role="option"
            >
              <span className="font-medium">{option.symbol}</span>
              {option.name !== null && <span className="truncate text-muted-foreground">{option.name}</span>}
              {option.exchange !== null && (
                <span className="ml-auto text-xs text-muted-foreground">{option.exchange}</span>
              )}
            </li>
          ))}
          {search.showNoResults && (
            <li className="px-3 py-2 text-sm text-muted-foreground" role="presentation">
              {t("search.noResults")}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
