import { env } from "./env.js";
import { HttpError } from "./http-error.js";

function normalizedPhotoPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${decodeURIComponent(parsed.pathname)}`;
  } catch {
    return (url.split("?")[0] ?? url).trim();
  }
}

/** Prefijo público de una foto subida por POST /uploads/photo para este tenant. */
export function tenantPhotoUrlPrefix(tenantId: string): string | null {
  if (!env.azureStorageAccountName) return null;
  return `https://${env.azureStorageAccountName}.blob.core.windows.net/${env.azureStorageContainer}/${tenantId}/`;
}

export function assertTenantPhotoUrl(url: string, tenantId: string): void {
  const prefix = tenantPhotoUrlPrefix(tenantId);
  const path = normalizedPhotoPath(url);
  if (!prefix || !path.startsWith(prefix) || path.includes("..")) {
    throw new HttpError(400, "Foto no válida");
  }
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes("/")) {
    throw new HttpError(400, "Foto no válida");
  }
}

export function tenantPhotoBlobName(url: string, tenantId: string): string {
  assertTenantPhotoUrl(url, tenantId);
  const prefix = tenantPhotoUrlPrefix(tenantId)!;
  const rest = normalizedPhotoPath(url).slice(prefix.length);
  return `${tenantId}/${rest}`;
}

export function assertTenantPhotoUrls(urls: string[], tenantId: string): void {
  for (const item of urls) {
    assertTenantPhotoUrl(item, tenantId);
  }
}

export function optionalTenantPhotoUrl(
  url: string | null | undefined,
  tenantId: string,
): string | null | undefined {
  if (url == null || url === "") return url;
  assertTenantPhotoUrl(url, tenantId);
  return url;
}
