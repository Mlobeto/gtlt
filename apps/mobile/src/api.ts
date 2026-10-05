import { File } from "expo-file-system";
import { API_URL } from "./config";

export class ApiError extends Error {
  status: number;
  code?: string;
  body?: any;
  constructor(message: string, status: number, code?: string, body?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
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
      body,
    );
  }
  return body as T;
}

export function login(email: string, password: string, tenantId?: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, ...(tenantId ? { tenantId } : {}) }),
  });
}

export type BillingSummary = {
  activeTambos: number;
  installingTambos: number;
  unitPriceArs: number;
  monthlyTotalArs: number;
  nextTotalArs: number;
  planName: string;
  courtesy: boolean;
};

export type TamboLifecycleState = "ACTIVE" | "INSTALLING" | "ARCHIVED";

export type TamboHardware = {
  pumpSensor: boolean;
  flowMeters: boolean;
  rfidReaders: boolean;
};

export type EquipmentLine = {
  kind: string;
  label: string;
  quantity: number;
};

export type TamboRequestStatus =
  | "SENT"
  | "QUOTED"
  | "ACCEPTED"
  | "DECLINED"
  | "REJECTED"
  | "CANCELLED"
  | "CONVERTED";

export type QuoteItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
};

export type PowerSupply = "MONOPHASE" | "THREEPHASE";

export type TamboRequestItem = {
  id: string;
  name: string;
  bajadaCount: number;
  hardware: TamboHardware;
  equipmentList: EquipmentLine[];
  serviceProviderId: string | null;
  notes: string | null;
  powerSupply?: PowerSupply | null;
  status: TamboRequestStatus;
  quoteItems: QuoteItem[] | null;
  quoteTotal: number | null;
  quoteCurrency: string | null;
  quoteValidUntil: string | null;
  quoteNotes: string | null;
  rejectionReason: string | null;
  serviceProvider?: { id: string; name: string } | null;
};

export type TamboItem = {
  id: string;
  name: string;
  bajadaCount: number;
  active?: boolean;
  activatedAt?: string | null;
  state?: TamboLifecycleState;
  serviceRequiresOwnerApproval?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  powerSupply?: PowerSupply | null;
};

export function fetchTambos(token: string, includeArchived = false) {
  const q = includeArchived ? "?includeArchived=1" : "";
  return request<{ items: TamboItem[] }>(`/tambos${q}`, { token });
}

export function fetchBillingSummary(token: string) {
  return request<BillingSummary>("/tambos/billing-summary", { token });
}

export function fetchEquipmentPreview(
  token: string,
  query: { bajadaCount: number } & TamboHardware,
) {
  const params = new URLSearchParams({
    bajadaCount: String(query.bajadaCount),
    pumpSensor: String(query.pumpSensor),
    flowMeters: String(query.flowMeters),
    rfidReaders: String(query.rfidReaders),
  });
  return request<{ items: EquipmentLine[]; hardware: TamboHardware }>(
    `/tambo-requests/equipment-preview?${params}`,
    { token },
  );
}

export function fetchTamboRequests(token: string) {
  return request<{
    items: TamboRequestItem[];
    serviceProviders: { id: string; name: string }[];
  }>("/tambo-requests", { token });
}

