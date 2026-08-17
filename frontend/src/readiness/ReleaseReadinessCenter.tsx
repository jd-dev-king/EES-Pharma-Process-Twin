import { useState } from "react";

import { api, currentDemoSessionId } from "../lib/api";

interface Props {
  onResetComplete: () => Promise<void> | void;
}

export function ReleaseReadinessCenter({ onResetComplete }: Props) {
  const [operator, setOperator] = useState("Demo Administrator");
  const [reason, setReason] = useState("Reset my current demonstration session");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetRequestId, setResetRequestId] = useState("");
  const [error, setError] = useState("");

  async function resetDemo() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api.demoReset({ operator, reason, confirmation });
      setMessage(result.message);
      setResetRequestId(result.request_id);
      setConfirmation("");
      await onResetComplete();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Demo reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="zone-stack">
      <section className="hero-card">
        <p className="eyebrow">Release Candidate Operations</p>
        <h2>Stabilization & Public Release Readiness</h2>
        <p>Validate the private release candidate, clean the demonstration state, and prepare the repository for a controlled public launch.</p>
      </section>

      <div className="zone-columns">
        <section className="section-card">
          <div className="section-card-header"><div><p className="eyebrow">Session-Scoped Demo Reset</p><h3>Reset Current Demo Session</h3></div></div>
          <p>This resets only the current browser demo session. Its campaign is closed, active equipment is released, and the reset request is recorded for Data Moon Admin review. Shared Warehouse quantities, global PO numbering, and other users' active demonstrations are not changed.</p>
          <div className="planned-checklist">
            <span>Session: {currentDemoSessionId()}</span>
            <span>Shared inventory baseline: Data Moon Admin only</span>
            <span>Global PO sequence reset: Data Moon Admin only</span>
          </div>
          <div className="form-grid">
            <label>Operator<input value={operator} onChange={(event) => setOperator(event.target.value)} /></label>
            <label className="wide">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <label className="wide">Type RESET to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <button className="button danger wide" disabled={busy || confirmation.trim().toUpperCase() !== "RESET"} onClick={() => void resetDemo()}>
              {busy ? "Resetting Session…" : "Reset Current Demo Session"}
            </button>
          </div>
          {message && <div className="success-banner">
            <strong>{message}</strong>
            <span>Session: {currentDemoSessionId()}</span>
            {resetRequestId && <span>Data Moon Request: {resetRequestId}</span>}
          </div>}
          {error && <div className="error-banner">{error}</div>}
        </section>

        <section className="section-card">
          <div className="section-card-header"><div><p className="eyebrow">Public Repository Gate</p><h3>Release Checklist</h3></div></div>
          <div className="planned-checklist">
            <span>Backend regression suite passes</span>
            <span>Frontend tests and production build pass</span>
            <span>Full manufacturing E2E passes from a fresh reset</span>
            <span>No browser refresh or force-reset workaround required</span>
            <span>No secrets, local databases, build outputs, or private paths committed</span>
            <span>README, security, validation, installation, and demo documentation reviewed</span>
            <span>Repository remains private until release approval</span>
          </div>
        </section>
      </div>
    </div>
  );
}
