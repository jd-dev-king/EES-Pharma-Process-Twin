export interface HealthResponse{status:string;app:string;version:string;database:string}
export interface ProductionOrder{id:number;po_number:string;batch_number:string;product_name:string;quantity:number;status:string;weigh_room:string;mix_tank:string;hold_tank:string;packaging_line:string;requires_premix:boolean;bulk_material:string;created_at:string}
export interface MaterialComparison{material_code:string;material_name:string;required_quantity:number;unit:string;available_quantity:number;released_quantity:number;status:string;recommended_lot:string|null;warning:string|null}
export interface MaterialRequirement{id:number;po_number:string;material_code:string;material_name:string;required_quantity:number;unit:string;assigned_lot:string|null;status:string}
export interface ProductionOrderWorkspace{production_order:ProductionOrder;requirements:MaterialRequirement[];comparison:MaterialComparison[];ready_for_release:boolean}
export interface InventoryLot{id:number;material_code:string;material_name:string;lot_number:string;quantity:number;reserved_quantity:number;unit:string;location:string;qa_status:string;expiration_date:string}
export interface WarehouseTransferOrder{id:number;to_number:string;po_number:string;priority:string;destination:string;status:string;owner:string;progress:number;blocker:string|null;created_at:string}
export interface SubstitutionRequest{id:number;request_id:string;po_number:string;material_code:string;current_lot:string|null;proposed_lot:string;reason:string;status:string;decision_note:string|null;created_at:string}
export interface TrainingSession{id:number;session_id:string;role:string;difficulty:string;status:string;score:number;created_at:string}
export interface ProductionOrderPayload{po_number:string;batch_number:string;product_name:string;quantity:number;priority:string;destination:string;weigh_room:string;mix_tank:string;hold_tank:string;packaging_line:string;requires_premix:boolean;flavor:string;bulk_material:string}
export interface PlatformEvent{id:number;event_type:string;source:string;entity_type:string;entity_id:string;message:string;severity:string;created_at:string}
export interface NotificationRecord{id:number;recipient:string;title:string;message:string;severity:string;is_read:boolean;created_at:string}
export interface SchedulerConflictPayload{weigh_room:string;mix_tank:string;hold_tank:string;packaging_line:string}
export interface SchedulerConflict{resource_type:string;resource_id:string;conflicting_po:string;message:string}
export interface SchedulerConflictResponse{available:boolean;conflicts:SchedulerConflict[]}

export interface WeighRoom{id:number;room_code:string;name:string;status:string;scale_id:string;scale_status:string;calibration_due:string;active_po:string|null}
export interface WeighTicket{id:number;ticket_number:string;po_number:string;batch_number:string;room_code:string;operator:string;status:string;tare_confirmed:boolean;signature:string|null;current_material_index:number;created_at:string}
export interface WeighTicketLine{id:number;ticket_number:string;material_code:string;material_name:string;lot_number:string;target_quantity:number;actual_quantity:number|null;unit:string;tolerance:number;barcode_verified:boolean;status:string}
export interface WeighTicketWorkspace{ticket:WeighTicket;lines:WeighTicketLine[];current_line:WeighTicketLine|null;completion_percent:number}

export interface MixRoom{id:number;room_code:string;name:string;tank_code:string;capacity_l:number;status:string;cip_status:string;active_po:string|null;plc_code:string}
export interface HoldTank{id:number;tank_code:string;capacity_l:number;status:string;cip_status:string;active_po:string|null;level_percent:number;qa_status:string;batch_number:string|null;product_name:string|null;transferred_quantity:number;source_mix_tank:string|null;transfer_completed_at:string|null;lims_sample_id:string|null}
export interface MixBatch{id:number;batch_id:string;po_number:string;batch_number:string;room_code:string;tank_code:string;operator:string;status:string;phase:string;progress:number;level_percent:number;mass_kg:number;temperature_c:number;rpm:number;requires_premix:boolean;premix_status:string;manual_adds_confirmed:boolean;selected_hold_tank:string|null;sample_collected:boolean;fault_code:string|null;fault_message:string|null;fault_diagnosed:boolean;created_at:string}
export interface PremixRun{id:number;run_id:string;mix_batch_id:string;status:string;progress:number;level_percent:number;rpm:number;operator_confirmed:boolean}
export interface MixWorkspace{batch:MixBatch;premix:PremixRun|null;hold_tanks:HoldTank[];available_actions:string[]}
export interface RouteChangeRequest{id:number;request_id:string;po_number:string;resource_type:string;current_resource:string;requested_resource:string;reason:string;requester:string;status:string;created_at:string}

export interface QABulkTask{id:number;task_id:string;po_number:string;batch_number:string;product_name:string;hold_tank:string;sample_id:string;status:string;disposition:string|null;disposition_note:string|null;created_at:string;decided_at:string|null}

export interface PackagingLine{id:number;line_code:string;name:string;status:string;cip_status:string;active_po:string|null;plc_code:string;rated_speed_bpm:number}
export interface PackagingRun{id:number;run_id:string;po_number:string;batch_number:string;line_code:string;hold_tank:string;operator:string;status:string;progress:number;bottles_completed:number;cases_staged:number;rejects:number;speed_bpm:number;jam_code:string|null;fault_message:string|null;fault_diagnosed:boolean;fg_sample_id:string|null;fault_sequence_index:number;fault_count:number;downtime_minutes:number;created_at:string}
export interface PackagingWorkspace{run:PackagingRun;line:PackagingLine;available_actions:string[]}
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
  total_spaces: number;
  occupied_spaces: number;
  available_spaces: number;
  employees: number;
  visitors: number;
  occupancy_percent: number;
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

