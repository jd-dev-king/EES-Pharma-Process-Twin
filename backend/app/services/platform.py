import json
from datetime import datetime, timezone
from random import random, uniform
import httpx
from uuid import uuid4
from sqlalchemy import select, text, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.database import Base
from app.models import CIPRun, Shipment, HoldTank, InventoryLot, MaterialRequirement, MaterialPR, MaterialPRLine, MaterialPosition, MaterialMovement, MixBatch, MixRoom, Notification, PlatformEvent, PremixRun, ProductionOrder, ProductionCampaign, CampaignSeparationRequest, QABulkTask, RouteChangeRequest, SubstitutionRequest, TrainingSession, WarehouseTransferOrder, WeighRoom, WeighTicket, WeighTicketLine, PackagingLine, PackagingRun, PackagingDowntimeEvent, MaintenanceWorkOrder, QAFinishedGoodsTask, BatchReview, AuditTrailEntry, BulkTank, BulkDelivery, BulkTransfer, RnDSampleBatch
from app.schemas.platform import ProductionOrderCreate, SchedulerConflict, SchedulerConflictRequest, SchedulerConflictResponse, TrainingSessionCreate, TrainingStepComplete
from app.core.config import get_settings
from app.services.ees_data_platform import (
    BULK_RECIPE_ROWS,
    batch_genealogy,
    consume_supply_lot,
    formulation_options_from_supply,
    packaging_components as shared_packaging_components,
    approved_formulations as shared_approved_formulations,
    rnd_material_catalog as shared_rnd_material_catalog,
    rnd_formula_materials as shared_rnd_formula_materials,
    mes_log,
    mes_batch_record,
    supply_inventory,
    supply_lots,
    substitution_candidates,
    supply_lot_detail,
    apply_pharma_material_substitution,
    sync_pharma_order,
    update_pharma_batch_material,
)

settings = get_settings()

TRAINING_ROLES=["Production Scheduler","Warehouse Operator","Weigh Technician","Process Engineer","Packaging Operator","QA Specialist","Maintenance Technician","Lean Six Sigma Engineer"]
DEMO_RESERVATIONS={"weigh_room":{"WR-01":"PO-260700"},"mix_tank":{"V-201":"PO-260701"},"hold_tank":{"H-301":"PO-260702"},"packaging_line":{"PKG-01":"PO-260703"}}

BULK_MATERIAL_CODES={row[0] for row in BULK_RECIPE_ROWS}

def utc_now():
    return datetime.now(timezone.utc)

def record_event(db, **kw):
    event=PlatformEvent(**kw); db.add(event); return event
def create_notification(db, **kw):
    item=Notification(**kw); db.add(item); return item

def _remote_parking_json(paths: list[str]):
    """Best-effort read-through to the dedicated Parking Access Digital Twin.

    Production Pharma Process should not report parking OFFLINE simply because its
    own SQLAlchemy session is connected to a database that does not expose the
    parking_access schema. The parking application remains the system of record.
    """
    base = (settings.parking_access_api_url or "").rstrip("/")
    if not base:
        return None
    for path in paths:
        try:
            response = httpx.get(f"{base}{path}", timeout=3.5)
            if response.is_success:
                data = response.json()
                if isinstance(data, dict):
                    return data
        except Exception:
            continue
    return None


def _normalize_parking_summary(source):
    if not source or not isinstance(source, dict):
        return None

    try:
        # Dedicated Parking Access API uses capacity/occupied/remaining.
        # Pharma Process historically used total_spaces/occupied_spaces/etc.
        secured_total = int(
            source.get(
                "secured_total_spaces",
                source.get("total_spaces", source.get("capacity", 0)),
            )
            or 0
        )

        secured_occupied = int(
            source.get(
                "secured_occupied_spaces",
                source.get("occupied_spaces", source.get("occupied", 0)),
            )
            or 0
        )

        employees = int(source.get("employees", 0) or 0)
        visitors = int(source.get("visitors", 0) or 0)
        contractors = int(source.get("contractors", source.get("contractors_on_site", 0)) or 0)

        overflow_total = int(
            source.get(
                "overflow_total_spaces",
                source.get("overflow_capacity", 30),
            )
            or 30
        )

        overflow_occupied = int(
            source.get(
                "overflow_occupied_spaces",
                source.get("overflow_occupied", source.get("overflow", 0)),
            )
            or 0
        )

    except (TypeError, ValueError):
        return None

    if secured_total <= 0:
        return None

    secured_available = max(0, secured_total - secured_occupied)
    overflow_available = max(0, overflow_total - overflow_occupied)

    total_capacity = secured_total + overflow_total
    total_occupied = secured_occupied + overflow_occupied
    total_available = max(0, total_capacity - total_occupied)

    return {
        "available": True,

        "lot_code": str(source.get("lot_code", "PHARMA-EMPLOYEE")),
        "lot_name": str(source.get("lot_name", "Pharma Employee Parking")),

        # Legacy secured-lot contract retained for existing UI consumers.
        "total_spaces": secured_total,
        "occupied_spaces": secured_occupied,
        "available_spaces": secured_available,
        "occupancy_percent": round(
            (secured_occupied / secured_total * 100)
            if secured_total
            else 0,
            1,
        ),

        # Explicit secured-lot contract.
        "secured_total_spaces": secured_total,
        "secured_occupied_spaces": secured_occupied,
        "secured_available_spaces": secured_available,

        # Overflow lot.
        "overflow_total_spaces": overflow_total,
        "overflow_occupied_spaces": overflow_occupied,
        "overflow_available_spaces": overflow_available,

        # Entire parking operation.
        "total_parking_capacity": total_capacity,
        "total_parked": total_occupied,
        "total_available_spaces": total_available,

        # Occupants.
        "employees": employees,
        "contractors": contractors,
        "visitors": visitors,

        # Auto-run operational state.
        "auto_run_active": bool(
            source.get("auto_run_active", source.get("active", False))
        ),
        "auto_run_phase": str(
            source.get("auto_run_phase", source.get("phase", "IDLE")) or "IDLE"
        ),
        "sim_day": str(source.get("sim_day", "") or ""),
        "sim_time": str(source.get("sim_time", "") or ""),
        "current_event": str(source.get("current_event", "") or ""),
        "next_event": str(source.get("next_event", "") or ""),

        # Preserve session information if Parking Access supplies it.
        "active_sessions": source.get("active_sessions", []) or [],
        "overflow_sessions": source.get("overflow_sessions", []) or [],
        "overflow_vehicles": source.get("overflow_vehicles", []) or [],
    }


def facility_parking_status(db: Session):
    """
    Read-only aggregation of the dedicated Parking Access Digital Twin.

    Parking Access remains the system of record.

    Production state is split across:
      /api/parking/status
      /api/parking/overflow-status
      /api/auto-run/status
    """

    secured = _remote_parking_json([
        "/api/parking/status",
        "/api/facility/parking-status",
        "/api/v1/parking/status",
        "/api/status",
    ])

    overflow = _remote_parking_json([
        "/api/parking/overflow-status",
    ])

    auto_run = _remote_parking_json([
        "/api/auto-run/status",
    ])

    if secured and isinstance(secured, dict):
        try:
            secured_capacity = int(
                secured.get(
                    "capacity",
                    secured.get("total_spaces", 70),
                )
                or 70
            )

            secured_occupied = int(
                secured.get(
                    "occupied",
                    secured.get("occupied_spaces", 0),
                )
                or 0
            )

            secured_available = int(
                secured.get(
                    "remaining",
                    secured.get(
                        "available_spaces",
                        max(
                            secured_capacity - secured_occupied,
                            0,
                        ),
                    ),
                )
                or 0
            )

            overflow_capacity = int(
                (
                    overflow.get("capacity", 30)
                    if isinstance(overflow, dict)
                    else 30
                )
                or 30
            )

            overflow_occupied = int(
                (
                    overflow.get("occupied", 0)
                    if isinstance(overflow, dict)
                    else 0
                )
                or 0
            )

            overflow_available = int(
                (
                    overflow.get(
                        "remaining",
                        max(
                            overflow_capacity - overflow_occupied,
                            0,
                        ),
                    )
                    if isinstance(overflow, dict)
                    else overflow_capacity
                )
                or 0
            )

            total_capacity = (
                secured_capacity +
                overflow_capacity
            )

            total_parked = (
                secured_occupied +
                overflow_occupied
            )

            total_available = max(
                total_capacity - total_parked,
                0,
            )

            #
            # Auto Run status contains the combined
            # secured + overflow occupant totals.
            #
            if isinstance(auto_run, dict):
                employees = int(
                    auto_run.get(
                        "employees",
                        secured.get("employees", 0),
                    )
                    or 0
                )

                contractors = int(
                    auto_run.get(
                        "contractors_on_site",
                        0,
                    )
                    or 0
                )

                visitors = int(
                    auto_run.get(
                        "visitors_on_site",
                        auto_run.get(
                            "visitors",
                            secured.get("visitors", 0),
                        ),
                    )
                    or 0
                )

            else:
                employees = int(
                    secured.get("employees", 0)
                    or 0
                )

                contractors = 0

                visitors = int(
                    secured.get("visitors", 0)
                    or 0
                )

            return {
                "available": True,

                "lot_code": "PHARMA-EMPLOYEE",
                "lot_name": "Pharma Employee Parking",

                #
                # Legacy fields remain secured-lot aliases
                # for compatibility with older consumers.
                #
                "total_spaces": secured_capacity,
                "occupied_spaces": secured_occupied,
                "available_spaces": secured_available,

                "occupancy_percent": round(
                    (
                        secured_occupied /
                        secured_capacity *
                        100
                    )
                    if secured_capacity
                    else 0,
                    1,
                ),

                #
                # Secured main lot
                #
                "secured_total_spaces":
                    secured_capacity,

                "secured_occupied_spaces":
                    secured_occupied,

                "secured_available_spaces":
                    secured_available,

                #
                # Overflow lot
                #
                "overflow_total_spaces":
                    overflow_capacity,

                "overflow_occupied_spaces":
                    overflow_occupied,

                "overflow_available_spaces":
                    overflow_available,

                #
                # Combined campus parking
                #
                "total_parking_capacity":
                    total_capacity,

                "total_parked":
                    total_parked,

                "total_available_spaces":
                    total_available,

                #
                # Combined occupants
                #
                "employees": employees,
                "contractors": contractors,
                "visitors": visitors,

                #
                # Auto Run
                #
                "auto_run_active": bool(
                    auto_run.get("active", False)
                    if isinstance(auto_run, dict)
                    else False
                ),

                "auto_run_phase": str(
                    auto_run.get("phase", "IDLE")
                    if isinstance(auto_run, dict)
                    else "IDLE"
                ),

                "sim_day": str(
                    auto_run.get("sim_day", "")
                    if isinstance(auto_run, dict)
                    else ""
                ),

                "sim_time": str(
                    auto_run.get("sim_time", "")
                    if isinstance(auto_run, dict)
                    else ""
                ),

                "current_event": str(
                    auto_run.get("current_event", "")
                    if isinstance(auto_run, dict)
                    else ""
                ),

                "next_event": str(
                    auto_run.get("next_event", "")
                    if isinstance(auto_run, dict)
                    else ""
                ),

                #
                # Live rosters
                #
                "active_sessions":
                    secured.get(
                        "active_sessions",
                        [],
                    )
                    or [],

                "overflow_sessions":
                    (
                        overflow.get(
                            "active_sessions",
                            [],
                        )
                        if isinstance(
                            overflow,
                            dict,
                        )
                        else []
                    )
                    or [],

                "overflow_vehicles":
                    (
                        auto_run.get(
                            "overflow_vehicles",
                            [],
                        )
                        if isinstance(
                            auto_run,
                            dict,
                        )
                        else []
                    )
                    or [],
            }

        except (
            TypeError,
            ValueError,
            KeyError,
        ):
            pass

    #
    # PostgreSQL fallback
    #
    try:
        summary = db.execute(text("""
            SELECT
                COUNT(*) FILTER (
                    WHERE ps.session_status='ACTIVE'
                ) AS occupied,

                COUNT(*) FILTER (
                    WHERE ps.session_status='ACTIVE'
                      AND ps.occupant_type='EMPLOYEE'
                ) AS employees,

                COUNT(*) FILTER (
                    WHERE ps.session_status='ACTIVE'
                      AND ps.occupant_type='VISITOR'
                ) AS visitors

            FROM parking_access.parking_sessions ps
        """)).mappings().one()

        secured_capacity = int(
            db.execute(
                text("""
                    SELECT COUNT(*)
                    FROM parking_access.parking_spaces
                """)
            ).scalar_one()
            or 0
        )

        secured_occupied = int(
            summary["occupied"]
            or 0
        )

        #
        # Overflow fallback is also read from PostgreSQL.
        # Do not hard-code it to zero.
        #
        overflow_summary = db.execute(text("""
            SELECT
                COUNT(*) AS occupied,

                COUNT(*) FILTER (
                    WHERE occupant_type='EMPLOYEE'
                ) AS employees,

                COUNT(*) FILTER (
                    WHERE occupant_type='CONTRACTOR'
                ) AS contractors,

                COUNT(*) FILTER (
                    WHERE occupant_type='VISITOR'
                ) AS visitors

            FROM parking_access.overflow_sessions
            WHERE session_status='ACTIVE'
        """)).mappings().one()

        overflow_capacity = int(
            db.execute(
                text("""
                    SELECT COUNT(*)
                    FROM parking_access.overflow_spaces
                    WHERE active=TRUE
                """)
            ).scalar_one()
            or 30
        )

        overflow_occupied = int(
            overflow_summary["occupied"]
            or 0
        )

        employees = (
            int(summary["employees"] or 0) +
            int(
                overflow_summary["employees"]
                or 0
            )
        )

        visitors = (
            int(summary["visitors"] or 0) +
            int(
                overflow_summary["visitors"]
                or 0
            )
        )

        contractors = int(
            overflow_summary["contractors"]
            or 0
        )

        total_capacity = (
            secured_capacity +
            overflow_capacity
        )

        total_parked = (
            secured_occupied +
            overflow_occupied
        )

        return {
            "available": True,

            "lot_code": "PHARMA-EMPLOYEE",
            "lot_name": "Pharma Employee Parking",

            "total_spaces":
                secured_capacity,

            "occupied_spaces":
                secured_occupied,

            "available_spaces":
                max(
                    secured_capacity -
                    secured_occupied,
                    0,
                ),

            "occupancy_percent": round(
                (
                    secured_occupied /
                    secured_capacity *
                    100
                )
                if secured_capacity
                else 0,
                1,
            ),

            "secured_total_spaces":
                secured_capacity,

            "secured_occupied_spaces":
                secured_occupied,

            "secured_available_spaces":
                max(
                    secured_capacity -
                    secured_occupied,
                    0,
                ),

            "overflow_total_spaces":
                overflow_capacity,

            "overflow_occupied_spaces":
                overflow_occupied,

            "overflow_available_spaces":
                max(
                    overflow_capacity -
                    overflow_occupied,
                    0,
                ),

            "total_parking_capacity":
                total_capacity,

            "total_parked":
                total_parked,

            "total_available_spaces":
                max(
                    total_capacity -
                    total_parked,
                    0,
                ),

            "employees": employees,
            "contractors": contractors,
            "visitors": visitors,

            "auto_run_active": False,
            "auto_run_phase": "UNAVAILABLE",
            "sim_day": "",
            "sim_time": "",
            "current_event": "",
            "next_event": "",

            "active_sessions": [],
            "overflow_sessions": [],
            "overflow_vehicles": [],
        }

    except Exception:
        db.rollback()

        return {
            "available": False,

            "lot_code": "PHARMA-EMPLOYEE",
            "lot_name": "Pharma Employee Parking",

            "total_spaces": 70,
            "occupied_spaces": 0,
            "available_spaces": 70,
            "occupancy_percent": 0.0,

            "secured_total_spaces": 70,
            "secured_occupied_spaces": 0,
            "secured_available_spaces": 70,

            "overflow_total_spaces": 30,
            "overflow_occupied_spaces": 0,
            "overflow_available_spaces": 30,

            "total_parking_capacity": 100,
            "total_parked": 0,
            "total_available_spaces": 100,

            "employees": 0,
            "contractors": 0,
            "visitors": 0,

            "auto_run_active": False,
            "auto_run_phase": "OFFLINE",
            "sim_day": "",
            "sim_time": "",
            "current_event": "",
            "next_event": "",

            "active_sessions": [],
            "overflow_sessions": [],
            "overflow_vehicles": [],
        }

def facility_security_status(db: Session):
    """Read-only Security Command Center. Prefer the dedicated Parking Access API."""
    remote = _remote_parking_json([
        "/api/facility/security-status",
        "/api/security/status",
        "/api/v1/security/status",
    ])
    if remote and isinstance(remote, dict):
        parking = _normalize_parking_summary(remote) or facility_parking_status(db)
        return {
            **parking,
            "pending_reviews": int(remote.get("pending_reviews", 0) or 0),
            "approved_today": int(remote.get("approved_today", 0) or 0),
            "denied_today": int(remote.get("denied_today", 0) or 0),
            "visitor_ids_available": int(remote.get("visitor_ids_available", remote.get("available_visitor_ids", 0)) or 0),
            "active_occupants": remote.get("active_occupants", remote.get("occupants", [])) or [],
            "recent_events": remote.get("recent_events", remote.get("events", [])) or [],
        }
    parking = facility_parking_status(db)
    if not parking.get("available"):
        return {**parking, "pending_reviews": 0, "approved_today": 0, "denied_today": 0, "visitor_ids_available": 0, "active_occupants": [], "recent_events": []}
    try:
        counts = db.execute(text("""
            SELECT
              COUNT(*) FILTER (WHERE status='PENDING') AS pending_reviews,
              COUNT(*) FILTER (WHERE status='APPROVED' AND decided_at::date = CURRENT_DATE) AS approved_today,
              COUNT(*) FILTER (WHERE status='DENIED' AND decided_at::date = CURRENT_DATE) AS denied_today
            FROM parking_access.security_requests
        """)).mappings().one()
        visitor_ids_available = int(db.execute(text("SELECT COUNT(*) FROM parking_access.visitor_passes WHERE status='AVAILABLE'")).scalar_one() or 0)
        occupants = [dict(row) for row in db.execute(text("""
            SELECT ps.vehicle_identifier, ps.occupant_type, COALESCE(e.display_name, vp.visitor_code, ps.vehicle_identifier) AS identity, sp.space_number, ps.entry_time
            FROM parking_access.parking_sessions ps
            JOIN parking_access.parking_spaces sp ON sp.space_id = ps.space_id
            LEFT JOIN parking_access.employee_vehicles ev ON ev.vehicle_id = ps.employee_vehicle_id
            LEFT JOIN parking_access.employees e ON e.employee_id = ev.employee_id
            LEFT JOIN parking_access.visitor_passes vp ON vp.visitor_pass_id = ps.visitor_pass_id
            WHERE ps.session_status='ACTIVE' ORDER BY ps.entry_time DESC LIMIT 50
        """)).mappings().all()]
        recent_events = [dict(row) for row in db.execute(text("""
            SELECT event_id, event_time, gate_id, vehicle_identifier, event_type, access_result, reason
            FROM parking_access.access_events ORDER BY event_time DESC LIMIT 12
        """)).mappings().all()]
        return {**parking, "pending_reviews": int(counts["pending_reviews"] or 0), "approved_today": int(counts["approved_today"] or 0), "denied_today": int(counts["denied_today"] or 0), "visitor_ids_available": visitor_ids_available, "active_occupants": occupants, "recent_events": recent_events}
    except Exception:
        db.rollback()
        return {**parking, "pending_reviews": 0, "approved_today": 0, "denied_today": 0, "visitor_ids_available": 0, "active_occupants": [], "recent_events": []}


MANUAL_FORMULATION_MATERIALS = {
    "Prednisolone": ("9PHQ9Y1OLM", "Prednisolone", 152.5, "kg"),
    "Alcohol": ("3K9958V90M", "Alcohol", 10.0, "kg"),
    "Anhydrous Citric Acid": ("XF417D3PSL", "Anhydrous Citric Acid", 14.2, "kg"),
    "Benzoic Acid": ("8SKN0B0MIM", "Benzoic Acid", 34.3, "kg"),
    "Edetate Disodium": ("7FLD91C86K", "Edetate Disodium", 20.0, "kg"),
    "Saccharin Sodium": ("SB8ZUX40TY", "Saccharin Sodium", 37.0, "kg"),
}

FLAVOR_MATERIALS = {
    "Cherry": ("BUC5I9595W", "Cherry"),
    "Strawberry": ("FLV-STRAWBERRY-001", "Strawberry"),
    "Berry": ("FLV-BERRY-001", "Berry"),
    "Grape": ("FLV-GRAPE-001", "Grape"),
}

DYE_MATERIALS = {
    "None": None,
    "FD&C Blue No. 1": ("H3R47K3TBD", "FD&C Blue No. 1"),
    "FD&C Red No. 40": ("WZB9127XOA", "FD&C Red No. 40"),
    "FD&C Red No. 33": ("DYE-RED33-001", "FD&C Red No. 33"),
    "FD&C Yellow No. 5": ("DYE-YELLOW5-001", "FD&C Yellow No. 5"),
}

FORMULATION_VARIANTS = {
    "PDFC-0813": {"name":"Cherry Dye Free","flavor":"Cherry","dyes":[]},
    "PC-1308": {"name":"Cherry","flavor":"Cherry","dyes":["FD&C Red No. 33","FD&C Red No. 40"]},
    "PDFS-0914": {"name":"Strawberry Dye Free","flavor":"Strawberry","dyes":[]},
    "PS-1409": {"name":"Strawberry","flavor":"Strawberry","dyes":["FD&C Red No. 33","FD&C Yellow No. 5"]},
    "PDFG-0715": {"name":"Grape Dye Free","flavor":"Grape","dyes":[]},
    "PG-1507": {"name":"Grape","flavor":"Grape","dyes":["FD&C Blue No. 1","FD&C Red No. 40"]},
    "PDFB-0616": {"name":"Berry Dye Free","flavor":"Berry","dyes":[]},
    "PB-1606": {"name":"Berry","flavor":"Berry","dyes":["FD&C Red No. 40"]},
}

BULK_RECIPE = [
    ("059QF0KO0R", "Water", 4000.0, "kg"),
    ("PDC6A3C0OX", "Glycerin", 920.0, "kg"),
    ("6DC9Q167V3", "Propylene Glycol", 750.0, "kg"),
    ("C151H8M554", "Sucrose", 2175.0, "kg"),
]

# Canonical production batch bulk requirements. These are master recipe values
# and must never be rewritten by demo/session/global reset operations.
BULK_REQUIREMENTS_KG = {
    name: float(quantity)
    for _code, name, quantity, unit in BULK_RECIPE
    if unit == "kg"
}

# USP Purified Water is an automatic utility feed, not a physical bulk tank.
BULK_SOURCE_MAP = {
    "Water": {"source_type": "UTILITY", "source_code": "USP-WATER-AUTO"},
    "Glycerin": {"source_type": "TANK", "source_code": "GLY-101"},
    "Propylene Glycol": {"source_type": "TANK", "source_code": "PG-101"},
    "Sucrose": {"source_type": "TANK", "source_code": "SUC-101"},
}

# Legacy direct-transfer path still references BULK_RECIPES. Keep that path
# aligned with the same master recipe instead of maintaining a second set of
# hard-coded quantities.
BULK_RECIPES = {
    material: {
        "tank_code": source["source_code"],
        "quantity_kg": BULK_REQUIREMENTS_KG[material],
    }
    for material, source in BULK_SOURCE_MAP.items()
    if source["source_type"] == "TANK"
}


def _bulk_recipe_requirements(db: Session) -> dict[str, float]:
    """Return the governed bulk recipe.

    Data Moon may maintain `public.demo_bulk_recipe_master` through the Admin
    Table Editor. If that table is installed, it is authoritative. The locked
    code values remain a safe compatibility fallback.
    """
    if db.bind and db.bind.dialect.name == "postgresql":
        exists=db.execute(
            text("SELECT to_regclass('public.demo_bulk_recipe_master')")
        ).scalar_one_or_none()
        if exists:
            rows=db.execute(text("""
                SELECT material_name,required_quantity_kg
                FROM public.demo_bulk_recipe_master
                WHERE active=true
                ORDER BY sequence_no
            """)).all()
            values={str(name):float(qty) for name,qty in rows}
            required={"Water","Glycerin","Propylene Glycol","Sucrose"}
            if required.issubset(values):
                return values
    return dict(BULK_REQUIREMENTS_KG)


def _bulk_source_map(db: Session) -> dict[str, dict[str, str]]:
    result={key:dict(value) for key,value in BULK_SOURCE_MAP.items()}
    if db.bind and db.bind.dialect.name == "postgresql":
        exists=db.execute(
            text("SELECT to_regclass('public.demo_bulk_recipe_master')")
        ).scalar_one_or_none()
        if exists:
            rows=db.execute(text("""
                SELECT material_name,source_type,source_code
                FROM public.demo_bulk_recipe_master
                WHERE active=true
            """)).all()
            for material,source_type,source_code in rows:
                result[str(material)]={
                    "source_type":str(source_type),
                    "source_code":str(source_code),
                }
    return result

PACKAGING_COMPONENTS = [
    ("PKG-BOTTLE-120", "120 mL Amber Bottle"),
    ("PKG-CLOSURE-120", "Child-Resistant Closure"),
    ("PKG-LABEL-PRED", "Liquid Prednisone Product Label"),
]


def ensure_inventory(db: Session):
    """Local/demo inventory mirror. Production material authority lives in ees_data_platform."""
    if db.scalar(select(InventoryLot.id).limit(1)):
        return
    lots=[]
    seed_materials = [
        ("9PHQ9Y1OLM","Prednisolone","PRD-26A0708-01",8.0,"kg"),
        ("3K9958V90M","Alcohol","ALC-26A0709-01",120.0,"L"),
        ("XF417D3PSL","Anhydrous Citric Acid","CIT-26A0709-01",18.0,"kg"),
        ("8SKN0B0MIM","Benzoic Acid","BEN-26A0709-01",12.0,"kg"),
        ("7FLD91C86K","Edetate Disodium","EDT-26A0709-01",8.0,"kg"),
        ("SB8ZUX40TY","Saccharin Sodium","SAC-26A0709-01",8.0,"kg"),
        ("BUC5I9595W","Cherry","CHR-26A0710-01",25.0,"L"),
        ("FLV-STRAWBERRY-001","Strawberry","STR-26A0812-01",25.0,"L"),
        ("FLV-BERRY-001","Berry","BRY-26A0812-01",25.0,"L"),
        ("FLV-GRAPE-001","Grape","GRP-26A0812-01",25.0,"L"),
        ("H3R47K3TBD","FD&C Blue No. 1","BLU-26A0710-01",5.0,"kg"),
        ("WZB9127XOA","FD&C Red No. 40","RED-26A0710-01",5.0,"kg"),
        ("DYE-RED33-001","FD&C Red No. 33","R33-26A0812-01",5.0,"kg"),
        ("DYE-YELLOW5-001","FD&C Yellow No. 5","Y05-26A0812-01",5.0,"kg"),
    ]
    for code,name,lot,qty,unit in seed_materials:
        lots.append(InventoryLot(material_code=code,material_name=name,lot_number=lot,quantity=qty,reserved_quantity=0,unit=unit,location="FORMULATION",qa_status="Released",expiration_date="2028-08-12"))
        lots.append(InventoryLot(material_code=code,material_name=name,lot_number=lot[:-2]+"02",quantity=qty,reserved_quantity=0,unit=unit,location="FORMULATION",qa_status="Released",expiration_date="2028-08-12"))
    db.add_all(lots); db.commit()


def formulation_variants(db: Session):
    return shared_approved_formulations(db)

def _variant(material_number: str, db: Session | None = None):
    key=(material_number or "PC-1308").strip().upper()
    if key in FORMULATION_VARIANTS:
        return key, FORMULATION_VARIANTS[key]
    if db is not None:
        rows=shared_approved_formulations(db)
        row=next((r for r in rows if str(r.get("material_number","")).upper()==key),None)
        if row:
            dyes=row.get("dyes") or []
            if isinstance(dyes,str):
                try: dyes=json.loads(dyes)
                except Exception: dyes=[]
            return key, {"name":row.get("name") or key,"flavor":row.get("flavor") or "Development","dyes":list(dyes)}
    raise ValueError("Select an approved production material number")

DEMO_SESSION_HEADER = "X-EES-Demo-Session"


def normalize_demo_session_id(value: str | None) -> str:
    session_id=(value or "").strip()
    if not session_id:
        raise ValueError("Demo session identifier is required")
    if len(session_id) > 120:
        raise ValueError("Demo session identifier is invalid")
    return session_id


def touch_demo_session(db: Session, session_id: str):
    session_id=normalize_demo_session_id(session_id)
    db.execute(text("""
        INSERT INTO public.demo_sessions(
            session_id,status,created_at,last_seen_at
        )
        VALUES(:session_id,'Active',now(),now())
        ON CONFLICT(session_id) DO UPDATE SET
            status='Active',
            last_seen_at=now()
    """),{"session_id":session_id})
    return session_id


def register_demo_session_entity(
    db: Session,
    session_id: str,
    entity_type: str,
    entity_id: str,
):
    session_id=touch_demo_session(db,session_id)
    db.execute(text("""
        INSERT INTO public.demo_session_entities(
            session_id,entity_type,entity_id,active,created_at,updated_at
        )
        VALUES(:session_id,:entity_type,:entity_id,true,now(),now())
        ON CONFLICT(session_id,entity_type,entity_id) DO UPDATE SET
            active=true,
            updated_at=now()
    """),{
        "session_id":session_id,
        "entity_type":entity_type,
        "entity_id":entity_id,
    })
    db.commit()


def active_demo_entity_ids(
    db: Session,
    session_id: str,
    entity_type: str,
) -> list[str]:
    session_id=normalize_demo_session_id(session_id)
    return list(db.execute(text("""
        SELECT entity_id
        FROM public.demo_session_entities
        WHERE session_id=:session_id
          AND entity_type=:entity_type
          AND active=true
        ORDER BY created_at,entity_id
    """),{
        "session_id":session_id,
        "entity_type":entity_type,
    }).scalars().all())


def list_session_production_orders(db: Session, session_id: str):
    po_numbers=active_demo_entity_ids(db,session_id,"ProductionOrder")
    if not po_numbers:
        return []
    return list(db.scalars(
        select(ProductionOrder)
        .where(ProductionOrder.po_number.in_(po_numbers))
        .order_by(ProductionOrder.id.desc())
    ).all())


def list_session_campaigns(db: Session, session_id: str):
    campaign_ids=active_demo_entity_ids(db,session_id,"ProductionCampaign")
    if not campaign_ids:
        return []
    return list(db.scalars(
        select(ProductionCampaign)
        .where(ProductionCampaign.campaign_id.in_(campaign_ids))
        .order_by(ProductionCampaign.id.desc())
    ).all())


def list_session_warehouse_queue(db: Session, session_id: str):
    po_numbers=set(active_demo_entity_ids(db,session_id,"ProductionOrder"))
    if not po_numbers:
        return []
    return [row for row in list_warehouse_queue(db) if row.po_number in po_numbers]


def list_session_material_prs(db: Session, session_id: str):
    po_numbers=set(active_demo_entity_ids(db,session_id,"ProductionOrder"))
    if not po_numbers:
        return []
    return [row for row in list_material_prs(db) if row.po_number in po_numbers]


def list_session_weigh_tickets(db: Session, session_id: str):
    po_numbers=set(active_demo_entity_ids(db,session_id,"ProductionOrder"))
    if not po_numbers:
        return []
    return [row for row in list_weigh_tickets(db) if row.po_number in po_numbers]


