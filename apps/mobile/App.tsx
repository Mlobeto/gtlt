import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import NetInfo from "@react-native-community/netinfo";
import {
  ApiError,
  acceptTechnicianInviteRegister,
  approveServiceRequest,
  createPartInstance,
  createServiceRequest,
  createSire,
  fetchAnimalTimeline,
  fetchNotifications,
  fetchPartInstances,
  fetchPartTypes,
  fetchServiceRequests,
  fetchSires,
  fetchTambos,
  inviteTechnician,
  isOwnerOrAdmin,
  isTechnicianOnly,
  login as apiLogin,
  markAllNotificationsRead,
  markNotificationRead,
  rejectServiceRequest,
  replacePartInstance,
  updateTamboSettings,
  uploadPhoto,
  type AppNotification,
  type PartInstanceItem,
  type PartTypeItem,
  type ServiceRequestItem,
} from "./src/api";
import { TechnicianHome } from "./src/TechnicianHome";
import {
  countPendingOutbox,
  getDb,
  getLocalAnimal,
  listActiveWithdrawalsLocal,
  listAnimalPhotosForAnimal,
  listAnimals,
  listHealthEventsForAnimal,
  listLocalControlLecheros,
  listLocalMilkDeliveries,
  listLocalMilkingSessions,
  listLocalReproEvents,
  listReproEventsForAnimal,
  listWeightEventsForAnimal,
  type LocalAnimal,
  type LocalControlLechero,
  type LocalHealthEvent,
  type LocalMilkDelivery,
  type LocalMilkingSession,
  type LocalReproEvent,
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
  queueAnimalCreateOffline,
  queueAnimalPhotoOffline,
  queueAnimalUpdateOffline,
  queueControlLecheroOffline,
  queueHealthEventOffline,
  queueMilkDeliveryOffline,
  queueMilkingCorrectionOffline,
  queueMilkingSessionOffline,
  queueReproEventOffline,
  queueWeightEventOffline,
} from "./src/sync";
import { colors, font, radius, space, touch } from "./src/theme";
import {
  parseVoiceCommand,
  type ParsedVoiceCommand,
} from "./src/voice/parseCommand";
import {
  derivePregnancy,
  reproHistoryDetail,
  type PregnancySummary,
} from "./src/animals/pregnancy";

type Screen =
  | "home"
  | "milking"
  | "treatment"
  | "withdrawals"
  | "repro"
  | "delivery"
  | "control"
  | "animals"
  | "animalDetail"
  | "animalForm"
  | "parts"
  | "partForm"
  | "service"
  | "notifications";

type ServiceCategory =
  | "VACUUM_PUMP"
  | "COLD_EQUIPMENT"
  | "MILKING_GROUP"
  | "OTHER";

type HealthFormType = "MASTITIS" | "TREATMENT";
type ReproFormType = "HEAT" | "SERVICE" | "EXPECTED_CALVING" | "CALVING";
type AnimalHistoryItem = {
  kind: string;
  id: string;
  at: string;
  label: string;
  detail?: string;
};

const MENU = [
  { key: "milking" as const, emoji: "🐄", label: "Ordeñe", hint: "Turno, litros y carga rápida" },
  { key: "animals" as const, emoji: "📒", label: "Vacas", hint: "Ficha, foto e historial" },
  { key: "treatment" as const, emoji: "💊", label: "Sanidad", hint: "Mastitis, tratamiento y retiro" },
  { key: "repro" as const, emoji: "🔔", label: "Repro", hint: "Celo, servicio, parto" },
  { key: "delivery" as const, emoji: "🚛", label: "Entrega", hint: "Tanque vs camión" },
  { key: "control" as const, emoji: "📋", label: "Control lechero", hint: "Litros por vaca / bajada" },
  {
    key: "withdrawals" as const,
    emoji: "❌",
    label: "Retiros",
    hint: "Leche que no se puede mezclar",
  },
  {
    key: "parts" as const,
    emoji: "⚙️",
    label: "Equipo",
    hint: "Piezas de ordeñe y frío",
  },
  {
    key: "service" as const,
    emoji: "🔧",
    label: "Service",
    hint: "Pedir técnico o invitar",
  },
  {
    key: "notifications" as const,
    emoji: "🔔",
    label: "Avisos",
    hint: "Pedidos y aprobaciones",
  },
];

const SERVICE_CATEGORIES: { key: ServiceCategory; label: string }[] = [
  { key: "VACUUM_PUMP", label: "Bomba de vacío" },
  { key: "COLD_EQUIPMENT", label: "Equipo de frío" },
  { key: "MILKING_GROUP", label: "Grupo de ordeñe" },
  { key: "OTHER", label: "Otro" },
];

function tipoLegible(type: string): string {
  switch (type) {
    case "TREATMENT":
      return "Tratamiento";
    case "MASTITIS":
      return "Mastitis";
    case "HEAT":
      return "Celo";
    case "SERVICE":
      return "Servicio";
    case "EXPECTED_CALVING":
      return "Parto estimado";
    case "CALVING":
      return "Parición";
    case "ABORTION":
      return "Aborto";
    default:
      return "Otro";
  }
}

function turnoLegible(shift: string): string {
  return shift === "AFTERNOON" ? "Tarde" : "Mañana";
}

/** Label en español para items del timeline del servidor (kinds: weight, photo, transfer, control). */
function timelineItemLabel(kind: string, type: string, summary: string): string {
  if (kind === "health" || kind === "repro") return tipoLegible(type);
  if (kind === "weight") return `Peso: ${summary}`;
  if (kind === "photo") return type === "CONSULT" ? "Foto de consulta" : "Foto de perfil";
  if (kind === "transfer") return `Traslado: ${summary}`;
  if (kind === "control") return summary;
  return summary;
}

function hoyISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [withdrawals, setWithdrawals] = useState<LocalHealthEvent[]>([]);
  const [animals, setAnimals] = useState<LocalAnimal[]>([]);
  const [milkings, setMilkings] = useState<LocalMilkingSession[]>([]);
  const [repros, setRepros] = useState<LocalReproEvent[]>([]);
  const [deliveries, setDeliveries] = useState<LocalMilkDelivery[]>([]);
  const [controls, setControls] = useState<LocalControlLechero[]>([]);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("admin@gtlt.local");
  const [password, setPassword] = useState("demo1234");
  const [earTag, setEarTag] = useState("101");
  const [productName, setProductName] = useState("");
  const [daysWithdrawal, setDaysWithdrawal] = useState("3");
  const [healthType, setHealthType] = useState<HealthFormType>("MASTITIS");
  const [liters, setLiters] = useState("");
  const [shift, setShift] = useState<"MORNING" | "AFTERNOON">("MORNING");
  const [milkingShiftActive, setMilkingShiftActive] = useState(false);
  const [voiceCaptureOpen, setVoiceCaptureOpen] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState("");
  const [voiceConfirm, setVoiceConfirm] = useState<ParsedVoiceCommand | null>(null);
  const [voiceDays, setVoiceDays] = useState("3");
  const [correctLiters, setCorrectLiters] = useState("");
  const [reproType, setReproType] = useState<ReproFormType>("HEAT");
  const [expectedCalving, setExpectedCalving] = useState(addDaysISO(280));
  const [tankLiters, setTankLiters] = useState("");
  const [truckLiters, setTruckLiters] = useState("");
  const [tankTemp, setTankTemp] = useState("");
  const [truckTemp, setTruckTemp] = useState("");
  const [controlEarTag, setControlEarTag] = useState("101");
  const [controlBajada, setControlBajada] = useState("1");
  const [controlLiters, setControlLiters] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [animalDetail, setAnimalDetail] = useState<LocalAnimal | null>(null);
  const [animalHistory, setAnimalHistory] = useState<AnimalHistoryItem[]>([]);
  const [animalFormMode, setAnimalFormMode] = useState<"create" | "edit">("create");
  const [formEarTag, setFormEarTag] = useState("");
  const [formStatus, setFormStatus] = useState<"ACTIVE" | "DRY">("ACTIVE");
  const [formBirthDate, setFormBirthDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPhotoUri, setFormPhotoUri] = useState<string | null>(null);
  const [formBreed, setFormBreed] = useState("");
  const [formMotherEarTag, setFormMotherEarTag] = useState("");
  const [formSireId, setFormSireId] = useState<string | null>(null);
  const [sires, setSires] = useState<{ id: string; name: string; isExternal: boolean }[]>([]);
  const [newSireName, setNewSireName] = useState("");
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightKgInput, setWeightKgInput] = useState("");
  const [weightMethod, setWeightMethod] = useState<"SCALE" | "TAPE" | "VISUAL_ESTIMATE">(
    "VISUAL_ESTIMATE",
  );
  const [pregnancy, setPregnancy] = useState<PregnancySummary | null>(null);
  const [loginMode, setLoginMode] = useState<"login" | "acceptInvite">("login");
  const [inviteTenantId, setInviteTenantId] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [serviceCategory, setServiceCategory] =
    useState<ServiceCategory>("VACUUM_PUMP");
  const [serviceDescription, setServiceDescription] = useState("");
  const [inviteTechEmail, setInviteTechEmail] = useState("");
  const [inviteTechName, setInviteTechName] = useState("");
  const [inviteCompany, setInviteCompany] = useState("");
  const [serviceUrgent, setServiceUrgent] = useState(false);
  const [requiresOwnerApproval, setRequiresOwnerApproval] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState<ServiceRequestItem[]>(
    [],
  );
  const [partTypes, setPartTypes] = useState<PartTypeItem[]>([]);
  const [parts, setParts] = useState<PartInstanceItem[]>([]);
  const [partFormMode, setPartFormMode] = useState<"create" | "replace">("create");
  const [replacingPartId, setReplacingPartId] = useState<string | null>(null);
  const [partTypeId, setPartTypeId] = useState<string | null>(null);
  const [partBajada, setPartBajada] = useState("1");
  const [partBrandModel, setPartBrandModel] = useState("");
  const [partNotes, setPartNotes] = useState("");
  const [partPhotoUri, setPartPhotoUri] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  const onlineRef = useRef(true);
  const syncingRef = useRef(false);
  const wasOnlineRef = useRef(true);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const refreshLocal = useCallback(async (tamboId: string) => {
    setWithdrawals(await listActiveWithdrawalsLocal(tamboId));
    setAnimals(await listAnimals(tamboId));
    setMilkings(await listLocalMilkingSessions(tamboId));
    setRepros(await listLocalReproEvents(tamboId));
    setDeliveries(await listLocalMilkDeliveries(tamboId));
    setControls(await listLocalControlLecheros(tamboId));
    setPending(await countPendingOutbox());
  }, []);

  const runAutoSync = useCallback(
    async (reason: "online" | "foreground") => {
      const s = sessionRef.current;
      if (!s || !onlineRef.current || syncingRef.current) return;
      if (isTechnicianOnly(s.roles ?? [])) return;
      const left = await countPendingOutbox();
      if (left === 0 && reason === "foreground") {
        // pull suave al volver
      }
      syncingRef.current = true;
      try {
        const result = await fullSync(s.token, s.tamboId);
        await refreshLocal(s.tamboId);
        if (result.failed > 0) {
          setStatus("No se pudo enviar todo. Se reintenta al tener señal.");
        } else if (result.synced > 0) {
          setStatus("Se enviaron los datos pendientes.");
        }
      } catch {
        setStatus("No se pudo enviar. Se reintenta al tener señal.");
      } finally {
        syncingRef.current = false;
      }
    },
    [refreshLocal],
  );

  useEffect(() => {
    let mounted = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      await getDb();
      const existing = await loadSession();
      if (existing && mounted) {
        setSession(existing);
        if (!isTechnicianOnly(existing.roles ?? [])) {
          await refreshLocal(existing.tamboId);
          try {
            const tambos = await fetchTambos(existing.token);
            const t = tambos.items.find((x) => x.id === existing.tamboId);
            if (t) {
              setRequiresOwnerApproval(Boolean(t.serviceRequiresOwnerApproval));
            }
          } catch {
            // ignore
          }
          if (isOwnerOrAdmin(existing.roles ?? [])) {
            void loadNotifications(existing);
          }
        }
      }
      if (mounted) setReady(true);
    })().catch(() => setStatus("No se pudo abrir la app. Cerrala y volvé a entrar."));

    const unsub = NetInfo.addEventListener((state) => {
      const next = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(next);
      if (next && !wasOnlineRef.current) {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          void runAutoSync("online");
        }, 1500);
      }
      wasOnlineRef.current = next;
    });

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runAutoSync("foreground");
      }
    });

    return () => {
      mounted = false;
      unsub();
      appSub.remove();
      if (debounce) clearTimeout(debounce);
    };
  }, [refreshLocal, runAutoSync]);

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
      const techOnly = isTechnicianOnly(res.roles);
      const next: Session = {
        token: res.accessToken,
        tamboId: tambo.id,
        tamboName: tambo.name,
        userName: res.user.name,
        roles: res.roles,
        tenantId: res.tenant.id,
      };
      await saveSession(next);
      setRequiresOwnerApproval(Boolean(tambo.serviceRequiresOwnerApproval));
      if (!techOnly) {
        await pullServerState(next.token, next.tamboId);
        await refreshLocal(next.tamboId);
      }
      setSession(next);
      setScreen("home");
      if (isOwnerOrAdmin(res.roles)) {
        void loadNotifications(next);
      }
      setStatus(
        techOnly
          ? `Listo. Service en ${tambo.name}.`
          : `Listo. Estás en ${tambo.name}.`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "MEMBERSHIP_PENDING") {
        setLoginMode("acceptInvite");
        setStatus(
          "Tenés una invitación pendiente. Completá el código del tambo (tenant) y una clave.",
        );
      } else {
        setStatus("No se pudo entrar. Revisá usuario, contraseña o la señal.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptInvite() {
    if (!inviteTenantId.trim()) {
      setStatus("Falta el código del tenant que te pasaron.");
      return;
    }
    if (password.trim().length < 6) {
      setStatus("La clave tiene que tener al menos 6 caracteres.");
      return;
    }
    setBusy(true);
    setStatus("Activando cuenta...");
    try {
      await acceptTechnicianInviteRegister({
        tenantId: inviteTenantId.trim(),
        email: email.trim(),
        password: password.trim(),
        name: inviteName.trim() || undefined,
      });
      setLoginMode("login");
      setStatus("Cuenta lista. Tocá Entrar.");
    } catch {
      setStatus(
        "No se pudo activar. Revisá correo, código del tenant y que te hayan invitado.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateServiceRequest() {
    if (!session) return;
    if (!online) {
      setStatus("Para pedir service hace falta señal.");
      return;
    }
    if (!serviceDescription.trim()) {
      setStatus("Escribí qué pasa (una frase alcanza).");
      return;
    }
    setBusy(true);
    try {
      const { item } = await createServiceRequest(session.token, {
        tamboId: session.tamboId,
        category: serviceCategory,
        description: serviceDescription.trim(),
        urgency: serviceUrgent ? "URGENT" : "NORMAL",
      });
      setServiceDescription("");
      setServiceUrgent(false);
      if (item.status === "PENDING_APPROVAL") {
        setStatus(
          "Pedido enviado. Espera la autorización del dueño antes de que lo vea el técnico.",
        );
      } else {
        setStatus(
          serviceUrgent
            ? "Pedido URGENTE enviado. El dueño ya fue avisado."
            : "Pedido de service enviado. El dueño ya fue avisado.",
        );
      }
      if (isOwnerOrAdmin(session.roles)) {
        void loadNotifications(session);
      }
    } catch {
      setStatus("No se pudo enviar el pedido. Revisá la señal.");
    } finally {
      setBusy(false);
    }
  }

  async function loadNotifications(s: Session = session!) {
    if (!s) return;
    try {
      const [notes, pending] = await Promise.all([
        fetchNotifications(s.token),
        isOwnerOrAdmin(s.roles)
          ? fetchServiceRequests(s.token, s.tamboId, "PENDING_APPROVAL")
          : Promise.resolve({ items: [] as ServiceRequestItem[] }),
      ]);
      setNotifications(notes.items);
      setUnreadNotifications(notes.unreadCount);
      setPendingApprovals(pending.items);
    } catch {
      // silencioso en background
    }
  }

  async function handleToggleOwnerApproval(next: boolean) {
    if (!session) return;
    if (!online) {
      setStatus("Para cambiar esto hace falta señal.");
      return;
    }
    setBusy(true);
    try {
      const res = await updateTamboSettings(session.token, session.tamboId, {
        serviceRequiresOwnerApproval: next,
      });
      setRequiresOwnerApproval(res.item.serviceRequiresOwnerApproval);
      setStatus(
        next
          ? "Ahora el tambero necesita tu OK antes de llamar al técnico."
          : "El tambero puede pedir service directo al técnico.",
      );
    } catch {
      setStatus("No se pudo guardar la configuración.");
    } finally {
      setBusy(false);
    }
  }

  async function handleApproveRequest(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await approveServiceRequest(session.token, id);
      setStatus("Pedido aprobado. Ya lo puede ver el técnico.");
      await loadNotifications(session);
    } catch {
      setStatus("No se pudo aprobar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectRequest(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await rejectServiceRequest(session.token, id);
      setStatus("Pedido rechazado. Se avisó al tambero.");
      await loadNotifications(session);
    } catch {
      setStatus("No se pudo rechazar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleInviteTechnician() {
    if (!session) return;
    if (!online) {
      setStatus("Para invitar hace falta señal.");
      return;
    }
    if (!inviteTechEmail.trim()) {
      setStatus("Poné el correo del técnico.");
      return;
    }
    setBusy(true);
    try {
      await inviteTechnician(session.token, {
        tamboId: session.tamboId,
        email: inviteTechEmail.trim(),
        name: inviteTechName.trim() || undefined,
        companyName: inviteCompany.trim() || undefined,
      });
      setInviteTechEmail("");
      setInviteTechName("");
      setInviteCompany("");
      setStatus(
        `Invitación enviada. Pasale el código de tenant: ${session.tenantId}`,
      );
    } catch {
      setStatus("No se pudo invitar. Revisá el correo y la señal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await clearSession();
    setSession(null);
    setScreen("home");
    setWithdrawals([]);
    setAnimals([]);
    setMilkings([]);
    setRepros([]);
    setDeliveries([]);
    setControls([]);
    setPending(0);
    setStatus("Saliste de la cuenta.");
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

  async function handleQueueHealth() {
    if (!session) return;
    const animal = animals.find((a) => a.ear_tag === earTag.trim());
    if (!animal) {
      setStatus(
        `No encontramos la caravana ${earTag}. Tocá “Enviar / Actualizar” con señal y revisá el número.`,
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
        type: healthType,
        productName: productName.trim() || undefined,
        milkWithdrawalUntil: until,
        notes: "Carga desde el celular",
      });
      await refreshLocal(session.tamboId);
      setStatus(
        online
          ? "Guardado. Si hay señal se envía solo; si no, al volver."
          : "Guardado sin señal. Se envía solo cuando haya internet.",
      );
    } catch {
      setStatus("No se pudo guardar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQueueMilking() {
    if (!session) return;
    const value = Number(liters.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Anotá cuántos litros hubo en el turno.");
      return;
    }
    setBusy(true);
    try {
      const result = await queueMilkingSessionOffline({
        tamboId: session.tamboId,
        sessionDate: hoyISO(),
        shift,
        totalLiters: value,
      });
      await refreshLocal(session.tamboId);
      if (result.duplicate) {
        setStatus(
          `Ya hay litros para ${turnoLegible(shift)} de hoy. Usá “Corregir” si te equivocaste.`,
        );
      } else {
        setLiters("");
        setStatus(
          online
            ? "Ordeñe guardado. Se envía solo con señal."
            : "Ordeñe guardado sin señal.",
        );
      }
    } catch {
      setStatus("No se pudo guardar el ordeñe. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCorrectMilking(sessionRow: LocalMilkingSession) {
    if (!session) return;
    const value = Number(correctLiters.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Anotá los litros correctos.");
      return;
    }
    setBusy(true);
    try {
      await queueMilkingCorrectionOffline({
        correctsSessionId: sessionRow.id,
        tamboId: session.tamboId,
        sessionDate: sessionRow.session_date,
        shift: sessionRow.shift,
        totalLiters: value,
      });
      await refreshLocal(session.tamboId);
      setCorrectLiters("");
      setStatus("Corrección guardada. La anterior queda anulada.");
    } catch {
      setStatus("No se pudo corregir. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQueueRepro() {
    if (!session) return;
    const animal = animals.find((a) => a.ear_tag === earTag.trim());
    if (!animal) {
      setStatus(`No encontramos la caravana ${earTag}.`);
      return;
    }
    setBusy(true);
    try {
      await queueReproEventOffline({
        tamboId: session.tamboId,
        animalId: animal.id,
        type: reproType,
        expectedCalvingAt:
          reproType === "EXPECTED_CALVING" || reproType === "SERVICE"
            ? expectedCalving
            : null,
        notes: "Carga desde el celular",
      });
      await refreshLocal(session.tamboId);
      setStatus("Evento reproductivo guardado.");
    } catch {
      setStatus("No se pudo guardar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQueueDelivery() {
    if (!session) return;
    const tank = Number(tankLiters.replace(",", "."));
    const truck = Number(truckLiters.replace(",", "."));
    if (!Number.isFinite(tank) || tank < 0 || !Number.isFinite(truck) || truck < 0) {
      setStatus("Anotá los litros del tanque y del camión.");
      return;
    }
    const tTemp = tankTemp.trim() ? Number(tankTemp.replace(",", ".")) : null;
    const trTemp = truckTemp.trim() ? Number(truckTemp.replace(",", ".")) : null;
    const now = new Date().toISOString();
    setBusy(true);
    try {
      await queueMilkDeliveryOffline({
        tamboId: session.tamboId,
        periodStart: now,
        periodEnd: now,
        coldTankLiters: tank,
        truckDeclaredLiters: truck,
        coldTankTemperatureC: tTemp,
        truckTemperatureC: trTemp,
      });
      await refreshLocal(session.tamboId);
      setTankLiters("");
      setTruckLiters("");
      setTankTemp("");
      setTruckTemp("");
      setStatus("Entrega guardada.");
    } catch {
      setStatus("No se pudo guardar la entrega.");
    } finally {
      setBusy(false);
    }
  }

  async function openAnimalDetail(id: string) {
    setSelectedAnimalId(id);
    const animal = await getLocalAnimal(id);
    setAnimalDetail(animal);
    const [health, repro, weights] = await Promise.all([
      listHealthEventsForAnimal(id),
      listReproEventsForAnimal(id),
      listWeightEventsForAnimal(id),
    ]);
    const photos = await listAnimalPhotosForAnimal(id);
    setPregnancy(derivePregnancy(repro));

    const localHistory: AnimalHistoryItem[] = [
      ...health.map((h) => ({
        kind: "health",
        id: h.id,
        at: h.event_at,
        label: tipoLegible(h.type),
        detail: h.product_name ?? h.notes ?? undefined,
      })),
      ...repro.map((r) => ({
        kind: "repro",
        id: r.id,
        at: r.event_at,
        label: tipoLegible(r.type),
        detail: reproHistoryDetail(r),
      })),
      ...weights.map((w) => ({
        kind: "weight",
        id: w.id,
        at: w.measured_at,
        label: `Peso: ${w.weight_kg} kg`,
        detail: w.pending ? "Falta enviar" : undefined,
      })),
      ...photos.map((p) => ({
        kind: "photo",
        id: p.id,
        at: p.taken_at,
        label: p.type === "CONSULT" ? "Foto de consulta" : "Foto de perfil",
        detail: p.pending ? "Falta enviar" : undefined,
      })),
    ];

    if (session && onlineRef.current) {
      try {
        const timeline = await fetchAnimalTimeline(session.token, id);
        const serverItems: AnimalHistoryItem[] = timeline.items.map((it) => ({
          kind: it.kind,
          id: it.id,
          at: it.at,
          label: timelineItemLabel(it.kind, it.type, it.summary),
          detail: it.notes ?? undefined,
        }));
        const pendingLocalWeights = weights
          .filter((w) => w.pending === 1)
          .map((w) => ({
            kind: "weight",
            id: w.id,
            at: w.measured_at,
            label: `Peso: ${w.weight_kg} kg`,
            detail: "Falta enviar",
          }));
        const pendingLocalPhotos = photos
          .filter((p) => p.pending === 1)
          .map((p) => ({
            kind: "photo",
            id: p.id,
            at: p.taken_at,
            label: p.type === "CONSULT" ? "Foto de consulta" : "Foto de perfil",
            detail: "Falta enviar",
          }));
        const merged = [...serverItems, ...pendingLocalWeights, ...pendingLocalPhotos].sort(
          (a, b) => (a.at < b.at ? 1 : -1),
        );
        setAnimalHistory(merged);
        setScreen("animalDetail");
        return;
      } catch {
        // Sin señal o error del servidor: seguimos con el historial local.
      }
    }

    setAnimalHistory(localHistory.sort((a, b) => (a.at < b.at ? 1 : -1)));
    setScreen("animalDetail");
  }

  async function loadSiresBestEffort() {
    if (!session || !onlineRef.current) return;
    try {
      const res = await fetchSires(session.token);
      setSires(res.items);
    } catch {
      // sin señal: se mantiene la lista ya cargada (puede quedar vacía)
    }
  }

  function openAnimalCreate() {
    setAnimalFormMode("create");
    setFormEarTag("");
    setFormStatus("ACTIVE");
    setFormBirthDate("");
    setFormNotes("");
    setFormPhotoUri(null);
    setFormBreed("");
    setFormMotherEarTag("");
    setFormSireId(null);
    void loadSiresBestEffort();
    setScreen("animalForm");
  }

  function openAnimalEdit() {
    if (!animalDetail) return;
    setAnimalFormMode("edit");
    setFormEarTag(animalDetail.ear_tag);
    setFormStatus(animalDetail.status === "DRY" ? "DRY" : "ACTIVE");
    setFormBirthDate(animalDetail.birth_date ?? "");
    setFormNotes(animalDetail.notes ?? "");
    setFormPhotoUri(animalDetail.photo_local_uri ?? animalDetail.photo_url);
    setFormBreed(animalDetail.breed ?? "");
    setFormMotherEarTag(
      animals.find((a) => a.id === animalDetail.mother_id)?.ear_tag ?? "",
    );
    setFormSireId(animalDetail.sire_id);
    void loadSiresBestEffort();
    setScreen("animalForm");
  }

  async function pickAnimalPhoto() {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.granted) {
      const shot = await ImagePicker.launchCameraAsync({
        quality: 0.6,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!shot.canceled && shot.assets[0]?.uri) {
        setFormPhotoUri(shot.assets[0].uri);
        return;
      }
    }
    const gallery = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!gallery.granted) {
      setStatus("Necesitamos permiso de cámara o galería para la foto.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!picked.canceled && picked.assets[0]?.uri) {
      setFormPhotoUri(picked.assets[0].uri);
    }
  }

  async function handleSaveAnimal() {
    if (!session) return;
    const tag = formEarTag.trim();
    if (!tag) {
      setStatus("Anotá el número de caravana.");
      return;
    }
    let motherId: string | null = null;
    const motherTag = formMotherEarTag.trim();
    if (motherTag) {
      const mother = animals.find((a) => a.ear_tag === motherTag);
      if (!mother) {
        setStatus(`No encontramos la caravana ${motherTag} para la madre.`);
        return;
      }
      motherId = mother.id;
    }
    setBusy(true);
    try {
      if (animalFormMode === "create") {
        const id = await queueAnimalCreateOffline({
          tamboId: session.tamboId,
          earTag: tag,
          status: formStatus,
          birthDate: formBirthDate.trim() || null,
          notes: formNotes.trim() || null,
          breed: formBreed.trim() || null,
          motherId,
          sireId: formSireId,
          photoLocalUri: formPhotoUri,
        });
        await refreshLocal(session.tamboId);
        setStatus("Vaca guardada. La foto se sube sola cuando haya señal.");
        await openAnimalDetail(id);
      } else if (selectedAnimalId && animalDetail) {
        await queueAnimalUpdateOffline({
          id: selectedAnimalId,
          tamboId: session.tamboId,
          earTag: tag,
          status: formStatus,
          birthDate: formBirthDate.trim() || null,
          notes: formNotes.trim() || null,
          breed: formBreed.trim() || null,
          motherId,
          sireId: formSireId,
          photoLocalUri: formPhotoUri,
          photoUrl: animalDetail.photo_url,
          version: animalDetail.version,
        });
        await refreshLocal(session.tamboId);
        setStatus("Ficha actualizada.");
        await openAnimalDetail(selectedAnimalId);
      }
    } catch {
      setStatus("No se pudo guardar la ficha.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSire() {
    if (!session) return;
    const name = newSireName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await createSire(session.token, { name, isExternal: true });
      setSires((prev) => [...prev, res.item]);
      setFormSireId(res.item.id);
      setNewSireName("");
    } catch {
      setStatus("No se pudo guardar el padre. Necesitás señal para esto.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQueueWeight() {
    if (!session || !selectedAnimalId) return;
    const kg = Number(weightKgInput.replace(",", "."));
    if (!Number.isFinite(kg) || kg <= 0) {
      setStatus("Anotá un peso válido en kg.");
      return;
    }
    setBusy(true);
    try {
      await queueWeightEventOffline({
        tamboId: session.tamboId,
        animalId: selectedAnimalId,
        weightKg: kg,
        method: weightMethod,
      });
      setWeightKgInput("");
      setShowWeightForm(false);
      setStatus("Peso guardado.");
      await openAnimalDetail(selectedAnimalId);
    } catch {
      setStatus("No se pudo guardar el peso.");
    } finally {
      setBusy(false);
    }
  }

  /** Foto de consulta: cámara primero, galería si no hay permiso o se cancela. */
  async function handleAddConsultPhoto() {
    if (!session || !selectedAnimalId) return;

    const cam = await ImagePicker.requestCameraPermissionsAsync();
    let uri: string | null = null;
    if (cam.granted) {
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
      if (!shot.canceled && shot.assets[0]?.uri) uri = shot.assets[0].uri;
    }
    if (!uri) {
      const gallery = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!gallery.granted) {
        setStatus("Necesitamos permiso de cámara o galería para la foto.");
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false });
      if (!picked.canceled && picked.assets[0]?.uri) uri = picked.assets[0].uri;
    }
    if (!uri) return;

    setBusy(true);
    try {
      await queueAnimalPhotoOffline({
        tamboId: session.tamboId,
        animalId: selectedAnimalId,
        photoLocalUri: uri,
        type: "CONSULT",
      });
      setStatus("Foto guardada. Se sube sola cuando haya señal.");
      await openAnimalDetail(selectedAnimalId);
    } catch {
      setStatus("No se pudo guardar la foto.");
    } finally {
      setBusy(false);
    }
  }

  async function loadParts() {
    if (!session) return;
    try {
      const [partsRes, typesRes] = await Promise.all([
        fetchPartInstances(session.token, session.tamboId),
        partTypes.length > 0 ? Promise.resolve({ items: partTypes }) : fetchPartTypes(session.token),
      ]);
      setParts(partsRes.items);
      setPartTypes(typesRes.items);
    } catch {
      setStatus("No se pudo cargar el equipo. Revisá la señal.");
    }
  }

  function openPartsScreen() {
    setScreen("parts");
    void loadParts();
  }

  function selectedPartType(): PartTypeItem | null {
    return partTypes.find((t) => t.id === partTypeId) ?? null;
  }

  function openPartCreateForm() {
    setPartFormMode("create");
    setReplacingPartId(null);
    setPartTypeId(partTypes[0]?.id ?? null);
    setPartBajada("1");
    setPartBrandModel("");
    setPartNotes("");
    setPartPhotoUri(null);
    setScreen("partForm");
  }

  function openPartReplaceForm(part: PartInstanceItem) {
    setPartFormMode("replace");
    setReplacingPartId(part.id);
    setPartTypeId(part.partType.id);
    setPartBajada(part.bajadaNumber != null ? String(part.bajadaNumber) : "1");
    setPartBrandModel(part.brandModel ?? "");
    setPartNotes("");
    setPartPhotoUri(null);
    setScreen("partForm");
  }

  async function pickPartPhoto() {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.granted) {
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
      if (!shot.canceled && shot.assets[0]?.uri) {
        setPartPhotoUri(shot.assets[0].uri);
        return;
      }
    }
    const gallery = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!gallery.granted) {
      setStatus("Necesitamos permiso de cámara o galería para la foto.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsEditing: false });
    if (!picked.canceled && picked.assets[0]?.uri) {
      setPartPhotoUri(picked.assets[0].uri);
    }
  }

  async function handleSavePart() {
    if (!session) return;
    if (!online) {
      setStatus("Para cargar equipo hace falta señal.");
      return;
    }
    const partType = selectedPartType();
    if (!partType) {
      setStatus("Elegí qué pieza es.");
      return;
    }
    const bajadaNumber = partType.appliesPerBajada ? Number(partBajada) : null;
    if (partType.appliesPerBajada && (!Number.isFinite(bajadaNumber) || (bajadaNumber as number) < 1)) {
      setStatus("Anotá el número de bajada.");
      return;
    }

    setBusy(true);
    try {
      let photoUrl: string | null = null;
      if (partPhotoUri) {
        const uploaded = await uploadPhoto(session.token, partPhotoUri);
        photoUrl = uploaded.url;
      }

      const payload = {
        partTypeId: partType.id,
        bajadaNumber,
        installedAt: new Date().toISOString(),
        brandModel: partBrandModel.trim() || null,
        photoUrl,
        notes: partNotes.trim() || null,
      };

      if (partFormMode === "create") {
        await createPartInstance(session.token, { ...payload, tamboId: session.tamboId });
        setStatus("Pieza cargada.");
      } else if (replacingPartId) {
        await replacePartInstance(session.token, replacingPartId, payload);
        setStatus("Pieza reemplazada.");
      }
      await loadParts();
      setScreen("parts");
    } catch {
      setStatus("No se pudo guardar la pieza. Revisá la señal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQueueControl() {
    if (!session) return;
    const animal = animals.find((a) => a.ear_tag === controlEarTag.trim());
    if (!animal) {
      setStatus(`No encontramos la caravana ${controlEarTag}.`);
      return;
    }
    const bajada = Number(controlBajada);
    const value = Number(controlLiters.replace(",", "."));
    if (!Number.isFinite(bajada) || bajada <= 0 || !Number.isFinite(value) || value <= 0) {
      setStatus("Anotá bajada y litros.");
      return;
    }
    setBusy(true);
    try {
      await queueControlLecheroOffline({
        tamboId: session.tamboId,
        performedAt: new Date().toISOString(),
        technicianName: technicianName.trim() || undefined,
        lines: [
          {
            animalId: animal.id,
            bajadaNumber: bajada,
            liters: value,
            earTag: animal.ear_tag,
          },
        ],
      });
      await refreshLocal(session.tamboId);
      setControlLiters("");
      setStatus("Control lechero guardado.");
    } catch {
      setStatus("No se pudo guardar el control.");
    } finally {
      setBusy(false);
    }
  }

  function endMilkingShift() {
    setMilkingShiftActive(false);
    setVoiceCaptureOpen(false);
    setVoiceDraft("");
    setVoiceConfirm(null);
    setStatus("Turno terminado.");
  }

  function startMilkingShift() {
    setMilkingShiftActive(true);
    setVoiceCaptureOpen(false);
    setVoiceDraft("");
    setVoiceConfirm(null);
    setStatus(
      "Turno activo. Tocá Hablar y escribí el comando (ej. 101 posible mastitis).",
    );
  }

  function openVoiceCapture() {
    if (!milkingShiftActive) {
      setStatus("Primero tocá “Empezar turno”.");
      return;
    }
    setVoiceConfirm(null);
    setVoiceDraft("");
    setVoiceCaptureOpen(true);
    setStatus("Escribí el comando. Luego tocá “Revisar”.");
  }

  function reviewVoiceDraft() {
    const parsed = parseVoiceCommand(voiceDraft);
    if (!parsed) {
      setStatus(
        "No entendimos. Probá: 101 posible mastitis · 101 celo · 101 servicio.",
      );
      setVoiceConfirm(null);
      return;
    }
    if (parsed.kind === "health" && parsed.daysWithdrawal != null) {
      setVoiceDays(String(parsed.daysWithdrawal));
    }
    setVoiceConfirm(parsed);
    setStatus(`¿Vaca ${parsed.earTag}, ${parsed.summary}?`);
  }

  async function confirmVoiceCommand() {
    if (!session || !voiceConfirm) return;
    const animal = animals.find((a) => a.ear_tag === voiceConfirm.earTag);
    if (!animal) {
      setStatus(`No encontramos la caravana ${voiceConfirm.earTag}.`);
      return;
    }
    setBusy(true);
    try {
      if (voiceConfirm.kind === "health") {
        const days = Number(voiceDays);
        const until =
          Number.isFinite(days) && days > 0
            ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
            : null;
        await queueHealthEventOffline({
          tamboId: session.tamboId,
          animalId: animal.id,
          type: voiceConfirm.type,
          productName: voiceConfirm.productName,
          notes: `Voz: ${voiceConfirm.raw}`,
          milkWithdrawalUntil:
            voiceConfirm.type === "MASTITIS" || voiceConfirm.type === "TREATMENT"
              ? until
              : null,
        });
      } else {
        await queueReproEventOffline({
          tamboId: session.tamboId,
          animalId: animal.id,
          type: voiceConfirm.type,
          notes: `Voz: ${voiceConfirm.raw}`,
        });
      }
      await refreshLocal(session.tamboId);
      setVoiceCaptureOpen(false);
      setVoiceDraft("");
      setVoiceConfirm(null);
      setStatus(`Guardado: vaca ${voiceConfirm.earTag}, ${voiceConfirm.summary}.`);
    } catch {
      setStatus("No se pudo guardar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  function goHome() {
    if (milkingShiftActive) {
      setMilkingShiftActive(false);
      setVoiceCaptureOpen(false);
      setVoiceDraft("");
      setVoiceConfirm(null);
    }
    setScreen("home");
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
  const todayActive = milkings.find(
    (m) => m.session_date === hoyISO() && m.shift === shift,
  );

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
                {isTechnicianOnly(session.roles ?? []) ? " · técnico" : ""}
              </Text>
            ) : null}
          </View>

          {!session ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {loginMode === "login" ? "Entrar" : "Activar invitación"}
              </Text>
              <Text style={styles.help}>
                {loginMode === "login"
                  ? "Usá el usuario y la clave que te dieron."
                  : "Si te invitaron como técnico, poné el código del tenant y elegí una clave."}
              </Text>
              <Text style={styles.label}>Usuario o correo</Text>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
              {loginMode === "acceptInvite" ? (
                <>
                  <Text style={styles.label}>Código del tenant</Text>
                  <TextInput
                    style={styles.input}
                    autoCapitalize="none"
                    value={inviteTenantId}
                    onChangeText={setInviteTenantId}
                    placeholder="UUID que te pasó el tambo"
                  />
                  <Text style={styles.label}>Tu nombre (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    value={inviteName}
                    onChangeText={setInviteName}
                  />
                </>
              ) : null}
              <Text style={styles.label}>Clave</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
              {status ? (
                <View style={styles.feedback}>
                  <Text style={styles.feedbackText}>{status}</Text>
                </View>
              ) : null}
              <Pressable
                style={[styles.button, busy && styles.buttonDisabled]}
                onPress={
                  loginMode === "login" ? handleLogin : handleAcceptInvite
                }
                disabled={busy}
              >
                <Text style={styles.buttonText}>
                  {loginMode === "login" ? "Entrar" : "Activar y continuar"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStatus("");
                  setLoginMode((m) =>
                    m === "login" ? "acceptInvite" : "login",
                  );
                }}
              >
                <Text style={styles.link}>
                  {loginMode === "login"
                    ? "Soy técnico nuevo (aceptar invitación)"
                    : "Ya tengo cuenta — Entrar"}
                </Text>
              </Pressable>
            </View>
          ) : isTechnicianOnly(session.roles ?? []) ? (
            <>
              {status ? (
                <View style={styles.feedback}>
                  <Text style={styles.feedbackText}>{status}</Text>
                </View>
              ) : null}
              <TechnicianHome
                session={session}
                online={online}
                onLogout={() => void handleLogout()}
                onStatus={setStatus}
              />
            </>
          ) : (
            <>
              {screen !== "home" ? (
                <Pressable
                  style={styles.backRow}
                  onPress={() => {
                    setStatus("");
                    if (screen === "animalDetail") {
                      setScreen("animals");
                    } else if (screen === "animalForm") {
                      setScreen(
                        animalFormMode === "edit" && selectedAnimalId
                          ? "animalDetail"
                          : "animals",
                      );
                    } else if (screen === "partForm") {
                      setScreen("parts");
                    } else {
                      goHome();
                    }
                  }}
                >
                  <Text style={styles.backText}>
                    {screen === "animalDetail" ||
                    screen === "animalForm" ||
                    screen === "partForm"
                      ? "← Volver"
                      : "← Volver al inicio"}
                  </Text>
                </Pressable>
              ) : null}

              {screen === "home" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>¿Qué querés hacer?</Text>
                  <Text style={styles.help}>Tocá un botón grande.</Text>
                  {MENU.map((item) => (
                    <Pressable
                      key={item.key}
                      style={styles.menuButton}
                      onPress={() => {
                        setStatus("");
                        setScreen(item.key);
                        if (item.key === "notifications" && session) {
                          void loadNotifications(session);
                        }
                        if (item.key === "parts" && session) {
                          void loadParts();
                        }
                      }}
                    >
                      <Text style={styles.menuEmoji}>{item.emoji}</Text>
                      <View style={styles.menuTextWrap}>
                        <Text style={styles.menuLabel}>
                          {item.label}
                          {item.key === "notifications" &&
                          unreadNotifications > 0
                            ? ` (${unreadNotifications})`
                            : ""}
                        </Text>
                        <Text style={styles.menuHint}>{item.hint}</Text>
                      </View>
                    </Pressable>
                  ))}
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  {hayPendientes ? (
                    <Pressable
                      style={[styles.button, busy && styles.buttonDisabled]}
                      onPress={handleSync}
                      disabled={busy}
                    >
                      <Text style={styles.buttonText}>Enviar lo pendiente</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                      onPress={handleSync}
                      disabled={busy}
                    >
                      <Text style={styles.buttonSecondaryText}>Actualizar datos</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={handleLogout}>
                    <Text style={styles.link}>Salir</Text>
                  </Pressable>
                </View>
              ) : null}

              {screen === "service" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🔧 Service</Text>
                  <Text style={styles.help}>
                    Pedí un técnico o invitalo al tambo. Hace falta señal.
                    {requiresOwnerApproval &&
                    !isOwnerOrAdmin(session.roles ?? [])
                      ? " En este tambo el dueño tiene que autorizar el pedido."
                      : ""}
                  </Text>

                  {isOwnerOrAdmin(session.roles ?? []) ? (
                    <>
                      <Text style={styles.sectionInCard}>Autorización</Text>
                      <Text style={styles.help}>
                        ¿El tambero necesita tu OK antes de llamar al técnico?
                      </Text>
                      <View style={styles.row}>
                        <Pressable
                          style={[
                            styles.choice,
                            !requiresOwnerApproval && styles.choiceOn,
                          ]}
                          onPress={() => void handleToggleOwnerApproval(false)}
                        >
                          <Text
                            style={[
                              styles.choiceText,
                              !requiresOwnerApproval && styles.choiceTextOn,
                            ]}
                          >
                            Directo
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.choice,
                            requiresOwnerApproval && styles.choiceOn,
                          ]}
                          onPress={() => void handleToggleOwnerApproval(true)}
                        >
                          <Text
                            style={[
                              styles.choiceText,
                              requiresOwnerApproval && styles.choiceTextOn,
                            ]}
                          >
                            Con mi OK
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  ) : null}

                  <Text style={styles.sectionInCard}>Qué pasó</Text>
                  <View style={styles.wrapRow}>
                    {SERVICE_CATEGORIES.map((c) => (
                      <Pressable
                        key={c.key}
                        style={[
                          styles.choiceSmall,
                          serviceCategory === c.key && styles.choiceOn,
                        ]}
                        onPress={() => setServiceCategory(c.key)}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            serviceCategory === c.key && styles.choiceTextOn,
                          ]}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.sectionInCard}>Urgencia</Text>
                  <View style={styles.row}>
                    <Pressable
                      style={[styles.choice, !serviceUrgent && styles.choiceOn]}
                      onPress={() => setServiceUrgent(false)}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          !serviceUrgent && styles.choiceTextOn,
                        ]}
                      >
                        Normal
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.choice, serviceUrgent && styles.choiceOn]}
                      onPress={() => setServiceUrgent(true)}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          serviceUrgent && styles.choiceTextOn,
                        ]}
                      >
                        Urgente
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.label}>Detalle</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 88, textAlignVertical: "top" }]}
                    multiline
                    value={serviceDescription}
                    onChangeText={setServiceDescription}
                    placeholder="Ej: no arranca la bomba / ruido raro"
                  />
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={() => void handleCreateServiceRequest()}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>
                      {serviceUrgent ? "Pedir service URGENTE" : "Pedir service"}
                    </Text>
                  </Pressable>

                  <Text style={styles.sectionInCard}>Invitar técnico</Text>
                  <Text style={styles.help}>
                    Después pasale el código de tenant:{" "}
                    {session.tenantId || "(entrar de nuevo)"}
                  </Text>
                  <Text style={styles.label}>Correo del técnico</Text>
                  <TextInput
                    style={styles.input}
                    autoCapitalize="none"
                    value={inviteTechEmail}
                    onChangeText={setInviteTechEmail}
                  />
                  <Text style={styles.label}>Nombre (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    value={inviteTechName}
                    onChangeText={setInviteTechName}
                  />
                  <Text style={styles.label}>Empresa (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    value={inviteCompany}
                    onChangeText={setInviteCompany}
                  />
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={() => void handleInviteTechnician()}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>Invitar</Text>
                  </Pressable>
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {screen === "notifications" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🔔 Avisos</Text>
                  <Text style={styles.help}>
                    Pedidos de service y aprobaciones. Push real viene después.
                  </Text>
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={() => void loadNotifications()}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>Actualizar</Text>
                  </Pressable>

                  {isOwnerOrAdmin(session.roles ?? []) &&
                  pendingApprovals.length > 0 ? (
                    <>
                      <Text style={styles.sectionInCard}>
                        Esperan tu autorización
                      </Text>
                      {pendingApprovals.map((r) => (
                        <View key={r.id} style={styles.item}>
                          <Text style={styles.itemTitle}>
                            {r.urgency === "URGENT" ? "URGENTE · " : ""}
                            {r.category}
                          </Text>
                          <Text style={styles.itemMeta}>{r.description}</Text>
                          <Text style={styles.itemMeta}>
                            {r.createdBy?.name
                              ? `Pidió: ${r.createdBy.name} · `
                              : ""}
                            {new Date(r.createdAt).toLocaleString("es-AR")}
                          </Text>
                          <View style={styles.row}>
                            <Pressable
                              style={[styles.button, { flex: 1 }, busy && styles.buttonDisabled]}
                              onPress={() => void handleApproveRequest(r.id)}
                              disabled={busy}
                            >
                              <Text style={styles.buttonText}>Aprobar</Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.buttonSecondary,
                                { flex: 1 },
                                busy && styles.buttonDisabled,
                              ]}
                              onPress={() => void handleRejectRequest(r.id)}
                              disabled={busy}
                            >
                              <Text style={styles.buttonSecondaryText}>
                                Rechazar
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </>
                  ) : null}

                  <Text style={styles.sectionInCard}>Bandeja</Text>
                  {notifications.length === 0 ? (
                    <Text style={styles.empty}>No hay avisos todavía.</Text>
                  ) : (
                    notifications.map((n) => (
                      <Pressable
                        key={n.id}
                        style={styles.item}
                        onPress={() => {
                          if (!session || n.readAt) return;
                          void markNotificationRead(session.token, n.id).then(
                            () => loadNotifications(session),
                          );
                        }}
                      >
                        <Text style={styles.itemTitle}>
                          {n.readAt ? "" : "• "}
                          {n.title}
                        </Text>
                        <Text style={styles.itemMeta}>{n.body}</Text>
                        <Text style={styles.itemMeta}>
                          {new Date(n.createdAt).toLocaleString("es-AR")}
                        </Text>
                      </Pressable>
                    ))
                  )}
                  {notifications.some((n) => !n.readAt) ? (
                    <Pressable
                      onPress={() => {
                        if (!session) return;
                        void markAllNotificationsRead(session.token).then(() =>
                          loadNotifications(session),
                        );
                      }}
                    >
                      <Text style={styles.link}>Marcar todo leído</Text>
                    </Pressable>
                  ) : null}
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {screen === "animals" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>📒 Vacas</Text>
                  <Text style={styles.help}>
                    Tocá una caravana para ver ficha, foto e historial.
                  </Text>
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={openAnimalCreate}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Nueva vaca</Text>
                  </Pressable>
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  {animals.length === 0 ? (
                    <Text style={styles.empty}>
                      Todavía no hay vacas. Creá una o tocá Actualizar con señal.
                    </Text>
                  ) : (
                    animals.map((a) => (
                      <Pressable
                        key={a.id}
                        style={styles.animalRow}
                        onPress={() => void openAnimalDetail(a.id)}
                      >
                        {a.photo_local_uri || a.photo_url ? (
                          <Image
                            source={{ uri: a.photo_local_uri ?? a.photo_url! }}
                            style={styles.animalThumb}
                          />
                        ) : (
                          <View style={styles.animalThumbPlaceholder}>
                            <Text style={styles.menuEmoji}>🐄</Text>
                          </View>
                        )}
                        <View style={styles.menuTextWrap}>
                          <Text style={styles.itemTitle}>Caravana {a.ear_tag}</Text>
                          <Text style={styles.itemMeta}>
                            {a.status === "DRY" ? "Seca" : "En ordeñe"}
                            {a.pending ? " · Falta enviar" : ""}
                          </Text>
                        </View>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}

              {screen === "animalDetail" && animalDetail ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    Caravana {animalDetail.ear_tag}
                  </Text>
                  {animalDetail.photo_local_uri || animalDetail.photo_url ? (
                    <Image
                      source={{
                        uri:
                          animalDetail.photo_local_uri ?? animalDetail.photo_url!,
                      }}
                      style={styles.animalPhoto}
                    />
                  ) : (
                    <View style={styles.animalPhotoPlaceholder}>
                      <Text style={styles.help}>Sin foto todavía</Text>
                    </View>
                  )}
                  <Text style={styles.itemMeta}>
                    Estado:{" "}
                    {animalDetail.status === "DRY" ? "Seca" : "En ordeñe"}
                  </Text>
                  {animalDetail.birth_date ? (
                    <Text style={styles.itemMeta}>
                      Nacimiento: {animalDetail.birth_date}
                    </Text>
                  ) : null}
                  {animalDetail.breed ? (
                    <Text style={styles.itemMeta}>Raza: {animalDetail.breed}</Text>
                  ) : null}
                  {animalDetail.notes ? (
                    <Text style={styles.help}>{animalDetail.notes}</Text>
                  ) : null}
                  {pregnancy ? (
                    <View
                      style={[
                        styles.pregnancyBox,
                        pregnancy.pregnant && styles.pregnancyBoxOn,
                      ]}
                    >
                      <Text style={styles.sectionInCard}>Preñez y pariciones</Text>
                      <Text style={styles.confirmTitle}>{pregnancy.headline}</Text>
                      {pregnancy.detailLines.map((line) => (
                        <Text key={line} style={styles.itemMeta}>
                          {line}
                        </Text>
                      ))}
                      <Text style={styles.help}>
                        Se calcula con servicios, partos estimados y pariciones del
                        historial (no es un diagnóstico).
                      </Text>
                    </View>
                  ) : null}
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={openAnimalEdit}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>Editar ficha</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={() => setShowWeightForm(!showWeightForm)}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>
                      {showWeightForm ? "Cancelar" : "⚖️ Agregar peso"}
                    </Text>
                  </Pressable>
                  {showWeightForm ? (
                    <View style={styles.item}>
                      <Text style={styles.label}>Peso (kg)</Text>
                      <TextInput
                        style={styles.input}
                        value={weightKgInput}
                        onChangeText={setWeightKgInput}
                        keyboardType="decimal-pad"
                        placeholder="Ej: 380"
                      />
                      <View style={styles.wrapRow}>
                        {(
                          [
                            ["VISUAL_ESTIMATE", "A ojo"],
                            ["TAPE", "Cinta"],
                            ["SCALE", "Balanza"],
                          ] as const
                        ).map(([key, label]) => (
                          <Pressable
                            key={key}
                            style={[
                              styles.choiceSmall,
                              weightMethod === key && styles.choiceOn,
                            ]}
                            onPress={() => setWeightMethod(key)}
                          >
                            <Text
                              style={[
                                styles.choiceText,
                                weightMethod === key && styles.choiceTextOn,
                              ]}
                            >
                              {label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Pressable
                        style={[styles.button, busy && styles.buttonDisabled]}
                        onPress={() => void handleQueueWeight()}
                        disabled={busy}
                      >
                        <Text style={styles.buttonText}>Guardar peso</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={() => void handleAddConsultPhoto()}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>📷 Agregar foto de consulta</Text>
                  </Pressable>
                  <Text style={styles.sectionInCard}>Historial</Text>
                  {animalHistory.length === 0 ? (
                    <Text style={styles.empty}>
                      Todavía no hay eventos para esta vaca.
                    </Text>
                  ) : (
                    animalHistory.map((h) => (
                      <View key={`${h.kind}-${h.id}`} style={styles.item}>
                        <Text style={styles.itemTitle}>{h.label}</Text>
                        <Text style={styles.itemMeta}>
                          {new Date(h.at).toLocaleString("es-AR")}
                        </Text>
                        {h.detail ? (
                          <Text style={styles.itemMeta}>{h.detail}</Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ) : null}

              {screen === "animalForm" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {animalFormMode === "create" ? "Nueva vaca" : "Editar ficha"}
                  </Text>
                  <Text style={styles.label}>Caravana</Text>
                  <TextInput
                    style={styles.input}
                    value={formEarTag}
                    onChangeText={setFormEarTag}
                    keyboardType="number-pad"
                    placeholder="Ej: 101"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Estado</Text>
                  <View style={styles.row}>
                    <Pressable
                      style={[
                        styles.choice,
                        formStatus === "ACTIVE" && styles.choiceOn,
                      ]}
                      onPress={() => setFormStatus("ACTIVE")}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          formStatus === "ACTIVE" && styles.choiceTextOn,
                        ]}
                      >
                        En ordeñe
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.choice,
                        formStatus === "DRY" && styles.choiceOn,
                      ]}
                      onPress={() => setFormStatus("DRY")}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          formStatus === "DRY" && styles.choiceTextOn,
                        ]}
                      >
                        Seca
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.label}>Fecha nacimiento (AAAA-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={formBirthDate}
                    onChangeText={setFormBirthDate}
                    autoCapitalize="none"
                    placeholder="Opcional"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Notas</Text>
                  <TextInput
                    style={styles.input}
                    value={formNotes}
                    onChangeText={setFormNotes}
                    placeholder="Opcional"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Raza</Text>
                  <TextInput
                    style={styles.input}
                    value={formBreed}
                    onChangeText={setFormBreed}
                    placeholder="Ej: Holando, Jersey, cruza..."
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Caravana de la madre</Text>
                  <TextInput
                    style={styles.input}
                    value={formMotherEarTag}
                    onChangeText={setFormMotherEarTag}
                    keyboardType="number-pad"
                    placeholder="Opcional"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Padre / pajuela</Text>
                  {sires.length === 0 ? (
                    <Text style={styles.help}>
                      Sin catálogo de padres todavía (necesita señal).
                    </Text>
                  ) : (
                    <View style={styles.wrapRow}>
                      <Pressable
                        style={[styles.choiceSmall, formSireId === null && styles.choiceOn]}
                        onPress={() => setFormSireId(null)}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            formSireId === null && styles.choiceTextOn,
                          ]}
                        >
                          Ninguno
                        </Text>
                      </Pressable>
                      {sires.map((s) => (
                        <Pressable
                          key={s.id}
                          style={[
                            styles.choiceSmall,
                            formSireId === s.id && styles.choiceOn,
                          ]}
                          onPress={() => setFormSireId(s.id)}
                        >
                          <Text
                            style={[
                              styles.choiceText,
                              formSireId === s.id && styles.choiceTextOn,
                            ]}
                          >
                            {s.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  <TextInput
                    style={styles.input}
                    value={newSireName}
                    onChangeText={setNewSireName}
                    placeholder="Nombre de un padre nuevo (necesita señal)"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={() => void handleCreateSire()}
                    disabled={busy || !newSireName.trim()}
                  >
                    <Text style={styles.buttonSecondaryText}>Agregar padre al catálogo</Text>
                  </Pressable>
                  <Text style={styles.label}>Foto</Text>
                  {formPhotoUri ? (
                    <Image source={{ uri: formPhotoUri }} style={styles.animalPhoto} />
                  ) : (
                    <Text style={styles.help}>
                      La foto se guarda en el teléfono y se sube sola cuando haya señal.
                    </Text>
                  )}
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={() => void pickAnimalPhoto()}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>Sacar foto</Text>
                  </Pressable>
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={() => void handleSaveAnimal()}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Guardar</Text>
                  </Pressable>
                </View>
              ) : null}

              {screen === "parts" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>⚙️ Equipo de ordeñe y frío</Text>
                  <Text style={styles.help}>Piezas vigentes de este tambo.</Text>
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={openPartCreateForm}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>+ Nueva pieza</Text>
                  </Pressable>
                  {parts.length === 0 ? (
                    <Text style={styles.empty}>Todavía no hay piezas cargadas.</Text>
                  ) : (
                    parts.map((p) => (
                      <View key={p.id} style={styles.item}>
                        <Text style={styles.itemTitle}>
                          {p.partType.name}
                          {p.bajadaNumber != null ? ` · bajada ${p.bajadaNumber}` : ""}
                        </Text>
                        {p.brandModel ? (
                          <Text style={styles.itemMeta}>{p.brandModel}</Text>
                        ) : null}
                        <Text style={styles.itemMeta}>
                          Instalada: {new Date(p.installedAt).toLocaleDateString("es-AR")}
                        </Text>
                        {p.photoUrl ? (
                          <Image source={{ uri: p.photoUrl }} style={styles.animalPhoto} />
                        ) : null}
                        <Pressable
                          style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                          onPress={() => openPartReplaceForm(p)}
                          disabled={busy}
                        >
                          <Text style={styles.buttonSecondaryText}>Reemplazar</Text>
                        </Pressable>
                      </View>
                    ))
                  )}
                </View>
              ) : null}

              {screen === "partForm" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {partFormMode === "create" ? "Nueva pieza" : "Reemplazar pieza"}
                  </Text>
                  <Text style={styles.label}>Qué pieza es</Text>
                  <View style={styles.wrapRow}>
                    {partTypes.map((t) => (
                      <Pressable
                        key={t.id}
                        style={[styles.choiceSmall, partTypeId === t.id && styles.choiceOn]}
                        onPress={() => setPartTypeId(t.id)}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            partTypeId === t.id && styles.choiceTextOn,
                          ]}
                        >
                          {t.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {selectedPartType()?.appliesPerBajada ? (
                    <>
                      <Text style={styles.label}>Bajada</Text>
                      <TextInput
                        style={styles.input}
                        value={partBajada}
                        onChangeText={setPartBajada}
                        keyboardType="number-pad"
                      />
                    </>
                  ) : null}
                  <Text style={styles.label}>Marca / modelo</Text>
                  <TextInput
                    style={styles.input}
                    value={partBrandModel}
                    onChangeText={setPartBrandModel}
                    placeholder="Opcional"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Notas</Text>
                  <TextInput
                    style={styles.input}
                    value={partNotes}
                    onChangeText={setPartNotes}
                    placeholder="Opcional"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Foto</Text>
                  {partPhotoUri ? (
                    <Image source={{ uri: partPhotoUri }} style={styles.animalPhoto} />
                  ) : (
                    <Text style={styles.help}>Opcional — foto de la pieza instalada.</Text>
                  )}
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={() => void pickPartPhoto()}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>Sacar foto</Text>
                  </Pressable>
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={() => void handleSavePart()}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Guardar</Text>
                  </Pressable>
                </View>
              ) : null}

              {screen === "milking" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🐄 Ordeñe</Text>
                  <Text style={styles.help}>
                    Empezá el turno para cargar eventos. Fuera del turno no se arma la captura.
                  </Text>
                  <View
                    style={[
                      styles.chip,
                      milkingShiftActive ? styles.chipOk : styles.chipWarn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        !milkingShiftActive && styles.chipTextWarn,
                      ]}
                    >
                      {milkingShiftActive ? "Turno activo" : "Turno apagado"}
                    </Text>
                  </View>

                  {milkingShiftActive ? (
                    <Pressable
                      style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                      onPress={endMilkingShift}
                      disabled={busy}
                    >
                      <Text style={styles.buttonSecondaryText}>Terminar turno</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.button, busy && styles.buttonDisabled]}
                      onPress={startMilkingShift}
                      disabled={busy}
                    >
                      <Text style={styles.buttonText}>Empezar turno</Text>
                    </Pressable>
                  )}

                  {milkingShiftActive ? (
                    <>
                      <Text style={styles.sectionInCard}>
                        ❌ No mezclar (retiros)
                      </Text>
                      {withdrawals.length === 0 ? (
                        <Text style={styles.empty}>Ninguna vaca en retiro ahora.</Text>
                      ) : (
                        withdrawals.slice(0, 8).map((item) => (
                          <Text key={item.id} style={styles.itemMeta}>
                            Caravana {item.ear_tag ?? "?"} · hasta{" "}
                            {item.milk_withdrawal_until
                              ? new Date(item.milk_withdrawal_until).toLocaleDateString(
                                  "es-AR",
                                )
                              : "-"}
                          </Text>
                        ))
                      )}
                      <Pressable
                        style={[styles.button, busy && styles.buttonDisabled]}
                        onPress={openVoiceCapture}
                        disabled={busy}
                      >
                        <Text style={styles.buttonText}>Hablar</Text>
                      </Pressable>
                    </>
                  ) : null}

                  {voiceCaptureOpen ? (
                    <>
                      <Text style={styles.label}>Comando</Text>
                      <TextInput
                        style={styles.input}
                        value={voiceDraft}
                        onChangeText={setVoiceDraft}
                        placeholder="101 posible mastitis"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <Pressable
                        style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                        onPress={reviewVoiceDraft}
                        disabled={busy}
                      >
                        <Text style={styles.buttonSecondaryText}>Revisar</Text>
                      </Pressable>
                    </>
                  ) : null}

                  {voiceConfirm ? (
                    <View style={styles.confirmBox}>
                      <Text style={styles.confirmTitle}>
                        ¿Vaca {voiceConfirm.earTag}, {voiceConfirm.summary}?
                      </Text>
                      {voiceConfirm.kind === "health" &&
                      (voiceConfirm.type === "MASTITIS" ||
                        voiceConfirm.type === "TREATMENT") ? (
                        <>
                          <Text style={styles.label}>Días de retiro de leche</Text>
                          <TextInput
                            style={styles.input}
                            keyboardType="number-pad"
                            value={voiceDays}
                            onChangeText={setVoiceDays}
                          />
                        </>
                      ) : null}
                      <Pressable
                        style={[styles.button, busy && styles.buttonDisabled]}
                        onPress={confirmVoiceCommand}
                        disabled={busy}
                      >
                        <Text style={styles.buttonText}>Sí, guardar</Text>
                      </Pressable>
                      <Pressable
                        style={styles.buttonSecondary}
                        onPress={() => {
                          setVoiceConfirm(null);
                          setStatus("Cancelado.");
                        }}
                        disabled={busy}
                      >
                        <Text style={styles.buttonSecondaryText}>No</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  <Text style={styles.sectionInCard}>Litros del turno</Text>
                  <View style={styles.row}>
                    <Pressable
                      style={[styles.choice, shift === "MORNING" && styles.choiceOn]}
                      onPress={() => setShift("MORNING")}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          shift === "MORNING" && styles.choiceTextOn,
                        ]}
                      >
                        Mañana
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.choice, shift === "AFTERNOON" && styles.choiceOn]}
                      onPress={() => setShift("AFTERNOON")}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          shift === "AFTERNOON" && styles.choiceTextOn,
                        ]}
                      >
                        Tarde
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.label}>Litros</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={liters}
                    onChangeText={setLiters}
                    placeholder="Ej: 1250"
                    placeholderTextColor={colors.textMuted}
                  />
                  {todayActive ? (
                    <Text style={styles.help}>
                      Ya hay {todayActive.total_liters} L para {turnoLegible(shift)}{" "}
                      hoy. Para cambiarlos usá corregir abajo.
                    </Text>
                  ) : null}
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={handleQueueMilking}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Guardar litros</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={handleSync}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>Enviar / Actualizar</Text>
                  </Pressable>

                  {milkings.length > 0 ? (
                    <>
                      <Text style={styles.sectionInCard}>Últimos litros</Text>
                      {milkings.slice(0, 5).map((m) => (
                        <View key={m.id} style={styles.item}>
                          <Text style={styles.itemTitle}>
                            {m.session_date} · {turnoLegible(m.shift)} · {m.total_liters} L
                          </Text>
                          {m.pending ? (
                            <Text style={styles.pendingBadge}>Falta enviar</Text>
                          ) : null}
                          {m.session_date === hoyISO() && m.shift === shift ? (
                            <>
                              <Text style={styles.label}>Corregir litros</Text>
                              <TextInput
                                style={styles.input}
                                keyboardType="decimal-pad"
                                value={correctLiters}
                                onChangeText={setCorrectLiters}
                                placeholder={String(m.total_liters)}
                                placeholderTextColor={colors.textMuted}
                              />
                              <Pressable
                                style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                                onPress={() => handleCorrectMilking(m)}
                                disabled={busy}
                              >
                                <Text style={styles.buttonSecondaryText}>
                                  Corregir este turno
                                </Text>
                              </Pressable>
                            </>
                          ) : null}
                        </View>
                      ))}
                    </>
                  ) : null}
                </View>
              ) : null}

              {screen === "treatment" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>💊 Sanidad</Text>
                  <Text style={styles.help}>
                    Mastitis o tratamiento. Se guarda aunque no haya señal.
                  </Text>
                  <Text style={styles.label}>Qué pasó</Text>
                  <View style={styles.row}>
                    <Pressable
                      style={[styles.choice, healthType === "MASTITIS" && styles.choiceOn]}
                      onPress={() => setHealthType("MASTITIS")}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          healthType === "MASTITIS" && styles.choiceTextOn,
                        ]}
                      >
                        Mastitis
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.choice, healthType === "TREATMENT" && styles.choiceOn]}
                      onPress={() => setHealthType("TREATMENT")}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          healthType === "TREATMENT" && styles.choiceTextOn,
                        ]}
                      >
                        Tratamiento
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.label}>Número de caravana</Text>
                  <TextInput
                    style={styles.input}
                    value={earTag}
                    onChangeText={setEarTag}
                    keyboardType="number-pad"
                    placeholder="Ej: 101"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Remedio o producto</Text>
                  <TextInput
                    style={styles.input}
                    value={productName}
                    onChangeText={setProductName}
                    placeholder="Opcional"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Días de retiro de leche</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={daysWithdrawal}
                    onChangeText={setDaysWithdrawal}
                  />
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={handleQueueHealth}
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
                </View>
              ) : null}

              {screen === "repro" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🔔 Reproducción</Text>
                  <Text style={styles.help}>Celo, servicio o parto por caravana.</Text>
                  <Text style={styles.label}>Tipo</Text>
                  <View style={styles.wrapRow}>
                    {(
                      [
                        ["HEAT", "Celo"],
                        ["SERVICE", "Servicio"],
                        ["EXPECTED_CALVING", "Parto est."],
                        ["CALVING", "Parto"],
                      ] as const
                    ).map(([key, label]) => (
                      <Pressable
                        key={key}
                        style={[styles.choiceSmall, reproType === key && styles.choiceOn]}
                        onPress={() => setReproType(key)}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            reproType === key && styles.choiceTextOn,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.label}>Caravana</Text>
                  <TextInput
                    style={styles.input}
                    value={earTag}
                    onChangeText={setEarTag}
                    keyboardType="number-pad"
                  />
                  {reproType === "EXPECTED_CALVING" || reproType === "SERVICE" ? (
                    <>
                      <Text style={styles.label}>Fecha parto estimado (AAAA-MM-DD)</Text>
                      <TextInput
                        style={styles.input}
                        value={expectedCalving}
                        onChangeText={setExpectedCalving}
                        autoCapitalize="none"
                      />
                    </>
                  ) : null}
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={handleQueueRepro}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Guardar</Text>
                  </Pressable>
                  {repros.slice(0, 5).map((r) => (
                    <Text key={r.id} style={styles.itemMeta}>
                      {r.ear_tag ?? "?"} · {tipoLegible(r.type)}
                      {r.pending ? " · Falta enviar" : ""}
                    </Text>
                  ))}
                </View>
              ) : null}

              {screen === "delivery" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>🚛 Entrega de leche</Text>
                  <Text style={styles.help}>
                    Litros del tanque vs lo que declara el camión, y temperaturas.
                  </Text>
                  <Text style={styles.label}>Litros tanque</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={tankLiters}
                    onChangeText={setTankLiters}
                  />
                  <Text style={styles.label}>Litros camión</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={truckLiters}
                    onChangeText={setTruckLiters}
                  />
                  <Text style={styles.label}>Temp. tanque (°C)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={tankTemp}
                    onChangeText={setTankTemp}
                    placeholder="Opcional"
                    placeholderTextColor={colors.textMuted}
                  />
                  <Text style={styles.label}>Temp. camión (°C)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={truckTemp}
                    onChangeText={setTruckTemp}
                    placeholder="Opcional"
                    placeholderTextColor={colors.textMuted}
                  />
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={handleQueueDelivery}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Guardar entrega</Text>
                  </Pressable>
                  {deliveries.slice(0, 5).map((d) => (
                    <Text key={d.id} style={styles.itemMeta}>
                      Tanque {d.cold_tank_liters} L · Camión {d.truck_declared_liters} L
                      {d.pending ? " · Falta enviar" : ""}
                    </Text>
                  ))}
                </View>
              ) : null}

              {screen === "control" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>📋 Control lechero</Text>
                  <Text style={styles.help}>
                    Producción por vaca y bajada (cada tanto, no cada día).
                  </Text>
                  <Text style={styles.label}>Caravana</Text>
                  <TextInput
                    style={styles.input}
                    value={controlEarTag}
                    onChangeText={setControlEarTag}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.label}>Bajada</Text>
                  <TextInput
                    style={styles.input}
                    value={controlBajada}
                    onChangeText={setControlBajada}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.label}>Litros</Text>
                  <TextInput
                    style={styles.input}
                    value={controlLiters}
                    onChangeText={setControlLiters}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.label}>Técnico (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    value={technicianName}
                    onChangeText={setTechnicianName}
                  />
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.button, busy && styles.buttonDisabled]}
                    onPress={handleQueueControl}
                    disabled={busy}
                  >
                    <Text style={styles.buttonText}>Guardar control</Text>
                  </Pressable>
                  {controls.slice(0, 5).map((c) => {
                    const lines = JSON.parse(c.lines_json) as {
                      earTag?: string;
                      bajadaNumber: number;
                      liters: number;
                    }[];
                    const first = lines[0];
                    return (
                      <Text key={c.id} style={styles.itemMeta}>
                        {first
                          ? `Caravana ${first.earTag ?? "?"} · bajada ${first.bajadaNumber} · ${first.liters} L`
                          : c.performed_at}
                        {c.pending ? " · Falta enviar" : ""}
                      </Text>
                    );
                  })}
                </View>
              ) : null}

              {screen === "withdrawals" ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>❌ Retiros de leche</Text>
                  <Text style={styles.help}>
                    Vacas en espera: esa leche no se puede mezclar con el resto.
                  </Text>
                  {status ? (
                    <View style={styles.feedback}>
                      <Text style={styles.feedbackText}>{status}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
                    onPress={handleSync}
                    disabled={busy}
                  >
                    <Text style={styles.buttonSecondaryText}>Actualizar lista</Text>
                  </Pressable>
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
                            ? new Date(item.milk_withdrawal_until).toLocaleString("es-AR")
                            : "-"}
                        </Text>
                        {item.pending ? (
                          <Text style={styles.pendingBadge}>Falta enviar</Text>
                        ) : null}
                      </View>
                    ))
                  )}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
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
  title: { fontSize: font.display, fontWeight: "700", color: colors.text },
  meta: { color: colors.textMuted, fontSize: font.meta },
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  chipOk: { backgroundColor: colors.primarySoft },
  chipWarn: { backgroundColor: colors.accentSoft },
  chipText: { color: colors.primary, fontWeight: "700", fontSize: font.meta },
  chipTextWarn: { color: colors.accentText },
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
  label: { fontSize: font.label, fontWeight: "600", color: colors.text },
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
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    minHeight: 72,
  },
  menuEmoji: { fontSize: 36 },
  menuTextWrap: { flex: 1, gap: 2 },
  menuLabel: { fontSize: 20, fontWeight: "700", color: colors.text },
  menuHint: { fontSize: 15, color: colors.textMuted },
  backRow: { paddingVertical: space.sm },
  backText: { fontSize: font.body, color: colors.primary, fontWeight: "600" },
  row: { flexDirection: "row", gap: space.sm },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  choiceSmall: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  choiceOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  choiceText: { fontSize: font.body, color: colors.textMuted, fontWeight: "600" },
  choiceTextOn: { color: colors.primary },
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
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: font.button },
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
  sectionInCard: {
    fontSize: font.label,
    fontWeight: "700",
    color: colors.text,
    marginTop: space.sm,
  },
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
  confirmBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  confirmTitle: {
    fontSize: font.title,
    fontWeight: "700",
    color: colors.text,
  },
  animalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  animalThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
  },
  animalThumbPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  animalPhoto: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
  },
  animalPhotoPlaceholder: {
    width: "100%",
    height: 140,
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pregnancyBox: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pregnancyBoxOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
});
