import {
  memo,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "../lib/api";


interface TrainingSessionSummary {
  sessionId: string;
  role: string;
  difficulty: string;
  status: string;
  score: number;
  createdAt: string;
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


interface WorkforceEmployee {
  employee_id: number;
  site_code: string;
  employee_number: string;

  display_name: string;
  first_name: string;
  last_name: string;

  employment_type: string;
  employment_status: string;
  commute_mode: string;

  department_code: string | null;
  department_name: string | null;

  role_id: number | null;
  role_code: string | null;
  role_name: string | null;
  role_level: string | null;

  shift_id: number | null;
  shift_code: string | null;
  shift_name: string | null;
  schedule_family: string | null;

  start_time: string | null;
  end_time: string | null;

  crosses_midnight: boolean | null;

  operating_days: number[];

  on_call: boolean | null;
}


interface WorkforceSummary {
  total: number;
  active: number;
  on_leave: number;
  inactive: number;
  permanent: number;
  temporary: number;

  departments: Array<{
    department_name: string;
    headcount: number;
    active: number;
    temporary: number;
  }>;
}


interface TrainingRecord {
  employee_id: number;
  employee_number: string;
  display_name: string;

  department_name: string | null;

  employment_type: string;
  employment_status: string;

  role_code: string | null;
  role_name: string | null;

  course_id: number;
  course_code: string;
  course_name: string;
  training_category: string;

  gmp_relevant: boolean;
  required_for_site_access: boolean;

  validity_days: number | null;

  effective_status: string;
  recorded_status: string | null;

  assigned_at: string | null;
  completed_at: string | null;
  expires_at: string | null;

  completion_score: number | null;
}


interface EmployeeCoverage {
  employee_id: number;
  employee_number: string;
  display_name: string;

  department_name: string | null;

  employment_type: string;
  employment_status: string;

  role_code: string | null;
  role_name: string | null;

  required_courses: number;
  current_courses: number;

  readiness: number;
}


interface DepartmentCoverage {
  department_name: string;

  employees: number;
  active_employees: number;

  readiness: number;
}


type View =
  | "overview"
  | "skills"
  | "training"
  | "coverage";


function formatTime(value: string | null): string {
  if (!value) return "—";

  const parts = value.split(":");

  if (parts.length < 2) {
    return value;
  }

  const hours = Number(parts[0]);
  const minutes = parts[1];

  if (!Number.isFinite(hours)) {
    return value;
  }

  const suffix = hours >= 12 ? "PM" : "AM";

  const hour =
    hours === 0
      ? 12
      : hours > 12
        ? hours - 12
        : hours;

  return `${hour}:${minutes} ${suffix}`;
}


function formatDate(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}


function statusLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .toUpperCase();
}


export const WorkforceCenter = memo(
  function WorkforceCenter(props: Props) {
    const [view, setView] =
      useState<View>("overview");

    const [department, setDepartment] =
      useState("All");

    const [selectedId, setSelectedId] =
      useState<number | null>(null);

    const [employees, setEmployees] =
      useState<WorkforceEmployee[]>([]);

    const [training, setTraining] =
      useState<TrainingRecord[]>([]);

    const [coverage, setCoverage] =
      useState<EmployeeCoverage[]>([]);

    const [departmentCoverage, setDepartmentCoverage] =
      useState<DepartmentCoverage[]>([]);

    const [summary, setSummary] =
      useState<WorkforceSummary | null>(null);

    const [loading, setLoading] =
      useState(true);

    const [error, setError] =
      useState<string | null>(null);


    useEffect(() => {
      let active = true;

      async function loadWorkforce() {
        setLoading(true);
        setError(null);

        try {
          const [
            employeesResponse,
            summaryResponse,
            trainingResponse,
            coverageResponse,
          ] = await Promise.all([
            api.workforceEmployees(),
            api.workforceSummary(),
            api.workforceTraining(),
            api.workforceCoverage(),
          ]);

          if (!active) {
            return;
          }

          setEmployees(
            employeesResponse.employees ?? [],
          );

          setSummary(summaryResponse);

          setTraining(
            trainingResponse.training ?? [],
          );

          setCoverage(
            coverageResponse.employees ?? [],
          );

          setDepartmentCoverage(
            coverageResponse.departments ?? [],
          );
        } catch (loadError) {
          if (!active) {
            return;
          }

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load workforce data.",
          );
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void loadWorkforce();

      return () => {
        active = false;
      };
    }, []);


    useEffect(() => {
      if (
        selectedId === null &&
        employees.length > 0
      ) {
        setSelectedId(
          employees[0].employee_id,
        );
      }
    }, [employees, selectedId]);


    const coverageByEmployee = useMemo(
      () =>
        new Map(
          coverage.map((item) => [
            item.employee_id,
            item,
          ]),
        ),
      [coverage],
    );


    const trainingByEmployee = useMemo(() => {
      const map =
        new Map<number, TrainingRecord[]>();

      training.forEach((record) => {
        const existing =
          map.get(record.employee_id) ?? [];

        existing.push(record);

        map.set(
          record.employee_id,
          existing,
        );
      });

      return map;
    }, [training]);


    const workforce = useMemo(
      () =>
        employees.map((employee) => {
          const readiness =
            coverageByEmployee.get(
              employee.employee_id,
            );

          const employeeTraining =
            trainingByEmployee.get(
              employee.employee_id,
            ) ?? [];

          return {
            ...employee,

            readiness:
              readiness?.readiness ?? 0,

            requiredCourses:
              readiness?.required_courses ?? 0,

            currentCourses:
              readiness?.current_courses ?? 0,

            training:
              employeeTraining,
          };
        }),
      [
        employees,
        coverageByEmployee,
        trainingByEmployee,
      ],
    );


    const departments = useMemo(
      () => [
        "All",
        ...Array.from(
          new Set(
            workforce
              .map(
                (member) =>
                  member.department_name ??
                  "Unassigned",
              )
              .filter(Boolean),
          ),
        ).sort(),
      ],
      [workforce],
    );


    const filtered = useMemo(
      () =>
        department === "All"
          ? workforce
          : workforce.filter(
              (member) =>
                (
                  member.department_name ??
                  "Unassigned"
                ) === department,
            ),
      [department, workforce],
    );


    const selected = useMemo(
      () =>
        workforce.find(
          (member) =>
            member.employee_id ===
            selectedId,
        ) ??
        workforce[0] ??
        null,
      [workforce, selectedId],
    );


    const activeWorkforce = useMemo(
      () =>
        workforce.filter(
          (member) =>
            member.employment_status ===
            "ACTIVE",
        ),
      [workforce],
    );


    const avgReadiness = useMemo(() => {
      if (!activeWorkforce.length) {
        return 0;
      }

      return Math.round(
        activeWorkforce.reduce(
          (sum, member) =>
            sum + member.readiness,
          0,
        ) / activeWorkforce.length,
      );
    }, [activeWorkforce]);


    const fullyCurrent = useMemo(
      () =>
        activeWorkforce.filter(
          (member) =>
            member.readiness === 100,
        ).length,
      [activeWorkforce],
    );


    const trainingGaps = useMemo(
      () =>
        activeWorkforce.reduce(
          (total, member) =>
            total +
            Math.max(
              0,
              member.requiredCourses -
                member.currentCourses,
            ),
          0,
        ),
      [activeWorkforce],
    );


    const workloadRisk =
      props.activeProductionOrders +
      props.openAlerts +
      props.openWorkOrders +
      props.qaBacklog;


    if (loading) {
      return (
        <section className="zone-content workforce-shell">
          <div className="workforce-panel">
            <span className="eyebrow">
              EES Data Moon
            </span>

            <h3>
              Loading authoritative workforce…
            </h3>

            <p>
              Resolving employees, roles,
              shifts and Pharma training
              qualifications.
            </p>
          </div>
        </section>
      );
    }


    if (error) {
      return (
        <section className="zone-content workforce-shell">
          <div className="workforce-panel">
            <span className="eyebrow">
              Workforce Data Error
            </span>

            <h3>
              Unable to load workforce
            </h3>

            <p>{error}</p>
          </div>
        </section>
      );
    }


    return (
      <section className="zone-content workforce-shell">

        <div className="workforce-hero">
          <div>
            <span className="eyebrow">
              People, Capability & Qualification
            </span>

            <h1>
              Workforce, Training & Skills Matrix
            </h1>

            <p>
              Live workforce identity, role,
              shift, training and qualification
              readiness from the EES Data Moon.
            </p>
          </div>

          <div
            className={
              `workforce-score ${
                avgReadiness >= 90
                  ? "good"
                  : "warning"
              }`
            }
          >
            <strong>
              {avgReadiness}%
            </strong>

            <span>
              Plant readiness
            </span>
          </div>
        </div>


        <div className="workforce-kpis">

          <article>
            <span>
              Workforce
            </span>

            <strong>
              {summary?.active ?? 0}/
              {summary?.total ?? 0}
            </strong>

            <small>
              Active personnel
            </small>
          </article>


          <article>
            <span>
              Training Current
            </span>

            <strong>
              {fullyCurrent}/
              {summary?.active ?? 0}
            </strong>

            <small>
              100% required training
            </small>
          </article>


          <article>
            <span>
              Training Gaps
            </span>

            <strong>
              {trainingGaps}
            </strong>

            <small>
              Missing / expired requirements
            </small>
          </article>


          <article>
            <span>
              Temporary Workforce
            </span>

            <strong>
              {summary?.temporary ?? 0}
            </strong>

            <small>
              Same role qualification standards
            </small>
          </article>


          <article>
            <span>
              Leave / Inactive
            </span>

            <strong>
              {(summary?.on_leave ?? 0) +
                (summary?.inactive ?? 0)}
            </strong>

            <small>
              Access exceptions retained
            </small>
          </article>


          <article>
            <span>
              Operational Load
            </span>

            <strong>
              {workloadRisk}
            </strong>

            <small>
              POs, alerts, WOs, QA queue
            </small>
          </article>


          <article>
            <span>
              Active Session
            </span>

            <strong>
              {props.activeSession
                ? `${props.activeSession.score}%`
                : "None"}
            </strong>

            <small>
              {props.activeSession?.role ??
                "No training underway"}
            </small>
          </article>

        </div>


        <div className="workforce-tabs">
          {(
            [
              "overview",
              "skills",
              "training",
              "coverage",
            ] as View[]
          ).map((item) => (
            <button
              key={item}
              className={
                view === item
                  ? "active"
                  : ""
              }
              onClick={() =>
                setView(item)
              }
            >
              {item}
            </button>
          ))}
        </div>


        {view === "overview" && (
          <div className="workforce-grid">

            <article className="workforce-panel">

              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    Personnel Roster
                  </span>

                  <h3>
                    Live Role Readiness
                  </h3>
                </div>

                <select
                  value={department}
                  onChange={(event) =>
                    setDepartment(
                      event.target.value,
                    )
                  }
                >
                  {departments.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    ),
                  )}
                </select>
              </div>


              <div className="workforce-roster">

                {filtered.map(
                  (member) => (
                    <button
                      key={
                        member.employee_id
                      }
                      className={
                        member.employee_id ===
                        selected?.employee_id
                          ? "selected"
                          : ""
                      }
                      onClick={() =>
                        setSelectedId(
                          member.employee_id,
                        )
                      }
                    >
                      <div>
                        <strong>
                          {member.display_name}
                        </strong>

                        <span>
                          {member.role_name ??
                            "Unassigned Role"}
                          {" · "}
                          {member.shift_name ??
                            "No Shift"}
                        </span>

                        <small>
                          {
                            member.employee_number
                          }
                          {" · "}
                          {
                            member.employment_type
                          }
                          {" · "}
                          {
                            member.employment_status
                          }
                        </small>
                      </div>

                      <em>
                        {member.readiness}%
                      </em>

                      <progress
                        value={
                          member.readiness
                        }
                        max={100}
                      />
                    </button>
                  ),
                )}

              </div>
            </article>


            <article className="workforce-panel">

              {selected ? (
                <>
                  <span className="eyebrow">
                    Personnel Faceplate
                  </span>

                  <h3>
                    {selected.display_name}
                  </h3>


                  <div className="workforce-detail-grid">

                    <article>
                      <span>
                        Employee
                      </span>

                      <strong>
                        {
                          selected.employee_number
                        }
                      </strong>
                    </article>


                    <article>
                      <span>
                        Department
                      </span>

                      <strong>
                        {selected.department_name ??
                          "Unassigned"}
                      </strong>
                    </article>


                    <article>
                      <span>
                        Role
                      </span>

                      <strong>
                        {selected.role_name ??
                          "Unassigned"}
                      </strong>
                    </article>


                    <article>
                      <span>
                        Shift
                      </span>

                      <strong>
                        {selected.shift_name ??
                          "No Shift"}
                      </strong>
                    </article>


                    <article>
                      <span>
                        Hours
                      </span>

                      <strong>
                        {formatTime(
                          selected.start_time,
                        )}
                        {" – "}
                        {formatTime(
                          selected.end_time,
                        )}
                      </strong>
                    </article>


                    <article>
                      <span>
                        Employment
                      </span>

                      <strong>
                        {
                          selected.employment_type
                        }
                        {" · "}
                        {
                          selected.employment_status
                        }
                      </strong>
                    </article>


                    <article>
                      <span>
                        Required
                      </span>

                      <strong>
                        {
                          selected.requiredCourses
                        }{" "}
                        courses
                      </strong>
                    </article>


                    <article>
                      <span>
                        Current
                      </span>

                      <strong>
                        {
                          selected.currentCourses
                        }/
                        {
                          selected.requiredCourses
                        }
                      </strong>
                    </article>

                  </div>


                  <h4>
                    Required Training
                  </h4>

                  <div className="certification-chips">
                    {selected.training.length ? (
                      selected.training.map(
                        (record) => (
                          <span
                            key={
                              record.course_id
                            }
                            className={
                              record.effective_status ===
                              "CURRENT"
                                ? "met"
                                : "gap"
                            }
                            title={
                              `${record.course_name} · ` +
                              `${record.effective_status}`
                            }
                          >
                            {
                              record.course_code
                            }
                            {" · "}
                            {statusLabel(
                              record.effective_status,
                            )}
                          </span>
                        ),
                      )
                    ) : (
                      <span>
                        No required training
                      </span>
                    )}
                  </div>


                  <h4>
                    Security Access
                  </h4>

                  <p className="workforce-note">
                    Controlled-zone badge
                    authorization is evaluated by
                    Security from Pharma workforce
                    training and qualification data.
                  </p>

                </>
              ) : (
                <p>
                  No workforce records available.
                </p>
              )}

            </article>
          </div>
        )}


        {view === "skills" && (
          <div className="workforce-panel">

            <h3>
              Plant Training & Qualification Matrix
            </h3>

            <div className="skills-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      Department
                    </th>

                    <th>
                      Employee
                    </th>

                    <th>
                      Role
                    </th>

                    <th>
                      Employment
                    </th>

                    <th>
                      Required Training
                    </th>

                    <th>
                      Readiness
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {workforce.map(
                    (member) => (
                      <tr
                        key={
                          member.employee_id
                        }
                      >
                        <td>
                          {member.department_name ??
                            "Unassigned"}
                        </td>

                        <td>
                          <strong>
                            {
                              member.display_name
                            }
                          </strong>

                          <small>
                            {
                              member.employee_number
                            }
                          </small>
                        </td>

                        <td>
                          {member.role_name ??
                            "Unassigned"}
                        </td>

                        <td>
                          {
                            member.employment_type
                          }
                          {" · "}
                          {
                            member.employment_status
                          }
                        </td>

                        <td>
                          <div className="skill-cell">
                            {member.training.map(
                              (record) => (
                                <span
                                  key={
                                    record.course_id
                                  }
                                  className={
                                    record.effective_status ===
                                    "CURRENT"
                                      ? "met"
                                      : "gap"
                                  }
                                >
                                  {
                                    record.course_code
                                  }
                                </span>
                              ),
                            )}
                          </div>
                        </td>

                        <td>
                          <strong>
                            {member.readiness}%
                          </strong>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

          </div>
        )}


        {view === "training" && (
          <div className="workforce-grid">

            <article className="workforce-panel">

              <span className="eyebrow">
                Employee Training Record
              </span>

              <h3>
                {selected?.display_name ??
                  "Select Employee"}
              </h3>


              {selected ? (
                <div className="training-role-list">

                  {selected.training.length ? (
                    selected.training.map(
                      (record) => (
                        <article
                          key={
                            record.course_id
                          }
                        >
                          <div>
                            <strong>
                              {
                                record.course_name
                              }
                            </strong>

                            <span>
                              {
                                record.course_code
                              }
                              {" · "}
                              {
                                record.training_category
                              }
                            </span>
                          </div>

                          <div>
                            <strong>
                              {statusLabel(
                                record.effective_status,
                              )}
                            </strong>

                            <span>
                              Completed:{" "}
                              {formatDate(
                                record.completed_at,
                              )}
                            </span>

                            <span>
                              Expires:{" "}
                              {formatDate(
                                record.expires_at,
                              )}
                            </span>

                            {record.completion_score !==
                              null && (
                              <span>
                                Score:{" "}
                                {
                                  record.completion_score
                                }
                                %
                              </span>
                            )}
                          </div>
                        </article>
                      ),
                    )
                  ) : (
                    <p>
                      No required training
                      assigned to this role.
                    </p>
                  )}

                </div>
              ) : (
                <p>
                  Select an employee from
                  Overview.
                </p>
              )}

            </article>


            <article className="workforce-panel">

              <h3>
                Current Training Session
              </h3>

              {props.activeSession ? (
                <div className="active-training-card">
                  <strong>
                    {
                      props.activeSession.role
                    }
                  </strong>

                  <span>
                    {
                      props.activeSession
                        .difficulty
                    }
                  </span>

                  <progress
                    value={
                      props.activeSession.score
                    }
                    max={100}
                  />

                  <small>
                    {
                      props.activeSession.status
                    }
                    {" · "}
                    {
                      props.activeSession
                        .sessionId
                    }
                  </small>
                </div>
              ) : (
                <p>
                  No active training
                  simulation session. Start one
                  from Office & Production
                  Scheduling.
                </p>
              )}


              <h4>
                Training Simulator Roles
              </h4>

              <div className="training-role-list">
                {props.roles.length ? (
                  props.roles.map(
                    (role) => (
                      <article key={role}>
                        <strong>
                          {role}
                        </strong>

                        <span>
                          Beginner · Intermediate
                          · Advanced
                        </span>

                        <button
                          onClick={() =>
                            props.onNavigate(
                              "office",
                            )
                          }
                        >
                          Open Training Console
                        </button>
                      </article>
                    ),
                  )
                ) : (
                  <p>
                    No simulator curricula
                    loaded.
                  </p>
                )}
              </div>

            </article>

          </div>
        )}


        {view === "coverage" && (
          <div className="workforce-panel">

            <h3>
              Department Coverage & Staffing Risk
            </h3>

            <div className="coverage-grid">

              {departmentCoverage.map(
                (item) => (
                  <article
                    key={
                      item.department_name
                    }
                  >
                    <div>
                      <strong>
                        {
                          item.department_name
                        }
                      </strong>

                      <span>
                        {item.active_employees}/
                        {item.employees} active
                      </span>
                    </div>

                    <progress
                      value={
                        item.readiness
                      }
                      max={100}
                    />

                    <small>
                      {item.readiness}%
                      current required training
                    </small>
                  </article>
                ),
              )}

            </div>


            <p className="workforce-note">
              Coverage is calculated from
              authoritative role requirements and
              employee training records in the EES
              Data Moon. Temporary employees use
              the same role requirements as
              permanent employees.
            </p>

          </div>
        )}

      </section>
    );
  },
);