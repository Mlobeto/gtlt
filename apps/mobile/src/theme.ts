/**
 * Tokens de diseño GTLT — espejo de docs/diseno.md
 * Fondo blanco; acciones en verde; avisos en amarillo.
 */
export const colors = {
  bg: "#FFFFFF",
  bgSubtle: "#F2F4F5",
  surface: "#FFFFFF",
  border: "#E1E5E8",
  text: "#33383D",
  textMuted: "#6B7278",
  primary: "#4C9A6A",
  primaryPressed: "#3D7D57",
  primarySoft: "#E8F2EC",
  brandDark: "#123B4F",
  brandBlue: "#1F6F8B",
  accent: "#F0C419",
  accentSoft: "#FFF6CC",
  accentText: "#6B5400",
  danger: "#B42318",
  dangerSoft: "#FCEBEA",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

export const font = {
  display: 28,
  title: 22,
  body: 18,
  label: 16,
  input: 18,
  button: 18,
  meta: 14,
} as const;

export const touch = {
  min: 48,
} as const;
