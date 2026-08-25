export interface HealthResponse{status:string;app:string;version:string;database:string}
export interface ProductionOrder{id:number;po_number:string;batch_number:string;material_number:string;product_name:string;quantity:number;status:string;weigh_room:string;mix_tank:string;hold_tank:string;packaging_line:string;requires_premix:boolean;bulk_material:string;created_at:string}
export interface MaterialComparison{material_code:string;material_name:string;required_quantity:number;unit:string;available_quantity:number;released_quantity:number;status:string;recommended_lot:string|null;warning:string|null;recommended_substitute_material_code:string|null;recommended_substitute_material_name:string|null;recommended_substitute_lot:string|null;recommended_substitute_available:number|null}
export interface MaterialRequirement{id:number;po_number:string;material_code:string;material_name:string;required_quantity:number;unit:string;assigned_lot:string|null;status:string}
export interface ProductionOrderWorkspace{production_order:ProductionOrder;requirements:MaterialRequirement[];comparison:MaterialComparison[];ready_for_release:boolean}
export interface InventoryLot{id:number;material_code:string;material_name:string;lot_number:string;quantity:number;reserved_quantity:number;unit:string;location:string;qa_status:string;expiration_date:string}
export interface WarehouseTransferOrder{id:number;to_number:string;po_number:string;priority:string;destination:string;status:string;owner:string;progress:number;blocker:string|null;created_at:string}
export interface SubstitutionRequest{id:number;request_id:string;po_number:string;material_code:string;current_lot:string|null;proposed_lot:string;reason:string;status:string;decision_note:string|null;created_at:string}
export interface TrainingSession{id:number;session_id:string;role:string;difficulty:string;status:string;score:number;created_at:string}
export interface ProductionOrderPayload{po_number:string;batch_number:string;material_number:string;product_name:string;quantity:number;priority:string;destination:string;weigh_room:string;mix_tank:string;hold_tank:string;packaging_line:string;requires_premix:boolean;flavor:string;dye:string;bulk_material:string}
export interface PlatformEvent{id:number;event_type:string;source:string;entity_type:string;entity_id:string;message:string;severity:string;created_at:string}
export interface NotificationRecord{id:number;recipient:string;title:string;message:string;severity:string;is_read:boolean;created_at:string}
export interface SchedulerConflictPayload{weigh_room:string;mix_tank:string;hold_tank:string;packaging_line:string}
export interface SchedulerConflict{resource_type:string;resource_id:string;conflicting_po:string;message:string}
export interface SchedulerConflictResponse{available:boolean;conflicts:SchedulerConflict[]}

export interface WeighRoom{id:number;room_code:string;name:string;status:string;scale_id:string;scale_status:string;calibration_due:string;active_po:string|null}
export interface WeighTicket{id:number;ticket_number:string;po_number:string;batch_number:string;room_code:string;operator:string;status:string;tare_confirmed:boolean;signature:string|null;current_material_index:number;created_at:string}
export interface WeighTicketLine{id:number;ticket_number:string;material_code:string;material_name:string;lot_number:string;target_quantity:number;actual_quantity:number|null;unit:string;tolerance:number;barcode_verified:boolean;status:string;scale_type:string;container_id:string|null;tare_weight:number;gross_weight:number|null}
export interface WeighTicketWorkspace{ticket:WeighTicket;lines:WeighTicketLine[];current_line:WeighTicketLine|null;completion_percent:number}

export interface MixRoom{id:number;room_code:string;name:string;tank_code:string;capacity_l:number;status:string;cip_status:string;active_po:string|null;plc_code:string}
export interface HoldTank{id:number;tank_code:string;capacity_l:number;status:string;cip_status:string;active_po:string|null;level_percent:number;qa_status:string;batch_number:string|null;product_name:string|null;transferred_quantity:number;source_mix_tank:string|null;transfer_completed_at:string|null;lims_sample_id:string|null}
export interface MixBatch{id:number;batch_id:string;po_number:string;batch_number:string;room_code:string;tank_code:string;operator:string;status:string;phase:string;progress:number;level_percent:number;mass_kg:number;temperature_c:number;rpm:number;agitator_command_rpm:number;motor_load_percent:number;vacuum_bar:number;vessel_closed:boolean;readiness_verified:boolean;requires_premix:boolean;premix_status:string;manual_adds_confirmed:boolean;selected_hold_tank:string|null;sample_collected:boolean;fault_code:string|null;fault_message:string|null;fault_diagnosed:boolean;created_at:string}
export interface PremixRun{id:number;run_id:string;mix_batch_id:string;status:string;progress:number;level_percent:number;rpm:number;operator_confirmed:boolean;premix_water_kg:number;rinse_water_kg:number}
export interface BatchMaterialGenealogy{batch_number:string;material_code:string;material_name:string;material_lot:string|null;required_quantity:number;actual_quantity:number|null;unit_of_measure:string;weighing_status:string}
export interface BulkReadiness{material:string;tank_code:string;source_type?:string;required_quantity:number;available_quantity:number|null;qa_status:string;equipment_status:string;ready:boolean;reason:string}
export interface MixWorkspace{batch:MixBatch;premix:PremixRun|null;hold_tanks:HoldTank[];available_actions:string[];materials:BatchMaterialGenealogy[];bulk_readiness:BulkReadiness[];readiness_passed:boolean}
export interface RouteChangeRequest{id:number;request_id:string;po_number:string;resource_type:string;current_resource:string;requested_resource:string;reason:string;requester:string;status:string;created_at:string}

