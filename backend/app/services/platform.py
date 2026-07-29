from datetime import datetime, timezone
from random import random
from uuid import uuid4
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.database import Base
from app.models import CIPRun, Shipment, HoldTank, InventoryLot, MaterialRequirement, MixBatch, MixRoom, Notification, PlatformEvent, PremixRun, ProductionOrder, QABulkTask, RouteChangeRequest, SubstitutionRequest, TrainingSession, WarehouseTransferOrder, WeighRoom, WeighTicket, WeighTicketLine, PackagingLine, PackagingRun, PackagingDowntimeEvent, MaintenanceWorkOrder, QAFinishedGoodsTask, BatchReview, AuditTrailEntry, BulkTank, BulkDelivery, BulkTransfer
from app.schemas.platform import ProductionOrderCreate, SchedulerConflict, SchedulerConflictRequest, SchedulerConflictResponse, TrainingSessionCreate, TrainingStepComplete

TRAINING_ROLES=["Production Scheduler","Warehouse Operator","Weigh Technician","Process Engineer","Packaging Operator","QA Specialist","Maintenance Technician","Lean Six Sigma Engineer"]
DEMO_RESERVATIONS={"weigh_room":{"WR-01":"PO-260700"},"mix_tank":{"V-201":"PO-260701"},"hold_tank":{"H-301":"PO-260702"},"packaging_line":{"PKG-01":"PO-260703"}}

def utc_now():
    return datetime.now(timezone.utc)

def record_event(db, **kw):
    event=PlatformEvent(**kw); db.add(event); return event
def create_notification(db, **kw):
    item=Notification(**kw); db.add(item); return item

def ensure_inventory(db: Session):
    if db.scalar(select(InventoryLot.id).limit(1)): return
    lots=[
      InventoryLot(material_code="API-PRED",material_name="Prednisone API",lot_number="API-260701",quantity=85,reserved_quantity=0,unit="kg",location="A-01-01",qa_status="Released",expiration_date="2027-06-30"),
      InventoryLot(material_code="SORB-70",material_name="Sorbitol Solution 70%",lot_number="SOR-260710",quantity=900,reserved_quantity=0,unit="kg",location="BULK-02",qa_status="Released",expiration_date="2027-02-15"),
      InventoryLot(material_code="FLAVOR-CH",material_name="Cherry Flavor System",lot_number="FLV-260706",quantity=12,reserved_quantity=0,unit="kg",location="B-03-04",qa_status="QA Hold",expiration_date="2027-01-20"),
      InventoryLot(material_code="FLAVOR-CH",material_name="Cherry Flavor System",lot_number="FLV-260615",quantity=18,reserved_quantity=0,unit="kg",location="B-03-02",qa_status="Released",expiration_date="2026-12-30"),
      InventoryLot(material_code="BOTTLE-120",material_name="120 mL Amber Bottle",lot_number="BOT-260720",quantity=8000,reserved_quantity=0,unit="ea",location="PKG-A-06",qa_status="Released",expiration_date="2030-01-01"),
    ]
    db.add_all(lots); db.commit()

def default_materials(payload):
    return payload.materials or [
      type("M",(),dict(material_code="API-PRED",material_name="Prednisone API",required_quantity=4.2,unit="kg"))(),
      type("M",(),dict(material_code="SORB-70",material_name="Sorbitol Solution 70%",required_quantity=210.0,unit="kg"))(),
      type("M",(),dict(material_code="FLAVOR-CH",material_name="Cherry Flavor System",required_quantity=6.0,unit="kg"))(),
      type("M",(),dict(material_code="BOTTLE-120",material_name="120 mL Amber Bottle",required_quantity=float(payload.quantity),unit="ea"))(),
    ]

def create_production_order(db: Session,payload: ProductionOrderCreate):
    ensure_inventory(db)
    po=ProductionOrder(po_number=payload.po_number,batch_number=payload.batch_number,product_name=payload.product_name,quantity=payload.quantity,status="Material Review",weigh_room=payload.weigh_room,mix_tank=payload.mix_tank,hold_tank=payload.hold_tank,packaging_line=payload.packaging_line,requires_premix=payload.requires_premix)
    to=WarehouseTransferOrder(to_number=f"TO-{payload.po_number}",po_number=payload.po_number,priority=payload.priority,destination=payload.destination,status="Pending",owner="Warehouse Queue")
    reqs=[MaterialRequirement(po_number=payload.po_number,material_code=m.material_code,material_name=m.material_name,required_quantity=m.required_quantity,unit=m.unit,assigned_lot=("FLV-260706" if m.material_code=="FLAVOR-CH" else None),status=("Scheduled Lot" if m.material_code=="FLAVOR-CH" else "Pending Allocation")) for m in default_materials(payload)]
    db.add_all([po,to,*reqs])
    record_event(db,event_type="ProductionOrderRegistered",source="Office",entity_type="ProductionOrder",entity_id=payload.po_number,message=f"{payload.po_number} registered for material review.",severity="info")
    create_notification(db,recipient="Warehouse",title="New transfer order",message=f"{to.to_number} entered the priority queue.",severity="warning" if payload.priority in {"Critical","High"} else "info")
    try: db.commit()
    except IntegrityError as exc: db.rollback(); raise ValueError("PO number, batch number, or transfer order already exists") from exc
    db.refresh(po); return po

