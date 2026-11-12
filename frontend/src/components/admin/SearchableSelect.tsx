import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './SearchableSelect.css';

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Shown but not selectable, e.g. a player who is already on a team. */
  disabled?: boolean;
  /** Muted text after the label, saying why the option is disabled. */
  hint?: string;
}

interface SearchableSelectProps {
  id?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Read-only: shows the selection but cannot be opened or cleared. */
  disabled?: boolean;
  /** Marks the input invalid and points it at the message that explains why. */
  errorId?: string;
}

/** Filterable select following the ARIA combobox pattern with a listbox popup. */
export default function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  disabled = false,
  errorId,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;

  const selectedOption = options.find((option) => option.value === value);

  const filtered = search
    ? options.filter((option) => option.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const close = () => {
    setIsOpen(false);
    setSearch('');
    setActiveIndex(-1);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleSelect = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  const open = () => {
    if (!disabled) setIsOpen(true);
  };

  const handleInputChange = (nextSearch: string) => {
    setSearch(nextSearch);
    setActiveIndex(-1);
    if (!isOpen) open();
  };

  const handleClear = () => {
    onChange('');
    setSearch('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        if (filtered.length === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((previous) => {
          if (previous < 0) return step === 1 ? 0 : filtered.length - 1;
          return (previous + step + filtered.length) % filtered.length;
        });
        return;
      }
      case 'Enter': {
        if (!isOpen) return;
        // Enter picks from the list here. It must not submit the enclosing form.
        event.preventDefault();
        const activeOption = filtered[activeIndex];
        if (activeOption) handleSelect(activeOption);
        return;
      }
      case 'Escape':
        if (isOpen) {
          event.stopPropagation();
          close();
        }
        return;
      case 'Tab':
        close();
        return;
      default:
    }
  };

  const activeOption = isOpen ? filtered[activeIndex] : undefined;

  return (
    <div className={`searchable-select ${className}`.trim()} ref={containerRef}>
      <div className="searchable-select-input-wrapper">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOption ? `${baseId}-${activeIndex}` : undefined}
          className="searchable-select-input"
          value={isOpen ? search : selectedOption?.label || ''}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={open}
          onClick={open}
          disabled={disabled}
          aria-invalid={errorId ? true : undefined}
          aria-describedby={errorId}
          onKeyDown={handleKeyDown}
          placeholder={selectedOption ? selectedOption.label : placeholder}
          autoComplete="off"
        />
        {value && !isOpen && !disabled && (
          <button
            type="button"
            className="searchable-select-clear"
            onClick={handleClear}
            aria-label={t('adminRoster.searchableSelect.clear', 'Clear selection')}
          >
            <X aria-hidden="true" size={16} />
          </button>
        )}
      </div>
      {isOpen && (
        <ul className="searchable-select-dropdown" id={listId} role="listbox" ref={listRef}>
          {filtered.length === 0 ? (
            <li className="searchable-select-no-results" role="option" aria-selected="false" aria-disabled="true">
              {t('adminRoster.searchableSelect.noMatches', 'No matches')}
            </li>
          ) : (
            filtered.map((option, index) => (
              // The combobox input owns the keyboard, so options only need the click.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={option.value}
                id={`${baseId}-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled ? true : undefined}
                className={[
                  'searchable-select-option',
                  option.value === value ? 'selected' : '',
                  index === activeIndex ? 'active' : '',
                  option.disabled ? 'disabled' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleSelect(option)}
              >
                {option.label}
                {option.hint && <span className="searchable-select-option-hint">{option.hint}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