export function createTamboRequest(
  token: string,
  payload: {
    name: string;
    address?: string;
    bajadaCount: number;
    hardware: TamboHardware;
    serviceProviderId?: string | null;
    notes?: string;
    powerSupply?: PowerSupply | null;
  },
) {
  return request<{ item: TamboRequestItem }>("/tambo-requests", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function acceptTamboRequest(token: string, id: string) {
  return request<{ item: TamboRequestItem }>(`/tambo-requests/${id}/accept`, {
    method: "POST",
    token,
    body: "{}",
  });
}

export function declineTamboRequest(token: string, id: string, reason?: string) {
  return request<{ item: TamboRequestItem }>(`/tambo-requests/${id}/decline`, {
    method: "POST",
    token,
    body: JSON.stringify({ reason }),
  });
}

export function cancelTamboRequest(token: string, id: string) {
  return request<{ item: TamboRequestItem }>(`/tambo-requests/${id}/cancel`, {
    method: "POST",
    token,
    body: "{}",
  });
}

export function updateTambo(
  token: string,
  tamboId: string,
  payload: {
    name?: string;
    bajadaCount?: number;
    serviceRequiresOwnerApproval?: boolean;
    powerSupply?: PowerSupply | null;
  },
) {
  return request<{ item: TamboItem }>(`/tambos/${tamboId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function setTamboActive(token: string, tamboId: string, active: boolean) {
  return request<{ item: TamboItem; billing: BillingSummary }>(`/tambos/${tamboId}/active`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ active }),
  });
}

export function requestDeviceRemoval(token: string, tamboId: string) {
  return request<{ item: ServiceRequestItem }>(
    `/tambos/${tamboId}/request-device-removal`,
    { method: "POST", token, body: "{}" },
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
  const form = new FormData();
  form.append("file", new File(localUri));

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

/** Fuente para <Image>: el blob no es público, se lee autenticado. */
export function photoSource(token: string, url: string) {
  const params = new URLSearchParams({ url, access_token: token });
  return { uri: `${API_URL}/uploads/file?${params.toString()}` };
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
  workReport?: {
    id: string;
    status: string;
    replacedPartsCount: number;
  } | null;
};

export type PartLifeStatus = "OK" | "SOON" | "OVERDUE";

export type PartLife = {
  kind: "NONE" | "USAGE_BASED";
  status?: PartLifeStatus;
  percent?: number;
  usageSource?: "COUNTED" | "ESTIMATED";
  byUsage?: {
    percent: number;
    milkings: number;
    threshold: number;
    usageSource: "COUNTED" | "ESTIMATED";
    estimatedReplacementDate: string | null;
  };
  byTime?: {
    percent: number;
    days: number;
    lifeDays: number;
    lifeMonths: number;
    estimatedReplacementDate: string | null;
  };
  estimatedReplacementDate?: string | null;
};

export type PartInstanceItem = {
  id: string;
  tamboId: string;
  bajadaNumber: number | null;
  brandModel: string | null;
  installedAt: string;
  installedAtApprox?: boolean;
  photoUrl: string | null;
  notes: string | null;
  attributes?: Record<string, string | number | boolean>;
  label?: string | null;
  quantityPerInstance?: number;
  partType: {
    id: string;
    code: string;
    name: string;
    pattern: string;
    fields?: PartTypeField[];
    allowsMultiple?: boolean;
    quantityPerInstance?: number;
  };
  life?: PartLife;
  effectiveUsageThreshold?: number | null;
  effectiveLifeMonths?: number | null;
  coldDetail: {
    brand: string;
    model: string;
    capacityLiters: string | number;
    coolingCapacity: string;
    controllerModel: string | null;
  } | null;
};

export type PartFieldKind = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";

export type PartTypeField = {
  id: string;
  key: string;
  label: string;
  kind: PartFieldKind;
  unit: string | null;
  options: string[];
  required: boolean;
  min: number | null;
  max: number | null;
  helpText: string | null;
  sortOrder: number;
  active?: boolean;
};

export type PartTypeItem = {
  id: string;
  code: string;
  name: string;
  pattern: "USAGE_BASED" | "REACTIVE" | "BRANDED";
  appliesPerBajada: boolean;
  allowsMultiple?: boolean;
  quantityPerInstance?: number;
  fields?: PartTypeField[];
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

type AcceptedInvite = {
  item: {
    id: string;
    roles: string[];
    tenant: { id: string; name: string };
    tambos: { tamboId: string }[];
    user: { id: string; email: string | null; name: string };
  };
};

/** Invitado sin cuenta: crea su clave y activa la membership con el código. */
export function acceptInviteRegister(payload: {
  inviteToken: string;
  password: string;
  name?: string;
}) {
  return request<AcceptedInvite>("/memberships/accept-invite/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Usuario que ya tiene cuenta: activa la invitación estando logueado. */
export function acceptInvite(token: string, inviteToken: string) {
  return request<AcceptedInvite>("/memberships/accept-invite", {
    method: "POST",
    token,
    body: JSON.stringify({ inviteToken }),
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
    serviceProviderId?: string;
  },
) {
  return request<{ item: { id: string }; inviteToken: string | null }>("/memberships/invite-technician", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function fetchTamboServiceProvider(token: string, tamboId: string) {
  return request<{
    catalog: { id: string; name: string; isDefault: boolean; active: boolean }[];
    selectedId: string | null;
  }>(`/tambos/${encodeURIComponent(tamboId)}/service-provider`, { token });
}

export function fetchTechnicianWorkspace(token: string, tamboId: string) {
  return request<{
    tamboId: string;
    tambo?: {
      id: string;
      name: string;
      serviceRequiresOwnerApproval: boolean;
      latitude?: number | null;
      longitude?: number | null;
      address?: string | null;
      powerSupply?: PowerSupply | null;
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
  installedAtApprox?: boolean;
  brandModel?: string | null;
  photoUrl?: string | null;
  notes?: string | null;
  clientMutationId?: string;
  attributes?: Record<string, string | number | boolean>;
  label?: string | null;
};

export function createPartInstance(token: string, payload: PartInstancePayload) {
  return request<{ item: PartInstanceItem }>("/part-instances", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function patchPartInstance(
  token: string,
  partInstanceId: string,
  payload: {
    installedAt?: string;
    installedAtApprox?: boolean;
    brandModel?: string | null;
    notes?: string | null;
    photoUrl?: string | null;
    attributes?: Record<string, string | number | boolean>;
    label?: string | null;
  },
) {
  return request<{ item: PartInstanceItem }>(`/part-instances/${partInstanceId}`, {
    method: "PATCH",
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

export type WorkReportMeasurement = {
  label: string;
  value: string;
  unit?: string;
};

export type WorkReportReplacedPart = {
  id: string;
  partTypeId: string;
  partTypeName: string;
  bajadaNumber: number | null;
  label: string | null;
  installedAt: string;
};

export type WorkReportItem = {
  id: string;
  tamboId: string;
  tambo?: { id: string; name: string } | null;
  serviceRequestId: string | null;
  serviceRequest?: {
    id: string;
    category: string;
    status: string;
    description: string;
  } | null;
  authorId: string;
  authorRole: string;
  author?: { id: string; name: string } | null;
  performedAt: string;
  summary: string;
  tasks: string[];
  hoursWorked: number | null;
  measurements: WorkReportMeasurement[];
  photoUrls: string[];
  status: "DRAFT" | "SUBMITTED";
  submittedAt: string | null;
  replacedPartsCount: number;
  replacedParts: WorkReportReplacedPart[];
};

export type PartHistoryItem = {
  id: string;
  partTypeName: string;
  bajadaNumber: number | null;
  label: string | null;
  installedAt: string;
  installedAtApprox: boolean;
  replacedAt: string;
  daysInService: number;
  estimatedMilkingsInService: number | null;
  estimatedMilkingsNote: string | null;
  createdBy: { id: string; name: string } | null;
  installedInReport: {
    id: string;
    status: string;
    summary: string;
    performedAt: string;
    authorRole: string;
  } | null;
};

export function fetchWorkReports(
  token: string,
  tamboId: string,
  query?: { from?: string; to?: string; serviceRequestId?: string },
) {
  const q = new URLSearchParams({ tamboId });
  if (query?.from) q.set("from", query.from);
  if (query?.to) q.set("to", query.to);
  if (query?.serviceRequestId) q.set("serviceRequestId", query.serviceRequestId);
  return request<{ items: WorkReportItem[] }>(`/work-reports?${q.toString()}`, { token });
}

export function fetchWorkReport(token: string, id: string) {
  return request<{ item: WorkReportItem }>(`/work-reports/${id}`, { token });
}

export function createWorkReport(
  token: string,
  payload: { tamboId: string; serviceRequestId?: string | null; performedAt?: string },
) {
  return request<{ item: WorkReportItem }>("/work-reports", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function patchWorkReport(
  token: string,
  id: string,
  payload: {
    performedAt?: string;
    summary?: string;
    tasks?: string[];
    hoursWorked?: number | null;
    measurements?: WorkReportMeasurement[];
    photoUrls?: string[];
  },
) {
  return request<{ item: WorkReportItem }>(`/work-reports/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export function replaceWorkReportParts(
  token: string,
  id: string,
  payload: {
    instanceIds: string[];
    installedAt: string;
    installedAtApprox?: boolean;
    notes?: string | null;
  },
) {
  return request<{ item: WorkReportItem; parts: PartInstanceItem[] }>(
    `/work-reports/${id}/replace-parts`,
    {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function submitWorkReport(token: string, id: string) {
  return request<{ item: WorkReportItem }>(`/work-reports/${id}/submit`, {
    method: "POST",
    token,
    body: "{}",
  });
}

export function replacePartInstancesBatch(
  token: string,
  payload: {
    instanceIds: string[];
    installedAt: string;
    installedAtApprox?: boolean;
    notes?: string | null;
  },
) {
  return request<{ item: WorkReportItem; parts: PartInstanceItem[] }>(
    "/part-instances/replace-batch",
    {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    },
  );
}

export function fetchPartHistory(
  token: string,
  query: { tamboId: string; partTypeId: string; bajadaNumber?: number | null; label?: string | null },
) {
  const q = new URLSearchParams({
    tamboId: query.tamboId,
    partTypeId: query.partTypeId,
  });
  if (query.bajadaNumber != null) q.set("bajadaNumber", String(query.bajadaNumber));
  if (query.label) q.set("label", query.label);
  return request<{ items: PartHistoryItem[] }>(`/part-instances/history?${q.toString()}`, {
    token,
  });
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

export function updateMyTamberoRole(token: string, enabled: boolean) {
  return request<{ roles: string[]; accessToken: string }>("/memberships/me/tambero-role", {
    method: "PATCH",
    token,
    body: JSON.stringify({ enabled }),
  });
}

export function fetchPumpStatus(token: string, tamboId: string) {
  return request<{
    status: "ON" | "OFF" | null;
    item?: { occurredAt: string; status: "ON" | "OFF" };
  }>(`/tambos/${encodeURIComponent(tamboId)}/pump-status`, { token });
}

export type PendingConsultPhoto = {
  id: string;
  photoUrl: string;
  note: string | null;
  takenAt: string;
  animalId?: string;
  animal?: { id: string; earTag: string };
};

export function fetchPendingPhotos(token: string, tamboId: string) {
  return request<{ items: PendingConsultPhoto[] }>(
    `/tambos/${encodeURIComponent(tamboId)}/photos/pending-review`,
    { token },
  );
}

export function reviewPhoto(token: string, animalId: string, photoId: string) {
  return request<{ item?: unknown }>(
    `/animals/${encodeURIComponent(animalId)}/photos/${encodeURIComponent(photoId)}/review`,
    { method: "PATCH", token },
  );
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

export function updateTamboLocation(
  token: string,
  tamboId: string,
  payload: { latitude: number; longitude: number; address?: string },
) {
  return request<{
    item: {
      id: string;
      name: string;
      latitude: number | null;
      longitude: number | null;
      address: string | null;
    };
  }>(`/tambos/${tamboId}/location`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export type DeviceKind = "VACUUM_PUMP_SENSOR" | "FLOW_METER" | "RFID_READER";

export type DeviceItem = {
  id: string;
  tamboId: string;
  kind: DeviceKind;
  bajadaNumber: number | null;
  label: string | null;
  lastSeenAt: string | null;
  connected: boolean;
  createdAt: string;
};

export function fetchDevices(token: string, tamboId: string) {
  return request<{
    items: DeviceItem[];
    canManage: boolean;
    tambo: { id: string; bajadaCount: number } | null;
  }>(`/devices?tamboId=${encodeURIComponent(tamboId)}`, { token });
}

export function createDevice(
  token: string,
  payload: {
    tamboId: string;
    kind: DeviceKind;
    bajadaNumber?: number | null;
    label?: string | null;
  },
) {
  return request<{ item: DeviceItem; deviceToken: string }>("/devices", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function rotateDeviceToken(token: string, id: string) {
  return request<{ item: DeviceItem; deviceToken: string }>(
    `/devices/${id}/rotate-token`,
    { method: "POST", token, body: "{}" },
  );
}

export function retireDevice(token: string, id: string) {
  return request<{ item: DeviceItem }>(`/devices/${id}/retire`, {
    method: "POST",
    token,
    body: "{}",
  });
}

export function isTechnicianOnly(roles: string[]): boolean {
  const farm = ["TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"];
  return roles.includes("TECNICO") && !roles.some((r) => farm.includes(r));
}

export function isOwnerOrAdmin(roles: string[]): boolean {
  return roles.includes("DUENIO") || roles.includes("ADMIN");
}
