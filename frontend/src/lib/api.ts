/**
 * Centralized LogiShield API configuration.
 *
 * Every frontend API request must go through API_BASE_URL /
 * apiUrl() from this module. Never hard-code localhost or the
 * production URL inside a page component.
 *
 * Production reads NEXT_PUBLIC_API_URL (set in Vercel):
 *
 *   NEXT_PUBLIC_API_URL=https://logishield-api.onrender.com
 *
 * Local development sets the same variable in
 * frontend/.env.local:
 *
 *   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
 *
 * If the variable is missing, production builds fail fast
 * instead of silently calling http://127.0.0.1:8000. Only
 * `next dev` falls back to the local API server.
 */

const LOCAL_FALLBACK = "http://127.0.0.1:8000";

function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;

  if (configured && configured.trim() !== "") {
    return configured.trim().replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not configured. Set it to the LogiShield API base URL (for example https://logishield-api.onrender.com) in the environment settings."
    );
  }

  console.warn(
    `[api] NEXT_PUBLIC_API_URL is not set - falling back to ${LOCAL_FALLBACK} for local development only.`
  );

  return LOCAL_FALLBACK;
}

export const API_BASE_URL: string = resolveApiBaseUrl();

/**
 * Build an absolute API URL from a path such as
 * "/api/v1/dashboard/overview".
 */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Error thrown by apiFetch when the network request fails or
 * the API responds with a non-2xx status.
 */
export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type FastApiErrorBody = {
  detail?: unknown;
};

function extractDetail(body: unknown): string | null {
  if (
    body !== null &&
    typeof body === "object" &&
    "detail" in body
  ) {
    const detail = (body as FastApiErrorBody).detail;

    if (typeof detail === "string") {
      return detail;
    }
  }

  return null;
}

/**
 * Small fetch wrapper for all dashboard API calls.
 *
 * - resolves the URL against API_BASE_URL
 * - never caches (live operational data)
 * - throws ApiError with a useful message on failure so pages
 *   can show real connection errors instead of fake zeros.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      cache: "no-store",
      ...init,
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error
        ? `Unable to reach the LogiShield API (${API_BASE_URL}): ${error.message}`
        : `Unable to reach the LogiShield API (${API_BASE_URL}).`
    );
  }

  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail = extractDetail(body);

    throw new ApiError(
      detail ||
        `LogiShield API returned HTTP ${response.status} for ${path}.`,
      response.status
    );
  }

  return body as T;
}