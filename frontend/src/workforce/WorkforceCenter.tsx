import { memo, useMemo, useState } from "react";

interface TrainingSessionSummary {
  sessionId: string;
  role: string;
  difficulty: string;
  status: string;
  score: number;
  createdAt: string;
}

interface WorkforceMember {
  id: string;
  name: string;
  department: string;
  role: string;
  shift: string;
  certifications: string[];
  assignedZones: string[];
  readiness: number;
}

interface Props {
  roles: string[];
  activeSession: TrainingSessionSummary | null;
  activeProductionOrders: number;
  openAlerts: number;
  openWorkOrders: number;
  qaBacklog: number;
  onNavigate: (zone: string) => void;
}

type View = "overview" | "skills" | "training" | "coverage";

const workforce: WorkforceMember[] = [
  { id: "E-101", name: "Avery Morgan", department: "Office", role: "Production Scheduler", shift: "Day", certifications: ["cGMP", "ERP Scheduling", "Deviation Awareness"], assignedZones: ["office"], readiness: 96 },
  { id: "E-112", name: "Jordan Lee", department: "Warehouse", role: "Warehouse Operator", shift: "Day", certifications: ["cGMP", "FEFO", "Powered Industrial Truck"], assignedZones: ["warehouse", "bulk"], readiness: 92 },
  { id: "E-118", name: "Morgan Patel", department: "Weighing", role: "Weigh Technician", shift: "Day", certifications: ["cGMP", "Scale Verification", "Barcode Control"], assignedZones: ["weighing"], readiness: 94 },
  { id: "E-124", name: "Taylor Brooks", department: "Manufacturing", role: "Mix Operator", shift: "Day", certifications: ["cGMP", "Batch Execution", "Bulk Transfer", "CIP Awareness"], assignedZones: ["mixing", "bulk"], readiness: 89 },
  { id: "E-131", name: "Riley Chen", department: "Quality", role: "QA Specialist", shift: "Day", certifications: ["cGMP", "LIMS", "Batch Disposition", "Data Integrity"], assignedZones: ["quality", "compliance"], readiness: 97 },
  { id: "E-139", name: "Casey Williams", department: "Packaging", role: "Packaging Operator", shift: "Evening", certifications: ["cGMP", "Line Clearance", "Jam Recovery"], assignedZones: ["packaging"], readiness: 87 },
  { id: "E-145", name: "Drew Thompson", department: "Maintenance", role: "Automation Technician", shift: "Day", certifications: ["LOTO", "PLC Diagnostics", "CIP Recovery", "Electrical Safety"], assignedZones: ["automation", "lean"], readiness: 91 },
  { id: "E-152", name: "Skyler Davis", department: "Shipping", role: "Shipping Coordinator", shift: "Day", certifications: ["cGMP", "BOL Verification", "Dock Safety"], assignedZones: ["shipping", "warehouse"], readiness: 90 },
];

const requiredSkills: Record<string, string[]> = {
  Office: ["cGMP", "ERP Scheduling", "Deviation Awareness"],
  Warehouse: ["cGMP", "FEFO", "Powered Industrial Truck"],
  Weighing: ["cGMP", "Scale Verification", "Barcode Control"],
  Manufacturing: ["cGMP", "Batch Execution", "Bulk Transfer", "CIP Awareness"],
  Quality: ["cGMP", "LIMS", "Batch Disposition", "Data Integrity"],
  Packaging: ["cGMP", "Line Clearance", "Jam Recovery"],
  Maintenance: ["LOTO", "PLC Diagnostics", "CIP Recovery", "Electrical Safety"],
  Shipping: ["cGMP", "BOL Verification", "Dock Safety"],
};