def reset_demo_session(
    db: Session,
    session_id: str,
    operator: str,
    reason: str,
):
    """
    Reset only the current browser demo session and hand shared reconciliation
    responsibility to Universal Data Moon Admin.

    SESSION RESET DOES:
      - create a populated Data Moon reset request;
      - deactivate this session's PO/campaign entity mappings;
      - release work-center locks owned by this session;
      - leave the browser with zero active session POs/campaigns;
      - preserve already-consumed/moved quantities;
      - preserve shared Pharma/Supply genealogy;
      - preserve global PO numbering.

    SESSION RESET DOES NOT:
      - update governed pharma.production_orders to invented statuses;
      - restore warehouse/bulk/staging baseline quantities;
      - delete shared records;
      - affect another browser session.
    """
    session_id=touch_demo_session(db,session_id)
    request_id=f"RESET-{uuid4().hex[:12].upper()}"

    po_numbers=active_demo_entity_ids(db,session_id,"ProductionOrder")
    campaign_ids=active_demo_entity_ids(db,session_id,"ProductionCampaign")

    db.execute(text("""
        INSERT INTO public.demo_reset_requests(
            request_id,
            session_id,
            reset_scope,
            operator,
            reason,
            status,
            requested_at,
            completed_at
        )
        VALUES(
            :request_id,
            :session_id,
            'SESSION',
            :operator,
            :reason,
            'Pending Admin Reconciliation',
            now(),
            NULL
        )
    """),{
        "request_id":request_id,
        "session_id":session_id,
        "operator":operator,
        "reason":reason,
    })

    # Release ONLY equipment currently assigned to this browser session's POs.
    # Shared production/inventory genealogy remains untouched.
    if po_numbers:
        for room in db.scalars(select(WeighRoom)).all():
            if room.active_po in po_numbers:
                room.active_po=None
                room.status="Available"

        for room in db.scalars(select(MixRoom)).all():
            if getattr(room,"active_po",None) in po_numbers:
                room.active_po=None
                room.status="Available"

        for line in db.scalars(select(PackagingLine)).all():
            if getattr(line,"active_po",None) in po_numbers:
                line.active_po=None
                line.status="Available"

    # Session visibility is controlled by this mapping, not by changing
    # governed manufacturing statuses in shared Pharma/Supply tables.
    db.execute(text("""
        UPDATE public.demo_session_entities
           SET active=false,
               updated_at=now()
         WHERE session_id=:session_id
           AND active=true
    """),{"session_id":session_id})

    # The reset request is pending Data Moon Admin review.  Mark the current
    # session as Reset Pending so Data Moon does not count it as an active
    # manufacturing session until this browser starts new work.
    db.execute(text("""
        UPDATE public.demo_sessions
           SET status='Reset Pending',
               last_seen_at=now()
         WHERE session_id=:session_id
    """),{"session_id":session_id})

    record_event(
        db,
        event_type="DemoSessionResetRequested",
        source="Release Administration",
        entity_type="DemoSession",
        entity_id=session_id,
        message=(
            f"{operator} reset browser demo session {session_id}. "
            f"Session POs: {', '.join(po_numbers) if po_numbers else 'none'}. "
            f"Campaigns: {', '.join(campaign_ids) if campaign_ids else 'none'}. "
            f"Shared quantities, Pharma/Supply genealogy, and global PO numbering "
            f"were preserved for Data Moon Admin reconciliation. Reason: {reason}"
        ),
        severity="warning",
    )

    db.commit()

    return {
        "status":"session_reset",
        "message":(
            "Current demo session reset. Active orders were cleared from this "
            "browser session; shared quantities and PO history remain unchanged. "
            "Data Moon Admin reconciliation is pending."
        ),
        "operator":operator,
        "request_id":request_id,
        "session_id":session_id,
        "po_numbers":po_numbers,
        "campaign_ids":campaign_ids,
        "admin_reconciliation_required":True,
    }

def next_po_number(db: Session) -> str:
    """
    Allocate from the Data Moon-owned reusable demo PO pool.

    Allocation and the ProductionOrder insert occur in the same PostgreSQL
    transaction, so concurrent demo users cannot receive the same PO.

    Data Moon global reset sets next_po_number back to 260743 after clearing
    transient public.production_orders.  Shared pharma.* history remains
    governed separately.
    """
    if db.bind and db.bind.dialect.name=="postgresql":
        pool_exists=db.execute(text(
            "SELECT to_regclass('public.demo_po_pool_control')"
        )).scalar_one_or_none()

        if pool_exists:
            row=db.execute(text("""
                SELECT next_po_number,generation
                FROM public.demo_po_pool_control
                WHERE pool_key='PHARMA_DEMO'
                FOR UPDATE
            """)).mappings().first()

            if row is None:
                db.execute(text("""
                    INSERT INTO public.demo_po_pool_control(
                        pool_key,next_po_number,generation,updated_at
                    )
                    VALUES('PHARMA_DEMO',260743,1,now())
                """))
                next_number=260743
            else:
                next_number=int(row["next_po_number"])

            # Local public.production_orders is the current executable demo
            # generation. Data Moon clears it before rewinding the allocator.
            # Guard against accidental pool collisions if admin reset was not
            # completed.
            while db.scalar(
                select(ProductionOrder.id)
                .where(ProductionOrder.po_number==f"PO-{next_number:06d}")
                .limit(1)
            ):
                next_number += 1

            db.execute(text("""
                UPDATE public.demo_po_pool_control
                   SET next_po_number=:next_number,
                       updated_at=now()
                 WHERE pool_key='PHARMA_DEMO'
            """),{"next_number":next_number+1})

            return f"PO-{next_number:06d}"

    # Compatibility fallback for non-PostgreSQL/local unit tests only.
    rows=list(db.scalars(select(ProductionOrder.po_number)).all())
    nums=[]
    for value in rows:
        try:
            nums.append(int(str(value).split("-")[-1]))
        except Exception:
            pass
    nxt=max(nums or [260742])+1
    return f"PO-{nxt:06d}"

def default_materials(payload, db: Session | None = None):
    """Approved material number locks flavor and dye recipe; bulks/packaging remain separate."""
    if payload.materials:
        return payload.materials
    material_number, variant=_variant(payload.material_number, db)
    rnd_rows=shared_rnd_formula_materials(db,material_number) if db is not None else []
    if rnd_rows:
        return [
            type("M",(),dict(
                material_code=r["material_code"],
                material_name=r["material_name"],
                required_quantity=float(r["quantity"]),
                unit=r["unit"],
            ))()
            for r in rnd_rows
            if r.get("role") != "bulk"
        ]
    materials=[]
    for _, (code,name,qty,unit) in MANUAL_FORMULATION_MATERIALS.items():
        materials.append(type("M",(),dict(material_code=code,material_name=name,required_quantity=qty,unit=unit))())
    fcode,fname=FLAVOR_MATERIALS[variant["flavor"]]
    materials.append(type("M",(),dict(material_code=fcode,material_name=fname,required_quantity=17.8,unit="kg"))())
    dye_targets_g = {
        "PC-1308": {"FD&C Red No. 33": 600.0, "FD&C Red No. 40": 600.0},
        "PS-1409": {"FD&C Red No. 33": 150.0, "FD&C Yellow No. 5": 100.0},
        "PG-1507": {"FD&C Blue No. 1": 400.0, "FD&C Red No. 40": 450.0},
        "PB-1606": {"FD&C Red No. 40": 500.0},
    }
    for dye in variant["dyes"]:
        dcode,dname=DYE_MATERIALS[dye]
        materials.append(type("M",(),dict(material_code=dcode,material_name=dname,required_quantity=dye_targets_g[material_number][dye],unit="g"))())
    return materials


def create_production_order(db: Session,payload: ProductionOrderCreate):
    material_number, variant=_variant(payload.material_number, db)
    po_number=next_po_number(db)
    execution_batch=f"B-{material_number}-{po_number.split('-')[-1]}"
    bulk_material = "Multi-Bulk Recipe"
    requires_premix = bool(variant["dyes"])
    dye_label=" + ".join(variant["dyes"]) if variant["dyes"] else "None"
    po=ProductionOrder(po_number=po_number,batch_number=execution_batch,material_number=material_number,product_name=payload.product_name,quantity=payload.quantity,status="Material Review",weigh_room=payload.weigh_room,mix_tank=payload.mix_tank,hold_tank=payload.hold_tank,packaging_line=payload.packaging_line,requires_premix=requires_premix,bulk_material=bulk_material)
    reqs=[MaterialRequirement(po_number=po_number,material_code=m.material_code,material_name=m.material_name,required_quantity=m.required_quantity,unit=m.unit,assigned_lot=None,status="Pending Allocation") for m in default_materials(payload, db)]
    bulk_reqs=[
        MaterialRequirement(
            po_number=po_number,
            material_code=code,
            material_name=name,
            required_quantity=qty,
            unit=unit,
            assigned_lot=None,
            status="Bulk - Direct Transfer",
        )
        for code,name,qty,unit in BULK_RECIPE_ROWS
    ]
    db.add_all([po,*reqs,*bulk_reqs])
    record_event(db,event_type="ProductionOrderRegistered",source="Office",entity_type="ProductionOrder",entity_id=po_number,message=f"{po_number} · material {material_number} ({variant['name']}) · flavor {variant['flavor']} · dyes {dye_label}.",severity="info")
    create_notification(db,recipient="Weighing",title="New PO assigned",message=f"{po_number} assigned to {payload.weigh_room}. Reconcile staging and raise a Material PR before dispensing.",severity="info")
    try: db.commit()
    except IntegrityError as exc: db.rollback(); raise ValueError("Unable to allocate the next unique PO") from exc
    db.refresh(po)
    shared_materials=[(r.material_code,r.material_name,r.required_quantity,r.unit) for r in [*reqs,*bulk_reqs]]
    sync_pharma_order(db,po_number=po.po_number,batch_number=po.batch_number,planned_quantity=float(po.quantity),materials=shared_materials)
    mes_log(db,po_number=po.po_number,event_type="PO_CREATED",phase="Office Planning",operator_id="Production Scheduler",message=f"Approved material {material_number}: {variant['name']}")
    db.commit()
    return po

def list_production_orders(db): return list(db.scalars(select(ProductionOrder).order_by(ProductionOrder.id.desc())).all())
HAZARDOUS_CODES={"3K9958V90M","BUC5I9595W","FLV-STRAWBERRY-001","FLV-GRAPE-001","FLV-BERRY-001","ALT-ETH-001","ART-CHERRY-001","ART-STRAWBERRY-001","ART-GRAPE-001","ART-BERRY-001"}

def _hazard_class(code: str) -> str:
    return "Hazardous" if code in HAZARDOUS_CODES else "General"

def list_material_positions(db: Session):
    return list(db.scalars(select(MaterialPosition).order_by(MaterialPosition.location_code,MaterialPosition.material_name,MaterialPosition.lot_number)).all())

def list_material_movements(db: Session, limit: int=200):
    return list(db.scalars(select(MaterialMovement).order_by(MaterialMovement.id.desc()).limit(limit)).all())

def _campaign_pos(db: Session, campaign_id: str) -> tuple[ProductionCampaign, list[ProductionOrder]]:
    campaign=db.scalar(select(ProductionCampaign).where(ProductionCampaign.campaign_id==campaign_id))
    if not campaign: raise ValueError("Production campaign not found")
    po_numbers=[x.strip() for x in (campaign.po_numbers or "").split(",") if x.strip()]
    pos=[db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==number)) for number in po_numbers]
    return campaign,[po for po in pos if po is not None]

def accept_campaign_workload(db: Session, campaign_id: str, operator: str):
    campaign,pos=_campaign_pos(db,campaign_id)
    if not campaign.locked:
        raise ValueError("Campaign has been separated; accept the revised campaign from Office")
    if campaign.status in {"Accepted by Weighing","In Weighing","Material PR Submitted"}:
        return campaign
    campaign.status="Accepted by Weighing"
    campaign.accepted_by=operator
    campaign.accepted_at=utc_now()
    for po in pos:
        po.status="Weighing Workload Accepted"
    record_event(db,event_type="CampaignWorkloadAccepted",source="Weighing",entity_type="ProductionCampaign",entity_id=campaign_id,message=f"{operator} accepted interlocked campaign workload: {campaign.po_numbers}.",severity="info")
    for po in pos:
        mes_log(db,po_number=po.po_number,event_type="CAMPAIGN_WORKLOAD_ACCEPTED",phase="Weighing",operator_id=operator,message=f"{campaign_id} accepted as an interlocked workload")
    db.commit(); db.refresh(campaign); return campaign

def campaign_plant_inventory(db: Session, campaign_id: str):
    campaign,pos=_campaign_pos(db,campaign_id)
    po_numbers=[po.po_number for po in pos]

    requirements={}
    for po in pos:
        for req in po_requirements(db,po.po_number):
            if req.material_code in BULK_MATERIAL_CODES:
                continue
            key=(req.material_code,req.material_name,req.unit)
            requirements[key]=requirements.get(key,0.0)+float(req.required_quantity)

    # Live staging is location-driven. Do not hide a real staged container just
    # because a prior workflow used a different status label.
    staged=list(
        db.scalars(
            select(MaterialPosition)
            .where(MaterialPosition.location_code.in_(["CW-STAGE-01","CW-HAZ-01"]))
            .order_by(MaterialPosition.material_name, MaterialPosition.lot_number)
        ).all()
    )

    staged_by={}
    for row in staged:
        staged_by[row.material_code]=staged_by.get(row.material_code,0.0)+float(row.quantity)

    warehouse=supply_inventory(db)
    requirement_codes={key[0] for key in requirements}
    required_warehouse=[row for row in warehouse if row["material_code"] in requirement_codes]

    rows=[]
    approved_substitutes={}
    for (code,name,unit),total in requirements.items():
        subs=substitution_candidates(db,code)
        approved_substitutes[code]=subs
        rows.append({
            "material_code":code,
            "material_name":name,
            "unit":unit,
            "campaign_required":total,
            "staged_available":staged_by.get(code,0.0),
            "remaining_to_request":max(0.0,total-staged_by.get(code,0.0)),
            "hazard_class":_hazard_class(code),
            "warehouse_available":sum(
                max(0.0,float(x["quantity"])-float(x.get("reserved_quantity",0)))
                for x in required_warehouse if x["material_code"]==code
            ),
        })

    # R&D candidates are intentionally separated from approved substitutes.
    # Weighing may request Office to initiate R&D evaluation, but cannot use
    # these candidates directly in a production PR.
    candidates=[]
    if db.bind and db.bind.dialect.name=="postgresql":
        try:
            candidates=[
                dict(r) for r in db.execute(text("""
                    SELECT candidate_code, candidate_name, target_material_code,
                           approval_status
                    FROM public.material_alternative_qualifications
                    WHERE lower(approval_status) NOT IN ('approved','r&d approved')
                    ORDER BY candidate_name
                """)).mappings().all()
            ]
        except Exception:
            db.rollback()

    return {
        "campaign":{
            "campaign_id":campaign.campaign_id,
            "material_number":campaign.material_number,
            "po_numbers":po_numbers,
            "status":campaign.status,
            "locked":campaign.locked,
            "accepted_by":campaign.accepted_by,
        },
        "requirements":rows,
        "staging":[
            {
                "container_id":x.container_id,
                "material_code":x.material_code,
                "material_name":x.material_name,
                "lot_number":x.lot_number,
                "quantity":float(x.quantity),
                "unit":x.unit,
                "location_code":x.location_code,
                "hazard_class":x.hazard_class,
                "status":x.status,
            }
            for x in staged
        ],
        # Default Warehouse payload is restricted to PO-required material.
        "required_warehouse":required_warehouse,
        "approved_substitutes":approved_substitutes,
        # Full inventory is still available, but only when the operator elects
        # to open the advanced search view.
        "warehouse":warehouse,
        "rnd_candidates":candidates,
    }


def request_rnd_alternative_evaluation(
    db: Session,
    *,
    campaign_id: str,
    po_number: str,
    original_material_code: str,
    candidate_code: str,
    requester: str,
    note: str,
):
    campaign,pos=_campaign_pos(db,campaign_id)
    if po_number not in [p.po_number for p in pos]:
        raise ValueError("PO is not part of this campaign")

    row=db.execute(text("""
        SELECT candidate_code,candidate_name,target_material_code,approval_status
        FROM public.material_alternative_qualifications
        WHERE candidate_code=:candidate_code
        LIMIT 1
    """),{"candidate_code":candidate_code}).mappings().first()
    if not row:
        raise ValueError("R&D candidate material is not registered")
    if row["target_material_code"] != original_material_code:
        raise ValueError("Selected candidate is not registered against this required material")

    create_notification(
        db,
        recipient="Office",
        title="R&D alternative evaluation requested",
        message=(
            f"{campaign_id} / {po_number}: {requester} cannot satisfy "
            f"{original_material_code} from staged/approved inventory and requests "
            f"Office initiate R&D evaluation of {row['candidate_name']} "
            f"({row['candidate_code']}). {note}"
        ),
        severity="warning",
    )
    record_event(
        db,
        event_type="RnDAlternativeEvaluationRequested",
        source="Weighing",
        entity_type="ProductionCampaign",
        entity_id=campaign_id,
        message=f"{original_material_code} -> {row['candidate_code']}. {note}",
        severity="warning",
    )
    mes_log(
        db,
        po_number=po_number,
        event_type="RND_ALTERNATIVE_EVALUATION_REQUESTED",
        phase="Weighing",
        operator_id=requester,
        material_code=original_material_code,
        message=f"Office requested to initiate R&D evaluation of {row['candidate_name']}",
        severity="warning",
        qualified=False,
    )
    db.commit()
    return {
        "status":"sent_to_office",
        "campaign_id":campaign_id,
        "po_number":po_number,
        "candidate_code":row["candidate_code"],
        "candidate_name":row["candidate_name"],
    }

def request_campaign_separation(db: Session, campaign_id: str, po_number: str, requester: str, reason: str):
    campaign,pos=_campaign_pos(db,campaign_id)
    if po_number not in [p.po_number for p in pos]:
        raise ValueError("PO is not part of this campaign")
    existing=db.scalar(select(CampaignSeparationRequest).where(
        CampaignSeparationRequest.campaign_id==campaign_id,
        CampaignSeparationRequest.po_number==po_number,
        CampaignSeparationRequest.status=="Pending",
    ))
    if existing: return existing
    item=CampaignSeparationRequest(
        request_id=f"CSEP-{uuid4().hex[:10].upper()}",
        campaign_id=campaign_id,po_number=po_number,requested_by=requester,
        reason=reason,status="Pending",
    )
    db.add(item)
    create_notification(db,recipient="Office",title="Campaign separation approval required",message=f"{campaign_id}: {requester} requests removal of {po_number}. Reason: {reason}",severity="warning")
    record_event(db,event_type="CampaignSeparationRequested",source="Weighing",entity_type="ProductionCampaign",entity_id=campaign_id,message=f"{po_number}: {reason}",severity="warning")
    db.commit(); db.refresh(item); return item

def list_campaign_separation_requests(db: Session):
    return list(db.scalars(select(CampaignSeparationRequest).order_by(CampaignSeparationRequest.id.desc())).all())

def decide_campaign_separation(db: Session, request_id: str, approved: bool, note: str):
    item=db.scalar(select(CampaignSeparationRequest).where(CampaignSeparationRequest.request_id==request_id))
    if not item: raise ValueError("Campaign separation request not found")
    if item.status!="Pending": raise ValueError("Campaign separation request has already been decided")
    campaign,pos=_campaign_pos(db,item.campaign_id)
    item.status="Approved" if approved else "Denied"; item.decision_note=note
    if approved:
        remaining=[p.po_number for p in pos if p.po_number!=item.po_number]
        campaign.po_numbers=",".join(remaining)
        campaign.locked=True
        campaign.status="Pending Weigh Acceptance" if remaining else "Closed"
        campaign.accepted_by=None; campaign.accepted_at=None
        separated=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==item.po_number))
        if separated: separated.status="Separated - Office Replanning"
        create_notification(db,recipient="Weighing",title="Campaign separation approved",message=f"{item.po_number} removed from {item.campaign_id}. Re-accept revised campaign before continuing.",severity="info")
    else:
        create_notification(db,recipient="Weighing",title="Campaign separation denied",message=f"{item.po_number} remains interlocked in {item.campaign_id}.",severity="warning")
    record_event(db,event_type=f"CampaignSeparation{item.status}",source="Office",entity_type="ProductionCampaign",entity_id=item.campaign_id,message=note or item.status,severity="info" if approved else "warning")
    db.commit(); db.refresh(item); return item

def campaign_staging_readiness(db: Session, campaign_id: str):
    campaign,pos=_campaign_pos(db,campaign_id)
    requirements={}
    for po in pos:
        for req in po_requirements(db,po.po_number):
            if req.material_code in BULK_MATERIAL_CODES:
                continue
            key=(req.material_code,req.material_name,req.unit)
            requirements[key]=requirements.get(key,0.0)+float(req.required_quantity)

    staging=list(db.scalars(
        select(MaterialPosition).where(
            MaterialPosition.location_code.in_(["CW-STAGE-01","CW-HAZ-01"])
        )
    ).all())
    vestibule=list(db.scalars(
        select(MaterialPosition).where(
            MaterialPosition.location_code=="WH-VEST-01",
            MaterialPosition.campaign_id==campaign_id,
        )
    ).all())
    in_room=list(db.scalars(
        select(MaterialPosition).where(
            MaterialPosition.campaign_id==campaign_id,
            MaterialPosition.location_code.in_(["WR-01","WR-02"]),
        )
    ).all())

    staged_by={}
    for row in staging:
        staged_by[row.material_code]=staged_by.get(row.material_code,0.0)+float(row.quantity)
    room_by={}
    for row in in_room:
        room_by[row.material_code]=room_by.get(row.material_code,0.0)+float(row.quantity)

    lines=[]
    for (code,name,unit),required in requirements.items():
        available=staged_by.get(code,0.0)+room_by.get(code,0.0)
        lines.append({
            "material_code":code,
            "material_name":name,
            "unit":unit,
            "required":required,
            "available_for_bend":available,
            "shortage":max(0.0,required-available),
            "ready":available+1e-9>=required,
        })

    return {
        "campaign_id":campaign_id,
        "status":campaign.status,
        "po_numbers":[po.po_number for po in pos],
        "ready":all(x["ready"] for x in lines) and not vestibule,
        "vestibule_count":len(vestibule),
        "requirements":lines,
    }


def bend_campaign_to_weigh_room(db: Session, campaign_id: str, room_code: str, operator: str):
    campaign,pos=_campaign_pos(db,campaign_id)
    if campaign.status not in {"Accepted by Weighing","Material PR Submitted","In Weighing"}:
        raise ValueError("Accept the interlocked campaign workload before beginning the white-zone weigh process")

    assigned_rooms={po.weigh_room for po in pos}
    if len(assigned_rooms)!=1 or room_code not in assigned_rooms:
        raise ValueError(
            f"Campaign POs must share the same approved weigh room before bend-in. "
            f"Current assignments: {', '.join(sorted(assigned_rooms))}"
        )

    readiness=campaign_staging_readiness(db,campaign_id)
    if readiness["vestibule_count"]:
        raise ValueError("Material remains in the Weigh Vestibule. Accept and bend every delivered container into Chem Weigh Staging first.")
    blockers=[x for x in readiness["requirements"] if not x["ready"]]
    if blockers:
        raise ValueError("; ".join(
            f"{x['material_name']} short {x['shortage']:.3f} {x['unit']} in Chem Weigh Staging"
            for x in blockers
        ))

    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==room_code))
    if not room:
        raise ValueError("Unknown weigh room")

    room_status=(room.status or "").strip().lower()

    if room_status not in {"available","reserved","in use"}:
        raise ValueError(f"{room_code} is not available")

    required_codes={x["material_code"] for x in readiness["requirements"]}
    staged=list(db.scalars(
        select(MaterialPosition).where(
            MaterialPosition.location_code.in_(["CW-STAGE-01","CW-HAZ-01"]),
            MaterialPosition.material_code.in_(required_codes),
        ).order_by(MaterialPosition.material_name,MaterialPosition.lot_number)
    ).all())
    if not staged:
        raise ValueError("No Chem Weigh Staging containers are available for campaign bend-in")

    for material in staged:
        material.campaign_id=campaign_id
        material.po_number=None
        _move_position(db,material,room_code,"BEND_STAGING_TO_WEIGH_ROOM",operator)
        material.status="In Weigh Room - Campaign Stock"

    incomplete=[]
    for po in pos:
        ticket=db.scalar(select(WeighTicket).where(WeighTicket.po_number==po.po_number))
        if not ticket or ticket.status!="Complete":
            incomplete.append(po)
        po.status="In Weigh Room - Awaiting Dispense"

    campaign.status="In Weighing"
    room.status="In Use"
    first_task=campaign_weigh_sequence(db,campaign_id)
    room.active_po=first_task["po_number"] or pos[0].po_number

    record_event(
        db,event_type="CampaignBentIntoWeighRoom",source="Weighing",
        entity_type="ProductionCampaign",entity_id=campaign_id,
        message=f"{operator} bent complete staged campaign into {room_code} after vestibule and staging verification.",
        severity="info",
    )
    for po in pos:
        mes_log(
            db,po_number=po.po_number,event_type="CAMPAIGN_BEND_TO_WEIGH_ROOM",
            phase="Weighing",equipment_id=room_code,operator_id=operator,
            message=f"{campaign_id}: Chem Weigh Staging -> {room_code}",
        )
    db.commit()
    return campaign_staging_readiness(db,campaign_id)


def list_material_prs(db: Session):
    return list(db.scalars(select(MaterialPR).order_by(MaterialPR.id.desc())).all())

def material_pr_workspace(db: Session, pr_number: str):
    pr=db.scalar(select(MaterialPR).where(MaterialPR.pr_number==pr_number))
    if not pr: raise ValueError("Material PR not found")
    lines=list(db.scalars(select(MaterialPRLine).where(MaterialPRLine.pr_number==pr_number).order_by(MaterialPRLine.pick_sequence,MaterialPRLine.id)).all())
    return {"pr":pr,"lines":lines}

def _staged_available(db: Session, material_code: str) -> float:
    rows=db.scalars(select(MaterialPosition).where(
        MaterialPosition.material_code==material_code,
        MaterialPosition.location_code.in_(["CW-STAGE-01","CW-HAZ-01"]),
        MaterialPosition.status.in_(["Available","Staged"]),
    )).all()
    return sum(float(x.quantity) for x in rows)

def create_material_pr(db: Session, payload):
    campaign=None; campaign_pos=[]
    if payload.campaign_id:
        campaign,campaign_pos=_campaign_pos(db,payload.campaign_id)
        if campaign.locked and campaign.status not in {"Accepted by Weighing","In Weighing","Material PR Submitted"}:
            raise ValueError("Accept the interlocked campaign workload before raising a Material PR")
        if payload.po_number not in [p.po_number for p in campaign_pos]:
            raise ValueError("Selected PO is not part of the accepted campaign")
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==payload.po_number))
    if not po: raise ValueError("Production order not found")
    existing=db.scalar(select(MaterialPR).where(
        MaterialPR.campaign_id==payload.campaign_id if payload.campaign_id else MaterialPR.po_number==payload.po_number,
        MaterialPR.status.notin_(["Closed","Cancelled"])
    ))
    if existing: raise ValueError(f"Active Material PR already exists: {existing.pr_number}")
    if not payload.lines:
        raise ValueError("Select material and warehouse lot(s) before submitting the PR")
    pr_number=f"PR-{utc_now().strftime('%y%m%d')}-{(db.scalar(select(MaterialPR.id).order_by(MaterialPR.id.desc()).limit(1)) or 0)+1:04d}"
    pr=MaterialPR(pr_number=pr_number,po_number=po.po_number,campaign_id=payload.campaign_id,requested_by=payload.operator,weigh_room=po.weigh_room,status="Submitted",destination="WH-VEST-01")
    db.add(pr); db.flush()
    seq=1
    for requested in payload.lines:
        lot=supply_lot_detail(db,requested.lot_number)
        if not lot or str(lot["status"]).lower() not in {"available","released","reserved"}:
            raise ValueError(f"{requested.lot_number} is not a selectable plant inventory lot")
        if lot["material_code"]!=requested.material_code:
            raise ValueError(f"{requested.lot_number} does not belong to {requested.material_name}")
        if float(lot["available_quantity"]) + 1e-9 < float(requested.requested_quantity):
            raise ValueError(f"{requested.lot_number} only has {lot['available_quantity']} {requested.unit} available")
        db.add(MaterialPRLine(
            pr_number=pr_number,po_number=requested.po_number or None,
            material_code=requested.material_code,material_name=requested.material_name,
            lot_number=requested.lot_number,requested_quantity=requested.requested_quantity,
            picked_quantity=0,unit=requested.unit,source_location=requested.source_location,
            hazard_class=requested.hazard_class or _hazard_class(requested.material_code),
            pick_sequence=seq,status="Requested",
        )); seq+=1
    to=WarehouseTransferOrder(to_number=f"TO-{pr_number}",po_number=po.po_number,priority="Normal",destination="Weigh Vestibule",status="Pending",owner="Warehouse Queue")
    db.add(to)
    if campaign:
        campaign.status="Material PR Submitted"
        for cpo in campaign_pos: cpo.status="Material PR Submitted"
    else:
        po.status="Material PR Submitted"
    record_event(db,event_type="MaterialPRSubmitted",source="Weighing",entity_type="MaterialPR",entity_id=pr_number,message=f"{payload.operator} submitted {pr_number} with {len(payload.lines)} selected lot line(s) to Warehouse.",severity="info")
    for cpo in (campaign_pos or [po]):
        mes_log(db,po_number=cpo.po_number,event_type="MATERIAL_PR_CREATED",phase="Weighing",operator_id=payload.operator,message=f"{pr_number}: operator-selected plant inventory lots")
    db.commit(); db.refresh(pr); return pr

def _move_position(db: Session, pos: MaterialPosition, to_location: str, movement_type: str, operator: str):
    old=pos.location_code
    pos.location_code=to_location; pos.updated_at=utc_now()
    mv=MaterialMovement(movement_id=f"MOV-{uuid4().hex[:12].upper()}",container_id=pos.container_id,material_code=pos.material_code,lot_number=pos.lot_number,quantity=pos.quantity,unit=pos.unit,from_location=old,to_location=to_location,movement_type=movement_type,operator=operator,po_number=pos.po_number,pr_number=pos.pr_number)
    db.add(mv)
    record_event(db,event_type=movement_type,source="Inventory Management",entity_type="MaterialContainer",entity_id=pos.container_id,message=f"{pos.material_name} {pos.lot_number}: {old} → {to_location} by {operator}.",severity="info")
    if pos.po_number: mes_log(db,po_number=pos.po_number,event_type=movement_type,phase="Material Movement",operator_id=operator,material_code=pos.material_code,material_name=pos.material_name,lot_number=pos.lot_number,quantity=pos.quantity,unit=pos.unit,message=f"{old} -> {to_location}")
    return mv

def bend_from_vestibule(db: Session, container_id: str, operator: str):
    pos=db.scalar(select(MaterialPosition).where(MaterialPosition.container_id==container_id))
    if not pos or pos.location_code!="WH-VEST-01":
        raise ValueError("Container must be in the Weigh Vestibule")

    dest="CW-HAZ-01" if pos.hazard_class=="Hazardous" else "CW-STAGE-01"
    movement_type="BEND_TO_HAZARDOUS_STAGING" if dest=="CW-HAZ-01" else "BEND_TO_STANDARD_STAGING"

    # If the identical material / lot is already physically present in the
    # destination staging area, inventory management should show one position
    # with a combined quantity rather than duplicate rows.
    existing=db.scalar(
        select(MaterialPosition)
        .where(
            MaterialPosition.id != pos.id,
            MaterialPosition.location_code == dest,
            MaterialPosition.material_code == pos.material_code,
            MaterialPosition.lot_number == pos.lot_number,
            MaterialPosition.unit == pos.unit,
            MaterialPosition.status.notin_(["Consumed","Scrapped"]),
        )
        .order_by(MaterialPosition.id)
        .limit(1)
    )

    if existing:
        incoming_qty=float(pos.quantity)

        # Preserve the incoming container's custody movement in the audit trail
        # before consolidating the live inventory position.
        old_location=pos.location_code
        mv=MaterialMovement(
            movement_id=f"MOV-{uuid4().hex[:12].upper()}",
            container_id=pos.container_id,
            material_code=pos.material_code,
            lot_number=pos.lot_number,
            quantity=incoming_qty,
            unit=pos.unit,
            from_location=old_location,
            to_location=dest,
            movement_type=movement_type,
            operator=operator,
            po_number=pos.po_number,
            pr_number=pos.pr_number,
        )
        db.add(mv)

        existing.quantity=float(existing.quantity)+incoming_qty
        existing.status="Staged"
        existing.updated_at=utc_now()

        record_event(
            db,
            event_type=movement_type,
            source="Inventory Management",
            entity_type="MaterialContainer",
            entity_id=pos.container_id,
            message=(
                f"{pos.material_name} {pos.lot_number}: {old_location} → {dest} "
                f"by {operator}; merged {incoming_qty:g} {pos.unit} into staged "
                f"container {existing.container_id}. New staged quantity "
                f"{float(existing.quantity):g} {existing.unit}."
            ),
            severity="info",
        )
        if pos.po_number:
            mes_log(
                db,
                po_number=pos.po_number,
                event_type=movement_type,
                phase="Material Movement",
                operator_id=operator,
                material_code=pos.material_code,
                material_name=pos.material_name,
                lot_number=pos.lot_number,
                quantity=incoming_qty,
                unit=pos.unit,
                message=f"{old_location} -> {dest}; merged into {existing.container_id}",
            )

        # The incoming container has been physically consolidated into the
        # existing staged lot position. Keep genealogy in material_movements,
        # but remove the duplicate live-position row.
        db.delete(pos)
        db.commit()
        db.refresh(existing)
        return existing

    _move_position(db,pos,dest,movement_type,operator)
    pos.status="Staged"
    db.commit()
    db.refresh(pos)
    return pos

