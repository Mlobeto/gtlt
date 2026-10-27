import { Image } from "react-native";
import { colors } from "./theme";

const ICONS = {
  home: require("../assets/icons/ic-home.png"),
  vacas: require("../assets/icons/ic-vacas.png"),
  ordene: require("../assets/icons/ic-ordene.png"),
  sanidad: require("../assets/icons/ic-sanidad.png"),
  repro: require("../assets/icons/ic-repro.png"),
  entrega: require("../assets/icons/ic-entrega.png"),
  control: require("../assets/icons/ic-control.png"),
  service: require("../assets/icons/ic-service.png"),
  maquinas: require("../assets/icons/ic-maquinas.png"),
  cuenta: require("../assets/icons/ic-cuenta.png"),
  equipo: require("../assets/icons/ic-equipo.png"),
  campana: require("../assets/icons/ic-campana.png"),
  microfono: require("../assets/icons/ic-microfono.png"),
  "flecha-abajo": require("../assets/icons/ic-flecha-abajo.png"),
  "flecha-derecha": require("../assets/icons/ic-flecha-derecha.png"),
  "flecha-izquierda": require("../assets/icons/ic-flecha-izquierda.png"),
  check: require("../assets/icons/ic-check.png"),
  camara: require("../assets/icons/ic-camara.png"),
  cerrar: require("../assets/icons/ic-cerrar.png"),
  ubicacion: require("../assets/icons/ic-ubicacion.png"),
  bomba: require("../assets/icons/ic-bomba.png"),
  alerta: require("../assets/icons/ic-alerta.png"),
  frio: require("../assets/icons/ic-frio.png"),
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 24,
  color = colors.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Image
      source={ICONS[name]}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
