import { memo, useMemo } from "react";
import type { ParkingStatus } from "../types";

export type OverviewZone =
  | "office"
  | "warehouse"
  | "weighing"
  | "bulk"
  | "mixing"
  | "quality"
  | "rnd"
  | "packaging"
  | "shipping"
  | "lean"
  | "compliance"
  | "automation";

export interface OverviewKpis {
  activeBatches: number;
  oee: number;
  rightFirstTime: number;
  yieldPercent: number;
  equipmentAvailability: number;
  currentAlarms: number;
  qaBacklog: number;
  shipmentsClosed: number;
  downtimeMinutes: number;
}

export interface OverviewOrder {
  poNumber: string;
  productName: string;
  status: string;
  weighRoom: string;
  mixTank: string;
  holdTank: string;
  packagingLine: string;
}

export interface OverviewAsset {
  code: string;
  label: string;
  zone: OverviewZone;
  status: string;
  poNumber?: string | null;
  progress?: number;
  primaryMetric?: string;
  secondaryMetric?: string;
}

export interface OverviewEvent {
  id: number | string;
  source: string;
  message: string;
  severity: string;
  createdAt: string;
  zone: OverviewZone;
}

interface ProcessOverviewProps {
  connected: boolean;
  kpis: OverviewKpis;
  orders: OverviewOrder[];
  assets: OverviewAsset[];
  events: OverviewEvent[];
  parking: ParkingStatus | null;
  onOpenSecurity: () => void;
  onNavigate: (zone: OverviewZone | "thread" | "analytics" | "alerts") => void;
}

type VisualState = "running" | "waiting" | "fault" | "cip" | "hold" | "complete";

const flowZones: Array<{ id: OverviewZone; label: string; icon: string }> = [
  { id: "office", label: "Office", icon: "PO" },
  { id: "warehouse", label: "Warehouse", icon: "WH" },
  { id: "weighing", label: "Weighing", icon: "WR" },
  { id: "bulk", label: "Bulk", icon: "BK" },
  { id: "mixing", label: "Mixing", icon: "MX" },
  { id: "quality", label: "QA", icon: "QA" },
  { id: "rnd", label: "R&D", icon: "RD" },
  { id: "packaging", label: "Packaging", icon: "PK" },
  { id: "shipping", label: "Shipping", icon: "SH" },
];

