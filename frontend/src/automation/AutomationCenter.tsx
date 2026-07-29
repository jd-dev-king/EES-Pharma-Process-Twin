import { useMemo, useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import type * as T from "../types";

type AutomationView = "ladder" | "fbd" | "io" | "alarms" | "faceplate" | "training";

type NavigateTarget = "mixing" | "packaging" | "bulk" | "lean";

interface EquipmentAsset {
  code: string;
  name: string;
  area: string;
  controller: string;
  status: string;
  mode: string;
  faultCode: string | null;
  faultMessage: string | null;
  metricLabel: string;
  metricValue: string;
}

interface AutomationCenterProps {
  mixRooms: T.MixRoom[];
  mixBatches: T.MixBatch[];
  packagingLines: T.PackagingLine[];
  packagingRuns: T.PackagingRun[];
  bulkTanks: T.BulkTank[];
  bulkTransfers: T.BulkTransfer[];
  cipRuns: T.CIPRun[];
  navigateTo: (zone: NavigateTarget) => void;
}

export function AutomationCenter(props: AutomationCenterProps) {
  const [selectedCode, setSelectedCode] = useState("V-201");
  const [view, setView] = useState<AutomationView>("ladder");
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [trainingStep, setTrainingStep] = useState(0);

  const equipment = useMemo<EquipmentAsset[]>(() => [
    ...props.mixRooms.map((room) => {
      const batch = props.mixBatches.find((item) => item.tank_code === room.tank_code);
      return {
        code: room.tank_code,
        name: `${room.name} PLC`,
        area: "Mixing",
        controller: room.plc_code,
        status: room.status,
        mode: room.active_po ? "AUTO" : "STANDBY",
        faultCode: batch?.fault_code ?? null,
        faultMessage: batch?.fault_message ?? null,
        metricLabel: "RPM / Temp",
        metricValue: `${batch?.rpm ?? 0} RPM · ${batch?.temperature_c ?? 24} °C`,
      };
    }),
    ...props.packagingLines.map((line) => {
      const run = props.packagingRuns.find((item) => item.line_code === line.line_code);
      return {
        code: line.line_code,
        name: `${line.name} PLC`,
        area: "Packaging",
        controller: line.plc_code,
        status: line.status,
        mode: line.active_po ? "AUTO" : "STANDBY",
        faultCode: run?.jam_code ?? null,
        faultMessage: run?.fault_message ?? null,
        metricLabel: "Speed / Output",
        metricValue: `${run?.speed_bpm ?? 0} BPM · ${run?.bottles_completed ?? 0} bottles`,
      };
    }),
    ...props.bulkTanks.map((tank) => {
      const transfer = props.bulkTransfers.find((item) => item.source_tank === tank.tank_code);
      return {
        code: tank.tank_code,
        name: `${tank.material_name} Transfer PLC`,
        area: "Bulk Tank Farm",
        controller: `BULK_PLC_${tank.tank_code.replace("-", "_")}`,
        status: tank.status,
        mode: transfer?.status === "Running" ? "AUTO" : "STANDBY",
        faultCode: transfer?.fault_code ?? null,
        faultMessage: transfer?.fault_message ?? null,
        metricLabel: "Inventory / Temp",
        metricValue: `${tank.quantity_kg.toFixed(0)} kg · ${tank.temperature_c.toFixed(1)} °C`,
      };
    }),
    ...props.cipRuns.map((run) => ({
      code: `CIP-${run.asset_code}`,
      name: `${run.asset_code} CIP Sequence`,
      area: "CIP Recovery",
      controller: `CIP_PLC_${run.asset_code.replace("-", "_")}`,
      status: run.status,
      mode: run.status === "Running" ? "AUTO" : "STANDBY",
      faultCode: run.fault_code,
      faultMessage: run.fault_message,
      metricLabel: "Phase / Progress",
      metricValue: `${run.phase} · ${run.progress}%`,
    })),
  ], [props]);

  const selected = equipment.find((item) => item.code === selectedCode) ?? equipment[0] ?? {
    code: "V-201", name: "Mix Tank PLC", area: "Mixing", controller: "BATCH_PLC_01",
    status: "Available", mode: "STANDBY", faultCode: null, faultMessage: null,
    metricLabel: "State", metricValue: "Ready",
  };
  const activeFaults = equipment.filter((item) => item.faultCode);
  const hasFault = Boolean(selected.faultCode);
  const isRunning = selected.mode === "AUTO";
  const scanTime = (12 + equipment.length * 0.7).toFixed(1);

  const inputs = [
    ["I:0/0", "E_STOP_OK", !hasFault], ["I:0/1", "PERMISSIVE_OK", !hasFault],
    ["I:0/2", "LEVEL_SAFE", true], ["I:0/3", "MOTOR_FEEDBACK", isRunning && !hasFault],
    ["I:0/4", "FAULT_RESET", false],
  ] as const;
  const outputs = [
    ["O:0/0", "RUN_COMMAND", isRunning && !hasFault], ["O:0/1", "VALVE_OPEN", isRunning && !hasFault],
    ["O:0/2", "ALARM_HORN", hasFault], ["O:0/3", "CYCLE_COMPLETE", selected.status === "Complete"],
  ] as const;

  const sourceZone = selected.area === "Packaging" ? "packaging" : selected.area === "Mixing" ? "mixing" : selected.area === "Bulk Tank Farm" ? "bulk" : "lean";

  return <div className="zone-page automation-zone">
    <section className="zone-hero compact-hero">
      <div><p className="eyebrow">Sprint 3.0.2 · Live PLC & Automation Center</p><h1>Enterprise Automation Center</h1><p>PLC racks, live ladder/FBD signal flow, I/O monitoring, alarm investigation, equipment faceplates, and guided diagnostics.</p></div>
      <StatusBadge label={activeFaults.length ? `${activeFaults.length} PLC Fault${activeFaults.length === 1 ? "" : "s"}` : "Controllers Online"} state={activeFaults.length ? "warning" : "success"}/>
    </section>

    <div className="kpi-grid automation-kpis">
      <article><span>Controllers</span><strong>{equipment.length}</strong></article>
      <article><span>Auto Mode</span><strong>{equipment.filter((item) => item.mode === "AUTO").length}</strong></article>
      <article><span>Active Faults</span><strong>{activeFaults.length}</strong></article>
      <article><span>PLC Scan Time</span><strong>{scanTime} ms</strong></article>
    </div>

    <div className="automation-layout">
      <SectionCard title="PLC Equipment Rack" eyebrow="Controllers & Operational Ownership">
        <div className="automation-equipment-list">
          {equipment.map((item) => <button key={`${item.area}-${item.code}`} className={`automation-equipment-card ${selected.code === item.code ? "selected" : ""} ${item.faultCode ? "faulted" : ""}`} onClick={() => setSelectedCode(item.code)}>
            <div><strong>{item.code}</strong><span>{item.mode}</span></div><p>{item.name}</p><small>{item.area} · {item.controller}</small><em>{item.faultCode ? `${item.faultCode}: ${item.faultMessage}` : item.status}</em>
          </button>)}
          {!equipment.length && <p className="empty-state">Equipment controllers appear as plant assets are initialized.</p>}
        </div>
      </SectionCard>

      <SectionCard title={`${selected.code} Automation Workspace`} eyebrow={`${selected.controller} · ${selected.area}`}>
        <div className="automation-toolbar">
          {(["ladder","fbd","io","alarms","faceplate","training"] as AutomationView[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item === "io" ? "I/O Monitor" : item[0].toUpperCase()+item.slice(1)}</button>)}
        </div>

        {selected.faultCode && <div className="fault-banner"><div><strong>{selected.faultCode}</strong><span>ACTIVE PLC FAULT</span></div><p>{selected.faultMessage}</p><button className="button secondary" onClick={() => props.navigateTo(sourceZone)}>Open Source Equipment</button></div>}

        {view === "ladder" && <div className="ladder-monitor">
          <div className={`ladder-rung ${!hasFault ? "energized" : ""}`}><span className="rail"/><span className="contact">E_STOP_OK</span><span className="contact">PERMISSIVE</span><span className="coil">RUN_CMD</span><span className="rail"/></div>
          <div className={`ladder-rung ${isRunning && !hasFault ? "energized" : ""}`}><span className="rail"/><span className="contact">AUTO_MODE</span><span className="contact">LEVEL_SAFE</span><span className="coil">MOTOR_OUT</span><span className="rail"/></div>
          <div className={`ladder-rung ${hasFault ? "fault-rung" : ""}`}><span className="rail"/><span className="contact normally-closed">FAULT_OK</span><span className="timer">TON T4:0</span><span className="coil">ALARM</span><span className="rail"/></div>
          <p className="monitor-note">Highlighted rungs show live logical power flow. The monitor is read-only; outputs cannot be forced.</p>
        </div>}

        {view === "fbd" && <div className="fbd-monitor"><div className={`fbd-block ${!hasFault ? "active" : "fault"}`}><strong>AND</strong><span>E-Stop OK</span><span>Permissive</span></div><span className="signal-arrow">→</span><div className={`fbd-block ${isRunning ? "active" : ""}`}><strong>SR</strong><span>Start / Stop</span><span>Auto Mode</span></div><span className="signal-arrow">→</span><div className={`fbd-block ${hasFault ? "fault" : "active"}`}><strong>OUTPUT</strong><span>Motor / Valve</span><span>{hasFault ? "Inhibited" : isRunning ? "Energized" : "Ready"}</span></div></div>}

        {view === "io" && <div className="io-monitor"><div><h3>Digital Inputs</h3>{inputs.map(([address,name,value])=><article key={address}><code>{address}</code><span>{name}</span><b className={value ? "io-on" : "io-off"}>{value ? "ON" : "OFF"}</b></article>)}</div><div><h3>Digital Outputs</h3>{outputs.map(([address,name,value])=><article key={address}><code>{address}</code><span>{name}</span><b className={value ? "io-on" : "io-off"}>{value ? "ON" : "OFF"}</b></article>)}</div></div>}

        {view === "alarms" && <div className="automation-alarm-list">{activeFaults.map((item) => <article key={item.code} className="automation-alarm-card"><div><strong>{item.faultCode}</strong><span>{item.area}</span><em>{acknowledged.includes(item.code) ? "Acknowledged" : "Active"}</em></div><p>{item.faultMessage}</p><div className="button-row"><button className="button secondary" onClick={() => setSelectedCode(item.code)}>Investigate</button><button className="button secondary" onClick={() => setAcknowledged((current) => current.includes(item.code) ? current : [...current,item.code])}>Acknowledge</button></div></article>)}{!activeFaults.length && <p className="empty-state">No active automation alarms.</p>}</div>}

        {view === "faceplate" && <div className="automation-faceplate"><header><div><span>Equipment</span><strong>{selected.code}</strong></div><StatusBadge label={selected.status} state={hasFault ? "warning" : "success"}/></header><div className="faceplate-grid"><article><span>Controller</span><strong>{selected.controller}</strong></article><article><span>Mode</span><strong>{selected.mode}</strong></article><article><span>{selected.metricLabel}</span><strong>{selected.metricValue}</strong></article><article><span>Fault</span><strong>{selected.faultCode ?? "None"}</strong></article></div><div className="signal-chain"><span>Sensor</span><b>→</b><span>PLC</span><b>→</b><span>Logic</span><b>→</b><span>Output</span><b>→</b><span>Equipment</span></div></div>}

        {view === "training" && <div className="automation-training"><h3>Scenario: Trace the Active Interlock</h3><p>{hasFault ? `Locate ${selected.faultCode} on ${selected.controller}, identify the inhibited output, then return to ${selected.area} for reset.` : "No active fault exists. Use the signal chain to identify which permissives would prevent a start command."}</p><ol><li className={trainingStep > 0 ? "complete" : ""}>Select the affected PLC.</li><li className={trainingStep > 1 ? "complete" : ""}>Open ladder or FBD view.</li><li className={trainingStep > 2 ? "complete" : ""}>Identify the failed permissive.</li><li className={trainingStep > 3 ? "complete" : ""}>Navigate to the owning process.</li></ol><div className="button-row"><button className="button primary" onClick={() => setTrainingStep((step) => Math.min(4,step+1))}>Complete Step</button><button className="button secondary" onClick={() => setTrainingStep(0)}>Reset Scenario</button></div><small>Progress: {trainingStep}/4 · Accuracy: {trainingStep ? "100%" : "Not started"}</small></div>}
      </SectionCard>
    </div>
  </div>;
}
