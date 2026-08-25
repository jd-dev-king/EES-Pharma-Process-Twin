import { useEffect, useMemo, useState } from "react";
import type * as T from "../types";
import { api } from "../lib/api";

interface Props {
  security: T.SecurityStatus | null;
  onOpenParking: () => void;
  onReturn: () => void;
}

type SecurityView =
  | "access"
  | "training"
  | "parking"
  | "events";

interface OverflowParkingSession {
  overflow_session_id?: number;
  vehicle_identifier: string;
  occupant_type: string;
  space_number?: string;
  overflow_space_number?: string;
  entry_time: string;
  employee_number?: string | null;
  display_name?: string | null;
  visitor_code?: string | null;
}

function overflowIdentity(item: OverflowParkingSession) {
  return (
    item.display_name ??
    item.employee_number ??
    item.visitor_code ??
    item.vehicle_identifier
  );
}

function overflowSpace(item: OverflowParkingSession) {
  return (
    item.space_number ??
    item.overflow_space_number ??
    "OVERFLOW"
  );
}

function statusClass(value?: string | null) {
  const normalized = String(value ?? "").toLowerCase();

  if (
    normalized === "authorized" ||
    normalized === "qualified" ||
    normalized === "current" ||
    normalized === "active"
  ) {
    return "authorized";
  }

  if (
    normalized === "denied" ||
    normalized === "expired" ||
    normalized === "missing" ||
    normalized === "inactive"
  ) {
    return "denied";
  }

  return "pending";
}

function formatTime(value?: string | null) {
  if (!value) return "—";

  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);

  if (Number.isNaN(hour)) return value;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

