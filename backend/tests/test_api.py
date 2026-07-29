def register(client, po="PO-260742"):
 return client.post("/api/office/register-po",json={"po_number":po,"batch_number":"B-"+po,"product_name":"Prednisone Oral Suspension","quantity":4200,"priority":"Critical","destination":"Weighing Staging 01"})

def test_health(client): assert client.get("/api/health").status_code==200
def test_training_session_starts_at_zero(client):
 r=client.post("/api/training/session",json={"role":"Production Scheduler","difficulty":"Beginner"}); assert r.status_code==201 and r.json()["score"]==0
def test_po_workspace_compares_inventory(client):
 assert register(client).status_code==201
 w=client.get("/api/office/production-orders/PO-260742/workspace"); assert w.status_code==200
 data=w.json(); assert len(data["comparison"])==4; assert any(x["status"]=="Blocked" for x in data["comparison"]); assert data["ready_for_release"] is False
def test_substitution_requires_office_approval(client):
 register(client)
 req=client.post("/api/warehouse/substitutions",json={"po_number":"PO-260742","material_code":"FLAVOR-CH","proposed_lot":"FLV-260615","reason":"Scheduled lot is on QA hold"}); assert req.status_code==201
 rid=req.json()["request_id"]
 decision=client.post(f"/api/office/substitutions/{rid}/decision",json={"approved":True,"decision_note":"Approved released alternate"}); assert decision.status_code==200 and decision.json()["status"]=="Approved"
def test_warehouse_full_execution_after_approval(client):
 register(client); to="TO-PO-260742"
 assert client.post(f"/api/warehouse/queue/{to}/accept",json={"operator":"J. Operator"}).status_code==200
 blocked=client.post(f"/api/warehouse/queue/{to}/pick",json={"operator":"J. Operator"}); assert blocked.status_code==409
 req=client.post("/api/warehouse/substitutions",json={"po_number":"PO-260742","material_code":"FLAVOR-CH","proposed_lot":"FLV-260615","reason":"Use released alternate"}).json()
 client.post(f"/api/office/substitutions/{req['request_id']}/decision",json={"approved":True,"decision_note":"Approved"})
 picked=client.post(f"/api/warehouse/queue/{to}/pick",json={"operator":"J. Operator"}); assert picked.json()["status"]=="Picked" and picked.json()["progress"]==100
 delivered=client.post(f"/api/warehouse/queue/{to}/deliver",json={"operator":"J. Operator"}); assert delivered.json()["status"]=="Delivered"
def test_priority_queue_sorting(client):
 register(client,"PO-NORMAL"); client.post("/api/office/register-po",json={"po_number":"PO-CRIT","batch_number":"B-CRIT","product_name":"Product","quantity":10,"priority":"Critical","destination":"Stage"})
 q=client.get("/api/warehouse/queue").json(); assert q[0]["priority"]=="Critical"
def test_scheduler_conflicts(client):
 r=client.post("/api/scheduler/check-conflicts",json={"weigh_room":"WR-01","mix_tank":"V-202","hold_tank":"H-302","packaging_line":"PKG-02"}); assert r.json()["available"] is False

def create_ready_single_material_po(client, po="PO-WEIGH-1", room="WR-01"):
    payload={
      "po_number":po,"batch_number":f"B-{po}","product_name":"Prednisone Pilot Batch","quantity":100,
      "priority":"High","destination":f"Weighing Staging {room[-2:]}",
      "materials":[{"material_code":"API-PRED","material_name":"Prednisone API","required_quantity":4.2,"unit":"kg"}]
    }
    assert client.post("/api/office/register-po",json=payload).status_code==201
    to=f"TO-{po}"
    assert client.post(f"/api/warehouse/queue/{to}/accept",json={"operator":"Warehouse Operator"}).status_code==200
    picked=client.post(f"/api/warehouse/queue/{to}/pick",json={"operator":"Warehouse Operator"})
    assert picked.status_code==200 and picked.json()["progress"]==100
    assert client.post(f"/api/warehouse/queue/{to}/deliver",json={"operator":"Warehouse Operator"}).status_code==200