def bend_container_to_room(db: Session, container_id: str, room_code: str, operator: str, po_number: str | None = None):
    pos=db.scalar(select(MaterialPosition).where(MaterialPosition.container_id==container_id))
    if not pos or pos.location_code not in {"CW-STAGE-01","CW-HAZ-01"}: raise ValueError("Container must first be bent from the Vestibule into Chem Weigh Staging")
    target_po=po_number or pos.po_number
    if pos.campaign_id:
        campaign,cpos=_campaign_pos(db,pos.campaign_id)
        if campaign.status not in {"Accepted by Weighing","Material PR Submitted","In Weighing"}:
            raise ValueError("Campaign workload must be accepted before bending material into a weigh room")
        if target_po not in [p.po_number for p in cpos]:
            raise ValueError("Select a PO from the interlocked campaign before bending into the room")
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==target_po)) if target_po else None
    if not po: raise ValueError("Select the target PO before bending material into the weigh room")
    if po.weigh_room!=room_code: raise ValueError(f"{po.po_number} is assigned to {po.weigh_room}, not {room_code}")
    pos.po_number=po.po_number
    _move_position(db,pos,room_code,"BEND_TO_WEIGH_ROOM",operator); pos.status="In Weigh Room"; db.commit(); db.refresh(pos); return pos

def list_warehouse_queue(db):
    weights={"Critical":0,"High":1,"Normal":2,"Low":3}
    rows=list(db.scalars(select(WarehouseTransferOrder)).all())
    return sorted(rows,key=lambda x:(weights.get(x.priority,9),x.id))
def list_inventory(db):
    return supply_inventory(db)
def po_requirements(db,po_number): return list(db.scalars(select(MaterialRequirement).where(MaterialRequirement.po_number==po_number).order_by(MaterialRequirement.id)).all())

def material_comparison(db,po_number):
    # Bulk materials remain on the PO/MES genealogy, but they never enter the
    # Warehouse -> Chem Weigh Staging -> PAS-X dispense path.
    reqs=[r for r in po_requirements(db,po_number) if r.material_code not in BULK_MATERIAL_CODES]
    result=[]
    for r in reqs:
      lots=supply_lots(db,r.material_code)
      available=sum(max(0,float(l["available_quantity"])) for l in lots)
      released=[l for l in lots if float(l["available_quantity"])>=r.required_quantity]
      recommended=released[0]["internal_lot_number"] if released else None
      assigned=next((l for l in lots if l["internal_lot_number"]==r.assigned_lot),None) if r.assigned_lot else None

      alt_options=substitution_candidates(db,r.material_code)
      alt=next(
          (
              x for x in alt_options
              if float(x["available_quantity"]) >= float(r.required_quantity)
          ),
          alt_options[0] if alt_options else None,
      )

      if r.assigned_lot and not assigned and r.status!="Approved Alternate":
        status="Blocked"
        warning=f"Scheduled lot {r.assigned_lot} is not released/available in Supply. Use {recommended or 'another released lot'}."
      elif released:
        status="Ready"; warning=None
      elif available>=r.required_quantity:
        status="Blocked"; warning="Quantity exists, but no single released FEFO lot can satisfy the requirement."
      else:
        status="Shortage"; warning=f"Short by {r.required_quantity-available:.2f} {r.unit}."

      result.append(dict(
          material_code=r.material_code,
          material_name=r.material_name,
          required_quantity=r.required_quantity,
          unit=r.unit,
          available_quantity=available,
          released_quantity=available,
          status=status,
          recommended_lot=recommended,
          warning=warning,
          recommended_substitute_material_code=alt["material_code"] if alt else None,
          recommended_substitute_material_name=alt["material_name"] if alt else None,
          recommended_substitute_lot=alt["internal_lot_number"] if alt else None,
          recommended_substitute_available=float(alt["available_quantity"]) if alt else None,
      ))
    return result

def workspace(db,po_number):
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==po_number))
    if not po: raise ValueError("Production order not found")
    cmp=material_comparison(db,po_number)
    return {"production_order":po,"requirements":po_requirements(db,po_number),"comparison":cmp,"ready_for_release":all(x["status"]=="Ready" for x in cmp)}

def request_substitution(db, payload):
    req=db.scalar(select(MaterialRequirement).where(
        MaterialRequirement.po_number==payload.po_number,
        MaterialRequirement.material_code==payload.material_code,
    ))
    if not req: raise ValueError("Production material requirement not found")

    candidate=supply_lot_detail(db,payload.proposed_lot)
    if not candidate or str(candidate["status"]).lower() not in {"available","released"}:
        raise ValueError("Proposed lot is not valid/released")

    permitted={payload.material_code}
    permitted.update(x["material_code"] for x in substitution_candidates(db,payload.material_code))
    if candidate["material_code"] not in permitted:
        raise ValueError("Proposed material is not an approved emergency alternate for this requirement")

    item=SubstitutionRequest(
        request_id=f"SUB-{uuid4().hex[:8].upper()}",
        po_number=payload.po_number,
        material_code=payload.material_code,
        current_lot=req.assigned_lot,
        proposed_lot=payload.proposed_lot,
        reason=payload.reason,
        status="Pending",
    )
    db.add(item)
    create_notification(
        db,
        recipient="Office",
        title="Material substitution approval required",
        message=(
            f"{payload.po_number}: Warehouse requests {candidate['material_name']} "
            f"({candidate['material_code']}) lot {payload.proposed_lot} as an emergency "
            f"alternate for {req.material_name}."
        ),
        severity="warning",
    )
    record_event(
        db,event_type="SubstitutionRequested",source="Warehouse",
        entity_type="SubstitutionRequest",entity_id=item.request_id,
        message=(
            f"{req.material_name} -> {candidate['material_name']} "
            f"lot {payload.proposed_lot}. {item.reason}"
        ),
        severity="warning",
    )
    mes_log(
        db,po_number=payload.po_number,event_type="SUBSTITUTION_REQUESTED",
        phase="Warehouse",operator_id="Warehouse Operator",
        material_code=payload.material_code,material_name=req.material_name,
        message=f"Requested emergency alternate {candidate['material_name']} lot {payload.proposed_lot}",
        severity="warning",qualified=False,
    )
    db.commit(); db.refresh(item); return item

def list_substitutions(db): return list(db.scalars(select(SubstitutionRequest).order_by(SubstitutionRequest.id.desc())).all())
def decide_substitution(db,request_id,approved,note):
    item=db.scalar(select(SubstitutionRequest).where(SubstitutionRequest.request_id==request_id))
    if not item: raise ValueError("Substitution request not found")
    if item.status!="Pending": raise ValueError("Substitution request has already been decided")

    req=db.scalar(select(MaterialRequirement).where(
        MaterialRequirement.po_number==item.po_number,
        MaterialRequirement.material_code==item.material_code,
    ))
    candidate=supply_lot_detail(db,item.proposed_lot)

    item.status="Approved" if approved else "Denied"
    item.decision_note=note

    if approved:
      if not req: raise ValueError("Original material requirement no longer exists")
      if not candidate: raise ValueError("Requested alternate lot no longer exists")
      original_code=req.material_code
      original_name=req.material_name
      req.material_code=candidate["material_code"]
      req.material_name=candidate["material_name"]
      req.unit=candidate["unit_of_measure"]
      req.assigned_lot=item.proposed_lot
      req.status="Approved Alternate"
      apply_pharma_material_substitution(
          db,
          po_number=item.po_number,
          original_material_code=original_code,
          substitute_material_code=candidate["material_code"],
          substitute_material_name=candidate["material_name"],
          unit=candidate["unit_of_measure"],
      )
      mes_log(
          db,po_number=item.po_number,event_type="SUBSTITUTION_APPROVED",
          phase="Office",operator_id="Production Scheduler",
          material_code=candidate["material_code"],material_name=candidate["material_name"],
          lot_number=item.proposed_lot,
          message=f"Approved alternate for {original_name} ({original_code})",
          severity="warning",qualified=True,
      )

    create_notification(
        db,recipient="Warehouse",title=f"Substitution {item.status.lower()}",
        message=f"{item.request_id} for {item.po_number}: {item.status}.",
        severity="info" if approved else "error",
    )
    record_event(
        db,event_type=f"Substitution{item.status}",source="Office",
        entity_type="SubstitutionRequest",entity_id=item.request_id,
        message=note or item.status,severity="info" if approved else "warning",
    )
    db.commit(); db.refresh(item); return item

def warehouse_action(db,to_number,action,operator):
    to=db.scalar(select(WarehouseTransferOrder).where(WarehouseTransferOrder.to_number==to_number))
    if not to: raise ValueError("Transfer order not found")
    if action=="accept":
      if to.status!="Pending": raise ValueError("Only pending orders can be accepted")
      to.status="Accepted"; to.owner=operator
    elif action=="pick":
      if to.status not in {"Accepted","Picking","Blocked"}: raise ValueError("Accept the order before picking")
      is_finished_goods = to.to_number.startswith("TO-FG-")
      if not is_finished_goods and not to.to_number.startswith("TO-PR-"):
        cmp=material_comparison(db,to.po_number); blockers=[x for x in cmp if x["status"]!="Ready"]
        approved_codes={x.material_code for x in db.scalars(select(SubstitutionRequest).where(SubstitutionRequest.po_number==to.po_number,SubstitutionRequest.status=="Approved")).all()}
        unresolved=[x for x in blockers if x["material_code"] not in approved_codes]
        if unresolved:
          to.status="Blocked"; to.blocker="; ".join(f"{x['material_name']}: {x['warning']}" for x in unresolved); db.commit(); raise ValueError(to.blocker)
      # PR-driven automatic pick. Each selected lot becomes a traceable container.
      to.status="Picking"; to.progress=0; to.blocker=None
      if to.to_number.startswith("TO-PR-"):
        pr_number=to.to_number[3:]
        pr=db.scalar(select(MaterialPR).where(MaterialPR.pr_number==pr_number))
        lines=list(db.scalars(select(MaterialPRLine).where(MaterialPRLine.pr_number==pr_number).order_by(MaterialPRLine.pick_sequence)).all()) if pr else []
        total=max(1,len(lines))
        for idx,line in enumerate(lines,1):
          line.status="Picking"
          consume_supply_lot(db,line.lot_number,float(line.requested_quantity))
          line.picked_quantity=float(line.requested_quantity); line.status="Picked"
          pos=MaterialPosition(container_id=f"CNT-{pr_number}-{line.id:03d}",material_code=line.material_code,material_name=line.material_name,lot_number=line.lot_number,quantity=line.picked_quantity,unit=line.unit,location_code=line.source_location,status="Picked",hazard_class=line.hazard_class,campaign_id=pr.campaign_id if pr else None,po_number=line.po_number,pr_number=pr_number)
          db.add(pos); db.flush(); _move_position(db,pos,"WH-VEST-01","WAREHOUSE_TO_VESTIBULE",operator); pos.status="Awaiting Weigh Operator Receipt"
          to.progress=round(idx/total*100)
        if pr: pr.status="Delivered to Vestibule"
      else:
        for progress in (20,40,60,80,100): to.progress=progress
      to.status="Picked"
      if is_finished_goods:
        po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==to.po_number))
        run=db.scalar(select(PackagingRun).where(PackagingRun.po_number==to.po_number))
        gross=run.bottles_completed if run else 0
        rejects=run.rejects if run else 0
        completed=max(0,gross-rejects)
        planned=po.quantity if po else 0
        if completed < planned:
          shortage=round(planned-completed)
          approved=db.scalar(select(RouteChangeRequest).where(
              RouteChangeRequest.po_number==to.po_number,
              RouteChangeRequest.resource_type=="finished_goods_quantity",
              RouteChangeRequest.requested_resource==str(completed),
              RouteChangeRequest.status=="Approved",
          ))
          if not approved:
            to.status="Blocked"
            to.blocker=f"FG reconciliation required: {completed} good bottles of {planned} planned; exact shortfall {shortage}. Office approval required before pickup."
            create_notification(db,recipient="Office",title="Finished-goods reconciliation required",message=f"{to.po_number}: {completed} good bottles, {rejects} rejects, exact shortfall {shortage}.",severity="warning")
            record_event(db,event_type="FGReconciliationRequired",source="Warehouse",entity_type="WarehouseTransferOrder",entity_id=to.to_number,message=to.blocker,severity="warning")
            db.commit()
            raise ValueError(to.blocker)
    elif action=="deliver":
      if to.status!="Picked": raise ValueError("Order must be fully picked before delivery")
      is_finished_goods = to.to_number.startswith("TO-FG-")
      to.status="Delivered"; to.progress=100; to.owner="Shipping Dock" if is_finished_goods else ("Weigh Vestibule" if to.to_number.startswith("TO-PR-") else "Chem Weigh Staging")
      po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==to.po_number))
      if po: po.status="Staged for Shipment" if is_finished_goods else ("At Weigh Vestibule" if to.to_number.startswith("TO-PR-") else "Delivered to Weighing")
    else: raise ValueError("Unknown warehouse action")
    record_event(db,event_type=f"Warehouse{action.title()}",source="Warehouse",entity_type="WarehouseTransferOrder",entity_id=to.to_number,message=f"{operator} completed {action} for {to.to_number}.",severity="info")
    db.commit(); db.refresh(to); return to

def create_training_session(db,payload:TrainingSessionCreate):
    if payload.role not in TRAINING_ROLES: raise ValueError("Unknown training role")
    s=TrainingSession(session_id=f"TR-{uuid4().hex[:10].upper()}",role=payload.role,difficulty=payload.difficulty,score=0,status="In Progress")
    db.add(s); record_event(db,event_type="TrainingSessionStarted",source="Training Academy",entity_type="TrainingSession",entity_id=s.session_id,message=f"Fresh {payload.difficulty} session started for {payload.role}.",severity="info"); db.commit(); db.refresh(s); return s

def advance_training_session(db, session_id: str, payload: TrainingStepComplete):
    session = db.scalar(select(TrainingSession).where(TrainingSession.session_id == session_id))
    if not session:
        raise ValueError("Training session not found")
    if session.status == "Completed":
        return session

    increment = {"Beginner": 25, "Intermediate": 20, "Advanced": 20}.get(session.difficulty, 20)
    if payload.correct:
        session.score = min(100, session.score + increment)
    else:
        session.score = max(0, session.score - 5)

    session.status = "Completed" if session.score >= 100 else "In Progress"
    step_number = max(1, (session.score + increment - 1) // increment)
    record_event(
        db,
        event_type="TrainingStepCompleted" if payload.correct else "TrainingStepRetried",
        source="Training Academy",
        entity_type="TrainingSession",
        entity_id=session.session_id,
        message=(
            f"{session.role} training advanced to {session.score}% on step {step_number}."
            if payload.correct
            else f"{session.role} training answer requires retry. Score adjusted to {session.score}%."
        ),
        severity="info" if payload.correct else "warning",
    )
    if session.status == "Completed":
        record_event(
            db,
            event_type="TrainingSessionCompleted",
            source="Training Academy",
            entity_type="TrainingSession",
            entity_id=session.session_id,
            message=f"{session.role} completed {session.difficulty} training with a score of {session.score}%.",
            severity="info",
        )
    db.commit()
    db.refresh(session)
    return session
def list_events(db,limit=50): return list(db.scalars(select(PlatformEvent).order_by(PlatformEvent.id.desc()).limit(limit)).all())
def list_notifications(db,recipient=None):
    q=select(Notification); q=q.where(Notification.recipient==recipient) if recipient else q; return list(db.scalars(q.order_by(Notification.id.desc())).all())
def check_scheduler_conflicts(payload:SchedulerConflictRequest):
    requested={"weigh_room":payload.weigh_room,"mix_tank":payload.mix_tank,"hold_tank":payload.hold_tank,"packaging_line":payload.packaging_line}; labels={"weigh_room":"Weigh room","mix_tank":"Mix tank","hold_tank":"Hold tank","packaging_line":"Packaging line"}; conflicts=[]
    for typ,rid in requested.items():
      po=DEMO_RESERVATIONS[typ].get(rid)
      if po: conflicts.append(SchedulerConflict(resource_type=typ,resource_id=rid,conflicting_po=po,message=f"{labels[typ]} {rid} is reserved by {po}."))
    return SchedulerConflictResponse(available=not conflicts,conflicts=conflicts)


def bend_cart_into_room(db: Session, po_number: str, room_code: str, operator: str):
    ensure_weigh_rooms(db)
    transfer=db.scalar(select(WarehouseTransferOrder).where(WarehouseTransferOrder.po_number==po_number))
    if not transfer: raise ValueError("Warehouse transfer order not found")
    staged=db.scalars(select(MaterialPosition).where(MaterialPosition.po_number==po_number,MaterialPosition.location_code.in_(["CW-STAGE-01","CW-HAZ-01"]))).all()
    vestibule=db.scalars(select(MaterialPosition).where(MaterialPosition.po_number==po_number,MaterialPosition.location_code=="WH-VEST-01")).all()
    if vestibule: raise ValueError("All delivered containers must first be bent from Weigh Vestibule into general/hazardous Chem Weigh Staging")
    if not staged: raise ValueError("No staged material is available to bend into the weigh room")
    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==room_code))
    if not room: raise ValueError("Unknown weigh room")
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==po_number))
    if not po: raise ValueError("Production order not found")
    # Warehouse delivers only to the controlled Chem Weigh Staging boundary.
    # The scheduled white-zone room is carried separately on the PO and is
    # enforced only when the weighing operator bends the staged cart in.
    if po.weigh_room != room_code:
        raise ValueError(f"{po_number} is scheduled for {po.weigh_room}, not {room_code}. Request and approve a room change first.")
    if (room.status or "").lower() not in {"available", "reserved"}: raise ValueError(f"{room.room_code} is not available")
    if room.active_po and room.active_po != po_number: raise ValueError(f"{room.room_code} is reserved for {room.active_po}")
    transfer.status="Bent Into Room"
    transfer.owner=f"{room_code} Weigh Operator"
    room.status="Reserved"
    room.active_po=po_number
    po.status="In Weigh Room"
    record_event(db,event_type="CartBentIntoRoom",source="Weighing",entity_type="WarehouseTransferOrder",entity_id=transfer.to_number,message=f"{operator} bent {transfer.to_number} into {room_code}.",severity="info")
    db.commit(); db.refresh(transfer); return transfer

def ensure_weigh_rooms(db: Session):
    if db.scalar(select(WeighRoom.id).limit(1)):
        return
    db.add_all([
        WeighRoom(room_code="WR-01", name="Weigh Room 1", scale_id="BAL-WR01-01", calibration_due="2026-12-31"),
        WeighRoom(room_code="WR-02", name="Weigh Room 2", scale_id="BAL-WR02-01", calibration_due="2026-11-30"),
    ])
    db.commit()

def list_weigh_rooms(db: Session):
    ensure_weigh_rooms(db)
    return list(db.scalars(select(WeighRoom).order_by(WeighRoom.room_code)).all())

def list_weigh_tickets(db: Session):
    return list(db.scalars(select(WeighTicket).order_by(WeighTicket.id.desc())).all())

def ticket_scale_materials(db: Session, ticket_number: str, scale_type: str):
    ticket=get_ticket(db,ticket_number)
    allowed={"Bench Scale","Hazardous Scale","Dye Scale Booth"}
    if scale_type not in allowed:
        raise ValueError("Select Bench Scale, Hazardous Scale, or Dye Scale Booth")
    return list(db.scalars(
        select(WeighTicketLine).where(
            WeighTicketLine.ticket_number==ticket.ticket_number,
            WeighTicketLine.scale_type==scale_type,
            WeighTicketLine.status!="Complete",
        ).order_by(WeighTicketLine.id)
    ).all())


def get_ticket(db: Session, ticket_number: str):
    ticket=db.scalar(select(WeighTicket).where(WeighTicket.ticket_number==ticket_number))
    if not ticket: raise ValueError("Weigh ticket not found")
    return ticket

def ticket_workspace(db: Session, ticket_number: str):
    ticket=get_ticket(db,ticket_number)
    lines=list(db.scalars(select(WeighTicketLine).where(WeighTicketLine.ticket_number==ticket_number).order_by(WeighTicketLine.id)).all())

    campaign=next(
        (c for c in list_campaigns(db)
         if ticket.po_number in [x.strip() for x in (c.po_numbers or "").split(",")]),
        None,
    )
    current=None
    if campaign:
        task=campaign_weigh_sequence(db,campaign.campaign_id)
        if task.get("phase")=="dispense" and task.get("po_number")==ticket.po_number:
            if task.get("line_id"):
                current=next((line for line in lines if line.id==task["line_id"]),None)
            if current is None and task.get("material_code"):
                current=next(
                    (line for line in lines
                     if line.material_code==task["material_code"] and line.status!="Complete"),
                    None,
                )
    if current is None:
        current=next((line for line in lines if line.status!="Complete"),None)

    complete=sum(1 for line in lines if line.status=="Complete")
    pct=100 if lines and complete==len(lines) else int((complete/len(lines))*100) if lines else 0
    return dict(ticket=ticket,lines=lines,current_line=current,completion_percent=pct)

SCALE_ASSIGNMENTS = {
    "Prednisolone": "Bench Scale",
    "Anhydrous Citric Acid": "Bench Scale",
    "Benzoic Acid": "Bench Scale",
    "Edetate Disodium": "Bench Scale",
    "Saccharin Sodium": "Bench Scale",
    "Alcohol": "Hazardous Scale",
    "Cherry": "Hazardous Scale", "Strawberry": "Hazardous Scale", "Grape": "Hazardous Scale", "Berry": "Hazardous Scale",
    "FD&C Blue No. 1": "Dye Scale Booth", "FD&C Red No. 40": "Dye Scale Booth",
    "FD&C Red No. 33": "Dye Scale Booth", "FD&C Yellow No. 5": "Dye Scale Booth",
}

def _scale_for_material(name: str) -> str:
    return SCALE_ASSIGNMENTS.get(name, "Bench Scale")

def create_campaign(db: Session, po_numbers: list[str]):
    if not 1 <= len(po_numbers) <= 4: raise ValueError("Select 1-4 POs")
    pos=[db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==n)) for n in po_numbers]
    if any(p is None for p in pos): raise ValueError("One or more POs were not found")
    material_numbers={p.material_number for p in pos}
    if len(material_numbers)!=1: raise ValueError("Campaign POs must use the same approved material number")
    material_number=next(iter(material_numbers))
    campaign=ProductionCampaign(campaign_id=f"RUN-{material_number}-{uuid4().hex[:6].upper()}",material_number=material_number,po_numbers=",".join(po_numbers),status="Pending Weigh Acceptance",locked=True)
    db.add(campaign)
    for po in pos: po.status="Campaign Interlocked - Awaiting Weigh Acceptance"
    mes_log(db,po_number=po_numbers[0],event_type="CAMPAIGN_CREATED",phase="Office Planning",operator_id="Production Scheduler",message=f"{campaign.campaign_id}: {', '.join(po_numbers)}")
    db.commit(); db.refresh(campaign); return campaign

def create_production_run(db: Session, payload):
    """Generate 1-4 sequential POs for one approved material and immediately group them into a campaign."""
    campaign_size = int(payload.campaign_size)
    if campaign_size < 1 or campaign_size > 4:
        raise ValueError("Production run must contain 1-4 POs")

    order_payload = ProductionOrderCreate(**payload.model_dump(exclude={"campaign_size"}))
    created = []
    for _ in range(campaign_size):
        created.append(create_production_order(db, order_payload))

    campaign = create_campaign(db, [po.po_number for po in created])
    for po in created:
        db.refresh(po)
    return {"campaign": campaign, "production_orders": created}


def list_campaigns(db: Session):
    return list(db.scalars(select(ProductionCampaign).order_by(ProductionCampaign.id.desc())).all())

def request_material_shortage(db: Session, payload):
    shortage=max(0.0,float(payload.required_remaining)-float(payload.available_quantity))
    create_notification(db,recipient="Office",title="Material shortage - unload request required",message=f"{payload.po_number}: {payload.material_name} short {shortage:.3f}. Weighing requests Office raise an unload/replenishment request.",severity="warning")
    mes_log(db,po_number=payload.po_number,event_type="MATERIAL_SHORTAGE_ESCALATED",phase="Weighing",operator_id=payload.requester,material_code=payload.material_code,material_name=payload.material_name,quantity=shortage,unit="native",message="Office unload/replenishment request required",severity="warning",qualified=False)
    db.commit(); return {"status":"sent","shortage":shortage}

def campaign_weigh_sequence(db: Session, campaign_id: str):
    """Material-major campaign sequence: material 1 across all POs, then material 2."""
    campaign,pos=_campaign_pos(db,campaign_id)
    if not pos:
        raise ValueError("Campaign has no production orders")

    po_numbers=[po.po_number for po in pos]
    first_requirements=[r for r in po_requirements(db,po_numbers[0]) if r.material_code not in BULK_MATERIAL_CODES]
    material_order=[]
    for req in first_requirements:
        if req.material_code not in material_order:
            material_order.append(req.material_code)

    tickets={
        t.po_number:t
        for t in db.scalars(select(WeighTicket).where(WeighTicket.po_number.in_(po_numbers))).all()
    }

    for material_code in material_order:
        for po in pos:
            ticket=tickets.get(po.po_number)
            if not ticket:
                req=next((r for r in po_requirements(db,po.po_number) if r.material_code==material_code),None)
                return {
                    "campaign_id":campaign_id,"phase":"dispense","po_number":po.po_number,
                    "material_code":material_code,
                    "material_name":req.material_name if req else material_code,
                    "ticket_number":None,"requires_ticket":True,
                }
            lines=list(db.scalars(select(WeighTicketLine).where(
                WeighTicketLine.ticket_number==ticket.ticket_number,
                WeighTicketLine.material_code==material_code,
            ).order_by(WeighTicketLine.id)).all())
            current=next((line for line in lines if line.status!="Complete"),None)
            if current:
                return {
                    "campaign_id":campaign_id,"phase":"dispense","po_number":po.po_number,
                    "material_code":current.material_code,"material_name":current.material_name,
                    "ticket_number":ticket.ticket_number,"line_id":current.id,
                    "lot_number":current.lot_number,"scale_type":current.scale_type,
                    "requires_ticket":False,
                }

    for po in pos:
        ticket=tickets.get(po.po_number)
        if ticket and ticket.status not in {"Complete","Signed","Completed"}:
            return {
                "campaign_id":campaign_id,"phase":"signature","po_number":po.po_number,
                "ticket_number":ticket.ticket_number,"requires_ticket":False,
            }

    return {
        "campaign_id":campaign_id,"phase":"complete","po_number":None,
        "ticket_number":None,"requires_ticket":False,
    }


def _sync_campaign_room_sequence(db: Session, campaign_id: str, room_code: str):
    task=campaign_weigh_sequence(db,campaign_id)
    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==room_code))
    if room:
        room.active_po=None if task["phase"]=="complete" else task["po_number"]
        if task["phase"]!="complete":
            room.status="In Use"
    return task


def sync_campaign_weighing(db: Session, campaign_id: str, room_code: str, operator: str):
    """Synchronize the room and guarantee the active campaign task has a ticket."""
    task=_sync_campaign_room_sequence(db,campaign_id,room_code)
    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==room_code))
    if not room:
        raise ValueError("Selected weigh room was not found")
    if task.get("po_number"):
        room.active_po=task["po_number"]
        room.status="In Use"
        db.flush()
    if task["phase"]=="complete":
        db.commit()
        return {"task":task,"ticket":None,"workspace":None,"active_po":room.active_po}

    if task["phase"]=="signature":
        ticket=get_ticket(db,task["ticket_number"])
        db.commit()
        return {"task":task,"ticket":ticket,"workspace":ticket_workspace(db,ticket.ticket_number),"active_po":room.active_po}

    ticket=db.scalar(select(WeighTicket).where(WeighTicket.po_number==task["po_number"]))
    if ticket is None:
        po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==task["po_number"]))
        if not po:
            raise ValueError("Sequenced production order not found")
        payload=type("CampaignTicketPayload",(),{
            "po_number":task["po_number"],
            "room_code":room_code,
            "operator":operator,
        })()
        ticket=create_weigh_ticket(db,payload)

    # IMPORTANT: campaign synchronization must never clear a tare that the
    # operator just confirmed.
    #
    # The previous implementation unconditionally set tare_confirmed=False
    # every time the frontend refreshed/synchronized the campaign. The visible
    # sequence was:
    #
    #   POST /tare -> tare_confirmed=True
    #   frontend refresh -> sync_campaign_weighing()
    #   sync -> tare_confirmed=False
    #
    # which made the Scale HMI briefly disappear/re-render and caused the next
    # barcode scan to fail with "Tare the scale before scanning material".
    #
    # Tare lifecycle is already controlled in the correct places:
    #   * new ticket -> False
    #   * confirm_tare() -> True
    #   * successful weigh_material() -> False for the next material
    #
    # Therefore synchronization is read/sequence reconciliation only and must
    # preserve the persisted ticket tare state.
    if ticket.status not in {"Complete","Signed","Completed"}:
        if ticket.tare_confirmed:
            if ticket.status == "Pending Tare":
                ticket.status = "Ready to Scan"
        elif ticket.status not in {"Ready to Scan","Material Verified"}:
            ticket.status = "Pending Tare"
    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==room_code))
    if room:
        room.active_po=task["po_number"]; room.status="In Use"
    db.commit(); db.refresh(ticket)
    final_task=campaign_weigh_sequence(db,campaign_id)
    return {
        "task":final_task,
        "ticket":ticket,
        "workspace":ticket_workspace(db,ticket.ticket_number),
        "active_po":room.active_po,
    }


def create_weigh_ticket(db: Session, payload):
    ensure_weigh_rooms(db)
    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==payload.room_code))
    if not room: raise ValueError("Unknown weigh room")
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==payload.po_number))
    if not po: raise ValueError("Production order not found")
    campaign=next(
        (c for c in list_campaigns(db)
         if payload.po_number in [x.strip() for x in (c.po_numbers or "").split(",")]),
        None,
    )
    if campaign and campaign.status!="In Weighing":
        raise ValueError("The complete campaign must be bent from Chem Weigh Staging into the assigned weigh room before a ticket can open")
    if po.weigh_room!=room.room_code:
        raise ValueError(f"{po.po_number} is scheduled for {po.weigh_room}, not {room.room_code}")
    if campaign:
        task=campaign_weigh_sequence(db,campaign.campaign_id)
        if task["phase"] not in {"dispense","signature"}:
            raise ValueError("Campaign weighing is complete")
        if task["po_number"] != payload.po_number:
            raise ValueError(f"Campaign sequence requires {task['po_number']} before {payload.po_number}")
        # The campaign sequence is authoritative. When Material N / PO1 is
        # completed, the room must immediately hand off to Material N / PO2.
        # Do not let a stale room.active_po from the previous ticket block
        # creation of the newly sequenced ticket.
        room.active_po=payload.po_number
        room.status="In Use"
        db.flush()
    if room.active_po and room.active_po!=payload.po_number:
        raise ValueError(f"{room.room_code} is currently sequenced for {room.active_po}")

    existing=db.scalar(select(WeighTicket).where(WeighTicket.po_number==payload.po_number))
    if existing: return existing

    source_positions=list(db.scalars(
        select(MaterialPosition).where(
            MaterialPosition.location_code==room.room_code,
            MaterialPosition.campaign_id==campaign.campaign_id if campaign else MaterialPosition.po_number==po.po_number,
        ).order_by(MaterialPosition.material_name,MaterialPosition.lot_number)
    ).all())
    if not source_positions:
        raise ValueError("No campaign material is physically present in the assigned weigh room")

    ticket=WeighTicket(
        ticket_number=f"WT-{payload.po_number}",po_number=po.po_number,
        batch_number=po.batch_number,room_code=room.room_code,
        operator=payload.operator,status="Pending Tare",
    )
    reqs=[r for r in po_requirements(db,po.po_number) if r.material_code not in BULK_MATERIAL_CODES]
    lines=[]
    for req in reqs:
        remaining=float(req.required_quantity)
        factor=1000.0 if req.unit=="g" else 1.0
        options=[x for x in source_positions if x.material_code==req.material_code and float(x.quantity)>0]
        for option in options:
            available=float(option.quantity)*factor
            if available<=0 or remaining<=0: continue
            portion=min(remaining,available)
            lines.append(WeighTicketLine(
                ticket_number=ticket.ticket_number,
                material_code=req.material_code,material_name=req.material_name,
                lot_number=option.lot_number,target_quantity=portion,unit=req.unit,
                tolerance=0.02,status="Pending",scale_type=_scale_for_material(req.material_name),
                container_id=option.container_id,
            ))
            if not req.assigned_lot: req.assigned_lot=option.lot_number
            remaining-=portion
        if remaining>1e-6:
            raise ValueError(
                f"STAGING SHORTAGE: {req.material_name} requires {remaining:.3f} {req.unit} more. "
                "Return to Chem Weigh Staging / Material PR reconciliation."
            )
        req.status="Allocated"

    room.status="In Use"; room.active_po=po.po_number; po.status="Weighing"
    db.add_all([ticket,*lines])
    record_event(
        db,event_type="WeighTicketCreated",source="Weighing",
        entity_type="WeighTicket",entity_id=ticket.ticket_number,
        message=f"{ticket.ticket_number} opened in {room.room_code} for {po.po_number} using physical campaign inventory.",
        severity="info",
    )
    db.commit(); db.refresh(ticket); return ticket

