import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  fetchTechnicianWorkspace,
  updateServiceRequest,
  type PartInstanceItem,
  type ServiceRequestItem,
} from "./api";
import type { Session } from "./session";
import { colors, font, radius, space, touch } from "./theme";

type TechScreen = "home" | "equipment" | "request";

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Espera dueño",
  OPEN: "Abierta",
  ACKNOWLEDGED: "Vista",
  IN_PROGRESS: "En curso",
  RESOLVED: "Resuelta",
  CANCELLED: "Cancelada",
};

const CATEGORY_LABEL: Record<string, string> = {
  VACUUM_PUMP: "Bomba de vacío",
  COLD_EQUIPMENT: "Equipo de frío",
  MILKING_GROUP: "Grupo de ordeñe",
  OTHER: "Otro",
};

const NEXT_STATUS: Record<string, { value: string; label: string }[]> = {
  OPEN: [
    { value: "ACKNOWLEDGED", label: "Marcar vista" },
    { value: "IN_PROGRESS", label: "Empezar" },
    { value: "CANCELLED", label: "Cancelar" },
  ],
  ACKNOWLEDGED: [
    { value: "IN_PROGRESS", label: "Empezar" },
    { value: "RESOLVED", label: "Resolver" },
    { value: "CANCELLED", label: "Cancelar" },
  ],
  IN_PROGRESS: [
    { value: "RESOLVED", label: "Resolver" },
    { value: "CANCELLED", label: "Cancelar" },
  ],
};

type Props = {
  session: Session;
  online: boolean;
  onLogout: () => void;
  onStatus: (msg: string) => void;
};

