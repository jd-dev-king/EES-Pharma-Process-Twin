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
 productionOrders:()=>request<T.ProductionOrder[]>("/office/production-orders"),
 registerProductionOrder:(p:T.ProductionOrderPayload)=>request<T.ProductionOrder>("/office/register-po",{method:"POST",body:JSON.stringify(p)}),
 poWorkspace:(po:string)=>request<T.ProductionOrderWorkspace>(`/office/production-orders/${po}/workspace`),
 substitutions:()=>request<T.SubstitutionRequest[]>("/office/substitutions"),
 decideSubstitution:(id:string,approved:boolean)=>request<T.SubstitutionRequest>(`/office/substitutions/${id}/decision`,{method:"POST",body:JSON.stringify({approved,decision_note:approved?"Approved by Office":"Denied by Office"})}),
 warehouseQueue:()=>request<T.WarehouseTransferOrder[]>("/warehouse/queue"), inventory:()=>request<T.InventoryLot[]>("/warehouse/inventory"),
 warehouseAction:(to:string,action:string)=>request<T.WarehouseTransferOrder>(`/warehouse/queue/${to}/${action}`,{method:"POST",body:JSON.stringify({operator:"Warehouse Operator"})}),
 requestSubstitution:(po:string,material_code:string,proposed_lot:string)=>request<T.SubstitutionRequest>("/warehouse/substitutions",{method:"POST",body:JSON.stringify({po_number:po,material_code,proposed_lot,reason:"Scheduled lot unavailable or on QA hold"})}),
 events:()=>request<T.PlatformEvent[]>("/events?limit=40"),notifications:()=>request<T.NotificationRecord[]>("/notifications"),
 checkSchedulerConflicts:(p:T.SchedulerConflictPayload)=>request<T.SchedulerConflictResponse>("/scheduler/check-conflicts",{method:"POST",body:JSON.stringify(p)}),
 bendIntoWeighRoom:(po_number:string,room_code:string,operator:string)=>request<T.WarehouseTransferOrder>("/weighing/bend",{method:"POST",body:JSON.stringify({po_number,room_code,operator})}),
 weighRooms:()=>request<T.WeighRoom[]>("/weighing/rooms"),
 weighTickets:()=>request<T.WeighTicket[]>("/weighing/tickets"),
 openWeighTicket:(po_number:string,room_code:string,operator:string)=>request<T.WeighTicket>("/weighing/tickets",{method:"POST",body:JSON.stringify({po_number,room_code,operator})}),
 weighTicketWorkspace:(ticket:string)=>request<T.WeighTicketWorkspace>(`/weighing/tickets/${ticket}`),
 tareWeighTicket:(ticket:string,operator:string)=>request<T.WeighTicket>(`/weighing/tickets/${ticket}/tare`,{method:"POST",body:JSON.stringify({operator})}),
 verifyWeighBarcode:(ticket:string,barcode:string)=>request<T.WeighTicketLine>(`/weighing/tickets/${ticket}/verify-barcode`,{method:"POST",body:JSON.stringify({barcode})}),
 weighMaterial:(ticket:string,actual_quantity:number,operator:string)=>request<T.WeighTicket>(`/weighing/tickets/${ticket}/weigh`,{method:"POST",body:JSON.stringify({actual_quantity,operator})}),
 signWeighTicket:(ticket:string,signature:string)=>request<T.WeighTicket>(`/weighing/tickets/${ticket}/sign`,{method:"POST",body:JSON.stringify({signature})}),
 mixRooms:()=>request<T.MixRoom[]>("/mixing/rooms"),
 holdTanks:()=>request<T.HoldTank[]>("/mixing/hold-tanks"),
 mixQueue:()=>request<T.ProductionOrder[]>("/mixing/queue"),
 mixBatches:()=>request<T.MixBatch[]>("/mixing/batches"),
 openMixBatch:(po_number:string,room_code:string,operator:string)=>request<T.MixBatch>("/mixing/batches",{method:"POST",body:JSON.stringify({po_number,room_code,operator})}),
 mixWorkspace:(batchId:string)=>request<T.MixWorkspace>(`/mixing/batches/${batchId}`),
 mixAction:(batchId:string,action:string,operator="Process Engineer")=>request<T.MixBatch>(`/mixing/batches/${batchId}/${action}`,{method:"POST",body:JSON.stringify({operator})}),
 confirmBulkPg:(batchId:string,operator="Process Engineer")=>request<T.MixBatch>(`/mixing/batches/${batchId}/confirm-bulk-pg`,{method:"POST",body:JSON.stringify({operator})}),
 tickMixBatch:(batchId:string)=>request<T.MixBatch>(`/mixing/batches/${batchId}/tick`,{method:"POST"}),
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
 demoReset:(payload:{operator:string;reason:string;confirmation:string})=>request<{status:string;message:string;operator:string}>("/system/demo-reset",{method:"POST",body:JSON.stringify(payload)}),

}