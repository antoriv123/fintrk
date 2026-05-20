"use client";

import useSWR from "swr";

export function useFetch<T>(url: string | null) {
  const { data, error, isLoading, mutate } = useSWR<T>(url, {
    revalidateOnFocus: true,
    revalidateOnMount: true,
    revalidateIfStale: true,
    dedupingInterval: 2000,
  });
  return { data: data ?? null, loading: isLoading, error, refresh: mutate };
}

export { getMonthRange, getWeekRange, getDayRange } from "@/lib/hooks";