def confirm_tare(db: Session, ticket_number: str, operator: str):
    ticket=get_ticket(db,ticket_number)
    if ticket.status in {"Complete","Signed","Completed"}: raise ValueError("Ticket is already complete")
    campaign=next((c for c in list_campaigns(db) if ticket.po_number in [x.strip() for x in (c.po_numbers or "").split(",")]),None)
    if campaign:
        task=campaign_weigh_sequence(db,campaign.campaign_id)
        if task["phase"]!="dispense" or task["po_number"]!=ticket.po_number:
            raise ValueError(f"Campaign sequence requires {task.get('po_number') or task.get('phase')}")
    ticket.tare_confirmed=True; ticket.status="Ready to Scan"
    record_event(db,event_type="ScaleTared",source="Weighing",entity_type="WeighTicket",entity_id=ticket_number,message=f"Scale tare confirmed by {operator}.",severity="info")
    db.commit(); db.refresh(ticket); return ticket

def verify_barcode(db: Session,ticket_number: str,barcode: str):
    ws=ticket_workspace(db,ticket_number); ticket=ws['ticket']; line=ws['current_line']
    campaign=next((c for c in list_campaigns(db) if ticket.po_number in [x.strip() for x in (c.po_numbers or "").split(",")]),None)
    if campaign:
        task=campaign_weigh_sequence(db,campaign.campaign_id)
        if task["phase"]!="dispense" or task["po_number"]!=ticket.po_number:
            raise ValueError(f"Campaign sequence requires {task.get('po_number')}")
        if line and task.get("material_code") and line.material_code!=task["material_code"]:
            raise ValueError(f"Campaign sequence requires {task['material_name']} for {ticket.po_number}")
    if not ticket.tare_confirmed: raise ValueError("Tare the scale before scanning material")
    if not line: raise ValueError("All materials are complete")
    scanned=(barcode or "").strip().upper()
    expected={line.material_code.strip().upper(),line.lot_number.strip().upper()}
    if scanned not in expected: raise ValueError(f"Barcode does not match {line.material_code} / {line.lot_number}")
    line.barcode_verified=True; line.status="Ready to Weigh"; ticket.status="Material Verified"
    db.commit(); db.refresh(line); return line

def weigh_material(db: Session,ticket_number: str,actual_quantity: float,operator: str):
    ws=ticket_workspace(db,ticket_number); ticket=ws['ticket']; line=ws['current_line']
    if not line: raise ValueError("All materials are complete")
    if not ticket.tare_confirmed: raise ValueError("Tare confirmation required")
    if not line.barcode_verified: raise ValueError("Barcode verification required")
    low=line.target_quantity*(1-line.tolerance); high=line.target_quantity*(1+line.tolerance)
    if actual_quantity<low or actual_quantity>high: raise ValueError(f"Weight outside tolerance: {low:.3f}-{high:.3f} {line.unit}")
    # Resolve the physical source by the governed material + lot + room.
    #
    # `container_id` is retained on the ticket for traceability, but inventory
    # movement/staging consolidation can legitimately replace a container row
    # with another row for the SAME material/lot.  The old implementation
    # treated that as a 409 even though the correct released lot was physically
    # present in the weigh room.
    #
    # We therefore prefer the recorded container, then safely fall back to
    # every physical position matching the exact material + lot in this room.
    recorded_source=db.scalar(
        select(MaterialPosition).where(
            MaterialPosition.container_id==line.container_id,
            MaterialPosition.location_code==ticket.room_code,
        )
    )

    sources=[]
    if recorded_source and recorded_source.material_code==line.material_code and recorded_source.lot_number==line.lot_number:
        sources=[recorded_source]

    matching=list(db.scalars(
        select(MaterialPosition).where(
            MaterialPosition.location_code==ticket.room_code,
            MaterialPosition.material_code==line.material_code,
            MaterialPosition.lot_number==line.lot_number,
        ).order_by(MaterialPosition.id)
    ).all())

    seen={item.container_id for item in sources}
    sources.extend(item for item in matching if item.container_id not in seen)

    if not sources:
        raise ValueError(
            f"{line.material_name} lot {line.lot_number} is not physically present "
            f"in {ticket.room_code}. Bend the released lot into the weigh room before dispensing."
        )

    # Ticket lines may be expressed in grams while physical inventory is held
    # in kilograms (dye booth). All positions for a governed lot are expected
    # to use the same inventory UOM.
    inventory_unit=sources[0].unit
    physical_qty=actual_quantity/1000.0 if line.unit=="g" and inventory_unit!="g" else actual_quantity
    available=sum(float(item.quantity or 0) for item in sources)

    if available+1e-9 < physical_qty:
        raise ValueError(
            f"{line.material_name} lot {line.lot_number} is short in {ticket.room_code}: "
            f"{available:.3f} {inventory_unit} available; {physical_qty:.3f} {inventory_unit} required."
        )

    # Consume from the recorded container first, then any consolidated/split
    # containers of the same released lot. This also supports a same-lot split
    # across multiple physical containers without bypassing lot control.
    remaining=physical_qty
    for source in sources:
        if remaining<=1e-9:
            break
        current=float(source.quantity or 0)
        take=min(current,remaining)
        source.quantity=max(0.0,current-take)
        remaining-=take
        source.status="Consumed" if source.quantity<=1e-9 else "In Weigh Room - Campaign Stock"
        source.updated_at=utc_now()

    # Keep the ticket trace pointing at the actual current physical container
    # when its original container row was replaced by consolidation.
    if sources and (not recorded_source or recorded_source.container_id!=sources[0].container_id):
        line.container_id=sources[0].container_id
    update_pharma_batch_material(db,po_number=ticket.po_number,material_code=line.material_code,lot_number=line.lot_number,actual_quantity=actual_quantity)
    line.actual_quantity=actual_quantity; line.status="Complete"
    ticket.tare_confirmed=False; ticket.current_material_index+=1
    remaining=list(db.scalars(select(WeighTicketLine).where(WeighTicketLine.ticket_number==ticket_number,WeighTicketLine.status!="Complete")).all())
    ticket.status="Awaiting Operator Signature" if not remaining else "Pending Tare"
    campaign=next((c for c in list_campaigns(db) if ticket.po_number in [x.strip() for x in (c.po_numbers or "").split(",")]),None)
    next_task=None
    if campaign:
        db.flush()
        next_task=_sync_campaign_room_sequence(db,campaign.campaign_id,ticket.room_code)
    record_event(db,event_type="MaterialWeighed",source="Weighing",entity_type="WeighTicket",entity_id=ticket_number,message=f"{line.material_code} weighed at {actual_quantity} {line.unit} by {operator}.",severity="info")
    next_message=""
    if next_task:
        if next_task["phase"]=="dispense":
            next_message=f"; next {next_task['material_name']} for {next_task['po_number']}"
        elif next_task["phase"]=="signature":
            next_message=f"; all campaign material dispensing complete, sign {next_task['po_number']}"
    mes_log(db,po_number=ticket.po_number,event_type="WEIGH_COMPLETE",phase="Weighing",equipment_id=f"{ticket.room_code}:{line.scale_type}",operator_id=operator,material_code=line.material_code,material_name=line.material_name,lot_number=line.lot_number,quantity=actual_quantity,unit=line.unit,message=f"Target {line.target_quantity} {line.unit}; tolerance ±{line.tolerance*100:.1f}%{next_message}")
    db.commit(); db.refresh(ticket); return ticket

def sign_weigh_ticket(db: Session,ticket_number: str,signature: str):
    ticket=get_ticket(db,ticket_number)
    lines=list(db.scalars(select(WeighTicketLine).where(WeighTicketLine.ticket_number==ticket_number)).all())
    if not lines or any(line.status!="Complete" for line in lines):
        raise ValueError("All materials must be complete before signature")

    ticket.signature=signature
    ticket.status="Complete"
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==ticket.po_number))
    if po: po.status="Weighing Complete - In Chem Weigh Knitting"

    campaign=next(
        (c for c in list_campaigns(db)
         if ticket.po_number in [x.strip() for x in (c.po_numbers or "").split(",")]),
        None,
    )

    # Create the dispensed/verified kit containers. Source inventory stays
    # separate and may be used by the next PO in the same interlocked campaign.
    for idx,line in enumerate(lines,1):
        kit_id=f"KIT-{ticket.po_number}-{idx:02d}"
        kit=db.scalar(select(MaterialPosition).where(MaterialPosition.container_id==kit_id))
        if not kit:
            kit=MaterialPosition(
                container_id=kit_id,
                material_code=line.material_code,
                material_name=line.material_name,
                lot_number=line.lot_number,
                quantity=float(line.actual_quantity or 0),
                unit=line.unit,
                location_code="CW-KNIT-01",
                status="Dispensed - Awaiting Mix Operator Pickup",
                hazard_class=_hazard_class(line.material_code),
                campaign_id=campaign.campaign_id if campaign else None,
                po_number=ticket.po_number,
                pr_number=None,
            )
            db.add(kit)
            record_event(
                db,event_type="WEIGH_TO_KNITTING",source="Weighing",
                entity_type="MaterialContainer",entity_id=kit_id,
                message=f"{line.material_name} {line.lot_number} dispensed for {ticket.po_number} and released to Chem Weigh Knitting.",
                severity="info",
            )

    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==ticket.room_code))
    incomplete=[]
    if campaign:
        _,campaign_pos=_campaign_pos(db,campaign.campaign_id)
        for cpo in campaign_pos:
            t=db.scalar(select(WeighTicket).where(WeighTicket.po_number==cpo.po_number))
            if not t or t.status!="Complete":
                incomplete.append(cpo)
        if incomplete:
            if room:
                room.status="In Use"
                room.active_po=incomplete[0].po_number
            campaign.status="In Weighing"
        else:
            campaign.status="Weighing Complete - In Knitting"
            if room:
                room.status="Available"; room.active_po=None
            # Any source material remaining after the whole campaign is returned
            # to the correct grey-zone staging location.
            leftovers=list(db.scalars(select(MaterialPosition).where(
                MaterialPosition.campaign_id==campaign.campaign_id,
                MaterialPosition.location_code==ticket.room_code,
            )).all())
            for source in leftovers:
                if float(source.quantity)<=1e-9:
                    source.status="Consumed"
                    continue
                dest="CW-HAZ-01" if source.hazard_class=="Hazardous" else "CW-STAGE-01"
                _move_position(db,source,dest,"RETURN_UNUSED_WEIGH_STOCK_TO_STAGING",signature)
                source.status="Available"
                source.campaign_id=None
    else:
        if room: room.status="Available"; room.active_po=None

    if campaign:
        db.flush()
        _sync_campaign_room_sequence(db,campaign.campaign_id,ticket.room_code)

    record_event(
        db,event_type="WeighTicketSigned",source="Weighing",
        entity_type="WeighTicket",entity_id=ticket_number,
        message=f"Electronic weigh ticket completed and signed by {signature}; dispensed kit released to CW-KNIT-01.",
        severity="info",
    )
    create_notification(
        db,recipient="Mixing",title="Dispensed materials ready",
        message=f"{ticket.po_number} weighing is complete and its verified kit is in Chem Weigh Knitting.",
        severity="info",
    )
    db.commit(); db.refresh(ticket); return ticket


def ensure_mixing_assets(db: Session):
    if not db.scalar(select(MixRoom.id).limit(1)):
        db.add_all([
            MixRoom(room_code="MR-01", name="Mix Room 1", tank_code="V-201", capacity_l=900, plc_code="BATCH_PLC_01"),
            MixRoom(room_code="MR-02", name="Mix Room 2", tank_code="V-202", capacity_l=650, plc_code="BATCH_PLC_02"),
        ])
    if not db.scalar(select(HoldTank.id).limit(1)):
        db.add_all([
            HoldTank(tank_code="H-301", capacity_l=900),
            HoldTank(tank_code="H-302", capacity_l=650),
        ])
    db.commit()


def list_mix_rooms(db: Session):
    ensure_mixing_assets(db)
    return list(db.scalars(select(MixRoom).order_by(MixRoom.room_code)).all())


def list_hold_tanks(db: Session):
    ensure_mixing_assets(db)
    return list(db.scalars(select(HoldTank).order_by(HoldTank.tank_code)).all())


def _assert_hold_tank_available_for_po(hold: HoldTank, po_number: str):
    """One batch per hold tank after campaign weighing separation."""
    if hold.active_po and hold.active_po != po_number:
        raise ValueError(f"{hold.tank_code} is already assigned to {hold.active_po}")
    if hold.level_percent > 0 and hold.active_po != po_number:
        raise ValueError(f"{hold.tank_code} already contains another batch")
    if hold.cip_status != "Clean / Available" and hold.active_po != po_number:
        raise ValueError(f"{hold.tank_code} is not clean and available")


def list_mix_batches(db: Session):
    return list(db.scalars(select(MixBatch).order_by(MixBatch.id.desc())).all())


def mix_queue(db: Session):
    completed_tickets=list(db.scalars(select(WeighTicket).where(WeighTicket.status=="Complete").order_by(WeighTicket.id)).all())
    active_pos={row.po_number for row in db.scalars(select(MixBatch)).all()}
    result=[]
    for ticket in completed_tickets:
        if ticket.po_number in active_pos:
            continue
        po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==ticket.po_number))
        if po:
            result.append(po)
    return result


def get_mix_batch(db: Session, batch_id: str):
    batch=db.scalar(select(MixBatch).where(MixBatch.batch_id==batch_id))
    if not batch:
        raise ValueError("Mix batch not found")
    return batch


def _bulk_readiness(db: Session, batch: MixBatch):
    """Verify canonical bulk recipe readiness for one production batch.

    Water is supplied automatically by the USP utility system. It is therefore
    verified as a utility source and is never looked up as PW-101.
    """
    tanks = {
        tank.tank_code: tank
        for tank in db.scalars(select(BulkTank).order_by(BulkTank.tank_code)).all()
    }
    requirements=_bulk_recipe_requirements(db)
    source_map=_bulk_source_map(db)
    result=[]

    for material in ("Water", "Glycerin", "Propylene Glycol", "Sucrose"):
        required = requirements[material]
        source = source_map[material]

        if source["source_type"] == "UTILITY":
            result.append({
                "material": material,
                "tank_code": source["source_code"],
                "source_type": "Automatic USP Utility",
                "required_quantity": required,
                "available_quantity": None,
                "qa_status": "Qualified Utility",
                "equipment_status": "Automatic Feed Available",
                "ready": True,
                "reason": "USP Water automatic utility feed ready",
            })
            continue

        tank=tanks.get(source["source_code"])
        if not tank:
            result.append({
                "material":material,
                "tank_code":source["source_code"],
                "source_type":"Bulk Tank",
                "required_quantity":required,
                "available_quantity":0.0,
                "qa_status":"Missing",
                "equipment_status":"Unavailable",
                "ready":False,
                "reason":f"Qualified source {source['source_code']} is not configured",
            })
            continue

        qa_ok=(tank.qa_status or "").lower() in {"released","available"}
        equipment_ok=(tank.status or "").lower() in {"available","ready","idle clean"}
        available=float(tank.quantity_kg or 0)
        qty_ok=available>=required
        reasons=[]
        if not qa_ok:
            reasons.append(f"QA status {tank.qa_status}")
        if not equipment_ok:
            reasons.append(f"tank status {tank.status}")
        if not qty_ok:
            reasons.append(f"short {required-available:.2f} kg")

        result.append({
            "material":material,
            "tank_code":tank.tank_code,
            "source_type":"Bulk Tank",
            "required_quantity":required,
            "available_quantity":available,
            "qa_status":tank.qa_status,
            "equipment_status":tank.status,
            "ready":qa_ok and equipment_ok and qty_ok,
            "reason":"; ".join(reasons) or "Ready",
        })
    return result


MIX_MANUAL_PHASE_MATERIAL = {
    "Manual Add - Alcohol": "Alcohol",
    "Manual Add - Anhydrous Citric Acid": "Anhydrous Citric Acid",
    "Manual Add - Benzoic Acid": "Benzoic Acid",
    "Manual Add - Edetate Disodium": "Edetate Disodium",
    "Manual Add - Saccharin Sodium": "Saccharin Sodium",
    "Controlled API Addition": "Prednisolone",
}

MIX_FLAVOR_NAMES = {"Cherry", "Strawberry", "Grape", "Berry"}


def _mix_ticket_lines(db: Session, batch: MixBatch):
    ticket = db.scalar(
        select(WeighTicket)
        .where(WeighTicket.po_number == batch.po_number)
        .order_by(WeighTicket.id.desc())
    )
    if not ticket:
        return []
    return list(
        db.scalars(
            select(WeighTicketLine)
            .where(WeighTicketLine.ticket_number == ticket.ticket_number)
            .order_by(WeighTicketLine.id)
        ).all()
    )


def _mix_current_manual_material(db: Session, batch: MixBatch):
    fixed = MIX_MANUAL_PHASE_MATERIAL.get(batch.phase)
    if fixed:
        return fixed
    if batch.phase == "Flavor Addition":
        names = {line.material_name for line in _mix_ticket_lines(db, batch)}
        flavors = sorted(names & MIX_FLAVOR_NAMES)
        return flavors[0] if flavors else None
    return None


def _mix_barcode_events(db: Session, batch: MixBatch):
    return list(
        db.scalars(
            select(PlatformEvent)
            .where(
                PlatformEvent.entity_type == "MixBatch",
                PlatformEvent.entity_id == batch.batch_id,
                PlatformEvent.event_type == "MixMaterialBarcodeVerified",
            )
            .order_by(PlatformEvent.id)
        ).all()
    )


def _mix_material_scanned_for_phase(db: Session, batch: MixBatch, material_name: str) -> bool:
    marker = f"MATERIAL={material_name}|PHASE={batch.phase}|"
    return any(marker in (event.message or "") for event in _mix_barcode_events(db, batch))


def verify_mix_material_barcode(db: Session, batch_id: str, barcode: str, operator: str):
    batch = get_mix_batch(db, batch_id)
    material_name = _mix_current_manual_material(db, batch)
    if not material_name:
        raise ValueError(f"Material barcode scanning is not required during {batch.phase}")

    line = next(
        (
            item
            for item in _mix_ticket_lines(db, batch)
            if item.material_name == material_name
        ),
        None,
    )
    if not line:
        raise ValueError(f"{material_name} is not present on {batch.po_number}")

    code = (barcode or "").strip()
    accepted = {
        str(line.material_code or "").strip(),
        str(line.lot_number or "").strip(),
        str(line.container_id or "").strip(),
    }
    if code not in accepted:
        raise ValueError(
            f"Barcode {code} does not match current material {material_name} "
            f"({line.material_code} / {line.lot_number})"
        )

    if not _mix_material_scanned_for_phase(db, batch, material_name):
        record_event(
            db,
            event_type="MixMaterialBarcodeVerified",
            source="Mixing",
            entity_type="MixBatch",
            entity_id=batch.batch_id,
            message=(
                f"MATERIAL={material_name}|PHASE={batch.phase}|"
                f"CODE={line.material_code}|LOT={line.lot_number}|"
                f"CONTAINER={line.container_id}|BARCODE={code}|OPERATOR={operator}"
            ),
            severity="info",
        )
        mes_log(
            db,
            po_number=batch.po_number,
            event_type="MIX_MATERIAL_BARCODE_VERIFIED",
            phase=batch.phase,
            equipment_id=batch.tank_code,
            operator_id=operator,
            material_code=line.material_code,
            material_name=line.material_name,
            lot_number=line.lot_number,
            quantity=float(line.actual_quantity or line.target_quantity or 0),
            unit=line.unit,
            message="Manual-add material verified immediately before tank addition",
        )
        db.commit()

    return batch


def _require_current_mix_scan(db: Session, batch: MixBatch):
    material_name = _mix_current_manual_material(db, batch)
    if not material_name:
        return
    if not _mix_material_scanned_for_phase(db, batch, material_name):
        raise ValueError(f"Scan/verify {material_name} before confirming this manual add")


def _mix_phase_rank(phase: str) -> int:
    sequence = [
        "Pre-Batch Bulk Readiness",
        "Initial Water Charge",
        "Confirm Water Charge",
        "Open Tank - Manual Group 1",
        "Manual Add - Alcohol",
        "Manual Add - Anhydrous Citric Acid",
        "Manual Add - Benzoic Acid",
        "Close Tank - Glycerin",
        "Automatic Glycerin Add",
        "Confirm Glycerin Add",
        "Automatic Propylene Glycol Add",
        "Confirm Propylene Glycol Add",
        "Open Tank - Manual Group 2",
        "Manual Add - Edetate Disodium",
        "Manual Add - Saccharin Sodium",
        "Close Tank - Sucrose",
        "Automatic Sucrose Bulk Add",
        "Confirm Sucrose Bulk Add",
        "Open Tank - API / Flavor",
        "Controlled API Addition",
        "Flavor Addition",
        "Dye Premix Transfer",
        "Close Tank - Final Agitation",
        "Final Agitation",
        "Confirm Final Agitation",
        "Select Hold Tank",
        "Transfer Ready",
        "Transfer",
        "Transfer Sample Required",
        "Transfer Complete",
        "Batch Terminated",
    ]
    try:
        return sequence.index(phase)
    except ValueError:
        return 0


def _mix_material_is_added(batch: MixBatch, material_name: str) -> bool:
    thresholds = {
        "Water": 3,
        "Alcohol": 5,
        "Anhydrous Citric Acid": 6,
        "Benzoic Acid": 7,
        "Glycerin": 10,
        "Propylene Glycol": 12,
        "Edetate Disodium": 14,
        "Saccharin Sodium": 15,
        "Sucrose": 18,
        "Prednisolone": 20,
        "Cherry": 21,
        "Strawberry": 21,
        "Grape": 21,
        "Berry": 21,
    }
    threshold = thresholds.get(material_name)
    return threshold is not None and _mix_phase_rank(batch.phase) >= threshold


def _mix_signed_materials(db: Session, batch: MixBatch) -> set[str]:
    """Materials whose post-MES electronic operator signature is complete."""
    signed=set()
    events=list(
        db.scalars(
            select(PlatformEvent)
            .where(
                PlatformEvent.entity_type=="MixBatch",
                PlatformEvent.entity_id==batch.batch_id,
                PlatformEvent.event_type=="MixAdditionOperatorSigned",
            )
            .order_by(PlatformEvent.id)
        ).all()
    )
    for event in events:
        message=(event.message or "").strip()
        # New structured format.
        parts=_event_parts(event)
        if parts.get("MATERIAL"):
            signed.add(parts["MATERIAL"])
            continue
        # Backward-compatible format already written by the current demo batch:
        # "<material> addition electronically signed by <operator>."
        marker=" addition electronically signed"
        if marker in message:
            signed.add(message.split(marker,1)[0].strip())
    return signed


def _mix_active_execution_material(db: Session, batch: MixBatch) -> str | None:
    """Resolve dynamic check/MES/sign phases back to a recipe material."""
    for prefix in (
        "Weight Check - ",
        "Weight Exception - ",
        "MES Report - ",
        "Operator Sign - ",
    ):
        if batch.phase.startswith(prefix):
            material=batch.phase[len(prefix):].strip()
            if material=="Flavor":
                names={line.material_name for line in _mix_ticket_lines(db,batch)}
                flavors=sorted(names & MIX_FLAVOR_NAMES)
                return flavors[0] if flavors else "Flavor"
            return material
    return _mix_current_manual_material(db,batch)


def _mix_execution_state(
    db: Session,
    batch: MixBatch,
    material_name: str,
    *,
    automatic: bool=False,
) -> str:
    """Live execution state shown in Current PO Material Execution."""
    signed=_mix_signed_materials(db,batch)

    # Flavor check/MES/sign context is stored generically as "Flavor", while
    # the recipe row contains the approved flavor name.
    signed_for_row=(
        material_name in signed
        or (material_name in MIX_FLAVOR_NAMES and "Flavor" in signed)
    )
    if signed_for_row:
        return "COMPLETE · ADDED TO MIX TANK · MES ACCEPTED · SIGNED"

    active=_mix_active_execution_material(db,batch)
    active_for_row=(
        active==material_name
        or (active=="Flavor" and material_name in MIX_FLAVOR_NAMES)
    )

    if active_for_row:
        if batch.phase.startswith("Weight Exception -"):
            return "ADDED TO MIX TANK · CHECK WEIGHT FAILED · MES BLOCKED"
        if batch.phase.startswith("Weight Check -"):
            return "ADDED TO MIX TANK · CHECK WEIGHT RUNNING"
        if batch.phase.startswith("MES Report -"):
            return "ADDED TO MIX TANK · CHECK WEIGHT PASSED · REPORTING TO MES"
        if batch.phase.startswith("Operator Sign -"):
            return "ADDED TO MIX TANK · CHECK WEIGHT PASSED · MES ACCEPTED · SIGNATURE REQUIRED"

        # Current manual material before physical confirmation.
        if _mix_material_scanned_for_phase(db,batch,material_name):
            return "BARCODE VERIFIED · AWAITING ADD CONFIRMATION"
        return "PENDING ADD"

    # Legacy compatibility for batches executed before event-driven status was
    # introduced. This is deliberately secondary to signed/current state.
    if _mix_material_is_added(batch,material_name):
        return "ADDED TO MIX TANK"

    return "PENDING AUTOMATIC ADD" if automatic else "PENDING ADD"


def _current_mix_material_execution(db: Session, batch: MixBatch):
    """Current PO only, one row per material/lot, with live execution state."""
    result=[]
    seen=set()

    for line in _mix_ticket_lines(db,batch):
        key=(line.material_code,line.lot_number)
        if key in seen:
            continue
        seen.add(key)

        state=_mix_execution_state(
            db,batch,line.material_name,automatic=False
        )
        result.append(
            {
                "batch_number":batch.batch_number,
                "material_code":line.material_code,
                "material_name":line.material_name,
                "material_lot":line.lot_number,
                "required_quantity":float(line.target_quantity or 0),
                "actual_quantity":float(line.actual_quantity)
                if line.actual_quantity is not None else None,
                "unit_of_measure":line.unit,
                "weighing_status":state,
            }
        )

    code_by_name={
        "Water":"059QF0KO0R",
        "Glycerin":"PDC6A3C0OX",
        "Propylene Glycol":"6DC9Q167V3",
        "Sucrose":"C151H8M554",
    }
    for item in _bulk_readiness(db,batch):
        lot="USP-UTILITY"
        if item["source_type"]!="Automatic USP Utility":
            tank=db.scalar(
                select(BulkTank).where(BulkTank.tank_code==item["tank_code"])
            )
            lot=tank.lot_number if tank else None

        key=(code_by_name[item["material"]],lot)
        if key in seen:
            continue
        seen.add(key)

        state=_mix_execution_state(
            db,batch,item["material"],automatic=True
        )
        has_entered_vessel=(
            state!="PENDING AUTOMATIC ADD"
            and state!="PENDING ADD"
        )
        result.append(
            {
                "batch_number":batch.batch_number,
                "material_code":code_by_name[item["material"]],
                "material_name":item["material"],
                "material_lot":lot,
                "required_quantity":float(item["required_quantity"]),
                "actual_quantity":float(item["required_quantity"])
                if has_entered_vessel else None,
                "unit_of_measure":"kg",
                "weighing_status":state,
            }
        )

    return result


def _approved_sucrose_source(db: Session, po_number: str) -> str:
    item = db.scalar(
        select(RouteChangeRequest)
        .where(
            RouteChangeRequest.po_number == po_number,
            RouteChangeRequest.resource_type == "sucrose_source_tank",
            RouteChangeRequest.status == "Approved",
        )
        .order_by(RouteChangeRequest.id.desc())
    )
    return item.requested_resource if item else "SUC-101"


def _consume_bulk_from_tanks(
    db: Session,
    batch: MixBatch,
    material_name: str,
    quantity_kg: float,
    operator: str,
):
    if material_name == "Water":
        return [{"tank_code": "USP-WATER-AUTO", "lot_number": "USP-UTILITY", "quantity_kg": quantity_kg}]

    source_codes = {
        "Glycerin": ["GLY-101"],
        "Propylene Glycol": ["PG-101"],
        "Sucrose": ["SUC-101", "TANK-X"],
    }[material_name]

    if material_name == "Sucrose" and _approved_sucrose_source(db, batch.po_number) == "TANK-X":
        source_codes = ["TANK-X", "SUC-101"]

    tanks = [
        db.scalar(select(BulkTank).where(BulkTank.tank_code == code))
        for code in source_codes
    ]
    tanks = [tank for tank in tanks if tank is not None]
    if not tanks:
        raise ValueError(f"No qualified bulk source is configured for {material_name}")

    required = float(quantity_kg)
    primary = tanks[0]

    if float(primary.quantity_kg or 0) >= required:
        plan = [(primary, required)]
    elif len(tanks) > 1:
        secondary = tanks[1]
        primary_qty = float(primary.quantity_kg or 0)
        remaining = required - primary_qty
        secondary_qty = float(secondary.quantity_kg or 0)
        if secondary_qty < remaining:
            raise ValueError(
                f"Insufficient {material_name}: {primary_qty + secondary_qty:.2f} kg available; "
                f"{required:.2f} kg required"
            )

        same_lot = bool(primary.lot_number and primary.lot_number == secondary.lot_number)
        approved_alternate = (
            material_name == "Sucrose"
            and _approved_sucrose_source(db, batch.po_number) == "TANK-X"
        )
        if not same_lot and not approved_alternate:
            raise ValueError(
                f"{primary.tank_code} cannot complete the charge and {secondary.tank_code} "
                f"contains different lot {secondary.lot_number}. Request Office approval "
                f"to use TANK-X for this PO before crossing lots."
            )

        plan = []
        if primary_qty > 0:
            plan.append((primary, primary_qty))
        plan.append((secondary, remaining))
    else:
        raise ValueError(
            f"{primary.tank_code} contains {float(primary.quantity_kg or 0):.2f} kg; "
            f"{required:.2f} kg is required"
        )

    consumed = []
    for tank, amount in plan:
        tank.quantity_kg = max(0.0, float(tank.quantity_kg or 0) - amount)
        consumed.append(
            {
                "tank_code": tank.tank_code,
                "lot_number": tank.lot_number,
                "quantity_kg": amount,
            }
        )
        record_event(
            db,
            event_type="BulkMaterialSourceConsumed",
            source="Mixing Bulk Transfer",
            entity_type="MixBatch",
            entity_id=batch.batch_id,
            message=(
                f"MATERIAL={tank.material_name}|TANK={tank.tank_code}|"
                f"LOT={tank.lot_number}|QTY={amount:.6f}|OPERATOR={operator}"
            ),
            severity="info",
        )
    return consumed


