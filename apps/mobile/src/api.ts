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
      birthDate: string | null;
      enteredAt: string | null;
      photoUrl: string | null;
      notes: string | null;
      version: number;
    }[];
  }>(`/animals?tamboId=${encodeURIComponent(tamboId)}`, { token });
}

export function fetchAnimalDetail(token: string, animalId: string) {
  return request<{
    item: {
      id: string;
      tamboId: string;
      earTag: string;
      status: string;
      birthDate: string | null;
      enteredAt: string | null;
      photoUrl: string | null;
      notes: string | null;
      version: number;
    };
    history: {
      kind: string;
      id: string;
      at: string;
      type: string;
      summary: string;
      notes: string | null;
    }[];
  }>(`/animals/${animalId}`, { token });
}

export function createAnimal(
  token: string,
  payload: {
    id: string;
    tamboId: string;
    earTag: string;
    status?: "ACTIVE" | "DRY" | "SOLD" | "DEAD";
    birthDate?: string | null;
    enteredAt?: string | null;
    photoUrl?: string | null;
    notes?: string | null;
    clientMutationId: string;
  },
) {
  return request<{ item: { id: string } }>("/animals", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function updateAnimal(
  token: string,
  animalId: string,
  payload: {
    earTag?: string;
    status?: "ACTIVE" | "DRY" | "SOLD" | "DEAD";
    birthDate?: string | null;
    enteredAt?: string | null;
    photoUrl?: string | null;
    notes?: string | null;
    version?: number;
    clientMutationId?: string;
  },
) {
  return request<{ item: { id: string; version: number } }>(
    `/animals/${animalId}`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify(payload),
    },
  );
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

export function fetchMilkingSessions(token: string, tamboId: string) {
  return request<{
    items: {
      id: string;
      tamboId: string;
      sessionDate: string;
      shift: "MORNING" | "AFTERNOON";
      totalLiters: string | number;
      status: "ACTIVE" | "VOIDED";
    }[];
  }>(
    `/milking-sessions?tamboId=${encodeURIComponent(tamboId)}&status=ACTIVE`,
    { token },
  );
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

export function correctMilkingSession(
  token: string,
  sessionId: string,
  payload: {
    id: string;
    totalLiters: number;
    notes?: string;
    clientMutationId: string;
  },
) {
  return request<{ corrected: { id: string } }>(
    `/milking-sessions/${sessionId}/correct`,
    {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function fetchReproEvents(token: string, tamboId: string) {
  return request<{
    items: {
      id: string;
      tamboId: string;
      animalId: string;
      type: string;
      eventAt: string;
      expectedCalvingAt: string | null;
      notes: string | null;
    }[];
  }>(`/repro-events?tamboId=${encodeURIComponent(tamboId)}`, { token });
}

export function createReproEvent(
  token: string,
  payload: {
    id: string;
    tamboId: string;
    animalId: string;
    type: "HEAT" | "SERVICE" | "EXPECTED_CALVING" | "CALVING" | "ABORTION" | "OTHER";
    eventAt: string;
    expectedCalvingAt?: string | null;
    notes?: string;
    clientMutationId: string;
  },
) {
  return request<{ item: { id: string } }>("/repro-events", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function fetchMilkDeliveries(token: string, tamboId: string) {
  return request<{
    items: {
      id: string;
      tamboId: string;
      periodStart: string;
      periodEnd: string;
      coldTankLiters: string | number;
      truckDeclaredLiters: string | number;
      coldTankTemperatureC: string | number | null;
      truckTemperatureC: string | number | null;
      status: string;
    }[];
  }>(
    `/milk-deliveries?tamboId=${encodeURIComponent(tamboId)}&status=ACTIVE`,
    { token },
  );
}

export function createMilkDelivery(
  token: string,
  payload: {
    id: string;
    tamboId: string;
    periodStart: string;
    periodEnd: string;
    coldTankLiters: number;
    truckDeclaredLiters: number;
    coldTankTemperatureC?: number | null;
    truckTemperatureC?: number | null;
    notes?: string;
    clientMutationId: string;
  },
) {
  return request<{ item: { id: string } }>("/milk-deliveries", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function createControlLechero(
  token: string,
  payload: {
    id: string;
    tamboId: string;
    performedAt: string;
    technicianName?: string;
    notes?: string;
    clientMutationId: string;
    lines: { animalId: string; bajadaNumber: number; liters: number }[];
  },
) {
  return request<{ item: { id: string } }>("/control-lecheros", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function fetchControlLecheros(token: string, tamboId: string) {
  return request<{
    items: {
      id: string;
      tamboId: string;
      performedAt: string;
      technicianName: string | null;
      status: string;
      lines: {
        animalId: string;
        bajadaNumber: number;
        liters: string | number;
        animal?: { earTag: string };
      }[];
    }[];
  }>(
    `/control-lecheros?tamboId=${encodeURIComponent(tamboId)}&status=ACTIVE`,
    { token },
  );
}
