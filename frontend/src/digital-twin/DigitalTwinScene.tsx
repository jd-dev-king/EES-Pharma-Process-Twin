import { memo, useMemo, useState } from "react";

import { ScadaOverlay } from "./ScadaOverlay";

export type TwinZone =
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

export interface TwinAsset {
  code: string;
  label: string;
  zone: TwinZone;
  status: string;
  poNumber?: string | null;
  level?: number;
}

interface ParkingStatus {
  available: boolean;
  lot_code: string;
  lot_name: string;
  total_spaces: number;
  occupied_spaces: number;
  available_spaces: number;
  employees: number;
  visitors: number;
  occupancy_percent: number;
}

interface DigitalTwinSceneProps {
  connected: boolean;
  assets: TwinAsset[];
  alarms: number;
  activeOrders: number;
  parking: ParkingStatus | null;
  onOpenParking: () => void;
  onNavigate: (zone: TwinZone) => void;
  onReturn: () => void;
}

type CameraPreset = "overview" | "production" | "warehouse" | "labs" | "shipping";
type State = "running" | "waiting" | "fault" | "cip" | "hold" | "complete";

const rooms: Array<{ zone: TwinZone; label: string; short: string; x: number; y: number; w: number; h: number }> = [
  { zone: "office", label: "Office", short: "OFF", x: 4, y: 5, w: 20, h: 18 },
  { zone: "warehouse", label: "Warehouse", short: "WH", x: 27, y: 5, w: 29, h: 24 },
  { zone: "bulk", label: "Bulk Tank Farm", short: "BK", x: 60, y: 5, w: 36, h: 24 },
  { zone: "weighing", label: "Weigh Rooms", short: "WR", x: 4, y: 33, w: 22, h: 25 },
  { zone: "mixing", label: "Mix & Hold", short: "MX", x: 30, y: 33, w: 37, h: 25 },
  { zone: "quality", label: "QA / QC", short: "QA", x: 71, y: 33, w: 25, h: 25 },
  { zone: "rnd", label: "R&D Lab", short: "RD", x: 4, y: 63, w: 22, h: 20 },
  { zone: "packaging", label: "Packaging", short: "PK", x: 30, y: 63, w: 37, h: 20 },
  { zone: "shipping", label: "Shipping", short: "SH", x: 71, y: 63, w: 25, h: 20 },
  { zone: "lean", label: "Reliability", short: "RL", x: 4, y: 87, w: 22, h: 10 },
  { zone: "compliance", label: "Compliance", short: "CP", x: 30, y: 87, w: 37, h: 10 },
  { zone: "automation", label: "Automation", short: "PLC", x: 71, y: 87, w: 25, h: 10 },
];

function stateFor(value: string): State {
  const normalized = value.toLowerCase();
  if (/fault|alarm|blocked|reject|trip/.test(normalized)) return "fault";
  if (/cip|cleaning|wash|rinse/.test(normalized)) return "cip";
  if (/hold|pending review|awaiting qa/.test(normalized)) return "hold";
  if (/complete|closed|shipped|released/.test(normalized)) return "complete";
  if (/running|in use|transferring|unloading|packaging|mixing|loading/.test(normalized)) return "running";
  return "waiting";
}

