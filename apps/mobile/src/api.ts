import { API_URL } from "./config";

type LoginResponse = {
  accessToken: string;
  user: { id: string; email: string | null; name: string };
  tenant: { id: string; name: string };
  roles: string[];
  tamboIds: string[] | null;
};

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export function login(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchTambos(token: string) {
  return request<{ items: { id: string; name: string; bajadaCount: number }[] }>(
    "/tambos",
    { token },
  );
}

export function fetchAnimals(token: string, tamboId: string) {
  return request<{
    items: {
      id: string;
      tamboId: string;
      earTag: string;
      status: string;
    }[];
  }>(`/animals?tamboId=${encodeURIComponent(tamboId)}`, { token });
}

export function fetchActiveWithdrawals(token: string, tamboId: string) {
  return request<{
    items: {
      id: string;
      tamboId: string;
      animalId: string;
      type: string;
      eventAt: string;
      productName: string | null;
      milkWithdrawalUntil: string | null;
      notes: string | null;
      animal?: { id: string; earTag: string };
    }[];
  }>(
    `/health-events/active-withdrawals?tamboId=${encodeURIComponent(tamboId)}`,
    { token },
  );
}

export function createHealthEvent(
  token: string,
  payload: {
    id: string;
    tamboId: string;
    animalId: string;
    type: "MASTITIS" | "TREATMENT" | "OTHER";
    eventAt: string;
    productName?: string;
    milkWithdrawalUntil?: string | null;
    notes?: string;
    clientMutationId: string;
  },
) {
  return request<{ item: { id: string } }>("/health-events", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function createMilkingSession(
  token: string,
  payload: {
    id: string;
    tamboId: string;
    sessionDate: string;
    shift: "MORNING" | "AFTERNOON";
    totalLiters: number;
    notes?: string;
    clientMutationId: string;
  },
) {
  return request<{ item: { id: string } }>("/milking-sessions", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
