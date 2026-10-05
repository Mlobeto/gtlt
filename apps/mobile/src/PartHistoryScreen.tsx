import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { ApiError, fetchPartHistory, type PartHistoryItem, type PartInstanceItem } from "./api";
import { colors, font, radius, space } from "./theme";

type Props = {
  token: string;
  tamboId: string;
  part: PartInstanceItem;
  onStatus: (msg: string) => void;
};

export function PartHistoryScreen({ token, tamboId, part, onStatus }: Props) {
  const [items, setItems] = useState<PartHistoryItem[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setBusy(true);
      try {
        const res = await fetchPartHistory(token, {
          tamboId,
          partTypeId: part.partType.id,
          bajadaNumber: part.bajadaNumber,
          label: part.label,
        });
        if (!cancelled) {
          setItems(res.items);
          onStatus("");
        }
      } catch (err) {
        if (!cancelled) {
          onStatus(err instanceof ApiError ? err.message : "No se pudo cargar el historial.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [onStatus, part.bajadaNumber, part.label, part.partType.id, tamboId, token]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Historial</Text>
      <Text style={styles.help}>
        {part.partType.name}
        {part.label ? ` · ${part.label}` : ""}
        {part.bajadaNumber != null ? ` · bajada ${part.bajadaNumber}` : ""}
      </Text>
      {busy ? <ActivityIndicator color={colors.primary} /> : null}
      {!busy && items.length === 0 ? (
        <Text style={styles.empty}>No hay instalaciones anteriores de esta pieza.</Text>
      ) : null}
      {items.map((row) => (
        <View key={row.id} style={styles.item}>
          <Text style={styles.itemTitle}>
            Instalada {new Date(row.installedAt).toLocaleDateString("es-AR")}
            {row.installedAtApprox ? " (aprox.)" : ""}
          </Text>
          <Text style={styles.itemMeta}>
            Duró {row.daysInService} día{row.daysInService === 1 ? "" : "s"}
            {row.estimatedMilkingsInService != null
              ? ` · ≈ ${Math.round(row.estimatedMilkingsInService).toLocaleString("es-AR")} ordeñes`
              : ""}
          </Text>
          {row.estimatedMilkingsNote ? (
            <Text style={styles.itemMeta}>{row.estimatedMilkingsNote}</Text>
          ) : null}
          {row.createdBy ? <Text style={styles.itemMeta}>La cargó {row.createdBy.name}</Text> : null}
          {row.installedInReport ? (
            <Text style={styles.itemMeta}>Informe de origen</Text>
          ) : null}
        </View>
      ))}
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
  empty: { color: colors.textMuted, fontSize: font.body },
  item: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.xs,
  },
  itemTitle: { fontWeight: "700", color: colors.text, fontSize: 17 },
  itemMeta: { color: colors.textMuted, fontSize: 15 },
});
