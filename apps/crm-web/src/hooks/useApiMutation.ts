import { useState } from "react";
import { postJson } from "../lib/api";

type MutationState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useApiMutation<TResponse, TBody>(path: string) {
  const [state, setState] = useState<MutationState<TResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  async function mutate(body: TBody) {
    setState({
      data: null,
      loading: true,
      error: null,
    });

    try {
      const data = await postJson<TResponse, TBody>(path, body);
      setState({
        data,
        loading: false,
        error: null,
      });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setState({
        data: null,
        loading: false,
        error: message,
      });
      throw error;
    }
  }

  return {
    ...state,
    mutate,
  };
}
