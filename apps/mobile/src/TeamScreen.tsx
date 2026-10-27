import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiError, request, type TamboItem } from "./api";
import { formatPhoneDisplay } from "./format";
import { WEB_URL } from "./config";
import { buildCredentialsMessage, buildInviteMessages } from "./inviteMessages";
import {
  createTeamApi,
  teamErrorMessage,
  teamRoleLabel,
  type TeamMember,
  type TeamRole,
} from "./team";
import { colors, font, radius, space, touch } from "./theme";

const teamApi = createTeamApi(request);

type ConfirmKind = "revoke" | "reset" | "cancel";
type SecretView =
  | { kind: "credentials"; message: string }
  | { kind: "invite"; intro: string; code: string };

function memberTitle(item: TeamMember): string {
  const name = item.user.name?.trim();
  if (name) return name;
  const phone = formatPhoneDisplay(item.user.phone ?? "");
  if (phone) return phone;
  return item.user.email?.trim() || "Sin nombre";
}

function memberContact(item: TeamMember): string {
  const phone = formatPhoneDisplay(item.user.phone ?? "");
  if (phone) return phone;
  return item.user.email?.trim() || "";
}

function primaryManageableRole(item: TeamMember): TeamRole {
  if (item.roles.includes("VETERINARIO")) return "VETERINARIO";
  return "TAMBERO";
}