export interface QABulkTask{id:number;task_id:string;po_number:string;batch_number:string;product_name:string;hold_tank:string;sample_id:string;status:string;disposition:string|null;disposition_note:string|null;created_at:string;decided_at:string|null}

export interface PackagingLine{id:number;line_code:string;name:string;status:string;cip_status:string;active_po:string|null;plc_code:string;rated_speed_bpm:number}
export interface PackagingRun{id:number;run_id:string;po_number:string;batch_number:string;line_code:string;hold_tank:string;operator:string;status:string;progress:number;bottles_completed:number;cases_staged:number;rejects:number;speed_bpm:number;jam_code:string|null;fault_message:string|null;fault_diagnosed:boolean;fg_sample_id:string|null;fault_sequence_index:number;fault_count:number;downtime_minutes:number;created_at:string}
export interface PackagingComponent{material_code:string;material_name:string;available_quantity:number;unit_of_measure:string}
export interface PackagingWorkspace{run:PackagingRun;line:PackagingLine;available_actions:string[];components:PackagingComponent[]}
export interface QAFinishedGoodsTask{id:number;task_id:string;po_number:string;batch_number:string;product_name:string;packaging_line:string;sample_id:string;quantity:number;status:string;disposition:string|null;disposition_note:string|null;created_at:string;decided_at:string|null}

export interface CIPRun{id:number;cip_id:string;asset_type:string;asset_code:string;operator:string;status:string;phase:string;progress:number;fault_code:string|null;fault_message:string|null;fault_diagnosed:boolean;signature:string|null;created_at:string;completed_at:string|null}
export interface Shipment{id:number;shipment_id:string;po_number:string;carrier:string;dock:string;pickup_date:string;pickup_time:string;status:string;pallets_loaded:number;trailer_seal:string|null;bol_number:string|null;signature:string|null;created_at:string;shipped_at:string|null}

export interface PackagingDowntimeEvent{id:number;event_id:string;run_id:string;line_code:string;fault_code:string;category:string;message:string;status:string;started_at:string;ended_at:string|null;duration_minutes:number;root_cause:string|null;corrective_action:string|null}
export interface MaintenanceWorkOrder{id:number;work_order_id:string;asset_code:string;source_event_id:string|null;priority:string;status:string;problem_description:string;assigned_to:string;resolution:string|null;created_at:string;completed_at:string|null}
export interface PackagingReliabilityKPI{total_faults:number;total_downtime_minutes:number;mtbf_minutes:number;mttr_minutes:number;availability_percent:number;pareto:{category:string;minutes:number;percent:number}[]}


export interface EBRException{category:string;source:string;description:string;severity:string;status:string;timestamp:string|null}
export interface EBRBatchSummary{po_number:string;batch_number:string;product_name:string;status:string;quantity:number;yield_percent:number;rejects:number;downtime_minutes:number;exception_count:number;review_status:string;shipment_status:string;created_at:string}
export interface AuditTrailEntry{id:number;audit_id:string;po_number:string;entity_type:string;entity_id:string;action:string;field_name:string|null;before_value:string|null;after_value:string|null;reason:string;actor:string;signature:string|null;created_at:string}
export interface BatchReview{id:number;review_id:string;po_number:string;status:string;reviewer:string|null;signature:string|null;decision:string|null;review_note:string|null;exception_count:number;created_at:string;reviewed_at:string|null}
export interface EBRBatchDetail{summary:EBRBatchSummary;timeline:PlatformEvent[];exceptions:EBRException[];audit_trail:AuditTrailEntry[];alcoa_plus:Record<string,boolean>}