def list_production_orders(db): return list(db.scalars(select(ProductionOrder).order_by(ProductionOrder.id.desc())).all())
def list_warehouse_queue(db):
    weights={"Critical":0,"High":1,"Normal":2,"Low":3}
    rows=list(db.scalars(select(WarehouseTransferOrder)).all())
    return sorted(rows,key=lambda x:(weights.get(x.priority,9),x.id))
def list_inventory(db): ensure_inventory(db); return list(db.scalars(select(InventoryLot).order_by(InventoryLot.material_code,InventoryLot.expiration_date)).all())
def po_requirements(db,po_number): return list(db.scalars(select(MaterialRequirement).where(MaterialRequirement.po_number==po_number).order_by(MaterialRequirement.id)).all())

def material_comparison(db,po_number):
    ensure_inventory(db); reqs=po_requirements(db,po_number); result=[]
    for r in reqs:
      lots=list(db.scalars(select(InventoryLot).where(InventoryLot.material_code==r.material_code).order_by(InventoryLot.expiration_date)).all())
      available=sum(max(0,l.quantity-l.reserved_quantity) for l in lots)
      released=[l for l in lots if l.qa_status=="Released" and l.quantity-l.reserved_quantity>=r.required_quantity]
      recommended=released[0].lot_number if released else None
      assigned=next((l for l in lots if l.lot_number==r.assigned_lot),None) if r.assigned_lot else None
      if assigned and assigned.qa_status!="Released" and r.status!="Approved Alternate":
        status="Blocked"; warning=f"Scheduled lot {assigned.lot_number} is {assigned.qa_status}. Office approval is required before using {recommended or 'an alternate lot'}."
      elif released: status="Ready"; warning=None
      elif available>=r.required_quantity: status="Blocked"; warning="Quantity exists, but no released lot can satisfy the requirement."
      else: status="Shortage"; warning=f"Short by {r.required_quantity-available:.2f} {r.unit}."
      result.append(dict(material_code=r.material_code,material_name=r.material_name,required_quantity=r.required_quantity,unit=r.unit,available_quantity=available,released_quantity=sum(max(0,l.quantity-l.reserved_quantity) for l in lots if l.qa_status=="Released"),status=status,recommended_lot=recommended,warning=warning))
    return result

def workspace(db,po_number):
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==po_number))
    if not po: raise ValueError("Production order not found")
    cmp=material_comparison(db,po_number)
    return {"production_order":po,"requirements":po_requirements(db,po_number),"comparison":cmp,"ready_for_release":all(x["status"]=="Ready" for x in cmp)}

def request_substitution(db, payload):
    lot=db.scalar(select(InventoryLot).where(InventoryLot.lot_number==payload.proposed_lot))
    if not lot or lot.material_code!=payload.material_code: raise ValueError("Proposed lot is not valid for this material")
    item=SubstitutionRequest(request_id=f"SUB-{uuid4().hex[:8].upper()}",po_number=payload.po_number,material_code=payload.material_code,current_lot=None,proposed_lot=payload.proposed_lot,reason=payload.reason,status="Pending")
    db.add(item); create_notification(db,recipient="Office",title="Material substitution approval required",message=f"Warehouse requests {payload.proposed_lot} for {payload.po_number}.",severity="warning")
    record_event(db,event_type="SubstitutionRequested",source="Warehouse",entity_type="SubstitutionRequest",entity_id=item.request_id,message=item.reason,severity="warning")
    db.commit(); db.refresh(item); return item
