from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.platform import *
from app.services.platform import *
router=APIRouter(); settings=get_settings()

def demo_session_id(request: Request) -> str:
    try:
        return normalize_demo_session_id(request.headers.get(DEMO_SESSION_HEADER))
    except ValueError as exc:
        raise HTTPException(400, str(exc))

@router.get("/health",response_model=HealthResponse,tags=["System"])
def health(db:Session=Depends(get_db)):
 db.execute(text("SELECT 1")); return HealthResponse(status="ok",app=settings.app_name,version=settings.app_version,database="online")
@router.get("/events",response_model=list[PlatformEventRead],tags=["Digital Thread"])
def events(limit:int=Query(50,ge=1,le=200),db:Session=Depends(get_db)): return list_events(db,limit)
@router.get("/mes/batch/{po_number}",tags=["MES"])
def mes_batch(po_number:str,db:Session=Depends(get_db)): return get_mes_batch_record(db,po_number)
@router.get("/facility/parking-status",tags=["Facility Integration"])
def parking_status(db:Session=Depends(get_db)): return facility_parking_status(db)
@router.get("/facility/security-status",tags=["Facility Integration"])
def security_status(db:Session=Depends(get_db)): return facility_security_status(db)
@router.get("/notifications",response_model=list[NotificationRead],tags=["Notifications"])
def notifications(recipient:str|None=None,db:Session=Depends(get_db)): return list_notifications(db,recipient)
@router.post("/scheduler/check-conflicts",response_model=SchedulerConflictResponse,tags=["Scheduler"])
def conflicts(payload:SchedulerConflictRequest): return check_scheduler_conflicts(payload)
@router.get("/training/roles",tags=["Training"])
def roles(): return {"roles":TRAINING_ROLES}
@router.post("/training/session",response_model=TrainingSessionRead,status_code=201,tags=["Training"])
def training(payload:TrainingSessionCreate,db:Session=Depends(get_db)):
 try:return create_training_session(db,payload)
 except ValueError as e: raise HTTPException(422,str(e))
@router.post("/training/session/{session_id}/advance",response_model=TrainingSessionRead,tags=["Training"])
def advance_training(session_id:str,payload:TrainingStepComplete,db:Session=Depends(get_db)):
 try:return advance_training_session(db,session_id,payload)
 except ValueError as e: raise HTTPException(404,str(e))
@router.get("/office/next-po", tags=["Office"])
def office_next_po(db:Session=Depends(get_db)):
    return {"po_number": next_po_number(db)}
@router.get("/office/formulation-variants", tags=["Office"])
def office_formulation_variants(db:Session=Depends(get_db)):
    return {"variants": formulation_variants(db)}

@router.get("/office/formulation-options", tags=["Office"])
def office_formulation_options(db:Session=Depends(get_db)):
    return formulation_options(db)

@router.get("/office/production-orders",response_model=list[ProductionOrderRead],tags=["Office"])
def pos(request:Request,db:Session=Depends(get_db)):
 return list_session_production_orders(db,demo_session_id(request))
@router.post("/office/register-po",response_model=ProductionOrderRead,status_code=201,tags=["Office"])
def register(payload:ProductionOrderCreate,request:Request,db:Session=Depends(get_db)):
 try:
  po=create_production_order(db,payload)
  register_demo_session_entity(db,demo_session_id(request),"ProductionOrder",po.po_number)
  return po
 except ValueError as e: raise HTTPException(409,str(e))

@router.get("/office/production-orders/{po_number}/workspace",response_model=ProductionOrderWorkspace,tags=["Office"])
def po_workspace(po_number:str,db:Session=Depends(get_db)):
 try:return workspace(db,po_number)
 except ValueError as e: raise HTTPException(404,str(e))
@router.get("/office/substitutions",response_model=list[SubstitutionRequestRead],tags=["Office"])
def substitutions(db:Session=Depends(get_db)): return list_substitutions(db)
@router.post("/office/substitutions/{request_id}/decision",response_model=SubstitutionRequestRead,tags=["Office"])
def substitution_decision(request_id:str,payload:SubstitutionDecision,db:Session=Depends(get_db)):
 try:return decide_substitution(db,request_id,payload.approved,payload.decision_note)
 except ValueError as e: raise HTTPException(409,str(e))
