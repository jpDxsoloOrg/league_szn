import { useEffect, useId, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Fuse from 'fuse.js';
import { Search } from 'lucide-react';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import { championshipsApi, eventsApi, playersApi } from '../../services/api';
import { useNavContext } from '../../hooks/useNavContext';
import {
  toChampionshipEntries,
  toEventEntries,
  toPageEntries,
  toWrestlerEntries,
  type SearchEntry,
} from './searchIndex';
import './SiteSearch.css';

export interface SiteSearchProps {
  open: boolean;
  onClose: () => void;
}

const MAX_RESULTS = 20;
const IDLE_PAGE_COUNT = 8;

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

/** Command-style search over wrestlers, events, championships and pages. */
export default function SiteSearch({ open, onClose }: SiteSearchProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navContext = useNavContext();
  const listId = useId();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [remoteEntries, setRemoteEntries] = useState<SearchEntry[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');

  useEffect(() => {
    if (!open || loadState === 'ready') return undefined;
    const controller = new AbortController();
    const { signal } = controller;

    const load = async () => {
      setLoadState('loading');
      const [players, events, championships] = await Promise.allSettled([
        playersApi.getDirectory(signal),
        eventsApi.getAll(undefined, signal),
        championshipsApi.getAll(signal),
      ]);
      if (signal.aborted) return;
      setRemoteEntries([
        ...(players.status === 'fulfilled' ? toWrestlerEntries(players.value) : []),
        ...(events.status === 'fulfilled' ? toEventEntries(events.value) : []),
        ...(championships.status === 'fulfilled' ? toChampionshipEntries(championships.value) : []),
      ]);
      const failed = [players, events, championships].every((result) => result.status === 'rejected');
      setLoadState(failed ? 'failed' : 'ready');
    };

    void load();
    return () => controller.abort();
    // loadState is left out on purpose: the fetch must not restart when it reports progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const pageEntries = useMemo(() => toPageEntries(navContext, t), [navContext, t]);

  const fuse = useMemo(() => new Fuse([...remoteEntries, ...pageEntries], {
    keys: [{ name: 'title', weight: 2 }, { name: 'subtitle', weight: 1 }],
    threshold: 0.35,
    ignoreLocation: true,
  }), [remoteEntries, pageEntries]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return pageEntries.slice(0, IDLE_PAGE_COUNT);
    return fuse.search(trimmed, { limit: MAX_RESULTS }).map((result) => result.item);
  }, [fuse, pageEntries, query]);

  const selectEntry = (entry: SearchEntry) => {
    onClose();
    navigate(entry.to);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (results.length === 0 ? 0 : (index - 1 + results.length) % results.length));
    } else if (event.key === 'Enter') {
      const entry = results[activeIndex];
      if (entry) {
        event.preventDefault();
        selectEntry(entry);
      }
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  const hasQuery = query.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title={t('search.title')} hideTitle className="site-search">
      <div className="site-search__field">
        <Search aria-hidden="true" size={20} />
        <input
          className="site-search__input"
          type="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={results.length > 0 ? optionId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label={t('search.title')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div id={listId} className="site-search__results" role="listbox" aria-label={t('search.results')}>
        {results.map((entry, index) => (
          <Link
            key={entry.id}
            id={optionId(index)}
            to={entry.to}
            role="option"
            aria-selected={index === activeIndex}
            tabIndex={-1}
            className={index === activeIndex ? 'site-search__option site-search__option--active' : 'site-search__option'}
            onClick={onClose}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <span className="site-search__option-text">
              <span className="site-search__option-title">{entry.title}</span>
              {entry.subtitle && <span className="site-search__option-subtitle">{entry.subtitle}</span>}
            </span>
            <Badge>{t(`search.kinds.${entry.kind}`)}</Badge>
          </Link>
        ))}
      </div>

      {hasQuery && results.length === 0 && (
        <p className="site-search__status" role="status">
          {loadState === 'loading' ? t('common.loading') : t('search.noResults')}
        </p>
      )}
      {loadState === 'failed' && <p className="site-search__status" role="status">{t('search.loadFailed')}</p>}
    </Modal>
  );
}
