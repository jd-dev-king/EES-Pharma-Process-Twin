from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProductionOrder(Base):
    __tablename__ = "production_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    po_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    batch_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    product_name: Mapped[str] = mapped_column(String(200))
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(40), default="Registered")
    weigh_room: Mapped[str] = mapped_column(String(30), default="WR-01")
    mix_tank: Mapped[str] = mapped_column(String(30), default="V-201")
    hold_tank: Mapped[str] = mapped_column(String(30), default="H-301")
    packaging_line: Mapped[str] = mapped_column(String(30), default="PKG-01")
    requires_premix: Mapped[bool] = mapped_column(Boolean, default=False)
    bulk_material: Mapped[str] = mapped_column(String(80), default="Propylene Glycol")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class MaterialRequirement(Base):
    __tablename__ = "material_requirements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    material_code: Mapped[str] = mapped_column(String(50), index=True)
    material_name: Mapped[str] = mapped_column(String(160))
    required_quantity: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(20))
    assigned_lot: Mapped[str | None] = mapped_column(String(60), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="Pending Allocation")


class InventoryLot(Base):
    __tablename__ = "inventory_lots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    material_code: Mapped[str] = mapped_column(String(50), index=True)
    material_name: Mapped[str] = mapped_column(String(160))
    lot_number: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    quantity: Mapped[float] = mapped_column(Float)
    reserved_quantity: Mapped[float] = mapped_column(Float, default=0)
    unit: Mapped[str] = mapped_column(String(20))
    location: Mapped[str] = mapped_column(String(80))
    qa_status: Mapped[str] = mapped_column(String(30), default="Released")
    expiration_date: Mapped[str] = mapped_column(String(20))


class WarehouseTransferOrder(Base):
    __tablename__ = "warehouse_transfer_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    to_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    priority: Mapped[str] = mapped_column(String(20), default="Normal")
    destination: Mapped[str] = mapped_column(String(100), default="Weighing Staging")
    status: Mapped[str] = mapped_column(String(40), default="Pending")
    owner: Mapped[str] = mapped_column(String(80), default="Warehouse Queue")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    blocker: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SubstitutionRequest(Base):
    __tablename__ = "substitution_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    material_code: Mapped[str] = mapped_column(String(50))
    current_lot: Mapped[str | None] = mapped_column(String(60), nullable=True)
    proposed_lot: Mapped[str] = mapped_column(String(60))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="Pending")
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class TrainingSession(Base):
    __tablename__ = "training_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(80))
    difficulty: Mapped[str] = mapped_column(String(30), default="Beginner")
    status: Mapped[str] = mapped_column(String(30), default="In Progress")
    score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PlatformEvent(Base):
    __tablename__ = "platform_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    source: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str] = mapped_column(String(100), index=True)
    message: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="info")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    recipient: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="info")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WeighRoom(Base):
    __tablename__ = "weigh_rooms"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(40), default="Available")
    scale_id: Mapped[str] = mapped_column(String(40))
    scale_status: Mapped[str] = mapped_column(String(40), default="Calibration Valid")
    calibration_due: Mapped[str] = mapped_column(String(20))
    active_po: Mapped[str | None] = mapped_column(String(50), nullable=True)


class WeighTicket(Base):
    __tablename__ = "weigh_tickets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    batch_number: Mapped[str] = mapped_column(String(50), index=True)
    room_code: Mapped[str] = mapped_column(String(30), index=True)
    operator: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(40), default="Pending Tare")
    tare_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    signature: Mapped[str | None] = mapped_column(String(120), nullable=True)
    current_material_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WeighTicketLine(Base):
    __tablename__ = "weigh_ticket_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ticket_number: Mapped[str] = mapped_column(String(50), index=True)
    material_code: Mapped[str] = mapped_column(String(50), index=True)
    material_name: Mapped[str] = mapped_column(String(160))
    lot_number: Mapped[str] = mapped_column(String(60))
    target_quantity: Mapped[float] = mapped_column(Float)
    actual_quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(20))
    tolerance: Mapped[float] = mapped_column(Float, default=0.02)
    barcode_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(40), default="Pending")


class MixRoom(Base):
    __tablename__ = "mix_rooms"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    tank_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    capacity_l: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(40), default="Available")
    cip_status: Mapped[str] = mapped_column(String(40), default="Clean / Available")
    active_po: Mapped[str | None] = mapped_column(String(50), nullable=True)
    plc_code: Mapped[str] = mapped_column(String(40))


