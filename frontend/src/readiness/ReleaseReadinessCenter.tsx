import { useState } from "react";

import { api } from "../lib/api";

interface Props {
  onResetComplete: () => Promise<void> | void;
}

export function ReleaseReadinessCenter({ onResetComplete }: Props) {
  const [operator, setOperator] = useState("Demo Administrator");
  const [reason, setReason] = useState("Prepare a clean demonstration environment");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function resetDemo() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api.demoReset({ operator, reason, confirmation });
      setMessage(result.message);
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
          <div className="section-card-header"><div><p className="eyebrow">Controlled Demo Reset</p><h3>Reset Demonstration Environment</h3></div></div>
          <p>This clears transactional simulator records, active faults, batches, deliveries, training sessions, CIP runs, and work orders while restoring seeded inventory and plant equipment. This action replaces deleting the local database during demonstrations.</p>
          <div className="form-grid">
            <label>Operator<input value={operator} onChange={(event) => setOperator(event.target.value)} /></label>
            <label className="wide">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            <label className="wide">Type RESET to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
            <button className="button danger wide" disabled={busy || confirmation.trim().toUpperCase() !== "RESET"} onClick={() => void resetDemo()}>
              {busy ? "Resetting…" : "Reset Demonstration Environment"}
            </button>
          </div>
          {message && <div className="success-banner">{message}</div>}
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
