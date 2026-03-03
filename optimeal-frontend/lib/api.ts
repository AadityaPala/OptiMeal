// lib/api.ts
const DEFAULT_DEV_API_BASE_URL = "http://localhost:8000";

// Resolved at module load — may be undefined during Next.js SSG build passes.
// The actual guard runs lazily inside fetchAPI so the build never throws here.
export const API_BASE_URL: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production" ? "" : DEFAULT_DEV_API_BASE_URL);

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface FetchAPIOptions<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  headers?: HeadersInit;
  /** When true, do not attempt to parse JSON (useful for endpoints returning no body) */
  noJson?: boolean;
}

/**
 * Generic wrapper around fetch for talking to the FastAPI backend.
 * Throws on non-2xx responses with a normalized error object.
 */
export async function fetchAPI<TResponse = unknown, TBody = unknown>(
  path: string,
  options: FetchAPIOptions<TBody> = {}
): Promise<TResponse> {
  const base = API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. Add it to your Vercel environment variables."
    );
  }
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const { method = "GET", body, headers, noJson } = options;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body !== undefined && body !== null) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const res = await fetch(url, init);

  let parsed: unknown = null;
  const text = await res.text();

  if (!noJson && text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const error: any = new Error(
      (parsed as any)?.detail ||
        (parsed as any)?.message ||
        `Request failed with status ${res.status}`
    );
    error.status = res.status;
    error.payload = parsed;
    throw error;
  }

  return (parsed ?? ({} as TResponse)) as TResponse;
}