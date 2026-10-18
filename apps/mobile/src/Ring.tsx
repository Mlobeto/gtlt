import { Image, Text, View } from "react-native";
import { colors } from "./theme";

const RING_SRC = {
  5: require("../assets/rings/ring-005.png"),
  10: require("../assets/rings/ring-010.png"),
  15: require("../assets/rings/ring-015.png"),
  20: require("../assets/rings/ring-020.png"),
  25: require("../assets/rings/ring-025.png"),
  30: require("../assets/rings/ring-030.png"),
  35: require("../assets/rings/ring-035.png"),
  40: require("../assets/rings/ring-040.png"),
  45: require("../assets/rings/ring-045.png"),
  50: require("../assets/rings/ring-050.png"),
  55: require("../assets/rings/ring-055.png"),
  60: require("../assets/rings/ring-060.png"),
  65: require("../assets/rings/ring-065.png"),
  70: require("../assets/rings/ring-070.png"),
  75: require("../assets/rings/ring-075.png"),
  80: require("../assets/rings/ring-080.png"),
  85: require("../assets/rings/ring-085.png"),
  90: require("../assets/rings/ring-090.png"),
  95: require("../assets/rings/ring-095.png"),
  100: require("../assets/rings/ring-100.png"),
} as const;

const TRACK = require("../assets/rings/ring-track.png");

export function ringColorForLife(status?: string) {
  if (status === "OVERDUE") return colors.danger;
  if (status === "SOON") return colors.warning;
  return colors.success;
}

function ringStep(percent: number) {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.min(100, Math.max(5, Math.round(clamped / 5) * 5)) as keyof typeof RING_SRC;
}

export function Ring({
  percent,
  color,
  size = 52,
  caption,
}: {
  percent: number;
  color: string;
  size?: number;
  caption?: string;
}) {
  const shown = Math.min(100, Math.max(0, Math.round(percent)));
  const step = ringStep(shown);
  const inner = size * 0.73;
  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessibilityLabel={`${shown}%${caption ? ` · ${caption}` : ""}`}
    >
      <Image
        source={TRACK}
        style={{
          position: "absolute",
          width: size,
          height: size,
          tintColor: colors.track,
        }}
        resizeMode="contain"
        accessible={false}
      />
      {percent >= 3 ? (
        <Image
          source={RING_SRC[step]}
          style={{
            position: "absolute",
            width: size,
            height: size,
            tintColor: color,
          }}
          resizeMode="contain"
          accessible={false}
        />
      ) : null}
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>{shown}%</Text>
      </View>
    </View>
  );
}