class HoldTank(Base):
    __tablename__ = "hold_tanks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tank_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    capacity_l: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(40), default="Available")
    cip_status: Mapped[str] = mapped_column(String(40), default="Clean / Available")
    active_po: Mapped[str | None] = mapped_column(String(50), nullable=True)
    level_percent: Mapped[float] = mapped_column(Float, default=0)
    qa_status: Mapped[str] = mapped_column(String(40), default="Not Applicable")
    batch_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    product_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    transferred_quantity: Mapped[float] = mapped_column(Float, default=0)
    source_mix_tank: Mapped[str | None] = mapped_column(String(30), nullable=True)
    transfer_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lims_sample_id: Mapped[str | None] = mapped_column(String(60), nullable=True)


class MixBatch(Base):
    __tablename__ = "mix_batches"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    batch_number: Mapped[str] = mapped_column(String(50), index=True)
    room_code: Mapped[str] = mapped_column(String(30), index=True)
    tank_code: Mapped[str] = mapped_column(String(30), index=True)
    operator: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), default="Queued")
    phase: Mapped[str] = mapped_column(String(60), default="Ready")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    level_percent: Mapped[float] = mapped_column(Float, default=0)
    mass_kg: Mapped[float] = mapped_column(Float, default=0)
    temperature_c: Mapped[float] = mapped_column(Float, default=22)
    rpm: Mapped[int] = mapped_column(Integer, default=0)
    requires_premix: Mapped[bool] = mapped_column(Boolean, default=False)
    bulk_material: Mapped[str] = mapped_column(String(80), default="Propylene Glycol")
    premix_status: Mapped[str] = mapped_column(String(40), default="Not Required")
    manual_adds_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    selected_hold_tank: Mapped[str | None] = mapped_column(String(30), nullable=True)
    sample_collected: Mapped[bool] = mapped_column(Boolean, default=False)
    fault_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fault_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    fault_diagnosed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PremixRun(Base):
    __tablename__ = "premix_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    mix_batch_id: Mapped[str] = mapped_column(String(50), index=True)
    status: Mapped[str] = mapped_column(String(40), default="Not Started")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    level_percent: Mapped[float] = mapped_column(Float, default=0)
    rpm: Mapped[int] = mapped_column(Integer, default=0)
    operator_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)


class QABulkTask(Base):
    __tablename__ = "qa_bulk_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    batch_number: Mapped[str] = mapped_column(String(50), index=True)
    product_name: Mapped[str] = mapped_column(String(200))
    hold_tank: Mapped[str] = mapped_column(String(30), index=True)
    sample_id: Mapped[str] = mapped_column(String(60), index=True)
    status: Mapped[str] = mapped_column(String(40), default="Pending Review")
    disposition: Mapped[str | None] = mapped_column(String(30), nullable=True)
    disposition_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RouteChangeRequest(Base):
    __tablename__ = "route_change_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    resource_type: Mapped[str] = mapped_column(String(40))
    current_resource: Mapped[str] = mapped_column(String(40))
    requested_resource: Mapped[str] = mapped_column(String(40))
    reason: Mapped[str] = mapped_column(Text)
    requester: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="Pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PackagingLine(Base):
    __tablename__ = "packaging_lines"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    line_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(40), default="Available")
    cip_status: Mapped[str] = mapped_column(String(40), default="Clean / Available")
    active_po: Mapped[str | None] = mapped_column(String(50), nullable=True)
    plc_code: Mapped[str] = mapped_column(String(40))
    rated_speed_bpm: Mapped[int] = mapped_column(Integer, default=120)


class PackagingRun(Base):
    __tablename__ = "packaging_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    batch_number: Mapped[str] = mapped_column(String(50), index=True)
    line_code: Mapped[str] = mapped_column(String(30), index=True)
    hold_tank: Mapped[str] = mapped_column(String(30))
    operator: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), default="Ready")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    bottles_completed: Mapped[int] = mapped_column(Integer, default=0)
    cases_staged: Mapped[int] = mapped_column(Integer, default=0)
    rejects: Mapped[int] = mapped_column(Integer, default=0)
    speed_bpm: Mapped[int] = mapped_column(Integer, default=0)
    jam_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fault_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    fault_diagnosed: Mapped[bool] = mapped_column(Boolean, default=False)
    fg_sample_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    fault_sequence_index: Mapped[int] = mapped_column(Integer, default=0)
    fault_count: Mapped[int] = mapped_column(Integer, default=0)
    downtime_minutes: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PackagingDowntimeEvent(Base):
    __tablename__ = "packaging_downtime_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    run_id: Mapped[str] = mapped_column(String(50), index=True)
    line_code: Mapped[str] = mapped_column(String(30), index=True)
    fault_code: Mapped[str] = mapped_column(String(50))
    category: Mapped[str] = mapped_column(String(50))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="Open")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[float] = mapped_column(Float, default=0)
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrective_action: Mapped[str | None] = mapped_column(Text, nullable=True)