export interface BulkTank{id:number;tank_code:string;material_code:string;material_name:string;capacity_kg:number;quantity_kg:number;qa_status:string;lot_number:string|null;temperature_c:number;status:string}
export interface BulkDelivery{id:number;delivery_id:string;material_code:string;material_name:string;vendor:string;carrier:string;quantity_kg:number;receiving_bay:string;tank_code:string;delivery_window:string;lot_number:string;coa_number:string;seal_number:string;temperature_c:number;status:string;inspection_verified:boolean;unload_progress:number;sample_id:string|null;qa_disposition:string|null;created_at:string}
export interface BulkTransfer{id:number;transfer_id:string;po_number:string;source_tank:string;destination_tank:string;material_code:string;quantity_kg:number;operator:string;identity_verified:boolean;qa_release_verified:boolean;hose_connected:boolean;status:string;progress:number;fault_code:string|null;fault_message:string|null;fault_diagnosed:boolean;created_at:string;completed_at:string|null}


export interface ParkingStatus {
  available: boolean;
  lot_code: string;
  lot_name: string;

  // Main secured 70-space lot
  total_spaces: number;
  occupied_spaces: number;
  available_spaces: number;
  occupancy_percent: number;

  secured_total_spaces: number;
  secured_occupied_spaces: number;
  secured_available_spaces: number;

  // 30-space secured overflow lot
  overflow_total_spaces: number;
  overflow_occupied_spaces: number;
  overflow_available_spaces: number;

  // Combined parking operation
  total_parking_capacity: number;
  total_parked: number;
  total_available_spaces: number;

  // Occupants
  employees: number;
  contractors: number;
  visitors: number;

  // Accelerated simulation
  auto_run_active: boolean;
  auto_run_phase: string;
  sim_day: string;
  sim_time: string;
  current_event: string;
  next_event: string;

  active_sessions: unknown[];
  overflow_sessions: unknown[];
  overflow_vehicles: string[];
}
export interface SecurityOccupant {
  vehicle_identifier: string;
  occupant_type: string;
  identity: string;
  space_number: string;
  entry_time: string;
}
export interface SecurityEvent {
  event_id: number;
  event_time: string;
  gate_id: string;
  vehicle_identifier: string | null;
  event_type: string;
  access_result: string;
  reason: string | null;
}
export interface SecurityStatus extends ParkingStatus {
  pending_reviews: number;
  approved_today: number;
  denied_today: number;
  visitor_ids_available: number;
  active_occupants: SecurityOccupant[];
  recent_events: SecurityEvent[];
}

// ============================================================
// Security Workforce / Controlled-Zone Access
// ============================================================

export interface SecurityEmployee {
  employee_id: number;
  employee_number: string;
  display_name: string;

  employment_type: string;
  employment_status: string;

  department_code: string | null;
  department_name: string | null;

  role_code: string | null;
  role_name: string | null;

  shift_code: string | null;
  shift_name: string | null;

  start_time: string | null;
  end_time: string | null;

  authorized_zones: number;
  denied_zones: number;
}

export interface SecuritySummary {
  active_employees: number;
  on_leave: number;
  inactive: number;

  controlled_authorized: number;
  controlled_denied: number;
}

export interface SecurityTrainingRecord {
  course_id: number;
  course_code: string;
  course_name: string;
  training_category: string | null;
  gmp_relevant: boolean;

  effective_status: string;

  completed_at: string | null;
  expires_at: string | null;
}

export interface SecurityQualification {
  qualification_id: number;
  qualification_code: string;
  qualification_name: string;

  qualification_status: string | null;
  qualification_basis: string | null;

  qualified_at: string | null;
  expires_at: string | null;

  notes: string | null;

  required: boolean;
  role_requirement_active: boolean;
}

export interface SecurityZoneAuthorization {
  zone_id: number;
  zone_code: string;
  zone_name: string;

  security_level: number;
  gmp_controlled: boolean;

  authorization_status: string;
  authorization_source: string;

  reason: string | null;
  last_evaluated_at: string | null;
}

export interface SecurityEmployeeDetail {
  employee: {
    employee_id: number;
    employee_number: string;
    display_name: string;

    employment_type: string;
    employment_status: string;

    commute_mode: string | null;

    department_code: string | null;
    department_name: string | null;

    role_code: string | null;
    role_name: string | null;
    role_level: string | null;

    shift_code: string | null;
    shift_name: string | null;

    start_time: string | null;
    end_time: string | null;

    on_call: boolean | null;
  };