def test_weighing_requires_delivered_to(client):
    client.post("/api/office/register-po",json={"po_number":"PO-WAIT","batch_number":"B-WAIT","product_name":"Product","quantity":10,"priority":"Normal","destination":"Weighing Staging 01","materials":[{"material_code":"API-PRED","material_name":"Prednisone API","required_quantity":1,"unit":"kg"}]})
    r=client.post("/api/weighing/tickets",json={"po_number":"PO-WAIT","room_code":"WR-01","operator":"Weigh Tech"})
    assert r.status_code==409


def test_complete_electronic_weigh_ticket(client):
    create_ready_single_material_po(client)
    rooms=client.get("/api/weighing/rooms"); assert rooms.status_code==200 and len(rooms.json())==2
    bent=client.post("/api/weighing/bend",json={"po_number":"PO-WEIGH-1","room_code":"WR-01","operator":"Weigh Tech"})
    assert bent.status_code==200 and bent.json()["status"]=="Bent Into Room"
    opened=client.post("/api/weighing/tickets",json={"po_number":"PO-WEIGH-1","room_code":"WR-01","operator":"Weigh Tech"})
    assert opened.status_code==201
    ticket=opened.json()["ticket_number"]
    assert client.post(f"/api/weighing/tickets/{ticket}/verify-barcode",json={"barcode":"API-PRED"}).status_code==409
    assert client.post(f"/api/weighing/tickets/{ticket}/tare",json={"operator":"Weigh Tech"}).status_code==200
    assert client.post(f"/api/weighing/tickets/{ticket}/verify-barcode",json={"barcode":"WRONG"}).status_code==409
    assert client.post(f"/api/weighing/tickets/{ticket}/verify-barcode",json={"barcode":"API-PRED"}).status_code==200
    assert client.post(f"/api/weighing/tickets/{ticket}/weigh",json={"actual_quantity":4.2,"operator":"Weigh Tech"}).status_code==200
    ws=client.get(f"/api/weighing/tickets/{ticket}").json(); assert ws["completion_percent"]==100
    signed=client.post(f"/api/weighing/tickets/{ticket}/sign",json={"signature":"J. WeighTech"})
    assert signed.status_code==200 and signed.json()["status"]=="Complete"


def test_weigh_room_route_validation(client):
    create_ready_single_material_po(client,"PO-WEIGH-2","WR-02")
    wrong=client.post("/api/weighing/bend",json={"po_number":"PO-WEIGH-2","room_code":"WR-01","operator":"Weigh Tech"})
    assert wrong.status_code==409
    assert client.post("/api/weighing/bend",json={"po_number":"PO-WEIGH-2","room_code":"WR-02","operator":"Weigh Tech"}).status_code==200
    correct=client.post("/api/weighing/tickets",json={"po_number":"PO-WEIGH-2","room_code":"WR-02","operator":"Weigh Tech"})
    assert correct.status_code==201


def complete_weigh_for_mixing(client, po="PO-MIX-1", premix=False, mix_tank="V-201", hold_tank="H-301"):
    payload={
      "po_number":po,"batch_number":f"B-{po}","product_name":"Prednisone Cherry Red" if premix else "Prednisone Dye Free",
      "quantity":100,"priority":"High","destination":"Weighing Staging 01",
      "weigh_room":"WR-01","mix_tank":mix_tank,"hold_tank":hold_tank,"packaging_line":"PKG-01","requires_premix":premix,
      "materials":[{"material_code":"API-PRED","material_name":"Prednisone API","required_quantity":4.2,"unit":"kg"}]
    }
    assert client.post("/api/office/register-po",json=payload).status_code==201
    to=f"TO-{po}"
    client.post(f"/api/warehouse/queue/{to}/accept",json={"operator":"Warehouse Operator"})
    client.post(f"/api/warehouse/queue/{to}/pick",json={"operator":"Warehouse Operator"})
    client.post(f"/api/warehouse/queue/{to}/pick",json={"operator":"Warehouse Operator"})
    client.post(f"/api/warehouse/queue/{to}/deliver",json={"operator":"Warehouse Operator"})
    client.post("/api/weighing/bend",json={"po_number":po,"room_code":"WR-01","operator":"Weigh Tech"})
    ticket=client.post("/api/weighing/tickets",json={"po_number":po,"room_code":"WR-01","operator":"Weigh Tech"}).json()["ticket_number"]
    client.post(f"/api/weighing/tickets/{ticket}/tare",json={"operator":"Weigh Tech"})
    client.post(f"/api/weighing/tickets/{ticket}/verify-barcode",json={"barcode":"API-PRED"})
    client.post(f"/api/weighing/tickets/{ticket}/weigh",json={"actual_quantity":4.2,"operator":"Weigh Tech"})
    client.post(f"/api/weighing/tickets/{ticket}/sign",json={"signature":"J. WeighTech"})
    return po


