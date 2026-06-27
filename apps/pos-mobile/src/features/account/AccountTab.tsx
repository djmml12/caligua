import { useAuth } from "@pos/auth";
import { Button }  from "@pos/ui-kit";
import "./account-tab.css";

function UserCircleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const ROLE_LABELS: Record<string, string> = {
  admin:      "Administrador",
  supervisor: "Supervisor",
  cajero:     "Cajero",
  mesero:     "Mesero",
};

interface Props {
  onLogout: () => void;
}

export default function AccountTab({ onLogout }: Props) {
  const { currentUser, role } = useAuth();

  const displayName  = currentUser?.name  ?? "—";
  const displayEmail = currentUser?.email ?? "";
  const roleLabel    = ROLE_LABELS[role] ?? role;

  return (
    <div className="at-shell">

      {/* ── Avatar + datos ── */}
      <div className="at-card">
        <div className="at-avatar">
          <UserCircleIcon />
        </div>

        <div className="at-info">
          <p className="at-name">{displayName}</p>
          {displayEmail && (
            <p className="at-email">{displayEmail}</p>
          )}
          {roleLabel && (
            <span className="at-role-badge">{roleLabel}</span>
          )}
        </div>
      </div>

      {/* ── Acciones ── */}
      <div className="at-actions">
        <Button
          variant="danger"
          size="lg"
          fullWidth
          onClick={onLogout}
        >
          Cerrar sesión
        </Button>
      </div>

    </div>
  );
}
