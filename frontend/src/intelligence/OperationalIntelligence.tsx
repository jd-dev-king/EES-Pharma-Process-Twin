import { memo, useMemo, useState } from "react";

export interface IntelligenceAsset {
  assetCode: string;
  label: string;
  zone: string;
  status: string;
  faultCode?: string | null;
  primaryValue: number;
  unit: string;
}

export interface IntelligenceWorkOrder {
  id: number;
  workOrderId: string;
  assetCode: string;
  priority: string;
  status: string;
  description: string;
}

interface OperationalIntelligenceProps {
  assets: IntelligenceAsset[];
  workOrders: IntelligenceWorkOrder[];
  alarmCount: number;
  downtimeMinutes: number;
  availabilityPercent: number;
  mtbfMinutes: number;
  mttrMinutes: number;
  onNavigate: (zone: string) => void;
}

type ViewKey = "health" | "anomalies" | "recommendations" | "forecast";

function clamp(value: number, min = 0, max = 100) { return Math.min(max, Math.max(min, value)); }

function riskFor(asset: IntelligenceAsset, workOrders: IntelligenceWorkOrder[]) {
  const text = `${asset.status} ${asset.faultCode ?? ""}`.toLowerCase();
  const openOrders = workOrders.filter((item) => item.assetCode === asset.assetCode && item.status !== "Completed").length;
  let risk = 8 + openOrders * 22;
  if (/fault|jam|trip|alarm|blocked/.test(text)) risk += 58;
  if (/cip|cleaning|maintenance/.test(text)) risk += 18;
  if (/running|transferring|mixing|packaging/.test(text)) risk += 6;
  if (asset.unit === "%" && asset.primaryValue >= 95) risk += 5;
  return clamp(risk);
}

function healthLabel(score: number) {
  if (score >= 85) return "Healthy";
  if (score >= 65) return "Watch";
  if (score >= 40) return "At Risk";
  return "Critical";
}