def mix_workspace(db: Session, batch_id: str):
    ensure_mixing_assets(db)
    batch=get_mix_batch(db,batch_id)

    # Phase-contract migration for batches that were already active before the
    # sequential manual-add workflow was introduced. This prevents 409
    # conflicts caused by an old persisted phase paired with the new action set.
    legacy_phase_map = {
        "Manual Group 1": "Manual Add - Alcohol",
        "Close Tank - Bulk Group 1": "Close Tank - Glycerin",
        "Automatic Bulk Group 1": "Automatic Glycerin Add",
        "Confirm Bulk Group 1": "Confirm Glycerin Add",
        "Manual Group 2": "Manual Add - Edetate Disodium",
        "Flavor / Dye Addition": "Flavor Addition",
    }
    migrated_phase = legacy_phase_map.get(batch.phase)
    if migrated_phase:
        old_phase = batch.phase
        batch.phase = migrated_phase
        batch.status = "Awaiting Operator" if not migrated_phase.startswith("Automatic ") else "Running"
        batch.progress = 0 if batch.status == "Running" else 100
        record_event(
            db,
            event_type="MixPhaseContractMigrated",
            source="Mixing",
            entity_type="MixBatch",
            entity_id=batch.batch_id,
            message=f"Legacy phase {old_phase} migrated to {migrated_phase} for resume compatibility.",
            severity="info",
        )
        db.commit()
        db.refresh(batch)
    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    readiness=_bulk_readiness(db,batch)
    readiness_passed=all(row["ready"] for row in readiness)
    actions=[]
    if batch.status=="Ready" and not batch.readiness_verified: actions=["verify-readiness"]
    elif batch.status=="Ready" and batch.readiness_verified: actions=["start"]
    elif batch.phase.startswith("Open Tank -"): actions=["open-tank"]
    elif batch.phase.startswith("Manual Add -"): actions=["scan-barcode","confirm-manual-add"]
    elif batch.phase.startswith("Close Tank -"): actions=["close-tank"]
    elif batch.phase=="Confirm Glycerin Add": actions=["confirm-glycerin"]
    elif batch.phase=="Confirm Propylene Glycol Add": actions=["confirm-propylene-glycol"]
    elif batch.phase.startswith("Confirm Sucrose"): actions=["confirm-sucrose"]
    elif batch.phase=="Controlled API Addition": actions=["confirm-api"]
    elif batch.phase in {"Flavor Addition","Flavor / Dye Addition"}: actions=["confirm-flavor"]
    elif batch.phase=="Dye Premix Transfer": actions=["confirm-dye-premix"]
    elif batch.phase=="Confirm Final Agitation": actions=["confirm-final-agitation"]
    elif batch.status=="Ready for Hold Selection": actions=["select-hold"]
    elif batch.status=="Ready for Transfer": actions=["start-transfer"]
    elif batch.status=="Sample Hold": actions=["collect-sample"]
    elif batch.status=="Awaiting Termination": actions=["terminate"]
    if premix and premix.status.startswith("Faulted"): actions.append("recover-premix")
    if premix and premix.status=="Awaiting Confirmation": actions.append("confirm-premix")
    return {"batch":batch,"premix":premix,"hold_tanks":list_hold_tanks(db),"available_actions":actions,"materials":_current_mix_material_execution(db,batch),"bulk_readiness":readiness,"readiness_passed":readiness_passed}

def verify_mix_readiness(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Ready": raise ValueError("Readiness can only be verified before batch start")
    checks=_bulk_readiness(db,batch)
    failed=[x for x in checks if not x["ready"]]
    mes_log(db,po_number=batch.po_number,event_type="BATCH_READINESS_CHECK",phase="Pre-Batch Readiness",equipment_id=batch.tank_code,operator_id=operator,message="; ".join(f"{x['tank_code']} {x['material']}: {x['reason']}" for x in checks),qualified=not failed,severity="warning" if failed else "info")
    if failed:
        raise ValueError("Batch readiness blocked: " + "; ".join(f"{x['material']} ({x['reason']})" for x in failed))
    batch.readiness_verified=True
    _phase_event(db,batch,"BatchReadinessPassed","Required bulk tanks, QA status, equipment availability, and quantities verified; recipe snapshot authorized",operator)
    db.commit(); db.refresh(batch); return batch


def create_mix_batch(db: Session, payload):
    ensure_mixing_assets(db)
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==payload.po_number))
    if not po:
        raise ValueError("Production order not found")

    # Idempotent room re-entry: if the batch already exists, return it before
    # checking the completed-weighing queue. Once material is in the mix room,
    # the persisted MixBatch/room ownership is the recovery source.
    existing=db.scalar(select(MixBatch).where(MixBatch.po_number==payload.po_number))
    if existing:
        return existing

    ticket=db.scalar(
        select(WeighTicket).where(
            WeighTicket.po_number==payload.po_number,
            WeighTicket.status=="Complete",
        )
    )
    if not ticket:
        raise ValueError("Completed electronic weigh ticket is required")
    room=db.scalar(select(MixRoom).where(MixRoom.room_code==payload.room_code))
    if not room: raise ValueError("Unknown mix room")
    if (room.status or "").lower() not in {"available", "reserved"}: raise ValueError(f"{room.room_code} is not available")
    if room.active_po and room.active_po != payload.po_number: raise ValueError(f"{room.room_code} is reserved for {room.active_po}")
    if room.tank_code!=po.mix_tank: raise ValueError(f"PO is scheduled for {po.mix_tank}, not {room.tank_code}")
    batch=MixBatch(
        batch_id=f"MB-{po.po_number}",po_number=po.po_number,batch_number=po.batch_number,
        room_code=room.room_code,tank_code=room.tank_code,operator=payload.operator,status="Ready",
        phase="Ready to Start",requires_premix=po.requires_premix,bulk_material=po.bulk_material,
        premix_status="Awaiting Premix Water" if po.requires_premix else "Not Required",
    )
    room.status="Reserved"; room.active_po=po.po_number; room.cip_status="Clean / Available"
    po.status="Ready for Mixing"
    db.add(batch)
    record_event(db,event_type="MixBatchCreated",source="Mixing",entity_type="MixBatch",entity_id=batch.batch_id,message=f"{batch.batch_id} queued in {room.room_code} on {room.tank_code}.",severity="info")
    db.commit(); db.refresh(batch); return batch


def _phase_event(db: Session, batch: MixBatch, event_type: str, message: str, operator: str = "Process Engineer"):
    record_event(db,event_type=event_type,source="Mixing",entity_type="MixBatch",entity_id=batch.batch_id,message=f"{message} · Operator {operator}.",severity="info")


def start_mix_batch(db: Session, batch_id: str, operator: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Ready": raise ValueError("Batch is not ready to start")
    if not batch.readiness_verified: raise ValueError("Pre-batch bulk readiness verification is required")
    room=db.scalar(select(MixRoom).where(MixRoom.room_code==batch.room_code))
    batch.status="Running"; batch.phase="Initial Water Charge"; batch.progress=0; batch.rpm=40; batch.agitator_command_rpm=40; batch.motor_load_percent=28; batch.vacuum_bar=0; batch.vessel_closed=False
    if room: room.status="In Use"; room.cip_status="In Use"
    if batch.requires_premix:
        premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
        if not premix:
            premix=PremixRun(run_id=f"PM-{batch.po_number}",mix_batch_id=batch_id,status="Awaiting Premix Water",progress=0,level_percent=0,rpm=0)
            db.add(premix)
        else:
            premix.status="Awaiting Premix Water"; premix.progress=0; premix.level_percent=0; premix.rpm=0
        batch.premix_status="Awaiting Premix Water"
        _phase_event(db,batch,"PremixPrepared","PMX-01 staged; operator must confirm 10 kg premix water and separate 10 kg rinse pot before agitation",operator)
    _phase_event(db,batch,"BatchStarted","Liquid Prednisone batch started; initial water bulk charge enabled",operator)
    db.commit(); db.refresh(batch); return batch


def _tick_premix(db: Session, batch: MixBatch, premix: PremixRun | None):
    if not premix or premix.status not in {"Running","Faulted - Low Speed","Faulted - High Speed","Faulted - Agitator Trip"}:
        return
    if premix.status.startswith("Faulted"):
        return
    # A realistic intermittent agitator fault. Time outside 825-875 RPM does not count.
    if premix.progress >= 20 and premix.progress < 90 and random() < 0.14:
        fault=random()
        if fault < .34:
            premix.status="Faulted - Low Speed"; premix.rpm=610
        elif fault < .68:
            premix.status="Faulted - High Speed"; premix.rpm=1020
        else:
            premix.status="Faulted - Agitator Trip"; premix.rpm=0
        batch.premix_status=premix.status
        record_event(db,event_type="PremixAgitatorFault",source="PMX-01",entity_type="PremixRun",entity_id=premix.run_id,message=f"{premix.status}; qualified mix timer paused until 825-875 RPM is restored.",severity="warning")
        mes_log(db,po_number=batch.po_number,event_type="EQUIPMENT_FAULT",phase="Dye Premix",equipment_id="PMX-01",operator_id=batch.operator,metric="rpm",value=float(premix.rpm),unit="rpm",message=premix.status,severity="warning",qualified=False)
        return
    premix.rpm=int(round(uniform(842,858)))
    premix.progress=min(100,premix.progress+20)
    premix.level_percent=min(72,premix.level_percent+14.4)
    if premix.progress>=100:
        premix.status="Awaiting Confirmation"; premix.rpm=850; batch.premix_status="Awaiting Confirmation"
        record_event(db,event_type="PremixMixTimeComplete",source="PMX-01",entity_type="PremixRun",entity_id=premix.run_id,message="Required qualified premix time completed within 825-875 RPM; operator verification required.",severity="info")


def _main_mix_fault(db: Session,batch: MixBatch):
    if batch.fault_code or batch.status not in {"Running","Transferring"}: return False
    active_phases={"Initial Water Charge","Automatic Glycerin Add","Automatic Propylene Glycol Add","Automatic Sucrose Bulk Add","Final Agitation"}
    if batch.phase not in active_phases or random() >= 0.22: return False
    faults=[]
    if batch.rpm>0:
        faults += [("MIX-RPM-LOW","Agitator actual speed fell below commanded speed"),("MIX-VFD-TRIP","Agitator VFD tripped; rotation stopped"),("MIX-MOTOR-LOAD","Agitator motor load exceeded expected process envelope")]
    if batch.vessel_closed:
        faults += [("MIX-VAC-LOW","Closed-vessel vacuum failed to maintain setpoint"),("MIX-VAC-HIGH","Closed-vessel vacuum exceeded operating limit"),("MIX-VENT-INTERLOCK","Tank vent/closure interlock did not prove") ]
    if not faults: return False
    code,msg=faults[int(random()*len(faults))]
    batch.fault_code=code; batch.fault_message=msg; batch.status="Faulted"; batch.fault_diagnosed=False
    if code=="MIX-RPM-LOW": batch.rpm=max(8,int(batch.agitator_command_rpm*.55))
    elif code=="MIX-VFD-TRIP": batch.rpm=0
    elif code=="MIX-MOTOR-LOAD": batch.motor_load_percent=96
    elif code=="MIX-VAC-LOW": batch.vacuum_bar=-0.08
    elif code=="MIX-VAC-HIGH": batch.vacuum_bar=-0.72
    record_event(db,event_type="MixProcessFault",source="Mixing PLC",entity_type="MixBatch",entity_id=batch.batch_id,message=f"{code}: {msg}; automatic sequence paused.",severity="warning")
    mes_log(db,po_number=batch.po_number,event_type="EQUIPMENT_FAULT",phase=batch.phase,equipment_id=batch.tank_code,operator_id=batch.operator,metric="rpm",value=float(batch.rpm),unit="rpm",message=msg,severity="warning",qualified=False)
    return True

def tick_mix_batch(db: Session, batch_id: str):
    batch=get_mix_batch(db,batch_id)

    # fault_code is the authoritative PLC interlock.  A prior browser action
    # may have left status at "Awaiting Operator" while the fault remained
    # latched.  Never advance either the main recipe or premix while a latched
    # process fault exists.
    if batch.fault_code:
        batch.status="Faulted"
        db.commit()
        db.refresh(batch)
        return batch

    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    _tick_premix(db,batch,premix)
    if batch.status=="Faulted" or batch.fault_code:
        db.commit(); db.refresh(batch); return batch
    if batch.status not in {"Running","Transferring"}: db.commit(); db.refresh(batch); return batch

    # Check weight and MES reporting are system actions. The browser polling
    # loop displays these phases but never asks the operator to execute them.
    if batch.phase.startswith("Weight Check -"):
        batch.progress=min(100,batch.progress+50)
        if batch.progress>=100:
            _run_mix_check_weight(db,batch,batch.operator)
        _monitor_mix_tank_limits(db,batch)
        db.commit(); db.refresh(batch); return batch

    if batch.phase.startswith("MES Report -"):
        batch.progress=min(100,batch.progress+50)
        if batch.progress>=100:
            _report_mix_addition_to_mes(db,batch,batch.operator)
        db.commit(); db.refresh(batch); return batch

    targets={"Initial Water Charge":40,"Automatic Glycerin Add":62,"Automatic Propylene Glycol Add":62,"Automatic Sucrose Bulk Add":78,"Final Agitation":65}
    target=targets.get(batch.phase,25)
    batch.agitator_command_rpm=target; batch.rpm=int(round(uniform(max(1,target-3),target+3))); batch.motor_load_percent=round(uniform(28,48)+(18 if "Sucrose" in batch.phase else 0),1)
    if batch.vessel_closed: batch.vacuum_bar=round(uniform(-0.39,-0.31),2)
    else: batch.vacuum_bar=0
    if _main_mix_fault(db,batch): db.commit(); db.refresh(batch); return batch
    if batch.phase=="Initial Water Charge":
        batch.progress=min(100,batch.progress+20); batch.level_percent=min(45,batch.level_percent+9); batch.mass_kg+=800; batch.temperature_c=min(25,batch.temperature_c+0.2)
        if batch.progress>=100: batch.phase="Confirm Water Charge"; batch.status="Awaiting Operator"; batch.progress=100
    elif batch.phase=="Automatic Glycerin Add":
        amount=_bulk_recipe_requirements(db)["Glycerin"]*0.25
        _consume_bulk_from_tanks(db,batch,"Glycerin",amount,batch.operator)
        batch.mass_kg=round(float(batch.mass_kg or 0)+amount,3)
        batch.progress=min(100,batch.progress+25)
        if batch.progress>=100: batch.phase="Confirm Glycerin Add"; batch.status="Awaiting Operator"
    elif batch.phase=="Automatic Propylene Glycol Add":
        amount=_bulk_recipe_requirements(db)["Propylene Glycol"]*0.25
        _consume_bulk_from_tanks(db,batch,"Propylene Glycol",amount,batch.operator)
        batch.mass_kg=round(float(batch.mass_kg or 0)+amount,3)
        batch.progress=min(100,batch.progress+25)
        if batch.progress>=100: batch.phase="Confirm Propylene Glycol Add"; batch.status="Awaiting Operator"
    elif batch.phase=="Automatic Sucrose Bulk Add":
        amount=_bulk_recipe_requirements(db)["Sucrose"]*0.25
        _consume_bulk_from_tanks(db,batch,"Sucrose",amount,batch.operator)
        batch.mass_kg=round(float(batch.mass_kg or 0)+amount,3)
        batch.progress=min(100,batch.progress+25)
        if batch.progress>=100: batch.phase="Confirm Sucrose Bulk Add"; batch.status="Awaiting Operator"
    elif batch.phase=="Final Agitation":
        target_rpm=550
        batch.agitator_command_rpm=target_rpm

        # Ramp from the low-speed mixing value into the qualified final-agitation
        # range rather than remaining capped at 65 RPM.
        current_rpm=float(batch.rpm or 0)
        if current_rpm < target_rpm:
            batch.rpm=min(target_rpm, int(round(current_rpm + max(70, (target_rpm-current_rpm)*0.40))))
        else:
            batch.rpm=target_rpm

        batch.motor_load_percent=min(82.0, max(37.0, 30.0 + (batch.rpm/target_rpm)*32.0))
        batch.progress=min(100,batch.progress+10)

        mes_log(
            db,
            po_number=batch.po_number,
            event_type="PROCESS_MEASUREMENT",
            phase="Final Agitation",
            equipment_id=batch.tank_code,
            operator_id=batch.operator,
            metric="rpm",
            value=float(batch.rpm),
            unit="rpm",
            message=f"Final agitation ramp/hold at {batch.rpm}/{target_rpm} RPM; qualified progress {batch.progress}%",
        )

        if batch.progress>=100:
            batch.rpm=target_rpm
            batch.agitator_command_rpm=target_rpm
            batch.status="Awaiting Operator"
            batch.phase="Confirm Final Agitation"
    elif batch.status=="Transferring":
        hold=db.scalar(select(HoldTank).where(HoldTank.tank_code==batch.selected_hold_tank))
        if not hold:
            batch.status="Faulted"
            batch.phase="Transfer Fault"
            batch.fault_code="MIX-XFER-HOLD-MISSING"
            batch.fault_message="Selected hold tank is unavailable during transfer"
        else:
            ctx=_transfer_start_context(db,batch)
            initial_mass=max(float(ctx["initial_mass_kg"]),MIX_TANK_LOW_LOW_KG)
            transferable=max(0.0,initial_mass-MIX_TANK_LOW_LOW_KG)

            source_mass=float(batch.mass_kg or 0)
            destination_mass=float(hold.transferred_quantity or 0)
            source_available=max(0.0,source_mass-MIX_TANK_LOW_LOW_KG)
            destination_headroom=max(0.0,HOLD_TANK_HIGH_HIGH_KG-destination_mass)

            nominal_step=max(1.0,transferable*0.20)
            pulsed_step=_pulsed_outflow_step(
                source_mass,
                MIX_TANK_LOW_LOW_KG,
                nominal_step,
                MIX_TANK_PULSE_ZONE_KG,
            )
            moved=min(pulsed_step,source_available,destination_headroom)

            if moved>0:
                batch.mass_kg=round(source_mass-moved,3)
                hold.transferred_quantity=round(destination_mass+moved,3)
                hold.source_mix_tank=batch.tank_code
                hold.status="Receiving"
                hold.qa_status="In Process"
                _monitor_hold_tank_high_limits(db,hold,batch.po_number)

            if transferable>0:
                transferred_from_source=initial_mass-float(batch.mass_kg or 0)
                batch.progress=min(100,int(round((transferred_from_source/transferable)*100)))

            low_low_reached=float(batch.mass_kg or 0)<=MIX_TANK_LOW_LOW_KG+0.001
            high_high_reached=float(hold.transferred_quantity or 0)>=HOLD_TANK_HIGH_HIGH_KG-0.001

            if low_low_reached:
                batch.mass_kg=MIX_TANK_LOW_LOW_KG
                batch.progress=100
                batch.status="Awaiting Termination" if batch.sample_collected else "Sample Hold"
                batch.phase="Transfer Complete" if batch.sample_collected else "Transfer Sample Required"

                hold.status="Receiving Complete"
                hold.qa_status="Awaiting Batch Termination"
                hold.transfer_completed_at=hold.transfer_completed_at or utc_now()

                record_event(
                    db,
                    event_type="TransferLowLowReached",
                    source="Mixing PLC",
                    entity_type="MixBatch",
                    entity_id=batch.batch_id,
                    message=(
                        f"SOURCE_MASS_KG={batch.mass_kg:.3f}|LOW_LOW_KG={MIX_TANK_LOW_LOW_KG:.3f}|"
                        f"HOLD_MASS_KG={float(hold.transferred_quantity or 0):.3f}|"
                        f"Transfer stopped at mix-tank low-low with heel preserved for transfer sampling."
                    ),
                    severity="info",
                )
            elif high_high_reached:
                hold.transferred_quantity=HOLD_TANK_HIGH_HIGH_KG
                hold.status="High-High Interlock"
                hold.qa_status="In Process"
                batch.status="Transfer Interlocked"
                batch.phase="Hold Tank High-High"
                batch.fault_code="HOLD-HH-10000"
                batch.fault_message=(
                    f"{hold.tank_code} reached high-high {HOLD_TANK_HIGH_HIGH_KG:.0f} kg "
                    f"before {batch.tank_code} reached low-low."
                )
                record_event(
                    db,
                    event_type="TransferHighHighInterlock",
                    source="Mixing PLC",
                    entity_type="MixBatch",
                    entity_id=batch.batch_id,
                    message=(
                        f"HOLD={hold.tank_code}|HOLD_MASS_KG={HOLD_TANK_HIGH_HIGH_KG:.3f}|"
                        f"SOURCE_MASS_KG={float(batch.mass_kg or 0):.3f}|Transfer stopped on destination high-high."
                    ),
                    severity="warning",
                )
                create_notification(
                    db,
                    recipient="Automation",
                    title="Hold tank high-high transfer interlock",
                    message=(
                        f"{batch.po_number}: {hold.tank_code} reached {HOLD_TANK_HIGH_HIGH_KG:.0f} kg "
                        f"with {float(batch.mass_kg or 0):.1f} kg still in {batch.tank_code}."
                    ),
                    severity="warning",
                )
    db.commit(); db.refresh(batch); return batch


def _add_batch_mass(db: Session, batch: MixBatch, amount: float, label: str, operator: str):
    before=float(batch.mass_kg or 0); batch.mass_kg=round(before+amount,4)
    batch.level_percent=min(95, float(batch.level_percent or 0)+max(0.2, amount/3.0))
    mes_log(db,po_number=batch.po_number,event_type="MATERIAL_ADD_TOTAL",phase=batch.phase,equipment_id=batch.tank_code,operator_id=operator,quantity=amount,unit="kg-equivalent",message=f"{label}; tank mass {before:.4f} -> {batch.mass_kg:.4f} kg")

def _mes_log_batch_materials(db: Session, batch: MixBatch, names: set[str], operator: str):
    for row in batch_genealogy(db,batch.po_number):
        if row.get("material_name") not in names:
            continue
        qty=row.get("actual_quantity") if row.get("actual_quantity") is not None else row.get("required_quantity")
        mes_log(db,po_number=batch.po_number,event_type="BATCH_MATERIAL_ADD",phase=batch.phase,equipment_id=batch.tank_code,operator_id=operator,material_code=row.get("material_code"),material_name=row.get("material_name"),lot_number=row.get("material_lot"),quantity=float(qty or 0),unit=row.get("unit_of_measure"),message="Material charged to main batch")


MIX_CHECK_WEIGHT_TOLERANCE_PERCENT = 0.20


def _latest_mix_event(db: Session, batch: MixBatch, event_type: str):
    return db.scalar(
        select(PlatformEvent)
        .where(
            PlatformEvent.entity_type=="MixBatch",
            PlatformEvent.entity_id==batch.batch_id,
            PlatformEvent.event_type==event_type,
        )
        .order_by(PlatformEvent.id.desc())
    )


def _event_parts(event: PlatformEvent | None) -> dict[str,str]:
    result={}
    if not event:
        return result
    for part in (event.message or "").split("|"):
        if "=" in part:
            key,value=part.split("=",1)
            result[key]=value
    return result


def _begin_addition_check(
    db: Session,
    batch: MixBatch,
    *,
    material_name: str,
    quantity_kg: float,
    next_phase: str,
    operator: str,
    apply_mass: bool = True,
):
    """Create the post-add check-weight gate.

    Manual/premix additions update vessel mass here because Confirm Add is the
    physical-add acknowledgement. Automatic additions set apply_mass=False
    because their live mass has already risen during the automatic transfer.
    """
    if apply_mass:
        pre_mass=float(batch.mass_kg or 0)
        batch.mass_kg=round(pre_mass+float(quantity_kg),3)
    else:
        pre_mass=round(float(batch.mass_kg or 0)-float(quantity_kg),3)
    batch.phase=f"Weight Check - {material_name}"
    batch.status="Running"
    batch.progress=0
    record_event(
        db,
        event_type="MixAdditionAwaitingCheckWeight",
        source="Mixing",
        entity_type="MixBatch",
        entity_id=batch.batch_id,
        message=(
            f"MATERIAL={material_name}|QTY={float(quantity_kg):.6f}|"
            f"PRE_MASS={pre_mass:.6f}|EXPECTED_MASS={batch.mass_kg:.6f}|"
            f"NEXT_PHASE={next_phase}|OPERATOR={operator}"
        ),
        severity="info",
    )


def _check_weight_context(db: Session, batch: MixBatch) -> dict[str,str]:
    """Return the check-weight context that belongs to the CURRENT phase.

    A batch can have many MixAdditionAwaitingCheckWeight events.  Using the
    latest event generically can accidentally resurrect the preceding material
    after an exception/approval cycle (for example Flavor instead of Dye Premix),
    which sends Operator Sign back to Dye Premix Transfer and creates a loop.

    Resolve the material directly from the active phase and fetch the newest
    context for that material.
    """
    prefixes=(
        "Weight Check - ",
        "Weight Exception - ",
        "MES Report - ",
        "Operator Sign - ",
    )
    material=None
    for prefix in prefixes:
        if (batch.phase or "").startswith(prefix):
            material=(batch.phase or "")[len(prefix):]
            break

    query=select(PlatformEvent).where(
        PlatformEvent.entity_type=="MixBatch",
        PlatformEvent.entity_id==batch.batch_id,
        PlatformEvent.event_type=="MixAdditionAwaitingCheckWeight",
    )
    if material:
        query=query.where(
            PlatformEvent.message.like(f"MATERIAL={material}|%")
        )
    event=db.scalar(query.order_by(PlatformEvent.id.desc()))
    return _event_parts(event)


def _run_mix_check_weight(db: Session, batch: MixBatch, operator: str):
    ctx=_check_weight_context(db,batch)
    if not ctx:
        raise ValueError("No pending addition check-weight context exists")
    material=ctx["MATERIAL"]
    expected=float(ctx["EXPECTED_MASS"])
    measured=float(batch.mass_kg or 0)
    add_qty=float(ctx["QTY"])
    tolerance=max(0.20, abs(add_qty)*(MIX_CHECK_WEIGHT_TOLERANCE_PERCENT/100.0))
    delta=abs(measured-expected)
    passed=delta<=tolerance

    record_event(
        db,
        event_type="MixCheckWeightPassed" if passed else "MixCheckWeightOutOfTolerance",
        source="Mixing Load Cell",
        entity_type="MixBatch",
        entity_id=batch.batch_id,
        message=(
            f"MATERIAL={material}|EXPECTED={expected:.6f}|MEASURED={measured:.6f}|"
            f"TOLERANCE={tolerance:.6f}|DELTA={delta:.6f}|OPERATOR={operator}"
        ),
        severity="info" if passed else "error",
    )

    if passed:
        batch.phase=f"MES Report - {material}"
        batch.status="Running"
        batch.progress=0
    else:
        batch.phase=f"Weight Exception - {material}"
        batch.status="Weight Check Exception"
        batch.fault_code="MIX-CHECK-WEIGHT-OOT"
        batch.fault_message=(
            f"{material} check weight {measured:.3f} kg outside "
            f"{expected:.3f} ± {tolerance:.3f} kg"
        )
        create_notification(
            db,
            recipient="Automation",
            title="Mix check-weight override required",
            message=f"{batch.po_number}: {batch.fault_message}",
            severity="error",
        )
        create_notification(
            db,
            recipient="Quality",
            title="Mix check-weight QA approval required",
            message=f"{batch.po_number}: {batch.fault_message}",
            severity="error",
        )
    return passed


def _mix_exception_approvals(db: Session, batch: MixBatch):
    ctx_event=db.scalar(
        select(PlatformEvent)
        .where(
            PlatformEvent.entity_type=="MixBatch",
            PlatformEvent.entity_id==batch.batch_id,
            PlatformEvent.event_type=="MixAdditionAwaitingCheckWeight",
        )
        .order_by(PlatformEvent.id.desc())
    )
    min_id=int(ctx_event.id) if ctx_event else 0
    automation=bool(db.scalar(
        select(PlatformEvent).where(
            PlatformEvent.entity_type=="MixBatch",
            PlatformEvent.entity_id==batch.batch_id,
            PlatformEvent.event_type=="MixWeightAutomationOverride",
            PlatformEvent.id>min_id,
        ).order_by(PlatformEvent.id.desc())
    ))
    qa=bool(db.scalar(
        select(PlatformEvent).where(
            PlatformEvent.entity_type=="MixBatch",
            PlatformEvent.entity_id==batch.batch_id,
            PlatformEvent.event_type=="MixWeightQAApproval",
            PlatformEvent.id>min_id,
        ).order_by(PlatformEvent.id.desc())
    ))
    return automation,qa


def _approve_mix_weight_exception(db: Session, batch: MixBatch, role: str, operator: str):
    if not batch.phase.startswith("Weight Exception -"):
        raise ValueError("No active check-weight exception")
    event_type="MixWeightAutomationOverride" if role=="automation" else "MixWeightQAApproval"
    source="Automation" if role=="automation" else "Quality"
    record_event(
        db,
        event_type=event_type,
        source=source,
        entity_type="MixBatch",
        entity_id=batch.batch_id,
        message=f"{source} approval recorded by {operator} for {batch.phase}.",
        severity="warning",
    )
    automation,qa=_mix_exception_approvals(db,batch)
    # include the just-added event before flush/commit
    if role=="automation": automation=True
    if role=="qa": qa=True
    if automation and qa:
        material=batch.phase.replace("Weight Exception - ","",1)
        batch.phase=f"MES Report - {material}"
        batch.status="Running"
        batch.progress=0
        batch.fault_code=None
        batch.fault_message=None


def _report_mix_addition_to_mes(db: Session, batch: MixBatch, operator: str):
    ctx=_check_weight_context(db,batch)
    if not ctx:
        raise ValueError("No checked addition is available for MES reporting")
    material=ctx["MATERIAL"]
    quantity=float(ctx["QTY"])
    if not batch.phase==f"MES Report - {material}":
        raise ValueError("Check weight must pass or receive both approvals before MES reporting")
    mes_log(
        db,
        po_number=batch.po_number,
        event_type="MATERIAL_ADD_CHECK_WEIGHT_VERIFIED",
        phase=f"Material Addition - {material}",
        equipment_id=batch.tank_code,
        operator_id=operator,
        material_name=material,
        quantity=quantity,
        unit="kg",
        metric="vessel_mass",
        value=float(batch.mass_kg or 0),
        message=(
            f"{material} physical add confirmed; check weight passed/approved; "
            f"vessel mass {float(batch.mass_kg or 0):.3f} kg"
        ),
        qualified=True,
    )
    batch.phase=f"Operator Sign - {material}"
    batch.status="Awaiting Operator Signature"


def _sign_mix_addition(db: Session, batch: MixBatch, operator: str):
    ctx=_check_weight_context(db,batch)
    if not ctx:
        raise ValueError("No addition is awaiting signature")
    material=ctx["MATERIAL"]
    if batch.phase!=f"Operator Sign - {material}":
        raise ValueError("MES reporting must complete before operator signature")
    record_event(
        db,
        event_type="MixAdditionOperatorSigned",
        source="Mixing",
        entity_type="MixBatch",
        entity_id=batch.batch_id,
        message=(
            f"MATERIAL={material}|PHASE={batch.phase}|OPERATOR={operator}|"
            f"TEXT={material} addition electronically signed by {operator}."
        ),
        severity="info",
    )
    batch.phase=ctx["NEXT_PHASE"]
    batch.status="Running" if batch.phase.startswith("Automatic ") else "Awaiting Operator"
    batch.progress=0 if batch.status=="Running" else 100


def _dye_premix_charge_kg(db: Session, batch: MixBatch) -> tuple[float,list[str]]:
    dye_lines=[
        line for line in _mix_ticket_lines(db,batch)
        if (
            "FD&C" in (line.material_name or "")
            or "Dye" in (line.material_name or "")
            or "Color" in (line.material_name or "")
        )
    ]
    dye_qty=sum(float(line.actual_quantity or line.target_quantity or 0) for line in dye_lines)
    # PMX-01 receives 10 kg premix water + 10 kg rinse water; both transfer to main tank.
    total=dye_qty+20.0
    names=[line.material_name for line in dye_lines]
    return total,names

def advance_mix_phase(db: Session, batch_id: str, action: str, operator: str):
    batch=get_mix_batch(db,batch_id)

    # PLC/process faults are hard execution interlocks.  The HMI may still show
    # the phase that was active when the fault occurred, but no recipe action,
    # barcode scan, material confirmation, MES/signature transition, or tank
    # operation may execute until Diagnose -> Reset PLC has cleared the fault.
    if batch.fault_code or batch.status=="Faulted":
        raise ValueError(
            f"{batch.fault_code or 'Active mix fault'} is active. "
            "Diagnose the fault and reset the PLC before continuing the batch."
        )

    if action.startswith("scan-barcode-"):
        from urllib.parse import unquote
        return verify_mix_material_barcode(
            db, batch_id, unquote(action[len("scan-barcode-"):]), operator
        )
    if action=="check-weight":
        if not batch.phase.startswith("Weight Check -"):
            raise ValueError("No addition is awaiting check weight")
        _run_mix_check_weight(db,batch,operator)
        db.commit(); db.refresh(batch); return batch
    if action=="automation-weight-override":
        _approve_mix_weight_exception(db,batch,"automation",operator)
        db.commit(); db.refresh(batch); return batch
    if action=="qa-weight-approve":
        _approve_mix_weight_exception(db,batch,"qa",operator)
        db.commit(); db.refresh(batch); return batch
    if action=="report-to-mes":
        _report_mix_addition_to_mes(db,batch,operator)
        db.commit(); db.refresh(batch); return batch
    if action=="operator-sign-addition":
        _sign_mix_addition(db,batch,operator)
        db.commit(); db.refresh(batch); return batch

    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==batch.po_number))
    transitions={
        ("Confirm Water Charge","confirm-water"):("Weight Check - Water","Running","Water physical charge complete; automatic check weight started."),
        ("Open Tank - Manual Group 1","open-tank-1"):("Manual Add - Alcohol","Awaiting Operator","Tank opened; Alcohol released."),
        ("Manual Add - Alcohol","confirm-manual-alcohol"):("Weight Check - Alcohol","Running","Alcohol physically added; automatic check weight started."),
        ("Manual Add - Anhydrous Citric Acid","confirm-manual-citric"):("Weight Check - Anhydrous Citric Acid","Running","Citric Acid physically added; automatic check weight started."),
        ("Manual Add - Benzoic Acid","confirm-manual-benzoic"):("Weight Check - Benzoic Acid","Running","Benzoic Acid physically added; automatic check weight started."),
        ("Close Tank - Glycerin","close-tank-1"):("Automatic Glycerin Add","Running","Tank closed; Glycerin automatic add started."),
        ("Confirm Glycerin Add","confirm-glycerin"):("Weight Check - Glycerin","Running","Glycerin automatic charge complete; automatic check weight started."),
        ("Confirm Propylene Glycol Add","confirm-propylene-glycol"):("Weight Check - Propylene Glycol","Running","Propylene Glycol automatic charge complete; automatic check weight started."),
        ("Open Tank - Manual Group 2","open-tank-2"):("Manual Add - Edetate Disodium","Awaiting Operator","Tank opened; Edetate Disodium released."),
        ("Manual Add - Edetate Disodium","confirm-manual-edetate"):("Weight Check - Edetate Disodium","Running","Edetate Disodium physically added; automatic check weight started."),
        ("Manual Add - Saccharin Sodium","confirm-manual-saccharin"):("Weight Check - Saccharin Sodium","Running","Saccharin Sodium physically added; automatic check weight started."),
        ("Close Tank - Sucrose","close-tank-2"):("Automatic Sucrose Bulk Add","Running","Tank closed; Sucrose automatic add started."),
        ("Confirm Sucrose Bulk Add","confirm-sucrose"):("Weight Check - Sucrose","Running","Sucrose automatic charge complete; automatic check weight started."),
        ("Open Tank - API / Flavor","open-tank-3"):("Controlled API Addition","Awaiting Operator","Tank opened; Prednisolone released."),
        ("Controlled API Addition","confirm-api"):("Weight Check - Prednisolone","Running","Prednisolone physically added; automatic check weight started."),
        ("Flavor Addition","confirm-flavor"):("Weight Check - Flavor","Running","Flavor physically added; automatic check weight started."),
        ("Dye Premix Transfer","confirm-dye-premix"):("Weight Check - Dye Premix","Running","Dye premix transferred; automatic check weight started."),
        ("Close Tank - Final Agitation","close-tank-3"):("Final Agitation","Running","Final agitation started."),
        ("Confirm Final Agitation","confirm-final-agitation"):("Select Hold Tank","Ready for Hold Selection","Final agitation confirmed."),
    }
    key=(batch.phase,action)
    if key not in transitions: raise ValueError(f"Action {action} is not permitted during {batch.phase}")
    if action in {
        "confirm-manual-alcohol",
        "confirm-manual-citric",
        "confirm-manual-benzoic",
        "confirm-manual-edetate",
        "confirm-manual-saccharin",
        "confirm-api",
        "confirm-flavor",
    }:
        _require_current_mix_scan(db,batch)
    if batch.phase=="Dye Premix Transfer":
        premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
        if not premix or premix.status!="Complete": raise ValueError("Qualified dye premix must be complete before transfer")
    if action=="confirm-water":
        _begin_addition_check(
            db,batch,
            material_name="Water",
            quantity_kg=_bulk_recipe_requirements(db)["Water"],
            next_phase="Open Tank - Manual Group 1",
            operator=operator,
            apply_mass=False,
        )
    elif action=="confirm-manual-alcohol":
        line=next(x for x in _mix_ticket_lines(db,batch) if x.material_name=="Alcohol")
        _begin_addition_check(db,batch,material_name="Alcohol",quantity_kg=float(line.actual_quantity or line.target_quantity or 0),next_phase="Manual Add - Anhydrous Citric Acid",operator=operator)
    elif action=="confirm-manual-citric":
        line=next(x for x in _mix_ticket_lines(db,batch) if x.material_name=="Anhydrous Citric Acid")
        _begin_addition_check(db,batch,material_name="Anhydrous Citric Acid",quantity_kg=float(line.actual_quantity or line.target_quantity or 0),next_phase="Manual Add - Benzoic Acid",operator=operator)
    elif action=="confirm-manual-benzoic":
        line=next(x for x in _mix_ticket_lines(db,batch) if x.material_name=="Benzoic Acid")
        _begin_addition_check(db,batch,material_name="Benzoic Acid",quantity_kg=float(line.actual_quantity or line.target_quantity or 0),next_phase="Close Tank - Glycerin",operator=operator)
    elif action=="confirm-glycerin":
        amount=_bulk_recipe_requirements(db)["Glycerin"]
        _begin_addition_check(
            db,batch,
            material_name="Glycerin",
            quantity_kg=amount,
            next_phase="Automatic Propylene Glycol Add",
            operator=operator,
            apply_mass=False,
        )
    elif action=="confirm-propylene-glycol":
        amount=_bulk_recipe_requirements(db)["Propylene Glycol"]
        _begin_addition_check(
            db,batch,
            material_name="Propylene Glycol",
            quantity_kg=amount,
            next_phase="Open Tank - Manual Group 2",
            operator=operator,
            apply_mass=False,
        )
    elif action=="confirm-manual-edetate":
        line=next(x for x in _mix_ticket_lines(db,batch) if x.material_name=="Edetate Disodium")
        _begin_addition_check(db,batch,material_name="Edetate Disodium",quantity_kg=float(line.actual_quantity or line.target_quantity or 0),next_phase="Manual Add - Saccharin Sodium",operator=operator)
    elif action=="confirm-manual-saccharin":
        line=next(x for x in _mix_ticket_lines(db,batch) if x.material_name=="Saccharin Sodium")
        _begin_addition_check(db,batch,material_name="Saccharin Sodium",quantity_kg=float(line.actual_quantity or line.target_quantity or 0),next_phase="Close Tank - Sucrose",operator=operator)
    elif action=="confirm-sucrose":
        amount=_bulk_recipe_requirements(db)["Sucrose"]
        _begin_addition_check(
            db,batch,
            material_name="Sucrose",
            quantity_kg=amount,
            next_phase="Open Tank - API / Flavor",
            operator=operator,
            apply_mass=False,
        )
    elif action=="confirm-api":
        line=next(x for x in _mix_ticket_lines(db,batch) if x.material_name=="Prednisolone")
        _begin_addition_check(db,batch,material_name="Prednisolone",quantity_kg=float(line.actual_quantity or line.target_quantity or 0),next_phase="Flavor Addition",operator=operator)
    elif action=="confirm-flavor":
        flavor=_mix_current_manual_material(db,batch)
        line=next(x for x in _mix_ticket_lines(db,batch) if x.material_name==flavor)
        _begin_addition_check(db,batch,material_name="Flavor",quantity_kg=float(line.actual_quantity or line.target_quantity or 0),next_phase="Dye Premix Transfer" if batch.requires_premix else "Close Tank - Final Agitation",operator=operator)
    elif action=="confirm-dye-premix":
        premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
        dye_kg=0.0
        for row in batch_genealogy(db,batch.po_number):
            if row.get("material_name") in {"FD&C Red No. 33","FD&C Red No. 40","FD&C Blue No. 1","FD&C Yellow No. 5"}:
                qty=float(row.get("actual_quantity") if row.get("actual_quantity") is not None else row.get("required_quantity") or 0)
                dye_kg += qty/1000.0 if row.get("unit_of_measure")=="g" else qty

        # PMX-01 contains two qualified 10 kg water charges plus the selected
        # recipe dye quantity.  This material may be transferred to the main
        # vessel exactly ONCE.
        water_kg=float(
            (premix.premix_water_kg if premix else 10)
            + (premix.rinse_water_kg if premix else 10)
        )
        premix_charge_kg=round(water_kg+dye_kg,6)

        # Make Confirm Premix Add idempotent. Browser refreshes, retries, or a
        # resumed batch must never add another 20 kg of premix water.
        prior_transfer=db.scalar(
            select(PlatformEvent)
            .where(
                PlatformEvent.entity_type=="MixBatch",
                PlatformEvent.entity_id==batch.batch_id,
                PlatformEvent.event_type=="DyePremixTransferred",
            )
            .order_by(PlatformEvent.id.desc())
        )

        if not prior_transfer:
            before_mass=float(batch.mass_kg or 0)
            _add_batch_mass(
                db,
                batch,
                premix_charge_kg,
                "Dye premix + rinse transfer",
                operator,
            )
            record_event(
                db,
                event_type="DyePremixTransferred",
                source="PMX-01",
                entity_type="MixBatch",
                entity_id=batch.batch_id,
                message=(
                    f"QTY={premix_charge_kg:.6f}|PRE_MASS={before_mass:.6f}|"
                    f"POST_MASS={float(batch.mass_kg or 0):.6f}|OPERATOR={operator}"
                ),
                severity="info",
            )
            _mes_log_batch_materials(
                db,
                batch,
                {"FD&C Red No. 33","FD&C Red No. 40","FD&C Blue No. 1","FD&C Yellow No. 5"},
                operator,
            )

        # The physical transfer has already occurred (either above or on an
        # earlier request), so the check-weight expected mass is the CURRENT
        # vessel mass. apply_mass=False prevents a second physical addition.
        _begin_addition_check(
            db,
            batch,
            material_name="Dye Premix",
            quantity_kg=premix_charge_kg,
            next_phase="Close Tank - Final Agitation",
            operator=operator,
            apply_mass=False,
        )
        _phase_event(
            db,
            batch,
            "BatchPhaseConfirmed",
            "Dye premix transferred exactly once; automatic check weight started.",
            operator,
        )
        db.commit()
        db.refresh(batch)
        return batch

    phase,status,message=transitions[key]
    batch.phase=phase; batch.status=status; batch.progress=0 if status=="Running" else 100
    if phase.startswith("Open Tank") or phase.startswith("Manual") or phase in {"Controlled API Addition","Flavor Addition"}: batch.vessel_closed=False; batch.vacuum_bar=0; batch.agitator_command_rpm=25; batch.rpm=25
    if phase.startswith("Automatic Bulk"): batch.vessel_closed=True; batch.vacuum_bar=-0.35; batch.agitator_command_rpm=62
    if phase=="Automatic Sucrose Bulk Add": batch.vessel_closed=True; batch.vacuum_bar=-0.35; batch.agitator_command_rpm=78
    if phase=="Final Agitation": batch.vessel_closed=True; batch.vacuum_bar=-0.35; batch.agitator_command_rpm=550
    _phase_event(db,batch,"BatchPhaseConfirmed",message,operator)
    db.commit(); db.refresh(batch); return batch


