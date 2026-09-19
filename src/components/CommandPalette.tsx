import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  run: () => void;
}

export function CommandPalette({
  commands,
  close,
}: {
  commands: Command[];
  close: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return commands.slice(0, 40);
    // Every word must appear somewhere, so "theme ember" still finds "Theme: ember".
    return commands
      .filter((command) => {
        const haystack =
          `${command.label} ${command.group} ${command.keywords ?? ''}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .slice(0, 40);
  }, [commands, query]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <div
      className="modal-backdrop palette-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
          else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((value) => Math.min(matches.length - 1, value + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((value) => Math.max(0, value - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            const command = matches[active];
            if (command) {
              close();
              command.run();
            }
          }
        }}
      >
        <div className="palette-input">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            aria-label="Search commands"
            placeholder="Play, search, jump to a view, change the sound…"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-list" ref={listRef} role="listbox">
          {matches.map((command, position) => (
            <button
              key={command.id}
              role="option"
              aria-selected={position === active}
              className={position === active ? 'active' : ''}
              onMouseEnter={() => setActive(position)}
              onClick={() => {
                close();
                command.run();
              }}
            >
              <span className="palette-group">{command.group}</span>
              <span className="palette-label">{command.label}</span>
              {command.hint && (
                <span className="palette-hint">{command.hint}</span>
              )}
            </button>
          ))}
          {!matches.length && (
            <p className="palette-empty">
              Nothing matches “{query}”. Press Enter on a search instead.
            </p>
          )}
        </div>
        <footer className="palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <CornerDownLeft size={13} /> to run
          </span>
        </footer>
      </section>
    </div>
  );
}