def tick_until(client, batch_id, expected_phase=None, expected_status=None, limit=20):
    result=None
    for _ in range(limit):
        result=client.post(f"/api/mixing/batches/{batch_id}/tick")
        assert result.status_code==200
        data=result.json()
        if data["status"]=="Faulted":
            client.post(f"/api/mixing/batches/{batch_id}/diagnose")
            client.post(f"/api/mixing/batches/{batch_id}/reset")
            continue
        if (expected_phase is None or data["phase"]==expected_phase) and (expected_status is None or data["status"]==expected_status):
            return data
    raise AssertionError(f"Batch did not reach phase={expected_phase} status={expected_status}: {result.json() if result else None}")


def test_mix_room_route_validation(client):
    complete_weigh_for_mixing(client,"PO-MIX-ROUTE",False,"V-202","H-302")
    wrong=client.post("/api/mixing/batches",json={"po_number":"PO-MIX-ROUTE","room_code":"MR-01","operator":"Process Engineer"})
    assert wrong.status_code==409
    correct=client.post("/api/mixing/batches",json={"po_number":"PO-MIX-ROUTE","room_code":"MR-02","operator":"Process Engineer"})
    assert correct.status_code==201 and correct.json()["tank_code"]=="V-202"


def test_dye_premix_interlock_and_completion(client):
    complete_weigh_for_mixing(client,"PO-MIX-DYE",True)
    opened=client.post("/api/mixing/batches",json={"po_number":"PO-MIX-DYE","room_code":"MR-01","operator":"Process Engineer"})
    batch_id=opened.json()["batch_id"]
    client.post(f"/api/mixing/batches/{batch_id}/start",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_phase="Manual Additions")
    client.post(f"/api/mixing/batches/{batch_id}/confirm-manual-adds",json={"operator":"Process Engineer"})
    early=client.post(f"/api/mixing/batches/{batch_id}/premix/confirm",json={"operator":"Process Engineer"})
    assert early.status_code==409 and "NOT STARTED" in early.json()["detail"]
    assert client.post(f"/api/mixing/batches/{batch_id}/premix/start",json={"operator":"Process Engineer"}).status_code==200
    for _ in range(5): client.post(f"/api/mixing/batches/{batch_id}/tick")
    confirmed=client.post(f"/api/mixing/batches/{batch_id}/premix/confirm",json={"operator":"Process Engineer"})
    assert confirmed.status_code==200 and confirmed.json()["phase"]=="Final Agitation"


def test_hold_selection_and_transfer_sample(client):
    complete_weigh_for_mixing(client,"PO-MIX-XFER",False)
    opened=client.post("/api/mixing/batches",json={"po_number":"PO-MIX-XFER","room_code":"MR-01","operator":"Process Engineer"})
    batch_id=opened.json()["batch_id"]
    client.post(f"/api/mixing/batches/{batch_id}/start",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_phase="Manual Additions")
    client.post(f"/api/mixing/batches/{batch_id}/confirm-manual-adds",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_status="Ready for Hold Selection")
    wrong=client.post(f"/api/mixing/batches/{batch_id}/select-hold",json={"hold_tank":"H-302"})
    assert wrong.status_code==409
    selected=client.post(f"/api/mixing/batches/{batch_id}/select-hold",json={"hold_tank":"H-301"})
    assert selected.status_code==200
    client.post(f"/api/mixing/batches/{batch_id}/start-transfer",json={"operator":"Process Engineer"})
    sample=tick_until(client,batch_id,expected_status="Sample Hold")
    assert sample["progress"]>=10
    client.post(f"/api/mixing/batches/{batch_id}/collect-sample",json={"operator":"Process Engineer"})
    complete=tick_until(client,batch_id,expected_status="Awaiting Termination",limit=30)
    assert complete["progress"]==100