function DigitalTwinSceneComponent({ connected, assets, alarms, activeOrders, parking, onOpenParking, onNavigate, onReturn }: DigitalTwinSceneProps) {
  const [camera, setCamera] = useState<CameraPreset>("overview");
  const [selectedZone, setSelectedZone] = useState<TwinZone>("mixing");
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [selectedAssetCode, setSelectedAssetCode] = useState<string | null>(null);

  const zoneStates = useMemo(() => {
    const states = new Map<TwinZone, State>();
    for (const room of rooms) {
      const roomStates = assets.filter((asset) => asset.zone === room.zone).map((asset) => stateFor(asset.status));
      const state: State = roomStates.includes("fault")
        ? "fault"
        : roomStates.includes("cip")
          ? "cip"
          : roomStates.includes("hold")
            ? "hold"
            : roomStates.includes("running")
              ? "running"
              : roomStates.length > 0 && roomStates.every((item) => item === "complete")
                ? "complete"
                : "waiting";
      states.set(room.zone, state);
    }
    return states;
  }, [assets]);

  const selectedAssets = assets.filter((asset) => asset.zone === selectedZone).slice(0, 5);
  const selectedRoom = rooms.find((room) => room.zone === selectedZone);
  const selectedAsset = selectedAssets.find((asset) => asset.code === selectedAssetCode) ?? selectedAssets[0] ?? null;

  const selectRoom = (zone: TwinZone) => {
    setSelectedZone(zone);
    setSelectedAssetCode(null);
    if (["warehouse", "bulk"].includes(zone)) setCamera("warehouse");
    else if (["quality", "rnd"].includes(zone)) setCamera("labs");
    else if (zone === "shipping") setCamera("shipping");
    else if (["weighing", "mixing", "packaging"].includes(zone)) setCamera("production");
  };

  return (
    <div className={`digital-twin-shell camera-${camera} ${motionEnabled ? "motion-on" : "motion-off"}`}>
      <section className="twin-toolbar">
        <div>
          <p className="eyebrow">Immersive Facility Layer · Read-Only Operational Twin</p>
          <h2>Enterprise 3D Plant Navigation</h2>
          <p>Live room state, equipment telemetry, material flow, and direct navigation—without changing execution logic.</p>
        </div>
        <div className="twin-toolbar-actions">
          <button className="button secondary" onClick={onReturn}>2D Process Overview</button>
          <button className="button secondary" onClick={() => setLabelsVisible((value) => !value)}>{labelsVisible ? "Hide" : "Show"} Labels</button>
          <button className="button secondary" onClick={() => setMotionEnabled((value) => !value)}>{motionEnabled ? "Pause" : "Resume"} Motion</button>
        </div>
      </section>

      <section className="twin-kpi-strip">
        <article><span>Plant Connection</span><strong>{connected ? "ONLINE" : "OFFLINE"}</strong></article>
        <article><span>Active Orders</span><strong>{activeOrders}</strong></article>
        <article><span>Active Alarms</span><strong>{alarms}</strong></article>
        <article><span>Parking</span><strong>{parking?.available ? `${parking.occupied_spaces}/${parking.total_spaces}` : "OFFLINE"}</strong></article>
        <article><span>Selected Zone</span><strong>{selectedRoom?.label ?? "Plant"}</strong></article>
      </section>

      <section className="twin-stage-panel">
        <div className="twin-camera-presets" aria-label="Camera presets">
          {(["overview", "production", "warehouse", "labs", "shipping"] as CameraPreset[]).map((preset) => (
            <button key={preset} className={camera === preset ? "active" : ""} onClick={() => setCamera(preset)}>{preset}</button>
          ))}
        </div>

        <div className="twin-viewport">
          <div className="twin-sky"><span /><span /><span /></div>

          <button
            className={`parking-campus-sign ${parking?.available ? "online" : "offline"}`}
            onClick={onOpenParking}
            aria-label="Open Pharma Employee Parking Digital Twin"
          >
            <span className="parking-campus-sign-kicker">CAMPUS ACCESS</span>
            <strong>PHARMA EMPLOYEE PARKING</strong>
            <span className="parking-campus-sign-status">
              {parking?.available
                ? `${parking.occupied_spaces} / ${parking.total_spaces} occupied`
                : "Parking Twin Offline"}
            </span>
            <small>
              {parking?.available
                ? `${parking.employees} employees · ${parking.visitors} visitors · ${parking.available_spaces} spaces free`
                : "Open dedicated parking digital twin"}
            </small>
          </button>

          <div className="twin-scene">
            <div className="twin-floor-grid" />
            <div className="twin-main-corridor"><i /><i /><i /><i /></div>

            {rooms.map((room) => {
              const state = zoneStates.get(room.zone) ?? "waiting";
              const zoneAssets = assets.filter((asset) => asset.zone === room.zone);
              return (
                <button
                  key={room.zone}
                  className={`twin-room twin-state-${state} ${selectedZone === room.zone ? "selected" : ""}`}
                  style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.w}%`, height: `${room.h}%` }}
                  onClick={() => selectRoom(room.zone)}
                  onDoubleClick={() => onNavigate(room.zone)}
                  aria-label={`${room.label}: ${state}`}
                >
                  <span className="twin-room-floor" />
                  <span className="twin-wall twin-wall-left" />
                  <span className="twin-wall twin-wall-right" />
                  <span className="twin-room-beacon" />
                  {labelsVisible && <span className="twin-room-label"><b>{room.short}</b><strong>{room.label}</strong><small>{state} · {zoneAssets.length} assets</small></span>}
                  {room.zone === "bulk" && <div className="twin-tank-farm"><i /><i /><i /><i /></div>}
                  {room.zone === "mixing" && <div className="twin-process-tanks"><i /><i /><i /></div>}
                  {room.zone === "packaging" && <div className="twin-conveyor"><b /><b /><b /><b /></div>}
                  {room.zone === "warehouse" && <div className="twin-forklift"><i /><b /></div>}
                  {room.zone === "shipping" && <div className="twin-truck"><i /><b /><b /></div>}
                  {room.zone === "automation" && <div className="twin-plc-rack"><i /><i /><i /><i /></div>}
                </button>
              );
            })}

            <div className="twin-material-route route-one"><span /><span /><span /></div>
            <div className="twin-material-route route-two"><span /><span /></div>

            <button className={`twin-parking-campus ${parking?.available ? "online" : "offline"}`} onClick={onOpenParking} aria-label="Open Pharma Employee Parking Digital Twin">
              <span className="parking-campus-label"><b>PARKING</b><strong>{parking?.available ? `${parking.occupied_spaces}/${parking.total_spaces}` : "OFFLINE"}</strong></span>
              <span className="parking-campus-grid">{Array.from({ length: 24 }).map((_, index) => <i key={index} className={parking?.available && index < Math.min(24, Math.round((parking.occupancy_percent / 100) * 24)) ? "occupied" : ""} />)}</span>
              <span className="parking-gate-arm" />
            </button>
          </div>
        </div>

        <aside className="twin-hud">
          <div className="twin-hud-heading">
            <div><p className="eyebrow">Zone Faceplate</p><h3>{selectedRoom?.label}</h3></div>
            <span className={`twin-state-pill ${zoneStates.get(selectedZone) ?? "waiting"}`}>{zoneStates.get(selectedZone) ?? "waiting"}</span>
          </div>
          <div className="twin-asset-list">
            {selectedAssets.map((asset) => (
              <article key={`${asset.zone}-${asset.code}`} className={selectedAsset?.code === asset.code ? "selected" : ""} onClick={() => setSelectedAssetCode(asset.code)} role="button" tabIndex={0}>
                <div><strong>{asset.code}</strong><span>{asset.status}</span></div>
                <p>{asset.label}</p>
                <div className="twin-level"><span style={{ width: `${Math.max(0, Math.min(100, asset.level ?? 10))}%` }} /></div>
                <small>{asset.poNumber ?? "No active PO"}</small>
              </article>
            ))}
            {!selectedAssets.length && <p className="empty-state">No live equipment records in this zone.</p>}
          </div>
          <ScadaOverlay asset={selectedAsset} zone={selectedZone} onOpenDepartment={onNavigate} onOpenAutomation={() => onNavigate("automation")} />
          <div className="twin-parking-hud">
            <div><span>Campus Access</span><strong>{parking?.available ? `${parking.occupied_spaces}/${parking.total_spaces} occupied` : "Parking API offline"}</strong></div>
            <small>{parking?.available ? `${parking.employees} employees · ${parking.visitors} visitors currently on site` : "The Process Twin remains operational independently."}</small>
            <button className="button secondary" onClick={onOpenParking}>Open Parking Digital Twin</button>
          </div>
          <div className="twin-hud-actions">
            <button className="button primary" onClick={() => onNavigate(selectedZone)}>Open Department</button>
            <button className="button secondary" onClick={() => onNavigate("automation")}>Open PLC</button>
          </div>
          <p className="twin-help">Single-click a room to inspect it. Double-click to open the full department workspace.</p>
        </aside>
      </section>

      <section className="twin-legend">
        <span className="running">Running</span><span className="waiting">Waiting</span><span className="fault">Fault</span><span className="cip">CIP</span><span className="hold">QA Hold</span><span className="complete">Complete</span>
      </section>
    </div>
  );
}

export const DigitalTwinScene = memo(DigitalTwinSceneComponent);
