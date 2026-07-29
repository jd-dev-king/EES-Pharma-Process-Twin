import { memo, useMemo, useState } from "react";

export interface HistorianSample {
  assetCode: string;
  label: string;
  unit: string;
  value: number;
  status: string;
  zone: string;
}

export interface HistorianEvent {
  id: number | string;
  timestamp: string;
  source: string;
  message: string;
  severity: string;
  entityId?: string;
}

export interface HistorianAlarm {
  id: number | string;
  timestamp: string;
  source: string;
  code: string;
  message: string;
  severity: string;
  status: string;
}

interface HistorianCenterProps {
  connected: boolean;
  samples: HistorianSample[];
  events: HistorianEvent[];
  alarms: HistorianAlarm[];
  downtimeMinutes: number;
  availabilityPercent: number;
  mtbfMinutes: number;
  mttrMinutes: number;
  onNavigate: (zone: string) => void;
}

type RangeKey = "15m" | "1h" | "8h" | "24h";
type HistorianTab = "trends" | "alarms" | "events" | "performance";

const rangePoints: Record<RangeKey, number> = { "15m": 16, "1h": 24, "8h": 32, "24h": 40 };

function deterministicSeries(value: number, points: number, seed: number): number[] {
  const amplitude = Math.max(1, Math.abs(value) * 0.08);
  return Array.from({ length: points }, (_, index) => {
    const wave = Math.sin((index + seed) * 0.72) * amplitude;
    const drift = Math.cos((index + seed * 2) * 0.21) * amplitude * 0.45;
    return Math.max(0, value + wave + drift);
  });
}

function Sparkline({ values, unit }: { values: number[]; unit: string }) {
  const width = 520;
  const height = 150;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = (index / Math.max(1, values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 20) - 10;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="historian-chart-wrap">
      <svg className="historian-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trend in ${unit}`}>
        <defs>
          <linearGradient id="historianArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1="0" x2={width} y1={height * ratio} y2={height * ratio} className="historian-grid-line" />)}
        <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#historianArea)" />
        <polyline points={points} fill="none" className="historian-trend-line" />
      </svg>
      <div className="historian-axis"><span>{min.toFixed(1)} {unit}</span><span>{max.toFixed(1)} {unit}</span></div>
    </div>
  );
}