function stateFor(value: string): VisualState {
  const normalized = value.toLowerCase();
  if (/fault|alarm|blocked|reject/.test(normalized)) return "fault";
  if (/cip|cleaning|wash|rinse/.test(normalized)) return "cip";
  if (/hold|pending review|awaiting qa/.test(normalized)) return "hold";
  if (/complete|closed|shipped|released/.test(normalized)) return "complete";
  if (/running|in use|transferring|unloading|packaging|mixing/.test(normalized)) return "running";
  return "waiting";
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function ProcessOverviewComponent({ connected, kpis, orders, assets, events, parking, onOpenSecurity, onNavigate }: ProcessOverviewProps) {
  const zoneState = useMemo(() => {
    const result = new Map<OverviewZone, VisualState>();
    for (const zone of flowZones) {
      const zoneAssets = assets.filter((asset) => asset.zone === zone.id);
      const states = zoneAssets.map((asset) => stateFor(asset.status));
      const state: VisualState = states.includes("fault")
        ? "fault"
        : states.includes("cip")
          ? "cip"
          : states.includes("hold")
            ? "hold"
            : states.includes("running")
              ? "running"
              : states.length > 0 && states.every((item) => item === "complete")
                ? "complete"
                : "waiting";
      result.set(zone.id, state);
    }
    return result;
  }, [assets]);

  const activeOrders = orders.filter((order) => !/closed|shipped|completed/i.test(order.status)).slice(0, 4);
  const visibleAssets = assets.slice(0, 10);
  const recentEvents = events.slice(0, 8);

  return (
    <div className="process-overview-shell">
      <section className="process-overview-hero">
        <div>
          <p className="eyebrow">Enterprise Mission Control · Live Process Digital Twin</p>
          <h1>Watch every batch, asset, and handoff move through the plant.</h1>
          <p>Animated material flow, live equipment state, executive KPIs, and the digital thread are synchronized with the validated execution engine.</p>
          <div className="button-row">
            <button className="button primary" onClick={() => onNavigate("thread")}>Open Digital Thread</button>
            <button className="button secondary" onClick={() => onNavigate("analytics")}>Executive Analytics</button>
            <button className="button secondary" onClick={() => onNavigate("automation")}>Automation Center</button>
            <button className="button secondary" onClick={onOpenSecurity}>Security Command Center</button>
          </div>
        </div>
        <div className={`overview-plant-pulse ${connected ? "online" : "offline"}`}>
          <span>Plant Health</span>
          <strong>{Math.round((kpis.oee + kpis.equipmentAvailability) / 2)}%</strong>
          <small>{connected ? "Connected & synchronized" : "API offline"}</small>
        </div>
      </section>

      <section className="overview-kpi-ribbon" aria-label="Executive plant KPIs">
        <article><span>Active Batches</span><strong>{kpis.activeBatches}</strong><small>Live production orders</small></article>
        <article><span>OEE</span><strong>{kpis.oee}%</strong><small>Availability × performance × quality</small></article>
        <article><span>Right First Time</span><strong>{kpis.rightFirstTime}%</strong><small>Exception-free execution</small></article>
        <article><span>Yield</span><strong>{kpis.yieldPercent}%</strong><small>Finished versus planned</small></article>
        <article><span>Availability</span><strong>{kpis.equipmentAvailability}%</strong><small>Equipment ready</small></article>
        <article><span>Active Alarms</span><strong>{kpis.currentAlarms}</strong><small>{kpis.downtimeMinutes} min downtime</small></article>
        <article><span>QA Backlog</span><strong>{kpis.qaBacklog}</strong><small>Pending dispositions</small></article>
        <article><span>Shipments Closed</span><strong>{kpis.shipmentsClosed}</strong><small>Completed outbound loads</small></article>
      </section>

      <section className="overview-plant-stage">
        <header className="overview-section-heading">
          <div><p className="eyebrow">Interactive Facility Overview</p><h2>Live Pharmaceutical Process Flow</h2></div>
          <div className="overview-legend"><span className="running">Running</span><span className="waiting">Waiting</span><span className="fault">Fault</span><span className="cip">CIP</span><span className="hold">QA Hold</span></div>
        </header>

        <div className="overview-flow-line">
          {flowZones.map((zone, index) => {
            const state = zoneState.get(zone.id) ?? "waiting";
            const count = assets.filter((asset) => asset.zone === zone.id && stateFor(asset.status) === "running").length;
            return (
              <div className="overview-flow-node-wrap" key={zone.id}>
                <button className={`overview-flow-node ${state}`} onClick={() => onNavigate(zone.id)}>
                  <span className="overview-node-icon">{zone.icon}</span>
                  <strong>{zone.label}</strong>
                  <small>{count > 0 ? `${count} active asset${count === 1 ? "" : "s"}` : state === "complete" ? "Complete" : "Open workspace"}</small>
                  <i aria-hidden="true" />
                </button>
                {index < flowZones.length - 1 && <div className={`overview-flow-connector ${state}`}><b /><b /><b /></div>}
              </div>
            );
          })}
        </div>

        <div className="overview-animation-deck">
          <article className="overview-scene tanker-scene" onClick={() => onNavigate("bulk")}>
            <div className="scene-title"><span>Bulk Receiving</span><strong>{assets.filter((asset) => asset.zone === "bulk").length} tanks</strong></div>
            <div className="tanker-visual"><div className="tanker-cab" /><div className="tanker-body"><span /></div><div className="tanker-wheel one" /><div className="tanker-wheel two" /></div>
            <div className="flow-pipe"><span /></div>
            <small>Tanker unloading and tank-farm inventory</small>
          </article>
          <article className="overview-scene tank-scene" onClick={() => onNavigate("mixing")}>
            <div className="scene-title"><span>Mix & Hold</span><strong>{assets.filter((asset) => asset.zone === "mixing").length} assets</strong></div>
            <div className="animated-tank"><div className="tank-liquid" /><div className="tank-impeller">+</div></div>
            <small>Live level, agitation, transfer, and CIP state</small>
          </article>
          <article className="overview-scene conveyor-scene" onClick={() => onNavigate("packaging")}>
            <div className="scene-title"><span>Packaging</span><strong>{assets.filter((asset) => asset.zone === "packaging").length} lines</strong></div>
            <div className="conveyor-belt"><span /><span /><span /><span /><span /></div>
            <div className="conveyor-base" />
            <small>Automatic filling, inspection, jams, and finished goods</small>
          </article>
          <article className="overview-scene shipping-scene" onClick={() => onNavigate("shipping")}>
            <div className="scene-title"><span>Shipping</span><strong>{kpis.shipmentsClosed} closed</strong></div>
            <div className="dock-door"><div className="dock-truck" /></div>
            <small>Dock scheduling, loading, sealing, and departure</small>
          </article>
        </div>
      </section>

      <section className="overview-batch-lanes">
        <header className="overview-section-heading"><div><p className="eyebrow">Live Material Flow</p><h2>Active Batch Lanes</h2></div></header>
        <div className="batch-lane-list">
          {activeOrders.map((order, orderIndex) => {
            const status = stateFor(order.status);
            return (
              <article className={`batch-lane ${status}`} key={order.poNumber}>
                <div className="batch-lane-heading"><div><strong>{order.poNumber}</strong><span>{order.productName}</span></div><em>{order.status}</em></div>
                <div className="batch-route-track">
                  {["Office", "Warehouse", order.weighRoom, order.mixTank, order.holdTank, "QA", order.packagingLine, "Shipping"].map((step, index) => (
                    <div className={index <= Math.min(7, orderIndex + 3) ? "passed" : "pending"} key={`${order.poNumber}-${step}`}><span>{step}</span>{index < 7 && <i />}</div>
                  ))}
                  <b className="batch-packet" style={{ "--packet-delay": `${orderIndex * -1.1}s` } as React.CSSProperties}>{order.poNumber.slice(-3)}</b>
                </div>
              </article>
            );
          })}
          {!activeOrders.length && <p className="empty-state">No active production orders. Register a PO in Office to activate the process twin.</p>}
        </div>
      </section>

      <div className="overview-lower-grid">
        <section className="overview-panel">
          <header className="overview-section-heading"><div><p className="eyebrow">Live Equipment</p><h2>Asset Telemetry</h2></div></header>
          <div className="overview-asset-grid">
            {visibleAssets.map((asset) => {
              const state = stateFor(asset.status);
              return (
                <button className={`overview-asset-card ${state}`} key={`${asset.zone}-${asset.code}`} onClick={() => onNavigate(asset.zone)}>
                  <div><strong>{asset.code}</strong><span>{state}</span></div>
                  <h3>{asset.label}</h3>
                  <p>{asset.status}</p>
                  <div className="overview-progress"><span style={{ width: `${clamp(asset.progress ?? (state === "running" ? 62 : state === "complete" ? 100 : 12))}%` }} /></div>
                  <footer><span>{asset.primaryMetric ?? asset.poNumber ?? "No active PO"}</span><small>{asset.secondaryMetric ?? "Click to open"}</small></footer>
                </button>
              );
            })}
          </div>
        </section>

        <section className="overview-panel thread-panel">
          <header className="overview-section-heading"><div><p className="eyebrow">Digital Thread</p><h2>Latest Plant Events</h2></div><button className="button secondary" onClick={() => onNavigate("thread")}>Explore</button></header>
          <div className="overview-thread-list">
            {recentEvents.map((event) => (
              <button key={event.id} className={`overview-thread-event severity-${event.severity}`} onClick={() => onNavigate(event.zone)}>
                <time>{new Date(event.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>
                <div><strong>{event.source}</strong><p>{event.message}</p></div>
                <span>Open</span>
              </button>
            ))}
            {!recentEvents.length && <p className="empty-state">Plant events will appear as workflows begin.</p>}
          </div>
        </section>
      </div>

      <section
        className={`overview-security-strip ${parking?.available ? "online" : "offline"}`}
      >
        <div>
          <p className="eyebrow">Facility Security</p>
          <h2>Security Command Center</h2>
          <small>Pharma secured parking & overflow access oversight</small>
        </div>

        <article>
          <span>Secured Lot</span>
          <strong>
            {parking?.available
              ? `${parking.secured_occupied_spaces}/${parking.secured_total_spaces}`
              : "OFFLINE"}
          </strong>
          <small>
            {parking?.available
              ? `${parking.secured_available_spaces} free`
              : "Parking twin unavailable"}
          </small>
        </article>

        <article>
          <span>Overflow</span>
          <strong>
            {parking?.available
              ? `${parking.overflow_occupied_spaces}/${parking.overflow_total_spaces}`
              : "—/30"}
          </strong>
          <small>
            {parking?.available
              ? `${parking.overflow_available_spaces} free`
              : "Secured overflow"}
          </small>
        </article>

        <article>
          <span>Total Parked</span>
          <strong>
            {parking?.available
              ? `${parking.total_parked}/${parking.total_parking_capacity}`
              : "—/100"}
          </strong>
          <small>Secured + overflow</small>
        </article>

        <article>
          <span>Employees</span>
          <strong>{parking?.employees ?? 0}</strong>
          <small>Currently on site</small>
        </article>

        <article>
          <span>Contractors</span>
          <strong>{parking?.contractors ?? 0}</strong>
          <small>Currently on site</small>
        </article>

        <article>
          <span>Visitors</span>
          <strong>{parking?.visitors ?? 0}</strong>
          <small>Currently on site</small>
        </article>

        <article>
          <span>Auto Run</span>
          <strong>
            {parking?.auto_run_active
              ? "ACTIVE"
              : parking?.auto_run_phase === "COMPLETE"
                ? "COMPLETE"
                : "IDLE"}
          </strong>
          <small>
            {parking?.sim_day && parking?.sim_time
              ? `${parking.sim_day} ${parking.sim_time}`
              : parking?.auto_run_phase ?? "Waiting"}
          </small>
        </article>

        <button
          className="button primary"
          onClick={onOpenSecurity}
        >
          Open Security Command Center
        </button>
      </section>

      <section className="overview-automation-strip" onClick={() => onNavigate("automation")}>
        <div><p className="eyebrow">Mini Automation Status</p><h2>PLC Network</h2></div>
        <article><span>Controller State</span><strong>{connected ? "RUN" : "OFFLINE"}</strong></article>
        <article><span>Estimated Scan</span><strong>{connected ? "8 ms" : "—"}</strong></article>
        <article><span>Active Alarms</span><strong>{kpis.currentAlarms}</strong></article>
        <article><span>Equipment Online</span><strong>{assets.length}</strong></article>
        <button className="button primary">Open Automation Center</button>
      </section>
    </div>
  );
}

export const ProcessOverview = memo(ProcessOverviewComponent);
