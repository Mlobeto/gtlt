import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, replacePartInstancesBatch, type PartInstanceItem } from "./api";
import { colors, font, radius, space, touch } from "./theme";

const INSTALL_CHIPS = [
  { key: "today", label: "Hoy", days: 0, approx: false },
  { key: "1w", label: "Hace 1 semana", days: 7, approx: true },
  { key: "1m", label: "Hace 1 mes", days: 30, approx: true },
  { key: "3m", label: "Hace 3 meses", days: 91, approx: true },
  { key: "other", label: "Otra fecha", days: null as number | null, approx: false },
] as const;

function parseYmd(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

function resolveInstallDate(chip: string | null, other: string): { date: Date; approx: boolean } | null {
  if (!chip) return null;
  if (chip === "other") {
    const date = parseYmd(other);
    return date ? { date, approx: false } : null;
  }
  const preset = INSTALL_CHIPS.find((c) => c.key === chip);
  if (!preset || preset.days == null) return null;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - preset.days);
  return { date, approx: preset.approx };
}

type Props = {
  token: string;
  online: boolean;
  parts: PartInstanceItem[];
  preselectedIds: string[];
  onStatus: (msg: string) => void;
  onDone: () => void;
};

export function ReplaceBatchScreen({ token, online, parts, preselectedIds, onStatus, onDone }: Props) {
  const initial = useMemo(() => {
    const set = new Set(preselectedIds);
    return Object.fromEntries(parts.map((p) => [p.id, set.has(p.id)]));
  }, [parts, preselectedIds]);
  const [selected, setSelected] = useState<Record<string, boolean>>(initial);
  const [chip, setChip] = useState<string | null>("today");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);

  const picked = parts.filter((p) => selected[p.id]);

  function confirm() {
    if (!online) {
      onStatus("Para registrar el cambio hace falta señal.");
      return;
    }
    if (picked.length === 0) {
      onStatus("Elegí al menos una pieza.");
      return;
    }
    const installed = resolveInstallDate(chip, other);
    if (!installed) {
      onStatus("Elegí cuándo se instalaron.");
      return;
    }
    Alert.alert(
      "Ya las cambié",
      `Se va a registrar el cambio de ${picked.length} pieza${picked.length === 1 ? "" : "s"} y se arma un informe de trabajo propio. No se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Registrar",
          onPress: () => void run(installed),
        },
      ],
    );
  }

  async function run(installed: { date: Date; approx: boolean }) {
    setBusy(true);
    try {
      const res = await replacePartInstancesBatch(token, {
        instanceIds: picked.map((p) => p.id),
        installedAt: installed.date.toISOString(),
        installedAtApprox: installed.approx,
      });
      onStatus(
        `Listo: ${res.parts.length} piezas nuevas. Informe propio enviado (${res.item.summary}).`,
      );
      onDone();
    } catch (err) {
      const extra =
        err instanceof ApiError && Array.isArray(err.body?.invalidIds)
          ? ` Piezas inválidas: ${err.body.invalidIds.length}. No se cambió nada.`
          : "";
      onStatus((err instanceof ApiError ? err.message : "No se pudo registrar el cambio.") + extra);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Ya las cambié</Text>
      <Text style={styles.help}>
        Se crea un informe de trabajo propio y las piezas nuevas arrancan de cero.
      </Text>
      {parts.map((p) => {
        const on = Boolean(selected[p.id]);
        return (
          <Pressable
            key={p.id}
            style={styles.item}
            onPress={() => setSelected((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
          >
            <Text style={styles.itemTitle}>
              {on ? "☑ " : "☐ "}
              {p.partType.name}
              {p.label ? ` · ${p.label}` : ""}
              {p.bajadaNumber != null ? ` · bajada ${p.bajadaNumber}` : ""}
            </Text>
          </Pressable>
        );
      })}
      <Text style={styles.label}>¿Cuándo se instalaron?</Text>
      <View style={styles.wrapRow}>
        {INSTALL_CHIPS.map((c) => (
          <Pressable
            key={c.key}
            style={[styles.choice, chip === c.key && styles.choiceOn]}
            onPress={() => setChip(c.key)}
          >
            <Text style={[styles.choiceText, chip === c.key && styles.choiceTextOn]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
      {chip === "other" ? (
        <TextInput
          style={styles.input}
          value={other}
          onChangeText={setOther}
          placeholder="AAAA-MM-DD"
          placeholderTextColor={colors.textMuted}
        />
      ) : null}
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      <Pressable style={[styles.button, busy && styles.disabled]} onPress={confirm} disabled={busy}>
        <Text style={styles.buttonText}>Confirmar cambio</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
  help: { color: colors.textMuted, fontSize: font.body, lineHeight: 24 },
  label: { fontSize: font.label, fontWeight: "700", color: colors.text },
  item: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemTitle: { fontWeight: "700", color: colors.text, fontSize: 17 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choice: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  choiceOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  choiceText: { color: colors.textMuted, fontWeight: "600" },
  choiceTextOn: { color: colors.primary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: colors.text,
    fontSize: font.body,
    minHeight: touch.min,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    minHeight: touch.min,
    justifyContent: "center",
  },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: font.button },
  disabled: { opacity: 0.6 },
});
