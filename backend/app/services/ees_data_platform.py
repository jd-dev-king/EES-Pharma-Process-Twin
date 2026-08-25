from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

FORMULATION_CODES = {
    "9PHQ9Y1OLM",
    "3K9958V90M",
    "XF417D3PSL",
    "8SKN0B0MIM",
    "7FLD91C86K",
    "SB8ZUX40TY",
    "BUC5I9595W",
    "FLV-STRAWBERRY-001",
    "FLV-BERRY-001",
    "FLV-GRAPE-001",
    "H3R47K3TBD",
    "WZB9127XOA",
    "DYE-RED33-001",
    "DYE-YELLOW5-001",
    # Simulation-only emergency alternates. These are never selected automatically;
    # they require an Office substitution approval before dispensing.
    "ALT-PSP-001",
    "ALT-ETH-001",
    "ALT-MSP-001",
    "ALT-SBENZ-001",
    "ALT-EDTA-001",
    "ALT-SUCR-001",
    "ART-CHERRY-001",
    "ART-STRAWBERRY-001",
    "ART-GRAPE-001",
    "ART-BERRY-001",
}

BULK_RECIPE_ROWS = [
    ("059QF0KO0R", "Water", 4000.0, "kg"),
    ("PDC6A3C0OX", "Glycerin", 920.0, "kg"),
    ("6DC9Q167V3", "Propylene Glycol", 750.0, "kg"),
    ("C151H8M554", "Sucrose", 2175.0, "kg"),
]

PACKAGING_CODES = {
    "PKG-BOTTLE-120",
    "PKG-CLOSURE-120",
    "PKG-LABEL-PRED",
}

SUBSTITUTE_MATERIALS = {
    "9PHQ9Y1OLM": ["ALT-PSP-001"],
    "3K9958V90M": ["ALT-ETH-001"],
    "XF417D3PSL": ["ALT-MSP-001"],
    "8SKN0B0MIM": ["ALT-SBENZ-001"],
    "7FLD91C86K": ["ALT-EDTA-001"],
    "SB8ZUX40TY": ["ALT-SUCR-001"],
    "BUC5I9595W": ["ART-CHERRY-001"],
    "FLV-STRAWBERRY-001": ["ART-STRAWBERRY-001"],
    "FLV-GRAPE-001": ["ART-GRAPE-001"],
    "FLV-BERRY-001": ["ART-BERRY-001"],
}


def substitution_candidates(db: Session, material_code: str) -> list[dict[str, Any]]:
    """Released emergency alternates for a production material.

    These are simulation candidates only. Warehouse may request one, but the
    production requirement is not changed until Office approves the request.
    """
    codes = SUBSTITUTE_MATERIALS.get(material_code, [])
    if not codes:
        return []
    rows = db.execute(
        text(
            """
            SELECT
                mc.material_code,
                mc.material_name,
                ml.internal_lot_number,
                ml.available_quantity::double precision AS available_quantity,
                ml.unit_of_measure,
                ml.expiry_date
            FROM supply.material_catalog mc
            JOIN supply.material_lots ml
              ON ml.supply_material_id = mc.supply_material_id
            WHERE mc.active = true
              AND mc.material_code = ANY(:codes)
              AND lower(ml.status) IN ('available', 'released')
              AND ml.available_quantity > 0
            ORDER BY mc.material_code, ml.expiry_date NULLS LAST, ml.received_at NULLS LAST,
                     ml.internal_lot_number
            """
        ),
        {"codes": codes},
    ).mappings().all()
    return [dict(row) for row in rows]


def supply_lot_detail(db: Session, lot_number: str) -> dict[str, Any] | None:
    row = db.execute(
        text(
            """
            SELECT
                mc.material_code,
                mc.material_name,
                ml.internal_lot_number,
                ml.available_quantity::double precision AS available_quantity,
                ml.unit_of_measure,
                ml.status,
                ml.expiry_date
            FROM supply.material_catalog mc
            JOIN supply.material_lots ml
              ON ml.supply_material_id = mc.supply_material_id
            WHERE ml.internal_lot_number = :lot_number
              AND mc.active = true
            LIMIT 1
            """
        ),
        {"lot_number": lot_number},
    ).mappings().first()
    return dict(row) if row else None


def apply_pharma_material_substitution(
    db: Session,
    *,
    po_number: str,
    original_material_code: str,
    substitute_material_code: str,
    substitute_material_name: str,
    unit: str,
) -> None:
    """Move the canonical Pharma batch requirement to the approved substitute.

    The SubstitutionRequest retains the original material code for audit history.
    """
    if not db.bind or db.bind.dialect.name != "postgresql":
        return
    new_material_id = db.execute(
        text(
            """
            INSERT INTO pharma.materials (
                material_code, material_name, material_type, unit_of_measure,
                specification_reference, supplier_name, lot_controlled, active
            ) VALUES (
                :code, :name, 'excipient', :unit,
                'EES simulation emergency alternate - controlled approval required',
                'Approved Emergency Supplier', true, true
            )
            ON CONFLICT (material_code) DO UPDATE SET
                material_name = EXCLUDED.material_name,
                unit_of_measure = EXCLUDED.unit_of_measure,
                active = true,
                updated_at = now()
            RETURNING material_id
            """
        ),
        {"code": substitute_material_code, "name": substitute_material_name, "unit": unit},
    ).scalar_one()
    db.execute(
        text(
            """
            UPDATE pharma.batch_materials bm
               SET material_id = :new_material_id
              FROM pharma.batches b,
                   pharma.production_orders po,
                   pharma.materials oldm
             WHERE bm.batch_id = b.batch_id
               AND b.production_order_id = po.production_order_id
               AND bm.material_id = oldm.material_id
               AND po.po_number = :po_number
               AND oldm.material_code = :original_code
            """
        ),
        {
            "new_material_id": new_material_id,
            "po_number": po_number,
            "original_code": original_material_code,
        },
    )



def supply_inventory(db: Session, include_packaging: bool = False) -> list[dict[str, Any]]:
    codes = sorted(FORMULATION_CODES | (PACKAGING_CODES if include_packaging else set()))
    rows = db.execute(
        text(
            """
            SELECT
                row_number() OVER (
                    ORDER BY mc.material_name, ml.expiry_date NULLS LAST, ml.internal_lot_number
                )::int AS id,
                mc.material_code,
                mc.material_name,
                ml.internal_lot_number AS lot_number,
                ml.available_quantity::double precision AS quantity,
                ml.reserved_quantity::double precision AS reserved_quantity,
                ml.unit_of_measure AS unit,
                COALESCE(
                    to_jsonb(il)->>'location_code',
                    to_jsonb(il)->>'location_name',
                    to_jsonb(il)->>'name',
                    ml.location_id::text,
                    'UNASSIGNED'
                ) AS location,
                CASE
                    WHEN lower(ml.status) IN ('available', 'released') THEN 'Released'
                    ELSE initcap(ml.status)
                END AS qa_status,
                COALESCE(ml.expiry_date::text, '') AS expiration_date
            FROM supply.material_catalog mc
            JOIN supply.material_lots ml
              ON ml.supply_material_id = mc.supply_material_id
            LEFT JOIN supply.inventory_locations il
              ON il.location_id = ml.location_id
            WHERE mc.active = true
              AND mc.material_code = ANY(:codes)
            ORDER BY mc.material_name, ml.expiry_date NULLS LAST, ml.internal_lot_number
            """
        ),
        {"codes": codes},
    ).mappings().all()
    return [dict(row) for row in rows]


