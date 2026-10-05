import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  ApiError,
  createWorkReport,
  patchWorkReport,
  photoSource,
  replaceWorkReportParts,
  submitWorkReport,
  uploadPhoto,
  type PartInstanceItem,
  type WorkReportItem,
  type WorkReportMeasurement,
} from "./api";
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

function errMsg(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

function partLine(p: PartInstanceItem) {
  return [
    p.partType.name,
    p.label,
    p.bajadaNumber != null ? `bajada ${p.bajadaNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function dueRank(p: PartInstanceItem) {
  if (p.life?.kind === "USAGE_BASED" && p.life.status === "OVERDUE") return 0;
  if (p.life?.kind === "USAGE_BASED" && p.life.status === "SOON") return 1;
  return 2;
}

type Props = {
  token: string;
  tamboId: string;
  online: boolean;
  serviceRequestId?: string | null;
  parts: PartInstanceItem[];
  onStatus: (msg: string) => void;
  onChanged: () => void;
};

export function WorkReportScreen({
  token,
  tamboId,
  online,
  serviceRequestId,
  parts,
  onStatus,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<WorkReportItem | null>(null);
  const [summary, setSummary] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [tasks, setTasks] = useState<string[]>([]);
  const [hours, setHours] = useState("");
  const [measurements, setMeasurements] = useState<WorkReportMeasurement[]>([]);
  const [measureLabel, setMeasureLabel] = useState("");
  const [measureValue, setMeasureValue] = useState("");
  const [measureUnit, setMeasureUnit] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [chip, setChip] = useState<string | null>("today");
  const [other, setOther] = useState("");

  const readOnly = report?.status === "SUBMITTED";
  const ownWork = !serviceRequestId;

  const sortedParts = useMemo(
    () => [...parts].sort((a, b) => dueRank(a) - dueRank(b) || a.partType.name.localeCompare(b.partType.name, "es")),
    [parts],
  );

  const applyReport = useCallback((item: WorkReportItem) => {
    setReport(item);
    setSummary(item.summary);
    setTasks(item.tasks);
    setHours(item.hoursWorked != null ? String(item.hoursWorked) : "");
    setMeasurements(item.measurements);
    setPhotoUrls(item.photoUrls);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!online) {
        onStatus("Para armar el informe hace falta señal.");
        return;
      }
      setBusy(true);
      try {
        const res = await createWorkReport(token, {
          tamboId,
          ...(serviceRequestId ? { serviceRequestId } : {}),
        });
        if (cancelled) return;
        applyReport(res.item);
        onStatus("");
      } catch (err) {
        if (!cancelled) onStatus(errMsg(err, "No se pudo abrir el informe."));
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyReport, online, onStatus, serviceRequestId, tamboId, token]);

  async function saveDraft(extra?: Partial<Parameters<typeof patchWorkReport>[2]>) {
    if (!report || readOnly) return report;
    const hoursWorked = hours.trim() === "" ? null : Number(hours.replace(",", "."));
    if (hours.trim() !== "" && (!Number.isFinite(hoursWorked) || hoursWorked! < 0 || hoursWorked! > 100)) {
      throw new Error("Las horas tienen que estar entre 0 y 100.");
    }
    const res = await patchWorkReport(token, report.id, {
      summary,
      tasks,
      hoursWorked,
      measurements,
      photoUrls,
      ...extra,
    });
    applyReport(res.item);
    return res.item;
  }

  function addTask() {
    const text = taskDraft.trim();
    if (!text) return;
    if (tasks.length >= 30) {
      onStatus("Como máximo 30 tareas.");
      return;
    }
    setTasks((prev) => [...prev, text.slice(0, 200)]);
    setTaskDraft("");
  }

  function addMeasurement() {
    if (!measureLabel.trim() || !measureValue.trim()) {
      onStatus("Completá nombre y valor de la medición.");
      return;
    }
    if (measurements.length >= 20) {
      onStatus("Como máximo 20 mediciones.");
      return;
    }
    setMeasurements((prev) => [
      ...prev,
      {
        label: measureLabel.trim().slice(0, 80),
        value: measureValue.trim().slice(0, 80),
        ...(measureUnit.trim() ? { unit: measureUnit.trim().slice(0, 40) } : {}),
      },
    ]);
    setMeasureLabel("");
    setMeasureValue("");
    setMeasureUnit("");
  }

  async function pickPhoto() {
    if (photoUrls.length >= 6) {
      onStatus("Como máximo 6 fotos.");
      return;
    }
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    let uri: string | undefined;
    if (cam.granted) {
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.4, allowsEditing: false });
      if (!shot.canceled) uri = shot.assets[0]?.uri;
    }
    if (!uri) {
      const gallery = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!gallery.granted) {
        onStatus("Necesitamos permiso de cámara o galería para la foto.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.4, allowsEditing: false });
      if (!picked.canceled) uri = picked.assets[0]?.uri;
    }
    if (!uri || !report) return;
    setBusy(true);
    try {
      await saveDraft();
      const { url } = await uploadPhoto(token, uri);
      const next = [...photoUrls, url].slice(0, 6);
      await saveDraft({ photoUrls: next });
    } catch (err) {
      onStatus(errMsg(err, "No se pudo subir la foto."));
    } finally {
      setBusy(false);
    }
  }

  async function registerParts() {
    if (!report || readOnly) return;
    const instanceIds = Object.entries(selected)
      .filter(([, on]) => on)
      .map(([id]) => id);
    if (instanceIds.length === 0) {
      onStatus("Elegí al menos una pieza.");
      return;
    }
    const installed = resolveInstallDate(chip, other);
    if (!installed) {
      onStatus("Elegí cuándo se instalaron las piezas nuevas.");
      return;
    }
    setBusy(true);
    try {
      await saveDraft();
      const res = await replaceWorkReportParts(token, report.id, {
        instanceIds,
        installedAt: installed.date.toISOString(),
        installedAtApprox: installed.approx,
      });
      applyReport(res.item);
      setSelected({});
      onChanged();
      onStatus(`Se registraron ${instanceIds.length} piezas cambiadas.`);
    } catch (err) {
      const extra =
        err instanceof ApiError && Array.isArray(err.body?.invalidIds)
          ? ` (${err.body.invalidIds.length} inválidas)`
          : "";
      onStatus(errMsg(err, "No se pudieron cambiar las piezas.") + extra);
    } finally {
      setBusy(false);
    }
  }

  function confirmSubmit() {
    Alert.alert("Enviar informe", "Después de enviarlo no se puede editar.", [
      { text: "Seguir editando", style: "cancel" },
      { text: "Enviar", onPress: () => void doSubmit() },
    ]);
  }

  async function doSubmit() {
    if (!report || readOnly) return;
    setBusy(true);
    try {
      await saveDraft();
      const res = await submitWorkReport(token, report.id);
      applyReport(res.item);
      onChanged();
      onStatus("Informe enviado. Quedó cerrado.");
    } catch (err) {
      onStatus(errMsg(err, "No se pudo enviar el informe."));
    } finally {
      setBusy(false);
    }
  }

  if (!report && busy) {
    return <ActivityIndicator color={colors.primary} />;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {ownWork ? "Trabajo propio" : "Informe de trabajo"}
      </Text>
      {report?.status === "SUBMITTED" ? (
        <Text style={styles.help}>Enviado. Ya no se puede editar.</Text>
      ) : (
        <Text style={styles.help}>
          {ownWork
            ? "Registrá lo que hiciste en el tambo, sin pedido de service."
            : "Completá el informe de este pedido y envialo al dueño."}
        </Text>
      )}

      <Text style={styles.label}>Resumen</Text>
      <TextInput
        style={styles.input}
        value={summary}
        onChangeText={setSummary}
        editable={!readOnly}
        multiline
        placeholder="Qué se hizo"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Tareas</Text>
      {tasks.map((t, i) => (
        <View key={`${t}-${i}`} style={styles.row}>
          <Text style={styles.itemMeta}>{t}</Text>
          {readOnly ? null : (
            <Pressable onPress={() => setTasks((prev) => prev.filter((_, idx) => idx !== i))}>
              <Text style={styles.link}>Quitar</Text>
            </Pressable>
          )}
        </View>
      ))}
      {readOnly ? null : (
        <>
          <TextInput
            style={styles.input}
            value={taskDraft}
            onChangeText={setTaskDraft}
            placeholder="Nueva tarea"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable style={styles.buttonSecondary} onPress={addTask}>
            <Text style={styles.buttonSecondaryText}>Agregar tarea</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.label}>Horas</Text>
      <TextInput
        style={styles.input}
        value={hours}
        onChangeText={setHours}
        editable={!readOnly}
        keyboardType="decimal-pad"
        placeholder="Opcional"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Mediciones</Text>
      {measurements.map((m, i) => (
        <View key={`${m.label}-${i}`} style={styles.row}>
          <Text style={styles.itemMeta}>
            {m.label}: {m.value}
            {m.unit ? ` ${m.unit}` : ""}
          </Text>
          {readOnly ? null : (
            <Pressable onPress={() => setMeasurements((prev) => prev.filter((_, idx) => idx !== i))}>
              <Text style={styles.link}>Quitar</Text>
            </Pressable>
          )}
        </View>
      ))}
      {readOnly ? null : (
        <>
          <TextInput
            style={styles.input}
            value={measureLabel}
            onChangeText={setMeasureLabel}
            placeholder="Nombre"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={measureValue}
            onChangeText={setMeasureValue}
            placeholder="Valor"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={measureUnit}
            onChangeText={setMeasureUnit}
            placeholder="Unidad (opcional)"
            placeholderTextColor={colors.textMuted}
          />
          <Pressable style={styles.buttonSecondary} onPress={addMeasurement}>
            <Text style={styles.buttonSecondaryText}>Agregar medición</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.label}>Fotos</Text>
      {photoUrls.map((url) => (
        <Image key={url} source={photoSource(token, url)} style={styles.photo} resizeMode="cover" />
      ))}
      {readOnly ? null : (
        <Pressable
          style={[styles.buttonSecondary, busy && styles.disabled]}
          onPress={() => void pickPhoto()}
          disabled={busy}
        >
          <Text style={styles.buttonSecondaryText}>Sacar foto</Text>
        </Pressable>
      )}

      <Text style={styles.section}>Piezas cambiadas</Text>
      {(report?.replacedParts ?? []).length === 0 ? (
        <Text style={styles.help}>Todavía no registraste cambios en este informe.</Text>
      ) : (
        (report?.replacedParts ?? []).map((p) => (
          <Text key={p.id} style={styles.itemMeta}>
            {p.partTypeName}
            {p.label ? ` · ${p.label}` : ""}
            {p.bajadaNumber != null ? ` · bajada ${p.bajadaNumber}` : ""}
            {` · ${new Date(p.installedAt).toLocaleDateString("es-AR")}`}
          </Text>
        ))
      )}

      {readOnly ? null : (
        <>
          <Text style={styles.help}>Primero las vencidas o por vencer. Tilá y registrá el cambio.</Text>
          {sortedParts.map((p) => {
            const on = Boolean(selected[p.id]);
            return (
              <Pressable
                key={p.id}
                style={styles.item}
                onPress={() => setSelected((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
              >
                <Text style={styles.itemTitle}>
                  {on ? "☑ " : "☐ "}
                  {partLine(p)}
                </Text>
                {p.life?.kind === "USAGE_BASED" ? (
                  <Text style={styles.itemMeta}>
                    {p.life.status === "OVERDUE"
                      ? "Para cambiar"
                      : p.life.status === "SOON"
                        ? "Cambiar pronto"
                        : "OK"}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
          <Text style={styles.label}>¿Cuándo se instalaron las nuevas?</Text>
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
          <Pressable
            style={[styles.buttonSecondary, busy && styles.disabled]}
            onPress={() => void registerParts()}
            disabled={busy}
          >
            <Text style={styles.buttonSecondaryText}>Registrar cambio</Text>
          </Pressable>
          <Pressable
            style={[styles.button, busy && styles.disabled]}
            onPress={confirmSubmit}
            disabled={busy}
          >
            <Text style={styles.buttonText}>Enviar informe</Text>
          </Pressable>
        </>
      )}
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
  section: { fontSize: font.label, fontWeight: "700", color: colors.text, marginTop: space.sm },
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
  buttonSecondaryText: { color: colors.primary, fontWeight: "700", fontSize: font.button },
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
  itemMeta: { color: colors.textMuted, fontSize: 15, flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
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
  link: { color: colors.primary, fontWeight: "600" },
  photo: { width: "100%", height: 160, borderRadius: radius.md, backgroundColor: colors.bgSubtle },
});