  training: SecurityTrainingRecord[];
  qualifications: SecurityQualification[];
  zones: SecurityZoneAuthorization[];
}

export interface SecurityEmployeeListResponse {
  employees: SecurityEmployee[];
}


export interface FormulationOption{material_code:string;material_name:string;lots:string[]}
export interface FormulationOptions{flavors:FormulationOption[];dyes:FormulationOption[]}
export interface RnDSampleBatch{id:number;sample_batch_id:string;test_po_number:string|null;formula_code:string|null;formula_name:string|null;product_name:string;flavor:string;dye:string;scale_l:number;status:string;disposition:string;revision_no:number;test_result:string|null;lab_stage:string;agitation_rpm:number;agitation_minutes:number;materials_json:string;bulk_json:string;process_json:string;promoted_material_number:string|null;created_at:string}
export interface RnDMaterialCatalogItem{material_code:string;material_name:string;material_type:string;unit_of_measure:string;qualification_status:string;target_material_code?:string}
export interface RnDBulkOption{tank_code:string;material_code:string;material_name:string;capacity_kg:number;quantity_kg:number;qa_status:string;status:string}
export interface RnDMaterialCatalog{materials:RnDMaterialCatalogItem[];candidates:RnDMaterialCatalogItem[];bulks:RnDBulkOption[]}

export interface FormulationVariant{material_number:string;name:string;flavor:string;dyes:string[]}
export interface MESExecutionEvent{event_id:number;po_number:string;event_type:string;phase:string;equipment_id:string|null;operator_id:string|null;material_code:string|null;material_name:string|null;lot_number:string|null;quantity:number|null;unit:string|null;metric:string|null;value:number|null;message:string;severity:string;qualified:boolean;event_timestamp:string}
export interface MESBatchRecord{po_number:string;events:MESExecutionEvent[];summary:Record<string,unknown>}

export interface ProductionCampaign{id:number;campaign_id:string;material_number:string;po_numbers:string;status:string;locked:boolean;accepted_by:string|null;accepted_at:string|null;created_at:string}
export interface CampaignSeparationRequest{id:number;request_id:string;campaign_id:string;po_number:string;requested_by:string;reason:string;status:string;decision_note:string|null;created_at:string}
export interface CampaignInventoryRequirement{material_code:string;material_name:string;unit:string;campaign_required:number;staged_available:number;remaining_to_request:number;hazard_class:string}
export interface CampaignPlantInventory{campaign:{campaign_id:string;material_number:string;po_numbers:string[];status:string;locked:boolean;accepted_by:string|null};requirements:Array<CampaignInventoryRequirement & {warehouse_available:number}>;staging:Array<{container_id:string;material_code:string;material_name:string;lot_number:string;quantity:number;unit:string;location_code:string;hazard_class:string;status:string}>;required_warehouse:InventoryLot[];approved_substitutes:Record<string,Array<{material_code:string;material_name:string;internal_lot_number:string;available_quantity:number;unit_of_measure:string;expiry_date:string|null}>>;warehouse:InventoryLot[];rnd_candidates:Array<{candidate_code:string;candidate_name:string;target_material_code:string;approval_status:string}>}
export interface ProductionRunResponse{campaign:ProductionCampaign;production_orders:ProductionOrder[]}

export interface MaterialPR{id:number;pr_number:string;po_number:string;campaign_id:string|null;requested_by:string;weigh_room:string;status:string;destination:string;created_at:string}
export interface MaterialPRLine{id:number;pr_number:string;po_number:string|null;material_code:string;material_name:string;lot_number:string;requested_quantity:number;picked_quantity:number;unit:string;source_location:string;hazard_class:string;pick_sequence:number;status:string}
export interface MaterialPRLineDraft{po_number?:string|null;material_code:string;material_name:string;lot_number:string;requested_quantity:number;unit:string;source_location:string;hazard_class:string}
export interface MaterialPRWorkspace{pr:MaterialPR;lines:MaterialPRLine[]}
export interface MaterialPosition{id:number;container_id:string;material_code:string;material_name:string;lot_number:string;quantity:number;unit:string;location_code:string;status:string;hazard_class:string;campaign_id:string|null;po_number:string|null;pr_number:string|null;updated_at:string}
export interface MaterialMovement{id:number;movement_id:string;container_id:string;material_code:string;lot_number:string;quantity:number;unit:string;from_location:string;to_location:string;movement_type:string;operator:string;po_number:string|null;pr_number:string|null;created_at:string}