export const HistorianCenter = memo(function HistorianCenter({
  connected,
  samples,
  events,
  alarms,
  downtimeMinutes,
  availabilityPercent,
  mtbfMinutes,
  mttrMinutes,
  onNavigate,
}: HistorianCenterProps) {
  const [tab, setTab] = useState<HistorianTab>("trends");
  const [range, setRange] = useState<RangeKey>("1h");
  const [selectedAsset, setSelectedAsset] = useState(samples[0]?.assetCode ?? "");
  const [severity, setSeverity] = useState("All");

  const activeSample = samples.find((sample) => sample.assetCode === selectedAsset) ?? samples[0];
  const trend = useMemo(() => activeSample ? deterministicSeries(activeSample.value, rangePoints[range], activeSample.assetCode.length) : [], [activeSample, range]);
  const filteredAlarms = alarms.filter((alarm) => severity === "All" || alarm.severity.toLowerCase() === severity.toLowerCase());
  const alarmRate = alarms.length ? (alarms.length / Math.max(1, events.length) * 100).toFixed(1) : "0.0";

  return (
    <div className="historian-shell zone-stack">
      <section className="historian-hero">
        <div>
          <p className="eyebrow">Process Historian & Alarm Analytics</p>
          <h2>Time-series visibility across the connected plant</h2>
          <p>Read-only historical views derived from current process telemetry, equipment events, alarms, and reliability records.</p>
        </div>
        <div className={`historian-connection ${connected ? "online" : "offline"}`}>
          <span>{connected ? "Historian Online" : "Historian Offline"}</span>
          <strong>{samples.length}</strong>
          <small>tracked signals</small>
        </div>
      </section>

      <div className="historian-kpis">
        <article><span>Availability</span><strong>{availabilityPercent.toFixed(1)}%</strong><small>Packaging reliability</small></article>
        <article><span>Downtime</span><strong>{downtimeMinutes.toFixed(1)} min</strong><small>Recorded events</small></article>
        <article><span>MTBF</span><strong>{mtbfMinutes.toFixed(1)} min</strong><small>Mean time between failures</small></article>
        <article><span>MTTR</span><strong>{mttrMinutes.toFixed(1)} min</strong><small>Mean time to repair</small></article>
        <article><span>Alarm Rate</span><strong>{alarmRate}%</strong><small>Alarms per event record</small></article>
      </div>

      <div className="historian-tabs">
        {(["trends", "alarms", "events", "performance"] as HistorianTab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>

      {tab === "trends" && (
        <div className="historian-grid">
          <section className="historian-panel historian-signal-list">
            <div className="historian-panel-heading"><div><p className="eyebrow">Tag Browser</p><h3>Live Process Signals</h3></div><select value={range} onChange={(event) => setRange(event.target.value as RangeKey)}><option value="15m">15 minutes</option><option value="1h">1 hour</option><option value="8h">8 hours</option><option value="24h">24 hours</option></select></div>
            <div className="historian-tags">{samples.map((sample) => <button key={sample.assetCode} className={activeSample?.assetCode === sample.assetCode ? "selected" : ""} onClick={() => setSelectedAsset(sample.assetCode)}><span>{sample.assetCode}</span><strong>{sample.value.toFixed(1)} {sample.unit}</strong><small>{sample.label} · {sample.status}</small></button>)}</div>
          </section>
          <section className="historian-panel historian-trend-panel">
            {activeSample ? <><div className="historian-panel-heading"><div><p className="eyebrow">Selected Tag</p><h3>{activeSample.assetCode} · {activeSample.label}</h3></div><button className="button secondary" onClick={() => onNavigate(activeSample.zone)}>Open Equipment Area</button></div><div className="historian-current"><span>Current Value</span><strong>{activeSample.value.toFixed(1)} {activeSample.unit}</strong><small>{activeSample.status}</small></div><Sparkline values={trend} unit={activeSample.unit} /></> : <p className="empty-state">No historian signals are available.</p>}
          </section>
        </div>
      )}

      {tab === "alarms" && (
        <section className="historian-panel">
          <div className="historian-panel-heading"><div><p className="eyebrow">Alarm Historian</p><h3>Alarm sequence and response state</h3></div><select value={severity} onChange={(event) => setSeverity(event.target.value)}><option>All</option><option>Critical</option><option>Warning</option><option>Info</option></select></div>
          <div className="historian-table-wrap"><table><thead><tr><th>Timestamp</th><th>Source</th><th>Code</th><th>Message</th><th>Severity</th><th>Status</th></tr></thead><tbody>{filteredAlarms.map((alarm) => <tr key={alarm.id}><td>{new Date(alarm.timestamp).toLocaleString()}</td><td>{alarm.source}</td><td><strong>{alarm.code}</strong></td><td>{alarm.message}</td><td><span className={`historian-severity ${alarm.severity.toLowerCase()}`}>{alarm.severity}</span></td><td>{alarm.status}</td></tr>)}</tbody></table>{!filteredAlarms.length && <p className="empty-state">No alarms match this filter.</p>}</div>
        </section>
      )}

      {tab === "events" && (
        <section className="historian-panel">
          <div className="historian-panel-heading"><div><p className="eyebrow">Event Historian</p><h3>Chronological process evidence</h3></div><span>{events.length} records</span></div>
          <div className="historian-event-strip">{events.slice(0, 80).map((event) => <article key={event.id}><time>{new Date(event.timestamp).toLocaleString()}</time><div><strong>{event.source}</strong><p>{event.message}</p><small>{event.entityId ?? "Enterprise event"}</small></div><span className={`historian-severity ${event.severity.toLowerCase()}`}>{event.severity}</span></article>)}</div>
        </section>
      )}

      {tab === "performance" && (
        <div className="historian-performance-grid">
          <section className="historian-panel"><p className="eyebrow">Reliability Window</p><h3>Equipment performance summary</h3><div className="historian-performance-bars"><article><div><span>Availability</span><strong>{availabilityPercent.toFixed(1)}%</strong></div><progress max="100" value={availabilityPercent} /></article><article><div><span>Uptime Ratio</span><strong>{Math.max(0, 100 - Math.min(100, downtimeMinutes)).toFixed(1)}%</strong></div><progress max="100" value={Math.max(0, 100 - Math.min(100, downtimeMinutes))} /></article><article><div><span>Alarm-free Signals</span><strong>{Math.max(0, samples.length - alarms.length)}/{samples.length}</strong></div><progress max={Math.max(1, samples.length)} value={Math.max(0, samples.length - alarms.length)} /></article></div></section>
          <section className="historian-panel"><p className="eyebrow">Data Quality</p><h3>Historian record integrity</h3><div className="historian-quality-grid"><article><span>Signals Online</span><strong>{samples.length}</strong></article><article><span>Events Retained</span><strong>{events.length}</strong></article><article><span>Alarm Records</span><strong>{alarms.length}</strong></article><article><span>Timestamp Coverage</span><strong>{events.length ? "Complete" : "Awaiting Data"}</strong></article></div></section>
        </div>
      )}
    </div>
  );
});
