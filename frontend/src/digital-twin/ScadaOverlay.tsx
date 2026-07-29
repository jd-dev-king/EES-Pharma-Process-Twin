import { memo, useMemo, useState } from "react";

import type { TwinAsset, TwinZone } from "./DigitalTwinScene";

interface ScadaOverlayProps {
  asset: TwinAsset | null;
  zone: TwinZone;
  onOpenDepartment: (zone: TwinZone) => void;
  onOpenAutomation: () => void;
}

type SignalState = "on" | "off" | "fault";

interface Signal {
  tag: string;
  label: string;
  state: SignalState;
}

function isActive(status: string): boolean {
  return /running|in use|transferring|unloading|loading|mixing|packaging|cip/i.test(status);
}

function isFaulted(status: string): boolean {
  return /fault|alarm|blocked|reject|trip/i.test(status);
}

function ScadaOverlayComponent({ asset, zone, onOpenDepartment, onOpenAutomation }: ScadaOverlayProps) {
  const [view, setView] = useState<"faceplate" | "pid" | "signals">("faceplate");

  const signals = useMemo<Signal[]>(() => {
    if (!asset) return [];
    const active = isActive(asset.status);
    const fault = isFaulted(asset.status);
    const levelOk = (asset.level ?? 0) > 5;
    return [
      { tag: "I0.0", label: "Permissive OK", state: fault ? "fault" : "on" },
      { tag: "I0.1", label: "Level Available", state: levelOk ? "on" : "off" },
      { tag: "I0.2", label: "Auto Mode", state: "on" },
      { tag: "Q0.0", label: "Primary Output", state: fault ? "off" : active ? "on" : "off" },
      { tag: "Q0.1", label: "Transfer Valve", state: active && zone !== "office" ? "on" : "off" },
      { tag: "ALM", label: "Active Alarm", state: fault ? "fault" : "off" },
    ];
  }, [asset, zone]);

  if (!asset) {
    return (
      <section className="scada-overlay empty">
        <p className="eyebrow">SCADA Interaction Layer</p>
        <h3>Select Equipment</h3>
        <p>Choose a live asset from the zone faceplate to inspect process signals and flow paths.</p>
      </section>
    );
  }

  const active = isActive(asset.status);
  const fault = isFaulted(asset.status);
  const level = Math.max(0, Math.min(100, asset.level ?? 0));

  return (
    <section className="scada-overlay">
      <header className="scada-header">
        <div>
          <p className="eyebrow">Live SCADA Equipment Interaction</p>
          <h3>{asset.code} · {asset.label}</h3>
          <span>{asset.poNumber ?? "No active production order"}</span>
        </div>
        <span className={`scada-status ${fault ? "fault" : active ? "running" : "waiting"}`}>
          {asset.status}
        </span>
      </header>

      <nav className="scada-tabs" aria-label="SCADA view selection">
        <button className={view === "faceplate" ? "active" : ""} onClick={() => setView("faceplate")}>Faceplate</button>
        <button className={view === "pid" ? "active" : ""} onClick={() => setView("pid")}>P&amp;ID</button>
        <button className={view === "signals" ? "active" : ""} onClick={() => setView("signals")}>Signals</button>
      </nav>

      {view === "faceplate" && (
        <div className="scada-faceplate">
          <div className="scada-vessel">
            <span className="scada-vessel-fill" style={{ height: `${level}%` }} />
            <i className={active ? "spinning" : ""} />
            <b>{Math.round(level)}%</b>
          </div>
          <div className="scada-measurements">
            <article><span>Mode</span><strong>AUTO</strong></article>
            <article><span>Primary Output</span><strong>{active && !fault ? "ON" : "OFF"}</strong></article>
            <article><span>Interlocks</span><strong>{fault ? "BLOCKED" : "SATISFIED"}</strong></article>
            <article><span>Alarm</span><strong>{fault ? "ACTIVE" : "CLEAR"}</strong></article>
          </div>
        </div>
      )}

      {view === "pid" && (
        <div className={`scada-pid ${active ? "flowing" : ""} ${fault ? "faulted" : ""}`}>
          <div className="pid-source"><span>Source</span><strong>{zone === "bulk" ? "Tanker / Tank" : "Upstream"}</strong></div>
          <div className="pid-line"><i /><i /><i /></div>
          <div className={`pid-pump ${active && !fault ? "running" : ""}`}><i /><span>P-101</span></div>
          <div className="pid-line"><i /><i /><i /></div>
          <div className={`pid-valve ${active && !fault ? "open" : "closed"}`}><i /><span>XV-101</span></div>
          <div className="pid-line"><i /><i /><i /></div>
          <div className="pid-destination"><span>Destination</span><strong>{asset.code}</strong></div>
          {fault && <div className="pid-alarm-banner">Flow path inhibited by active equipment fault</div>}
        </div>
      )}

      {view === "signals" && (
        <div className="scada-signal-grid">
          {signals.map((signal) => (
            <article key={signal.tag} className={signal.state}>
              <span>{signal.tag}</span>
              <strong>{signal.label}</strong>
              <b>{signal.state.toUpperCase()}</b>
            </article>
          ))}
        </div>
      )}

      <footer className="scada-actions">
        <button className="button primary" onClick={() => onOpenDepartment(zone)}>Open HMI</button>
        <button className="button secondary" onClick={onOpenAutomation}>Open PLC Logic</button>
      </footer>
    </section>
  );
}

export const ScadaOverlay = memo(ScadaOverlayComponent);
