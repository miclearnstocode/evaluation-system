type ApiResponse = {
  error?: string;
};

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
  const localApiHost =
    typeof window !== "undefined" && window.location.hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
  const apiBaseUrl =
    configuredApiBaseUrl || (process.env.NODE_ENV === "development" ? `http://${localApiHost}:5000` : "");
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      cache: "no-store",
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Cannot connect to the backend. Check NEXT_PUBLIC_API_BASE_URL in the frontend environment file.",
      );
    }
    throw error;
  }

  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body
        ? (body as ApiResponse).error
        : undefined;
    throw new Error(message ?? "The request could not be completed.");
  }
  return body as T;
}