@router.get("/office/campaigns", response_model=list[CampaignRead], tags=["Office"])
def campaigns(request:Request,db:Session=Depends(get_db)):
 return list_session_campaigns(db,demo_session_id(request))

@router.post("/office/production-runs", response_model=ProductionRunRead, status_code=201, tags=["Office"])
def production_run_create(payload:ProductionRunCreate,request:Request,db:Session=Depends(get_db)):
 try:
  result=create_production_run(db,payload)
  sid=demo_session_id(request)
  register_demo_session_entity(db,sid,"ProductionCampaign",result["campaign"].campaign_id)
  for po in result["production_orders"]:
   register_demo_session_entity(db,sid,"ProductionOrder",po.po_number)
  return result
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/office/campaigns", response_model=CampaignRead, status_code=201, tags=["Office"])
def campaign_create(payload:CampaignCreate,request:Request,db:Session=Depends(get_db)):
 try:
  campaign=create_campaign(db,payload.po_numbers)
  register_demo_session_entity(db,demo_session_id(request),"ProductionCampaign",campaign.campaign_id)
  return campaign
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/weighing/shortage-request", tags=["Weighing"])
def shortage_request(payload:ShortageRequest, db:Session=Depends(get_db)):
 return request_material_shortage(db,payload)

@router.post("/weighing/campaigns/{campaign_id}/accept",response_model=CampaignRead,tags=["Weighing"])
def accept_campaign(campaign_id:str,payload:CampaignAcceptRequest,db:Session=Depends(get_db)):
 try:return accept_campaign_workload(db,campaign_id,payload.operator)
 except ValueError as e: raise HTTPException(409,str(e))

@router.get("/weighing/campaigns/{campaign_id}/plant-inventory",tags=["Weighing"])
def campaign_inventory(campaign_id:str,db:Session=Depends(get_db)):
 try:return campaign_plant_inventory(db,campaign_id)
 except ValueError as e: raise HTTPException(404,str(e))


@router.get("/weighing/campaigns/{campaign_id}/staging-readiness",tags=["Weighing"])
def campaign_staging_status(campaign_id:str,db:Session=Depends(get_db)):
 try:return campaign_staging_readiness(db,campaign_id)
 except ValueError as e: raise HTTPException(404,str(e))


@router.get("/weighing/campaigns/{campaign_id}/weigh-sequence",tags=["Weighing"])
def campaign_weigh_sequence_status(campaign_id:str,db:Session=Depends(get_db)):
 try:return campaign_weigh_sequence(db,campaign_id)
 except ValueError as e: raise HTTPException(404,str(e))


@router.post("/weighing/campaigns/{campaign_id}/sync-weighing",tags=["Weighing"])
def campaign_sync_weighing(campaign_id:str,payload:dict,db:Session=Depends(get_db)):
 try:
  return sync_campaign_weighing(
   db,
   campaign_id,
   str(payload.get("room_code","")),
   str(payload.get("operator","Weigh Technician")),
  )
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/weighing/campaigns/{campaign_id}/bend-to-room",tags=["Weighing"])
def campaign_bend_to_room(campaign_id:str,payload:dict,db:Session=Depends(get_db)):
 try:
  return bend_campaign_to_weigh_room(
   db,campaign_id,
   str(payload.get("room_code","")),
   str(payload.get("operator","Weigh Technician")),
  )
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/weighing/campaigns/{campaign_id}/separation-request",response_model=CampaignSeparationRead,status_code=201,tags=["Weighing"])
def separation_request(campaign_id:str,payload:CampaignSeparationCreate,db:Session=Depends(get_db)):
 try:return request_campaign_separation(db,campaign_id,payload.po_number,payload.requester,payload.reason)
 except ValueError as e: raise HTTPException(409,str(e))

@router.get("/office/campaign-separation-requests",response_model=list[CampaignSeparationRead],tags=["Office"])
def separation_requests(db:Session=Depends(get_db)): return list_campaign_separation_requests(db)

