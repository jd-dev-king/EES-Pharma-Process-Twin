import { memo, useMemo, useState } from "react";

interface CipSummary { assetCode: string; phase: string; progress: number; status: string; faultCode?: string | null; }
interface Props {
  energyKw: number; waterLiters: number; carbonKg: number; bulkInventoryKg: number; purifiedWaterKg: number;
  cipRuns: CipSummary[]; equipment: { activeMix: number; activePackaging: number; activeCip: number };
  availabilityPercent: number; downtimeMinutes: number; onNavigate: (zone: string) => void;
}
type View = "overview" | "utilities" | "cip" | "recommendations";
const clamp=(v:number)=>Math.max(0,Math.min(100,v));
export const SustainabilityCenter=memo(function SustainabilityCenter(p:Props){
  const [view,setView]=useState<View>("overview");
  const score=useMemo(()=>clamp(Math.round(96-p.energyKw*.12-p.waterLiters/7000-p.downtimeMinutes*.08)),[p.energyKw,p.waterLiters,p.downtimeMinutes]);
  const intensity=Math.round((p.energyKw/Math.max(1,p.bulkInventoryKg/1000))*10)/10;
  const cipEfficiency=p.cipRuns.length?Math.round(p.cipRuns.reduce((s,r)=>s+Number(r.progress||0),0)/p.cipRuns.length):100;
  const recs=[
    p.equipment.activeCip>1?"Stagger concurrent CIP cycles to reduce peak utility demand.":"CIP demand is within the preferred operating window.",
    p.energyKw>55?"Shift noncritical cleaning and charging tasks away from the current peak.":"Electrical demand is below the simulated peak threshold.",
    p.purifiedWaterKg<5000?"Review purified-water inventory before scheduling additional batches.":"Purified-water inventory supports current production demand.",
    p.downtimeMinutes>20?"Address packaging downtime to reduce energy consumed per released unit.":"Downtime-related resource loss is controlled.",
  ];
  return <section className="zone-content sustainability-shell">
    <div className="sustainability-hero"><div><span className="eyebrow">Enterprise Resource Intelligence</span><h1>Energy, Sustainability & Resource Optimization</h1><p>Read-only utility and sustainability indicators derived from live plant operations.</p></div><div className={`sustainability-score ${score>=80?"good":"warning"}`}><strong>{score}</strong><span>Resource score</span></div></div>
    <div className="sustainability-kpis">
      <article><span>Plant Demand</span><strong>{p.energyKw} kW</strong><small>{intensity} kW/t inventory</small></article>
      <article><span>Water Use</span><strong>{p.waterLiters.toLocaleString()} L</strong><small>Current simulation window</small></article>
      <article><span>Carbon Estimate</span><strong>{p.carbonKg} kg CO₂e</strong><small>Illustrative factor</small></article>
      <article><span>CIP Efficiency</span><strong>{cipEfficiency}%</strong><small>{p.equipment.activeCip} active cycles</small></article>
      <article><span>Availability</span><strong>{p.availabilityPercent.toFixed(1)}%</strong><small>{p.downtimeMinutes} min downtime</small></article>
    </div>
    <div className="sustainability-tabs">{(["overview","utilities","cip","recommendations"] as View[]).map(x=><button key={x} className={view===x?"active":""} onClick={()=>setView(x)}>{x}</button>)}</div>
    {view==="overview"&&<div className="sustainability-grid"><article className="sustainability-panel"><h3>Resource Balance</h3><div className="resource-bars"><label>Energy efficiency <progress value={score} max={100}/><strong>{score}%</strong></label><label>Water reserve <progress value={clamp(p.purifiedWaterKg/150)} max={100}/><strong>{Math.round(p.purifiedWaterKg).toLocaleString()} kg</strong></label><label>Bulk inventory <progress value={clamp(p.bulkInventoryKg/500)} max={100}/><strong>{Math.round(p.bulkInventoryKg).toLocaleString()} kg</strong></label></div></article><article className="sustainability-panel"><h3>Active Utility Consumers</h3><div className="utility-cards"><button onClick={()=>p.onNavigate("mixing")}><strong>{p.equipment.activeMix}</strong><span>Mix systems</span></button><button onClick={()=>p.onNavigate("packaging")}><strong>{p.equipment.activePackaging}</strong><span>Packaging lines</span></button><button onClick={()=>p.onNavigate("lean")}><strong>{p.equipment.activeCip}</strong><span>CIP cycles</span></button></div></article></div>}
    {view==="utilities"&&<div className="sustainability-panel"><h3>Utility Consumption Model</h3><div className="utility-ledger"><article><span>Base facility load</span><strong>18 kW</strong></article><article><span>Mixing demand</span><strong>{p.equipment.activeMix*14} kW</strong></article><article><span>Packaging demand</span><strong>{p.equipment.activePackaging*11} kW</strong></article><article><span>CIP demand</span><strong>{p.equipment.activeCip*9} kW</strong></article></div><p className="sustainability-note">Values are deterministic simulation estimates for training and portfolio demonstration, not validated metering data.</p></div>}
    {view==="cip"&&<div className="sustainability-panel"><h3>CIP Water & Recovery View</h3><div className="cip-resource-list">{p.cipRuns.length?p.cipRuns.map(r=><article key={`${r.assetCode}-${r.phase}`}><div><strong>{r.assetCode}</strong><span>{r.phase} · {r.status}</span></div><progress value={r.progress} max={100}/><small>{r.faultCode?`Fault ${r.faultCode}`:"Sequence normal"}</small></article>):<p>No CIP cycles are currently recorded.</p>}</div></div>}
    {view==="recommendations"&&<div className="sustainability-panel"><h3>Optimization Recommendations</h3><div className="sustainability-recommendations">{recs.map((r,i)=><article key={r}><span>{i+1}</span><p>{r}</p></article>)}</div></div>}
  </section>;
});