export const OperationalIntelligence = memo(function OperationalIntelligence({
  assets, workOrders, alarmCount, downtimeMinutes, availabilityPercent, mtbfMinutes, mttrMinutes, onNavigate,
}: OperationalIntelligenceProps) {
  const [view, setView] = useState<ViewKey>("health");
  const assetIdentity = (asset: IntelligenceAsset) => `${asset.zone}:${asset.assetCode}:${asset.label}`;
  const [selectedAsset, setSelectedAsset] = useState(assets[0] ? assetIdentity(assets[0]) : "");

  const ranked = useMemo(() => assets.map((asset) => {
    const risk = riskFor(asset, workOrders);
    const health = clamp(100 - risk);
    return { ...asset, risk, health, labelText: healthLabel(health) };
  }).sort((a, b) => b.risk - a.risk), [assets, workOrders]);

  const selected = ranked.find((asset) => assetIdentity(asset) === selectedAsset) ?? ranked[0];
  const recommendations = useMemo(() => ranked.filter((asset) => asset.risk >= 20).slice(0, 8).map((asset, index) => ({
    id: `${asset.assetCode}-${index}`,
    asset,
    priority: asset.risk >= 70 ? "Critical" : asset.risk >= 45 ? "High" : "Planned",
    action: asset.faultCode
      ? `Inspect ${asset.faultCode}, verify permissives, and close the active failure mode.`
      : asset.risk >= 45
        ? "Perform condition inspection and review recent historian variation."
        : "Schedule a routine condition check during the next available window.",
  })), [ranked]);

  const fleetHealth = ranked.length ? Math.round(ranked.reduce((sum, item) => sum + item.health, 0) / ranked.length) : 100;
  const highRisk = ranked.filter((item) => item.risk >= 45).length;
  const predictedHours = selected ? Math.max(2, Math.round((selected.health / 100) * Math.max(8, mtbfMinutes || 120) / 60)) : 0;

  return <div className="intelligence-shell zone-stack">
    <section className="intelligence-hero">
      <div><span className="eyebrow">Predictive Maintenance · Operational Intelligence</span><h2>Plant Health & Failure-Risk Center</h2><p>Read-only decision support derived from current equipment state, alarms, work orders, and reliability history.</p></div>
      <div className={`intelligence-score ${fleetHealth < 65 ? "warning" : "good"}`}><strong>{fleetHealth}</strong><span>Fleet Health</span></div>
    </section>

    <div className="intelligence-kpis">
      <article><span>High-Risk Assets</span><strong>{highRisk}</strong><small>Risk score ≥ 45</small></article>
      <article><span>Active Alarms</span><strong>{alarmCount}</strong><small>Cross-functional</small></article>
      <article><span>Availability</span><strong>{availabilityPercent}%</strong><small>Current reliability</small></article>
      <article><span>Downtime</span><strong>{downtimeMinutes} min</strong><small>Recorded total</small></article>
      <article><span>MTBF / MTTR</span><strong>{mtbfMinutes}/{mttrMinutes}</strong><small>Minutes</small></article>
    </div>

    <nav className="intelligence-tabs" aria-label="Operational intelligence views">
      {(["health","anomalies","recommendations","forecast"] as ViewKey[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>)}
    </nav>

    {view === "health" && <div className="intelligence-grid">
      <section className="intelligence-panel"><div className="panel-heading"><div><span className="eyebrow">Asset Ranking</span><h3>Equipment Health</h3></div></div><div className="health-list">{ranked.map((asset) => <button key={assetIdentity(asset)} className={selected && assetIdentity(selected) === assetIdentity(asset) ? "selected" : ""} onClick={() => setSelectedAsset(assetIdentity(asset))}><div><strong>{asset.assetCode}</strong><span>{asset.label}</span></div><div className={`health-pill ${asset.labelText.toLowerCase().replace(" ", "-")}`}>{asset.health}% · {asset.labelText}</div><progress value={asset.health} max="100" /></button>)}</div></section>
      <section className="intelligence-panel">{selected ? <><div className="panel-heading"><div><span className="eyebrow">Selected Asset</span><h3>{selected.assetCode}</h3><p>{selected.label}</p></div><button className="button secondary" onClick={() => onNavigate(selected.zone)}>Open Department</button></div><div className="asset-health-ring"><div><strong>{selected.health}</strong><span>Health</span></div></div><div className="intelligence-detail-grid"><article><span>Status</span><strong>{selected.status}</strong></article><article><span>Risk</span><strong>{selected.risk}%</strong></article><article><span>Signal</span><strong>{selected.primaryValue} {selected.unit}</strong></article><article><span>Failure Horizon</span><strong>{predictedHours} h</strong></article></div><p className="intelligence-note">The risk score is deterministic decision support for this simulator, not a validated real-world predictive model.</p></> : <p className="empty-state">No equipment signals are currently available.</p>}</section>
    </div>}

    {view === "anomalies" && <section className="intelligence-panel"><div className="panel-heading"><div><span className="eyebrow">Rule-Based Detection</span><h3>Current Anomalies</h3></div></div><div className="anomaly-grid">{ranked.filter((asset) => asset.risk >= 25).map((asset) => <article key={assetIdentity(asset)} className={asset.risk >= 70 ? "critical" : "warning"}><div><strong>{asset.assetCode}</strong><span>{asset.risk}% risk</span></div><p>{asset.faultCode ? `Active fault ${asset.faultCode}` : `State variation detected: ${asset.status}`}</p><small>{asset.primaryValue} {asset.unit} · {asset.label}</small><button className="button secondary" onClick={() => onNavigate(asset.zone)}>Investigate</button></article>)}{!ranked.some((asset) => asset.risk >= 25) && <p className="empty-state">No meaningful anomalies are detected.</p>}</div></section>}

    {view === "recommendations" && <section className="intelligence-panel"><div className="panel-heading"><div><span className="eyebrow">Maintenance Planning</span><h3>Recommended Actions</h3></div></div><div className="recommendation-list">{recommendations.map((item) => <article key={item.id}><span className={`priority ${item.priority.toLowerCase()}`}>{item.priority}</span><div><strong>{item.asset.assetCode}</strong><p>{item.action}</p><small>{item.asset.status}</small></div><button className="button secondary" onClick={() => onNavigate(item.asset.zone)}>Open</button></article>)}{!recommendations.length && <p className="empty-state">No maintenance actions are currently recommended.</p>}</div></section>}

    {view === "forecast" && <div className="intelligence-grid"><section className="intelligence-panel"><span className="eyebrow">Reliability Outlook</span><h3>24-Hour Risk Forecast</h3><div className="forecast-bars">{ranked.slice(0, 8).map((asset) => <article key={assetIdentity(asset)}><div><strong>{asset.assetCode}</strong><span>{asset.risk}%</span></div><div><i style={{width:`${asset.risk}%`}} /></div></article>)}</div></section><section className="intelligence-panel"><span className="eyebrow">Planning Context</span><h3>Maintenance Capacity</h3><div className="intelligence-detail-grid"><article><span>Open Work Orders</span><strong>{workOrders.filter((item) => item.status !== "Completed").length}</strong></article><article><span>Critical Priority</span><strong>{workOrders.filter((item) => /critical/i.test(item.priority) && item.status !== "Completed").length}</strong></article><article><span>Assets Monitored</span><strong>{ranked.length}</strong></article><article><span>Stable Assets</span><strong>{ranked.filter((item) => item.health >= 85).length}</strong></article></div><p className="intelligence-note">Forecast values update from live simulator state and retained reliability metrics. They are intended for training and portfolio demonstration.</p></section></div>}
  </div>;
});
