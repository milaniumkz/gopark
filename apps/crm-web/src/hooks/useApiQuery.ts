import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type RefetchOptions = {
  silent?: boolean;
};

export function useApiQuery<T>(path: string) {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const refetch = useCallback(async (options?: RefetchOptions) => {
    if (!options?.silent) {
      setState({
        data: null,
        loading: true,
        error: null,
      });
    }

    try {
      const data = await fetchJson<T>(path);
      setState({
        data,
        loading: false,
        error: null,
      });
      return data;
    } catch (error) {
      setState((current) => ({
        data: options?.silent ? current.data : null,
        loading: false,
        error: error instanceof Error ? error.message : "Ошибка загрузки",
      }));
      throw error;
    }
  }, [path]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    ...state,
    refetch,
  };
}
