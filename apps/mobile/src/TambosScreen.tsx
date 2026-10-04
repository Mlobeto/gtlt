import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  ApiError,
  acceptTamboRequest,
  cancelTamboRequest,
  createTamboRequest,
  declineTamboRequest,
  fetchBillingSummary,
  fetchEquipmentPreview,
  fetchTamboRequests,
  fetchTambos,
  requestDeviceRemoval,
  setTamboActive,
  updateTambo,
  type BillingSummary,
  type EquipmentLine,
  type TamboHardware,
  type TamboItem,
  type PowerSupply,
  type TamboRequestItem,
  type TamboRequestStatus,
} from "./api";
import { powerSupplyLabel } from "./part-fields";
import { colors, font, radius, space, touch } from "./theme";

const REQUEST_STATUS: Record<TamboRequestStatus, string> = {
  SENT: "Enviado",
  QUOTED: "Cotizado",
  ACCEPTED: "Aceptado",
  DECLINED: "Rechazado por el dueño",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  CONVERTED: "Convertido",
};

function money(n: number) {
  return `$${n.toLocaleString("es-AR")}`;
}

function billingLine(billing: BillingSummary | null) {
  if (!billing) return "";
  const installing = ` · ${billing.installingTambos ?? 0} en instalación (todavía no se cobran)`;
  if (billing.courtesy) return `Cuenta sin cargo${installing}`;
  return `${billing.activeTambos} activos × ${money(billing.unitPriceArs)} = ${money(billing.monthlyTotalArs)} por mes${installing}`;
}

function tamboStateLabel(t: TamboItem) {
  if (t.state === "ARCHIVED" || t.active === false) return "Archivado";
  if (t.state === "INSTALLING") return "En instalación";
  if (t.state === "ACTIVE") return "Activo";
  return t.activatedAt ? "Activo" : "En instalación";
}

function hasHardware(h: TamboHardware) {
  return h.pumpSensor || h.flowMeters || h.rfidReaders;
}

