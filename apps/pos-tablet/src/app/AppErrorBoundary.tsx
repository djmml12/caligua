import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("APP ERROR BOUNDARY:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          background: "var(--canvas, #f8f5f0)",
        }}
      >
        <div
          style={{
            width: "min(100%, 480px)",
            background: "#fff",
            borderRadius: 24,
            boxShadow: "0 24px 48px rgba(28,25,23,0.15)",
            padding: 36,
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 32, fontWeight: 800, color: "var(--text-1, #1c1917)" }}>
            Tu Empresa
          </p>
          <p style={{ margin: "0 0 28px", color: "var(--text-2, #57534e)", lineHeight: 1.6, fontSize: 16 }}>
            Ocurrió un error inesperado. Puedes recargar la pantalla sin perder la sesión.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              border: "none",
              borderRadius: 14,
              padding: "16px 24px",
              background: "var(--primary, #c2410c)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 17,
              cursor: "pointer",
              width: "100%",
              touchAction: "manipulation",
            }}
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
