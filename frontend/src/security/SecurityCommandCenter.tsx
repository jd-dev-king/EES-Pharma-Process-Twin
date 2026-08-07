import type * as T from "../types";

interface Props {
  security: T.SecurityStatus | null;
  onOpenParking: () => void;
  onReturn: () => void;
}

export function SecurityCommandCenter({ security, onOpenParking, onReturn }: Props) {
  const online = Boolean(security?.available);
  return (
    <div className="security-command-shell">
      <section className="security-command-hero">
        <div>
          <p className="eyebrow">Enterprise Command Center · Facility Security</p>
          <h1>Security Command Center</h1>
          <p>Read-only enterprise oversight of the Pharma employee parking lot, access reviews, active occupants, and recent gate events.</p>
          <div className="button-row">
            <button className="button primary" onClick={onOpenParking}>Open Parking Digital Twin</button>
            <button className="button secondary" onClick={onReturn}>Return to Enterprise Command Center</button>
          </div>
        </div>
        <div className={`security-status-orb ${online ? "online" : "offline"}`}>
          <span>Facility Access</span><strong>{online ? "ONLINE" : "OFFLINE"}</strong><small>{online ? "parking_access synchronized" : "Process Twin remains available"}</small>
        </div>
      </section>

      <section className="security-kpi-grid">
        <article><span>Lot Occupancy</span><strong>{online ? `${security!.occupied_spaces}/${security!.total_spaces}` : "—"}</strong><small>{online ? `${security!.available_spaces} spaces free` : "Parking unavailable"}</small></article>
        <article><span>Employees On Site</span><strong>{security?.employees ?? 0}</strong><small>Active employee sessions</small></article>
        <article><span>Visitors On Site</span><strong>{security?.visitors ?? 0}</strong><small>Active visitor sessions</small></article>
        <article><span>Pending Reviews</span><strong>{security?.pending_reviews ?? 0}</strong><small>Security decisions required</small></article>
        <article><span>Approved Today</span><strong>{security?.approved_today ?? 0}</strong><small>Security approvals</small></article>
        <article><span>Denied Today</span><strong>{security?.denied_today ?? 0}</strong><small>Denied access requests</small></article>
        <article><span>Visitor IDs Available</span><strong>{security?.visitor_ids_available ?? 0}</strong><small>Reusable temporary IDs</small></article>
        <article><span>Occupancy</span><strong>{security?.occupancy_percent ?? 0}%</strong><small>Current lot utilization</small></article>
      </section>

      <div className="security-command-grid">
        <section className="security-command-panel">
          <header><div><p className="eyebrow">Live Roster</p><h2>People & Vehicles On Site</h2></div></header>
          <div className="security-roster">
            {(security?.active_occupants ?? []).map((item) => (
              <article key={`${item.vehicle_identifier}-${item.entry_time}`}>
                <div><strong>{item.identity}</strong><span>{item.occupant_type}</span></div>
                <p>{item.vehicle_identifier} · Space {item.space_number}</p>
                <small>Entered {new Date(item.entry_time).toLocaleString()}</small>
              </article>
            ))}
            {online && !(security?.active_occupants.length) && <p className="empty-state">No active parking sessions.</p>}
            {!online && <p className="empty-state">Parking data is currently unavailable.</p>}
          </div>
        </section>

        <section className="security-command-panel">
          <header><div><p className="eyebrow">Access Event Stream</p><h2>Recent Gate Activity</h2></div></header>
          <div className="security-event-list">
            {(security?.recent_events ?? []).map((event) => (
              <article key={event.event_id} className={`security-event ${String(event.access_result).toLowerCase()}`}>
                <time>{new Date(event.event_time).toLocaleTimeString()}</time>
                <div><strong>{event.gate_id} · {event.access_result}</strong><p>{event.vehicle_identifier ?? "Unknown vehicle"} · {event.event_type}</p><small>{event.reason ?? "No additional reason"}</small></div>
              </article>
            ))}
            {online && !(security?.recent_events.length) && <p className="empty-state">No access events recorded yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
