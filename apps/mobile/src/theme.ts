/**
 * Tokens de diseño GTLT — espejo de docs/diseno.md
 * Fondo blanco; acciones en verde; avisos en amarillo.
 */
export const colors = {
  bg: "#FFFFFF",
  bgSubtle: "#F7F8F5",
  surface: "#FFFFFF",
  border: "#D8DED4",
  text: "#1A2E1C",
  textMuted: "#5F6F60",
  primary: "#2F7A3E",
  primaryPressed: "#246332",
  primarySoft: "#E7F3EA",
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
