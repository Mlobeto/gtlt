/**
 * En el celular físico NO sirve localhost (apunta al teléfono).
 * Producción Azure por defecto. Para API local: EXPO_PUBLIC_API_URL.
 *
 * Override: $env:EXPO_PUBLIC_API_URL="http://192.168.x.x:3001"
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  "https://gtlt-api.proudmoss-fef6994b.eastus2.azurecontainerapps.io";