def confirm_premix_water(db: Session,batch_id: str,pot: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    if not batch.requires_premix: raise ValueError("This formula does not require dye premix")
    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    if not premix: raise ValueError("Premix is not staged")
    if pot=="premix":
        premix.premix_water_kg=10.0; premix.status="Awaiting Rinse Water"; batch.premix_status=premix.status
        event="PREMIX_WATER_VERIFIED"
    elif pot=="rinse":
        if premix.premix_water_kg < 10: raise ValueError("Confirm premix pot water first")
        premix.rinse_water_kg=10.0; premix.status="Ready for Agitation"; batch.premix_status=premix.status
        event="RINSE_WATER_VERIFIED"
    else: raise ValueError("pot must be premix or rinse")
    mes_log(db,po_number=batch.po_number,event_type=event,phase="Dye Premix",equipment_id="PMX-01",operator_id=operator,material_name="Purified Water",quantity=10.0,unit="kg",message=f"10 kg water verified in {pot} pot; main mix tank mass unchanged")
    db.commit(); db.refresh(premix); return premix

def start_premix(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    if not batch.requires_premix: raise ValueError("This formula does not require dye premix")
    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    if not premix:
        raise ValueError("Premix is not staged")
    if premix.premix_water_kg < 10 or premix.rinse_water_kg < 10:
        raise ValueError("Confirm 10 kg premix water and 10 kg rinse water before agitation")
    if premix.status=="Complete": return premix
    elif premix.status.startswith("Faulted"):
        premix.status="Running"; premix.rpm=850
        record_event(db,event_type="PremixFaultRecovered",source="PMX-01",entity_type="PremixRun",entity_id=premix.run_id,message=f"{operator} acknowledged agitator fault and restored 850 RPM; qualified timer resumed.",severity="info")
    else:
        premix.status="Running"; premix.rpm=850
    batch.premix_status="Running"
    db.commit(); db.refresh(premix); return premix


def confirm_premix(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    if not premix: raise ValueError("PREMIX NOT STARTED")
    if premix.status!="Awaiting Confirmation" or premix.progress<100 or not (825 <= premix.rpm <= 875):
        raise ValueError("Premix requires 100% qualified mix time and verified 825-875 RPM before confirmation")
    premix.status="Complete"; premix.operator_confirmed=True; batch.premix_status="Complete"
    record_event(db,event_type="PremixConfirmed",source="PMX-01",entity_type="PremixRun",entity_id=premix.run_id,message=f"Premix speed and qualified mix time verified by {operator}; premix READY_FOR_BATCH.",severity="info")
    db.commit(); db.refresh(batch); return batch


# Backward-compatible aliases retained for older UI/API clients.
def confirm_bulk_pg_addition(db: Session,batch_id: str,operator: str):
    return advance_mix_phase(db,batch_id,"confirm-bulk-group-1",operator)

def confirm_manual_adds(db: Session,batch_id: str,operator: str):
    """Legacy API alias retained without restoring grouped execution.

    It advances only the currently active single material.
    """
    batch=get_mix_batch(db,batch_id)
    action_by_phase={
        "Manual Group 1":"confirm-manual-alcohol",
        "Manual Add - Alcohol":"confirm-manual-alcohol",
        "Manual Add - Anhydrous Citric Acid":"confirm-manual-citric",
        "Manual Add - Benzoic Acid":"confirm-manual-benzoic",
        "Manual Group 2":"confirm-manual-edetate",
        "Manual Add - Edetate Disodium":"confirm-manual-edetate",
        "Manual Add - Saccharin Sodium":"confirm-manual-saccharin",
    }
    action=action_by_phase.get(batch.phase)
    if not action:
        raise ValueError(f"No manual add is active during {batch.phase}")
    return advance_mix_phase(db,batch_id,action,operator)


def select_hold_tank(db: Session,batch_id: str,tank_code: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Ready for Hold Selection":
        raise ValueError("Batch is not ready for hold-tank selection")

    tank=db.scalar(select(HoldTank).where(HoldTank.tank_code==tank_code))
    if not tank:
        raise ValueError("Unknown hold tank")

    # Empty, clean hold tanks legitimately carry QA "Not Applicable" because
    # there is no batch in the vessel yet.  QA disposition applies AFTER the
    # mix transfer/sample, not before a clean empty tank is selected.
    tank_status=(tank.status or "").strip().lower()
    cip_status=(tank.cip_status or "").strip().lower()
    qa_status=(tank.qa_status or "").strip().lower()
    level=float(tank.level_percent or 0)

    status_ok=tank_status in {"available","ready","idle clean"}
    cip_ok=cip_status in {"clean / available","clean","available"}
    qa_ok=qa_status in {"not applicable","available","empty","released",""}
    level_ok=level <= 0.001
    ownership_ok=not tank.active_po or tank.active_po==batch.po_number

    if not (status_ok and cip_ok and qa_ok and level_ok and ownership_ok):
        reasons=[]
        if not status_ok:
            reasons.append(f"status {tank.status}")
        if not cip_ok:
            reasons.append(f"CIP {tank.cip_status}")
        if not qa_ok:
            reasons.append(f"QA {tank.qa_status}")
        if not level_ok:
            reasons.append(f"level {level:.1f}%")
        if not ownership_ok:
            reasons.append(f"active PO {tank.active_po}")
        raise ValueError(f"{tank_code} is not clean and available: " + "; ".join(reasons))

    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==batch.po_number))
    if po and po.hold_tank!=tank_code:
        raise ValueError(
            f"{tank_code} is not the scheduled hold tank; submit an Office route-change request"
        )

    batch.selected_hold_tank=tank_code
    batch.status="Ready for Transfer"
    batch.phase="Transfer Ready"

    # Preserve the plant's lowercase equipment-state convention.
    tank.status="reserved"
    tank.active_po=batch.po_number
    tank.cip_status="Clean / Available"
    tank.qa_status="Not Applicable"

    db.commit()
    db.refresh(batch)
    return batch


MIX_TANK_LOW_LOW_KG = 40.0
MIX_TANK_HIGH_HIGH_KG = 9200.0
HOLD_TANK_LOW_LOW_KG = 80.0
HOLD_TANK_HIGH_HIGH_KG = 10000.0

MIX_TANK_HIGH_APPROACH_KG = MIX_TANK_HIGH_HIGH_KG * 0.90
HOLD_TANK_HIGH_APPROACH_KG = HOLD_TANK_HIGH_HIGH_KG * 0.90
MIX_TANK_PULSE_ZONE_KG = 400.0
HOLD_TANK_PULSE_ZONE_KG = 500.0


def _tank_alarm_event_exists(db: Session, entity_type: str, entity_id: str, event_type: str) -> bool:
    return bool(
        db.scalar(
            select(PlatformEvent.id)
            .where(
                PlatformEvent.entity_type==entity_type,
                PlatformEvent.entity_id==entity_id,
                PlatformEvent.event_type==event_type,
            )
            .order_by(PlatformEvent.id.desc())
            .limit(1)
        )
    )


def _monitor_mix_tank_limits(db: Session, batch: MixBatch):
    mass=float(batch.mass_kg or 0)

    if mass>=MIX_TANK_HIGH_HIGH_KG:
        batch.mass_kg=MIX_TANK_HIGH_HIGH_KG
        batch.status="Faulted"
        batch.fault_code="MIX-HH-9200"
        batch.fault_message=(
            f"{batch.tank_code} reached high-high {MIX_TANK_HIGH_HIGH_KG:.0f} kg"
        )
        if not _tank_alarm_event_exists(db,"MixBatch",batch.batch_id,"MixTankHighHigh"):
            record_event(
                db,event_type="MixTankHighHigh",source="Mixing PLC",
                entity_type="MixBatch",entity_id=batch.batch_id,
                message=batch.fault_message,severity="error",
            )
            create_notification(
                db,recipient="Automation",title="Mix tank high-high trip",
                message=f"{batch.po_number}: {batch.fault_message}. Process output is interlocked.",
                severity="error",
            )
        return

    if mass>=MIX_TANK_HIGH_APPROACH_KG:
        if not _tank_alarm_event_exists(db,"MixBatch",batch.batch_id,"MixTankHighApproaching"):
            record_event(
                db,event_type="MixTankHighApproaching",source="Mixing PLC",
                entity_type="MixBatch",entity_id=batch.batch_id,
                message=(
                    f"{batch.tank_code} level is approaching high-high: "
                    f"{mass:.1f}/{MIX_TANK_HIGH_HIGH_KG:.0f} kg"
                ),severity="warning",
            )
            create_notification(
                db,recipient="Mixing",title="Mix tank high approaching",
                message=(
                    f"{batch.po_number}: {batch.tank_code} is at {mass:.1f} kg; "
                    f"HH is {MIX_TANK_HIGH_HIGH_KG:.0f} kg."
                ),severity="warning",
            )


def _monitor_hold_tank_high_limits(db: Session, hold: HoldTank, po_number: str):
    mass=float(hold.transferred_quantity or 0)

    if mass>=HOLD_TANK_HIGH_HIGH_KG:
        hold.transferred_quantity=HOLD_TANK_HIGH_HIGH_KG
        hold.status="High-High Interlock"
        if not _tank_alarm_event_exists(db,"HoldTank",hold.tank_code,"HoldTankHighHigh"):
            record_event(
                db,event_type="HoldTankHighHigh",source="Hold Tank PLC",
                entity_type="HoldTank",entity_id=hold.tank_code,
                message=(
                    f"{hold.tank_code} reached high-high "
                    f"{HOLD_TANK_HIGH_HIGH_KG:.0f} kg"
                ),severity="error",
            )
            create_notification(
                db,recipient="Automation",title="Hold tank high-high trip",
                message=(
                    f"{po_number}: {hold.tank_code} reached "
                    f"{HOLD_TANK_HIGH_HIGH_KG:.0f} kg. Inlet is interlocked."
                ),severity="error",
            )
        return

    if mass>=HOLD_TANK_HIGH_APPROACH_KG:
        if not _tank_alarm_event_exists(db,"HoldTank",hold.tank_code,"HoldTankHighApproaching"):
            record_event(
                db,event_type="HoldTankHighApproaching",source="Hold Tank PLC",
                entity_type="HoldTank",entity_id=hold.tank_code,
                message=(
                    f"{hold.tank_code} is approaching high-high: "
                    f"{mass:.1f}/{HOLD_TANK_HIGH_HIGH_KG:.0f} kg"
                ),severity="warning",
            )
            create_notification(
                db,recipient="Mixing",title="Hold tank high approaching",
                message=(
                    f"{po_number}: {hold.tank_code} is at {mass:.1f} kg; "
                    f"HH is {HOLD_TANK_HIGH_HIGH_KG:.0f} kg."
                ),severity="warning",
            )


def _pulsed_outflow_step(current_kg: float, low_low_kg: float, nominal_step_kg: float, pulse_zone_kg: float) -> float:
    """Slow/pulse the outlet as it approaches LL and never drain below the retained heel."""
    available=max(0.0,current_kg-low_low_kg)
    if available<=0:
        return 0.0
    if available<=pulse_zone_kg:
        # progressively smaller pulses near LL; final pulse lands exactly on LL
        return min(available,max(5.0,available*0.35))
    return min(available,nominal_step_kg)



def tank_level_limits() -> dict[str, dict[str, float]]:
    """Governed tank alarm/interlock limits used by the Pharma twin."""
    return {
        "mix_tank": {
            "low_low_kg": MIX_TANK_LOW_LOW_KG,
            "high_high_kg": MIX_TANK_HIGH_HIGH_KG,
        },
        "hold_tank": {
            "low_low_kg": HOLD_TANK_LOW_LOW_KG,
            "high_high_kg": HOLD_TANK_HIGH_HIGH_KG,
        },
    }


def _transfer_start_context(db: Session, batch: MixBatch) -> dict[str, float]:
    event=db.scalar(
        select(PlatformEvent)
        .where(
            PlatformEvent.entity_type=="MixBatch",
            PlatformEvent.entity_id==batch.batch_id,
            PlatformEvent.event_type=="TransferStarted",
        )
        .order_by(PlatformEvent.id.desc())
    )
    initial=float(batch.mass_kg or 0)
    destination_initial=0.0
    if event:
        for part in (event.message or "").split("|"):
            if part.startswith("INITIAL_MASS_KG="):
                initial=float(part.split("=",1)[1])
            elif part.startswith("DEST_INITIAL_KG="):
                destination_initial=float(part.split("=",1)[1])
    return {
        "initial_mass_kg":initial,
        "destination_initial_kg":destination_initial,
    }


def start_transfer(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Ready for Transfer" or not batch.selected_hold_tank:
        raise ValueError("Select an approved hold tank before transfer")

    hold=db.scalar(select(HoldTank).where(HoldTank.tank_code==batch.selected_hold_tank))
    if not hold:
        raise ValueError("Selected hold tank was not found")

    source_mass=float(batch.mass_kg or 0)
    destination_mass=float(hold.transferred_quantity or 0)

    if source_mass<=MIX_TANK_LOW_LOW_KG:
        raise ValueError(
            f"Mix vessel is already at/below low-low {MIX_TANK_LOW_LOW_KG:.0f} kg"
        )
    if source_mass>MIX_TANK_HIGH_HIGH_KG:
        raise ValueError(
            f"Mix vessel exceeds high-high {MIX_TANK_HIGH_HIGH_KG:.0f} kg"
        )
    if destination_mass>=HOLD_TANK_HIGH_HIGH_KG:
        raise ValueError(
            f"{hold.tank_code} is already at high-high {HOLD_TANK_HIGH_HIGH_KG:.0f} kg"
        )

    batch.status="Transferring"
    batch.phase="Transfer"
    batch.progress=0
    batch.sample_collected=False

    hold.status="Receiving"
    hold.qa_status="In Process"
    hold.source_mix_tank=batch.tank_code

    record_event(
        db,
        event_type="TransferStarted",
        source="Mixing",
        entity_type="MixBatch",
        entity_id=batch_id,
        message=(
            f"TARGET={batch.selected_hold_tank}|INITIAL_MASS_KG={source_mass:.6f}|"
            f"DEST_INITIAL_KG={destination_mass:.6f}|"
            f"MIX_LOW_LOW_KG={MIX_TANK_LOW_LOW_KG:.6f}|"
            f"MIX_HIGH_HIGH_KG={MIX_TANK_HIGH_HIGH_KG:.6f}|"
            f"HOLD_LOW_LOW_KG={HOLD_TANK_LOW_LOW_KG:.6f}|"
            f"HOLD_HIGH_HIGH_KG={HOLD_TANK_HIGH_HIGH_KG:.6f}|"
            f"OPERATOR={operator}"
        ),
        severity="info",
    )
    db.commit()
    db.refresh(batch)
    return batch


def collect_transfer_sample(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)

    # Idempotent resume support: once the sample has been collected, returning
    # to the page must not recreate the Sample Hold prompt.
    if batch.sample_collected and batch.status=="Awaiting Termination":
        return batch

    if batch.status!="Sample Hold" or batch.phase!="Transfer Sample Required":
        raise ValueError("No transfer sample is currently required")
    if float(batch.mass_kg or 0)<MIX_TANK_LOW_LOW_KG-0.001:
        raise ValueError(
            f"Transfer sample cannot be collected below the mix-tank low-low heel of {MIX_TANK_LOW_LOW_KG:.0f} kg"
        )

    # The transfer has stopped on source low-low, deliberately preserving the
    # remaining heel for transfer sampling before termination.
    # entered. Collecting the sample must therefore advance directly to the
    # post-transfer termination gate. Returning to Transferring with progress
    # already at 100% caused tick_mix_batch() to immediately recreate the same
    # Sample Hold prompt.
    batch.sample_collected=True
    batch.status="Awaiting Termination"
    batch.phase="Transfer Complete"
    batch.progress=100

    hold=db.scalar(
        select(HoldTank).where(HoldTank.tank_code==batch.selected_hold_tank)
    )
    if hold:
        hold.status="Receiving Complete"
        hold.qa_status="Awaiting Batch Termination"
        # Preserve the actual destination mass accumulated during transfer.
        hold.transferred_quantity=float(hold.transferred_quantity or 0)
        hold.source_mix_tank=batch.tank_code
        hold.transfer_completed_at=hold.transfer_completed_at or utc_now()

    record_event(
        db,
        event_type="TransferSampleCollected",
        source="LIMS",
        entity_type="MixBatch",
        entity_id=batch_id,
        message=(
            f"Transfer sample collected by {operator}; transfer is complete and "
            f"batch termination is now required."
        ),
        severity="info",
    )
    mes_log(
        db,
        po_number=batch.po_number,
        event_type="TRANSFER_SAMPLE_COLLECTED",
        phase="Transfer Complete",
        equipment_id=batch.selected_hold_tank or batch.tank_code,
        operator_id=operator,
        metric="transfer_progress",
        value=100.0,
        unit="percent",
        message="LIMS transfer sample collected; batch released to termination gate.",
        qualified=True,
    )
    db.commit()
    db.refresh(batch)
    return batch


def terminate_mix_batch(db: Session, batch_id: str, operator: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Awaiting Termination" or batch.phase!="Transfer Complete":
        raise ValueError("Transfer must be complete before terminating the batch")
    if not batch.sample_collected:
        raise ValueError("LIMS transfer sample must be collected before batch termination")
    if batch.fault_code:
        raise ValueError("Clear the active PLC fault before terminating the batch")
    hold=db.scalar(select(HoldTank).where(HoldTank.tank_code==batch.selected_hold_tank))
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==batch.po_number))
    room=db.scalar(select(MixRoom).where(MixRoom.room_code==batch.room_code))
    if not hold or not po:
        raise ValueError("Hold-tank or production-order genealogy is incomplete")
    sample_id=f"LIMS-{batch.batch_number}-{hold.tank_code}"
    hold.status="QA Hold"
    hold.qa_status="QA Hold"
    _assert_hold_tank_available_for_po(hold, batch.po_number); hold.active_po=batch.po_number
    hold.batch_number=batch.batch_number
    hold.product_name=po.product_name
    # Destination quantity is the actual transferred mass; batch.mass_kg is
    # intentionally the retained 80 kg source heel at this point.
    hold.transferred_quantity=float(hold.transferred_quantity or 0)
    hold.source_mix_tank=batch.tank_code
    hold.transfer_completed_at=hold.transfer_completed_at or utc_now()
    hold.lims_sample_id=sample_id
    hold.cip_status="In Use"
    if room:
        room.status="Dirty / CIP Required"
        room.cip_status="Dirty / CIP Required"
        room.active_po=None
    batch.status="Complete"
    batch.phase="Batch Terminated"
    batch.progress=100
    po.status="Bulk QA Hold"
    task=QABulkTask(
        task_id=f"QA-{uuid4().hex[:8].upper()}",
        po_number=po.po_number,
        batch_number=po.batch_number,
        product_name=po.product_name,
        hold_tank=hold.tank_code,
        sample_id=sample_id,
        status="Pending Review",
    )
    db.add(task)
    record_event(db,event_type="BatchTerminated",source="Mixing",entity_type="MixBatch",entity_id=batch.batch_id,message=f"Batch terminated by {operator}; {hold.tank_code} entered QA Hold.",severity="info")
    record_event(db,event_type="QAHoldCreated",source="LIMS",entity_type="QABulkTask",entity_id=task.task_id,message=f"Bulk sample {sample_id} is pending QA disposition.",severity="warning")
    create_notification(db,recipient="Quality",title="Bulk QA disposition required",message=f"{po.po_number} in {hold.tank_code} is on QA Hold. Sample {sample_id} is ready for review.",severity="warning")
    db.commit(); db.refresh(batch); return batch


def list_qa_bulk_tasks(db: Session):
    return list(db.scalars(select(QABulkTask).order_by(QABulkTask.id.desc())).all())


def decide_qa_bulk_task(db: Session, task_id: str, disposition: str, note: str):
    task=db.scalar(select(QABulkTask).where(QABulkTask.task_id==task_id))
    if not task: raise ValueError("QA bulk task not found")
    if task.status!="Pending Review": raise ValueError("QA bulk task has already been decided")
    normalized=disposition.strip().title()
    if normalized not in {"Release","Hold","Reject"}: raise ValueError("Disposition must be Release, Hold, or Reject")
    task.disposition=normalized
    task.disposition_note=note
    task.decided_at=utc_now()
    hold=db.scalar(select(HoldTank).where(HoldTank.tank_code==task.hold_tank))
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==task.po_number))
    if normalized=="Release":
        task.status="Released"
        if hold: hold.status="Released Bulk"; hold.qa_status="Released"
        if po: po.status="Bulk Released for Packaging"
        severity="info"
    elif normalized=="Hold":
        task.status="On Hold"
        if hold: hold.status="QA Hold"; hold.qa_status="QA Hold"
        if po: po.status="Bulk QA Hold"
        severity="warning"
    else:
        task.status="Rejected"
        if hold: hold.status="Rejected Bulk"; hold.qa_status="Rejected"
        if po: po.status="Bulk Rejected"
        severity="error"
    record_event(db,event_type=f"Bulk{normalized}",source="Quality",entity_type="QABulkTask",entity_id=task.task_id,message=note or f"Bulk disposition: {normalized}.",severity=severity)
    create_notification(db,recipient="Packaging" if normalized=="Release" else "Office",title=f"Bulk {normalized.lower()}",message=f"{task.po_number} in {task.hold_tank}: {normalized}.",severity=severity)
    db.commit(); db.refresh(task); return task


def _mix_resume_status_for_phase(batch: MixBatch) -> str:
    """Restore the execution mode that belongs to the interrupted phase."""
    phase=(batch.phase or "").strip()

    if phase in {"Transfer","Transfer Ready"}:
        return "Transferring" if phase=="Transfer" else "Ready for Transfer"

    if (
        phase.startswith("Weight Check -")
        or phase.startswith("MES Report -")
        or phase in {
            "Initial Water Charge",
            "Automatic Glycerin Add",
            "Automatic Propylene Glycol Add",
            "Automatic Sucrose Bulk Add",
            "Final Agitation",
        }
    ):
        return "Running"

    if phase.startswith("Operator Sign -"):
        return "Awaiting Operator Signature"

    if phase.startswith("Weight Exception -"):
        return "Weight Check Exception"

    # Manual confirmations, open/close-tank steps, API/flavor additions,
    # final-agitation confirmation, and hold selection are operator gates.
    return "Awaiting Operator"