@router.post("/office/campaign-separation-requests/{request_id}/decision",response_model=CampaignSeparationRead,tags=["Office"])
def separation_decision(request_id:str,payload:CampaignSeparationDecision,db:Session=Depends(get_db)):
 try:return decide_campaign_separation(db,request_id,payload.approved,payload.decision_note)
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/weighing/substitutions",response_model=SubstitutionRequestRead,status_code=201,tags=["Weighing"])
def weighing_substitution(payload:SubstitutionRequestCreate,db:Session=Depends(get_db)):
 try:return request_substitution(db,payload)
 except ValueError as e: raise HTTPException(422,str(e))


@router.post("/weighing/rnd-alternative-request",tags=["Weighing"])
def weighing_rnd_alternative_request(payload:dict,db:Session=Depends(get_db)):
 try:
  return request_rnd_alternative_evaluation(
   db,
   campaign_id=str(payload.get("campaign_id","")),
   po_number=str(payload.get("po_number","")),
   original_material_code=str(payload.get("original_material_code","")),
   candidate_code=str(payload.get("candidate_code","")),
   requester=str(payload.get("requester","Weigh Technician")),
   note=str(payload.get("note","No approved material or substitute available.")),
  )
 except ValueError as e: raise HTTPException(422,str(e))


@router.get("/inventory/positions",response_model=list[MaterialPositionRead],tags=["Inventory Management"])
def material_positions(db:Session=Depends(get_db)): return list_material_positions(db)
@router.get("/inventory/movements",response_model=list[MaterialMovementRead],tags=["Inventory Management"])
def material_movements(limit:int=Query(200,ge=1,le=1000),db:Session=Depends(get_db)): return list_material_movements(db,limit)
@router.get("/weighing/material-prs",response_model=list[MaterialPRRead],tags=["Weighing"])
def material_prs(request:Request,db:Session=Depends(get_db)):
 return list_session_material_prs(db,demo_session_id(request))

@router.post("/weighing/material-prs",response_model=MaterialPRRead,status_code=201,tags=["Weighing"])
def create_pr(payload:MaterialPRCreate,db:Session=Depends(get_db)):
 try:return create_material_pr(db,payload)
 except ValueError as e: raise HTTPException(409,str(e))
@router.get("/weighing/material-prs/{pr_number}",response_model=MaterialPRWorkspace,tags=["Weighing"])
def pr_workspace(pr_number:str,db:Session=Depends(get_db)):
 try:return material_pr_workspace(db,pr_number)
 except ValueError as e: raise HTTPException(404,str(e))
@router.post("/weighing/material-move/vestibule-to-staging",response_model=MaterialPositionRead,tags=["Weighing"])
def vestibule_to_staging(payload:MaterialMoveRequest,db:Session=Depends(get_db)):
 try:return bend_from_vestibule(db,payload.container_id,payload.operator)
 except ValueError as e: raise HTTPException(409,str(e))
@router.post("/weighing/material-move/staging-to-room",response_model=MaterialPositionRead,tags=["Weighing"])
def staging_to_room(payload:MaterialMoveRequest,db:Session=Depends(get_db)):
 try:return bend_container_to_room(db,payload.container_id,payload.room_code or "",payload.operator,payload.po_number)
 except ValueError as e: raise HTTPException(409,str(e))

@router.get("/warehouse/queue",response_model=list[WarehouseTransferOrderRead],tags=["Warehouse"])
def queue(request:Request,db:Session=Depends(get_db)):
 return list_session_warehouse_queue(db,demo_session_id(request))

@router.get("/warehouse/inventory",response_model=list[InventoryLotRead],tags=["Warehouse"])
def inventory(db:Session=Depends(get_db)): return list_inventory(db)
@router.post("/warehouse/substitutions",response_model=SubstitutionRequestRead,status_code=201,tags=["Warehouse"])
def substitution(payload:SubstitutionRequestCreate,db:Session=Depends(get_db)):
 try:return request_substitution(db,payload)
 except ValueError as e: raise HTTPException(422,str(e))
@router.post("/warehouse/queue/{to_number}/{action}",response_model=WarehouseTransferOrderRead,tags=["Warehouse"])
def act(to_number:str,action:str,payload:WarehouseAction,db:Session=Depends(get_db)):
 try:return warehouse_action(db,to_number,action,payload.operator)
 except ValueError as e: raise HTTPException(409,str(e))



