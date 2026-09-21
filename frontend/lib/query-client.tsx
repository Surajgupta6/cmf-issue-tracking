"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't retry on 4xx errors — they're client errors, not network issues
            retry: (failureCount, error: unknown) => {
              const status = (error as { response?: { status?: number } })
                ?.response?.status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
            staleTime: 30 * 1000, // 30s — dashboard data doesn't need real-time freshness
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