def list_substitutions(db): return list(db.scalars(select(SubstitutionRequest).order_by(SubstitutionRequest.id.desc())).all())
def decide_substitution(db,request_id,approved,note):
    item=db.scalar(select(SubstitutionRequest).where(SubstitutionRequest.request_id==request_id))
    if not item: raise ValueError("Substitution request not found")
    if item.status!="Pending": raise ValueError("Substitution request has already been decided")
    item.status="Approved" if approved else "Denied"; item.decision_note=note
    if approved:
      req=db.scalar(select(MaterialRequirement).where(MaterialRequirement.po_number==item.po_number,MaterialRequirement.material_code==item.material_code))
      if req: req.assigned_lot=item.proposed_lot; req.status="Approved Alternate"
    create_notification(db,recipient="Warehouse",title=f"Substitution {item.status.lower()}",message=f"{item.request_id} for {item.po_number}: {item.status}.",severity="info" if approved else "error")
    record_event(db,event_type=f"Substitution{item.status}",source="Office",entity_type="SubstitutionRequest",entity_id=item.request_id,message=note or item.status,severity="info" if approved else "warning")
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
      if not is_finished_goods:
        cmp=material_comparison(db,to.po_number); blockers=[x for x in cmp if x["status"]!="Ready"]
        approved_codes={x.material_code for x in db.scalars(select(SubstitutionRequest).where(SubstitutionRequest.po_number==to.po_number,SubstitutionRequest.status=="Approved")).all()}
        unresolved=[x for x in blockers if x["material_code"] not in approved_codes]
        if unresolved:
          to.status="Blocked"; to.blocker="; ".join(f"{x['material_name']}: {x['warning']}" for x in unresolved); db.commit(); raise ValueError(to.blocker)
      # One operator command starts and completes the automatic pickup sequence.
      to.status="Picking"; to.progress=0; to.blocker=None
      for progress in (20, 40, 60, 80, 100):
        to.progress=progress
      to.status="Picked"
      if is_finished_goods:
        po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==to.po_number))
        run=db.scalar(select(PackagingRun).where(PackagingRun.po_number==to.po_number))
        completed=run.bottles_completed if run else 0
        planned=po.quantity if po else 0
        if completed < planned:
          shortage=round(planned-completed)
          create_notification(db,recipient="Office",title="Finished-goods lot short",message=f"{to.po_number} released with {completed} of {planned} units; short by {shortage} units. Outbound pickup may proceed.",severity="warning")
          record_event(db,event_type="FGShortLotNotice",source="Warehouse",entity_type="WarehouseTransferOrder",entity_id=to.to_number,message=f"Released FG lot short by {shortage} units; outbound pickup continued.",severity="warning")
    elif action=="deliver":
      if to.status!="Picked": raise ValueError("Order must be fully picked before delivery")
      is_finished_goods = to.to_number.startswith("TO-FG-")
      to.status="Delivered"; to.progress=100; to.owner="Shipping Dock" if is_finished_goods else "Weighing Staging"
      po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==to.po_number))
      if po: po.status="Staged for Shipment" if is_finished_goods else "Delivered to Weighing"
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
    if transfer.status!="Delivered": raise ValueError("Warehouse must deliver the cart to weighing staging before bend-in")
    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==room_code))
    if not room: raise ValueError("Unknown weigh room")
    destination_room = transfer.destination.strip().split()[-1] if transfer.destination else ""
    room_suffix = room.room_code.split("-")[-1]
    if transfer.destination and transfer.destination != "Weighing Staging" and destination_room != room_suffix:
        raise ValueError(f"PO is routed to {transfer.destination}, not {room.room_code}")
    if room.status not in {"Available", "Reserved"}: raise ValueError(f"{room.room_code} is not available")
    if room.active_po and room.active_po != po_number: raise ValueError(f"{room.room_code} is reserved for {room.active_po}")
    transfer.status="Bent Into Room"
    transfer.owner=f"{room_code} Weigh Operator"
    room.status="Reserved"
    room.active_po=po_number
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==po_number))
    if po: po.status="In Weigh Room"
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

def get_ticket(db: Session, ticket_number: str):
    ticket=db.scalar(select(WeighTicket).where(WeighTicket.ticket_number==ticket_number))
    if not ticket: raise ValueError("Weigh ticket not found")
    return ticket

def ticket_workspace(db: Session, ticket_number: str):
    ticket=get_ticket(db,ticket_number)
    lines=list(db.scalars(select(WeighTicketLine).where(WeighTicketLine.ticket_number==ticket_number).order_by(WeighTicketLine.id)).all())
    current=next((line for line in lines if line.status!="Complete"),None)
    complete=sum(1 for line in lines if line.status=="Complete")
    pct=100 if lines and complete==len(lines) else int((complete/len(lines))*100) if lines else 0
    return dict(ticket=ticket,lines=lines,current_line=current,completion_percent=pct)

