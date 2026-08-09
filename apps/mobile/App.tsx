import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import NetInfo from "@react-native-community/netinfo";
import { fetchTambos, login as apiLogin } from "./src/api";
import { API_URL } from "./src/config";
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
  const [productName, setProductName] = useState("Antibiotico demo");
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
    })().catch((err) => setStatus(String(err)));

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
    setStatus("Login...");
    try {
      const res = await apiLogin(email.trim(), password);
      const tambos = await fetchTambos(res.accessToken);
      if (!tambos.items.length) {
        throw new Error("No hay tambos para este usuario");
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
      setStatus(`Sesión OK · ${tambo.name}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Login falló");
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
    setStatus("Sesión cerrada");
  }

  async function handleQueueEvent() {
    if (!session) return;
    const animal = animals.find((a) => a.ear_tag === earTag.trim());
    if (!animal) {
      setStatus(`No hay animal local con caravana ${earTag}. Hacé Sync primero.`);
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
        notes: "Spike offline",
      });
      await refreshLocal(session.tamboId);
      setStatus(
        online
          ? "Guardado local (pending). Tocá Sync para subir."
          : "Guardado OFFLINE. Se subirá cuando haya red + Sync.",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    if (!session) return;
    if (!online) {
      setStatus("Sin red: no se puede sincronizar ahora");
      return;
    }
    setBusy(true);
    setStatus("Sincronizando...");
    try {
      const result = await fullSync(session.token, session.tamboId);
      await refreshLocal(session.tamboId);
      setStatus(
        `Sync OK · subidos ${result.synced}, fallidos ${result.failed}, pending ${result.pendingLeft}`,
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Sync falló");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>GTLT · spike offline</Text>
        <Text style={styles.meta}>
          API {API_URL} · {online ? "online" : "OFFLINE"} · pending {pending}
        </Text>
        {session ? (
          <Text style={styles.meta}>
            {session.userName} · {session.tamboName}
          </Text>
        ) : null}
      </View>

      {!session ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Login</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            placeholder="email"
          />
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="password"
          />
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={busy}
          >
            <Text style={styles.buttonText}>Entrar + pull inicial</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nuevo tratamiento (local-first)</Text>
            <TextInput
              style={styles.input}
              value={earTag}
              onChangeText={setEarTag}
              placeholder="Caravana"
            />
            <TextInput
              style={styles.input}
              value={productName}
              onChangeText={setProductName}
              placeholder="Producto"
            />
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={daysWithdrawal}
              onChangeText={setDaysWithdrawal}
              placeholder="Días de retiro"
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.button, styles.flex, busy && styles.buttonDisabled]}
                onPress={handleQueueEvent}
                disabled={busy}
              >
                <Text style={styles.buttonText}>Guardar local</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonSecondary, styles.flex, busy && styles.buttonDisabled]}
                onPress={handleSync}
                disabled={busy}
              >
                <Text style={styles.buttonSecondaryText}>Sync</Text>
              </Pressable>
            </View>
            <Pressable onPress={handleLogout}>
              <Text style={styles.link}>Cerrar sesión</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>Retiros vigentes (SQLite)</Text>
          <FlatList
            data={withdrawals}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>No hay retiros vigentes en cache local.</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.item}>
                <Text style={styles.itemTitle}>
                  #{item.ear_tag ?? "?"} · {item.type}
                  {item.pending ? " · PENDING" : ""}
                </Text>
                <Text style={styles.itemMeta}>
                  {item.product_name ?? "sin producto"} · hasta{" "}
                  {item.milk_withdrawal_until
                    ? new Date(item.milk_withdrawal_until).toLocaleString()
                    : "-"}
                </Text>
              </View>
            )}
          />
        </>
      )}

      {status ? <Text style={styles.status}>{status}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f1ea", padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 12, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", color: "#1f2a1f" },
  meta: { color: "#5c665c", fontSize: 12 },
  card: {
    backgroundColor: "#fffdf8",
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e4ddd0",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#1f2a1f" },
  input: {
    borderWidth: 1,
    borderColor: "#d5cec2",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  button: {
    backgroundColor: "#2f5d3a",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonSecondary: {
    backgroundColor: "#e8f0ea",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2f5d3a",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600" },
  buttonSecondaryText: { color: "#2f5d3a", fontWeight: "600" },
  link: { color: "#6b4f3a", textAlign: "center", marginTop: 4 },
  section: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#1f2a1f",
  },
  list: { paddingBottom: 80, gap: 8 },
  item: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e4ddd0",
  },
  itemTitle: { fontWeight: "600", color: "#1f2a1f" },
  itemMeta: { color: "#5c665c", marginTop: 4, fontSize: 12 },
  empty: { color: "#7a847a", fontStyle: "italic" },
  status: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: "#1f2a1f",
    color: "#fff",
    padding: 10,
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 12,
  },
});