def supply_lots(db: Session, material_code: str) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                ml.material_lot_id,
                ml.internal_lot_number,
                ml.available_quantity::double precision AS available_quantity,
                ml.reserved_quantity::double precision AS reserved_quantity,
                ml.unit_of_measure,
                ml.status,
                ml.expiry_date,
                COALESCE(to_jsonb(il)->>'location_code', to_jsonb(il)->>'location_name', ml.location_id::text, 'WAREHOUSE') AS location_code
            FROM supply.material_catalog mc
            JOIN supply.material_lots ml
              ON ml.supply_material_id = mc.supply_material_id
            LEFT JOIN supply.inventory_locations il
              ON il.location_id = ml.location_id
            WHERE mc.material_code = :material_code
              AND mc.active = true
              AND lower(ml.status) IN ('available', 'released')
            ORDER BY ml.expiry_date NULLS LAST, ml.received_at NULLS LAST, ml.internal_lot_number
            """
        ),
        {"material_code": material_code},
    ).mappings().all()
    return [dict(row) for row in rows]


def formulation_options_from_supply(db: Session) -> dict[str, list[dict[str, Any]]]:
    rows = db.execute(
        text(
            """
            SELECT
                mc.material_code,
                mc.material_name,
                ml.internal_lot_number
            FROM supply.material_catalog mc
            LEFT JOIN supply.material_lots ml
              ON ml.supply_material_id = mc.supply_material_id
             AND lower(ml.status) IN ('available', 'released')
            WHERE mc.active = true
              AND lower(mc.material_name) IN (
                'cherry','strawberry','berry','grape',
                'fd&c blue no. 1','fd&c red no. 40','fd&c red no. 33','fd&c yellow no. 5'
              )
            ORDER BY mc.material_name, ml.expiry_date NULLS LAST, ml.internal_lot_number
            """
        )
    ).mappings().all()
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        item = grouped.setdefault(
            row["material_code"],
            {"material_code": row["material_code"], "material_name": row["material_name"], "lots": []},
        )
        if row["internal_lot_number"]:
            item["lots"].append(row["internal_lot_number"])
    values = list(grouped.values())
    return {
        "flavors": [x for x in values if x["material_name"].lower() in {"cherry", "strawberry", "berry", "grape"}],
        "dyes": [x for x in values if x["material_name"].lower().startswith("fd&c")],
    }


def consume_supply_lot(db: Session, lot_number: str, quantity: float) -> None:
    if not db.bind or db.bind.dialect.name != "postgresql":
        return
    row = db.execute(
        text(
            """
            UPDATE supply.material_lots
               SET available_quantity = available_quantity - :quantity,
                   updated_at = now()
             WHERE internal_lot_number = :lot_number
               AND lower(status) IN ('available', 'released')
               AND available_quantity >= :quantity
            RETURNING material_lot_id
            """
        ),
        {"lot_number": lot_number, "quantity": quantity},
    ).first()
    if not row:
        raise ValueError("Insufficient released inventory")


def sync_pharma_order(
    db: Session,
    *,
    po_number: str,
    batch_number: str,
    planned_quantity: float,
    materials: list[tuple[str, str, float, str]],
) -> None:
    if not db.bind or db.bind.dialect.name != "postgresql":
        return
    product_id = db.execute(
        text(
            """
            INSERT INTO pharma.products (
                product_code, product_name, dosage_form, strength, unit_of_measure, description, active
            ) VALUES (
                'PRED-LIQ-15MG-5ML', 'Liquid Prednisone', 'oral solution', '15 mg / 5 mL', 'L',
                'Liquid Prednisone manufactured with Prednisolone as the active pharmaceutical ingredient.', true
            )
            ON CONFLICT (product_code) DO UPDATE SET
                product_name = EXCLUDED.product_name,
                dosage_form = EXCLUDED.dosage_form,
                strength = EXCLUDED.strength,
                unit_of_measure = EXCLUDED.unit_of_measure,
                active = true,
                updated_at = now()
            RETURNING product_id
            """
        )
    ).scalar_one()

    production_order_id = db.execute(
        text(
            """
            INSERT INTO pharma.production_orders (
                po_number, product_id, planned_quantity, unit_of_measure, status, source_system
            ) VALUES (
                :po_number, :product_id, :planned_quantity, 'L', 'planned', 'pharma-process-twin'
            )
            ON CONFLICT (po_number) DO UPDATE SET
                product_id = EXCLUDED.product_id,
                planned_quantity = EXCLUDED.planned_quantity,
                unit_of_measure = EXCLUDED.unit_of_measure,
                source_system = EXCLUDED.source_system,
                updated_at = now()
            RETURNING production_order_id
            """
        ),
        {"po_number": po_number, "product_id": product_id, "planned_quantity": planned_quantity},
    ).scalar_one()

    batch_id = db.execute(
        text(
            """
            INSERT INTO pharma.batches (
                batch_number, production_order_id, product_id, target_quantity, unit_of_measure, status
            ) VALUES (
                :batch_number, :production_order_id, :product_id, :planned_quantity, 'L', 'created'
            )
            ON CONFLICT (batch_number) DO UPDATE SET
                production_order_id = EXCLUDED.production_order_id,
                product_id = EXCLUDED.product_id,
                target_quantity = EXCLUDED.target_quantity,
                unit_of_measure = EXCLUDED.unit_of_measure,
                updated_at = now()
            RETURNING batch_id
            """
        ),
        {
            "batch_number": batch_number,
            "production_order_id": production_order_id,
            "product_id": product_id,
            "planned_quantity": planned_quantity,
        },
    ).scalar_one()

    for material_code, material_name, required_quantity, unit in materials:
        material_id = db.execute(
            text(
                """
                SELECT material_id
                  FROM pharma.materials
                 WHERE material_code = :material_code
                 LIMIT 1
                """
            ),
            {"material_code": material_code},
        ).scalar_one_or_none()
        if material_id is None:
            continue
        params = {
            "batch_id": batch_id,
            "material_id": material_id,
            "required_quantity": required_quantity,
            "unit": unit,
        }
        updated = db.execute(
            text(
                """
                UPDATE pharma.batch_materials
                   SET required_quantity = :required_quantity,
                       unit_of_measure = :unit
                 WHERE batch_id = :batch_id
                   AND material_id = :material_id
                   AND COALESCE(weighing_status, 'pending') NOT IN ('verified', 'complete', 'completed')
                """
            ),
            params,
        )
        if updated.rowcount == 0:
            db.execute(
                text(
                    """
                    INSERT INTO pharma.batch_materials (
                        batch_id, material_id, required_quantity, unit_of_measure, weighing_status
                    )
                    SELECT :batch_id, :material_id, :required_quantity, :unit, 'pending'
                    WHERE NOT EXISTS (
                        SELECT 1
                          FROM pharma.batch_materials
                         WHERE batch_id = :batch_id
                           AND material_id = :material_id
                    )
                    """
                ),
                params,
            )


def update_pharma_batch_material(
    db: Session,
    *,
    po_number: str,
    material_code: str,
    lot_number: str,
    actual_quantity: float,
) -> None:
    if not db.bind or db.bind.dialect.name != "postgresql":
        return
    db.execute(
        text(
            """
            UPDATE pharma.batch_materials bm
               SET material_lot = :lot_number,
                   actual_quantity = :actual_quantity,
                   weighing_status = 'verified',
                   weighed_at = now()
              FROM pharma.batches b,
                   pharma.production_orders po,
                   pharma.materials m
             WHERE bm.batch_id = b.batch_id
               AND b.production_order_id = po.production_order_id
               AND bm.material_id = m.material_id
               AND po.po_number = :po_number
               AND m.material_code = :material_code
            """
        ),
        {
            "po_number": po_number,
            "material_code": material_code,
            "lot_number": lot_number,
            "actual_quantity": actual_quantity,
        },
    )


def batch_genealogy(db: Session, po_number: str) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                b.batch_number,
                m.material_code,
                m.material_name,
                bm.material_lot,
                bm.required_quantity::double precision AS required_quantity,
                bm.actual_quantity::double precision AS actual_quantity,
                bm.unit_of_measure,
                bm.weighing_status
            FROM pharma.production_orders po
            JOIN pharma.batches b ON b.production_order_id = po.production_order_id
            JOIN pharma.batch_materials bm ON bm.batch_id = b.batch_id
            JOIN pharma.materials m ON m.material_id = bm.material_id
            WHERE po.po_number = :po_number
            ORDER BY m.material_name
            """
        ),
        {"po_number": po_number},
    ).mappings().all()
    return [dict(row) for row in rows]


