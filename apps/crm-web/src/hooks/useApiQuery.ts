import { useCallback, useEffect, useRef, useState } from "react";
import { cachedJson, fetchJson, readSessionKey } from "../lib/api";

interface ApiState<T> { key: string; data: T | null; loading: boolean; error: string | null; }
type RefetchOptions = { silent?: boolean };

export function useApiQuery<T>(path: string) {
  const key = `${readSessionKey()}\n${path}`;
  const initial = (): ApiState<T> => {
    const data = cachedJson<T>(path) ?? null;
    return { key, data, loading: data === null, error: null };
  };
  const [state, setState] = useState<ApiState<T>>(initial);
  const version = useRef(0);
  const active = useRef(true);
  const currentKey = useRef(key);
  currentKey.current = key;
  const refetch = useCallback(async (options?: RefetchOptions) => {
    const request = ++version.current;
    if (!options?.silent && active.current) {
      setState((current) => {
        const data = current.key === key ? current.data : cachedJson<T>(path) ?? null;
        return { key, data, loading: data === null, error: null };
      });
    }
    try {
      const data = await fetchJson<T>(path);
      if (active.current && currentKey.current === key && version.current === request) {
        setState({ key, data, loading: false, error: null });
      }
      return data;
    } catch (error) {
      if (active.current && currentKey.current === key && version.current === request) {
        setState((current) => ({ key, data: current.key === key ? current.data : null,
          loading: false, error: error instanceof Error ? error.message : "Ошибка загрузки" }));
      }
      throw error;
    }
  }, [key, path]);
  useEffect(() => {
    active.current = true;
    void refetch().catch(() => undefined);
    return () => { active.current = false; version.current++; };
  }, [refetch]);
  const visible = state.key === key ? state : initial();
  return { data: visible.data, loading: visible.loading, error: visible.error, refetch };
}