def diagnose_mix_fault(db: Session,batch_id: str):
    batch=get_mix_batch(db,batch_id)

    # A latched fault_code is authoritative. Do not require status=="Faulted":
    # older/stale UI actions may have changed the displayed status while the PLC
    # fault remained latched.
    if not batch.fault_code:
        raise ValueError("No active fault")

    batch.status="Faulted"
    batch.fault_diagnosed=True
    record_event(
        db,
        event_type="ProcessFaultDiagnosed",
        source="Mixing PLC",
        entity_type="MixBatch",
        entity_id=batch_id,
        message=f"{batch.fault_code} diagnosed; PLC reset is now permitted.",
        severity="warning",
    )
    db.commit()
    db.refresh(batch)
    return batch


def reset_mix_fault(db: Session,batch_id: str):
    batch=get_mix_batch(db,batch_id)

    if not batch.fault_code:
        raise ValueError("No active fault")
    if not batch.fault_diagnosed:
        raise ValueError("Diagnose the fault before reset")

    cleared_code=batch.fault_code
    resume_status=_mix_resume_status_for_phase(batch)

    batch.fault_code=None
    batch.fault_message=None
    batch.fault_diagnosed=False
    batch.status=resume_status

    # Restore healthy simulated instrumentation without changing the phase or
    # executing the interrupted operation. The operator/system resumes exactly
    # where the fault occurred.
    batch.rpm=batch.agitator_command_rpm
    batch.motor_load_percent=45
    batch.vacuum_bar=-0.35 if batch.vessel_closed else 0

    record_event(
        db,
        event_type="ProcessFaultReset",
        source="Mixing PLC",
        entity_type="MixBatch",
        entity_id=batch_id,
        message=(
            f"{cleared_code} cleared; phase {batch.phase} restored with "
            f"execution status {resume_status}."
        ),
        severity="info",
    )
    mes_log(
        db,
        po_number=batch.po_number,
        event_type="EQUIPMENT_FAULT_RESET",
        phase=batch.phase,
        equipment_id=batch.tank_code,
        operator_id=batch.operator,
        message=f"{cleared_code} diagnosed and reset; interrupted phase restored.",
        severity="info",
        qualified=True,
    )
    db.commit()
    db.refresh(batch)
    return batch


def _resource_value(po: ProductionOrder, resource_type: str) -> str:
    mapping = {
        "weigh_room": "weigh_room",
        "mix_tank": "mix_tank",
        "hold_tank": "hold_tank",
        "packaging_line": "packaging_line",
        "production_quantity": "quantity",
        "finished_goods_quantity": "quantity",
        "sucrose_source_tank": "bulk_material",
    }
    attr = mapping.get(resource_type)
    if not attr:
        raise ValueError("Unsupported resource type")
    return str(getattr(po, attr))


def _validate_requested_resource(db: Session, resource_type: str, requested_resource: str) -> None:
    if resource_type == "weigh_room":
        ensure_weigh_rooms(db)
        room = db.scalar(select(WeighRoom).where(WeighRoom.room_code == requested_resource))
        if not room:
            raise ValueError("Requested weigh room does not exist")
        if room.status != "Available":
            raise ValueError("Requested weigh room is not available")
    elif resource_type == "mix_tank":
        ensure_mixing_assets(db)
        room = db.scalar(select(MixRoom).where(MixRoom.tank_code == requested_resource))
        if not room:
            raise ValueError("Requested mix tank does not exist")
        if room.status != "Available" or room.cip_status != "Clean / Available":
            raise ValueError("Requested mix tank is not clean and available")
    elif resource_type == "hold_tank":
        ensure_mixing_assets(db)
        tank = db.scalar(select(HoldTank).where(HoldTank.tank_code == requested_resource))
        if not tank:
            raise ValueError("Requested hold tank does not exist")
        if tank.status != "Available" or tank.cip_status != "Clean / Available" or tank.level_percent > 0:
            raise ValueError("Requested hold tank is not clean and available")
    elif resource_type == "packaging_line":
        if requested_resource not in {"PKG-01", "PKG-02"}:
            raise ValueError("Requested packaging line does not exist")
    elif resource_type == "sucrose_source_tank":
        ensure_bulk_tanks(db)
        if requested_resource not in {"SUC-101", "TANK-X"}:
            raise ValueError("Requested Sucrose source must be SUC-101 or TANK-X")
        tank=db.scalar(select(BulkTank).where(BulkTank.tank_code==requested_resource))
        if not tank or tank.material_name!="Sucrose" or tank.qa_status!="Released":
            raise ValueError("Requested Sucrose source tank is not QA Released")
    elif resource_type in {"production_quantity", "finished_goods_quantity"}:
        try:
            quantity = int(requested_resource)
        except (TypeError, ValueError) as exc:
            raise ValueError("Requested quantity must be a whole number") from exc
        if quantity <= 0:
            raise ValueError("Requested quantity must be greater than zero")
    else:
        raise ValueError("Unsupported resource type")


def create_route_change_request(db: Session, payload):
    po = db.scalar(select(ProductionOrder).where(ProductionOrder.po_number == payload.po_number))
    if not po:
        raise ValueError("Production order not found")
    actual_current = _resource_value(po, payload.resource_type)
    if payload.current_resource != actual_current:
        raise ValueError(f"Current scheduled resource is {actual_current}")
    if payload.requested_resource == actual_current:
        raise ValueError("Requested resource is already scheduled")
    _validate_requested_resource(db, payload.resource_type, payload.requested_resource)
    duplicate = db.scalar(
        select(RouteChangeRequest).where(
            RouteChangeRequest.po_number == payload.po_number,
            RouteChangeRequest.resource_type == payload.resource_type,
            RouteChangeRequest.status == "Pending",
        )
    )
    if duplicate:
        raise ValueError("A pending request already exists for this resource")
    item = RouteChangeRequest(
        request_id=f"RCR-{uuid4().hex[:8].upper()}",
        po_number=payload.po_number,
        resource_type=payload.resource_type,
        current_resource=actual_current,
        requested_resource=payload.requested_resource,
        reason=payload.reason,
        requester=payload.requester,
        status="Pending",
    )
    db.add(item)
    create_notification(
        db,
        recipient="Office",
        title=f"{payload.resource_type.replace('_', ' ').title()} change requested",
        message=f"{payload.po_number}: {actual_current} → {payload.requested_resource} requested by {payload.requester}.",
        severity="warning",
    )
    record_event(
        db,
        event_type="RouteChangeRequested",
        source=payload.requester,
        entity_type="ProductionOrder",
        entity_id=payload.po_number,
        message=f"Requested {payload.resource_type}: {actual_current} → {payload.requested_resource}.",
        severity="warning",
    )
    db.commit()
    db.refresh(item)
    return item

def list_route_changes(db: Session):
    return list(db.scalars(select(RouteChangeRequest).order_by(RouteChangeRequest.id.desc())).all())


def decide_route_change(db: Session, request_id: str, approved: bool):
    item = db.scalar(select(RouteChangeRequest).where(RouteChangeRequest.request_id == request_id))
    if not item:
        raise ValueError("Route-change request not found")
    if item.status != "Pending":
        raise ValueError("Route-change request has already been decided")
    po = db.scalar(select(ProductionOrder).where(ProductionOrder.po_number == item.po_number))
    if not po:
        raise ValueError("Production order not found")
    if approved:
        _validate_requested_resource(db, item.resource_type, item.requested_resource)
        attr = {
            "mix_tank": "mix_tank",
            "hold_tank": "hold_tank",
            "weigh_room": "weigh_room",
            "packaging_line": "packaging_line",
            "production_quantity": "quantity",
            "finished_goods_quantity": "quantity",
            "sucrose_source_tank": None,
        }.get(item.resource_type)
        if not attr:
            raise ValueError("Unsupported resource type")
        if item.resource_type == "production_quantity":
            revised_quantity = int(item.requested_resource)
            po.quantity = revised_quantity
            transfer = db.scalar(
                select(WarehouseTransferOrder).where(
                    WarehouseTransferOrder.po_number == item.po_number,
                    WarehouseTransferOrder.to_number == f"TO-{item.po_number}",
                )
            )
            if transfer:
                transfer.status = "Accepted" if transfer.owner != "Warehouse Queue" else "Pending"
                transfer.blocker = None
                transfer.progress = 0
        elif item.resource_type == "finished_goods_quantity":
            # Late-stage FG reconciliation acknowledges the exact good-unit count
            # without rewriting the original production-order target.
            transfer = db.scalar(
                select(WarehouseTransferOrder).where(
                    WarehouseTransferOrder.po_number == item.po_number,
                    WarehouseTransferOrder.to_number == f"TO-FG-{item.po_number}",
                )
            )
            if transfer and transfer.status == "Blocked":
                transfer.status = "Accepted"
                transfer.blocker = None
                transfer.progress = 0
        elif item.resource_type == "sucrose_source_tank":
            # Virtual routing approval. The approved request is read by Mixing
            # when the Sucrose charge is executed; the PO recipe itself is unchanged.
            pass
        else:
            setattr(po, attr, item.requested_resource)
        if item.resource_type == "weigh_room":
            # The warehouse destination remains the neutral Chem Weigh Staging
            # handoff point. Approval changes only the PO's scheduled white-zone
            # room; the weighing operator performs the physical bend-in later.
            transfer = db.scalar(
                select(WarehouseTransferOrder).where(WarehouseTransferOrder.po_number == item.po_number)
            )
            if transfer and transfer.status not in {"Bent Into Room", "Completed"}:
                transfer.destination = "Chem Weigh Staging"
        item.status = "Approved"
    else:
        item.status = "Denied"
    create_notification(
        db,
        recipient=item.requester,
        title=f"Route change {item.status.lower()}",
        message=f"{item.request_id} was {item.status.lower()} by Office.",
        severity="info" if approved else "warning",
    )
    record_event(
        db,
        event_type=f"RouteChange{item.status}",
        source="Office",
        entity_type="ProductionOrder",
        entity_id=item.po_number,
        message=f"{item.resource_type}: {item.current_resource} → {item.requested_resource} {item.status.lower()}.",
        severity="info" if approved else "warning",
    )
    db.commit()
    db.refresh(item)
    return item


PACKAGING_FAULT_PROFILES = [
    (20, "JAM-CONV-01", "Conveyor Jam", "Conveyor accumulation jam at capper discharge", "Photoeye blocked by bottle accumulation", "Clear accumulation and verify conveyor spacing", 6.0),
    (50, "CAP-TORQUE-02", "Capper Fault", "Cap torque outside validated range", "Capper clutch drift", "Adjust clutch and verify torque challenge", 8.0),
    (75, "LBL-SENSOR-03", "Labeler Fault", "Label registration sensor lost product mark", "Label web tracking misalignment", "Re-thread label web and calibrate registration sensor", 5.0),
]

def list_packaging_downtime(db: Session):
    return list(db.scalars(select(PackagingDowntimeEvent).order_by(PackagingDowntimeEvent.id.desc())).all())

def list_maintenance_work_orders(db: Session):
    return list(db.scalars(select(MaintenanceWorkOrder).order_by(MaintenanceWorkOrder.id.desc())).all())

def packaging_reliability_kpis(db: Session):
    events=list_packaging_downtime(db)
    total_faults=len(events); total_downtime=round(sum(e.duration_minutes for e in events),1)
    closed=[e for e in events if e.status=="Closed"]
    mttr=round(sum(e.duration_minutes for e in closed)/len(closed),1) if closed else 0.0
    runs=list(db.scalars(select(PackagingRun)).all())
    runtime=max(1.0,sum(max(r.progress,1)*0.6 for r in runs))
    mtbf=round(runtime/total_faults,1) if total_faults else runtime
    availability=round(100*runtime/(runtime+total_downtime),1)
    counts={}
    for e in events:
        counts[e.category]=counts.get(e.category,0)+e.duration_minutes
    pareto=[{"category":k,"minutes":round(v,1),"percent":round(100*v/total_downtime,1) if total_downtime else 0} for k,v in sorted(counts.items(),key=lambda x:x[1],reverse=True)]
    return {"total_faults":total_faults,"total_downtime_minutes":total_downtime,"mtbf_minutes":mtbf,"mttr_minutes":mttr,"availability_percent":availability,"pareto":pareto}

def maintenance_work_order_action(db: Session, work_order_id: str, action: str, technician: str, resolution: str=""):
    wo=db.scalar(select(MaintenanceWorkOrder).where(MaintenanceWorkOrder.work_order_id==work_order_id))
    if not wo: raise ValueError("Maintenance work order not found")
    normalized=action.strip().lower()
    if normalized=="accept": wo.status="In Progress"; wo.assigned_to=technician
    elif normalized=="complete":
        if len(resolution.strip())<3: raise ValueError("Resolution is required")
        wo.status="Complete"; wo.assigned_to=technician; wo.resolution=resolution.strip(); wo.completed_at=utc_now()
    else: raise ValueError("Unsupported work-order action")
    record_event(db,event_type="MaintenanceWorkOrderUpdated",source="Maintenance",entity_type="MaintenanceWorkOrder",entity_id=wo.work_order_id,message=f"{wo.work_order_id} moved to {wo.status} by {technician}.",severity="info")
    db.commit(); db.refresh(wo); return wo

def ensure_packaging_lines(db: Session):
    if db.scalar(select(PackagingLine.id).limit(1)):
        return
    db.add_all([
        PackagingLine(line_code="PKG-01", name="Bottle Line 1", status="Available", cip_status="Clean / Available", plc_code="PKG_PLC_01", rated_speed_bpm=120),
        PackagingLine(line_code="PKG-02", name="Bottle Line 2", status="Available", cip_status="Clean / Available", plc_code="PKG_PLC_02", rated_speed_bpm=90),
    ])
    db.commit()

def list_packaging_lines(db: Session):
    ensure_packaging_lines(db)
    return list(db.scalars(select(PackagingLine).order_by(PackagingLine.line_code)).all())

def list_packaging_queue(db: Session):
    return list(db.scalars(select(ProductionOrder).where(ProductionOrder.status=="Bulk Released for Packaging").order_by(ProductionOrder.id)).all())

def list_packaging_runs(db: Session):
    ensure_packaging_lines(db)
    return list(db.scalars(select(PackagingRun).order_by(PackagingRun.id.desc())).all())

def create_packaging_run(db: Session, payload):
    ensure_packaging_lines(db)
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==payload.po_number))
    if not po:
        raise ValueError("Production order not found")

    # Packaging re-entry is idempotent. Once the PO owns a PackagingRun, the
    # persisted run/line state is authoritative even though the PO is no longer
    # in the QA-released packaging queue.
    existing=db.scalar(select(PackagingRun).where(PackagingRun.po_number==po.po_number))
    if existing:
        return existing

    if po.status!="Bulk Released for Packaging":
        raise ValueError("Bulk must be released by QA before packaging")
    if payload.line_code!=po.packaging_line:
        raise ValueError(f"PO is scheduled for {po.packaging_line}; request Office approval before using another line")

    line=db.scalar(select(PackagingLine).where(PackagingLine.line_code==payload.line_code))
    if not line:
        raise ValueError("Packaging line not found")
    if line.active_po and line.active_po != po.po_number:
        raise ValueError(f"{line.line_code} is already assigned to {line.active_po}")
    if (line.status or "").lower()!="available" or (line.cip_status or "").lower()!="clean / available":
        raise ValueError("Packaging line is not clean and available")
    hold=db.scalar(select(HoldTank).where(HoldTank.tank_code==po.hold_tank))
    if not hold or hold.qa_status!="Released": raise ValueError("Released bulk is not available in the scheduled hold tank")
    run=PackagingRun(run_id=f"PKR-{uuid4().hex[:8].upper()}",po_number=po.po_number,batch_number=po.batch_number,line_code=line.line_code,hold_tank=hold.tank_code,operator=payload.operator,status="Ready")
    line.status="Reserved"; line.active_po=po.po_number; po.status="Packaging Ready"
    db.add(run); record_event(db,event_type="PackagingRunOpened",source="Packaging",entity_type="PackagingRun",entity_id=run.run_id,message=f"{po.po_number} opened on {line.line_code}.",severity="info")
    db.commit(); db.refresh(run); return run

def get_packaging_run(db: Session, run_id: str):
    run=db.scalar(select(PackagingRun).where(PackagingRun.run_id==run_id))
    if not run: raise ValueError("Packaging run not found")
    return run

def packaging_workspace(db: Session, run_id: str):
    run=get_packaging_run(db,run_id); line=db.scalar(select(PackagingLine).where(PackagingLine.line_code==run.line_code))
    actions=[]
    if run.status=="Ready": actions=["start"]
    elif run.status=="Running": actions=["tick"]
    elif run.status=="Faulted": actions=["diagnose","reset"]
    elif run.status=="Awaiting FG Sample": actions=["collect-sample"]
    return {"run":run,"line":line,"available_actions":actions,"components":list_packaging_components(db)}

def packaging_action(db: Session, run_id: str, action: str, operator: str):
    run=get_packaging_run(db,run_id); line=db.scalar(select(PackagingLine).where(PackagingLine.line_code==run.line_code)); po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==run.po_number))
    if action=="start":
        if run.status!="Ready": raise ValueError("Packaging run is not ready")
        run.status="Running"; run.speed_bpm=min(line.rated_speed_bpm,120); line.status="Running"; po.status="Packaging"
    elif action=="tick":
        if run.status!="Running": raise ValueError("Packaging line is not running")
        profile = PACKAGING_FAULT_PROFILES[run.fault_sequence_index] if run.fault_sequence_index < len(PACKAGING_FAULT_PROFILES) else None
        if profile and run.progress >= profile[0] and random() < 0.95:
            _, code, category, message, root_cause, corrective_action, demo_minutes = profile
            run.status="Faulted"; run.jam_code=code; run.fault_message=message; run.speed_bpm=0; line.status="Faulted"
            run.fault_sequence_index += 1; run.fault_count += 1
            event=PackagingDowntimeEvent(event_id=f"DTE-{uuid4().hex[:8].upper()}",run_id=run.run_id,line_code=run.line_code,fault_code=code,category=category,message=message,status="Open",root_cause=root_cause,corrective_action=corrective_action)
            wo=MaintenanceWorkOrder(work_order_id=f"WO-{uuid4().hex[:8].upper()}",asset_code=run.line_code,source_event_id=event.event_id,priority="High",status="Open",problem_description=f"{code}: {message}")
            db.add_all([event,wo])
            create_notification(db,recipient="Maintenance",title=f"Packaging {category}",message=f"{run.line_code} fault {code} on {run.po_number}; {wo.work_order_id} opened.",severity="warning")
            record_event(db,event_type="PackagingDowntimeStarted",source="Packaging",entity_type="PackagingRun",entity_id=run.run_id,message=f"{code} stopped {run.line_code}; maintenance work order {wo.work_order_id} created.",severity="warning")
        else:
            hold=db.scalar(select(HoldTank).where(HoldTank.tank_code==run.hold_tank))
            if not hold:
                raise ValueError("Packaging source hold tank is unavailable")

            hold_mass=float(hold.transferred_quantity or 0)
            if hold_mass<=HOLD_TANK_LOW_LOW_KG:
                hold.transferred_quantity=HOLD_TANK_LOW_LOW_KG
                run.progress=100
            else:
                # Packaging consumes bulk from the released hold tank. Outlet
                # flow pulses down near LL rather than draining the vessel dry.
                target_total=max(0.0,hold_mass-HOLD_TANK_LOW_LOW_KG)
                nominal=max(1.0,target_total*0.20)
                discharged=_pulsed_outflow_step(
                    hold_mass,
                    HOLD_TANK_LOW_LOW_KG,
                    nominal,
                    HOLD_TANK_PULSE_ZONE_KG,
                )
                hold.transferred_quantity=round(hold_mass-discharged,3)

                initial_event=db.scalar(
                    select(PlatformEvent)
                    .where(
                        PlatformEvent.entity_type=="PackagingRun",
                        PlatformEvent.entity_id==run.run_id,
                        PlatformEvent.event_type=="PackagingBulkStart",
                    )
                    .order_by(PlatformEvent.id.desc())
                )
                if not initial_event:
                    record_event(
                        db,event_type="PackagingBulkStart",source="Packaging",
                        entity_type="PackagingRun",entity_id=run.run_id,
                        message=f"INITIAL_HOLD_KG={hold_mass:.6f}|LOW_LOW_KG={HOLD_TANK_LOW_LOW_KG:.6f}",
                        severity="info",
                    )
                    initial_hold=hold_mass
                else:
                    initial_hold=hold_mass
                    for part in (initial_event.message or "").split("|"):
                        if part.startswith("INITIAL_HOLD_KG="):
                            initial_hold=float(part.split("=",1)[1])

                usable=max(1.0,initial_hold-HOLD_TANK_LOW_LOW_KG)
                removed=max(0.0,initial_hold-float(hold.transferred_quantity or 0))
                run.progress=min(100,int(round((removed/usable)*100)))

            run.bottles_completed=round(po.quantity*run.progress/100)
            run.rejects=max(run.rejects,round(run.bottles_completed*0.004))
            run.cases_staged=max(0,(run.bottles_completed-run.rejects)//24)

            if float(hold.transferred_quantity or 0)<=HOLD_TANK_LOW_LOW_KG+0.001:
                hold.transferred_quantity=HOLD_TANK_LOW_LOW_KG
                run.progress=100
                run.status="Awaiting FG Sample"
                run.speed_bpm=0
                line.status="Product Hold"
                po.status="FG Sample Required"

                # Retain the 80 kg product heel until CIP. Do not zero the tank.
                hold.level_percent=max(0.1,hold.level_percent)
                hold.status="Low-Low / Dirty"
                hold.cip_status="Dirty / CIP Required"
                hold.qa_status="Consumed to Low-Low / CIP Required"

                if not _tank_alarm_event_exists(db,"HoldTank",hold.tank_code,"HoldTankLowLowReached"):
                    record_event(
                        db,event_type="HoldTankLowLowReached",source="Hold Tank PLC",
                        entity_type="HoldTank",entity_id=hold.tank_code,
                        message=(
                            f"{hold.tank_code} reached low-low {HOLD_TANK_LOW_LOW_KG:.0f} kg; "
                            f"outlet pulsed to stop and product heel retained until CIP."
                        ),severity="info",
                    )
    elif action=="diagnose":
        if run.status!="Faulted": raise ValueError("No packaging fault is active")
        run.fault_diagnosed=True
        event=db.scalar(select(PackagingDowntimeEvent).where(PackagingDowntimeEvent.run_id==run.run_id,PackagingDowntimeEvent.status=="Open").order_by(PackagingDowntimeEvent.id.desc()))
        if event: record_event(db,event_type="PackagingFaultDiagnosed",source="Packaging",entity_type="PackagingDowntimeEvent",entity_id=event.event_id,message=event.root_cause or "Fault diagnosed",severity="warning")
    elif action=="reset":
        if run.status!="Faulted" or not run.fault_diagnosed: raise ValueError("Diagnose the packaging fault before reset")
        event=db.scalar(select(PackagingDowntimeEvent).where(PackagingDowntimeEvent.run_id==run.run_id,PackagingDowntimeEvent.status=="Open").order_by(PackagingDowntimeEvent.id.desc()))
        if event:
            profile=next((x for x in PACKAGING_FAULT_PROFILES if x[1]==event.fault_code),None); event.status="Closed"; event.ended_at=utc_now(); event.duration_minutes=profile[6] if profile else 5.0; run.downtime_minutes=round(run.downtime_minutes+event.duration_minutes,1)
            wo=db.scalar(select(MaintenanceWorkOrder).where(MaintenanceWorkOrder.source_event_id==event.event_id))
            if wo and wo.status!="Complete": wo.status="Complete"; wo.resolution=event.corrective_action; wo.completed_at=utc_now()
            record_event(db,event_type="PackagingDowntimeClosed",source="Maintenance",entity_type="PackagingDowntimeEvent",entity_id=event.event_id,message=f"{event.fault_code} cleared after {event.duration_minutes} demo minutes.",severity="info")
        run.status="Running"; run.jam_code=None; run.fault_message=None; run.fault_diagnosed=False; run.speed_bpm=min(line.rated_speed_bpm,120); line.status="Running"
    elif action=="collect-sample":
        if run.status!="Awaiting FG Sample": raise ValueError("Complete packaging before collecting the FG sample")
        sample=f"FG-{po.batch_number}-{run.line_code}"; run.fg_sample_id=sample; run.status="FG QA Hold"; line.status="Product Hold"; po.status="FG QA Hold"
        task=QAFinishedGoodsTask(task_id=f"QAFG-{uuid4().hex[:8].upper()}",po_number=po.po_number,batch_number=po.batch_number,product_name=po.product_name,packaging_line=run.line_code,sample_id=sample,quantity=max(0,run.bottles_completed-run.rejects),status="Pending Review")
        db.add(task); create_notification(db,recipient="Quality",title="FG disposition required",message=f"{po.po_number} sample {sample} is ready for review.",severity="warning")
    else: raise ValueError("Unknown packaging action")
    record_event(db,event_type=f"Packaging{action.title().replace('-','')}",source="Packaging",entity_type="PackagingRun",entity_id=run.run_id,message=f"{operator} completed {action} for {run.run_id}.",severity="warning" if run.status=="Faulted" else "info")
    mes_log(db,po_number=run.po_number,event_type=f"PACKAGING_{action.upper().replace('-','_')}",phase="Packaging",equipment_id=run.line_code,operator_id=operator,metric="bottles_completed",value=float(run.bottles_completed),unit="ea",message=f"Status {run.status}; rejects {run.rejects}",severity="warning" if run.status=="Faulted" else "info",qualified=run.status!="Faulted")
    db.commit(); db.refresh(run); return run

def list_qa_fg_tasks(db: Session):
    return list(db.scalars(select(QAFinishedGoodsTask).order_by(QAFinishedGoodsTask.id.desc())).all())

def decide_qa_fg_task(db: Session, task_id: str, disposition: str, note: str):
    task=db.scalar(select(QAFinishedGoodsTask).where(QAFinishedGoodsTask.task_id==task_id))
    if not task: raise ValueError("FG QA task not found")
    if task.status!="Pending Review": raise ValueError("FG QA task has already been decided")
    normalized=disposition.strip().title()
    if normalized not in {"Release","Hold","Reject"}: raise ValueError("Disposition must be Release, Hold, or Reject")
    task.disposition=normalized; task.disposition_note=note; task.decided_at=utc_now(); task.status={"Release":"Released","Hold":"On Hold","Reject":"Rejected"}[normalized]
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==task.po_number)); run=db.scalar(select(PackagingRun).where(PackagingRun.po_number==task.po_number)); line=db.scalar(select(PackagingLine).where(PackagingLine.line_code==task.packaging_line))
    if normalized=="Release":
        po.status="FG Released"; run.status="Complete"; line.status="Dirty / CIP Required"; line.cip_status="Dirty / CIP Required"; line.active_po=None
        outbound=WarehouseTransferOrder(to_number=f"TO-FG-{po.po_number}",po_number=po.po_number,priority="High",destination="Shipping Dock",status="Pending",owner="Outbound Warehouse")
        db.add(outbound); create_notification(db,recipient="Warehouse",title="Outbound FG transfer order",message=f"{outbound.to_number} created for released finished goods.",severity="info")
    elif normalized=="Hold": po.status="FG QA Hold"
    else: po.status="FG Rejected"
    record_event(db,event_type=f"FG{normalized}",source="Quality",entity_type="QAFinishedGoodsTask",entity_id=task.task_id,message=note or normalized,severity="info" if normalized=="Release" else "warning")
    db.commit(); db.refresh(task); return task


def _cip_asset(db: Session, asset_type: str, asset_code: str):
    kind=asset_type.strip().lower()
    if kind=="mix_tank": return db.scalar(select(MixRoom).where(MixRoom.tank_code==asset_code))
    if kind=="hold_tank": return db.scalar(select(HoldTank).where(HoldTank.tank_code==asset_code))
    if kind=="packaging_line": return db.scalar(select(PackagingLine).where(PackagingLine.line_code==asset_code))
    raise ValueError("Unsupported CIP asset type")

def list_cip_runs(db: Session):
    return list(db.scalars(select(CIPRun).order_by(CIPRun.id.desc())).all())

def start_cip_run(db: Session, payload):
    asset=_cip_asset(db,payload.asset_type,payload.asset_code)
    if not asset: raise ValueError("CIP asset not found")
    if "Dirty" not in asset.cip_status and asset.status not in {"Dirty / CIP Required","Dirty"}:
        raise ValueError("Equipment is not dirty")
    active=db.scalar(select(CIPRun).where(CIPRun.asset_code==payload.asset_code,CIPRun.status.in_(["Ready","Running","Faulted","Awaiting Verification"])))
    if active: return active
    run=CIPRun(cip_id=f"CIP-{payload.asset_code}-{uuid4().hex[:6].upper()}",asset_type=payload.asset_type,asset_code=payload.asset_code,operator=payload.operator,status="Running",phase="Drain",progress=0,cleaning_type=payload.cleaning_type)
    asset.status="CIP Running"; asset.cip_status="CIP Running"
    db.add(run); record_event(db,event_type="CIPStarted",source="Maintenance",entity_type=payload.asset_type,entity_id=payload.asset_code,message=f"{run.cip_id} started by {payload.operator}.",severity="info")
    db.commit(); db.refresh(run); return run

def cip_action(db: Session, cip_id: str, action: str, signature: str=""):
    run=db.scalar(select(CIPRun).where(CIPRun.cip_id==cip_id))
    if not run: raise ValueError("CIP run not found")
    asset=_cip_asset(db,run.asset_type,run.asset_code)
    if action=="tick":
        if run.status!="Running": raise ValueError("CIP is not running")
        if random()<0.10 and 15<=run.progress<85:
            run.status="Faulted"; run.fault_code="CIP-FLOW-LOW"; run.fault_message="CIP return flow fell below validated minimum"; asset.status="CIP Faulted"
        else:
            run.progress=min(100,run.progress+20)
            run.phase=("Drain" if run.progress<20 else "Wash" if run.progress<55 else "Rinse" if run.progress<85 else "Final Verification")
            if run.progress>=100: run.status="Awaiting Verification"; asset.status="CIP Verification"
    elif action=="diagnose":
        if run.status!="Faulted": raise ValueError("No CIP fault is active")
        run.fault_diagnosed=True
    elif action=="reset":
        if run.status!="Faulted" or not run.fault_diagnosed: raise ValueError("Diagnose the CIP fault before reset")
        run.status="Running"; run.fault_code=None; run.fault_message=None; run.fault_diagnosed=False; asset.status="CIP Running"
    elif action=="verify":
        if run.status!="Awaiting Verification": raise ValueError("CIP must reach final verification")
        if len(signature.strip())<3: raise ValueError("Electronic signature is required")
        run.signature=signature.strip(); run.status="Complete"; run.phase="Complete"; run.completed_at=utc_now()
        asset.status="Available"; asset.cip_status="Clean / Available"
        if hasattr(asset,"active_po"): asset.active_po=None
        if isinstance(asset,HoldTank):
            asset.level_percent=0; asset.qa_status="Not Applicable"; asset.batch_number=None; asset.product_name=None; asset.transferred_quantity=0; asset.source_mix_tank=None; asset.transfer_completed_at=None; asset.lims_sample_id=None
        record_event(db,event_type="CIPCompleted",source="Maintenance",entity_type=run.asset_type,entity_id=run.asset_code,message=f"{run.cip_id} verified by {run.signature}.",severity="info")
    else: raise ValueError("Unknown CIP action")
    po_number=getattr(asset,"active_po",None) or "CIP-STANDALONE"
    mes_log(db,po_number=po_number,event_type=f"CIP_{action.upper()}",phase=run.phase,equipment_id=run.asset_code,operator_id=run.operator,metric="progress",value=float(run.progress),unit="percent",message=run.fault_message or f"CIP status {run.status}",severity="warning" if run.status=="Faulted" else "info",qualified=run.status!="Faulted")
    db.commit(); db.refresh(run); return run

def list_shipments(db: Session):
    return list(db.scalars(select(Shipment).order_by(Shipment.id.desc())).all())

def shipment_ready_pos(db: Session):
    staged=list(db.scalars(select(WarehouseTransferOrder).where(WarehouseTransferOrder.to_number.like("TO-FG-%"),WarehouseTransferOrder.status=="Delivered")).all())
    numbers={x.po_number for x in staged}
    scheduled={x.po_number for x in db.scalars(select(Shipment)).all()}
    return list(db.scalars(select(ProductionOrder).where(ProductionOrder.po_number.in_(numbers-scheduled))).all()) if numbers-scheduled else []