def packaging_components(db: Session) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT
                mc.material_code,
                mc.material_name,
                COALESCE(SUM(ml.available_quantity), 0)::double precision AS available_quantity,
                mc.unit_of_measure
            FROM supply.material_catalog mc
            LEFT JOIN supply.material_lots ml
              ON ml.supply_material_id = mc.supply_material_id
             AND lower(ml.status) IN ('available', 'released')
            WHERE mc.active = true
              AND (
                    mc.material_code = ANY(:codes)
                 OR lower(mc.material_type) IN ('packaging', 'packaging_component', 'component')
                 OR lower(mc.material_name) LIKE '%bottle%'
                 OR lower(mc.material_name) LIKE '%closure%'
                 OR lower(mc.material_name) LIKE '%label%'
              )
            GROUP BY mc.material_code, mc.material_name, mc.unit_of_measure
            ORDER BY mc.material_name
            """
        ),
        {"codes": sorted(PACKAGING_CODES)},
    ).mappings().all()
    return [dict(row) for row in rows]


APPROVED_FORMULATION_FALLBACK = [
    {"material_number":"PDFC-0813","name":"Dye Free Cherry","flavor":"Cherry","dyes":[]},
    {"material_number":"PC-1308","name":"Cherry","flavor":"Cherry","dyes":["FD&C Red No. 33","FD&C Red No. 40"]},
    {"material_number":"PDFS-0914","name":"Dye Free Strawberry","flavor":"Strawberry","dyes":[]},
    {"material_number":"PS-1409","name":"Strawberry","flavor":"Strawberry","dyes":["FD&C Red No. 33","FD&C Yellow No. 5"]},
    {"material_number":"PDFG-0715","name":"Dye Free Grape","flavor":"Grape","dyes":[]},
    {"material_number":"PG-1507","name":"Grape","flavor":"Grape","dyes":["FD&C Blue No. 1","FD&C Red No. 40"]},
    {"material_number":"PDFB-0616","name":"Dye Free Berry","flavor":"Berry","dyes":[]},
    {"material_number":"PB-1606","name":"Berry","flavor":"Berry","dyes":["FD&C Red No. 40"]},
]

def approved_formulations(db: Session) -> list[dict[str, Any]]:
    if not db.bind or db.bind.dialect.name != "postgresql":
        return APPROVED_FORMULATION_FALLBACK
    try:
        exists = db.execute(text("SELECT to_regclass('mes.formulation_master')")).scalar_one_or_none()
        if not exists:
            return APPROVED_FORMULATION_FALLBACK
        rows = db.execute(text("""
            SELECT material_number, formula_name AS name, flavor, dyes
              FROM mes.formulation_master
             WHERE status='approved'
             ORDER BY material_number
        """)).mappings().all()
        return [dict(r) for r in rows] or APPROVED_FORMULATION_FALLBACK
    except Exception:
        db.rollback()
        return APPROVED_FORMULATION_FALLBACK

def _ensure_mes_execution_events(db: Session) -> None:
    """Install/upgrade the native MES execution-event store.

    Older demo databases did not include mes.execution_events, causing mes_log()
    to silently return and the Compliance page to fall back to platform_events.
    Keep the table in the shared PostgreSQL platform so MES records survive page
    refreshes and are queryable by PO.
    """
    if not db.bind or db.bind.dialect.name != "postgresql":
        return

    db.execute(text("CREATE SCHEMA IF NOT EXISTS mes"))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS mes.execution_events (
            event_id       BIGSERIAL PRIMARY KEY,
            po_number      VARCHAR(80) NOT NULL,
            event_type     VARCHAR(120) NOT NULL,
            phase          VARCHAR(160) NOT NULL,
            equipment_id   VARCHAR(160),
            operator_id    VARCHAR(160),
            material_code  VARCHAR(160),
            material_name  VARCHAR(255),
            lot_number     VARCHAR(160),
            quantity       NUMERIC(18,6),
            unit           VARCHAR(40),
            metric         VARCHAR(160),
            value          NUMERIC(18,6),
            message        TEXT NOT NULL DEFAULT '',
            severity       VARCHAR(30) NOT NULL DEFAULT 'info',
            qualified      BOOLEAN NOT NULL DEFAULT true,
            event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    # Forward-compatible upgrades for an older/partial MES table.
    for ddl in (
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS po_number VARCHAR(80)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS event_type VARCHAR(120)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS phase VARCHAR(160)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS equipment_id VARCHAR(160)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS operator_id VARCHAR(160)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS material_code VARCHAR(160)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS material_name VARCHAR(255)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS lot_number VARCHAR(160)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS quantity NUMERIC(18,6)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS unit VARCHAR(40)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS metric VARCHAR(160)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS value NUMERIC(18,6)",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS message TEXT DEFAULT ''",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS severity VARCHAR(30) DEFAULT 'info'",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS qualified BOOLEAN DEFAULT true",
        "ALTER TABLE mes.execution_events ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ DEFAULT now()",
    ):
        db.execute(text(ddl))

    db.execute(text("""
        CREATE INDEX IF NOT EXISTS ix_mes_execution_events_po_time
            ON mes.execution_events(po_number,event_timestamp,event_id)
    """))


def mes_log(
    db: Session,
    *,
    po_number: str,
    event_type: str,
    phase: str,
    equipment_id: str | None = None,
    operator_id: str | None = None,
    material_code: str | None = None,
    material_name: str | None = None,
    lot_number: str | None = None,
    quantity: float | None = None,
    unit: str | None = None,
    metric: str | None = None,
    value: float | None = None,
    message: str = "",
    severity: str = "info",
    qualified: bool = True,
) -> None:
    if not db.bind or db.bind.dialect.name != "postgresql":
        return

    # MES is part of the same authoritative PostgreSQL transaction as the
    # manufacturing action. Do not silently discard records when the table is
    # absent; install it and write the event.
    _ensure_mes_execution_events(db)

    db.execute(
        text("""
            INSERT INTO mes.execution_events
                (
                    po_number,event_type,phase,equipment_id,operator_id,
                    material_code,material_name,lot_number,quantity,unit,
                    metric,value,message,severity,qualified,event_timestamp
                )
            VALUES
                (
                    :po,:event_type,:phase,:equipment,:operator,
                    :material_code,:material_name,:lot,:quantity,:unit,
                    :metric,:value,:message,:severity,:qualified,now()
                )
        """),
        {
            "po": po_number,
            "event_type": event_type,
            "phase": phase,
            "equipment": equipment_id,
            "operator": operator_id,
            "material_code": material_code,
            "material_name": material_name,
            "lot": lot_number,
            "quantity": quantity,
            "unit": unit,
            "metric": metric,
            "value": value,
            "message": message,
            "severity": severity,
            "qualified": qualified,
        },
    )


def mes_batch_record(db: Session, po_number: str) -> dict[str, Any]:
    if not db.bind or db.bind.dialect.name != "postgresql":
        return {"po_number":po_number,"events":[],"summary":{}}

    try:
        _ensure_mes_execution_events(db)

        rows = db.execute(text("""
            SELECT
                event_id,po_number,event_type,phase,equipment_id,operator_id,
                material_code,material_name,lot_number,quantity,unit,metric,
                value,message,severity,qualified,event_timestamp
              FROM mes.execution_events
             WHERE po_number=:po
             ORDER BY event_timestamp,event_id
        """), {"po":po_number}).mappings().all()

        summary = db.execute(text("""
            SELECT
                count(*)::int AS event_count,
                count(*) FILTER (
                    WHERE severity IN ('warning','error','critical')
                       OR qualified=false
                )::int AS exception_count,
                min(event_timestamp) AS first_event,
                max(event_timestamp) AS last_event
              FROM mes.execution_events
             WHERE po_number=:po
        """), {"po":po_number}).mappings().one()

        return {
            "po_number":po_number,
            "events":[dict(r) for r in rows],
            "summary":dict(summary),
        }
    except Exception:
        # Reading Compliance must not poison the caller's SQLAlchemy session.
        db.rollback()
        raise


def rnd_material_catalog(db: Session) -> dict[str, list[dict[str, Any]]]:
    """All materials R&D may select: approved plant materials, candidate alternates and bulk tanks."""
    approved = db.execute(text("""
        SELECT mc.material_code, mc.material_name, mc.material_type, mc.unit_of_measure,
               'approved'::text AS qualification_status
          FROM supply.material_catalog mc
         WHERE mc.active = true
         ORDER BY mc.material_name
    """)).mappings().all()

    candidates = db.execute(text("""
        SELECT q.candidate_code AS material_code,
               q.candidate_name AS material_name,
               'development_candidate'::text AS material_type,
               COALESCE(src.unit_of_measure,'kg') AS unit_of_measure,
               q.approval_status AS qualification_status,
               q.target_material_code
          FROM public.material_alternative_qualifications q
          LEFT JOIN supply.material_catalog src
            ON src.material_code = q.target_material_code
         ORDER BY q.candidate_name
    """)).mappings().all()

    bulks = db.execute(text("""
        SELECT tank_code, material_code, material_name,
               capacity_kg::double precision AS capacity_kg,
               quantity_kg::double precision AS quantity_kg,
               qa_status, status
          FROM public.bulk_tanks
         WHERE tank_code IN ('PW-101','PG-101','GLY-101','SUC-101','HSCF-101','BULK-X')
         ORDER BY tank_code
    """)).mappings().all()

    return {
        "materials": [dict(r) for r in approved],
        "candidates": [dict(r) for r in candidates],
        "bulks": [dict(r) for r in bulks],
    }


def rnd_formula_materials(db: Session, material_number: str) -> list[dict[str, Any]]:
    if not db.bind or db.bind.dialect.name != "postgresql":
        return []
    try:
        exists = db.execute(text("SELECT to_regclass('mes.rnd_formula_materials')")).scalar_one_or_none()
        if not exists:
            return []
        rows = db.execute(text("""
            SELECT material_code, material_name, quantity::double precision AS quantity,
                   unit, role, source
              FROM mes.rnd_formula_materials
             WHERE material_number=:material_number
             ORDER BY sequence_no, material_name
        """), {"material_number": material_number}).mappings().all()
        return [dict(r) for r in rows]
    except Exception:
        db.rollback()
        return []
    
# ============================================================
# EES PHARMA WORKFORCE
# Authoritative workforce / training reads from ees_data_platform
# ============================================================


def list_workforce_employees(db: Session) -> list[dict]:
    """
    Return the authoritative Pharma workforce.

    Identity, department, role and shift are sourced from the
    workforce schema in ees_data_platform.

    Includes ACTIVE, LEAVE and INACTIVE employees so the Workforce
    UI can represent the complete master population.
    """

    rows = db.execute(
        text(
            """
            SELECT
                s.employee_id,
                s.site_code,
                s.employee_number,
                s.display_name,

                m.first_name,
                m.last_name,

                s.employment_type,
                s.employment_status,
                s.commute_mode,

                s.department_code,
                s.department_name,

                s.role_id,
                s.role_code,
                s.role_name,
                s.role_level,

                s.shift_id,
                s.shift_code,
                s.shift_name,
                s.schedule_family,

                s.start_time,
                s.end_time,
                s.crosses_midnight,
                s.operating_days,
                s.on_call

            FROM workforce.v_current_employee_schedule s

            JOIN workforce.v_employee_master m
              ON m.employee_id = s.employee_id

            WHERE s.site_code = 'PHARMA-001'

            ORDER BY
                CASE s.employment_status
                    WHEN 'ACTIVE' THEN 1
                    WHEN 'LEAVE' THEN 2
                    WHEN 'INACTIVE' THEN 3
                    ELSE 4
                END,
                s.department_name,
                s.shift_name,
                s.display_name
            """
        )
    ).mappings().all()

    return [
        {
            **dict(row),

            "start_time":
                row["start_time"].isoformat()
                if row["start_time"] is not None
                else None,

            "end_time":
                row["end_time"].isoformat()
                if row["end_time"] is not None
                else None,

            "operating_days":
                list(row["operating_days"])
                if row["operating_days"] is not None
                else [],
        }
        for row in rows
    ]


def get_workforce_summary(db: Session) -> dict:
    """
    Top-level authoritative Pharma workforce counts.
    """

    summary = db.execute(
        text(
            """
            SELECT
                COUNT(*) AS total,

                COUNT(*) FILTER (
                    WHERE employment_status = 'ACTIVE'
                ) AS active,

                COUNT(*) FILTER (
                    WHERE employment_status = 'LEAVE'
                ) AS on_leave,

                COUNT(*) FILTER (
                    WHERE employment_status = 'INACTIVE'
                ) AS inactive,

                COUNT(*) FILTER (
                    WHERE employment_type = 'PERMANENT'
                ) AS permanent,

                COUNT(*) FILTER (
                    WHERE employment_type = 'TEMPORARY'
                ) AS temporary

            FROM workforce.employees

            WHERE site_code = 'PHARMA-001'
            """
        )
    ).mappings().one()

    departments = db.execute(
        text(
            """
            SELECT
                department_name,
                COUNT(*) AS headcount,

                COUNT(*) FILTER (
                    WHERE employment_status = 'ACTIVE'
                ) AS active,

                COUNT(*) FILTER (
                    WHERE employment_type = 'TEMPORARY'
                ) AS temporary

            FROM workforce.employees

            WHERE site_code = 'PHARMA-001'

            GROUP BY department_name

            ORDER BY department_name
            """
        )
    ).mappings().all()

    return {
        "total": int(summary["total"] or 0),
        "active": int(summary["active"] or 0),
        "on_leave": int(summary["on_leave"] or 0),
        "inactive": int(summary["inactive"] or 0),
        "permanent": int(summary["permanent"] or 0),
        "temporary": int(summary["temporary"] or 0),

        "departments": [
            {
                "department_name": row["department_name"],
                "headcount": int(row["headcount"] or 0),
                "active": int(row["active"] or 0),
                "temporary": int(row["temporary"] or 0),
            }
            for row in departments
        ],
    }


def list_workforce_training(db: Session) -> list[dict]:
    """
    Required training matrix by employee.

    Requirements come from the employee's ACTIVE primary role.
    Current status comes from the latest employee training record.

    This means PERMANENT and TEMPORARY employees with the same
    role automatically receive identical requirements.
    """

    rows = db.execute(
        text(
            """
            WITH latest_training AS (
                SELECT DISTINCT ON (
                    et.employee_id,
                    et.course_id
                )
                    et.employee_id,
                    et.course_id,
                    et.employee_training_id,
                    et.training_status,
                    et.assigned_at,
                    et.completed_at,
                    et.expires_at,
                    et.completion_score,

                    CASE
                        WHEN et.training_status = 'REVOKED'
                            THEN 'REVOKED'

                        WHEN et.training_status = 'FAILED'
                            THEN 'FAILED'

                        WHEN et.training_status <> 'COMPLETED'
                            THEN et.training_status

                        WHEN et.expires_at IS NOT NULL
                         AND et.expires_at <= now()
                            THEN 'EXPIRED'

                        ELSE 'CURRENT'
                    END AS effective_status

                FROM pharma.employee_training et

                ORDER BY
                    et.employee_id,
                    et.course_id,
                    et.assigned_at DESC,
                    et.employee_training_id DESC
            )

            SELECT
                e.employee_id,
                e.employee_number,
                e.display_name,
                e.department_name,
                e.employment_type,
                e.employment_status,

                r.role_code,
                r.role_name,

                c.course_id,
                c.course_code,
                c.course_name,
                c.training_category,
                c.gmp_relevant,
                c.required_for_site_access,
                c.validity_days,

                COALESCE(
                    lt.effective_status,
                    'MISSING'
                ) AS effective_status,

                lt.training_status AS recorded_status,
                lt.assigned_at,
                lt.completed_at,
                lt.expires_at,
                lt.completion_score

            FROM workforce.employees e

            JOIN workforce.employee_role_assignments era
              ON era.employee_id = e.employee_id
             AND era.active = true
             AND era.is_primary = true
             AND era.effective_start_date <= CURRENT_DATE
             AND (
                    era.effective_end_date IS NULL
                    OR era.effective_end_date >= CURRENT_DATE
                 )

            JOIN workforce.roles r
              ON r.role_id = era.role_id

            JOIN pharma.role_training_requirements req
              ON req.role_id = era.role_id
             AND req.requirement_type = 'REQUIRED'
             AND req.active = true

            JOIN pharma.training_courses c
              ON c.course_id = req.course_id
             AND c.active = true

            LEFT JOIN latest_training lt
              ON lt.employee_id = e.employee_id
             AND lt.course_id = c.course_id

            WHERE e.site_code = 'PHARMA-001'

            ORDER BY
                e.department_name,
                e.display_name,
                c.course_name
            """
        )
    ).mappings().all()

    result = []

    for row in rows:
        item = dict(row)

        for field in (
            "assigned_at",
            "completed_at",
            "expires_at",
        ):
            value = item.get(field)
            item[field] = (
                value.isoformat()
                if value is not None
                else None
            )

        if item.get("completion_score") is not None:
            item["completion_score"] = float(
                item["completion_score"]
            )

        result.append(item)

    return result


def get_workforce_coverage(db: Session) -> dict:
    """
    Calculate qualification/training readiness from actual required
    courses rather than deterministic frontend percentages.

    Readiness =
        current required courses / total required courses * 100
    """

    employee_rows = db.execute(
        text(
            """
            WITH latest_training AS (
                SELECT DISTINCT ON (
                    et.employee_id,
                    et.course_id
                )
                    et.employee_id,
                    et.course_id,

                    CASE
                        WHEN et.training_status = 'REVOKED'
                            THEN 'REVOKED'

                        WHEN et.training_status = 'FAILED'
                            THEN 'FAILED'

                        WHEN et.training_status <> 'COMPLETED'
                            THEN et.training_status

                        WHEN et.expires_at IS NOT NULL
                         AND et.expires_at <= now()
                            THEN 'EXPIRED'

                        ELSE 'CURRENT'
                    END AS effective_status

                FROM pharma.employee_training et

                ORDER BY
                    et.employee_id,
                    et.course_id,
                    et.assigned_at DESC,
                    et.employee_training_id DESC
            ),

            employee_requirements AS (
                SELECT
                    e.employee_id,
                    e.employee_number,
                    e.display_name,
                    e.department_name,
                    e.employment_type,
                    e.employment_status,

                    r.role_code,
                    r.role_name,

                    COUNT(req.course_id)
                        AS required_courses,

                    COUNT(req.course_id) FILTER (
                        WHERE lt.effective_status = 'CURRENT'
                    ) AS current_courses

                FROM workforce.employees e

                JOIN workforce.employee_role_assignments era
                  ON era.employee_id = e.employee_id
                 AND era.active = true
                 AND era.is_primary = true
                 AND era.effective_start_date <= CURRENT_DATE
                 AND (
                        era.effective_end_date IS NULL
                        OR era.effective_end_date >= CURRENT_DATE
                     )

                JOIN workforce.roles r
                  ON r.role_id = era.role_id

                JOIN pharma.role_training_requirements req
                  ON req.role_id = r.role_id
                 AND req.active = true
                 AND req.requirement_type = 'REQUIRED'

                LEFT JOIN latest_training lt
                  ON lt.employee_id = e.employee_id
                 AND lt.course_id = req.course_id

                WHERE e.site_code = 'PHARMA-001'

                GROUP BY
                    e.employee_id,
                    e.employee_number,
                    e.display_name,
                    e.department_name,
                    e.employment_type,
                    e.employment_status,
                    r.role_code,
                    r.role_name
            )

            SELECT
                *,

                CASE
                    WHEN required_courses = 0
                        THEN 100
                    ELSE
                        ROUND(
                            (
                                current_courses::numeric
                                / required_courses::numeric
                            ) * 100
                        )
                END AS readiness

            FROM employee_requirements

            ORDER BY
                department_name,
                display_name
            """
        )
    ).mappings().all()

    employees = [
        {
            "employee_id": row["employee_id"],
            "employee_number": row["employee_number"],
            "display_name": row["display_name"],
            "department_name": row["department_name"],
            "employment_type": row["employment_type"],
            "employment_status": row["employment_status"],
            "role_code": row["role_code"],
            "role_name": row["role_name"],
            "required_courses": int(
                row["required_courses"] or 0
            ),
            "current_courses": int(
                row["current_courses"] or 0
            ),
            "readiness": int(
                row["readiness"] or 0
            ),
        }
        for row in employee_rows
    ]

    department_map: dict[str, dict] = {}

    for employee in employees:
        department = (
            employee["department_name"]
            or "Unassigned"
        )

        bucket = department_map.setdefault(
            department,
            {
                "department_name": department,
                "employees": 0,
                "active_employees": 0,
                "readiness_total": 0,
            },
        )

        bucket["employees"] += 1
        bucket["readiness_total"] += employee["readiness"]

        if employee["employment_status"] == "ACTIVE":
            bucket["active_employees"] += 1

    departments = []

    for bucket in department_map.values():
        employees_count = bucket["employees"]

        departments.append(
            {
                "department_name":
                    bucket["department_name"],

                "employees":
                    employees_count,

                "active_employees":
                    bucket["active_employees"],

                "readiness":
                    round(
                        bucket["readiness_total"]
                        / employees_count
                    )
                    if employees_count
                    else 0,
            }
        )

    departments.sort(
        key=lambda item:
            item["department_name"] or ""
    )

    return {
        "employees": employees,
        "departments": departments,
    }
    
# ============================================================
# EES PHARMA SECURITY
# Workforce qualification / controlled-zone access
# ============================================================


def list_security_employees(db: Session) -> list[dict]:
    """
    Security-facing workforce roster.

    Security consumes workforce identity, employment, role,
    shift, training qualifications and zone authorization.
    """

    rows = db.execute(
        text(
            """
            SELECT
                s.employee_id,
                s.employee_number,
                s.display_name,
                s.employment_type,
                s.employment_status,

                s.department_code,
                s.department_name,

                s.role_code,
                s.role_name,

                s.shift_code,
                s.shift_name,
                s.start_time,
                s.end_time,

                COUNT(*) FILTER (
                    WHERE a.authorization_status = 'AUTHORIZED'
                ) AS authorized_zones,

                COUNT(*) FILTER (
                    WHERE a.authorization_status = 'DENIED'
                ) AS denied_zones

            FROM workforce.v_current_employee_schedule s

            LEFT JOIN security.employee_access_authorizations a
              ON a.employee_id = s.employee_id

            WHERE s.site_code = 'PHARMA-001'

            GROUP BY
                s.employee_id,
                s.employee_number,
                s.display_name,
                s.employment_type,
                s.employment_status,
                s.department_code,
                s.department_name,
                s.role_code,
                s.role_name,
                s.shift_code,
                s.shift_name,
                s.start_time,
                s.end_time

            ORDER BY
                CASE s.employment_status
                    WHEN 'ACTIVE' THEN 1
                    WHEN 'LEAVE' THEN 2
                    WHEN 'INACTIVE' THEN 3
                    ELSE 4
                END,
                s.department_name,
                s.display_name
            """
        )
    ).mappings().all()

    return [
        {
            **dict(row),

            "start_time":
                row["start_time"].isoformat()
                if row["start_time"] is not None
                else None,

            "end_time":
                row["end_time"].isoformat()
                if row["end_time"] is not None
                else None,

            "authorized_zones":
                int(row["authorized_zones"] or 0),

            "denied_zones":
                int(row["denied_zones"] or 0),
        }
        for row in rows
    ]


def get_security_employee(db: Session, employee_id: int) -> dict:
    """
    Full Security employee faceplate:
      - workforce identity
      - role / shift
      - required training
      - GMP qualifications
      - zone authorization
    """

    employee = db.execute(
        text(
            """
            SELECT
                s.employee_id,
                s.employee_number,
                s.display_name,
                s.employment_type,
                s.employment_status,
                s.commute_mode,

                s.department_code,
                s.department_name,

                s.role_code,
                s.role_name,
                s.role_level,

                s.shift_code,
                s.shift_name,
                s.start_time,
                s.end_time,
                s.on_call

            FROM workforce.v_current_employee_schedule s

            WHERE s.site_code = 'PHARMA-001'
              AND s.employee_id = :employee_id
            """
        ),
        {
            "employee_id": employee_id,
        },
    ).mappings().first()

    if employee is None:
        raise ValueError("Employee not found")

    training = db.execute(
        text(
            """
            SELECT
                c.course_id,
                c.course_code,
                c.course_name,
                c.training_category,
                c.gmp_relevant,

                COALESCE(
                    ts.effective_status,
                    'MISSING'
                ) AS effective_status,

                ts.completed_at,
                ts.expires_at

            FROM workforce.employee_role_assignments era

            JOIN pharma.role_training_requirements req
              ON req.role_id = era.role_id
             AND req.requirement_type = 'REQUIRED'
             AND req.active = true

            JOIN pharma.training_courses c
              ON c.course_id = req.course_id
             AND c.active = true

            LEFT JOIN pharma.v_employee_training_status ts
              ON ts.employee_id = era.employee_id
             AND ts.course_id = c.course_id

            WHERE era.employee_id = :employee_id
              AND era.active = true
              AND era.is_primary = true

            ORDER BY
                c.gmp_relevant DESC,
                c.course_name
            """
        ),
        {
            "employee_id": employee_id,
        },
    ).mappings().all()

    qualifications = db.execute(
        text(
            """
            SELECT
                q.qualification_id,
                q.qualification_code,
                q.qualification_name,

                egq.qualification_status,
                egq.qualification_basis,
                egq.qualified_at,
                egq.expires_at,
                egq.notes,

                rg.required,
                rg.active AS role_requirement_active

            FROM workforce.employee_role_assignments era

            JOIN pharma.role_gmp_requirements rg
              ON rg.role_id = era.role_id
             AND rg.active = true
             AND rg.required = true

            JOIN pharma.gmp_qualifications q
              ON q.qualification_id = rg.qualification_id

            LEFT JOIN pharma.employee_gmp_qualifications egq
              ON egq.employee_id = era.employee_id
             AND egq.qualification_id = q.qualification_id

            WHERE era.employee_id = :employee_id
              AND era.active = true
              AND era.is_primary = true

            ORDER BY q.qualification_code
            """
        ),
        {
            "employee_id": employee_id,
        },
    ).mappings().all()

    zones = db.execute(
        text(
            """
            SELECT
                z.zone_id,
                z.zone_code,
                z.zone_name,
                z.security_level,
                z.gmp_controlled,

                COALESCE(
                    a.authorization_status,
                    'DENIED'
                ) AS authorization_status,

                COALESCE(
                    a.authorization_source,
                    'AUTOMATIC'
                ) AS authorization_source,

                COALESCE(
                    a.reason,
                    'No current authorization record.'
                ) AS reason,

                a.last_evaluated_at

            FROM security.access_zones z

            LEFT JOIN security.employee_access_authorizations a
              ON a.zone_id = z.zone_id
             AND a.employee_id = :employee_id

            WHERE z.site_code = 'PHARMA-001'
              AND z.active = true

            ORDER BY
                z.security_level,
                z.zone_code
            """
        ),
        {
            "employee_id": employee_id,
        },
    ).mappings().all()

    employee_result = dict(employee)

    for field in ("start_time", "end_time"):
        value = employee_result.get(field)

        employee_result[field] = (
            value.isoformat()
            if value is not None
            else None
        )

    training_result = []

    for row in training:
        item = dict(row)

        for field in (
            "completed_at",
            "expires_at",
        ):
            value = item.get(field)

            item[field] = (
                value.isoformat()
                if value is not None
                else None
            )


        training_result.append(item)

    qualification_result = []

    for row in qualifications:
        item = dict(row)

        for field in (
            "qualified_at",
            "expires_at",
        ):
            value = item.get(field)

            item[field] = (
                value.isoformat()
                if value is not None
                else None
            )

        qualification_result.append(item)

    zone_result = []

    for row in zones:
        item = dict(row)

        value = item.get(
            "last_evaluated_at"
        )

        item["last_evaluated_at"] = (
            value.isoformat()
            if value is not None
            else None
        )

        zone_result.append(item)

    return {
        "employee": employee_result,
        "training": training_result,
        "qualifications":
            qualification_result,
        "zones": zone_result,
    }


def get_security_summary(db: Session) -> dict:
    """
    Security Command Center KPIs.
    """

    row = db.execute(
        text(
            """
            SELECT
                COUNT(*) FILTER (
                    WHERE e.employment_status = 'ACTIVE'
                ) AS active_employees,

                COUNT(*) FILTER (
                    WHERE e.employment_status = 'LEAVE'
                ) AS on_leave,

                COUNT(*) FILTER (
                    WHERE e.employment_status = 'INACTIVE'
                ) AS inactive

            FROM workforce.employees e

            WHERE e.site_code = 'PHARMA-001'
            """
        )
    ).mappings().one()

    access = db.execute(
        text(
            """
            SELECT
                COUNT(*) FILTER (
                    WHERE a.authorization_status = 'AUTHORIZED'
                ) AS authorized,

                COUNT(*) FILTER (
                    WHERE a.authorization_status = 'DENIED'
                ) AS denied

            FROM security.employee_access_authorizations a

            JOIN workforce.employees e
              ON e.employee_id = a.employee_id

            JOIN security.access_zones z
              ON z.zone_id = a.zone_id

            WHERE e.site_code = 'PHARMA-001'
              AND z.site_code = 'PHARMA-001'
              AND z.zone_code IN (
                  'GREY',
                  'WHITE'
              )
            """
        )
    ).mappings().one()

    return {
        "active_employees":
            int(row["active_employees"] or 0),

        "on_leave":
            int(row["on_leave"] or 0),

        "inactive":
            int(row["inactive"] or 0),

        "controlled_authorized":
            int(access["authorized"] or 0),

        "controlled_denied":
            int(access["denied"] or 0),
    }


def reevaluate_security_employee(
    db: Session,
    employee_id: int,
) -> dict:
    """
    Re-evaluate one employee's zone authorization.

    Pharma training/qualification remains authoritative.
    Security consumes those results and updates badge access.
    """

    employee = db.execute(
        text(
            """
            SELECT
                e.employee_id,
                e.employment_status,
                r.role_code

            FROM workforce.employees e

            JOIN workforce.employee_role_assignments era
              ON era.employee_id = e.employee_id
             AND era.active = true
             AND era.is_primary = true

            JOIN workforce.roles r
              ON r.role_id = era.role_id

            WHERE e.site_code = 'PHARMA-001'
              AND e.employee_id = :employee_id
            """
        ),
        {
            "employee_id": employee_id,
        },
    ).mappings().first()

    if employee is None:
        raise ValueError("Employee not found")

    # --------------------------------------------------------
    # Non-active workforce:
    # deny all normal access.
    # --------------------------------------------------------

    if employee["employment_status"] != "ACTIVE":

        if employee["employment_status"] == "LEAVE":
            denial_reason = (
                "Employee currently on leave. "
                "Security override required."
            )

        elif employee["employment_status"] == "INACTIVE":
            denial_reason = (
                "Employee inactive. "
                "Normal badge access disabled."
            )

        else:
            denial_reason = (
                "Employee is not active. "
                "Normal badge access disabled."
            )

        db.execute(
            text(
                """
                INSERT INTO security.employee_access_authorizations (
                    employee_id,
                    zone_id,
                    authorization_status,
                    authorization_source,
                    effective_from,
                    reason,
                    last_evaluated_at
                )

                SELECT
                    :employee_id,
                    z.zone_id,
                    'DENIED',
                    'AUTOMATIC',
                    now(),
                    :reason,
                    now()

                FROM security.access_zones z

                WHERE z.site_code = 'PHARMA-001'
                    AND z.active = true

                ON CONFLICT (
                    employee_id,
                    zone_id
                )
                DO UPDATE SET
                    authorization_status =
                        'DENIED',

                    authorization_source =
                        'AUTOMATIC',

                    reason =
                        EXCLUDED.reason,

                    last_evaluated_at =
                        now(),

                    updated_at =
                        now()
                """
            ),
            {
                "employee_id": employee_id,
                "reason": denial_reason
            },
        )

        db.commit()

        return get_security_employee(
            db,
            employee_id
        )

    # --------------------------------------------------------
    # General-access zones.
    # --------------------------------------------------------

    db.execute(
        text(
            """
            INSERT INTO security.employee_access_authorizations (
                employee_id,
                zone_id,
                authorization_status,
                authorization_source,
                effective_from,
                reason,
                last_evaluated_at
            )

            SELECT
                :employee_id,
                z.zone_id,
                'AUTHORIZED',
                'AUTOMATIC',
                now(),
                'Active Pharma workforce general access.',
                now()

            FROM security.access_zones z

            WHERE z.site_code = 'PHARMA-001'
              AND z.zone_code IN (
                  'EXTERIOR',
                  'GENERAL',
                  'BLACK'
              )

            ON CONFLICT (
                employee_id,
                zone_id
            )
            DO UPDATE SET
                authorization_status =
                    'AUTHORIZED',

                authorization_source =
                    'AUTOMATIC',

                reason =
                    'Active Pharma workforce general access.',

                last_evaluated_at =
                    now(),

                updated_at =
                    now()
            """
        ),
        {
            "employee_id":
                employee_id,
        },
    )

    # --------------------------------------------------------
    # Security role:
    # operational authorization to all zones without GMP.
    # --------------------------------------------------------

    if employee["role_code"] == "SEC-GUARD":
        db.execute(
            text(
                """
                INSERT INTO security.employee_access_authorizations (
                    employee_id,
                    zone_id,
                    authorization_status,
                    authorization_source,
                    effective_from,
                    reason,
                    last_evaluated_at
                )

                SELECT
                    :employee_id,
                    z.zone_id,
                    'AUTHORIZED',
                    'AUTOMATIC',
                    now(),
                    'Security operational all-zone authorization.',
                    now()

                FROM security.access_zones z

                WHERE z.site_code = 'PHARMA-001'

                ON CONFLICT (
                    employee_id,
                    zone_id
                )
                DO UPDATE SET
                    authorization_status =
                        'AUTHORIZED',

                    authorization_source =
                        'AUTOMATIC',

                    reason =
                        'Security operational all-zone authorization.',

                    last_evaluated_at =
                        now(),

                    updated_at =
                        now()
                """
            ),
            {
                "employee_id":
                    employee_id,
            },
        )

        db.commit()

        return get_security_employee(
            db,
            employee_id,
        )

    # --------------------------------------------------------
    # Controlled zones.
    #
    # Role must require the qualification AND employee
    # qualification must currently be QUALIFIED.
    # --------------------------------------------------------

    for zone_code, qualification_code in (
        ("GREY", "GREY-QUAL"),
        ("WHITE", "WHITE-QUAL"),
    ):
        evaluation = db.execute(
            text(
                """
                SELECT
                    CASE
                        WHEN rg.role_id
                             IS NULL
                        THEN false

                        WHEN egq.qualification_status =
                             'QUALIFIED'
                        THEN true

                        ELSE false
                    END AS authorized,

                    CASE
                        WHEN rg.role_id
                             IS NULL
                        THEN
                            'Current role does not require this controlled zone.'

                        WHEN egq.qualification_status =
                             'QUALIFIED'
                        THEN
                            'Current required GMP qualification.'

                        WHEN egq.qualification_status
                             IS NULL
                        THEN
                            'Required qualification record is missing.'

                        ELSE
                            'Required zone qualification is incomplete, expired, or suspended.'
                    END AS reason

                FROM workforce.employee_role_assignments era

                JOIN workforce.roles r
                  ON r.role_id = era.role_id

                CROSS JOIN pharma.gmp_qualifications q

                LEFT JOIN pharma.role_gmp_requirements rg
                  ON rg.role_id = r.role_id
                 AND rg.qualification_id =
                     q.qualification_id
                 AND rg.active = true
                 AND rg.required = true

                LEFT JOIN pharma.employee_gmp_qualifications egq
                  ON egq.employee_id =
                     era.employee_id
                 AND egq.qualification_id =
                     q.qualification_id

                WHERE era.employee_id =
                      :employee_id

                  AND era.active = true
                  AND era.is_primary = true

                  AND q.qualification_code =
                      :qualification_code

                LIMIT 1
                """
            ),
            {
                "employee_id":
                    employee_id,

                "qualification_code":
                    qualification_code,
            },
        ).mappings().first()

        authorized = bool(
            evaluation
            and evaluation["authorized"]
        )

        reason = (
            evaluation["reason"]
            if evaluation
            else
            "Controlled-zone evaluation unavailable."
        )

        db.execute(
            text(
                """
                INSERT INTO security.employee_access_authorizations (
                    employee_id,
                    zone_id,
                    authorization_status,
                    authorization_source,
                    effective_from,
                    reason,
                    last_evaluated_at
                )

                SELECT
                    :employee_id,
                    z.zone_id,
                    :authorization_status,
                    'AUTOMATIC',
                    now(),
                    :reason,
                    now()

                FROM security.access_zones z

                WHERE z.site_code =
                      'PHARMA-001'

                  AND z.zone_code =
                      :zone_code

                ON CONFLICT (
                    employee_id,
                    zone_id
                )
                DO UPDATE SET
                    authorization_status =
                        EXCLUDED.authorization_status,

                    authorization_source =
                        'AUTOMATIC',

                    reason =
                        EXCLUDED.reason,

                    last_evaluated_at =
                        now(),

                    updated_at =
                        now()
                """
            ),
            {
                "employee_id":
                    employee_id,

                "zone_code":
                    zone_code,

                "authorization_status":
                    (
                        "AUTHORIZED"
                        if authorized
                        else "DENIED"
                    ),

                "reason":
                    reason,
            },
        )

    db.commit()

    return get_security_employee(
        db,
        employee_id,
    )        