export function TechnicianHome({ session, online, onLogout, onStatus }: Props) {
  const [screen, setScreen] = useState<TechScreen>("home");
  const [busy, setBusy] = useState(false);
  const [parts, setParts] = useState<PartInstanceItem[]>([]);
  const [requests, setRequests] = useState<ServiceRequestItem[]>([]);
  const [selected, setSelected] = useState<ServiceRequestItem | null>(null);

  const load = useCallback(async () => {
    if (!online) {
      onStatus("Sin señal. El técnico necesita conexión para ver el tambo.");
      return;
    }
    setBusy(true);
    try {
      const ws = await fetchTechnicianWorkspace(session.token, session.tamboId);
      setParts(ws.partInstances);
      setRequests(ws.serviceRequests);
      onStatus("");
    } catch {
      onStatus("No se pudo cargar el tambo. Revisá la señal.");
    } finally {
      setBusy(false);
    }
  }, [online, onStatus, session.tamboId, session.token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(id: string, status: string) {
    setBusy(true);
    try {
      const res = await updateServiceRequest(session.token, id, {
        status: status as
          | "OPEN"
          | "ACKNOWLEDGED"
          | "IN_PROGRESS"
          | "RESOLVED"
          | "CANCELLED",
      });
      setSelected(res.item);
      const ws = await fetchTechnicianWorkspace(session.token, session.tamboId);
      setParts(ws.partInstances);
      setRequests(ws.serviceRequests);
      onStatus(`Pedido: ${STATUS_LABEL[status] ?? status}.`);
      if (status === "RESOLVED" || status === "CANCELLED") {
        setScreen("home");
        setSelected(null);
      }
    } catch {
      onStatus("No se pudo actualizar el pedido.");
    } finally {
      setBusy(false);
    }
  }

  const openRequests = requests.filter(
    (r) => r.status !== "RESOLVED" && r.status !== "CANCELLED",
  );

  return (
    <View style={styles.wrap}>
      {screen !== "home" ? (
        <Pressable
          style={styles.backRow}
          onPress={() => {
            setScreen("home");
            setSelected(null);
          }}
        >
          <Text style={styles.backText}>← Volver</Text>
        </Pressable>
      ) : null}

      {screen === "home" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service — técnico</Text>
          <Text style={styles.help}>
            Pedidos del tambo y el equipo cargado. Solo ves lo de este tambo.
          </Text>
          <Pressable
            style={[styles.buttonSecondary, busy && styles.disabled]}
            onPress={() => void load()}
            disabled={busy}
          >
            <Text style={styles.buttonSecondaryText}>Actualizar</Text>
          </Pressable>
          <Pressable
            style={[styles.buttonSecondary, busy && styles.disabled]}
            onPress={() => setScreen("equipment")}
            disabled={busy}
          >
            <Text style={styles.buttonSecondaryText}>
              Ver equipo ({parts.length})
            </Text>
          </Pressable>

          <Text style={styles.section}>Pedidos abiertos</Text>
          {busy && openRequests.length === 0 ? (
            <ActivityIndicator color={colors.primary} />
          ) : null}
          {openRequests.length === 0 && !busy ? (
            <Text style={styles.empty}>No hay pedidos abiertos.</Text>
          ) : (
            openRequests.map((r) => (
              <Pressable
                key={r.id}
                style={styles.item}
                onPress={() => {
                  setSelected(r);
                  setScreen("request");
                }}
              >
                <Text style={styles.itemTitle}>
                  {r.urgency === "URGENT" ? "URGENTE · " : ""}
                  {CATEGORY_LABEL[r.category] ?? r.category}
                </Text>
                <Text style={styles.itemMeta}>
                  {STATUS_LABEL[r.status] ?? r.status} ·{" "}
                  {new Date(r.createdAt).toLocaleString("es-AR")}
                </Text>
                <Text style={styles.itemMeta} numberOfLines={2}>
                  {r.description}
                </Text>
              </Pressable>
            ))
          )}

          <Pressable onPress={onLogout}>
            <Text style={styles.link}>Salir</Text>
          </Pressable>
        </View>
      ) : null}

      {screen === "equipment" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Equipo del tambo</Text>
          {parts.length === 0 ? (
            <Text style={styles.empty}>Todavía no hay piezas cargadas.</Text>
          ) : (
            parts.map((p) => (
              <View key={p.id} style={styles.item}>
                <Text style={styles.itemTitle}>{p.partType.name}</Text>
                <Text style={styles.itemMeta}>
                  {p.bajadaNumber != null
                    ? `Bajada ${p.bajadaNumber}`
                    : "Nivel tambo"}
                  {p.brandModel ? ` · ${p.brandModel}` : ""}
                </Text>
                {p.coldDetail ? (
                  <Text style={styles.itemMeta}>
                    Frío: {p.coldDetail.brand} {p.coldDetail.model} ·{" "}
                    {p.coldDetail.capacityLiters} L
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      ) : null}

      {screen === "request" && selected ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {selected.urgency === "URGENT" ? "URGENTE · " : ""}
            {CATEGORY_LABEL[selected.category] ?? selected.category}
          </Text>
          <Text style={styles.help}>{selected.description}</Text>
          <Text style={styles.itemMeta}>
            Estado: {STATUS_LABEL[selected.status] ?? selected.status}
          </Text>
          {selected.relatedPartInstance ? (
            <Text style={styles.itemMeta}>
              Pieza:{" "}
              {selected.relatedPartInstance.partType?.name ??
                selected.relatedPartInstance.id}
            </Text>
          ) : null}
          <Text style={styles.section}>Actualizar estado</Text>
          {(NEXT_STATUS[selected.status] ?? []).map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.button, busy && styles.disabled]}
              onPress={() => void changeStatus(selected.id, opt.value)}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{opt.label}</Text>
            </Pressable>
          ))}
          {(NEXT_STATUS[selected.status] ?? []).length === 0 ? (
            <Text style={styles.empty}>Este pedido ya está cerrado.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
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
  section: {
    fontSize: font.label,
    fontWeight: "700",
    color: colors.text,
    marginTop: space.sm,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    minHeight: touch.min,
    justifyContent: "center",
  },
  buttonSecondary: {
    backgroundColor: colors.primarySoft,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: touch.min,
    justifyContent: "center",
  },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: font.button },
  buttonSecondaryText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: font.button,
  },
  disabled: { opacity: 0.6 },
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
  empty: { color: colors.textMuted, fontSize: font.body },
  link: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: font.body,
    paddingVertical: space.sm,
  },
  backRow: { paddingVertical: space.sm },
  backText: { fontSize: font.body, color: colors.primary, fontWeight: "600" },
});