function formatRevokedAt(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function identifierOf(item: TeamMember, phone: string, email: string): string {
  const fromPhone = (phone || item.user.phone || "").trim();
  const fromEmail = (email || item.user.email || "").trim();
  return fromPhone || fromEmail;
}

export function TeamScreen({
  token,
  tambos,
  currentTamboId,
  online,
  inviterName,
  reloadToken,
}: {
  token: string;
  tambos: TamboItem[];
  currentTamboId: string;
  online: boolean;
  inviterName: string;
  reloadToken: number;
}) {
  const [tamboId, setTamboId] = useState(currentTamboId);
  const [items, setItems] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokedOpen, setRevokedOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addRole, setAddRole] = useState<TeamRole | null>(null);
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addTamboIds, setAddTamboIds] = useState<string[]>([currentTamboId]);

  const [optionsFor, setOptionsFor] = useState<TeamMember | null>(null);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<TeamRole>("TAMBERO");
  const [editTamboIds, setEditTamboIds] = useState<string[]>([]);
  const [editConfirm, setEditConfirm] = useState(false);

  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; item: TeamMember } | null>(null);
  const [secret, setSecret] = useState<SecretView | null>(null);
  const [existsInvite, setExistsInvite] = useState(false);

  useEffect(() => {
    setTamboId(currentTamboId);
  }, [currentTamboId]);

  const tamboName = tambos.find((t) => t.id === tamboId)?.name ?? "el tambo";

  const load = useCallback(async () => {
    if (!online) return;
    setLoading(true);
    setError("");
    try {
      const res = await teamApi.listTeam(token, tamboId, true);
      setItems(res.items);
    } catch (err) {
      setError(teamErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [online, tamboId, token]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const activeItems = useMemo(() => {
    return items
      .filter((item) => item.status !== "REVOKED")
      .slice()
      .sort((a, b) => {
        if (a.status === "PENDING" && b.status !== "PENDING") return -1;
        if (b.status === "PENDING" && a.status !== "PENDING") return 1;
        return memberTitle(a).localeCompare(memberTitle(b), "es");
      });
  }, [items]);

  const revokedItems = useMemo(
    () => items.filter((item) => item.status === "REVOKED"),
    [items],
  );

  function resetAddForm() {
    setAddRole(null);
    setAddName("");
    setAddPhone("");
    setAddEmail("");
    setAddTamboIds([tamboId]);
    setExistsInvite(false);
    setActionError("");
  }

  function closeSecret() {
    setSecret(null);
    setExistsInvite(false);
    resetAddForm();
    setAddOpen(false);
    setEditing(null);
    setConfirm(null);
    setOptionsFor(null);
    void load();
  }

  function toggleTambo(list: string[], id: string, setter: (next: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  async function shareWhatsApp(message: string) {
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error("unsupported");
      await Linking.openURL(url);
    } catch {
      setActionError("No se pudo abrir WhatsApp. Usá Compartir.");
    }
  }

  async function shareGeneric(message: string) {
    try {
      await Share.share({ message });
    } catch {
      setActionError("No se pudo compartir.");
    }
  }

  async function handleCreate() {
    if (busy) return;
    const name = addName.trim();
    const phone = addPhone.trim();
    const email = addEmail.trim().toLowerCase();
    if (!addRole) {
      setActionError("Elegí si es tambero o veterinario.");
      return;
    }
    if (!name) {
      setActionError("El nombre es obligatorio.");
      return;
    }
    if (!phone && !email) {
      setActionError("Poné al menos un teléfono o un correo.");
      return;
    }
    if (addTamboIds.length === 0) {
      setActionError("Elegí al menos un tambo.");
      return;
    }
    setBusy(true);
    setActionError("");
    setExistsInvite(false);
    try {
      const created = await teamApi.createMember(token, {
        tamboId: addTamboIds[0]!,
        name,
        phone,
        email,
        role: addRole,
      });
      if (addTamboIds.length > 1) {
        await teamApi.updateMember(token, created.item.id, { tamboIds: addTamboIds }).catch(() => undefined);
      }
      const identifier = identifierOf(created.item, phone, email);
      setSecret({
        kind: "credentials",
        message: buildCredentialsMessage({
          inviterName: inviterName || "el dueño",
          tamboName,
          role: addRole,
          userName: name,
          identifier,
          temporaryPassword: created.temporaryPassword,
          webUrl: WEB_URL,
        }),
      });
    } catch (err) {
      setActionError(teamErrorMessage(err));
      if (err instanceof ApiError && err.code === "USER_EXISTS") {
        setExistsInvite(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleInviteLink() {
    if (busy || !addRole) return;
    const name = addName.trim();
    const phone = addPhone.trim();
    const email = addEmail.trim().toLowerCase();
    setBusy(true);
    setActionError("");
    try {
      const invited = await teamApi.inviteMember(token, {
        tamboId: addTamboIds[0] ?? tamboId,
        name,
        phone,
        email,
        role: addRole,
      });
      const tokenValue = invited.inviteToken;
      if (!tokenValue) {
        setActionError("No se pudo armar el enlace.");
        return;
      }
      const messages = buildInviteMessages({
        inviterName: inviterName || "el dueño",
        tamboName,
        role: addRole,
        token: tokenValue,
        webUrl: WEB_URL,
      });
      setSecret({ kind: "invite", intro: messages.intro, code: messages.code });
      setExistsInvite(false);
    } catch (err) {
      setActionError(teamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(item: TeamMember) {
    setOptionsFor(null);
    setEditing(item);
    setEditName(item.user.name ?? "");
    setEditPhone(item.user.phone ?? "");
    setEditEmail(item.user.email ?? "");
    setEditRole(primaryManageableRole(item));
    setEditTamboIds(item.tamboIds.length ? item.tamboIds : [tamboId]);
    setEditConfirm(false);
    setActionError("");
  }

  async function handleSaveEdit() {
    if (!editing || busy) return;
    if (editTamboIds.length === 0) {
      setActionError("Elegí al menos un tambo.");
      return;
    }
    const roleChanged = primaryManageableRole(editing) !== editRole;
    const tambosChanged =
      [...editTamboIds].sort().join(",") !== [...editing.tamboIds].sort().join(",");
    if ((roleChanged || tambosChanged) && !editConfirm) {
      setEditConfirm(true);
      setActionError("Para que el cambio se aplique, va a tener que volver a ingresar.");
      return;
    }
    const patch: {
      name?: string;
      phone?: string;
      email?: string;
      role?: TeamRole;
      tamboIds?: string[];
    } = {};
    if (!editing.sharedAccount) {
      if (editName.trim() !== (editing.user.name ?? "")) patch.name = editName.trim();
      if (editPhone.trim() !== (editing.user.phone ?? "")) patch.phone = editPhone.trim();
      if (editEmail.trim().toLowerCase() !== (editing.user.email ?? "").toLowerCase()) {
        patch.email = editEmail.trim().toLowerCase();
      }
    }
    if (roleChanged) patch.role = editRole;
    if (tambosChanged) patch.tamboIds = editTamboIds;
    if (Object.keys(patch).length === 0) {
      setEditing(null);
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await teamApi.updateMember(token, editing.id, patch);
      setEditing(null);
      setEditConfirm(false);
      await load();
    } catch (err) {
      setActionError(teamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!confirm || busy) return;
    setBusy(true);
    setActionError("");
    try {
      if (confirm.kind === "revoke") {
        await teamApi.revokeMember(token, confirm.item.id);
        setConfirm(null);
        await load();
      } else if (confirm.kind === "cancel") {
        await teamApi.cancelInvite(token, confirm.item.id);
        setConfirm(null);
        await load();
      } else {
        const res = await teamApi.resetMemberPassword(token, confirm.item.id);
        const identifier = identifierOf(confirm.item, "", "");
        setSecret({
          kind: "credentials",
          message: buildCredentialsMessage({
            inviterName: inviterName || "el dueño",
            tamboName,
            role: primaryManageableRole(confirm.item),
            userName: memberTitle(confirm.item),
            identifier,
            temporaryPassword: res.temporaryPassword,
            webUrl: WEB_URL,
          }),
        });
        setConfirm(null);
      }
    } catch (err) {
      setActionError(teamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReactivate(item: TeamMember) {
    if (busy) return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await teamApi.reactivateMember(token, item.id);
      setNotice("Reactivado. Ya puede volver a ingresar con su clave.");
      await load();
    } catch (err) {
      setActionError(teamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!online) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Equipo</Text>
        <Text style={styles.help}>Para ver o cambiar el equipo hace falta señal.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Equipo</Text>
        {tambos.length > 1 ? (
          <View style={styles.wrapRow}>
            {tambos.map((tambo) => (
              <Pressable
                key={tambo.id}
                style={[styles.choice, tambo.id === tamboId && styles.choiceOn]}
                onPress={() => setTamboId(tambo.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: tambo.id === tamboId }}
                accessibilityLabel={tambo.name}
              >
                <Text style={[styles.choiceText, tambo.id === tamboId && styles.choiceTextOn]}>{tambo.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable
          style={[styles.buttonSecondary, (loading || busy) && styles.disabled]}
          onPress={() => void load()}
          disabled={loading || busy}
          accessibilityRole="button"
          accessibilityLabel="Actualizar"
        >
          <Text style={styles.buttonSecondaryText}>Actualizar</Text>
        </Pressable>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? (
          <>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.buttonSecondary} onPress={() => void load()} accessibilityLabel="Reintentar">
              <Text style={styles.buttonSecondaryText}>Reintentar</Text>
            </Pressable>
          </>
        ) : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}
        {actionError && !addOpen && !editing && !confirm && !secret ? (
          <Text style={styles.error}>{actionError}</Text>
        ) : null}

        {activeItems.length === 0 && !loading && !error ? (
          <Text style={styles.help}>Todavía no hay nadie más en este tambo.</Text>
        ) : (
          activeItems.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.itemTitle}>{memberTitle(item)}</Text>
              <View style={styles.wrapRow}>
                {item.roles.map((role) => (
                  <View key={role} style={styles.chip}>
                    <Text style={styles.chipText}>{teamRoleLabel(role, item.companyName)}</Text>
                  </View>
                ))}
                <View style={[styles.chip, item.status === "ACTIVE" ? styles.chipOk : styles.chipPending]}>
                  <Text style={[styles.chipText, item.status === "ACTIVE" ? styles.chipOkText : styles.chipPendingText]}>
                    {item.status === "ACTIVE" ? "Activo" : "Invitación pendiente"}
                  </Text>
                </View>
              </View>
              {memberContact(item) ? <Text style={styles.meta}>{memberContact(item)}</Text> : null}
              {item.tamboIds.length > 1 ? (
                <Text style={styles.meta}>
                  {item.tamboIds
                    .map((id) => tambos.find((tambo) => tambo.id === id)?.name ?? "Tambo")
                    .join(", ")}
                </Text>
              ) : null}
              {!item.manageable ? <Text style={styles.meta}>Lo gestiona soporte</Text> : null}
              {item.sharedAccount ? <Text style={styles.meta}>También trabaja con otra cuenta</Text> : null}
              {item.manageable ? (
                <Pressable
                  style={styles.buttonSecondary}
                  onPress={() => {
                    setActionError("");
                    setOptionsFor(item);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Opciones de ${memberTitle(item)}`}
                >
                  <Text style={styles.buttonSecondaryText}>Opciones</Text>
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        {revokedItems.length > 0 ? (
          <View>
            <Pressable
              onPress={() => setRevokedOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel="Dados de baja"
              style={styles.sectionHead}
            >
              <Text style={styles.sectionTitle}>Dados de baja ({revokedItems.length})</Text>
            </Pressable>
            {revokedOpen
              ? revokedItems.map((item) => (
                  <View key={item.id} style={styles.item}>
                    <Text style={styles.itemTitle}>{memberTitle(item)}</Text>
                    <Text style={styles.meta}>
                      {item.roles.map((role) => teamRoleLabel(role, item.companyName)).join(", ")}
                    </Text>
                    <Text style={styles.meta}>Dado de baja el {formatRevokedAt(item.revokedAt)}</Text>
                    {item.manageable ? (
                      <Pressable
                        style={[styles.buttonSecondary, busy && styles.disabled]}
                        onPress={() => void handleReactivate(item)}
                        disabled={busy}
                        accessibilityLabel={`Reactivar a ${memberTitle(item)}`}
                      >
                        <Text style={styles.buttonSecondaryText}>Reactivar</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.meta}>Lo gestiona soporte</Text>
                    )}
                  </View>
                ))
              : null}
          </View>
        ) : null}

        <Pressable
          style={[styles.button, busy && styles.disabled]}
          onPress={() => {
            resetAddForm();
            setAddTamboIds([tamboId]);
            setAddOpen(true);
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Agregar a alguien"
        >
          <Text style={styles.buttonText}>Agregar a alguien</Text>
        </Pressable>
      </View>

      <Modal visible={addOpen && !secret} animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <ScrollView contentContainerStyle={styles.modalPad} keyboardShouldPersistTaps="handled">
          <Text style={styles.cardTitle}>Agregar a alguien</Text>
          <Text style={styles.help}>Rol</Text>
          <View style={styles.wrapRow}>
            {(["TAMBERO", "VETERINARIO"] as TeamRole[]).map((role) => (
              <Pressable
                key={role}
                style={[styles.choiceLarge, addRole === role && styles.choiceOn]}
                onPress={() => setAddRole(role)}
                accessibilityRole="button"
                accessibilityState={{ selected: addRole === role }}
                accessibilityLabel={teamRoleLabel(role)}
              >
                <Text style={[styles.choiceText, addRole === role && styles.choiceTextOn]}>{teamRoleLabel(role)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.help}>Nombre</Text>
          <TextInput style={styles.input} value={addName} onChangeText={setAddName} />
          <Text style={styles.help}>Teléfono</Text>
          <TextInput
            style={styles.input}
            value={addPhone}
            onChangeText={setAddPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <Text style={styles.help}>Correo</Text>
          <TextInput
            style={styles.input}
            value={addEmail}
            onChangeText={setAddEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.meta}>Con el teléfono alcanza. Escribilo con el código de área, sin 0 ni 15.</Text>
          <Text style={styles.help}>Tambos</Text>
          {tambos.map((tambo) => (
            <Pressable
              key={tambo.id}
              style={styles.checkRow}
              onPress={() => toggleTambo(addTamboIds, tambo.id, setAddTamboIds)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: addTamboIds.includes(tambo.id) }}
              accessibilityLabel={tambo.name}
            >
              <Text style={styles.help}>
                {addTamboIds.includes(tambo.id) ? "●" : "○"} {tambo.name}
              </Text>
            </Pressable>
          ))}
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
          {existsInvite ? (
            <Pressable
              style={[styles.buttonSecondary, busy && styles.disabled]}
              onPress={() => void handleInviteLink()}
              disabled={busy}
            >
              <Text style={styles.buttonSecondaryText}>Invitar con un enlace</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={() => void handleCreate()} disabled={busy}>
            <Text style={styles.buttonText}>Crear acceso</Text>
          </Pressable>
          <Pressable onPress={() => setAddOpen(false)} accessibilityLabel="Cerrar">
            <Text style={styles.link}>Cerrar</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      <Modal visible={Boolean(editing)} animationType="slide" onRequestClose={() => setEditing(null)}>
        <ScrollView contentContainerStyle={styles.modalPad} keyboardShouldPersistTaps="handled">
          <Text style={styles.cardTitle}>Editar</Text>
          {editing?.sharedAccount ? (
            <Text style={styles.meta}>No se puede cambiar: también trabaja con otra cuenta</Text>
          ) : null}
          <Text style={styles.help}>Nombre</Text>
          <TextInput style={styles.input} value={editName} onChangeText={setEditName} editable={!editing?.sharedAccount} />
          <Text style={styles.help}>Teléfono</Text>
          <TextInput
            style={styles.input}
            value={editPhone}
            onChangeText={setEditPhone}
            editable={!editing?.sharedAccount}
            autoCapitalize="none"
            keyboardType="phone-pad"
          />
          <Text style={styles.help}>Correo</Text>
          <TextInput
            style={styles.input}
            value={editEmail}
            onChangeText={setEditEmail}
            editable={!editing?.sharedAccount}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.help}>Rol</Text>
          <View style={styles.wrapRow}>
            {(["TAMBERO", "VETERINARIO"] as TeamRole[]).map((role) => (
              <Pressable
                key={role}
                style={[styles.choiceLarge, editRole === role && styles.choiceOn]}
                onPress={() => setEditRole(role)}
                accessibilityRole="button"
                accessibilityState={{ selected: editRole === role }}
                accessibilityLabel={teamRoleLabel(role)}
              >
                <Text style={[styles.choiceText, editRole === role && styles.choiceTextOn]}>{teamRoleLabel(role)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.help}>Tambos</Text>
          {tambos.map((tambo) => (
            <Pressable
              key={tambo.id}
              style={styles.checkRow}
              onPress={() => toggleTambo(editTamboIds, tambo.id, setEditTamboIds)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: editTamboIds.includes(tambo.id) }}
              accessibilityLabel={tambo.name}
            >
              <Text style={styles.help}>
                {editTamboIds.includes(tambo.id) ? "●" : "○"} {tambo.name}
              </Text>
            </Pressable>
          ))}
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
          <Pressable style={[styles.button, busy && styles.disabled]} onPress={() => void handleSaveEdit()} disabled={busy}>
            <Text style={styles.buttonText}>{editConfirm ? "Confirmar cambios" : "Guardar"}</Text>
          </Pressable>
          <Pressable onPress={() => setEditing(null)}>
            <Text style={styles.link}>Cerrar</Text>
          </Pressable>
        </ScrollView>
      </Modal>

      <Modal visible={Boolean(optionsFor)} transparent animationType="fade" onRequestClose={() => setOptionsFor(null)}>
        <Pressable style={styles.overlay} onPress={() => setOptionsFor(null)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.itemTitle}>{optionsFor ? memberTitle(optionsFor) : ""}</Text>
            <Pressable style={styles.sheetBtn} onPress={() => optionsFor && openEdit(optionsFor)}>
              <Text style={styles.sheetBtnText}>Editar</Text>
            </Pressable>
            {optionsFor?.status === "ACTIVE" && !optionsFor.sharedAccount ? (
              <Pressable
                style={styles.sheetBtn}
                onPress={() => {
                  setConfirm({ kind: "reset", item: optionsFor });
                  setOptionsFor(null);
                }}
              >
                <Text style={styles.sheetBtnText}>Restablecer clave</Text>
              </Pressable>
            ) : null}
            {optionsFor?.status === "ACTIVE" ? (
              <Pressable
                style={styles.sheetBtn}
                onPress={() => {
                  setConfirm({ kind: "revoke", item: optionsFor });
                  setOptionsFor(null);
                }}
              >
                <Text style={styles.dangerText}>Dar de baja</Text>
              </Pressable>
            ) : null}
            {optionsFor?.status === "PENDING" ? (
              <Pressable
                style={styles.sheetBtn}
                onPress={() => {
                  setConfirm({ kind: "cancel", item: optionsFor });
                  setOptionsFor(null);
                }}
              >
                <Text style={styles.dangerText}>Cancelar invitación</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => setOptionsFor(null)}>
              <Text style={styles.link}>Cerrar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={Boolean(confirm)} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {confirm?.kind === "revoke" ? (
              <Text style={styles.help}>
                ¿Dar de baja a {memberTitle(confirm.item)}? Va a dejar de poder entrar a CAL en tus tambos. Todo lo que
                cargó se conserva y podés reactivarla después.
              </Text>
            ) : null}
            {confirm?.kind === "reset" ? (
              <Text style={styles.help}>
                Se va a generar una clave temporal nueva y la actual deja de servir. {memberTitle(confirm.item)} tendrá
                que elegir otra al ingresar.
              </Text>
            ) : null}
            {confirm?.kind === "cancel" ? (
              <Text style={styles.help}>
                ¿Cancelar la invitación de {memberTitle(confirm.item)}? El código deja de servir.
              </Text>
            ) : null}
            {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
            <Pressable
              style={[styles.buttonDanger, busy && styles.disabled]}
              onPress={() => void handleConfirm()}
              disabled={busy}
            >
              <Text style={styles.buttonDangerText}>
                {confirm?.kind === "revoke"
                  ? "Dar de baja"
                  : confirm?.kind === "reset"
                    ? "Restablecer clave"
                    : "Cancelar invitación"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setConfirm(null)} disabled={busy}>
              <Text style={styles.link}>Volver</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(secret)} animationType="slide" onRequestClose={closeSecret}>
        <ScrollView contentContainerStyle={styles.modalPad}>
          <View style={styles.secretCard}>
            {secret?.kind === "credentials" ? (
              <>
                <Text style={styles.secretText}>{secret.message}</Text>
                <Text style={styles.meta}>La clave se muestra una sola vez. Si se pierde, podés restablecerla desde Opciones.</Text>
              </>
            ) : null}
            {secret?.kind === "invite" ? (
              <>
                <Text style={styles.secretText}>{secret.intro}</Text>
                <Text style={styles.secretText}>{secret.code}</Text>
                <Text style={styles.meta}>El código se muestra una sola vez.</Text>
              </>
            ) : null}
            <Pressable
              style={styles.button}
              onPress={() =>
                void shareWhatsApp(
                  secret?.kind === "credentials"
                    ? secret.message
                    : secret
                      ? `${secret.intro}\n\n${secret.code}`
                      : "",
                )
              }
            >
              <Text style={styles.buttonText}>Enviar por WhatsApp</Text>
            </Pressable>
            <Pressable
              style={styles.buttonSecondary}
              onPress={() =>
                void shareGeneric(
                  secret?.kind === "credentials"
                    ? secret.message
                    : secret
                      ? `${secret.intro}\n\n${secret.code}`
                      : "",
                )
              }
            >
              <Text style={styles.buttonSecondaryText}>Compartir…</Text>
            </Pressable>
            <Pressable onPress={closeSecret} accessibilityLabel="Cerrar resultado">
              <Text style={styles.link}>Cerrar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: font.title, fontWeight: "700", color: colors.text },
  help: { color: colors.textMuted, fontSize: font.body, lineHeight: 24 },
  meta: { color: colors.textMuted, fontSize: font.meta, lineHeight: 20 },
  error: { color: colors.dangerText, fontSize: font.body, lineHeight: 24 },
  success: { color: colors.successText, fontSize: font.body, lineHeight: 24 },
  item: {
    backgroundColor: colors.bgSubtle,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.sm,
  },
  itemTitle: { fontWeight: "700", color: colors.text, fontSize: 17 },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
    minHeight: 28,
    justifyContent: "center",
  },
  chipText: { color: colors.text, fontSize: font.meta, fontWeight: "600" },
  chipOk: { backgroundColor: colors.successSoft },
  chipOkText: { color: colors.successText },
  chipPending: { backgroundColor: colors.accentSoft },
  chipPendingText: { color: colors.accentText },
  choice: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: "center",
  },
  choiceLarge: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: "center",
  },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { fontSize: font.body, color: colors.textMuted, fontWeight: "600" },
  choiceTextOn: { color: colors.primary },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: space.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    minHeight: touch.min,
    justifyContent: "center",
  },
  buttonText: { color: colors.onPrimary, fontWeight: "700", fontSize: font.button },
  buttonSecondary: {
    backgroundColor: colors.primarySoft,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 44,
    justifyContent: "center",
  },
  buttonSecondaryText: { color: colors.primary, fontWeight: "700", fontSize: font.button },
  buttonDanger: {
    backgroundColor: colors.dangerSoft,
    paddingVertical: space.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    minHeight: touch.min,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.danger,
  },
  buttonDangerText: { color: colors.dangerText, fontWeight: "700", fontSize: font.button },
  dangerText: { color: colors.dangerText, fontWeight: "700", fontSize: font.button },
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
  checkRow: { paddingVertical: space.sm, minHeight: 44, justifyContent: "center" },
  link: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: font.body,
    paddingVertical: space.sm,
  },
  sectionHead: { minHeight: 44, justifyContent: "center" },
  sectionTitle: { fontWeight: "700", color: colors.text, fontSize: font.body },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
  },
  sheetBtn: { minHeight: 44, justifyContent: "center" },
  sheetBtnText: { color: colors.text, fontSize: font.button, fontWeight: "600" },
  modalPad: { padding: space.xl, gap: space.md, backgroundColor: colors.bg, flexGrow: 1 },
  secretCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  secretText: { color: colors.accentText, fontSize: font.body, lineHeight: 24 },
});