export function TambosScreen({
  token,
  currentTamboId,
  online,
  onSwitch,
  onCreated: _onCreated,
  onStatus,
  onActiveTambos,
}: {
  token: string;
  currentTamboId: string;
  online: boolean;
  onSwitch: (tambo: TamboItem) => void;
  onCreated: (tambo: TamboItem) => void;
  onStatus: (msg: string) => void;
  onActiveTambos?: (items: TamboItem[]) => void;
}) {
  const [items, setItems] = useState<TamboItem[]>([]);
  const [requests, setRequests] = useState<TamboRequestItem[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<EquipmentLine[]>([]);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [bajadaCount, setBajadaCount] = useState("8");
  const [hardware, setHardware] = useState<TamboHardware>({
    pumpSensor: false,
    flowMeters: false,
    rfidReaders: false,
  });
  const [providerId, setProviderId] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBajadas, setEditBajadas] = useState("");
  const [editPower, setEditPower] = useState<PowerSupply | null>(null);
  const [powerSupply, setPowerSupply] = useState<PowerSupply | null>(null);

  const load = useCallback(async () => {
    if (!online) return;
    setBusy(true);
    try {
      const [list, summary, reqs] = await Promise.all([
        fetchTambos(token, true),
        fetchBillingSummary(token),
        fetchTamboRequests(token),
      ]);
      setItems(list.items);
      setBilling(summary);
      setRequests(reqs.items);
      setProviders(reqs.serviceProviders);
      onActiveTambos?.(list.items.filter((t) => t.active !== false));
    } catch {
      onStatus("No se pudieron cargar los tambos.");
    } finally {
      setBusy(false);
    }
  }, [online, onActiveTambos, onStatus, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showForm) return;
    const count = Number(bajadaCount);
    if (!Number.isInteger(count) || count < 1 || count > 60) {
      setPreview([]);
      return;
    }
    const handle = setTimeout(() => {
      void fetchEquipmentPreview(token, { bajadaCount: count, ...hardware })
        .then((res) => setPreview(res.items))
        .catch(() => setPreview([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [token, showForm, bajadaCount, hardware]);

  async function submitRequest() {
    const count = Number(bajadaCount);
    if (name.trim().length < 2 || !Number.isInteger(count) || count < 1 || count > 60) {
      onStatus("Nombre (2–80) y bajadas (1–60) son obligatorios.");
      return;
    }
    if (hasHardware(hardware) && !powerSupply) {
      onStatus("Si pedís hardware hay que indicar la corriente.");
      return;
    }
    if (hasHardware(hardware) && !providerId) {
      onStatus("Si pedís hardware hay que elegir un proveedor.");
      return;
    }
    setBusy(true);
    try {
      await createTamboRequest(token, {
        name: name.trim(),
        address: address.trim() || undefined,
        bajadaCount: count,
        hardware,
        serviceProviderId: hasHardware(hardware) ? providerId : null,
        notes: notes.trim() || undefined,
        powerSupply,
      });
      setShowForm(false);
      setName("");
      setAddress("");
      setNotes("");
      setHardware({ pumpSensor: false, flowMeters: false, rfidReaders: false });
      setProviderId("");
      setPowerSupply(null);
      await load();
      onStatus("Pedido enviado.");
    } catch (err) {
      onStatus(err instanceof Error ? err.message : "No se pudo enviar el pedido.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const count = Number(editBajadas);
    setBusy(true);
    try {
      await updateTambo(token, id, {
        name: editName.trim(),
        bajadaCount: count,
        powerSupply: editPower,
      });
      setEditingId(null);
      await load();
      onStatus("Tambo actualizado.");
    } catch (err) {
      if (err instanceof ApiError && err.code === "BAJADAS_EN_USO") {
        const blockers = (err.body?.blockers ?? []) as { type: string; bajadaNumber: number | null }[];
        const detail = blockers.map((b) => `${b.type} (bajada ${b.bajadaNumber})`).join(", ");
        onStatus(detail || err.message);
      } else {
        onStatus(err instanceof Error ? err.message : "No se pudo actualizar el tambo.");
      }
    } finally {
      setBusy(false);
    }
  }

  function archiveOrRestore(tambo: TamboItem, active: boolean) {
    const message = active
      ? "¿Restaurar este tambo? Si ya estaba activado, vuelve a contar para el costo mensual."
      : "Dejás de pagar este tambo. Los datos se conservan.";
    Alert.alert(active ? "Restaurar" : "Archivar", message, [
      { text: "Cancelar", style: "cancel" },
      {
        text: active ? "Restaurar" : "Archivar",
        style: active ? "default" : "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              const result = await setTamboActive(token, tambo.id, active);
              setBilling(result.billing);
              const refreshed = await fetchTambos(token, true);
              setItems(refreshed.items);
              const actives = refreshed.items.filter((t) => t.active !== false);
              onActiveTambos?.(actives);
              onStatus(active ? "Tambo restaurado." : "Tambo archivado.");
              if (!active && tambo.id === currentTamboId && actives[0]) {
                onSwitch(actives[0]);
              }
            } catch (err) {
              if (err instanceof ApiError && err.code === "TAMBO_HAS_DEVICES") {
                const count = Number(err.body?.count ?? 0);
                Alert.alert(
                  "Hay dispositivos",
                  `Este tambo tiene ${count} dispositivo${count === 1 ? "" : "s"} instalado${count === 1 ? "" : "s"}. Para darlo de baja hay que retirarlos.`,
                  [
                    { text: "Cerrar", style: "cancel" },
                    {
                      text: "Pedir retiro de dispositivos",
                      onPress: () => {
                        void requestDeviceRemoval(token, tambo.id)
                          .then(() => onStatus("Pedido de retiro enviado al técnico."))
                          .catch((e) =>
                            onStatus(e instanceof Error ? e.message : "No se pudo pedir el retiro."),
                          );
                      },
                    },
                  ],
                );
              } else {
                onStatus(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
              }
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  function actOnRequest(action: "accept" | "decline" | "cancel", id: string) {
    if (action === "decline") {
      Alert.alert("Rechazar cotización", "¿Rechazar esta cotización?", [
        { text: "Volver", style: "cancel" },
        { text: "Rechazar", style: "destructive", onPress: () => void runRequestAction("decline", id) },
      ]);
      return;
    }
    void runRequestAction(action, id);
  }

  async function runRequestAction(action: "accept" | "decline" | "cancel", id: string, reason?: string) {
    setBusy(true);
    try {
      if (action === "accept") await acceptTamboRequest(token, id);
      if (action === "decline") await declineTamboRequest(token, id, reason);
      if (action === "cancel") await cancelTamboRequest(token, id);
      await load();
      onStatus(
        action === "accept"
          ? "Cotización aceptada."
          : action === "decline"
            ? "Cotización rechazada."
            : "Pedido cancelado.",
      );
    } catch (err) {
      onStatus(err instanceof Error ? err.message : "No se pudo actualizar el pedido.");
    } finally {
      setBusy(false);
    }
  }

  const subscriptionHint = billing?.courtesy
    ? "La cuenta es sin cargo. Los equipos y la instalación los cotiza el proveedor."
    : `La suscripción es de ${money(billing?.unitPriceArs ?? 0)} por mes por tambo y empieza a cobrarse cuando el tambo se activa. Los equipos y la instalación los cotiza el proveedor.`;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Mis tambos</Text>
      <Text style={styles.help}>{billingLine(billing)}</Text>
      {busy && items.length === 0 ? <ActivityIndicator color={colors.primary} /> : null}
      {items.map((t) => (
        <View key={t.id} style={styles.item}>
          {editingId === t.id ? (
            <>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} />
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={editBajadas}
                onChangeText={setEditBajadas}
              />
              <Text style={styles.help}>Corriente</Text>
              <View style={styles.wrapRow}>
                {(
                  [
                    ["MONOPHASE", "Monofásica"],
                    ["THREEPHASE", "Trifásica"],
                  ] as const
                ).map(([value, label]) => (
                  <Pressable
                    key={value}
                    style={[styles.choice, editPower === value && styles.choiceOn]}
                    onPress={() => setEditPower(value)}
                  >
                    <Text style={[styles.choiceText, editPower === value && styles.choiceTextOn]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.button} onPress={() => void saveEdit(t.id)} disabled={busy}>
                <Text style={styles.buttonText}>Guardar</Text>
              </Pressable>
              <Pressable onPress={() => setEditingId(null)}>
                <Text style={styles.link}>Cancelar</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.itemTitle}>
                {t.name}
                {t.id === currentTamboId ? " · actual" : ""}
              </Text>
              <Text style={styles.itemMeta}>
                {t.bajadaCount} bajadas · {tamboStateLabel(t)} · Corriente:{" "}
                {powerSupplyLabel(t.powerSupply)}
              </Text>
              {t.active !== false && t.id !== currentTamboId ? (
                <Pressable style={styles.buttonSecondary} onPress={() => onSwitch(t)}>
                  <Text style={styles.buttonSecondaryText}>Usar este tambo</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setEditingId(t.id);
                  setEditName(t.name);
                  setEditBajadas(String(t.bajadaCount));
                  setEditPower(t.powerSupply ?? null);
                }}
              >
                <Text style={styles.link}>Editar</Text>
              </Pressable>
              {t.active === false ? (
                <Pressable onPress={() => archiveOrRestore(t, true)}>
                  <Text style={styles.link}>Restaurar</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => archiveOrRestore(t, false)}>
                  <Text style={styles.link}>Archivar</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      ))}

      {showForm ? (
        <View style={styles.form}>
          <Text style={styles.help}>Nombre</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />
          <Text style={styles.help}>Dirección (opcional)</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} />
          <Text style={styles.help}>Cantidad de bajadas</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={bajadaCount}
            onChangeText={setBajadaCount}
          />
          {(
            [
              ["pumpSensor", "Sensor de bomba de vacío"],
              ["flowMeters", "Caudalímetro en cada bajada"],
              ["rfidReaders", "Lector de caravanas en cada bajada"],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              style={styles.checkRow}
              onPress={() => setHardware((prev) => ({ ...prev, [key]: !prev[key] }))}
            >
              <Text style={styles.help}>
                {hardware[key] ? "☑" : "☐"} {label}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.help}>
            Corriente{hasHardware(hardware) ? " *" : ""} — define qué motores y equipos se pueden
            instalar
          </Text>
          <View style={styles.wrapRow}>
            {(
              [
                ["MONOPHASE", "Monofásica"],
                ["THREEPHASE", "Trifásica"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.choice, powerSupply === value && styles.choiceOn]}
                onPress={() => setPowerSupply(value)}
              >
                <Text style={[styles.choiceText, powerSupply === value && styles.choiceTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {hasHardware(hardware) ? (
            <View style={styles.form}>
              <Text style={styles.help}>Proveedor</Text>
              {providers.map((p) => (
                <Pressable key={p.id} style={styles.checkRow} onPress={() => setProviderId(p.id)}>
                  <Text style={styles.help}>
                    {providerId === p.id ? "●" : "○"} {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.help}>Notas (opcional)</Text>
          <TextInput style={styles.input} value={notes} onChangeText={setNotes} />
          <Text style={styles.itemTitle}>Equipos estimados</Text>
          {preview.length === 0 ? (
            <Text style={styles.help}>Pedido solo de software: sin equipos de hardware.</Text>
          ) : (
            preview.map((line) => (
              <Text key={line.kind} style={styles.help}>
                {line.label}: {line.quantity}
              </Text>
            ))
          )}
          <Text style={styles.help}>{subscriptionHint}</Text>
          <Pressable
            style={[styles.button, busy && styles.disabled]}
            onPress={() => void submitRequest()}
            disabled={busy}
          >
            <Text style={styles.buttonText}>Enviar pedido</Text>
          </Pressable>
          <Pressable onPress={() => setShowForm(false)}>
            <Text style={styles.link}>Cancelar</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.buttonSecondary} onPress={() => setShowForm(true)}>
          <Text style={styles.buttonSecondaryText}>Pedir un tambo</Text>
        </Pressable>
      )}

      <Text style={styles.cardTitle}>Mis pedidos de tambo</Text>
      {requests.length === 0 ? <Text style={styles.help}>Todavía no hay pedidos.</Text> : null}
      {requests.map((r) => (
        <View key={r.id} style={styles.item}>
          <Text style={styles.itemTitle}>{r.name}</Text>
          <Text style={styles.itemMeta}>
            {REQUEST_STATUS[r.status]} · {r.bajadaCount} bajadas
            {r.serviceProvider ? ` · ${r.serviceProvider.name}` : " · solo software"} ·
            Corriente: {powerSupplyLabel(r.powerSupply)}
          </Text>
          {(r.equipmentList ?? []).map((line) => (
            <Text key={line.kind} style={styles.help}>
              {line.label}: {line.quantity}
            </Text>
          ))}
          {r.quoteTotal != null ? (
            <>
              <Text style={styles.itemTitle}>Cotización</Text>
              {(r.quoteItems ?? []).map((item, i) => (
                <Text key={`${item.description}-${i}`} style={styles.help}>
                  {item.description} · {item.quantity} × {money(item.unitPrice)} {item.currency}
                </Text>
              ))}
              <Text style={styles.help}>
                Total: {money(r.quoteTotal)} {r.quoteCurrency}
              </Text>
              {r.quoteNotes ? <Text style={styles.help}>{r.quoteNotes}</Text> : null}
            </>
          ) : null}
          {r.status === "QUOTED" ? (
            <>
              <Pressable style={styles.button} onPress={() => actOnRequest("accept", r.id)} disabled={busy}>
                <Text style={styles.buttonText}>Aceptar</Text>
              </Pressable>
              <Pressable style={styles.buttonSecondary} onPress={() => actOnRequest("decline", r.id)} disabled={busy}>
                <Text style={styles.buttonSecondaryText}>Rechazar</Text>
              </Pressable>
            </>
          ) : null}
          {r.status === "SENT" || r.status === "QUOTED" ? (
            <Pressable onPress={() => actOnRequest("cancel", r.id)}>
              <Text style={styles.link}>Cancelar pedido</Text>
            </Pressable>
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: colors.text,
    backgroundColor: colors.surface,
    minHeight: touch.min,
    fontSize: font.body,
  },
  form: { gap: space.sm },
  checkRow: { paddingVertical: space.xs },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choice: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: touch.min,
    justifyContent: "center",
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { fontSize: font.body, color: colors.textMuted, fontWeight: "600" },
  choiceTextOn: { color: colors.primaryPressed },
  link: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: font.body,
    paddingVertical: space.sm,
  },
});
