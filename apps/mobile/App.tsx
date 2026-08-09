import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import NetInfo from "@react-native-community/netinfo";
import { fetchTambos, login as apiLogin } from "./src/api";
import {
  countPendingOutbox,
  getDb,
  listActiveWithdrawalsLocal,
  listAnimals,
  type LocalAnimal,
  type LocalHealthEvent,
} from "./src/db";
import {
  clearSession,
  loadSession,
  saveSession,
  type Session,
} from "./src/session";
import {
  fullSync,
  pullServerState,
  queueHealthEventOffline,
} from "./src/sync";
import { colors, font, radius, space, touch } from "./src/theme";

function tipoLegible(type: string): string {
  switch (type) {
    case "TREATMENT":
      return "Tratamiento";
    case "MASTITIS":
      return "Mastitis";
    default:
      return "Otro";
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [withdrawals, setWithdrawals] = useState<LocalHealthEvent[]>([]);
  const [animals, setAnimals] = useState<LocalAnimal[]>([]);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("admin@gtlt.local");
  const [password, setPassword] = useState("demo1234");
  const [earTag, setEarTag] = useState("101");
  const [productName, setProductName] = useState("");
  const [daysWithdrawal, setDaysWithdrawal] = useState("3");

  const refreshLocal = useCallback(async (tamboId: string) => {
    setWithdrawals(await listActiveWithdrawalsLocal(tamboId));
    setAnimals(await listAnimals(tamboId));
    setPending(await countPendingOutbox());
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await getDb();
      const existing = await loadSession();
      if (existing && mounted) {
        setSession(existing);
        await refreshLocal(existing.tamboId);
      }
      if (mounted) setReady(true);
    })().catch(() => setStatus("No se pudo abrir la app. Cerrala y volvé a entrar."));

    const unsub = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [refreshLocal]);

  async function handleLogin() {
    setBusy(true);
    setStatus("Entrando...");
    try {
      const res = await apiLogin(email.trim(), password);
      const tambos = await fetchTambos(res.accessToken);
      if (!tambos.items.length) {
        throw new Error("No encontramos un tambo para esta cuenta.");
      }
      const tambo = tambos.items[0];
      const next: Session = {
        token: res.accessToken,
        tamboId: tambo.id,
        tamboName: tambo.name,
        userName: res.user.name,
      };
      await saveSession(next);
      await pullServerState(next.token, next.tamboId);
      setSession(next);
      await refreshLocal(next.tamboId);
      setStatus(`Listo. Estás en ${tambo.name}.`);
    } catch {
      setStatus("No se pudo entrar. Revisá usuario, contraseña o la señal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await clearSession();
    setSession(null);
    setWithdrawals([]);
    setAnimals([]);
    setPending(0);
    setStatus("Saliste de la cuenta.");
  }

  async function handleQueueEvent() {
    if (!session) return;
    const animal = animals.find((a) => a.ear_tag === earTag.trim());
    if (!animal) {
      setStatus(
        `No encontramos la caravana ${earTag}. Tocá “Actualizar” con señal y revisá el número.`,
      );
      return;
    }

    const days = Number(daysWithdrawal);
    const until =
      Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;

    setBusy(true);
    try {
      await queueHealthEventOffline({
        tamboId: session.tamboId,
        animalId: animal.id,
        type: "TREATMENT",
        productName: productName.trim() || undefined,
        milkWithdrawalUntil: until,
        notes: "Carga desde el celular",
      });
      await refreshLocal(session.tamboId);
      setStatus(
        online
          ? "Guardado en el teléfono. Tocá “Enviar” para subirlo."
          : "Guardado sin señal. Cuando haya internet, tocá “Enviar”.",
      );
    } catch {
      setStatus("No se pudo guardar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!session) return;
    if (!online) {
      setStatus("Ahora no hay señal. Los datos siguen guardados en el teléfono.");
      return;
    }
    setBusy(true);
    setStatus("Enviando...");
    try {
      const result = await fullSync(session.token, session.tamboId);
      await refreshLocal(session.tamboId);
      if (result.failed > 0) {
        setStatus("Algunos no se pudieron enviar. Tocá “Enviar” de nuevo.");
      } else if (result.synced === 0 && result.pendingLeft === 0) {
        setStatus("Todo al día. No había nada pendiente.");
      } else {
        setStatus("Listo. Ya se envió todo.");
      }
    } catch {
      setStatus("No se pudo enviar. Revisá la señal y probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  const hayPendientes = pending > 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>GTLT Tambos</Text>
            <View style={[styles.chip, online ? styles.chipOk : styles.chipWarn]}>
              <Text style={[styles.chipText, !online && styles.chipTextWarn]}>
                {online ? "Con señal" : "Sin señal"}
                {hayPendientes ? ` · ${pending} sin enviar` : ""}
              </Text>
            </View>
            {session ? (
              <Text style={styles.meta}>
                {session.userName} · {session.tamboName}
              </Text>
            ) : null}
          </View>

          {!session ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Entrar</Text>
              <Text style={styles.help}>Usá el usuario y la clave que te dieron.</Text>
              <Text style={styles.label}>Usuario o correo</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                placeholder="Ej: juan@correo.com"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="Tu contraseña"
                placeholderTextColor={colors.textMuted}
              />
              {status ? (
                <View style={styles.feedback}>
                  <Text style={styles.feedbackText}>{status}</Text>
                </View>
              ) : null}
              <Pressable
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={busy}
              >
                <Text style={styles.buttonText}>Entrar</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Cargar tratamiento</Text>
                <Text style={styles.help}>
                  Anotá la caravana. Se guarda aunque no haya señal.
                </Text>
                <Text style={styles.label}>Número de caravana</Text>
                <TextInput
                  style={styles.input}
                  value={earTag}
                  onChangeText={setEarTag}
                  placeholder="Ej: 101"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                />
                <Text style={styles.label}>Remedio o producto</Text>
                <TextInput
                  style={styles.input}
                  value={productName}
                  onChangeText={setProductName}
                  placeholder="Ej: antibiótico"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.label}>Días de retiro de leche</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={daysWithdrawal}
                  onChangeText={setDaysWithdrawal}
                  placeholder="Ej: 3"
                  placeholderTextColor={colors.textMuted}
                />
                {status ? (
                  <View style={styles.feedback}>
                    <Text style={styles.feedbackText}>{status}</Text>
                  </View>
                ) : null}

                {/* Si hay pendientes, Enviar va primero y en verde (acción siguiente clara). */}
                {hayPendientes ? (
                  <>
                    <Pressable
                      style={[styles.button, busy && styles.buttonDisabled]}
                      onPress={handleSync}
                      disabled={busy}
                    >
                      <Text style={styles.buttonText}>Enviar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                      onPress={handleQueueEvent}
                      disabled={busy}
                    >
                      <Text style={styles.buttonSecondaryText}>Guardar otro</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable
                      style={[styles.button, busy && styles.buttonDisabled]}
                      onPress={handleQueueEvent}
                      disabled={busy}
                    >
                      <Text style={styles.buttonText}>Guardar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                      onPress={handleSync}
                      disabled={busy}
                    >
                      <Text style={styles.buttonSecondaryText}>Enviar / Actualizar</Text>
                    </Pressable>
                  </>
                )}

                <Pressable onPress={handleLogout}>
                  <Text style={styles.link}>Salir</Text>
                </Pressable>
              </View>

              <Text style={styles.section}>Vacas con retiro de leche</Text>
              {withdrawals.length === 0 ? (
                <Text style={styles.empty}>No hay vacas en retiro por ahora.</Text>
              ) : (
                withdrawals.map((item) => (
                  <View key={item.id} style={styles.item}>
                    <Text style={styles.itemTitle}>
                      Caravana {item.ear_tag ?? "?"} · {tipoLegible(item.type)}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {item.product_name
                        ? `Producto: ${item.product_name}`
                        : "Sin producto"}
                    </Text>
                    <Text style={styles.itemMeta}>
                      Retiro hasta:{" "}
                      {item.milk_withdrawal_until
                        ? new Date(item.milk_withdrawal_until).toLocaleString(
                            "es-AR",
                          )
                        : "-"}
                    </Text>
                    {item.pending ? (
                      <Text style={styles.pendingBadge}>Falta enviar</Text>
                    ) : null}
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: { flex: 1 },
  scrollContent: {
    padding: space.lg,
    paddingBottom: space.xl * 2,
    gap: space.md,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    backgroundColor: colors.bg,
  },
  loadingText: { color: colors.textMuted, fontSize: font.body },
  header: { gap: space.sm },
  title: {
    fontSize: font.display,
    fontWeight: "700",
    color: colors.text,
  },
  meta: { color: colors.textMuted, fontSize: font.meta },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  chipOk: { backgroundColor: colors.primarySoft },
  chipWarn: { backgroundColor: colors.accentSoft },
  chipText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: font.meta,
  },
  chipTextWarn: { color: colors.accentText },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: font.title,
    fontWeight: "700",
    color: colors.text,
  },
  help: {
    color: colors.textMuted,
    fontSize: font.body,
    lineHeight: 24,
  },
  label: {
    fontSize: font.label,
    fontWeight: "600",
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    backgroundColor: colors.bg,
    fontSize: font.input,
    color: colors.text,
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
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: colors.bg,
    fontWeight: "700",
    fontSize: font.button,
  },
  buttonSecondaryText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: font.button,
  },
  link: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: font.body,
    paddingVertical: space.sm,
  },
  section: {
    fontSize: font.title,
    fontWeight: "700",
    color: colors.text,
    marginTop: space.sm,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.xs,
  },
  itemTitle: {
    fontWeight: "700",
    color: colors.text,
    fontSize: 17,
  },
  itemMeta: { color: colors.textMuted, fontSize: 15 },
  pendingBadge: {
    marginTop: space.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    color: colors.accentText,
    overflow: "hidden",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    fontWeight: "700",
    fontSize: 13,
  },
  empty: { color: colors.textMuted, fontSize: font.body },
  feedback: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  feedbackText: {
    color: colors.accentText,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
});