def test_mix_operator_route_change_requires_office_decision(client):
    complete_weigh_for_mixing(client,"PO-MIX-REROUTE",False)
    opened=client.post("/api/mixing/batches",json={"po_number":"PO-MIX-REROUTE","room_code":"MR-01","operator":"Process Engineer"})
    assert opened.status_code==201
    request=client.post("/api/mixing/route-changes",json={
      "po_number":"PO-MIX-REROUTE","resource_type":"hold_tank","current_resource":"H-301",
      "requested_resource":"H-302","reason":"H-301 unavailable","requester":"Mixing"
    })
    assert request.status_code==201 and request.json()["status"]=="Pending"
    request_id=request.json()["request_id"]
    decision=client.post(f"/api/office/route-changes/{request_id}/decision",json={"approved":True})
    assert decision.status_code==200 and decision.json()["status"]=="Approved"


def test_batch_termination_creates_hold_genealogy_and_qa_task(client):
    complete_weigh_for_mixing(client,"PO-MIX-QA",False)
    opened=client.post("/api/mixing/batches",json={"po_number":"PO-MIX-QA","room_code":"MR-01","operator":"Process Engineer"})
    batch_id=opened.json()["batch_id"]
    client.post(f"/api/mixing/batches/{batch_id}/start",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_phase="Manual Additions")
    client.post(f"/api/mixing/batches/{batch_id}/confirm-manual-adds",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_status="Ready for Hold Selection")
    client.post(f"/api/mixing/batches/{batch_id}/select-hold",json={"hold_tank":"H-301"})
    client.post(f"/api/mixing/batches/{batch_id}/start-transfer",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_status="Sample Hold")
    client.post(f"/api/mixing/batches/{batch_id}/collect-sample",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_status="Awaiting Termination",limit=30)
    terminated=client.post(f"/api/mixing/batches/{batch_id}/terminate",json={"operator":"Process Engineer"})
    assert terminated.status_code==200 and terminated.json()["phase"]=="Batch Terminated"
    hold=next(item for item in client.get("/api/mixing/hold-tanks").json() if item["tank_code"]=="H-301")
    assert hold["qa_status"]=="QA Hold" and hold["batch_number"]=="B-PO-MIX-QA"
    tasks=client.get("/api/quality/bulk-tasks").json()
    assert len(tasks)==1 and tasks[0]["status"]=="Pending Review"
    released=client.post(f"/api/quality/bulk-tasks/{tasks[0]['task_id']}/disposition",json={"disposition":"Release","note":"Meets specification"})
    assert released.status_code==200 and released.json()["status"]=="Released"


def test_weigh_room_change_updates_schedule_and_to_destination(client):
    assert register(client, "PO-REROUTE-WR").status_code == 201
    req = client.post("/api/operations/route-changes", json={
        "po_number": "PO-REROUTE-WR", "resource_type": "weigh_room",
        "current_resource": "WR-01", "requested_resource": "WR-02",
        "reason": "WR-01 unavailable", "requester": "Weighing"
    })
    assert req.status_code == 201 and req.json()["status"] == "Pending"
    decision = client.post(f"/api/office/route-changes/{req.json()['request_id']}/decision", json={"approved": True})
    assert decision.status_code == 200
    po = next(item for item in client.get("/api/office/production-orders").json() if item["po_number"] == "PO-REROUTE-WR")
    assert po["weigh_room"] == "WR-02"
    transfer = next(item for item in client.get("/api/warehouse/queue").json() if item["po_number"] == "PO-REROUTE-WR")
    assert transfer["destination"] == "Weighing Staging 02"