def create_shipment(db: Session, payload):
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==payload.po_number))
    if not po: raise ValueError("Production order not found")
    to=db.scalar(select(WarehouseTransferOrder).where(WarehouseTransferOrder.to_number==f"TO-FG-{po.po_number}"))
    if not to or to.status!="Delivered": raise ValueError("Finished goods must be staged at the shipping dock")
    existing=db.scalar(select(Shipment).where(Shipment.po_number==po.po_number))
    if existing: return existing
    item=Shipment(shipment_id=f"SHP-{po.po_number}",po_number=po.po_number,carrier=payload.carrier,dock=payload.dock,pickup_date=payload.pickup_date,pickup_time=payload.pickup_time,status="Scheduled")
    po.status="Shipment Scheduled"; db.add(item)
    create_notification(db,recipient="Warehouse",title="Carrier pickup scheduled",message=f"{item.shipment_id}: {item.carrier} at {item.dock} on {item.pickup_date} {item.pickup_time}.",severity="info")
    record_event(db,event_type="ShipmentScheduled",source="Office",entity_type="Shipment",entity_id=item.shipment_id,message=f"{item.carrier} assigned to {item.dock}.",severity="info")
    db.commit(); db.refresh(item); return item

def shipment_action(db: Session, shipment_id: str, action: str, operator: str, seal_number: str="", signature: str=""):
    item=db.scalar(select(Shipment).where(Shipment.shipment_id==shipment_id))
    if not item: raise ValueError("Shipment not found")
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==item.po_number))
    if action=="verify":
        if item.status in {"Verified","Loading","Loaded","Sealed","Shipped"}: return item
        item.status="Verified"
    elif action=="load":
        if item.status in {"Loaded","Sealed","Shipped"}: return item
        if item.status not in {"Verified","Loading"}: raise ValueError("Verify shipment before loading")
        item.status="Loaded"; item.pallets_loaded=4
        record_event(db,event_type="ShipmentAutoLoaded",source="Warehouse",entity_type="Shipment",entity_id=item.shipment_id,message=f"{operator} completed automatic loading of 4 pallets for {item.po_number}.",severity="info")
    elif action=="seal":
        if item.status in {"Sealed","Shipped"}: return item
        if item.status!="Loaded": raise ValueError("Load all pallets before sealing")
        if not seal_number.strip(): raise ValueError("Trailer seal number is required")
        item.trailer_seal=seal_number.strip(); item.status="Sealed"
    elif action=="ship":
        if item.status=="Shipped": return item
        if item.status!="Sealed": raise ValueError("Seal trailer before shipment completion")
        if len(signature.strip())<3: raise ValueError("Electronic signature is required")
        item.signature=signature.strip(); item.bol_number=f"BOL-{item.po_number}"; item.status="Shipped"; item.shipped_at=utc_now(); po.status="Shipped / Closed"
        record_event(db,event_type="ShipmentCompleted",source="Warehouse",entity_type="Shipment",entity_id=item.shipment_id,message=f"{operator} shipped {item.po_number}; BOL {item.bol_number}.",severity="info")
        create_notification(db,recipient="Office",title="Shipment completed",message=f"{item.po_number} shipped via {item.carrier}; {item.bol_number}.",severity="info")
    else: raise ValueError("Unknown shipment action")
    mes_log(db,po_number=item.po_number,event_type=f"SHIPPING_{action.upper()}",phase="Shipping",equipment_id=item.dock,operator_id=operator,metric="pallets_loaded",value=float(item.pallets_loaded),unit="pallets",message=f"Shipment {item.shipment_id} status {item.status}")
    db.commit(); db.refresh(item); return item


def _po_events(db: Session, po_number: str):
    rows=list(db.scalars(select(PlatformEvent).order_by(PlatformEvent.id)).all())
    return [e for e in rows if e.entity_id==po_number or po_number in e.message]

def _batch_exceptions(db: Session, po_number: str):
    items=[]
    for r in db.scalars(select(SubstitutionRequest).where(SubstitutionRequest.po_number==po_number)).all():
        items.append({"category":"Material Substitution","source":r.request_id,"description":f"{r.material_code}: {r.current_lot or 'scheduled lot'} to {r.proposed_lot}","severity":"warning","status":r.status,"timestamp":r.created_at})
    for r in db.scalars(select(RouteChangeRequest).where(RouteChangeRequest.po_number==po_number)).all():
        items.append({"category":"Route Change","source":r.request_id,"description":f"{r.resource_type}: {r.current_resource} to {r.requested_resource}","severity":"warning","status":r.status,"timestamp":r.created_at})
    runs=list(db.scalars(select(PackagingRun).where(PackagingRun.po_number==po_number)).all())
    for run in runs:
        for d in db.scalars(select(PackagingDowntimeEvent).where(PackagingDowntimeEvent.run_id==run.run_id)).all():
            items.append({"category":"Packaging Downtime","source":d.event_id,"description":d.message,"severity":"error","status":d.status,"timestamp":d.started_at})
    for q in db.scalars(select(QABulkTask).where(QABulkTask.po_number==po_number)).all():
        if q.disposition in {"Hold","Reject"}: items.append({"category":"Bulk QA Exception","source":q.task_id,"description":q.disposition_note or q.disposition,"severity":"error","status":q.status,"timestamp":q.decided_at or q.created_at})
    for q in db.scalars(select(QAFinishedGoodsTask).where(QAFinishedGoodsTask.po_number==po_number)).all():
        if q.disposition in {"Hold","Reject"}: items.append({"category":"FG QA Exception","source":q.task_id,"description":q.disposition_note or q.disposition,"severity":"error","status":q.status,"timestamp":q.decided_at or q.created_at})
    for e in _po_events(db,po_number):
        if e.severity in {"error","critical"} and not any(x["source"]==str(e.id) for x in items):
            items.append({"category":"Process Exception","source":str(e.id),"description":e.message,"severity":e.severity,"status":"Recorded","timestamp":e.created_at})
    return items

def _review_for_po(db: Session, po_number: str, create=False):
    review=db.scalar(select(BatchReview).where(BatchReview.po_number==po_number))
    if not review and create:
        review=BatchReview(review_id=f"BR-{uuid4().hex[:8].upper()}",po_number=po_number,exception_count=len(_batch_exceptions(db,po_number)))
        db.add(review); db.commit(); db.refresh(review)
    return review

def ebr_batch_summaries(db: Session, search: str=""):
    rows=list(db.scalars(select(ProductionOrder).order_by(ProductionOrder.id.desc())).all())
    result=[]
    for po in rows:
        if search and search.lower() not in f"{po.po_number} {po.batch_number} {po.product_name} {po.weigh_room} {po.mix_tank} {po.hold_tank} {po.packaging_line}".lower(): continue
        run=db.scalar(select(PackagingRun).where(PackagingRun.po_number==po.po_number).order_by(PackagingRun.id.desc()))
        shipment=db.scalar(select(Shipment).where(Shipment.po_number==po.po_number).order_by(Shipment.id.desc()))
        review=_review_for_po(db,po.po_number)
        produced=max(0,run.bottles_completed-run.rejects) if run else 0
        yield_pct=round((produced/max(1,po.quantity))*100,2) if run else 0.0
        result.append({"po_number":po.po_number,"batch_number":po.batch_number,"product_name":po.product_name,"status":po.status,"quantity":po.quantity,"yield_percent":yield_pct,"rejects":run.rejects if run else 0,"downtime_minutes":run.downtime_minutes if run else 0.0,"exception_count":len(_batch_exceptions(db,po.po_number)),"review_status":review.status if review else "Not Started","shipment_status":shipment.status if shipment else "Not Scheduled","created_at":po.created_at})
    return result

def ebr_batch_detail(db: Session, po_number: str):
    summaries=ebr_batch_summaries(db,po_number)
    summary=next((x for x in summaries if x["po_number"]==po_number),None)
    if not summary: raise ValueError("Production order not found")
    audit=list(db.scalars(select(AuditTrailEntry).where(AuditTrailEntry.po_number==po_number).order_by(AuditTrailEntry.id)).all())
    return {"summary":summary,"timeline":_po_events(db,po_number),"exceptions":_batch_exceptions(db,po_number),"audit_trail":audit,"alcoa_plus":{"attributable":True,"legible":True,"contemporaneous":True,"original":True,"accurate":True,"complete":True,"consistent":True,"enduring":True,"available":True}}

def list_batch_reviews(db: Session):
    for po in db.scalars(select(ProductionOrder)).all(): _review_for_po(db,po.po_number,True)
    return list(db.scalars(select(BatchReview).order_by(BatchReview.id.desc())).all())

def decide_batch_review(db: Session, po_number: str, decision: str, reviewer: str, signature: str, note: str):
    if decision not in {"Approve","Return","Reject"}: raise ValueError("Decision must be Approve, Return, or Reject")
    if not signature.strip(): raise ValueError("Electronic signature is required")
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==po_number))
    if not po: raise ValueError("Production order not found")
    review=_review_for_po(db,po_number,True); before=review.status
    review.decision=decision; review.reviewer=reviewer; review.signature=signature; review.review_note=note; review.reviewed_at=utc_now(); review.status={"Approve":"Approved","Return":"Returned for Correction","Reject":"Rejected"}[decision]; review.exception_count=len(_batch_exceptions(db,po_number))
    audit=AuditTrailEntry(audit_id=f"AT-{uuid4().hex[:10].upper()}",po_number=po_number,entity_type="BatchReview",entity_id=review.review_id,action="Review Decision",field_name="status",before_value=before,after_value=review.status,reason=note or "QA review by exception",actor=reviewer,signature=signature)
    db.add(audit); record_event(db,event_type="BatchReviewDecision",source="QA Review",entity_type="ProductionOrder",entity_id=po_number,message=f"{po_number} review decision: {decision} by {reviewer}.",severity="info" if decision=="Approve" else "warning"); db.commit(); db.refresh(review); return review

def list_audit_trail(db: Session, po_number: str|None=None, search: str=""):
    q=select(AuditTrailEntry).order_by(AuditTrailEntry.id.desc())
    if po_number: q=q.where(AuditTrailEntry.po_number==po_number)
    rows=list(db.scalars(q).all())
    if search: rows=[x for x in rows if search.lower() in f"{x.po_number} {x.entity_type} {x.entity_id} {x.action} {x.actor} {x.reason}".lower()]
    return rows


def get_mes_batch_record(db: Session, po_number: str):
    return mes_batch_record(db,po_number)

def formulation_options(db: Session):
    """Read selectable formulation materials and released lots from shared Supply master data."""
    return formulation_options_from_supply(db)


def list_packaging_components(db: Session):
    return shared_packaging_components(db)

def list_rnd_sample_batches(db: Session):
    return list(db.scalars(select(RnDSampleBatch).order_by(RnDSampleBatch.id.desc())).all())

def rnd_catalog(db: Session):
    return shared_rnd_material_catalog(db)

def _next_rnd_test_po(db: Session) -> str:
    nums=[]
    for value in db.scalars(select(RnDSampleBatch.test_po_number)).all():
        if not value: continue
        try: nums.append(int(str(value).split("-")[-1]))
        except Exception: pass
    return f"RND-PO-{max(nums or [0])+1:05d}"

def create_rnd_sample_batch(db: Session, payload):
    materials=[m.model_dump() for m in payload.materials]
    bulks=[b.model_dump() for b in payload.bulks]
    process=payload.process.model_dump()
    if not materials:
        raise ValueError("Add at least one R&D formulation material")
    if not bulks:
        raise ValueError("Select at least one R&D bulk material/tank")

    catalog=shared_rnd_material_catalog(db)
    permitted={x["material_code"] for x in catalog["materials"]} | {x["material_code"] for x in catalog["candidates"]}
    invalid=[m["material_code"] for m in materials if m["material_code"] not in permitted]
    if invalid:
        raise ValueError(f"R&D material(s) are not registered: {', '.join(invalid)}")

    test_po=_next_rnd_test_po(db)
    formula_code=f"DEV-{utc_now().strftime('%y%m%d')}-{uuid4().hex[:5].upper()}"
    dye_names=[m["material_name"] for m in materials if m.get("role")=="dye"]
    item=RnDSampleBatch(
        sample_batch_id=f"RND-PRED-{utc_now().strftime('%y%m%d')}-{uuid4().hex[:4].upper()}",
        test_po_number=test_po,
        formula_code=formula_code,
        formula_name=payload.formula_name.strip() or formula_code,
        flavor=payload.flavor,
        dye=" + ".join(dye_names) if dye_names else payload.dye,
        scale_l=payload.scale_l,
        status="Draft",
        disposition="Draft",
        agitation_rpm=process.get("agitation_rpm",120),
        agitation_minutes=process.get("agitation_minutes",10),
        materials_json=json.dumps(materials),
        bulk_json=json.dumps(bulks),
        process_json=json.dumps(process),
    )
    db.add(item)
    record_event(
        db,event_type="RnDTestPOCreated",source="R&D",entity_type="RnDSampleBatch",
        entity_id=item.sample_batch_id,
        message=f"{test_po} · {item.formula_name} · {len(materials)} materials · {len(bulks)} bulk selections.",
        severity="info",
    )
    mes_log(
        db,po_number=test_po,event_type="RND_TEST_PO_CREATED",phase="R&D Development",
        operator_id="R&D Scientist",message=f"Development formula {formula_code} created",
    )
    db.commit(); db.refresh(item); return item

def _promote_rnd_formula(db: Session, item: RnDSampleBatch):
    materials=json.loads(item.materials_json or "[]")
    bulks=json.loads(item.bulk_json or "[]")
    all_rows=materials + [
        {
            "material_code":b["material_code"],
            "material_name":b["material_name"],
            "quantity":b["quantity_kg"],
            "unit":"kg",
            "role":"bulk",
            "source":f"bulk:{b['tank_code']}",
        }
        for b in bulks
    ]
    material_number=item.promoted_material_number or f"RND-{item.id:04d}"
    dyes=[m["material_name"] for m in materials if m.get("role")=="dye"]
    db.execute(text("""
        INSERT INTO mes.formulation_master(material_number,formula_name,product_name,flavor,dyes,status,approved_by,approved_at,updated_at)
        VALUES(:mn,:name,:product,:flavor,CAST(:dyes AS jsonb),'approved','R&D Development',now(),now())
        ON CONFLICT(material_number) DO UPDATE SET
          formula_name=EXCLUDED.formula_name, product_name=EXCLUDED.product_name,
          flavor=EXCLUDED.flavor, dyes=EXCLUDED.dyes, status='approved',
          approved_by='R&D Development', approved_at=now(), updated_at=now()
    """), {"mn":material_number,"name":item.formula_name or item.formula_code or material_number,
           "product":item.product_name,"flavor":item.flavor,"dyes":json.dumps(dyes)})
    db.execute(text("DELETE FROM mes.rnd_formula_materials WHERE material_number=:mn"), {"mn":material_number})
    for seq,row in enumerate(all_rows, start=1):
        db.execute(text("""
            INSERT INTO mes.rnd_formula_materials
              (material_number,sequence_no,material_code,material_name,quantity,unit,role,source)
            VALUES(:mn,:seq,:code,:name,:qty,:unit,:role,:source)
        """), {
            "mn":material_number,"seq":seq,"code":row["material_code"],"name":row["material_name"],
            "qty":float(row.get("quantity",0)),"unit":row.get("unit","kg"),
            "role":row.get("role","manual"),"source":row.get("source","R&D"),
        })
    item.promoted_material_number=material_number
    return material_number

def rnd_sample_action(db: Session, sample_batch_id: str, action: str, result: str=""):
    item=db.scalar(select(RnDSampleBatch).where(RnDSampleBatch.sample_batch_id==sample_batch_id))
    if not item: raise ValueError("R&D sample batch not found")
    allowed={
        "request-materials":("Warehouse Requested","R&D material request sent to Warehouse / R&D staging"),
        "receive-staging":("R&D Staging","Materials received at R&D staging"),
        "weigh":("R&D WR","Development materials weighed in R&D WR"),
        "mix":("R&D MR","Development batch executing in small R&D mix tank"),
        "pack":("R&D PL","Development sample packaged on small R&D pack line"),
        "start-test":("Test Run","Pilot test run started"),
        "complete-test":("Test Complete","Pilot test completed; development disposition required"),
        "approve":("Approved","R&D formulation approved for Office planning"),
        "more-testing":("Requires More Testing","R&D formulation requires another controlled trial"),
        "revise":("Requires More Testing","R&D formulation requires another controlled trial"),
        "reject":("Rejected","R&D formulation rejected"),
    }
    if action not in allowed: raise ValueError("Unsupported R&D action")
    status,message=allowed[action]
    item.status=status
    if action in {"request-materials","receive-staging","weigh","mix","pack"}:
        item.lab_stage=status
    if action=="approve":
        item.disposition="Approved"
        promoted=_promote_rnd_formula(db,item)
        message=f"{message}; promoted as {promoted}"
        # Candidate materials used in a successful test become qualified for this approved trial.
        for material in json.loads(item.materials_json or "[]"):
            db.execute(text("""
                UPDATE public.material_alternative_qualifications
                   SET approval_status='R&D Approved',
                       rnd_sample_id=:sample,
                       decision_note=:note,
                       updated_at=now()
                 WHERE candidate_code=:code
            """), {"sample":item.sample_batch_id,"note":result or "Approved in development trial","code":material["material_code"]})
    elif action in {"more-testing","revise"}:
        item.disposition="Requires More Testing"
        item.revision_no=(item.revision_no or 1)+1
    elif action=="reject":
        item.disposition="Rejected"
    if result.strip(): item.test_result=result.strip()
    record_event(
        db,event_type="RnDSampleBatchStatus",source="R&D",entity_type="RnDSampleBatch",
        entity_id=item.sample_batch_id,message=f"{message}. {result}".strip(),
        severity="info" if action in {'start-test','complete-test','approve'} else "warning",
    )
    mes_log(
        db,po_number=item.test_po_number or item.sample_batch_id,
        event_type=f"RND_{action.replace('-','_').upper()}",phase=item.lab_stage,
        operator_id="R&D Scientist",message=f"{message}. {result}".strip(),
        severity="info" if action in {'approve','complete-test'} else "warning",
        qualified=action!="reject",
    )
    db.commit(); db.refresh(item); return item


def ensure_bulk_tanks(db: Session):
    """Ensure the current Pharma bulk tank master exists.

    USP Purified Water is intentionally excluded because it is supplied by the
    automatic qualified water utility. Existing tank quantities are not
    overwritten here; Data Moon owns global baseline restoration.
    """
    tank_rows = [
        {
            "tank_code": "PG-101",
            "material_code": "PG",
            "material_name": "Propylene Glycol",
            "capacity_kg": 25000,
            "quantity_kg": 18000,
            "qa_status": "Released",
            "lot_number": "PG-26A0816-01",
            "temperature_c": 22,
            "status": "Available",
        },
        {
            "tank_code": "GLY-101",
            "material_code": "GLY",
            "material_name": "Glycerin",
            "capacity_kg": 25000,
            "quantity_kg": 18000,
            "qa_status": "Released",
            "lot_number": "GLY-26A0816-01",
            "temperature_c": 22,
            "status": "Available",
        },
        {
            "tank_code": "SUC-101",
            "material_code": "SUC",
            "material_name": "Sucrose",
            "capacity_kg": 20000,
            "quantity_kg": 12000,
            "qa_status": "Released",
            "lot_number": "SUC-26A0709-01",
            "temperature_c": 22,
            "status": "Available",
        },
        {
            "tank_code": "HFCS-101",
            "material_code": "HFCS",
            "material_name": "High Fructose Corn Syrup",
            "capacity_kg": 25000,
            "quantity_kg": 18000,
            "qa_status": "Released",
            "lot_number": "HFCS-26A0816-01",
            "temperature_c": 22,
            "status": "Available",
        },
        {
            "tank_code": "TANK-X",
            "material_code": "SUC",
            "material_name": "Sucrose",
            "capacity_kg": 25000,
            "quantity_kg": 18000,
            "qa_status": "Released",
            "lot_number": "SUC-X-26A0816-01",
            "temperature_c": 22,
            "status": "Available",
        },
    ]

    stmt = (
        pg_insert(BulkTank)
        .values(tank_rows)
        .on_conflict_do_nothing(index_elements=["tank_code"])
    )
    db.execute(stmt)

    # Remove the obsolete physical water tank if it is still present. The
    # automatic USP utility is the only valid production water source.
    db.execute(
        delete(BulkTank).where(
            BulkTank.tank_code.in_(["PW-101", "WATER-101", "USP-WATER-101"])
        )
    )
    db.commit()

def list_bulk_tanks(db): ensure_bulk_tanks(db); return list(db.scalars(select(BulkTank).order_by(BulkTank.tank_code)).all())
def list_bulk_deliveries(db): ensure_bulk_tanks(db); return list(db.scalars(select(BulkDelivery).order_by(BulkDelivery.id.desc())).all())
def schedule_bulk_delivery(db,payload):
    ensure_bulk_tanks(db)
    tank=db.scalar(select(BulkTank).where(BulkTank.tank_code==payload.tank_code))
    if not tank: raise ValueError("Selected bulk tank does not exist")
    if tank.material_code != payload.material_code or tank.material_name != payload.material_name:
      raise ValueError(f"{payload.tank_code} is assigned to {tank.material_name}; select the matching material")
    if payload.quantity_kg > tank.capacity_kg - tank.quantity_kg:
      raise ValueError(f"{payload.tank_code} does not have enough available capacity")
    active=db.scalar(select(BulkDelivery).where(BulkDelivery.tank_code==payload.tank_code, BulkDelivery.status.notin_(["Released","Rejected"])).limit(1))
    if active: raise ValueError(f"{payload.tank_code} already has an active tanker delivery")
    item=BulkDelivery(delivery_id=f"BD-{uuid4().hex[:8].upper()}",**payload.model_dump())
    db.add(item); record_event(db,event_type="BulkDeliveryScheduled",source="Office",entity_type="BulkDelivery",entity_id=item.delivery_id,message=f"{payload.quantity_kg:.0f} kg {payload.material_name} scheduled to {payload.tank_code}.",severity="info"); db.commit(); db.refresh(item); return item

def reset_bulk_tank(db,tank_code,operator,reason):
    ensure_bulk_tanks(db)
    tank=db.scalar(select(BulkTank).where(BulkTank.tank_code==tank_code))
    if not tank: raise ValueError("Bulk tank not found")
    active_delivery=db.scalar(select(BulkDelivery).where(BulkDelivery.tank_code==tank_code, BulkDelivery.status.notin_(["Released","Rejected"])).limit(1))
    if active_delivery: raise ValueError("Cannot reset a tank with an active tanker delivery")
    active_transfer=db.scalar(select(BulkTransfer).where(BulkTransfer.source_tank==tank_code, BulkTransfer.status.in_(["Awaiting Verification","Ready","Transferring"])).limit(1))
    if active_transfer: raise ValueError("Cannot reset a tank with an active production transfer")
    before=f"{tank.quantity_kg:.1f} kg / {tank.qa_status} / {tank.lot_number or 'No lot'}"
    tank.quantity_kg=0
    tank.qa_status="Empty"
    tank.lot_number=None
    tank.status="Available"
    record_event(db,event_type="BulkTankDemoReset",source="Bulk Tank Farm",entity_type="BulkTank",entity_id=tank.tank_code,message=f"{operator} reset {tank.tank_code} for retesting. Previous state: {before}. Reason: {reason}",severity="warning")
    db.commit(); db.refresh(tank); return tank
def inspect_bulk_delivery(db,delivery_id,payload):
    item=db.scalar(select(BulkDelivery).where(BulkDelivery.delivery_id==delivery_id))
    if not item: raise ValueError("Bulk delivery not found")
    if item.status != "Scheduled": raise ValueError("Only scheduled tanker deliveries can be inspected")
    if not all([payload.tanker_verified,payload.material_verified,payload.seal_intact,payload.coa_verified,payload.temperature_accepted]):
      raise ValueError("Complete every receiving verification before sampling")
    item.inspection_verified=True
    item.status="Ready for Pre-Unload Sample"
    record_event(db,event_type="BulkReceivingInspectionComplete",source="Warehouse",entity_type="BulkDelivery",entity_id=item.delivery_id,message=f"Receiving inspection completed for {item.material_name}; pre-unload sample required.",severity="info")
    db.commit(); db.refresh(item); return item

def bulk_delivery_action(db,delivery_id,action):
    item=db.scalar(select(BulkDelivery).where(BulkDelivery.delivery_id==delivery_id))
    if not item: raise ValueError("Bulk delivery not found")
    tank=db.scalar(select(BulkTank).where(BulkTank.tank_code==item.tank_code))
    if action=="sample":
      if item.status!="Ready for Pre-Unload Sample": raise ValueError("Complete receiving inspection before collecting the pre-unload sample")
      item.sample_id=f"BULK-SMP-{uuid4().hex[:6].upper()}"
      item.status="Pending QA Review"
      record_event(db,event_type="BulkPreUnloadSampleCollected",source="Warehouse",entity_type="BulkDelivery",entity_id=item.delivery_id,message=f"Pre-unload sample {item.sample_id} collected and sent to QA.",severity="info")
    elif action=="start":
      if item.status!="QA Released for Unloading": raise ValueError("QA release is required before unloading")
      item.status="Unloading"
      record_event(db,event_type="BulkUnloadStarted",source="Warehouse",entity_type="BulkDelivery",entity_id=item.delivery_id,message=f"Automatic unloading started from {item.delivery_id} to {item.tank_code}.",severity="info")
    elif action=="tick":
      if item.status!="Unloading": raise ValueError("Delivery is not unloading")
      item.unload_progress=min(100,item.unload_progress+20)
      if item.unload_progress>=100:
        item.status="Released"
        tank.quantity_kg=min(tank.capacity_kg,tank.quantity_kg+item.quantity_kg)
        tank.lot_number=item.lot_number
        tank.qa_status="Released"
        tank.status="Available"
        record_event(db,event_type="BulkUnloadComplete",source="Warehouse",entity_type="BulkTank",entity_id=tank.tank_code,message=f"{item.quantity_kg:.0f} kg QA-released {item.material_name} unloaded from {item.vendor}.",severity="info")
    else: raise ValueError("Unsupported bulk delivery action")
    db.commit(); db.refresh(item); return item

def decide_bulk_delivery(db,delivery_id,disposition):
    item=db.scalar(select(BulkDelivery).where(BulkDelivery.delivery_id==delivery_id))
    if not item or item.status!="Pending QA Review": raise ValueError("Bulk delivery is not pending QA review")
    tank=db.scalar(select(BulkTank).where(BulkTank.tank_code==item.tank_code))
    decision=disposition.strip().title()
    if decision not in {"Release","Hold","Reject"}: raise ValueError("Disposition must be Release, Hold, or Reject")
    item.qa_disposition=decision
    if decision=="Release":
      item.status="QA Released for Unloading"
      # The storage tank remains unchanged until Warehouse completes unloading.
      record_event(db,event_type="BulkQADisposition",source="Quality",entity_type="BulkDelivery",entity_id=item.delivery_id,message=f"{item.material_name} released for unloading to {tank.tank_code}.",severity="info")
    elif decision=="Hold":
      item.status="On Hold"
      record_event(db,event_type="BulkQADisposition",source="Quality",entity_type="BulkDelivery",entity_id=item.delivery_id,message=f"{item.material_name} tanker placed on QA hold before unloading.",severity="warning")
    else:
      item.status="Rejected"
      record_event(db,event_type="BulkQADisposition",source="Quality",entity_type="BulkDelivery",entity_id=item.delivery_id,message=f"{item.material_name} tanker rejected before unloading; tank inventory unchanged.",severity="warning")
    db.commit(); db.refresh(item); return item
def list_bulk_transfers(db): return list(db.scalars(select(BulkTransfer).order_by(BulkTransfer.id.desc())).all())
def create_bulk_transfer(db,payload):
    tank=db.scalar(select(BulkTank).where(BulkTank.tank_code==payload.source_tank)); po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==payload.po_number))
    if not tank or not po: raise ValueError("PO or bulk tank not found")
    if tank.qa_status!="Released": raise ValueError("Bulk tank is not QA released")
    if tank.quantity_kg<payload.quantity_kg: raise ValueError("Insufficient released bulk inventory")
    batch=db.scalar(select(MixBatch).where(MixBatch.po_number==payload.po_number).order_by(MixBatch.id.desc()))
    if not batch or batch.phase not in {"Bulk Excipient Verification", "Bulk PG Verification"}:
        raise ValueError("Complete bulk water addition before creating the bulk excipient production charge")
    recipe=BULK_RECIPES.get(po.bulk_material or "Propylene Glycol", BULK_RECIPES["Propylene Glycol"])
    if payload.source_tank != recipe["tank_code"]:
        raise ValueError(f"{po.bulk_material} for {po.po_number} must be charged from {recipe['tank_code']}")
    existing=db.scalar(select(BulkTransfer).where(BulkTransfer.po_number==payload.po_number, BulkTransfer.status.in_(["Awaiting Verification","Ready","Transferring","Complete"])).order_by(BulkTransfer.id.desc()))
    if existing: return existing
    item=BulkTransfer(transfer_id=f"BT-{uuid4().hex[:8].upper()}",po_number=payload.po_number,source_tank=payload.source_tank,destination_tank=payload.destination_tank,material_code=tank.material_code,quantity_kg=payload.quantity_kg,operator=payload.operator)
    db.add(item); db.commit(); db.refresh(item); return item
def verify_bulk_transfer(db,transfer_id,payload):
    item=db.scalar(select(BulkTransfer).where(BulkTransfer.transfer_id==transfer_id));
    if not item: raise ValueError("Bulk transfer not found")
    if not all([payload.identity_verified,payload.qa_release_verified,payload.hose_connected]): raise ValueError("Complete all bulk-transfer verifications")
    item.identity_verified=True; item.qa_release_verified=True; item.hose_connected=True; item.status="Ready"; db.commit(); db.refresh(item); return item
def bulk_transfer_action(db,transfer_id,action):
    item=db.scalar(select(BulkTransfer).where(BulkTransfer.transfer_id==transfer_id));
    if not item: raise ValueError("Bulk transfer not found")
    tank=db.scalar(select(BulkTank).where(BulkTank.tank_code==item.source_tank))
    if action=="start":
      if item.status!="Ready": raise ValueError("Verify identity, QA release, and hose connection first")
      item.status="Transferring"
    elif action=="tick":
      if item.status!="Transferring": raise ValueError("Bulk transfer is not running")
      item.progress=min(100,item.progress+20)
      if item.progress>=100:
        item.status="Complete"; item.completed_at=utc_now(); tank.quantity_kg=max(0,tank.quantity_kg-item.quantity_kg)
        batch=db.scalar(select(MixBatch).where(MixBatch.po_number==item.po_number).order_by(MixBatch.id.desc()))
        if batch:
          batch.mass_kg += item.quantity_kg
          batch.level_percent = min(100, batch.level_percent + 27)
          batch.phase = "Bulk Excipient Confirmation"
          batch.status = "Awaiting Bulk Excipient Confirmation"
          batch.progress = 100
        record_event(db,event_type="BulkTransferComplete",source="Mixing",entity_type="ProductionOrder",entity_id=item.po_number,message=f"{item.quantity_kg:.0f} kg {item.material_code} transferred {item.source_tank} to {item.destination_tank}; operator confirmation required.",severity="info")
    elif action=="diagnose": item.fault_diagnosed=True
    elif action=="reset": item.fault_code=None; item.fault_message=None; item.fault_diagnosed=False; item.status="Transferring"
    else: raise ValueError("Unsupported bulk transfer action")
    db.commit(); db.refresh(item); return item


def reset_demo_environment(db: Session, operator: str = "Demo Administrator", reason: str = "Reset demonstration environment"):
    """Clear transactional simulator state and restore seeded master/equipment data."""
    # Delete all rows in reverse dependency order. The simulator database contains
    # no external system-of-record data; this endpoint is intentionally demo-only.
    for table in reversed(Base.metadata.sorted_tables):
        db.execute(table.delete())
    db.commit()

    # Recreate deterministic master data and plant assets.
    ensure_inventory(db)
    ensure_weigh_rooms(db)
    ensure_mixing_assets(db)
    ensure_packaging_lines(db)
    ensure_bulk_tanks(db)

    record_event(
        db,
        event_type="DemoEnvironmentReset",
        source="System Administration",
        entity_type="DemoEnvironment",
        entity_id="EES-DEMO",
        message=f"{operator} reset the demonstration environment. Reason: {reason}",
        severity="warning",
    )
    db.commit()
    return {
        "status": "reset",
        "message": "Demonstration environment reset successfully",
        "operator": operator,
    }
