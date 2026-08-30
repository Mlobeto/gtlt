import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { metaGet, metaSet } from "./db";

const TOKEN_KEY = "gtlt_access_token";

export type Session = {
  token: string;
  tamboId: string;
  tamboName: string;
  userName: string;
  roles: string[];
  tenantId: string;
};

async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    await metaSet(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return metaGet(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function deleteToken(): Promise<void> {
  if (Platform.OS === "web") {
    await metaSet(TOKEN_KEY, "");
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function saveSession(session: Session): Promise<void> {
  await setToken(session.token);
  await metaSet("tamboId", session.tamboId);
  await metaSet("tamboName", session.tamboName);
  await metaSet("userName", session.userName);
  await metaSet("roles", JSON.stringify(session.roles));
  await metaSet("tenantId", session.tenantId);
}

export async function loadSession(): Promise<Session | null> {
  const token = await getToken();
  const tamboId = await metaGet("tamboId");
  const tamboName = await metaGet("tamboName");
  const userName = await metaGet("userName");
  const rolesRaw = await metaGet("roles");
  const tenantId = await metaGet("tenantId");
  if (!token || !tamboId || !tamboName || !userName) return null;
  let roles: string[] = [];
  try {
    roles = rolesRaw ? (JSON.parse(rolesRaw) as string[]) : [];
  } catch {
    roles = [];
  }
  return {
    token,
    tamboId,
    tamboName,
    userName,
    roles,
    tenantId: tenantId ?? "",
  };
}

export async function clearSession(): Promise<void> {
  await deleteToken();
}