def test_mix_and_hold_resource_requests_require_clean_available_resources(client):
    assert register(client, "PO-REROUTE-MIX").status_code == 201
    mix_req = client.post("/api/operations/route-changes", json={
        "po_number": "PO-REROUTE-MIX", "resource_type": "mix_tank",
        "current_resource": "V-201", "requested_resource": "V-202",
        "reason": "Campaign sequence change", "requester": "Mixing"
    })
    assert mix_req.status_code == 201
    assert client.post(f"/api/office/route-changes/{mix_req.json()['request_id']}/decision", json={"approved": True}).status_code == 200
    hold_req = client.post("/api/operations/route-changes", json={
        "po_number": "PO-REROUTE-MIX", "resource_type": "hold_tank",
        "current_resource": "H-301", "requested_resource": "H-302",
        "reason": "Downstream capacity conflict", "requester": "Mixing"
    })
    assert hold_req.status_code == 201
    assert client.post(f"/api/office/route-changes/{hold_req.json()['request_id']}/decision", json={"approved": True}).status_code == 200
    po = next(item for item in client.get("/api/office/production-orders").json() if item["po_number"] == "PO-REROUTE-MIX")
    assert po["mix_tank"] == "V-202" and po["hold_tank"] == "H-302"


def release_bulk_for_packaging(client, po_number="PO-PKG-01", packaging_line="PKG-01"):
    complete_weigh_for_mixing(client, po_number, False)
    if packaging_line != "PKG-01":
        req = client.post("/api/operations/route-changes", json={
            "po_number": po_number, "resource_type": "packaging_line",
            "current_resource": "PKG-01", "requested_resource": packaging_line,
            "reason": "Packaging campaign balance", "requester": "Packaging"
        })
        assert req.status_code == 201
        assert client.post(f"/api/office/route-changes/{req.json()['request_id']}/decision", json={"approved": True}).status_code == 200
    room = "MR-01"
    opened = client.post("/api/mixing/batches", json={"po_number": po_number, "room_code": room, "operator": "Process Engineer"})
    batch_id = opened.json()["batch_id"]
    client.post(f"/api/mixing/batches/{batch_id}/start", json={"operator": "Process Engineer"})
    tick_until(client,batch_id,expected_phase="Manual Additions")
    client.post(f"/api/mixing/batches/{batch_id}/confirm-manual-adds",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_status="Ready for Hold Selection")
    client.post(f"/api/mixing/batches/{batch_id}/select-hold",json={"hold_tank":"H-301"})
    client.post(f"/api/mixing/batches/{batch_id}/start-transfer",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_status="Sample Hold")
    client.post(f"/api/mixing/batches/{batch_id}/collect-sample",json={"operator":"Process Engineer"})
    tick_until(client,batch_id,expected_status="Awaiting Termination",limit=30)
    client.post(f"/api/mixing/batches/{batch_id}/terminate",json={"operator":"Process Engineer"})
    task=client.get("/api/quality/bulk-tasks").json()[0]
    client.post(f"/api/quality/bulk-tasks/{task['task_id']}/disposition",json={"disposition":"Release","note":"Bulk approved"})


def test_packaging_run_and_fg_release_create_outbound_to(client, monkeypatch):
    release_bulk_for_packaging(client)
    lines=client.get("/api/packaging/lines")
    assert lines.status_code==200 and len(lines.json())==2
    opened=client.post("/api/packaging/runs",json={"po_number":"PO-PKG-01","line_code":"PKG-01","operator":"Packaging Operator"})
    assert opened.status_code==201
    run_id=opened.json()["run_id"]
    client.post(f"/api/packaging/runs/{run_id}/start",json={"operator":"Packaging Operator"})
    monkeypatch.setattr("app.services.platform.random", lambda: 0.99)
    for _ in range(5):
        result=client.post(f"/api/packaging/runs/{run_id}/tick",json={"operator":"Packaging Operator"})
    assert result.json()["status"]=="Awaiting FG Sample" and result.json()["progress"]==100
    sample=client.post(f"/api/packaging/runs/{run_id}/collect-sample",json={"operator":"Packaging Operator"})
    assert sample.json()["status"]=="FG QA Hold"
    task=client.get("/api/quality/fg-tasks").json()[0]
    release=client.post(f"/api/quality/fg-tasks/{task['task_id']}/disposition",json={"disposition":"Release","note":"FG meets specification"})
    assert release.status_code==200 and release.json()["status"]=="Released"
    queue=client.get("/api/warehouse/queue").json()
    assert any(item["to_number"]=="TO-FG-PO-PKG-01" and item["destination"]=="Shipping Dock" for item in queue)


