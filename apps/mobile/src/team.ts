import { ApiError, SESSION_REVOKED_MESSAGE } from "./http";

export type TeamRole = "TAMBERO" | "VETERINARIO";
export type TeamStatus = "ACTIVE" | "PENDING" | "REVOKED";

export type TeamMember = {
  id: string;
  roles: string[];
  status: TeamStatus;
  companyName: string | null;
  revokedAt: string | null;
  manageable: boolean;
  sharedAccount: boolean;
  tamboIds: string[];
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
};

export type CreateMemberInput = {
  tamboId: string;
  name: string;
  phone?: string;
  email?: string;
  role: TeamRole;
};

export type UpdateMemberInput = {
  name?: string;
  phone?: string;
  email?: string;
  role?: TeamRole;
  tamboIds?: string[];
};

export type InviteMemberInput = {
  tamboId: string;
  name?: string;
  phone?: string;
  email?: string;
  role: TeamRole;
};

export type RequestFn = <T>(path: string, options?: RequestInit & { token?: string }) => Promise<T>;

function omittedBlank(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function compactBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      body[key] = trimmed;
      continue;
    }
    body[key] = value;
  }
  return body;
}

export function createTeamApi(request: RequestFn) {
  function listTeam(token: string, tamboId: string, includeRevoked = true) {
    const query = new URLSearchParams({
      tamboId,
      includeRevoked: includeRevoked ? "true" : "false",
    });
    return request<{ items: TeamMember[] }>(`/memberships?${query.toString()}`, { token });
  }

  function createMember(token: string, input: CreateMemberInput) {
    const phone = omittedBlank(input.phone);
    const email = omittedBlank(input.email)?.toLowerCase();
    const body = compactBody({
      tamboId: input.tamboId,
      name: input.name,
      role: input.role,
      phone,
      email,
    });
    return request<{ item: TeamMember; temporaryPassword: string }>("/memberships/create-member", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  }

  function updateMember(token: string, membershipId: string, patch: UpdateMemberInput) {
    const body = compactBody({
      name: patch.name,
      phone: patch.phone,
      email: patch.email === undefined ? undefined : patch.email.toLowerCase(),
      role: patch.role,
      tamboIds: patch.tamboIds,
    });
    return request<{ item: TeamMember }>(`/memberships/${membershipId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  }

  function resetMemberPassword(token: string, membershipId: string) {
    return request<{ temporaryPassword: string }>(`/memberships/${membershipId}/reset-password`, {
      method: "POST",
      token,
    });
  }

  function revokeMember(token: string, membershipId: string) {
    return request<{ item: TeamMember }>(`/memberships/${membershipId}/revoke`, {
      method: "POST",
      token,
    });
  }

  function reactivateMember(token: string, membershipId: string) {
    return request<{ item: TeamMember }>(`/memberships/${membershipId}/reactivate`, {
      method: "POST",
      token,
    });
  }

  function cancelInvite(token: string, membershipId: string) {
    return request<Record<string, never>>(`/memberships/${membershipId}/cancel-invite`, {
      method: "POST",
      token,
    });
  }

  function inviteMember(token: string, input: InviteMemberInput) {
    const body = compactBody({
      tamboId: input.tamboId,
      name: input.name,
      phone: omittedBlank(input.phone),
      email: omittedBlank(input.email)?.toLowerCase(),
      role: input.role,
    });
    return request<{ item: { id: string }; inviteToken: string | null }>("/memberships/invite", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  }

  return {
    listTeam,
    createMember,
    updateMember,
    resetMemberPassword,
    revokeMember,
    reactivateMember,
    cancelInvite,
    inviteMember,
  };
}

export function teamRoleLabel(role: string, companyName?: string | null): string {
  if (role === "TAMBERO") return "Tambero";
  if (role === "VETERINARIO") return "Veterinario";
  if (role === "DUENIO") return "Dueño";
  if (role === "ADMIN") return "Administrador";
  if (role === "TECNICO") return companyName ? `Técnico · ${companyName}` : "Técnico";
  return role;
}

export function teamErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "USER_EXISTS") {
      return "Esa persona ya tiene una cuenta en CAL. Invitala con un enlace para sumarla a este tambo.";
    }
    if (error.code === "SHARED_ACCOUNT") {
      return "Esa persona también trabaja con otra cuenta: no se puede cambiar eso desde acá.";
    }
    if (error.code === "IDENTITY_TAKEN") {
      return "Ese teléfono (o correo) ya lo usa otra persona.";
    }
    if (error.status === 409 && String(error.message).toLowerCase().includes("no llegó a crear su clave")) {
      return "Esa persona no llegó a crear su clave: creá un acceso nuevo.";
    }
    if (error.status === 429) {
      return "Demasiados intentos. Probá de nuevo más tarde.";
    }
    if (error.code === "SESSION_REVOKED") return SESSION_REVOKED_MESSAGE;
    return "No se pudo completar. Probá de nuevo.";
  }
  return "No hay señal. Probá de nuevo cuando vuelva la conexión.";
}
