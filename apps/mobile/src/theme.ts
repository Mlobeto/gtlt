/**
 * Tokens de diseño CAL — espejo de docs/diseno.md
 * Fondo crema; acciones en negro; acento amarillo; verde solo para éxito.
 */
export const colors = {
  bg: "#EFE8E2",
  bgSubtle: "#F3EEE9",
  surface: "#FFFEFD",
  border: "#E3DAD2",
  text: "#222222",
  textMuted: "#5E5750",
  primary: "#222222",
  primaryPressed: "#000000",
  primaryLight: "#3A3A3A",
  primarySoft: "#FBEBB8",
  onPrimary: "#F8D05F",
  brandDark: "#222222",
  brandBlue: "#5E5750",
  accent: "#F8D05F",
  accentSoft: "#FBEBB8",
  accentText: "#5B4300",
  success: "#2F7D4A",
  successSoft: "#DDF0E3",
  successText: "#1E5B35",
  danger: "#B3261E",
  dangerSoft: "#F9DEDC",
  dangerText: "#8C1D18",
  warning: "#E3A800",
  dark: "#222222",
  darkSurface: "#333333",
  darkSurfaceHigh: "#3A3A3A",
  onDark: "#FFFFFF",
  onDarkMuted: "#D9D2C8",
  track: "#EEE6DD",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 12,
  md: 24,
  lg: 28,
  pill: 999,
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