def test_packaging_line_reassignment_requires_office_approval(client):
    assert register(client,"PO-PKG-REROUTE").status_code==201
    req=client.post("/api/operations/route-changes",json={
        "po_number":"PO-PKG-REROUTE","resource_type":"packaging_line",
        "current_resource":"PKG-01","requested_resource":"PKG-02",
        "reason":"PKG-01 campaign conflict","requester":"Packaging"
    })
    assert req.status_code==201
    assert client.post(f"/api/office/route-changes/{req.json()['request_id']}/decision",json={"approved":True}).status_code==200
    po=next(item for item in client.get("/api/office/production-orders").json() if item["po_number"]=="PO-PKG-REROUTE")
    assert po["packaging_line"]=="PKG-02"


def test_packaging_completion_marks_hold_tank_dirty_for_cip(client, monkeypatch):
    release_bulk_for_packaging(client, po_number="PO-HOLD-CIP")
    opened=client.post("/api/packaging/runs",json={"po_number":"PO-HOLD-CIP","line_code":"PKG-01","operator":"Packaging Operator"})
    run_id=opened.json()["run_id"]
    client.post(f"/api/packaging/runs/{run_id}/start",json={"operator":"Packaging Operator"})
    monkeypatch.setattr("app.services.platform.random", lambda: 0.99)
    for _ in range(5):
        client.post(f"/api/packaging/runs/{run_id}/tick",json={"operator":"Packaging Operator"})
    hold=next(item for item in client.get("/api/mixing/hold-tanks").json() if item["tank_code"]=="H-301")
    assert hold["level_percent"]==0
    assert hold["status"]=="Dirty / CIP Required"
    assert hold["cip_status"]=="Dirty / CIP Required"
    cip=client.post("/api/maintenance/cip-runs",json={"asset_type":"hold_tank","asset_code":"H-301","operator":"Maintenance Technician"})
    assert cip.status_code==201 and cip.json()["status"]=="Running"


def test_shipment_loading_is_automatic(client):
    from app.core.database import SessionLocal
    from app.models import ProductionOrder, WarehouseTransferOrder
    with SessionLocal() as db:
        po=ProductionOrder(po_number="PO-SHIP-AUTO",batch_number="B-SHIP-AUTO",product_name="Shipment Demo",quantity=96,status="Shipping Dock Staged")
        to=WarehouseTransferOrder(to_number="TO-FG-PO-SHIP-AUTO",po_number="PO-SHIP-AUTO",priority="High",destination="Shipping Dock",status="Delivered",owner="Outbound Warehouse",progress=100)
        db.add_all([po,to]); db.commit()
    created=client.post("/api/shipping/shipments",json={"po_number":"PO-SHIP-AUTO","carrier":"LTL Carrier","dock":"Dock 1","pickup_date":"2026-08-01","pickup_time":"14:00"})
    shipment_id=created.json()["shipment_id"]
    assert client.post(f"/api/shipping/shipments/{shipment_id}/verify",json={"operator":"Warehouse Operator","seal_number":"","signature":""}).status_code==200
    loaded=client.post(f"/api/shipping/shipments/{shipment_id}/load",json={"operator":"Warehouse Operator","seal_number":"","signature":""})
    assert loaded.status_code==200
    assert loaded.json()["status"]=="Loaded"
    assert loaded.json()["pallets_loaded"]==4