class MaintenanceWorkOrder(Base):
    __tablename__ = "maintenance_work_orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    work_order_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    asset_code: Mapped[str] = mapped_column(String(30), index=True)
    source_event_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="High")
    status: Mapped[str] = mapped_column(String(30), default="Open")
    problem_description: Mapped[str] = mapped_column(Text)
    assigned_to: Mapped[str] = mapped_column(String(100), default="Maintenance Technician")
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class QAFinishedGoodsTask(Base):
    __tablename__ = "qa_finished_goods_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    batch_number: Mapped[str] = mapped_column(String(50), index=True)
    product_name: Mapped[str] = mapped_column(String(200))
    packaging_line: Mapped[str] = mapped_column(String(30))
    sample_id: Mapped[str] = mapped_column(String(60), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(40), default="Pending Review")
    disposition: Mapped[str | None] = mapped_column(String(30), nullable=True)
    disposition_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CIPRun(Base):
    __tablename__ = "cip_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cip_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    asset_type: Mapped[str] = mapped_column(String(30), index=True)
    asset_code: Mapped[str] = mapped_column(String(30), index=True)
    operator: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(40), default="Ready")
    phase: Mapped[str] = mapped_column(String(40), default="Drain")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    fault_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fault_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    fault_diagnosed: Mapped[bool] = mapped_column(Boolean, default=False)
    signature: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Shipment(Base):
    __tablename__ = "shipments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shipment_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    carrier: Mapped[str] = mapped_column(String(80))
    dock: Mapped[str] = mapped_column(String(30))
    pickup_date: Mapped[str] = mapped_column(String(20))
    pickup_time: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(40), default="Scheduled")
    pallets_loaded: Mapped[int] = mapped_column(Integer, default=0)
    trailer_seal: Mapped[str | None] = mapped_column(String(60), nullable=True)
    bol_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    signature: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BatchReview(Base):
    __tablename__ = "batch_reviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    status: Mapped[str] = mapped_column(String(40), default="Pending Review")
    reviewer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    signature: Mapped[str | None] = mapped_column(String(120), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(30), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    exception_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditTrailEntry(Base):
    __tablename__ = "audit_trail_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    audit_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str] = mapped_column(String(100), index=True)
    action: Mapped[str] = mapped_column(String(100))
    field_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    before_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String(120))
    signature: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class BulkTank(Base):
    __tablename__ = "bulk_tanks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tank_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    material_code: Mapped[str] = mapped_column(String(50), index=True)
    material_name: Mapped[str] = mapped_column(String(160))
    capacity_kg: Mapped[float] = mapped_column(Float)
    quantity_kg: Mapped[float] = mapped_column(Float, default=0)
    qa_status: Mapped[str] = mapped_column(String(30), default="Empty")
    lot_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    temperature_c: Mapped[float] = mapped_column(Float, default=22)
    status: Mapped[str] = mapped_column(String(40), default="Available")

class BulkDelivery(Base):
    __tablename__ = "bulk_deliveries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    delivery_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    material_code: Mapped[str] = mapped_column(String(50), index=True)
    material_name: Mapped[str] = mapped_column(String(160))
    vendor: Mapped[str] = mapped_column(String(160))
    carrier: Mapped[str] = mapped_column(String(120))
    quantity_kg: Mapped[float] = mapped_column(Float)
    receiving_bay: Mapped[str] = mapped_column(String(30))
    tank_code: Mapped[str] = mapped_column(String(30))
    delivery_window: Mapped[str] = mapped_column(String(80))
    lot_number: Mapped[str] = mapped_column(String(60))
    coa_number: Mapped[str] = mapped_column(String(80))
    seal_number: Mapped[str] = mapped_column(String(80))
    temperature_c: Mapped[float] = mapped_column(Float, default=22)
    status: Mapped[str] = mapped_column(String(50), default="Scheduled")
    inspection_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    unload_progress: Mapped[int] = mapped_column(Integer, default=0)
    sample_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    qa_disposition: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

class BulkTransfer(Base):
    __tablename__ = "bulk_transfers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transfer_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(50), index=True)
    source_tank: Mapped[str] = mapped_column(String(30))
    destination_tank: Mapped[str] = mapped_column(String(30))
    material_code: Mapped[str] = mapped_column(String(50))
    quantity_kg: Mapped[float] = mapped_column(Float)
    operator: Mapped[str] = mapped_column(String(100))
    identity_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    qa_release_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    hose_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(50), default="Awaiting Verification")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    fault_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    fault_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    fault_diagnosed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
