import { API_URL } from "./config";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

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
    throw new ApiError(
      body.error ?? `HTTP ${res.status}`,
      res.status,
      body.code,
    );
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
  return request<{
    items: {
      id: string;
      name: string;
      bajadaCount: number;
      serviceRequiresOwnerApproval?: boolean;
    }[];
  }>("/tambos", { token });
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
      breed: string | null;
      motherId: string | null;
      sireId: string | null;
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
    breed?: string | null;
    motherId?: string | null;
    sireId?: string | null;
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
    breed?: string | null;
    motherId?: string | null;
    sireId?: string | null;
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

/** Timeline unificado (health/repro/transfer/control/peso/fotos) para la ficha del animal. */
export function fetchAnimalTimeline(token: string, animalId: string) {
  return request<{
    items: {
      kind: string;
      id: string;
      at: string;
      type: string;
      summary: string;
      notes: string | null;
    }[];
  }>(`/animals/${animalId}/timeline`, { token });
}

export function fetchSires(token: string) {
  return request<{
    items: { id: string; name: string; isExternal: boolean }[];
  }>("/sires", { token });
}

export function createSire(
  token: string,
  payload: { name: string; isExternal?: boolean },
) {
  return request<{ item: { id: string; name: string; isExternal: boolean } }>(
    "/sires",
    {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function createWeightEvent(
  token: string,
  payload: {
    id?: string;
    tamboId: string;
    animalId: string;
    weightKg: number;
    method?: "SCALE" | "TAPE" | "VISUAL_ESTIMATE";
    measuredAt: string;
    notes?: string;
    clientMutationId?: string;
  },
) {
  return request<{ item: { id: string } }>("/weight-events", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

/** Sube una foto local (uri del celular) a Azure Blob Storage y devuelve su URL pública. */
export async function uploadPhoto(token: string, localUri: string): Promise<{ url: string }> {
  const filename = localUri.split("/").pop() || "photo.jpg";
  const ext = filename.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  const form = new FormData();
  // React Native FormData: objeto con uri/name/type en vez de un Blob real.
  form.append("file", { uri: localUri, name: filename, type } as unknown as Blob);

  const res = await fetch(`${API_URL}/uploads/photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.code);
  }
  return body;
}

/** Registra una foto (perfil o consulta) ya subida (photoUrl resuelta) para un animal. */
export function createAnimalPhoto(
  token: string,
  animalId: string,
  payload: {
    photoUrl: string;
    type: "PROFILE" | "CONSULT";
    note?: string;
    takenAt: string;
    clientMutationId?: string;
  },
) {
  return request<{ item: { id: string } }>(`/animals/${animalId}/photos`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
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

export type ServiceRequestItem = {
  id: string;
  tamboId: string;
  category: string;
  description: string;
  urgency: "NORMAL" | "URGENT";
  status: string;
  relatedPartInstanceId: string | null;
  assignedTechnicianUserId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  approvedAt?: string | null;
  relatedPartInstance?: {
    id: string;
    bajadaNumber: number | null;
    brandModel: string | null;
    partType?: { name: string; code: string };
    coldDetail?: { brand: string; model: string } | null;
  } | null;
  createdBy?: { id: string; name: string };
  assignedTechnician?: { id: string; name: string; email: string | null } | null;
};

export type PartInstanceItem = {
  id: string;
  tamboId: string;
  bajadaNumber: number | null;
  brandModel: string | null;
  installedAt: string;
  photoUrl: string | null;
  notes: string | null;
  partType: { id: string; code: string; name: string; pattern: string };
  coldDetail: {
    brand: string;
    model: string;
    capacityLiters: string | number;
    coolingCapacity: string;
    controllerModel: string | null;
  } | null;
};

export type PartTypeItem = {
  id: string;
  code: string;
  name: string;
  pattern: "USAGE_BASED" | "REACTIVE" | "BRANDED";
  appliesPerBajada: boolean;
};

export type AppNotification = {
  id: string;
  tamboId: string | null;
  type: string;
  title: string;
  body: string;
  payload: { serviceRequestId?: string; urgency?: string; status?: string };
  readAt: string | null;
  createdAt: string;
};

export function acceptTechnicianInviteRegister(payload: {
  tenantId: string;
  email?: string;
  phone?: string;
  password: string;
  name?: string;
}) {
  return request<{
    item: {
      id: string;
      tenant: { id: string; name: string };
      tambos: { tamboId: string }[];
      user: { id: string; email: string | null; name: string };
    };
  }>("/memberships/accept-invite/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function inviteTechnician(
  token: string,
  payload: {
    tamboId: string;
    email?: string;
    phone?: string;
    name?: string;
    companyName?: string;
  },
) {
  return request<{ item: { id: string } }>("/memberships/invite-technician", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function fetchTechnicianWorkspace(token: string, tamboId: string) {
  return request<{
    tamboId: string;
    tambo?: {
      id: string;
      name: string;
      serviceRequiresOwnerApproval: boolean;
    } | null;
    partInstances: PartInstanceItem[];
    serviceRequests: ServiceRequestItem[];
  }>(
    `/service-requests/workspace?tamboId=${encodeURIComponent(tamboId)}`,
    { token },
  );
}

export function createServiceRequest(
  token: string,
  payload: {
    tamboId: string;
    category: "VACUUM_PUMP" | "COLD_EQUIPMENT" | "MILKING_GROUP" | "OTHER";
    description: string;
    urgency?: "NORMAL" | "URGENT";
    relatedPartInstanceId?: string | null;
  },
) {
  return request<{ item: ServiceRequestItem }>("/service-requests", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function updateServiceRequest(
  token: string,
  id: string,
  payload: {
    status?: "OPEN" | "ACKNOWLEDGED" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
    assignedTechnicianUserId?: string | null;
  },
) {
  return request<{ item: ServiceRequestItem }>(`/service-requests/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function approveServiceRequest(token: string, id: string) {
  return request<{ item: ServiceRequestItem }>(
    `/service-requests/${id}/approve`,
    { method: "POST", token, body: "{}" },
  );
}

export function rejectServiceRequest(token: string, id: string) {
  return request<{ item: ServiceRequestItem }>(
    `/service-requests/${id}/reject`,
    { method: "POST", token, body: "{}" },
  );
}

export function fetchServiceRequests(
  token: string,
  tamboId: string,
  status?: string,
) {
  const q = new URLSearchParams({ tamboId });
  if (status) q.set("status", status);
  return request<{ items: ServiceRequestItem[] }>(
    `/service-requests?${q.toString()}`,
    { token },
  );
}

export function fetchPartInstances(token: string, tamboId: string) {
  return request<{ items: PartInstanceItem[] }>(
    `/part-instances?tamboId=${encodeURIComponent(tamboId)}`,
    { token },
  );
}

export function fetchPartTypes(token: string) {
  return request<{ items: PartTypeItem[] }>("/part-types", { token });
}

type PartInstancePayload = {
  id?: string;
  tamboId: string;
  partTypeId: string;
  bajadaNumber?: number | null;
  installedAt: string;
  brandModel?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  clientMutationId?: string;
};

export function createPartInstance(token: string, payload: PartInstancePayload) {
  return request<{ item: PartInstanceItem }>("/part-instances", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function replacePartInstance(
  token: string,
  partInstanceId: string,
  payload: Omit<PartInstancePayload, "tamboId">,
) {
  return request<{ item: PartInstanceItem }>(
    `/part-instances/${partInstanceId}/replace`,
    {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function fetchNotifications(token: string) {
  return request<{ items: AppNotification[]; unreadCount: number }>(
    "/notifications",
    { token },
  );
}

export function markNotificationRead(token: string, id: string) {
  return request<{ item: AppNotification }>(`/notifications/${id}/read`, {
    method: "POST",
    token,
    body: "{}",
  });
}

export function markAllNotificationsRead(token: string) {
  return request<{ updated: number }>("/notifications/read-all", {
    method: "POST",
    token,
    body: "{}",
  });
}

export function updateTamboSettings(
  token: string,
  tamboId: string,
  payload: { serviceRequiresOwnerApproval?: boolean; name?: string },
) {
  return request<{
    item: {
      id: string;
      name: string;
      serviceRequiresOwnerApproval: boolean;
    };
  }>(`/tambos/${tamboId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function isTechnicianOnly(roles: string[]): boolean {
  const farm = ["TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"];
  return roles.includes("TECNICO") && !roles.some((r) => farm.includes(r));
}

export function isOwnerOrAdmin(roles: string[]): boolean {
  return roles.includes("DUENIO") || roles.includes("ADMIN");
}
