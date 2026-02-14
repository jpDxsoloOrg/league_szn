import { useState, useEffect } from 'react';
import { stipulationsApi } from '../services/api';
import type { Stipulation } from '../types';

export function useStipulations() {
  const [stipulations, setStipulations] = useState<Stipulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchStipulations = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await stipulationsApi.getAll(abortController.signal);
        setStipulations(result);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Failed to load stipulations');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchStipulations();
    return () => abortController.abort();
  }, []);

  return { stipulations, loading, error };
}