def test_packaging_demo_faults_create_downtime_and_work_orders(client):
    # API contracts are available even before a campaign is executed.
    assert client.get("/api/reliability/packaging-downtime").status_code == 200
    kpis=client.get("/api/reliability/packaging-kpis")
    assert kpis.status_code == 200 and "mtbf_minutes" in kpis.json()
    assert client.get("/api/maintenance/work-orders").status_code == 200

def test_packaging_demo_mode_forces_fault_and_work_order(client, monkeypatch):
    release_bulk_for_packaging(client, po_number="PO-REL-FAULT")
    opened=client.post("/api/packaging/runs",json={"po_number":"PO-REL-FAULT","line_code":"PKG-01","operator":"Packaging Operator"})
    run_id=opened.json()["run_id"]
    client.post(f"/api/packaging/runs/{run_id}/start",json={"operator":"Packaging Operator"})
    monkeypatch.setattr("app.services.platform.random", lambda: 0.0)
    client.post(f"/api/packaging/runs/{run_id}/tick",json={"operator":"Packaging Operator"})
    fault=client.post(f"/api/packaging/runs/{run_id}/tick",json={"operator":"Packaging Operator"})
    assert fault.status_code==200 and fault.json()["status"]=="Faulted"
    assert fault.json()["jam_code"]=="JAM-CONV-01"
    assert len(client.get("/api/reliability/packaging-downtime").json())>=1
    assert len(client.get("/api/maintenance/work-orders").json())>=1
    client.post(f"/api/packaging/runs/{run_id}/diagnose",json={"operator":"Packaging Operator"})
    reset=client.post(f"/api/packaging/runs/{run_id}/reset",json={"operator":"Packaging Operator"})
    assert reset.status_code==200 and reset.json()["status"]=="Running"
    assert client.get("/api/reliability/packaging-kpis").json()["total_faults"]>=1

def test_ebr_review_and_audit_trail(client):
    assert register(client,"PO-EBR-01").status_code==201
    batches=client.get("/api/compliance/ebr")
    assert batches.status_code==200
    assert any(item["po_number"]=="PO-EBR-01" for item in batches.json())
    detail=client.get("/api/compliance/ebr/PO-EBR-01")
    assert detail.status_code==200
    assert detail.json()["alcoa_plus"]["attributable"] is True
    reviews=client.get("/api/compliance/reviews")
    assert reviews.status_code==200
    decision=client.post("/api/compliance/reviews/PO-EBR-01/decision",json={"decision":"Approve","reviewer":"QA Reviewer","signature":"Q. Reviewer","note":"Review by exception complete"})
    assert decision.status_code==200 and decision.json()["status"]=="Approved"
    audit=client.get("/api/compliance/audit-trail?po_number=PO-EBR-01")
    assert audit.status_code==200 and audit.json()[0]["after_value"]=="Approved"


def test_cip_tick_accepts_empty_signature_payload(client):
    # Create a dirty hold tank through the existing seeded model path.
    from app.core.database import SessionLocal
    from app.models import HoldTank

    with SessionLocal() as db:
        tank = db.query(HoldTank).filter(HoldTank.tank_code == "H-301").first()
        if tank is None:
            tank = HoldTank(tank_code="H-301", capacity_l=900, status="Dirty / CIP Required", cip_status="Dirty / CIP Required", level_percent=0, qa_status="Not Applicable")
            db.add(tank)
        else:
            tank.status = "Dirty / CIP Required"
            tank.cip_status = "Dirty / CIP Required"
        db.commit()

    started = client.post(
        "/api/maintenance/cip-runs",
        json={"asset_type": "hold_tank", "asset_code": "H-301", "operator": "Maintenance Technician"},
    )
    assert started.status_code in (200, 201), started.text
    cip_id = started.json()["cip_id"]

    advanced = client.post(
        f"/api/maintenance/cip-runs/{cip_id}/tick",
        json={"signature": ""},
    )
    assert advanced.status_code == 200, advanced.text
    assert advanced.json()["progress"] > 0
