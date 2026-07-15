"use client";

import { useEffect, useId, useState } from "react";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  loadingIndex: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onArrowIntoResults: (direction: "down" | "up") => void;
  onEnterActiveCard: (withModifier: boolean) => void;
}

const lastToken = (query: string) => query.slice(query.lastIndexOf(" ") + 1);

export function SearchInput({
  value,
  onChange,
  suggestions,
  loadingIndex,
  inputRef,
  onArrowIntoResults,
  onEnterActiveCard
}: SearchInputProps) {
  const [focused, setFocused] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const listId = useId();
  const prefix = lastToken(value);
  const visible = focused && value.length > 0 && suggestions.length > 0;
  const shown = suggestions.slice(0, 6);

  useEffect(() => {
    setHighlighted(-1);
  }, [value, visible]);

  const acceptSuggestion = (suggestion: string) => {
    const before = value.slice(0, value.length - prefix.length);
    onChange(`${before}${suggestion} `);
    setHighlighted(-1);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div
        className={`flex h-14 items-center gap-3 rounded-lg border bg-bg-raised px-4 transition-colors duration-[120ms] ${
          focused ? "ring-accent/30 border-accent ring-2" : "border-border"
        }`}
      >
        <span aria-hidden="true" className="text-text-tertiary">
          ⌕
        </span>
        <input
          ref={inputRef}
          id="search"
          role="combobox"
          aria-label="Search questions and answers"
          aria-expanded={visible}
          // Only reference the listbox while it's actually in the DOM.
          aria-controls={visible ? listId : undefined}
          aria-activedescendant={
            visible && highlighted >= 0 ? `${listId}-${highlighted}` : undefined
          }
          aria-autocomplete="list"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => {
            setFocused(true);
            event.target.select();
          }}
          onBlur={() => window.setTimeout(() => setFocused(false), 100)}
          placeholder={loadingIndex ? "Loading index…" : "Search questions and answers…"}
          className="min-w-0 flex-1 bg-transparent text-lg text-text-primary placeholder:text-text-tertiary focus-visible:outline-none"
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(event) => {
            if (visible && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              event.stopPropagation();
              setHighlighted((index) => {
                const count = shown.length;
                if (event.key === "ArrowDown") return (index + 1) % count;
                return (index - 1 + count) % count;
              });
              return;
            }
            if (visible && event.key === "Tab") {
              event.preventDefault();
              acceptSuggestion(shown[Math.max(highlighted, 0)]);
              return;
            }
            if (visible && event.key === "Enter" && highlighted >= 0) {
              event.preventDefault();
              event.stopPropagation();
              acceptSuggestion(shown[highlighted]);
              return;
            }
            if (event.key === "Enter") {
              onEnterActiveCard(event.metaKey || event.ctrlKey);
              return;
            }
            if (!visible && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              onArrowIntoResults(event.key === "ArrowDown" ? "down" : "up");
            }
          }}
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="text-text-tertiary transition-colors duration-[120ms] hover:text-text-primary"
          >
            ✕
          </button>
        ) : (
          !focused && (
            <kbd className="hidden select-none rounded border border-border px-1.5 py-0.5 font-mono text-micro text-text-tertiary sm:inline-block">
              ⌘K
            </kbd>
          )
        )}
      </div>
      {loadingIndex && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-lg"
        >
          <div className="h-full w-1/3 animate-shimmer bg-accent motion-reduce:animate-none" />
        </div>
      )}
      {visible && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border border-border bg-bg-raised py-1 shadow-none"
        >
          {shown.map((suggestion, index) => (
            <li
              id={`${listId}-${index}`}
              key={suggestion}
              role="option"
              aria-selected={highlighted === index}
            >
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => acceptSuggestion(suggestion)}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex w-full items-center px-4 py-2 text-left text-body ${
                  highlighted === index ? "bg-bg" : ""
                }`}
              >
                <span className="text-text-primary">{prefix}</span>
                <span className="text-text-tertiary">{suggestion.slice(prefix.length)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