@router.post("/weighing/bend",response_model=WarehouseTransferOrderRead,tags=["Weighing"])
def bend_into_room(payload:BendIntoRoomRequest,db:Session=Depends(get_db)):
 try:return bend_cart_into_room(db,payload.po_number,payload.room_code,payload.operator)
 except ValueError as e: raise HTTPException(409,str(e))

@router.get("/weighing/rooms",response_model=list[WeighRoomRead],tags=["Weighing"])
def weigh_rooms(db:Session=Depends(get_db)): return list_weigh_rooms(db)

@router.get("/weighing/tickets",response_model=list[WeighTicketRead],tags=["Weighing"])
def weigh_tickets(request:Request,db:Session=Depends(get_db)):
 return list_session_weigh_tickets(db,demo_session_id(request))

@router.post("/weighing/tickets",response_model=WeighTicketRead,status_code=201,tags=["Weighing"])
def open_weigh_ticket(payload:WeighTicketCreate,db:Session=Depends(get_db)):
 try:return create_weigh_ticket(db,payload)
 except ValueError as e: raise HTTPException(409,str(e))

@router.get("/weighing/tickets/{ticket_number}",response_model=WeighTicketWorkspace,tags=["Weighing"])
def weigh_ticket_workspace(ticket_number:str,db:Session=Depends(get_db)):
 try:return ticket_workspace(db,ticket_number)
 except ValueError as e: raise HTTPException(404,str(e))

@router.get("/weighing/tickets/{ticket_number}/scale-materials",response_model=list[WeighTicketLineRead],tags=["Weighing"])
def weigh_scale_materials(ticket_number:str,scale_type:str,db:Session=Depends(get_db)):
 try:return ticket_scale_materials(db,ticket_number,scale_type)
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/weighing/tickets/{ticket_number}/tare",response_model=WeighTicketRead,tags=["Weighing"])
def tare(ticket_number:str,payload:TareConfirmation,db:Session=Depends(get_db)):
 try:return confirm_tare(db,ticket_number,payload.operator)
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/weighing/tickets/{ticket_number}/verify-barcode",response_model=WeighTicketLineRead,tags=["Weighing"])
def barcode(ticket_number:str,payload:BarcodeVerification,db:Session=Depends(get_db)):
 try:return verify_barcode(db,ticket_number,payload.barcode)
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/weighing/tickets/{ticket_number}/weigh",response_model=WeighTicketRead,tags=["Weighing"])
def weigh(ticket_number:str,payload:WeighMaterialRequest,db:Session=Depends(get_db)):
 try:return weigh_material(db,ticket_number,payload.actual_quantity,payload.operator)
 except ValueError as e: raise HTTPException(409,str(e))

@router.post("/weighing/tickets/{ticket_number}/sign",response_model=WeighTicketRead,tags=["Weighing"])
def sign(ticket_number:str,payload:ElectronicSignature,db:Session=Depends(get_db)):
 try:return sign_weigh_ticket(db,ticket_number,payload.signature)
 except ValueError as e: raise HTTPException(409,str(e))


@router.get("/mixing/rooms", response_model=list[MixRoomRead], tags=["Mixing"])
def mixing_rooms(db: Session = Depends(get_db)):
    return list_mix_rooms(db)


@router.get("/mixing/hold-tanks", response_model=list[HoldTankRead], tags=["Mixing"])
def mixing_hold_tanks(db: Session = Depends(get_db)):
    return list_hold_tanks(db)


@router.get("/mixing/queue", response_model=list[ProductionOrderRead], tags=["Mixing"])
def mixing_queue(db: Session = Depends(get_db)):
    return mix_queue(db)


@router.get("/mixing/batches", response_model=list[MixBatchRead], tags=["Mixing"])
def mixing_batches(db: Session = Depends(get_db)):
    return list_mix_batches(db)


@router.post("/mixing/batches", response_model=MixBatchRead, status_code=201, tags=["Mixing"])
def open_mix_batch(payload: MixBatchCreate, db: Session = Depends(get_db)):
    try:
        return create_mix_batch(db, payload)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.get("/mixing/batches/{batch_id}", response_model=MixWorkspace, tags=["Mixing"])
def get_mix_workspace(batch_id: str, db: Session = Depends(get_db)):
    try:
        return mix_workspace(db, batch_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))