export function SecurityCommandCenter({
  security,
  onOpenParking,
  onReturn,
}: Props) {
  const parkingOnline = Boolean(security?.available);

  const overflowSessions =
    ((security?.overflow_sessions ?? []) as OverflowParkingSession[]);

  const securedOccupants =
    security?.active_occupants ?? [];

  const allParkingOccupants =
    securedOccupants.length + overflowSessions.length;

  const [view, setView] =
    useState<SecurityView>("access");

  const [summary, setSummary] =
    useState<T.SecuritySummary | null>(null);

  const [employees, setEmployees] =
    useState<T.SecurityEmployee[]>([]);

  const [selectedId, setSelectedId] =
    useState<number | null>(null);

  const [detail, setDetail] =
    useState<T.SecurityEmployeeDetail | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [reevaluating, setReevaluating] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const loadSecurity = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryResult, employeeResult] =
        await Promise.all([
          api.getSecuritySummary(),
          api.getSecurityEmployees(),
        ]);

      setSummary(summaryResult);

      const roster =
        employeeResult.employees ?? [];

      setEmployees(roster);

      setSelectedId((current) => {
        if (
          current !== null &&
          roster.some(
            (item) =>
              item.employee_id === current
          )
        ) {
          return current;
        }

        return roster.length
          ? roster[0].employee_id
          : null;
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Security data could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  };

  const loadEmployee = async (
    employeeId: number
  ) => {
    setDetailLoading(true);
    setError(null);

    try {
      const result =
        await api.getSecurityEmployee(
          employeeId
        );

      setDetail(result);
    } catch (err) {
      setDetail(null);

      setError(
        err instanceof Error
          ? err.message
          : "Employee security record could not be loaded."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadSecurity();
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }

    void loadEmployee(selectedId);
  }, [selectedId]);

  const selectedRosterEmployee =
    useMemo(
      () =>
        employees.find(
          (employee) =>
            employee.employee_id === selectedId
        ) ?? null,
      [employees, selectedId]
    );

  const controlledZones =
    detail?.zones.filter(
      (zone) =>
        zone.zone_code === "GREY" ||
        zone.zone_code === "WHITE"
    ) ?? [];

  const generalZones =
    detail?.zones.filter(
      (zone) =>
        zone.zone_code !== "GREY" &&
        zone.zone_code !== "WHITE"
    ) ?? [];

  const reevaluate = async () => {
    if (selectedId === null) return;

    setReevaluating(true);
    setError(null);

    try {
      const result =
        await api.reevaluateSecurityEmployee(
          selectedId
        );

      setDetail(result);

      const [summaryResult, employeeResult] =
        await Promise.all([
          api.getSecuritySummary(),
          api.getSecurityEmployees(),
        ]);

      setSummary(summaryResult);
      setEmployees(
        employeeResult.employees ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Access re-evaluation failed."
      );
    } finally {
      setReevaluating(false);
    }
  };

  const securityOnline =
    !loading &&
    !error &&
    summary !== null;

  return (
    <div className="security-command-shell">
      <section className="security-command-hero">
        <div>
          <p className="eyebrow">
            Enterprise Command Center ·
            Facility Security
          </p>

          <h1>Security Command Center</h1>

          <p>
            Workforce identity, training,
            qualification and controlled-zone
            badge authorization from the EES
            Data Moon, with live Pharma parking
            and gate oversight.
          </p>

          <div className="button-row">
            <button
              className="button primary"
              onClick={onOpenParking}
            >
              Open Parking Digital Twin
            </button>

            <button
              className="button secondary"
              onClick={onReturn}
            >
              Return to Enterprise Command Center
            </button>

            <button
              className="button secondary"
              onClick={() => void loadSecurity()}
              disabled={loading}
            >
              {loading
                ? "Refreshing..."
                : "Refresh Security"}
            </button>
          </div>
        </div>

        <div
          className={`security-status-orb ${
            securityOnline
              ? "online"
              : "offline"
          }`}
        >
          <span>Facility Access</span>

          <strong>
            {securityOnline
              ? "ONLINE"
              : "OFFLINE"}
          </strong>

          <small>
            {securityOnline
              ? "workforce + security synchronized"
              : "Security data unavailable"}
          </small>
        </div>
      </section>

      {error && (
        <section className="security-command-panel">
          <p className="empty-state">
            {error}
          </p>
        </section>
      )}

      <section className="security-kpi-grid">
        <article>
          <span>Active Workforce</span>
          <strong>
            {summary?.active_employees ?? "—"}
          </strong>
          <small>
            Pharma workforce eligible for access
          </small>
        </article>

        <article>
          <span>Controlled Authorized</span>
          <strong>
            {summary?.controlled_authorized ??
              "—"}
          </strong>
          <small>
            Grey / White authorizations
          </small>
        </article>

        <article>
          <span>Controlled Denied</span>
          <strong>
            {summary?.controlled_denied ?? "—"}
          </strong>
          <small>
            Training or role restrictions
          </small>
        </article>

        <article>
          <span>Leave</span>
          <strong>
            {summary?.on_leave ?? "—"}
          </strong>
          <small>
            Normal badge access disabled
          </small>
        </article>

        <article>
          <span>Inactive</span>
          <strong>
            {summary?.inactive ?? "—"}
          </strong>
          <small>
            Workforce access disabled
          </small>
        </article>

        <article>
          <span>Secured Lot</span>
          <strong>
            {parkingOnline
              ? `${security!.secured_occupied_spaces}/${security!.secured_total_spaces}`
              : "—/70"}
          </strong>
          <small>
            {parkingOnline
              ? `${security!.secured_available_spaces} spaces free`
              : "Parking unavailable"}
          </small>
        </article>

        <article>
          <span>Overflow Lot</span>
          <strong>
            {parkingOnline
              ? `${security!.overflow_occupied_spaces}/${security!.overflow_total_spaces}`
              : "—/30"}
          </strong>
          <small>
            {parkingOnline
              ? `${security!.overflow_available_spaces} spaces free`
              : "Overflow unavailable"}
          </small>
        </article>

        <article>
          <span>Total Parked</span>
          <strong>
            {parkingOnline
              ? `${security!.total_parked}/${security!.total_parking_capacity}`
              : "—/100"}
          </strong>
          <small>
            Secured + overflow
          </small>
        </article>

        <article>
          <span>Employees On Site</span>
          <strong>
            {security?.employees ?? 0}
          </strong>
          <small>
            Active employee parking
          </small>
        </article>

        <article>
          <span>Contractors On Site</span>
          <strong>
            {security?.contractors ?? 0}
          </strong>
          <small>
            Active contractor parking
          </small>
        </article>

        <article>
          <span>Visitors On Site</span>
          <strong>
            {security?.visitors ?? 0}
          </strong>
          <small>
            Active visitor parking
          </small>
        </article>
      </section>

      <div className="security-view-tabs">
        <button
          type="button"
          className={
            view === "access"
              ? "button primary"
              : "button secondary"
          }
          onClick={() => setView("access")}
        >
          Badge Access
        </button>

        <button
          type="button"
          className={
            view === "training"
              ? "button primary"
              : "button secondary"
          }
          onClick={() =>
            setView("training")
          }
        >
          Training & Qualifications
        </button>

        <button
          type="button"
          className={
            view === "parking"
              ? "button primary"
              : "button secondary"
          }
          onClick={() =>
            setView("parking")
          }
        >
          Parking
        </button>

        <button
          type="button"
          className={
            view === "events"
              ? "button primary"
              : "button secondary"
          }
          onClick={() =>
            setView("events")
          }
        >
          Gate Events
        </button>
      </div>

      {(view === "access" ||
        view === "training") && (
        <div className="security-command-grid">
          <section className="security-command-panel">
            <header>
              <div>
                <p className="eyebrow">
                  Pharma Workforce
                </p>
                <h2>Employee Badge Roster</h2>
              </div>
            </header>

            <label
              className="security-employee-select"
            >
              <span>Select Employee</span>

              <select
                value={selectedId ?? ""}
                onChange={(event) =>
                  setSelectedId(
                    Number(event.target.value)
                  )
                }
              >
                {employees.map(
                  (employee) => (
                    <option
                      key={employee.employee_id}
                      value={employee.employee_id}
                    >
                      {employee.display_name} ·{" "}
                      {employee.department_name} ·{" "}
                      {employee.employee_number}
                    </option>
                  )
                )}
              </select>
            </label>

            <div className="security-roster">
              {employees.map(
                (employee) => (
                  <article
                    key={employee.employee_id}
                    className={
                      employee.employee_id ===
                      selectedId
                        ? "selected"
                        : ""
                    }
                    onClick={() =>
                      setSelectedId(
                        employee.employee_id
                      )
                    }
                  >
                    <div>
                      <strong>
                        {employee.display_name}
                      </strong>

                      <span
                        className={statusClass(
                          employee.employment_status
                        )}
                      >
                        {
                          employee.employment_status
                        }
                      </span>
                    </div>

                    <p>
                      {employee.employee_number} ·{" "}
                      {employee.department_name ??
                        "Unassigned"}
                    </p>

                    <small>
                      {employee.role_name ??
                        "No role"}{" "}
                      ·{" "}
                      {employee.shift_name ??
                        "No shift"}
                    </small>

                    <small>
                      {
                        employee.authorized_zones
                      }{" "}
                      authorized ·{" "}
                      {employee.denied_zones} denied
                    </small>
                  </article>
                )
              )}

              {!loading &&
                employees.length === 0 && (
                  <p className="empty-state">
                    No Pharma workforce records
                    available.
                  </p>
                )}
            </div>
          </section>

          <section className="security-command-panel">
            <header>
              <div>
                <p className="eyebrow">
                  Security Faceplate
                </p>

                <h2>
                  {detail?.employee
                    .display_name ??
                    selectedRosterEmployee
                      ?.display_name ??
                    "Select Employee"}
                </h2>
              </div>
            </header>

            {detailLoading && (
              <p className="empty-state">
                Loading employee security
                record...
              </p>
            )}

            {!detailLoading && detail && (
              <>
                <div className="security-detail-grid">
                  <article>
                    <span>Employee</span>
                    <strong>
                      {
                        detail.employee
                          .employee_number
                      }
                    </strong>
                  </article>

                  <article>
                    <span>Department</span>
                    <strong>
                      {detail.employee
                        .department_name ??
                        "Unassigned"}
                    </strong>
                  </article>

                  <article>
                    <span>Role</span>
                    <strong>
                      {detail.employee.role_name ??
                        "Unassigned"}
                    </strong>
                  </article>

                  <article>
                    <span>Shift</span>
                    <strong>
                      {detail.employee
                        .shift_name ?? "—"}
                    </strong>
                  </article>

                  <article>
                    <span>Hours</span>
                    <strong>
                      {formatTime(
                        detail.employee
                          .start_time
                      )}{" "}
                      –{" "}
                      {formatTime(
                        detail.employee.end_time
                      )}
                    </strong>
                  </article>

                  <article>
                    <span>Employment</span>
                    <strong>
                      {
                        detail.employee
                          .employment_type
                      }{" "}
                      ·{" "}
                      {
                        detail.employee
                          .employment_status
                      }
                    </strong>
                  </article>
                </div>

                {view === "access" && (
                  <>
                    <div className="security-section-heading">
                      <div>
                        <p className="eyebrow">
                          Badge Authorization
                        </p>
                        <h3>
                          Controlled Zones
                        </h3>
                      </div>

                      <button
                        type="button"
                        className="button primary"
                        onClick={() =>
                          void reevaluate()
                        }
                        disabled={reevaluating}
                      >
                        {reevaluating
                          ? "Evaluating..."
                          : "Re-evaluate Access"}
                      </button>
                    </div>

                    <div className="security-zone-grid">
                      {controlledZones.map(
                        (zone) => (
                          <article
                            key={zone.zone_id}
                            className={`security-zone-card ${statusClass(
                              zone.authorization_status
                            )}`}
                          >
                            <div>
                              <span>
                                {
                                  zone.zone_code
                                }{" "}
                                ZONE
                              </span>

                              <strong>
                                {
                                  zone.authorization_status
                                }
                              </strong>
                            </div>

                            <h3>
                              {zone.zone_name}
                            </h3>

                            <p>
                              {zone.reason ??
                                "No evaluation reason available."}
                            </p>

                            <small>
                              Source:{" "}
                              {
                                zone.authorization_source
                              }
                            </small>
                          </article>
                        )
                      )}
                    </div>

                    <div className="security-section-heading">
                      <div>
                        <p className="eyebrow">
                          General Facility
                        </p>
                        <h3>
                          Other Zone Access
                        </h3>
                      </div>
                    </div>

                    <div className="security-zone-grid">
                      {generalZones.map(
                        (zone) => (
                          <article
                            key={zone.zone_id}
                            className={`security-zone-card ${statusClass(
                              zone.authorization_status
                            )}`}
                          >
                            <div>
                              <strong>
                                {
                                  zone.zone_code
                                }
                              </strong>

                              <span>
                                {
                                  zone.authorization_status
                                }
                              </span>
                            </div>

                            <p>
                              {zone.reason ??
                                "No evaluation reason available."}
                            </p>
                          </article>
                        )
                      )}
                    </div>
                  </>
                )}

                {view === "training" && (
                  <>
                    <div className="security-section-heading">
                      <div>
                        <p className="eyebrow">
                          Pharma Training
                        </p>

                        <h3>
                          Required Training
                        </h3>
                      </div>
                    </div>

                    <div className="security-training-list">
                      {detail.training.map(
                        (record) => (
                          <article
                            key={record.course_id}
                          >
                            <div>
                              <strong>
                                {
                                  record.course_code
                                }{" "}
                                ·{" "}
                                {
                                  record.course_name
                                }
                              </strong>

                              <span
                                className={statusClass(
                                  record.effective_status
                                )}
                              >
                                {
                                  record.effective_status
                                }
                              </span>
                            </div>

                            <p>
                              {record.training_category ??
                                "Training"}
                              {record.gmp_relevant
                                ? " · GMP relevant"
                                : ""}
                            </p>

                            <small>
                              Completed:{" "}
                              {formatDate(
                                record.completed_at
                              )}{" "}
                              · Expires:{" "}
                              {formatDate(
                                record.expires_at
                              )}
                            </small>
                          </article>
                        )
                      )}

                      {!detail.training
                        .length && (
                        <p className="empty-state">
                          No role-based training
                          requirements.
                        </p>
                      )}
                    </div>

                    <div className="security-section-heading">
                      <div>
                        <p className="eyebrow">
                          GMP Qualification
                        </p>

                        <h3>
                          Controlled-Area
                          Qualifications
                        </h3>
                      </div>
                    </div>

                    <div className="security-zone-grid">
                      {detail.qualifications.map(
                        (qualification) => (
                          <article
                            key={
                              qualification.qualification_id
                            }
                            className={`security-zone-card ${statusClass(
                              qualification.qualification_status
                            )}`}
                          >
                            <div>
                              <strong>
                                {
                                  qualification.qualification_code
                                }
                              </strong>

                              <span>
                                {qualification.qualification_status ??
                                  "MISSING"}
                              </span>
                            </div>

                            <h3>
                              {
                                qualification.qualification_name
                              }
                            </h3>

                            <p>
                              {qualification.qualification_basis ??
                                "Role qualification requirement"}
                            </p>

                            <small>
                              Expires:{" "}
                              {formatDate(
                                qualification.expires_at
                              )}
                            </small>
                          </article>
                        )
                      )}

                      {!detail.qualifications
                        .length && (
                        <p className="empty-state">
                          No controlled-area GMP
                          qualifications required
                          for this role.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {view === "parking" && (
        <div className="security-command-grid">
          <section className="security-command-panel">
            <header>
              <div>
                <p className="eyebrow">
                  Live Parking Roster
                </p>

                <h2>
                  People & Vehicles On Site
                </h2>

                <small>
                  {parkingOnline
                    ? `${allParkingOccupants} active parking assignment${allParkingOccupants === 1 ? "" : "s"} across secured and overflow lots`
                    : "Parking data unavailable"}
                </small>
              </div>
            </header>

            <div className="security-section-heading">
              <div>
                <p className="eyebrow">
                  Secured Lot
                </p>

                <h3>
                  Main Lot · {security?.secured_occupied_spaces ?? 0}/{security?.secured_total_spaces ?? 70}
                </h3>
              </div>
            </div>

            <div className="security-roster">
              {securedOccupants.map((item) => (
                <article
                  key={`${item.vehicle_identifier}-${item.entry_time}`}
                >
                  <div>
                    <strong>
                      {item.identity}
                    </strong>

                    <span>
                      {item.occupant_type}
                    </span>
                  </div>

                  <p>
                    {item.vehicle_identifier} ·
                    Space {item.space_number}
                  </p>

                  <small>
                    Entered{" "}
                    {new Date(
                      item.entry_time
                    ).toLocaleString()}
                  </small>
                </article>
              ))}

              {parkingOnline &&
                !securedOccupants.length && (
                <p className="empty-state">
                  No active secured-lot sessions.
                </p>
              )}
            </div>

            <div className="security-section-heading">
              <div>
                <p className="eyebrow">
                  Overflow Lot
                </p>

                <h3>
                  O01–O30 · {security?.overflow_occupied_spaces ?? 0}/{security?.overflow_total_spaces ?? 30}
                </h3>
              </div>
            </div>

            <div className="security-roster">
              {overflowSessions.map((item) => (
                <article
                  key={`overflow-${item.overflow_session_id ?? item.vehicle_identifier}-${item.entry_time}`}
                  className="overflow"
                >
                  <div>
                    <strong>
                      {overflowIdentity(item)}
                    </strong>

                    <span>
                      {item.occupant_type}
                    </span>
                  </div>

                  <p>
                    {item.vehicle_identifier} ·
                    Space {overflowSpace(item)}
                  </p>

                  <small>
                    Overflow entry{" "}
                    {new Date(
                      item.entry_time
                    ).toLocaleString()}
                  </small>
                </article>
              ))}

              {parkingOnline &&
                !overflowSessions.length && (
                <p className="empty-state">
                  No active overflow sessions.
                </p>
              )}

              {!parkingOnline && (
                <p className="empty-state">
                  Parking data is currently
                  unavailable.
                </p>
              )}
            </div>
          </section>

          <section className="security-command-panel">
            <header>
              <div>
                <p className="eyebrow">
                  Parking Operations
                </p>

                <h2>
                  Current Facility Occupancy
                </h2>
              </div>
            </header>

            <div className="security-detail-grid">
              <article>
                <span>Secured</span>
                <strong>
                  {security?.secured_occupied_spaces ?? 0}/
                  {security?.secured_total_spaces ?? 70}
                </strong>
              </article>

              <article>
                <span>Overflow</span>
                <strong>
                  {security?.overflow_occupied_spaces ?? 0}/
                  {security?.overflow_total_spaces ?? 30}
                </strong>
              </article>

              <article>
                <span>Total Parked</span>
                <strong>
                  {security?.total_parked ?? 0}/
                  {security?.total_parking_capacity ?? 100}
                </strong>
              </article>

              <article>
                <span>Total Available</span>
                <strong>
                  {security?.total_available_spaces ?? 100}
                </strong>
              </article>

              <article>
                <span>Employees</span>
                <strong>
                  {security?.employees ?? 0}
                </strong>
              </article>

              <article>
                <span>Contractors</span>
                <strong>
                  {security?.contractors ?? 0}
                </strong>
              </article>

              <article>
                <span>Visitors</span>
                <strong>
                  {security?.visitors ?? 0}
                </strong>
              </article>

              <article>
                <span>Pending Reviews</span>
                <strong>
                  {security?.pending_reviews ?? 0}
                </strong>
              </article>

              <article>
                <span>Visitor IDs</span>
                <strong>
                  {security?.visitor_ids_available ?? 0}
                </strong>
              </article>
            </div>

            <div className="security-section-heading">
              <div>
                <p className="eyebrow">
                  Accelerated Simulation
                </p>

                <h3>
                  Parking Auto Run
                </h3>
              </div>
            </div>

            <div className="security-detail-grid">
              <article>
                <span>State</span>
                <strong>
                  {security?.auto_run_active
                    ? "ACTIVE"
                    : security?.auto_run_phase === "COMPLETE"
                      ? "COMPLETE"
                      : "IDLE"}
                </strong>
              </article>

              <article>
                <span>Phase</span>
                <strong>
                  {(security?.auto_run_phase ?? "IDLE")
                    .replaceAll("_", " ")}
                </strong>
              </article>

              <article>
                <span>Simulation Clock</span>
                <strong>
                  {security?.sim_day && security?.sim_time
                    ? `${security.sim_day} ${security.sim_time}`
                    : "—"}
                </strong>
              </article>
            </div>

            {(security?.current_event ||
              security?.next_event) && (
              <div className="security-event-list">
                {security.current_event && (
                  <article className="security-event authorized">
                    <div>
                      <strong>Current Parking Event</strong>
                      <p>{security.current_event}</p>
                    </div>
                  </article>
                )}

                {security.next_event && (
                  <article className="security-event pending">
                    <div>
                      <strong>Next Parking Event</strong>
                      <p>{security.next_event}</p>
                    </div>
                  </article>
                )}
              </div>
            )}

            <button
              type="button"
              className="button primary"
              onClick={onOpenParking}
            >
              Open Parking Digital Twin
            </button>
          </section>
        </div>
      )}

      {view === "events" && (
        <section className="security-command-panel">
          <header>
            <div>
              <p className="eyebrow">
                Access Event Stream
              </p>

              <h2>Recent Gate Activity</h2>
            </div>
          </header>

          <div className="security-event-list">
            {(security?.recent_events ??
              []).map((event) => (
              <article
                key={event.event_id}
                className={`security-event ${String(
                  event.access_result
                ).toLowerCase()}`}
              >
                <time>
                  {new Date(
                    event.event_time
                  ).toLocaleTimeString()}
                </time>

                <div>
                  <strong>
                    {String(event.gate_id).includes("OVERFLOW") ||
                    String(event.event_type).includes("OVERFLOW")
                      ? "OVERFLOW · "
                      : ""}
                    {event.gate_id} ·{" "}
                    {event.access_result}
                  </strong>

                  <p>
                    {event.vehicle_identifier ??
                      "Unknown vehicle"}{" "}
                    · {event.event_type}
                  </p>

                  <small>
                    {event.reason ??
                      "No additional reason"}
                  </small>
                </div>
              </article>
            ))}

            {parkingOnline &&
              !security?.recent_events
                .length && (
                <p className="empty-state">
                  No access events recorded yet.
                </p>
              )}
          </div>
        </section>
      )}
    </div>
  );
}