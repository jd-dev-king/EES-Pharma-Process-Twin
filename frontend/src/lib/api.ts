import type * as T from "../types";
function normalizeConfiguredUrl(value: string): string {
  const trimmed = value.trim();
  // Defensive cleanup for accidentally pasted Markdown links such as
  // [http://127.0.0.1:8000](http://127.0.0.1:8000).
  const markdown = trimmed.match(/^\[(https?:\/\/[^\]]+)\]\(https?:\/\/[^)]+\)$/);
  return (markdown?.[1] ?? trimmed).replace(/\/$/, "");
}

const configuredBase = normalizeConfiguredUrl(
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000",
);

const BASE = configuredBase.endsWith("/api")
  ? configuredBase
  : `${configuredBase}/api`;

const DEMO_SESSION_STORAGE_KEY = "ees_pharma_demo_session_id";

function getDemoSessionId(): string {
  let sessionId = localStorage.getItem(DEMO_SESSION_STORAGE_KEY);

  if (!sessionId) {
    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    sessionId = `DEMO-${token}`;
    localStorage.setItem(DEMO_SESSION_STORAGE_KEY, sessionId);
  }

  return sessionId;
}

export function currentDemoSessionId(): string {
  return getDemoSessionId();
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function request<R>(path: string, init: RequestInit = {}): Promise<R> {
  const headers = new Headers(init.headers);

  // Only add JSON content type when a request actually has a body.
  // This avoids unnecessary browser preflight requests for simple GET calls.
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  headers.set("X-EES-Demo-Session", getDemoSessionId());

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Preserve the HTTP status message when the body is not JSON.
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as R;
}
export const api={
 health:()=>request<T.HealthResponse>("/health"),
 parkingStatus:()=>request<T.ParkingStatus>("/facility/parking-status"),
 securityStatus:()=>request<T.SecurityStatus>("/facility/security-status"),
 trainingRoles:async()=> (await request<{roles:string[]}>("/training/roles")).roles,
 startTrainingSession:(role:string,difficulty:string)=>request<T.TrainingSession>("/training/session",{method:"POST",body:JSON.stringify({role,difficulty})}),
 advanceTrainingSession:(sessionId:string,correct=true,note="")=>request<T.TrainingSession>(`/training/session/${sessionId}/advance`,{method:"POST",body:JSON.stringify({correct,note})}),
 formulationOptions:()=>request<T.FormulationOptions>("/office/formulation-options"),
 nextPo:()=>request<{po_number:string}>("/office/next-po"),
 formulationVariants:()=>request<{variants:T.FormulationVariant[]}>("/office/formulation-variants"),
 productionOrders:()=>request<T.ProductionOrder[]>("/office/production-orders"),
 campaigns:()=>request<T.ProductionCampaign[]>("/office/campaigns"),
 createCampaign:(po_numbers:string[])=>request<T.ProductionCampaign>("/office/campaigns",{method:"POST",body:JSON.stringify({po_numbers})}),
 createProductionRun:(payload:T.ProductionOrderPayload,campaign_size:1|2|3|4)=>request<T.ProductionRunResponse>("/office/production-runs",{method:"POST",body:JSON.stringify({...payload,campaign_size})}),
 registerProductionOrder:(p:T.ProductionOrderPayload)=>request<T.ProductionOrder>("/office/register-po",{method:"POST",body:JSON.stringify(p)}),
 poWorkspace:(po:string)=>request<T.ProductionOrderWorkspace>(`/office/production-orders/${po}/workspace`),
 substitutions:()=>request<T.SubstitutionRequest[]>("/office/substitutions"),
 decideSubstitution:(id:string,approved:boolean)=>request<T.SubstitutionRequest>(`/office/substitutions/${id}/decision`,{method:"POST",body:JSON.stringify({approved,decision_note:approved?"Approved by Office":"Denied by Office"})}),
 warehouseQueue:()=>request<T.WarehouseTransferOrder[]>("/warehouse/queue"), inventory:()=>request<T.InventoryLot[]>("/warehouse/inventory"),
 warehouseAction:(to:string,action:string)=>request<T.WarehouseTransferOrder>(`/warehouse/queue/${to}/${action}`,{method:"POST",body:JSON.stringify({operator:"Warehouse Operator"})}),
 requestSubstitution:(po:string,material_code:string,proposed_lot:string)=>request<T.SubstitutionRequest>("/warehouse/substitutions",{method:"POST",body:JSON.stringify({po_number:po,material_code,proposed_lot,reason:"Scheduled lot unavailable or on QA hold"})}),
 events:()=>request<T.PlatformEvent[]>("/events?limit=40"),notifications:()=>request<T.NotificationRecord[]>("/notifications"),
 mesBatch:(po:string)=>request<T.MESBatchRecord>(`/mes/batch/${po}`),
 checkSchedulerConflicts:(p:T.SchedulerConflictPayload)=>request<T.SchedulerConflictResponse>("/scheduler/check-conflicts",{method:"POST",body:JSON.stringify(p)}),
 bendIntoWeighRoom:(po_number:string,room_code:string,operator:string)=>request<T.WarehouseTransferOrder>("/weighing/bend",{method:"POST",body:JSON.stringify({po_number,room_code,operator})}),
 weighRooms:()=>request<T.WeighRoom[]>("/weighing/rooms"),
 weighTickets:()=>request<T.WeighTicket[]>("/weighing/tickets"),
 openWeighTicket:(po_number:string,room_code:string,operator:string)=>request<T.WeighTicket>("/weighing/tickets",{method:"POST",body:JSON.stringify({po_number,room_code,operator})}),
 weighTicketWorkspace:(ticket:string)=>request<T.WeighTicketWorkspace>(`/weighing/tickets/${ticket}`),
 tareWeighTicket:(ticket:string,operator:string)=>request<T.WeighTicket>(`/weighing/tickets/${ticket}/tare`,{method:"POST",body:JSON.stringify({operator})}),
 verifyWeighBarcode:(ticket:string,barcode:string)=>request<T.WeighTicketLine>(`/weighing/tickets/${ticket}/verify-barcode`,{method:"POST",body:JSON.stringify({barcode})}),
 weighMaterial:(ticket:string,actual_quantity:number,operator:string)=>request<T.WeighTicket>(`/weighing/tickets/${ticket}/weigh`,{method:"POST",body:JSON.stringify({actual_quantity,operator})}),
 requestWeighShortage:(p:{po_number:string;material_code:string;material_name:string;required_remaining:number;available_quantity:number;requester:string})=>request<{status:string;shortage:number}>("/weighing/shortage-request",{method:"POST",body:JSON.stringify(p)}),
 signWeighTicket:(ticket:string,signature:string)=>request<T.WeighTicket>(`/weighing/tickets/${ticket}/sign`,{method:"POST",body:JSON.stringify({signature})}),
 materialPRs:()=>request<T.MaterialPR[]>("/weighing/material-prs"),
 createMaterialPR:(po_number:string,campaign_id:string,operator:string,lines:T.MaterialPRLineDraft[])=>request<T.MaterialPR>("/weighing/material-prs",{method:"POST",body:JSON.stringify({po_number,campaign_id,operator,lines})}),
 acceptCampaignWorkload:(campaign_id:string,operator:string)=>request<T.ProductionCampaign>(`/weighing/campaigns/${campaign_id}/accept`,{method:"POST",body:JSON.stringify({operator})}),
 campaignPlantInventory:(campaign_id:string)=>request<T.CampaignPlantInventory>(`/weighing/campaigns/${campaign_id}/plant-inventory`),
 campaignStagingReadiness:(campaign_id:string)=>request<any>(`/weighing/campaigns/${campaign_id}/staging-readiness`),
 campaignWeighSequence:(campaign_id:string)=>request<any>(`/weighing/campaigns/${campaign_id}/weigh-sequence`),
 syncCampaignWeighing:(campaign_id:string,room_code:string,operator:string)=>request<any>(`/weighing/campaigns/${campaign_id}/sync-weighing`,{method:"POST",body:JSON.stringify({room_code,operator})}),
 bendCampaignToWeighRoom:(campaign_id:string,room_code:string,operator:string)=>request<any>(`/weighing/campaigns/${campaign_id}/bend-to-room`,{method:"POST",body:JSON.stringify({room_code,operator})}),
 requestCampaignSeparation:(campaign_id:string,po_number:string,requester:string,reason:string)=>request<T.CampaignSeparationRequest>(`/weighing/campaigns/${campaign_id}/separation-request`,{method:"POST",body:JSON.stringify({po_number,requester,reason})}),
 campaignSeparationRequests:()=>request<T.CampaignSeparationRequest[]>("/office/campaign-separation-requests"),
 decideCampaignSeparation:(id:string,approved:boolean,note="")=>request<T.CampaignSeparationRequest>(`/office/campaign-separation-requests/${id}/decision`,{method:"POST",body:JSON.stringify({approved,decision_note:note})}),
 requestWeighSubstitution:(po:string,material_code:string,proposed_lot:string)=>request<T.SubstitutionRequest>("/weighing/substitutions",{method:"POST",body:JSON.stringify({po_number:po,material_code,proposed_lot,reason:"Weigh operator requests approved alternative based on plant inventory shortage"})}),
 requestRndAlternativeEvaluation:(payload:{campaign_id:string;po_number:string;original_material_code:string;candidate_code:string;requester:string;note:string})=>request<{status:string;candidate_code:string;candidate_name:string}>("/weighing/rnd-alternative-request",{method:"POST",body:JSON.stringify(payload)}),
 materialPRWorkspace:(pr:string)=>request<T.MaterialPRWorkspace>(`/weighing/material-prs/${pr}`),
 materialPositions:()=>request<T.MaterialPosition[]>("/inventory/positions"),
 materialMovements:()=>request<T.MaterialMovement[]>("/inventory/movements"),
 bendVestibuleToStaging:(container_id:string,operator:string)=>request<T.MaterialPosition>("/weighing/material-move/vestibule-to-staging",{method:"POST",body:JSON.stringify({container_id,operator})}),
 bendStagingToRoom:(container_id:string,room_code:string,operator:string,po_number:string)=>request<T.MaterialPosition>("/weighing/material-move/staging-to-room",{method:"POST",body:JSON.stringify({container_id,room_code,operator,po_number})}),
 mixRooms:()=>request<T.MixRoom[]>("/mixing/rooms"),
 holdTanks:()=>request<T.HoldTank[]>("/mixing/hold-tanks"),
 mixQueue:()=>request<T.ProductionOrder[]>("/mixing/queue"),
 mixBatches:()=>request<T.MixBatch[]>("/mixing/batches"),
 openMixBatch:(po_number:string,room_code:string,operator:string)=>request<T.MixBatch>("/mixing/batches",{method:"POST",body:JSON.stringify({po_number,room_code,operator})}),
 mixWorkspace:(batchId:string)=>request<T.MixWorkspace>(`/mixing/batches/${batchId}`),
 verifyMixReadiness:(batchId:string,operator="Process Engineer")=>request<T.MixBatch>(`/mixing/batches/${batchId}/verify-readiness`,{method:"POST",body:JSON.stringify({operator})}),
 mixAction:(batchId:string,action:string,operator="Process Engineer")=>request<T.MixBatch>(`/mixing/batches/${batchId}/${action}`,{method:"POST",body:JSON.stringify({operator})}),
 confirmBulkPg:(batchId:string,operator="Process Engineer")=>request<T.MixBatch>(`/mixing/batches/${batchId}/confirm-bulk-pg`,{method:"POST",body:JSON.stringify({operator})}),
 mixPhaseAction:(batchId:string,action:string,operator="Process Engineer")=>request<T.MixBatch>(`/mixing/batches/${batchId}/phase/${action}`,{method:"POST",body:JSON.stringify({operator})}),
 tickMixBatch:(batchId:string)=>request<T.MixBatch>(`/mixing/batches/${batchId}/tick`,{method:"POST"}),
 confirmPremixWater:(batchId:string,pot:"premix"|"rinse",operator:string)=>request<T.PremixRun>(`/mixing/batches/${batchId}/premix/water/${pot}`,{method:"POST",body:JSON.stringify({operator})}),
 startPremix:(batchId:string,operator:string)=>request<T.PremixRun>(`/mixing/batches/${batchId}/premix/start`,{method:"POST",body:JSON.stringify({operator})}),
 confirmPremix:(batchId:string,operator:string)=>request<T.MixBatch>(`/mixing/batches/${batchId}/premix/confirm`,{method:"POST",body:JSON.stringify({operator})}),
 selectHoldTank:(batchId:string,hold_tank:string)=>request<T.MixBatch>(`/mixing/batches/${batchId}/select-hold`,{method:"POST",body:JSON.stringify({hold_tank})}),
 diagnoseMixFault:(batchId:string)=>request<T.MixBatch>(`/mixing/batches/${batchId}/diagnose`,{method:"POST"}),
 resetMixFault:(batchId:string)=>request<T.MixBatch>(`/mixing/batches/${batchId}/reset`,{method:"POST"}),
 routeChanges:()=>request<T.RouteChangeRequest[]>("/office/route-changes"),
 requestRouteChange:(payload:Omit<T.RouteChangeRequest,"id"|"request_id"|"status"|"created_at">)=>request<T.RouteChangeRequest>("/operations/route-changes",{method:"POST",body:JSON.stringify(payload)}),
 decideRouteChange:(requestId:string,approved:boolean)=>request<T.RouteChangeRequest>(`/office/route-changes/${requestId}/decision`,{method:"POST",body:JSON.stringify({approved})}),
 terminateMixBatch:(batchId:string,operator:string)=>request<T.MixBatch>(`/mixing/batches/${batchId}/terminate`,{method:"POST",body:JSON.stringify({operator})}),
 qaBulkTasks:()=>request<T.QABulkTask[]>("/quality/bulk-tasks"),
 decideQABulkTask:(taskId:string,disposition:"Release"|"Hold"|"Reject",note:string)=>request<T.QABulkTask>(`/quality/bulk-tasks/${taskId}/qa-disposition`,{method:"POST",body:JSON.stringify({disposition,note})}),
 rndMaterialCatalog:()=>request<T.RnDMaterialCatalog>("/rnd/material-catalog"),
 rndSampleBatches:()=>request<T.RnDSampleBatch[]>("/rnd/sample-batches"),
 createRndSampleBatch:(payload:any)=>request<T.RnDSampleBatch>("/rnd/sample-batches",{method:"POST",body:JSON.stringify(payload)}),
 rndSampleAction:(id:string,action:string,result="")=>request<T.RnDSampleBatch>(`/rnd/sample-batches/${id}/${action}`,{method:"POST",body:JSON.stringify({result})}),
 packagingComponents:()=>request<T.PackagingComponent[]>("/packaging/components"),
 packagingLines:()=>request<T.PackagingLine[]>("/packaging/lines"),
 packagingQueue:()=>request<T.ProductionOrder[]>("/packaging/queue"),
 packagingRuns:()=>request<T.PackagingRun[]>("/packaging/runs"),
 openPackagingRun:(po_number:string,line_code:string,operator:string)=>request<T.PackagingRun>("/packaging/runs",{method:"POST",body:JSON.stringify({po_number,line_code,operator})}),
 packagingWorkspace:(runId:string)=>request<T.PackagingWorkspace>(`/packaging/runs/${runId}`),
 packagingAction:(runId:string,action:string,operator:string)=>request<T.PackagingRun>(`/packaging/runs/${runId}/${action}`,{method:"POST",body:JSON.stringify({operator})}),
 qaFgTasks:()=>request<T.QAFinishedGoodsTask[]>("/quality/fg-tasks"),
 decideQaFgTask:(taskId:string,disposition:"Release"|"Hold"|"Reject",note:string)=>request<T.QAFinishedGoodsTask>(`/quality/fg-tasks/${taskId}/qa-disposition`,{method:"POST",body:JSON.stringify({disposition,note})}),
 cipRuns:()=>request<T.CIPRun[]>("/maintenance/cip-runs"),
 startCip:(asset_type:string,asset_code:string,operator:string)=>request<T.CIPRun>("/maintenance/cip-runs",{method:"POST",body:JSON.stringify({asset_type,asset_code,operator})}),
 cipAction:(cip_id:string,action:string,signature="")=>request<T.CIPRun>(`/maintenance/cip-runs/${cip_id}/${action}`,{method:"POST",body:JSON.stringify({signature})}),
 shippingReady:()=>request<T.ProductionOrder[]>("/shipping/ready"),
 shipments:()=>request<T.Shipment[]>("/shipping/shipments"),
 scheduleShipment:(payload:{po_number:string;carrier:string;dock:string;pickup_date:string;pickup_time:string})=>request<T.Shipment>("/shipping/shipments",{method:"POST",body:JSON.stringify(payload)}),
 shipmentAction:(shipment_id:string,action:string,payload:{operator:string;seal_number?:string;signature?:string})=>request<T.Shipment>(`/shipping/shipments/${shipment_id}/${action}`,{method:"POST",body:JSON.stringify(payload)}),
 packagingDowntime:()=>request<T.PackagingDowntimeEvent[]>("/reliability/packaging-downtime"),
 packagingKpis:()=>request<T.PackagingReliabilityKPI>("/reliability/packaging-kpis"),
 maintenanceWorkOrders:()=>request<T.MaintenanceWorkOrder[]>("/maintenance/work-orders"),
 maintenanceWorkOrderAction:(work_order_id:string,action:string,technician:string,resolution="")=>request<T.MaintenanceWorkOrder>(`/maintenance/work-orders/${work_order_id}/action`,{method:"POST",body:JSON.stringify({action,technician,resolution})}),

 ebrBatches:(search="")=>request<T.EBRBatchSummary[]>(`/compliance/ebr?search=${encodeURIComponent(search)}`),
 ebrDetail:(po:string)=>request<T.EBRBatchDetail>(`/compliance/ebr/${po}`),
 batchReviews:()=>request<T.BatchReview[]>("/compliance/reviews"),
 decideBatchReview:(po:string,payload:{decision:string;reviewer:string;signature:string;note:string})=>request<T.BatchReview>(`/compliance/reviews/${po}/decision`,{method:"POST",body:JSON.stringify(payload)}),
 auditTrail:(po="",search="")=>request<T.AuditTrailEntry[]>(`/compliance/audit-trail?po_number=${encodeURIComponent(po)}&search=${encodeURIComponent(search)}`),

 bulkTanks:()=>request<T.BulkTank[]>("/bulk/tanks"),
 resetBulkTank:(tankCode:string,payload:{operator:string;reason:string})=>request<T.BulkTank>(`/bulk/tanks/${tankCode}/reset`,{method:"POST",body:JSON.stringify(payload)}),
 bulkDeliveries:()=>request<T.BulkDelivery[]>("/bulk/deliveries"),
 scheduleBulkDelivery:(payload:any)=>request<T.BulkDelivery>("/bulk/deliveries",{method:"POST",body:JSON.stringify(payload)}),
 inspectBulkDelivery:(id:string)=>request<T.BulkDelivery>(`/bulk/deliveries/${id}/inspect`,{method:"POST",body:JSON.stringify({tanker_verified:true,material_verified:true,seal_intact:true,coa_verified:true,temperature_accepted:true})}),
 bulkDeliveryAction:(id:string,action:string)=>request<T.BulkDelivery>(`/bulk/deliveries/${id}/actions/${action}`,{method:"POST"}),
 decideBulkDelivery:(id:string,disposition:string)=>request<T.BulkDelivery>(`/bulk/deliveries/${id}/qa-disposition`,{method:"POST",body:JSON.stringify({disposition})}),
 bulkTransfers:()=>request<T.BulkTransfer[]>("/bulk/transfers"),
 createBulkTransfer:(payload:any)=>request<T.BulkTransfer>("/bulk/transfers",{method:"POST",body:JSON.stringify(payload)}),
 verifyBulkTransfer:(id:string)=>request<T.BulkTransfer>(`/bulk/transfers/${id}/verify`,{method:"POST",body:JSON.stringify({identity_verified:true,qa_release_verified:true,hose_connected:true})}),
 bulkTransferAction:(id:string,action:string)=>request<T.BulkTransfer>(`/bulk/transfers/${id}/${action}`,{method:"POST"}),
 demoReset:(payload:{operator:string;reason:string;confirmation:string})=>request<{
 status:string;
 message:string;
 operator:string;
 request_id:string;
 session_id:string;
 po_numbers:string[];
 campaign_ids:string[];
 admin_reconciliation_required:boolean;
}>("/system/demo-reset",{method:"POST",body:JSON.stringify(payload)}),

};