def create_weigh_ticket(db: Session, payload):
    ensure_weigh_rooms(db)
    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==payload.room_code))
    if not room: raise ValueError("Unknown weigh room")
    if room.status not in {"Available", "Reserved"}: raise ValueError(f"{room.room_code} is not available")
    if room.active_po and room.active_po != payload.po_number: raise ValueError(f"{room.room_code} is reserved for {room.active_po}")
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==payload.po_number))
    if not po: raise ValueError("Production order not found")
    transfer=db.scalar(select(WarehouseTransferOrder).where(WarehouseTransferOrder.po_number==payload.po_number))
    if not transfer or transfer.status!="Bent Into Room": raise ValueError("Weigh operator must bend the delivered cart into the assigned room before opening a ticket")
    destination_room = transfer.destination.strip().split()[-1] if transfer.destination else ""
    room_suffix = room.room_code.split("-")[-1]
    if transfer.destination and transfer.destination != "Weighing Staging" and destination_room != room_suffix:
        raise ValueError(f"PO is routed to {transfer.destination}, not {room.room_code}")
    existing=db.scalar(select(WeighTicket).where(WeighTicket.po_number==payload.po_number))
    if existing: return existing
    ticket=WeighTicket(ticket_number=f"WT-{payload.po_number}",po_number=po.po_number,batch_number=po.batch_number,room_code=room.room_code,operator=payload.operator,status="Pending Tare")
    reqs=po_requirements(db,po.po_number)
    lines=[]
    for req in reqs:
        lot=req.assigned_lot
        if not lot or req.status=="Approved Alternate":
            options=list(db.scalars(select(InventoryLot).where(InventoryLot.material_code==req.material_code,InventoryLot.qa_status=="Released").order_by(InventoryLot.expiration_date)).all())
            if not options: raise ValueError(f"No released lot available for {req.material_name}")
            lot=options[0].lot_number
            req.assigned_lot=lot; req.status="Allocated"
        lines.append(WeighTicketLine(ticket_number=ticket.ticket_number,material_code=req.material_code,material_name=req.material_name,lot_number=lot,target_quantity=req.required_quantity,unit=req.unit,tolerance=0.02,status="Pending"))
    room.status="In Use"; room.active_po=po.po_number; po.status="Weighing"
    db.add_all([ticket,*lines])
    record_event(db,event_type="WeighTicketCreated",source="Weighing",entity_type="WeighTicket",entity_id=ticket.ticket_number,message=f"{ticket.ticket_number} opened in {room.room_code} for {po.po_number}.",severity="info")
    db.commit(); db.refresh(ticket); return ticket

def confirm_tare(db: Session, ticket_number: str, operator: str):
    ticket=get_ticket(db,ticket_number)
    if ticket.status in {"Complete","Signed"}: raise ValueError("Ticket is already complete")
    ticket.tare_confirmed=True; ticket.status="Ready to Scan"
    record_event(db,event_type="ScaleTared",source="Weighing",entity_type="WeighTicket",entity_id=ticket_number,message=f"Scale tare confirmed by {operator}.",severity="info")
    db.commit(); db.refresh(ticket); return ticket

def verify_barcode(db: Session,ticket_number: str,barcode: str):
    ws=ticket_workspace(db,ticket_number); ticket=ws['ticket']; line=ws['current_line']
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
    lot=db.scalar(select(InventoryLot).where(InventoryLot.lot_number==line.lot_number))
    if not lot or lot.quantity-lot.reserved_quantity<actual_quantity: raise ValueError("Insufficient released inventory")
    lot.quantity-=actual_quantity
    line.actual_quantity=actual_quantity; line.status="Complete"
    ticket.tare_confirmed=False; ticket.current_material_index+=1
    remaining=list(db.scalars(select(WeighTicketLine).where(WeighTicketLine.ticket_number==ticket_number,WeighTicketLine.status!="Complete")).all())
    ticket.status="Awaiting Signature" if not remaining else "Pending Tare"
    record_event(db,event_type="MaterialWeighed",source="Weighing",entity_type="WeighTicket",entity_id=ticket_number,message=f"{line.material_code} weighed at {actual_quantity} {line.unit} by {operator}.",severity="info")
    db.commit(); db.refresh(ticket); return ticket

def sign_weigh_ticket(db: Session,ticket_number: str,signature: str):
    ticket=get_ticket(db,ticket_number)
    lines=list(db.scalars(select(WeighTicketLine).where(WeighTicketLine.ticket_number==ticket_number)).all())
    if not lines or any(line.status!="Complete" for line in lines): raise ValueError("All materials must be complete before signature")
    ticket.signature=signature; ticket.status="Complete"
    room=db.scalar(select(WeighRoom).where(WeighRoom.room_code==ticket.room_code))
    if room: room.status="Available"; room.active_po=None
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==ticket.po_number))
    if po: po.status="Weighing Complete"
    record_event(db,event_type="WeighTicketSigned",source="Weighing",entity_type="WeighTicket",entity_id=ticket_number,message=f"Electronic weigh ticket completed and signed by {signature}.",severity="info")
    create_notification(db,recipient="Mixing",title="Dispensed materials ready",message=f"{ticket.po_number} weighing is complete and ready for batching.",severity="info")
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


