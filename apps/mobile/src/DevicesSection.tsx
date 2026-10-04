import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createDevice,
  fetchDevices,
  retireDevice,
  rotateDeviceToken,
  type DeviceItem,
  type DeviceKind,
} from "./api";
import { colors, font, radius, space, touch } from "./theme";

const KIND_LABEL: Record<DeviceKind, string> = {
  VACUUM_PUMP_SENSOR: "Sensor de bomba de vacío",
  FLOW_METER: "Caudalímetro",
  RFID_READER: "Lector de caravanas",
};

const KINDS = Object.keys(KIND_LABEL) as DeviceKind[];

const TOKEN_NOTICE =
  "Cargá esta clave en el dispositivo. Esta pantalla no la va a volver a mostrar.";

function formatAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function deviceStatus(item: DeviceItem): string {
  if (!item.lastSeenAt) return "Esperando primer contacto";
  if (item.connected) return `Conectado · hace ${formatAgo(item.lastSeenAt)}`;
  return `Sin señal desde ${new Date(item.lastSeenAt).toLocaleString("es-AR")}`;
}

function needsBajada(kind: DeviceKind) {
  return kind === "FLOW_METER" || kind === "RFID_READER";
}

export function DevicesSection({
  token,
  tamboId,
  online,
  onStatus,
}: {
  token: string;
  tamboId: string;
  online: boolean;
  onStatus: (msg: string) => void;
}) {
  const [items, setItems] = useState<DeviceItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [bajadaCount, setBajadaCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<DeviceKind>("VACUUM_PUMP_SENSOR");
  const [bajadaNumber, setBajadaNumber] = useState("1");
  const [label, setLabel] = useState("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!online) return;
      if (!silent) setBusy(true);
      try {
        const result = await fetchDevices(token, tamboId);
        setItems(result.items);
        setCanManage(Boolean(result.canManage));
        if (result.tambo?.bajadaCount) setBajadaCount(result.tambo.bajadaCount);
      } catch {
        if (!silent) onStatus("No se pudieron cargar los dispositivos.");
      } finally {
        if (!silent) setBusy(false);
      }
    },
    [online, onStatus, tamboId, token],
  );

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      void load(true);
    }, 10_000);
    return () => clearInterval(id);
  }, [load]);

  async function shareToken(value: string) {
    await Share.share({ message: `${value}\n\n${TOKEN_NOTICE}` });
  }

  async function install() {
    const bajada = needsBajada(kind) ? Number(bajadaNumber) : null;
    if (needsBajada(kind) && (!Number.isInteger(bajada) || bajada! < 1 || bajada! > bajadaCount)) {
      onStatus(`La bajada tiene que estar entre 1 y ${bajadaCount}.`);
      return;
    }
    setBusy(true);
    try {
      const result = await createDevice(token, {
        tamboId,
        kind,
        bajadaNumber: bajada,
        label: label.trim() || null,
      });
      setRevealedToken(result.deviceToken);
      setShowForm(false);
      setLabel("");
      await load(true);
      onStatus("");
    } catch (err) {
      onStatus(err instanceof Error ? err.message : "No se pudo instalar el dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  function confirmRotate(id: string) {
    Alert.alert(
      "Nueva clave",
      "El dispositivo deja de funcionar hasta que le cargues la clave nueva",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Generar",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const result = await rotateDeviceToken(token, id);
                setRevealedToken(result.deviceToken);
                await load(true);
                onStatus("");
              } catch (err) {
                onStatus(err instanceof Error ? err.message : "No se pudo generar la clave nueva.");
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }

  function confirmRetire(id: string) {
    Alert.alert("Retirar dispositivo", "Deja de aceptar datos. ¿Seguro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Retirar",
        style: "destructive",
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await retireDevice(token, id);
              setRevealedToken(null);
              await load(true);
              onStatus("Dispositivo retirado.");
            } catch (err) {
              onStatus(err instanceof Error ? err.message : "No se pudo retirar el dispositivo.");
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  return (
    <View style={styles.block}>
      <Text style={styles.section}>Dispositivos</Text>
      <Pressable
        style={[styles.buttonSecondary, busy && styles.disabled]}
        onPress={() => void load()}
        disabled={busy}
      >
        <Text style={styles.buttonSecondaryText}>Actualizar</Text>
      </Pressable>

      {revealedToken ? (
        <View style={styles.tokenBox}>
          <Text style={styles.token}>{revealedToken}</Text>
          <Text style={styles.help}>{TOKEN_NOTICE}</Text>
          <Pressable style={styles.button} onPress={() => void shareToken(revealedToken)}>
            <Text style={styles.buttonText}>Compartir</Text>
          </Pressable>
          <Pressable onPress={() => setRevealedToken(null)}>
            <Text style={styles.link}>Cerrar</Text>
          </Pressable>
        </View>
      ) : null}

      {busy && items.length === 0 ? <ActivityIndicator color={colors.primary} /> : null}
      {items.length === 0 && !busy ? (
        <Text style={styles.empty}>Todavía no hay dispositivos en este tambo.</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemTitle}>{KIND_LABEL[item.kind]}</Text>
            <Text style={styles.itemMeta}>
              {item.bajadaNumber != null ? `Bajada ${item.bajadaNumber}` : "Nivel tambo"}
              {item.label ? ` · ${item.label}` : ""}
            </Text>
            <Text style={styles.itemMeta}>{deviceStatus(item)}</Text>
            {canManage ? (
              <View style={styles.row}>
                <Pressable
                  style={[styles.buttonSecondary, busy && styles.disabled]}
                  onPress={() => confirmRotate(item.id)}
                  disabled={busy}
                >
                  <Text style={styles.buttonSecondaryText}>Nueva clave</Text>
                </Pressable>
                <Pressable
                  style={[styles.buttonDanger, busy && styles.disabled]}
                  onPress={() => confirmRetire(item.id)}
                  disabled={busy}
                >
                  <Text style={styles.buttonDangerText}>Retirar</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))
      )}

      {canManage ? (
        showForm ? (
          <View style={styles.form}>
            <Text style={styles.help}>Tipo</Text>
            {KINDS.map((value) => (
              <Pressable
                key={value}
                style={[styles.kindChip, kind === value && styles.kindChipOn]}
                onPress={() => setKind(value)}
              >
                <Text style={[styles.kindChipText, kind === value && styles.kindChipTextOn]}>
                  {KIND_LABEL[value]}
                </Text>
              </Pressable>
            ))}
            {needsBajada(kind) ? (
              <>
                <Text style={styles.help}>Bajada (1 a {bajadaCount})</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={bajadaNumber}
                  onChangeText={setBajadaNumber}
                />
              </>
            ) : null}
            <Text style={styles.help}>Etiqueta (opcional)</Text>
            <TextInput style={styles.input} value={label} onChangeText={setLabel} />
            <Pressable
              style={[styles.button, busy && styles.disabled]}
              onPress={() => void install()}
              disabled={busy}
            >
              <Text style={styles.buttonText}>Instalar</Text>
            </Pressable>
            <Pressable onPress={() => setShowForm(false)}>
              <Text style={styles.link}>Cancelar</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.buttonSecondary} onPress={() => setShowForm(true)}>
            <Text style={styles.buttonSecondaryText}>Instalar dispositivo</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.md },
  section: {
    fontSize: font.label,
    fontWeight: "700",
    color: colors.text,
    marginTop: space.sm,
  },
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
  row: { gap: space.sm, marginTop: space.sm },
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
  buttonDanger: {
    backgroundColor: colors.dangerSoft,
    paddingVertical: space.lg,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.danger,
    minHeight: touch.min,
    justifyContent: "center",
  },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: font.button },
  buttonSecondaryText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: font.button,
  },
  buttonDangerText: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: font.button,
  },
  disabled: { opacity: 0.6 },
  tokenBox: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.sm,
  },
  token: { color: colors.text, fontWeight: "700", fontSize: 15 },
  form: { gap: space.sm },
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
  kindChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
  },
  kindChipOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  kindChipText: { color: colors.textMuted, fontWeight: "600" },
  kindChipTextOn: { color: colors.primary },
  link: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: font.body,
    paddingVertical: space.sm,
  },
});