export const WorkforceCenter = memo(function WorkforceCenter(props: Props) {
  const [view, setView] = useState<View>("overview");
  const [department, setDepartment] = useState("All");
  const [selectedId, setSelectedId] = useState(workforce[0].id);

  const filtered = useMemo(
    () => department === "All" ? workforce : workforce.filter((member) => member.department === department),
    [department],
  );
  const selected = workforce.find((member) => member.id === selectedId) ?? workforce[0];
  const avgReadiness = Math.round(workforce.reduce((sum, member) => sum + member.readiness, 0) / workforce.length);
  const readyCount = workforce.filter((member) => member.readiness >= 90).length;
  const skillGaps = workforce.reduce((count, member) => {
    const required = requiredSkills[member.department] ?? [];
    return count + required.filter((skill) => !member.certifications.includes(skill)).length;
  }, 0);
  const departments = ["All", ...Array.from(new Set(workforce.map((member) => member.department)))];
  const workloadRisk = props.activeProductionOrders + props.openAlerts + props.openWorkOrders + props.qaBacklog;

  return (
    <section className="zone-content workforce-shell">
      <div className="workforce-hero">
        <div>
          <span className="eyebrow">People, Capability & Qualification</span>
          <h1>Workforce, Training & Skills Matrix</h1>
          <p>Role readiness, certification coverage, training status, and operational staffing context across the simulated plant.</p>
        </div>
        <div className={`workforce-score ${avgReadiness >= 90 ? "good" : "warning"}`}>
          <strong>{avgReadiness}%</strong>
          <span>Plant readiness</span>
        </div>
      </div>

      <div className="workforce-kpis">
        <article><span>Qualified Personnel</span><strong>{readyCount}/{workforce.length}</strong><small>Readiness ≥ 90%</small></article>
        <article><span>Skill Gaps</span><strong>{skillGaps}</strong><small>Required competencies</small></article>
        <article><span>Training Roles</span><strong>{props.roles.length}</strong><small>Configured curricula</small></article>
        <article><span>Operational Load</span><strong>{workloadRisk}</strong><small>POs, alerts, WOs, QA queue</small></article>
        <article><span>Active Session</span><strong>{props.activeSession ? props.activeSession.score + "%" : "None"}</strong><small>{props.activeSession?.role ?? "No training underway"}</small></article>
      </div>

      <div className="workforce-tabs">
        {(["overview", "skills", "training", "coverage"] as View[]).map((item) => (
          <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}</button>
        ))}
      </div>

      {view === "overview" && (
        <div className="workforce-grid">
          <article className="workforce-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Personnel Roster</span><h3>Role Readiness</h3></div>
              <select value={department} onChange={(event) => setDepartment(event.target.value)}>{departments.map((item) => <option key={item}>{item}</option>)}</select>
            </div>
            <div className="workforce-roster">
              {filtered.map((member) => (
                <button key={member.id} className={member.id === selected.id ? "selected" : ""} onClick={() => setSelectedId(member.id)}>
                  <div><strong>{member.name}</strong><span>{member.role} · {member.shift}</span></div>
                  <em>{member.readiness}%</em>
                  <progress value={member.readiness} max={100} />
                </button>
              ))}
            </div>
          </article>
          <article className="workforce-panel">
            <span className="eyebrow">Personnel Faceplate</span><h3>{selected.name}</h3>
            <div className="workforce-detail-grid">
              <article><span>Employee</span><strong>{selected.id}</strong></article>
              <article><span>Department</span><strong>{selected.department}</strong></article>
              <article><span>Role</span><strong>{selected.role}</strong></article>
              <article><span>Shift</span><strong>{selected.shift}</strong></article>
            </div>
            <h4>Current Certifications</h4>
            <div className="certification-chips">{selected.certifications.map((item) => <span key={item}>{item}</span>)}</div>
            <h4>Authorized Zones</h4>
            <div className="workforce-zone-links">{selected.assignedZones.map((zone) => <button key={zone} onClick={() => props.onNavigate(zone)}>{zone}</button>)}</div>
          </article>
        </div>
      )}

      {view === "skills" && (
        <div className="workforce-panel">
          <h3>Plant Skills Matrix</h3>
          <div className="skills-table-wrap"><table><thead><tr><th>Department</th><th>Employee</th><th>Role</th><th>Required Skills</th><th>Readiness</th></tr></thead><tbody>{workforce.map((member) => <tr key={member.id}><td>{member.department}</td><td>{member.name}</td><td>{member.role}</td><td><div className="skill-cell">{(requiredSkills[member.department] ?? []).map((skill) => <span key={skill} className={member.certifications.includes(skill) ? "met" : "gap"}>{skill}</span>)}</div></td><td><strong>{member.readiness}%</strong></td></tr>)}</tbody></table></div>
        </div>
      )}

      {view === "training" && (
        <div className="workforce-grid">
          <article className="workforce-panel"><h3>Training Curriculum</h3><div className="training-role-list">{props.roles.length ? props.roles.map((role) => <article key={role}><strong>{role}</strong><span>Beginner · Intermediate · Advanced</span><button onClick={() => props.onNavigate("office")}>Open Training Console</button></article>) : <p>No role curricula loaded.</p>}</div></article>
          <article className="workforce-panel"><h3>Current Training Session</h3>{props.activeSession ? <div className="active-training-card"><strong>{props.activeSession.role}</strong><span>{props.activeSession.difficulty}</span><progress value={props.activeSession.score} max={100}/><small>{props.activeSession.status} · {props.activeSession.sessionId}</small></div> : <p>No active session. Start one from Office & Production Scheduling.</p>}</article>
        </div>
      )}

      {view === "coverage" && (
        <div className="workforce-panel"><h3>Department Coverage & Staffing Risk</h3><div className="coverage-grid">{Object.keys(requiredSkills).map((name) => { const members=workforce.filter((member)=>member.department===name); const coverage=members.length ? Math.round(members.reduce((sum, member)=>sum+member.readiness,0)/members.length) : 0; return <article key={name}><div><strong>{name}</strong><span>{members.length} assigned</span></div><progress value={coverage} max={100}/><small>{coverage}% qualification coverage</small></article>; })}</div><p className="workforce-note">Coverage is a deterministic training simulation and does not represent a validated labor-management or learning-management system.</p></div>
      )}
    </section>
  );
});