def mix_workspace(db: Session, batch_id: str):
    ensure_mixing_assets(db)
    batch=get_mix_batch(db,batch_id)
    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    actions=[]
    if batch.status=="Ready": actions=["start"]
    elif batch.status=="Running" and batch.phase=="Manual Additions": actions=["confirm-manual-adds"]
    elif batch.status=="Running" and batch.phase=="Premix Required": actions=["start-premix","confirm-premix"]
    elif batch.status=="Ready for Hold Selection": actions=["select-hold"]
    elif batch.status=="Ready for Transfer": actions=["start-transfer"]
    elif batch.status=="Sample Hold": actions=["collect-sample"]
    elif batch.status=="Awaiting Termination": actions=["terminate"]
    elif batch.status=="Faulted": actions=["diagnose","reset"]
    return {"batch":batch,"premix":premix,"hold_tanks":list_hold_tanks(db),"available_actions":actions}


def create_mix_batch(db: Session, payload):
    ensure_mixing_assets(db)
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==payload.po_number))
    if not po: raise ValueError("Production order not found")
    ticket=db.scalar(select(WeighTicket).where(WeighTicket.po_number==payload.po_number,WeighTicket.status=="Complete"))
    if not ticket: raise ValueError("Completed electronic weigh ticket is required")
    existing=db.scalar(select(MixBatch).where(MixBatch.po_number==payload.po_number))
    if existing: return existing
    room=db.scalar(select(MixRoom).where(MixRoom.room_code==payload.room_code))
    if not room: raise ValueError("Unknown mix room")
    if room.status not in {"Available", "Reserved"}: raise ValueError(f"{room.room_code} is not available")
    if room.active_po and room.active_po != payload.po_number: raise ValueError(f"{room.room_code} is reserved for {room.active_po}")
    if room.tank_code!=po.mix_tank: raise ValueError(f"PO is scheduled for {po.mix_tank}, not {room.tank_code}")
    batch=MixBatch(
        batch_id=f"MB-{po.po_number}",po_number=po.po_number,batch_number=po.batch_number,
        room_code=room.room_code,tank_code=room.tank_code,operator=payload.operator,status="Ready",
        phase="Ready to Start",requires_premix=po.requires_premix,
        premix_status="Not Started" if po.requires_premix else "Not Required",
    )
    room.status="Reserved"; room.active_po=po.po_number; room.cip_status="Clean / Available"
    po.status="Ready for Mixing"
    db.add(batch)
    record_event(db,event_type="MixBatchCreated",source="Mixing",entity_type="MixBatch",entity_id=batch.batch_id,message=f"{batch.batch_id} queued in {room.room_code} on {room.tank_code}.",severity="info")
    db.commit(); db.refresh(batch); return batch


def maybe_fault(db: Session, batch: MixBatch):
    if batch.progress < 10 or random() >= 0.18:
        return False
    fault_options={
        "Bulk Water Addition":("XV-101-FB","Bulk-water valve command does not match open feedback."),
        "Final Agitation":("M-201-OL","Agitator motor overload detected."),
        "Transfer":("P-201-FLOW","Low transfer-flow interlock detected."),
    }
    if batch.phase not in fault_options:
        return False
    code,message=fault_options[batch.phase]
    batch.status="Faulted"; batch.fault_code=code; batch.fault_message=message; batch.rpm=0
    record_event(db,event_type="ProcessFault",source="Mixing PLC",entity_type="MixBatch",entity_id=batch.batch_id,message=f"{code}: {message}",severity="error")
    create_notification(db,recipient="Maintenance",title=f"Mixing fault {code}",message=f"{batch.batch_id}: {message}",severity="error")
    return True


