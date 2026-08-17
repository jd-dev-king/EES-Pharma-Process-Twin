from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class HealthResponse(BaseModel):
    status: str; app: str; version: str; database: str

class MaterialRequirementCreate(BaseModel):
    material_code: str
    material_name: str
    required_quantity: float = Field(gt=0)
    unit: str

class ProductionOrderCreate(BaseModel):
    po_number: str = ""
    batch_number: str = ""
    material_number: str = "PC-1308"
    product_name: str = Field(min_length=3, max_length=200)
    quantity: int = Field(gt=0)
    priority: str = "Normal"
    destination: str = "Chem Weigh Staging"
    materials: list[MaterialRequirementCreate] = []
    weigh_room: str = "WR-01"
    mix_tank: str = "V-201"
    hold_tank: str = "H-301"
    packaging_line: str = "PKG-01"
    requires_premix: bool = False
    flavor: str = "Cherry"
    dye: str = "FD&C Red No. 40"
    bulk_material: str = "Propylene Glycol"

class ProductionOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; po_number: str; batch_number: str; material_number: str; product_name: str; quantity: int; status: str
    weigh_room: str; mix_tank: str; hold_tank: str; packaging_line: str; requires_premix: bool; bulk_material: str; created_at: datetime

class MaterialRequirementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; po_number: str; material_code: str; material_name: str; required_quantity: float; unit: str
    assigned_lot: str | None; status: str

class InventoryLotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; material_code: str; material_name: str; lot_number: str; quantity: float; reserved_quantity: float
    unit: str; location: str; qa_status: str; expiration_date: str

class MaterialComparison(BaseModel):
    material_code: str; material_name: str; required_quantity: float; unit: str
    available_quantity: float; released_quantity: float; status: str; recommended_lot: str | None; warning: str | None
    recommended_substitute_material_code: str | None = None
    recommended_substitute_material_name: str | None = None
    recommended_substitute_lot: str | None = None
    recommended_substitute_available: float | None = None

class ProductionOrderWorkspace(BaseModel):
    production_order: ProductionOrderRead
    requirements: list[MaterialRequirementRead]
    comparison: list[MaterialComparison]
    ready_for_release: bool

class WarehouseTransferOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; to_number: str; po_number: str; priority: str; destination: str; status: str
    owner: str; progress: int; blocker: str | None; created_at: datetime

class WarehouseAction(BaseModel):
    operator: str = "Warehouse Operator"

class SubstitutionRequestCreate(BaseModel):
    po_number: str; material_code: str; proposed_lot: str; reason: str

class SubstitutionDecision(BaseModel):
    approved: bool; decision_note: str = ""

class SubstitutionRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; request_id: str; po_number: str; material_code: str; current_lot: str | None
    proposed_lot: str; reason: str; status: str; decision_note: str | None; created_at: datetime


class MaterialPRLineCreate(BaseModel):
    po_number: str | None = None
    material_code: str
    material_name: str
    lot_number: str
    requested_quantity: float = Field(gt=0)
    unit: str
    source_location: str
    hazard_class: str = "General"

class MaterialPRCreate(BaseModel):
    po_number: str
    campaign_id: str | None = None
    operator: str = "Weigh Technician"
    lines: list[MaterialPRLineCreate] = []

class MaterialPRRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; pr_number: str; po_number: str; campaign_id: str | None = None; requested_by: str; weigh_room: str; status: str; destination: str; created_at: datetime

class MaterialPRLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; pr_number: str; po_number: str | None = None; material_code: str; material_name: str; lot_number: str; requested_quantity: float; picked_quantity: float; unit: str; source_location: str; hazard_class: str; pick_sequence: int; status: str

class MaterialPRWorkspace(BaseModel):
    pr: MaterialPRRead
    lines: list[MaterialPRLineRead]

class MaterialPositionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; container_id: str; material_code: str; material_name: str; lot_number: str; quantity: float; unit: str; location_code: str; status: str; hazard_class: str; campaign_id: str | None = None; po_number: str | None; pr_number: str | None; updated_at: datetime

class MaterialMovementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; movement_id: str; container_id: str; material_code: str; lot_number: str; quantity: float; unit: str; from_location: str; to_location: str; movement_type: str; operator: str; po_number: str | None; pr_number: str | None; created_at: datetime

class MaterialMoveRequest(BaseModel):
    container_id: str
    operator: str = "Weigh Technician"
    room_code: str | None = None
    po_number: str | None = None

class TrainingSessionCreate(BaseModel): role: str; difficulty: str = "Beginner"
class TrainingStepComplete(BaseModel):
    correct: bool = True
    note: str = ""
class TrainingSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; session_id: str; role: str; difficulty: str; status: str; score: int; created_at: datetime
class PlatformEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; event_type: str; source: str; entity_type: str; entity_id: str; message: str; severity: str; created_at: datetime
class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; recipient: str; title: str; message: str; severity: str; is_read: bool; created_at: datetime
class SchedulerConflictRequest(BaseModel): weigh_room: str; mix_tank: str; hold_tank: str; packaging_line: str
class SchedulerConflict(BaseModel): resource_type: str; resource_id: str; conflicting_po: str; message: str
class SchedulerConflictResponse(BaseModel): available: bool; conflicts: list[SchedulerConflict]


class WeighRoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; room_code: str; name: str; status: str; scale_id: str; scale_status: str; calibration_due: str; active_po: str | None

class BendIntoRoomRequest(BaseModel):
    po_number: str; room_code: str; operator: str

class WeighTicketCreate(BaseModel):
    po_number: str; room_code: str; operator: str

class WeighTicketLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; ticket_number: str; material_code: str; material_name: str; lot_number: str
    target_quantity: float; actual_quantity: float | None; unit: str; tolerance: float
    barcode_verified: bool; status: str
    scale_type: str = "Bench Scale"
    container_id: str | None = None
    tare_weight: float = 0
    gross_weight: float | None = None

class WeighTicketRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; ticket_number: str; po_number: str; batch_number: str; room_code: str; operator: str
    status: str; tare_confirmed: bool; signature: str | None; current_material_index: int; created_at: datetime

class WeighTicketWorkspace(BaseModel):
    ticket: WeighTicketRead
    lines: list[WeighTicketLineRead]
    current_line: WeighTicketLineRead | None
    completion_percent: int

class BarcodeVerification(BaseModel): barcode: str
class TareConfirmation(BaseModel): operator: str
class WeighMaterialRequest(BaseModel): actual_quantity: float = Field(gt=0); operator: str
class ElectronicSignature(BaseModel): signature: str = Field(min_length=3)



class CampaignCreate(BaseModel):
    po_numbers: list[str] = Field(min_length=1, max_length=4)

class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; campaign_id: str; material_number: str; po_numbers: str; status: str; locked: bool = True; accepted_by: str | None = None; accepted_at: datetime | None = None; created_at: datetime

class CampaignAcceptRequest(BaseModel):
    operator: str = "Weigh Technician"

class CampaignSeparationCreate(BaseModel):
    po_number: str
    requester: str = "Weigh Technician"
    reason: str

class CampaignSeparationDecision(BaseModel):
    approved: bool
    decision_note: str = ""

class CampaignSeparationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; request_id: str; campaign_id: str; po_number: str; requested_by: str; reason: str; status: str; decision_note: str | None = None; created_at: datetime

class ProductionRunCreate(ProductionOrderCreate):
    campaign_size: int = Field(default=1, ge=1, le=4)

class ProductionRunRead(BaseModel):
    campaign: CampaignRead
    production_orders: list[ProductionOrderRead]

class ShortageRequest(BaseModel):
    po_number: str
    material_code: str
    material_name: str
    required_remaining: float
    available_quantity: float
    requester: str = "Weighing"

class MixRoomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    room_code: str
    name: str
    tank_code: str
    capacity_l: float
    status: str
    cip_status: str
    active_po: str | None
    plc_code: str


class HoldTankRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tank_code: str
    capacity_l: float
    status: str
    cip_status: str
    active_po: str | None
    level_percent: float
    qa_status: str
    batch_number: str | None
    product_name: str | None
    transferred_quantity: float
    source_mix_tank: str | None
    transfer_completed_at: datetime | None
    lims_sample_id: str | None


class MixBatchCreate(BaseModel):
    po_number: str
    room_code: str
    operator: str


class MixBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    batch_id: str
    po_number: str
    batch_number: str
    room_code: str
    tank_code: str
    operator: str
    status: str
    phase: str
    cleaning_type: str = "Full CIP"
    progress: int
    level_percent: float
    mass_kg: float
    temperature_c: float
    rpm: int
    agitator_command_rpm: int
    motor_load_percent: float
    vacuum_bar: float
    vessel_closed: bool
    readiness_verified: bool
    requires_premix: bool
    premix_status: str
    manual_adds_confirmed: bool
    selected_hold_tank: str | None
    sample_collected: bool
    fault_code: str | None
    fault_message: str | None
    fault_diagnosed: bool
    created_at: datetime


class PremixRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    run_id: str
    mix_batch_id: str
    status: str
    progress: int
    level_percent: float
    rpm: int
    operator_confirmed: bool
    premix_water_kg: float = 0
    rinse_water_kg: float = 0


class MixWorkspace(BaseModel):
    batch: MixBatchRead
    premix: PremixRunRead | None
    hold_tanks: list[HoldTankRead]
    available_actions: list[str]
    materials: list[dict] = []
    bulk_readiness: list[dict] = []
    readiness_passed: bool = False


class QABulkTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: str
    po_number: str
    batch_number: str
    product_name: str
    hold_tank: str
    sample_id: str
    status: str
    disposition: str | None
    disposition_note: str | None
    created_at: datetime
    decided_at: datetime | None


class QADisposition(BaseModel):
    disposition: str
    note: str = ""


class OperatorAction(BaseModel):
    operator: str = "Process Engineer"


class HoldTankSelection(BaseModel):
    hold_tank: str


class RouteChangeCreate(BaseModel):
    po_number: str
    resource_type: str
    current_resource: str
    requested_resource: str
    reason: str
    requester: str


class RouteChangeDecision(BaseModel):
    approved: bool


class RouteChangeRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    request_id: str
    po_number: str
    resource_type: str
    current_resource: str
    requested_resource: str
    reason: str
    requester: str
    status: str
    created_at: datetime



class RnDMaterialSelection(BaseModel):
    material_code: str
    material_name: str
    quantity: float = Field(gt=0)
    unit: str = "kg"
    role: str = "manual"
    source: str = "approved"

class RnDBulkSelection(BaseModel):
    tank_code: str
    material_code: str
    material_name: str
    quantity_kg: float = Field(gt=0)

class RnDProcessDefinition(BaseModel):
    agitation_rpm: int = Field(default=120, ge=0, le=2000)
    agitation_minutes: int = Field(default=10, ge=1, le=240)
    premix_rpm: int = Field(default=850, ge=0, le=2000)
    premix_minutes: int = Field(default=5, ge=0, le=120)
    vacuum_required: bool = False
    target_temperature_c: float = Field(default=22, ge=0, le=100)
    addition_sequence: list[str] = []

class RnDSampleBatchCreate(BaseModel):
    formula_name: str = "Development Formula"
    flavor: str = "Cherry"
    dye: str = "None"
    scale_l: float = Field(default=10, gt=0, le=500)
    materials: list[RnDMaterialSelection] = []
    bulks: list[RnDBulkSelection] = []
    process: RnDProcessDefinition = RnDProcessDefinition()

class RnDSampleBatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    sample_batch_id: str
    test_po_number: str | None = None
    formula_code: str | None = None
    formula_name: str | None = None
    product_name: str
    flavor: str
    dye: str
    scale_l: float
    status: str
    disposition: str = "Draft"
    revision_no: int = 1
    test_result: str | None
    lab_stage: str = "R&D Material Request"
    agitation_rpm: int = 120
    agitation_minutes: int = 10
    materials_json: str = "[]"
    bulk_json: str = "[]"
    process_json: str = "{}"
    promoted_material_number: str | None = None
    created_at: datetime

class RnDSampleDecision(BaseModel):
    result: str = ""


class PackagingLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    line_code: str
    name: str
    status: str
    cip_status: str
    active_po: str | None
    plc_code: str
    rated_speed_bpm: int

class PackagingRunCreate(BaseModel):
    po_number: str
    line_code: str
    operator: str

class PackagingRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    run_id: str
    po_number: str
    batch_number: str
    line_code: str
    hold_tank: str
    operator: str
    status: str
    progress: int
    bottles_completed: int
    cases_staged: int
    rejects: int
    speed_bpm: int
    jam_code: str | None
    fault_message: str | None
    fault_diagnosed: bool
    fg_sample_id: str | None
    fault_sequence_index: int
    fault_count: int
    downtime_minutes: float
    created_at: datetime

class PackagingWorkspace(BaseModel):
    run: PackagingRunRead
    line: PackagingLineRead
    available_actions: list[str]

class QAFinishedGoodsTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: str
    po_number: str
    batch_number: str
    product_name: str
    packaging_line: str
    sample_id: str
    quantity: int
    status: str
    disposition: str | None
    disposition_note: str | None
    created_at: datetime
    decided_at: datetime | None


class PackagingDowntimeEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    event_id: str
    run_id: str
    line_code: str
    fault_code: str
    category: str
    message: str
    status: str
    started_at: datetime
    ended_at: datetime | None
    duration_minutes: float
    root_cause: str | None
    corrective_action: str | None

class MaintenanceWorkOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    work_order_id: str
    asset_code: str
    source_event_id: str | None
    priority: str
    status: str
    problem_description: str
    assigned_to: str
    resolution: str | None
    created_at: datetime
    completed_at: datetime | None

class MaintenanceWorkOrderAction(BaseModel):
    action: str
    technician: str = "Maintenance Technician"
    resolution: str = ""

class PackagingReliabilityKPI(BaseModel):
    total_faults: int
    total_downtime_minutes: float
    mtbf_minutes: float
    mttr_minutes: float
    availability_percent: float
    pareto: list[dict]


