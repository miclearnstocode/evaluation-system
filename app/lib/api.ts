type ApiResponse = {
  error?: string;
};

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
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
        "Cannot connect to the backend. Start the Flask API and check BACKEND_API_URL in next.config.ts.",
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
