import { useState, useEffect } from 'react';
import { matchTypesApi } from '../services/api';
import type { MatchType } from '../types';

export function useMatchTypes() {
  const [matchTypes, setMatchTypes] = useState<MatchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchMatchTypes = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await matchTypesApi.getAll(abortController.signal);
        setMatchTypes(result);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Failed to load match types');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchMatchTypes();
    return () => abortController.abort();
  }, []);

  return { matchTypes, loading, error };
}