@router.post("/mixing/batches/{batch_id}/verify-readiness", response_model=MixBatchRead, tags=["Mixing"])
def verify_batch_readiness(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return verify_mix_readiness(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))

@router.post("/mixing/batches/{batch_id}/start", response_model=MixBatchRead, tags=["Mixing"])
def start_batch(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return start_mix_batch(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/tick", response_model=MixBatchRead, tags=["Mixing"])
def tick_batch(batch_id: str, db: Session = Depends(get_db)):
    try:
        return tick_mix_batch(db, batch_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/confirm-bulk-pg", response_model=MixBatchRead, tags=["Mixing"])
def confirm_bulk_pg(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return confirm_bulk_pg_addition(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/confirm-manual-adds", response_model=MixBatchRead, tags=["Mixing"])
def confirm_adds(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return confirm_manual_adds(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/phase/{action}", response_model=MixBatchRead, tags=["Mixing"])
def mixing_phase_action(batch_id: str, action: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return advance_mix_phase(db, batch_id, action, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/premix/water/{pot}", response_model=PremixRunRead, tags=["Mixing"])
def premix_water(batch_id: str, pot: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:return confirm_premix_water(db,batch_id,pot,payload.operator)
    except ValueError as exc: raise HTTPException(409,str(exc))

@router.post("/mixing/batches/{batch_id}/premix/start", response_model=PremixRunRead, tags=["Mixing"])
def premix_start(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return start_premix(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/premix/confirm", response_model=MixBatchRead, tags=["Mixing"])
def premix_confirm(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return confirm_premix(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/select-hold", response_model=MixBatchRead, tags=["Mixing"])
def hold_select(batch_id: str, payload: HoldTankSelection, db: Session = Depends(get_db)):
    try:
        return select_hold_tank(db, batch_id, payload.hold_tank)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/start-transfer", response_model=MixBatchRead, tags=["Mixing"])
def transfer_start(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return start_transfer(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/collect-sample", response_model=MixBatchRead, tags=["Mixing"])
def transfer_sample(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return collect_transfer_sample(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/terminate", response_model=MixBatchRead, tags=["Mixing"])
def terminate_batch(batch_id: str, payload: OperatorAction, db: Session = Depends(get_db)):
    try:
        return terminate_mix_batch(db, batch_id, payload.operator)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.get("/quality/bulk-tasks", response_model=list[QABulkTaskRead], tags=["Quality"])
def quality_bulk_tasks(db: Session = Depends(get_db)):
    return list_qa_bulk_tasks(db)


@router.post("/quality/bulk-tasks/{task_id}/qa-disposition", response_model=QABulkTaskRead, tags=["Quality"])
def quality_bulk_disposition(task_id: str, payload: QADisposition, db: Session = Depends(get_db)):
    try:
        return decide_qa_bulk_task(db, task_id, payload.disposition, payload.note)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/diagnose", response_model=MixBatchRead, tags=["Mixing"])
def mix_diagnose(batch_id: str, db: Session = Depends(get_db)):
    try:
        return diagnose_mix_fault(db, batch_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/batches/{batch_id}/reset", response_model=MixBatchRead, tags=["Mixing"])
def mix_reset(batch_id: str, db: Session = Depends(get_db)):
    try:
        return reset_mix_fault(db, batch_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.get("/office/route-changes", response_model=list[RouteChangeRequestRead], tags=["Office"])
def route_changes(db: Session = Depends(get_db)):
    return list_route_changes(db)


@router.post("/operations/route-changes", response_model=RouteChangeRequestRead, status_code=201, tags=["Operations"])
def operations_route_change(payload: RouteChangeCreate, db: Session = Depends(get_db)):
    try:
        return create_route_change_request(db, payload)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/mixing/route-changes", response_model=RouteChangeRequestRead, status_code=201, tags=["Mixing"])
def route_change(payload: RouteChangeCreate, db: Session = Depends(get_db)):
    try:
        return create_route_change_request(db, payload)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.post("/office/route-changes/{request_id}/decision", response_model=RouteChangeRequestRead, tags=["Office"])
def route_change_decision(request_id: str, payload: RouteChangeDecision, db: Session = Depends(get_db)):
    try:
        return decide_route_change(db, request_id, payload.approved)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@router.get("/rnd/material-catalog", tags=["R&D"])
def rnd_materials(db:Session=Depends(get_db)):
    return rnd_catalog(db)

@router.get("/rnd/sample-batches", response_model=list[RnDSampleBatchRead], tags=["R&D"])
def rnd_samples(db:Session=Depends(get_db)):
    return list_rnd_sample_batches(db)

@router.post("/rnd/sample-batches", response_model=RnDSampleBatchRead, status_code=201, tags=["R&D"])
def rnd_create(payload:RnDSampleBatchCreate, db:Session=Depends(get_db)):
    try: return create_rnd_sample_batch(db,payload)
    except ValueError as exc: raise HTTPException(409,str(exc))

@router.post("/rnd/sample-batches/{sample_batch_id}/{action}", response_model=RnDSampleBatchRead, tags=["R&D"])
def rnd_action(sample_batch_id:str, action:str, payload:RnDSampleDecision, db:Session=Depends(get_db)):
    try: return rnd_sample_action(db,sample_batch_id,action,payload.result)
    except ValueError as exc: raise HTTPException(409,str(exc))

@router.get("/packaging/components", tags=["Packaging"])
def packaging_components(db:Session=Depends(get_db)): return list_packaging_components(db)

@router.get("/packaging/lines",response_model=list[PackagingLineRead],tags=["Packaging"])
def packaging_lines(db:Session=Depends(get_db)): return list_packaging_lines(db)
@router.get("/packaging/queue",response_model=list[ProductionOrderRead],tags=["Packaging"])
def packaging_queue(db:Session=Depends(get_db)): return list_packaging_queue(db)
@router.get("/packaging/runs",response_model=list[PackagingRunRead],tags=["Packaging"])
def packaging_runs(db:Session=Depends(get_db)): return list_packaging_runs(db)
@router.post("/packaging/runs",response_model=PackagingRunRead,status_code=201,tags=["Packaging"])
def packaging_open(payload:PackagingRunCreate,db:Session=Depends(get_db)):
 try:return create_packaging_run(db,payload)
 except ValueError as e: raise HTTPException(409,str(e))
@router.get("/packaging/runs/{run_id}",response_model=PackagingWorkspace,tags=["Packaging"])
def packaging_run_workspace(run_id:str,db:Session=Depends(get_db)):
 try:return packaging_workspace(db,run_id)
 except ValueError as e: raise HTTPException(404,str(e))
@router.post("/packaging/runs/{run_id}/{action}",response_model=PackagingRunRead,tags=["Packaging"])
def packaging_run_action(run_id:str,action:str,payload:OperatorAction,db:Session=Depends(get_db)):
 try:return packaging_action(db,run_id,action,payload.operator)
 except ValueError as e: raise HTTPException(409,str(e))
@router.get("/quality/fg-tasks",response_model=list[QAFinishedGoodsTaskRead],tags=["Quality"])
def qa_fg_tasks(db:Session=Depends(get_db)): return list_qa_fg_tasks(db)
@router.post("/quality/fg-tasks/{task_id}/qa-disposition",response_model=QAFinishedGoodsTaskRead,tags=["Quality"])
def qa_fg_decision(task_id:str,payload:QADisposition,db:Session=Depends(get_db)):
 try:return decide_qa_fg_task(db,task_id,payload.disposition,payload.note)
 except ValueError as e: raise HTTPException(409,str(e))



@router.get("/reliability/packaging-downtime",response_model=list[PackagingDowntimeEventRead],tags=["Reliability"] )
def packaging_downtime(db:Session=Depends(get_db)): return list_packaging_downtime(db)

@router.get("/reliability/packaging-kpis",response_model=PackagingReliabilityKPI,tags=["Reliability"] )
def packaging_kpis(db:Session=Depends(get_db)): return packaging_reliability_kpis(db)

@router.get("/maintenance/work-orders",response_model=list[MaintenanceWorkOrderRead],tags=["Maintenance"] )
def maintenance_work_orders(db:Session=Depends(get_db)): return list_maintenance_work_orders(db)

@router.post("/maintenance/work-orders/{work_order_id}/action",response_model=MaintenanceWorkOrderRead,tags=["Maintenance"] )
def maintenance_work_order_update(work_order_id:str,payload:MaintenanceWorkOrderAction,db:Session=Depends(get_db)):
    try:return maintenance_work_order_action(db,work_order_id,payload.action,payload.technician,payload.resolution)
    except ValueError as e: raise HTTPException(409,str(e))

@router.get("/maintenance/cip-runs", response_model=list[CIPRunRead], tags=["Maintenance"])
def cip_runs(db: Session = Depends(get_db)): return list_cip_runs(db)

@router.post("/maintenance/cip-runs", response_model=CIPRunRead, status_code=201, tags=["Maintenance"])
def cip_start(payload: CIPRunCreate, db: Session = Depends(get_db)):
    try: return start_cip_run(db, payload)
    except ValueError as exc: raise HTTPException(409, str(exc))

@router.post("/maintenance/cip-runs/{cip_id}/{action}", response_model=CIPRunRead, tags=["Maintenance"])
def cip_run_action(cip_id: str, action: str, payload: CIPSignature, db: Session = Depends(get_db)):
    try: return cip_action(db, cip_id, action, payload.signature)
    except ValueError as exc: raise HTTPException(409, str(exc))

@router.get("/shipping/ready", response_model=list[ProductionOrderRead], tags=["Shipping"])
def shipping_ready(db: Session = Depends(get_db)): return shipment_ready_pos(db)

@router.get("/shipping/shipments", response_model=list[ShipmentRead], tags=["Shipping"])
def shipments(db: Session = Depends(get_db)): return list_shipments(db)

@router.post("/shipping/shipments", response_model=ShipmentRead, status_code=201, tags=["Shipping"])
def shipment_schedule(payload: ShipmentCreate, db: Session = Depends(get_db)):
    try: return create_shipment(db, payload)
    except ValueError as exc: raise HTTPException(409, str(exc))

@router.post("/shipping/shipments/{shipment_id}/{action}", response_model=ShipmentRead, tags=["Shipping"])
def shipment_run_action(shipment_id: str, action: str, payload: ShipmentAction, db: Session = Depends(get_db)):
    try: return shipment_action(db, shipment_id, action, payload.operator, payload.seal_number, payload.signature)
    except ValueError as exc: raise HTTPException(409, str(exc))


@router.get("/compliance/ebr", response_model=list[EBRBatchSummary], tags=["Compliance"] )
def ebr_list(search: str="", db: Session=Depends(get_db)):
    return ebr_batch_summaries(db, search)

@router.get("/compliance/ebr/{po_number}", response_model=EBRBatchDetail, tags=["Compliance"] )
def ebr_detail(po_number: str, db: Session=Depends(get_db)):
    try: return ebr_batch_detail(db, po_number)
    except ValueError as exc: raise HTTPException(404, str(exc))

@router.get("/compliance/reviews", response_model=list[BatchReviewRead], tags=["Compliance"] )
def compliance_reviews(db: Session=Depends(get_db)):
    return list_batch_reviews(db)

@router.post("/compliance/reviews/{po_number}/decision", response_model=BatchReviewRead, tags=["Compliance"] )
def compliance_review_decision(po_number: str, payload: BatchReviewDecision, db: Session=Depends(get_db)):
    try: return decide_batch_review(db, po_number, payload.decision, payload.reviewer, payload.signature, payload.note)
    except ValueError as exc: raise HTTPException(409, str(exc))

@router.get("/compliance/audit-trail", response_model=list[AuditTrailRead], tags=["Compliance"] )
def compliance_audit(po_number: str|None=None, search: str="", db: Session=Depends(get_db)):
    return list_audit_trail(db, po_number, search)


@router.get("/bulk/tanks",response_model=list[BulkTankRead],tags=["Bulk Materials"] )
def bulk_tanks(db:Session=Depends(get_db)): return list_bulk_tanks(db)
@router.post("/bulk/tanks/{tank_code}/reset",response_model=BulkTankRead,tags=["Bulk Materials"] )
def bulk_tank_reset(tank_code:str,payload:BulkTankReset,db:Session=Depends(get_db)):
 try:return reset_bulk_tank(db,tank_code,payload.operator,payload.reason)
 except ValueError as e: raise HTTPException(409,str(e))
@router.get("/bulk/deliveries",response_model=list[BulkDeliveryRead],tags=["Bulk Materials"] )
def bulk_deliveries(db:Session=Depends(get_db)): return list_bulk_deliveries(db)
@router.post("/bulk/deliveries",response_model=BulkDeliveryRead,status_code=201,tags=["Bulk Materials"] )
def bulk_delivery_create(payload:BulkDeliveryCreate,db:Session=Depends(get_db)): return schedule_bulk_delivery(db,payload)
@router.post("/bulk/deliveries/{delivery_id}/inspect",response_model=BulkDeliveryRead,tags=["Bulk Materials"] )
def bulk_delivery_inspect(delivery_id:str,payload:BulkInspection,db:Session=Depends(get_db)):
    try:return inspect_bulk_delivery(db,delivery_id,payload)
    except ValueError as exc: raise HTTPException(409,str(exc))
@router.post("/bulk/deliveries/{delivery_id}/actions/{action}",response_model=BulkDeliveryRead,tags=["Bulk Materials"] )
def bulk_delivery_run(delivery_id:str,action:str,db:Session=Depends(get_db)):
    try:return bulk_delivery_action(db,delivery_id,action)
    except ValueError as exc: raise HTTPException(409,str(exc))
@router.post("/bulk/deliveries/{delivery_id}/qa-disposition",response_model=BulkDeliveryRead,tags=["Bulk Materials"] )
def bulk_delivery_disposition(delivery_id:str,payload:BulkDisposition,db:Session=Depends(get_db)):
    try:return decide_bulk_delivery(db,delivery_id,payload.disposition)
    except ValueError as exc: raise HTTPException(409,str(exc))
@router.get("/bulk/transfers",response_model=list[BulkTransferRead],tags=["Bulk Materials"] )
def bulk_transfers(db:Session=Depends(get_db)): return list_bulk_transfers(db)
@router.post("/bulk/transfers",response_model=BulkTransferRead,status_code=201,tags=["Bulk Materials"] )
def bulk_transfer_create(payload:BulkTransferCreate,db:Session=Depends(get_db)):
    try:return create_bulk_transfer(db,payload)
    except ValueError as exc: raise HTTPException(409,str(exc))
@router.post("/bulk/transfers/{transfer_id}/verify",response_model=BulkTransferRead,tags=["Bulk Materials"] )
def bulk_transfer_verify(transfer_id:str,payload:BulkTransferVerify,db:Session=Depends(get_db)):
    try:return verify_bulk_transfer(db,transfer_id,payload)
    except ValueError as exc: raise HTTPException(409,str(exc))
@router.post("/bulk/transfers/{transfer_id}/{action}",response_model=BulkTransferRead,tags=["Bulk Materials"] )
def bulk_transfer_run(transfer_id:str,action:str,db:Session=Depends(get_db)):
    try:return bulk_transfer_action(db,transfer_id,action)
    except ValueError as exc: raise HTTPException(409,str(exc))


@router.get("/system/demo-session",tags=["System"])
def demo_session_status(request:Request,db:Session=Depends(get_db)):
    sid=demo_session_id(request)
    session=db.execute(text("""
        SELECT status,created_at,last_seen_at
        FROM public.demo_sessions
        WHERE session_id=:session_id
    """),{"session_id":sid}).mappings().first()
    entities=db.execute(text("""
        SELECT entity_type,entity_id
        FROM public.demo_session_entities
        WHERE session_id=:session_id
          AND active=true
        ORDER BY entity_type,created_at,entity_id
    """),{"session_id":sid}).mappings().all()
    return {
        "session_id":sid,
        "status":session["status"] if session else "Unregistered",
        "created_at":session["created_at"] if session else None,
        "last_seen_at":session["last_seen_at"] if session else None,
        "active_entities":[dict(row) for row in entities],
        "active_entity_count":len(entities),
    }

@router.post("/system/demo-reset", tags=["System"])
def demo_reset(
    payload: DemoResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    if payload.confirmation.strip().upper() != "RESET":
        raise HTTPException(
            409,
            "Type RESET to confirm the current demo session reset",
        )

    return reset_demo_session(
        db,
        demo_session_id(request),
        payload.operator,
        payload.reason,
    )
