/**
 * En el celular físico NO sirve localhost (apunta al teléfono).
 * Usá la IP LAN de la PC (la misma que aparece en exp://IP:808x).
 *
 * Override: $env:EXPO_PUBLIC_API_URL="http://192.168.x.x:3001"
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.0.213:3001";