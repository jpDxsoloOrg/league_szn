import { useCallback, useState } from 'react';

interface ShowMoreState {
  resetKey: string;
  count: number;
}

/**
 * How many rows of a long list to render. Changing `resetKey` (usually the
 * active filters) drops back to one page, and stays there if the key changes
 * back, so clearing a search does not bring the old row count with it.
 */
export function useShowMore(pageSize: number, resetKey: string) {
  const [state, setState] = useState<ShowMoreState>({ resetKey, count: pageSize });
  // Set during render, so the old count never reaches the screen.
  if (state.resetKey !== resetKey) setState({ resetKey, count: pageSize });
  const count = state.resetKey === resetKey ? state.count : pageSize;

  /** Pass the rows on screen when that can be more than `count`. */
  const showMore = useCallback((shown: number = count) => {
    setState({ resetKey, count: Math.max(count, shown) + pageSize });
  }, [count, pageSize, resetKey]);

  return { count, showMore };
}