class CIPRunCreate(BaseModel):
    asset_type: str
    asset_code: str
    operator: str = "Maintenance Technician"
    cleaning_type: str = "Full CIP"

class CIPRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    cip_id: str
    asset_type: str
    asset_code: str
    operator: str
    status: str
    phase: str
    cleaning_type: str = "Full CIP"
    progress: int
    fault_code: str | None
    fault_message: str | None
    fault_diagnosed: bool
    signature: str | None
    created_at: datetime
    completed_at: datetime | None

class CIPSignature(BaseModel):
    # Blank during tick/diagnose/reset; final verification is enforced in the service layer.
    signature: str = Field(default="", max_length=120)

class ShipmentCreate(BaseModel):
    po_number: str
    carrier: str
    dock: str
    pickup_date: str
    pickup_time: str

class ShipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    shipment_id: str
    po_number: str
    carrier: str
    dock: str
    pickup_date: str
    pickup_time: str
    status: str
    pallets_loaded: int
    trailer_seal: str | None
    bol_number: str | None
    signature: str | None
    created_at: datetime
    shipped_at: datetime | None

class ShipmentAction(BaseModel):
    operator: str = "Warehouse Operator"
    seal_number: str = ""
    signature: str = ""


class BatchReviewDecision(BaseModel):
    decision: str
    reviewer: str
    signature: str
    note: str = ""

class BatchReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    review_id: str
    po_number: str
    status: str
    reviewer: str | None
    signature: str | None
    decision: str | None
    review_note: str | None
    exception_count: int
    created_at: datetime
    reviewed_at: datetime | None

class AuditTrailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    audit_id: str
    po_number: str
    entity_type: str
    entity_id: str
    action: str
    field_name: str | None
    before_value: str | None
    after_value: str | None
    reason: str
    actor: str
    signature: str | None
    created_at: datetime

class EBRException(BaseModel):
    category: str
    source: str
    description: str
    severity: str
    status: str
    timestamp: datetime | None = None

class EBRBatchSummary(BaseModel):
    po_number: str
    batch_number: str
    product_name: str
    status: str
    quantity: int
    yield_percent: float
    rejects: int
    downtime_minutes: float
    exception_count: int
    review_status: str
    shipment_status: str
    created_at: datetime

class EBRBatchDetail(BaseModel):
    summary: EBRBatchSummary
    timeline: list[PlatformEventRead]
    exceptions: list[EBRException]
    audit_trail: list[AuditTrailRead]
    alcoa_plus: dict[str, bool]


class BulkTankRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:int; tank_code:str; material_code:str; material_name:str; capacity_kg:float; quantity_kg:float; qa_status:str; lot_number:str|None; temperature_c:float; status:str
class BulkDeliveryCreate(BaseModel):
    material_code:str="PG"; material_name:str="Propylene Glycol"; vendor:str; carrier:str="Vendor Tanker"; quantity_kg:float=Field(gt=0); receiving_bay:str="BAY-01"; tank_code:str="PG-101"; delivery_window:str; lot_number:str; coa_number:str; seal_number:str; temperature_c:float=22
class BulkDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:int; delivery_id:str; material_code:str; material_name:str; vendor:str; carrier:str; quantity_kg:float; receiving_bay:str; tank_code:str; delivery_window:str; lot_number:str; coa_number:str; seal_number:str; temperature_c:float; status:str; inspection_verified:bool; unload_progress:int; sample_id:str|None; qa_disposition:str|None; created_at:datetime
class BulkInspection(BaseModel):
    tanker_verified:bool; material_verified:bool; seal_intact:bool; coa_verified:bool; temperature_accepted:bool
class BulkDisposition(BaseModel): disposition:str
class BulkTankReset(BaseModel):
    operator: str = "Bulk Operations"
    reason: str = "Reset tank for demo retest"
class BulkTransferCreate(BaseModel):
    po_number:str; source_tank:str="PG-101"; destination_tank:str; quantity_kg:float=Field(gt=0); operator:str="Process Operator"
class BulkTransferVerify(BaseModel): identity_verified:bool; qa_release_verified:bool; hose_connected:bool
class BulkTransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:int; transfer_id:str; po_number:str; source_tank:str; destination_tank:str; material_code:str; quantity_kg:float; operator:str; identity_verified:bool; qa_release_verified:bool; hose_connected:bool; status:str; progress:int; fault_code:str|None; fault_message:str|None; fault_diagnosed:bool; created_at:datetime; completed_at:datetime|None


class DemoResetRequest(BaseModel):
    operator: str = Field(default="Demo Administrator", min_length=3, max_length=120)
    reason: str = Field(default="Reset demonstration environment", min_length=3, max_length=300)
    confirmation: str = Field(min_length=5, max_length=40)

class DemoResetResponse(BaseModel):
    status: str
    message: str
    operator: str
