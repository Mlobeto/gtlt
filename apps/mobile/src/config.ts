/**
 * En emulador Android: http://10.0.2.2:3001
 * En dispositivo físico: http://<IP-LAN-de-tu-PC>:3001
 * En Expo web / iOS simulator: http://localhost:3001
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
