import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Last-resort catch so a rendering bug degrades to a styled message, not a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="shell">
        <div className="app-card" style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 480, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px" }}>Something broke</div>
            <p className="subtle" style={{ marginTop: 10 }}>
              The explorer hit an unexpected error while rendering. Reloading usually clears it —
              the case data itself is immutable and safe.
            </p>
            <p className="note mono" style={{ wordBreak: "break-word" }}>{this.state.error.message}</p>
            <button
              className="btn-primary"
              style={{ marginTop: 18 }}
              onClick={() => { window.location.hash = "#/"; window.location.reload(); }}
            >
              Reload the explorer
            </button>
          </div>
        </div>
      </div>
    );
  }
}