def start_mix_batch(db: Session, batch_id: str, operator: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Ready": raise ValueError("Batch is not ready to start")
    room=db.scalar(select(MixRoom).where(MixRoom.room_code==batch.room_code))
    batch.status="Running"; batch.phase="Bulk Water Addition"; batch.progress=0; batch.rpm=0
    if room: room.status="In Use"; room.cip_status="In Use"
    record_event(db,event_type="BatchStarted",source="Mixing",entity_type="MixBatch",entity_id=batch.batch_id,message=f"Automatic batch started by {operator}.",severity="info")
    db.commit(); db.refresh(batch); return batch


def tick_mix_batch(db: Session, batch_id: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status=="Faulted": return batch
    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    if premix and premix.status=="Running":
        premix.progress=min(100,premix.progress+20); premix.level_percent=min(72,premix.level_percent+14.4); premix.rpm=180
        if premix.progress>=100:
            premix.status="Awaiting Confirmation"; premix.rpm=0
        db.commit(); db.refresh(batch); return batch
    if batch.status not in {"Running","Transferring"}: return batch
    if maybe_fault(db,batch): db.commit(); db.refresh(batch); return batch
    if batch.phase=="Bulk Water Addition":
        batch.progress=min(100,batch.progress+20); batch.level_percent=min(45,batch.level_percent+9); batch.mass_kg+=90; batch.temperature_c=min(25,batch.temperature_c+0.4)
        if batch.progress>=100:
            batch.phase="Bulk PG Verification"; batch.progress=0; batch.status="Awaiting Bulk PG"
            record_event(db,event_type="BulkPGRequired",source="Mixing",entity_type="MixBatch",entity_id=batch.batch_id,message="Bulk water addition complete; verify and charge released Propylene Glycol before manual additions.",severity="info")
    elif batch.phase=="Final Agitation":
        batch.rpm=65; batch.progress=min(100,batch.progress+20); batch.temperature_c=min(28,batch.temperature_c+0.3)
        if batch.progress>=100:
            batch.rpm=0; batch.status="Ready for Hold Selection"; batch.phase="Select Hold Tank"; batch.progress=100
    elif batch.phase=="Transfer":
        batch.progress=min(100,batch.progress+10)
        hold=db.scalar(select(HoldTank).where(HoldTank.tank_code==batch.selected_hold_tank))
        if hold:
            batch.level_percent=max(0,batch.level_percent-8)
            hold.level_percent=min(100,hold.level_percent+8); hold.status="Receiving"; hold.cip_status="In Use"
        if batch.progress>=10 and not batch.sample_collected:
            batch.status="Sample Hold"; batch.phase="Transfer Sample Required"
        elif batch.progress>=100:
            batch.status="Awaiting Termination"; batch.phase="Transfer Complete"; batch.progress=100; batch.level_percent=0
            if hold:
                hold.status="Receiving Complete"
                hold.qa_status="Awaiting Batch Termination"
                hold.transferred_quantity=batch.mass_kg
                hold.source_mix_tank=batch.tank_code
                hold.transfer_completed_at=utc_now()
            record_event(db,event_type="TransferComplete",source="Mixing",entity_type="MixBatch",entity_id=batch.batch_id,message=f"Transfer to {batch.selected_hold_tank} reached 100%; terminate the batch to create the QA hold.",severity="info")
    db.commit(); db.refresh(batch); return batch



def confirm_bulk_pg_addition(db: Session, batch_id: str, operator: str):
    batch = get_mix_batch(db, batch_id)
    if batch.phase != "Bulk PG Confirmation":
        raise ValueError("Bulk PG charge is not awaiting operator confirmation")
    transfer = db.scalar(
        select(BulkTransfer)
        .where(BulkTransfer.po_number == batch.po_number, BulkTransfer.status == "Complete")
        .order_by(BulkTransfer.id.desc())
    )
    if not transfer:
        raise ValueError("Complete the automatic PG transfer before confirmation")
    batch.phase = "Manual Additions"
    batch.status = "Running"
    batch.progress = 100
    record_event(
        db,
        event_type="BulkPGConfirmed",
        source="Mixing",
        entity_type="MixBatch",
        entity_id=batch.batch_id,
        message=f"{transfer.quantity_kg:.0f} kg Propylene Glycol from {transfer.source_tank} confirmed by {operator}.",
        severity="info",
    )
    db.commit(); db.refresh(batch); return batch

def confirm_manual_adds(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    if batch.phase!="Manual Additions": raise ValueError("Manual additions are not the active step")
    batch.manual_adds_confirmed=True
    if batch.requires_premix:
        batch.phase="Premix Required"; batch.progress=0; batch.premix_status="Not Started"
    else:
        batch.phase="Final Agitation"; batch.progress=0
    record_event(db,event_type="ManualAddsConfirmed",source="Mixing",entity_type="MixBatch",entity_id=batch_id,message=f"Manual additions confirmed by {operator}.",severity="info")
    db.commit(); db.refresh(batch); return batch


def start_premix(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    if not batch.requires_premix: raise ValueError("This formula does not require premix")
    if batch.phase!="Premix Required": raise ValueError("Premix is not the active recipe step")
    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    if not premix:
        premix=PremixRun(run_id=f"PM-{batch.po_number}",mix_batch_id=batch_id,status="Running")
        db.add(premix)
    elif premix.status in {"Complete","Awaiting Confirmation"}: return premix
    else: premix.status="Running"
    batch.premix_status="Running"
    record_event(db,event_type="PremixStarted",source="Premix",entity_type="PremixRun",entity_id=premix.run_id,message=f"Dye premix started by {operator}.",severity="info")
    db.commit(); db.refresh(premix); return premix


def confirm_premix(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    premix=db.scalar(select(PremixRun).where(PremixRun.mix_batch_id==batch_id))
    if not premix: raise ValueError("PREMIX NOT STARTED")
    if premix.status!="Awaiting Confirmation": raise ValueError("PREMIX NOT COMPLETED")
    premix.status="Complete"; premix.operator_confirmed=True; batch.premix_status="Complete"; batch.phase="Final Agitation"; batch.progress=0
    record_event(db,event_type="PremixConfirmed",source="Premix",entity_type="PremixRun",entity_id=premix.run_id,message=f"Premix completed and charged by {operator}.",severity="info")
    db.commit(); db.refresh(batch); return batch


def select_hold_tank(db: Session,batch_id: str,tank_code: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Ready for Hold Selection": raise ValueError("Batch is not ready for hold-tank selection")
    tank=db.scalar(select(HoldTank).where(HoldTank.tank_code==tank_code))
    if not tank: raise ValueError("Unknown hold tank")
    if tank.status!="Available" or tank.cip_status!="Clean / Available" or tank.level_percent>0:
        raise ValueError(f"{tank_code} is not clean and available")
    po=db.scalar(select(ProductionOrder).where(ProductionOrder.po_number==batch.po_number))
    if po and po.hold_tank!=tank_code:
        raise ValueError(f"{tank_code} is not the scheduled hold tank; submit an Office route-change request")
    batch.selected_hold_tank=tank_code; batch.status="Ready for Transfer"; batch.phase="Transfer Ready"
    tank.status="Reserved"; tank.active_po=batch.po_number; tank.cip_status="Clean / Available"
    db.commit(); db.refresh(batch); return batch


def start_transfer(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Ready for Transfer" or not batch.selected_hold_tank: raise ValueError("Select an approved hold tank before transfer")
    batch.status="Transferring"; batch.phase="Transfer"; batch.progress=0; batch.sample_collected=False
    record_event(db,event_type="TransferStarted",source="Mixing",entity_type="MixBatch",entity_id=batch_id,message=f"Transfer to {batch.selected_hold_tank} started by {operator}.",severity="info")
    db.commit(); db.refresh(batch); return batch


def collect_transfer_sample(db: Session,batch_id: str,operator: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Sample Hold": raise ValueError("No transfer sample is currently required")
    batch.sample_collected=True; batch.status="Transferring"; batch.phase="Transfer"
    record_event(db,event_type="TransferSampleCollected",source="LIMS",entity_type="MixBatch",entity_id=batch_id,message=f"Transfer sample collected by {operator}.",severity="info")
    db.commit(); db.refresh(batch); return batch


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
    hold.active_po=batch.po_number
    hold.batch_number=batch.batch_number
    hold.product_name=po.product_name
    hold.transferred_quantity=batch.mass_kg
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


def diagnose_mix_fault(db: Session,batch_id: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Faulted": raise ValueError("No active fault")
    batch.fault_diagnosed=True
    db.commit(); db.refresh(batch); return batch


def reset_mix_fault(db: Session,batch_id: str):
    batch=get_mix_batch(db,batch_id)
    if batch.status!="Faulted": raise ValueError("No active fault")
    if not batch.fault_diagnosed: raise ValueError("Diagnose the fault before reset")
    batch.status="Transferring" if batch.phase=="Transfer" else "Running"
    batch.fault_code=None; batch.fault_message=None; batch.fault_diagnosed=False
    record_event(db,event_type="ProcessFaultReset",source="Mixing PLC",entity_type="MixBatch",entity_id=batch_id,message="Fault cleared; automatic sequence resumed.",severity="info")
    db.commit(); db.refresh(batch); return batch


def _resource_value(po: ProductionOrder, resource_type: str) -> str:
    mapping = {
        "weigh_room": "weigh_room",
        "mix_tank": "mix_tank",
        "hold_tank": "hold_tank",
        "packaging_line": "packaging_line",
        "production_quantity": "quantity",
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
    elif resource_type == "production_quantity":
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
        }.get(item.resource_type)
        if not attr:
            raise ValueError("Unsupported resource type")
        if item.resource_type == "production_quantity":
            revised_quantity = int(item.requested_resource)
            po.quantity = revised_quantity
            bottle_requirement = db.scalar(
                select(MaterialRequirement).where(
                    MaterialRequirement.po_number == item.po_number,
                    MaterialRequirement.material_code == "BOTTLE-120",
                )
            )
            if bottle_requirement:
                bottle_requirement.required_quantity = float(revised_quantity)
                bottle_requirement.status = "Quantity Revised by Office"
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
        else:
            setattr(po, attr, item.requested_resource)
        if item.resource_type == "weigh_room":
            transfer = db.scalar(
                select(WarehouseTransferOrder).where(WarehouseTransferOrder.po_number == item.po_number)
            )
            if transfer and transfer.status not in {"Bent Into Room", "Completed"}:
                suffix = item.requested_resource[-2:]
                transfer.destination = f"Weighing Staging {suffix}"
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
    if not po: raise ValueError("Production order not found")
    if po.status!="Bulk Released for Packaging": raise ValueError("Bulk must be released by QA before packaging")
    if payload.line_code!=po.packaging_line: raise ValueError(f"PO is scheduled for {po.packaging_line}; request Office approval before using another line")
    line=db.scalar(select(PackagingLine).where(PackagingLine.line_code==payload.line_code))
    if not line or line.status!="Available" or line.cip_status!="Clean / Available": raise ValueError("Packaging line is not clean and available")
    existing=db.scalar(select(PackagingRun).where(PackagingRun.po_number==po.po_number))
    if existing: return existing
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
    return {"run":run,"line":line,"available_actions":actions}

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
            run.progress=min(100,run.progress+20); run.bottles_completed=round(po.quantity*run.progress/100); run.cases_staged=run.bottles_completed//24; run.rejects=max(run.rejects,round(run.bottles_completed*0.004));
            if run.progress>=100:
                run.status="Awaiting FG Sample"; run.speed_bpm=0; line.status="Product Hold"; po.status="FG Sample Required"
                hold=db.scalar(select(HoldTank).where(HoldTank.tank_code==run.hold_tank))
                if hold:
                    hold.level_percent=0
                    hold.status="Dirty / CIP Required"
                    hold.cip_status="Dirty / CIP Required"
                    hold.qa_status="Consumed / CIP Required"
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
        task=QAFinishedGoodsTask(task_id=f"QAFG-{uuid4().hex[:8].upper()}",po_number=po.po_number,batch_number=po.batch_number,product_name=po.product_name,packaging_line=run.line_code,sample_id=sample,quantity=po.quantity,status="Pending Review")
        db.add(task); create_notification(db,recipient="Quality",title="FG disposition required",message=f"{po.po_number} sample {sample} is ready for review.",severity="warning")
    else: raise ValueError("Unknown packaging action")
    record_event(db,event_type=f"Packaging{action.title().replace('-','')}",source="Packaging",entity_type="PackagingRun",entity_id=run.run_id,message=f"{operator} completed {action} for {run.run_id}.",severity="warning" if run.status=="Faulted" else "info")
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
    run=CIPRun(cip_id=f"CIP-{payload.asset_code}-{uuid4().hex[:6].upper()}",asset_type=payload.asset_type,asset_code=payload.asset_code,operator=payload.operator,status="Running",phase="Drain",progress=0)
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
    if action=="verify": item.status="Verified"
    elif action=="load":
        if item.status not in {"Verified","Loading"}: raise ValueError("Verify shipment before loading")
        item.status="Loaded"; item.pallets_loaded=4
        record_event(db,event_type="ShipmentAutoLoaded",source="Warehouse",entity_type="Shipment",entity_id=item.shipment_id,message=f"{operator} completed automatic loading of 4 pallets for {item.po_number}.",severity="info")
    elif action=="seal":
        if item.status!="Loaded": raise ValueError("Load all pallets before sealing")
        if not seal_number.strip(): raise ValueError("Trailer seal number is required")
        item.trailer_seal=seal_number.strip(); item.status="Sealed"
    elif action=="ship":
        if item.status!="Sealed": raise ValueError("Seal trailer before shipment completion")
        if len(signature.strip())<3: raise ValueError("Electronic signature is required")
        item.signature=signature.strip(); item.bol_number=f"BOL-{item.po_number}"; item.status="Shipped"; item.shipped_at=utc_now(); po.status="Shipped / Closed"
        record_event(db,event_type="ShipmentCompleted",source="Warehouse",entity_type="Shipment",entity_id=item.shipment_id,message=f"{operator} shipped {item.po_number}; BOL {item.bol_number}.",severity="info")
        create_notification(db,recipient="Office",title="Shipment completed",message=f"{item.po_number} shipped via {item.carrier}; {item.bol_number}.",severity="info")
    else: raise ValueError("Unknown shipment action")
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
        produced=run.bottles_completed if run else 0
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


def ensure_bulk_tanks(db: Session):
    if db.scalar(select(BulkTank.id).limit(1)): return
    db.add_all([
      BulkTank(tank_code="PG-101",material_code="PG",material_name="Propylene Glycol",capacity_kg=25000,quantity_kg=0,qa_status="Empty"),
      BulkTank(tank_code="PW-101",material_code="PW",material_name="Purified Water",capacity_kg=40000,quantity_kg=30000,qa_status="Released",lot_number="PW-UTILITY"),
      BulkTank(tank_code="GLY-101",material_code="GLY",material_name="Glycerin",capacity_kg=18000,quantity_kg=0,qa_status="Empty"),
      BulkTank(tank_code="SOR-101",material_code="SOR",material_name="Sorbitol Solution",capacity_kg=20000,quantity_kg=0,qa_status="Empty"),
    ]); db.commit()

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
    if not batch or batch.phase != "Bulk PG Verification":
        raise ValueError("Complete bulk water addition before creating the PG production charge")
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
          batch.phase = "Bulk PG Confirmation"
          batch.status = "Awaiting Bulk PG Confirmation"
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
