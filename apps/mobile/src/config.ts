/**
 * En el celular físico NO sirve localhost (apunta al teléfono).
 * Producción Azure por defecto. Para API local: EXPO_PUBLIC_API_URL.
 *
 * Override: $env:EXPO_PUBLIC_API_URL="http://192.168.x.x:3001"
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://gtlt-api.proudmoss-fef6994b.eastus2.azurecontainerapps.io";

export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "https://gtlt.vercel.app").replace(/\/$/, "");

/** Enlace de descarga de la app. Vacío hasta que exista un store / APK público. */
export const APP_DOWNLOAD_URL = "";