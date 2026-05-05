import { useEffect, useRef, useState } from "react";
import { BottomSheet, Button, Input, useToast } from "@pos/ui-kit";
import { apiRequest } from "../../services/api";

interface User {
  id:        number;
  name:      string;
  email:     string;
  role_id:   number;
  is_active: boolean;
}

interface Role {
  id:   number;
  name: string;
}

const fmt = (u: User, roles: Role[]) =>
  roles.find(r => r.id === u.role_id)?.name ?? "Sin rol";

export default function StaffManager() {
  const { show }    = useToast();
  const mountedRef  = useRef(true);

  const [users,    setUsers]    = useState<User[]>([]);
  const [roles,    setRoles]    = useState<Role[]>([]);
  const [loading,  setLoading]  = useState(true);

  /* New user form */
  const [showForm, setShowForm] = useState(false);
  const [draft,    setDraft]    = useState({ name: "", email: "", password: "", role_id: "" });
  const [saving,   setSaving]   = useState(false);

  /* Password reset */
  const [showPwSheet, setShowPwSheet] = useState(false);
  const [pwTarget,    setPwTarget]    = useState<User | null>(null);
  const [newPw,       setNewPw]       = useState("");
  const [savingPw,    setSavingPw]    = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.all([
      apiRequest("/users").then(d => { if (mountedRef.current) setUsers(d as User[]); }),
      apiRequest("/roles").then(d => { if (mountedRef.current) setRoles(d as Role[]); }),
    ]).catch(() => {
      show("Error cargando personal", { type: "error" });
    }).finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => { mountedRef.current = false; };
  }, [show]);

  const handleCreate = async () => {
    if (!draft.name.trim() || !draft.email.trim() || !draft.password || !draft.role_id) {
      show("Completa todos los campos", { type: "warning" });
      return;
    }
    setSaving(true);
    try {
      const created = await apiRequest("/users", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name.trim(),
          email: draft.email.trim(),
          password: draft.password,
          role_id: Number(draft.role_id),
        }),
      }) as User;
      if (mountedRef.current) {
        setUsers(p => [...p, created]);
        setDraft({ name: "", email: "", password: "", role_id: "" });
        setShowForm(false);
        show("Usuario creado", { type: "success" });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error al crear", { type: "error" });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  const toggleActive = async (u: User) => {
    try {
      await apiRequest(`/users/${u.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      if (mountedRef.current) {
        setUsers(p => p.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x));
        show(u.is_active ? "Usuario desactivado" : "Usuario activado", { type: "info" });
      }
    } catch { show("Error al actualizar", { type: "error" }); }
  };

  const openPasswordReset = (u: User) => {
    setPwTarget(u);
    setNewPw("");
    setShowPwSheet(true);
  };

  const handlePasswordReset = async () => {
    if (!pwTarget || !newPw.trim()) { show("Ingresa la nueva contraseña", { type: "warning" }); return; }
    setSavingPw(true);
    try {
      await apiRequest(`/users/${pwTarget.id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password: newPw }),
      });
      if (mountedRef.current) {
        setShowPwSheet(false);
        show("Contraseña actualizada", { type: "success" });
      }
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : "Error", { type: "error" });
    } finally {
      if (mountedRef.current) setSavingPw(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        {/* Header */}
        <div className="av-header">
          <h2 className="av-title">Personal</h2>
          <Button variant="primary" size="md" onClick={() => setShowForm(true)}>
            + Nuevo usuario
          </Button>
        </div>

        {loading ? (
          <div className="al-stub"><div className="al-stub-icon">⏳</div></div>
        ) : (
          <div className="staff-content">
            {users.map(u => (
              <div key={u.id} className="staff-user-card">
                <div className="staff-user-info">
                  <div className="staff-user-name">{u.name}</div>
                  <div className="staff-user-meta">{u.email} · {fmt(u, roles)}</div>
                </div>
                <span className={`staff-status staff-status--${u.is_active ? "active" : "inactive"}`}>
                  {u.is_active ? "Activo" : "Inactivo"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => openPasswordReset(u)}>
                  Clave
                </Button>
                <Button
                  variant={u.is_active ? "secondary" : "success"}
                  size="sm"
                  onClick={() => void toggleActive(u)}
                >
                  {u.is_active ? "Desact." : "Activar"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New user form */}
      <BottomSheet
        open={showForm}
        onClose={() => !saving && setShowForm(false)}
        height="tall"
        title="Nuevo usuario"
        draggable={!saving}
      >
        <div className="al-form">
          <Input label="Nombre" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          <Input label="Email"  value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} type="email" autoComplete="off" />
          <Input label="Contraseña" value={draft.password} onChange={e => setDraft(d => ({ ...d, password: e.target.value }))} type="password" autoComplete="new-password" />
          <div className="al-field">
            <span className="al-field-label">Rol</span>
            <select
              value={draft.role_id}
              onChange={e => setDraft(d => ({ ...d, role_id: e.target.value }))}
              style={{ height: 56, padding: "0 16px", borderRadius: "var(--radius-xl)", border: "1.5px solid var(--border)", fontSize: 16, background: "var(--canvas)", color: "var(--text-1)", outline: "none" }}
            >
              <option value="">Seleccionar rol</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <Button variant="primary" size="xl" fullWidth loading={saving} onClick={() => void handleCreate()}>
            Crear usuario
          </Button>
        </div>
      </BottomSheet>

      {/* Password reset */}
      <BottomSheet
        open={showPwSheet}
        onClose={() => !savingPw && setShowPwSheet(false)}
        height="auto"
        title={pwTarget ? `Cambiar clave — ${pwTarget.name}` : "Cambiar contraseña"}
        draggable={!savingPw}
      >
        <div className="al-form">
          <Input label="Nueva contraseña" value={newPw} onChange={e => setNewPw(e.target.value)} type="password" autoComplete="new-password" />
          <Button variant="primary" size="lg" fullWidth loading={savingPw} onClick={() => void handlePasswordReset()}>
            Guardar contraseña
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
