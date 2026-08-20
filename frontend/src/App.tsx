import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SectionCard } from "./components/SectionCard";
import { StatusBadge } from "./components/StatusBadge";
import { AutomationCenter } from "./automation/AutomationCenter";
import { ProcessOverview } from "./process-overview/ProcessOverview";
import { DigitalTwinScene } from "./digital-twin/DigitalTwinScene";
import { HistorianCenter } from "./historian/HistorianCenter";
import { OperationalIntelligence } from "./intelligence/OperationalIntelligence";
import { SustainabilityCenter } from "./sustainability/SustainabilityCenter";
import { WorkforceCenter } from "./workforce/WorkforceCenter";
import { WorkforceErrorBoundary } from "./workforce/WorkforceErrorBoundary";
import { ReleaseReadinessCenter } from "./readiness/ReleaseReadinessCenter";
import { SecurityCommandCenter } from "./security/SecurityCommandCenter";
import { ApiError, api } from "./lib/api";
import type * as T from "./types";

type ZoneId =
  | "command"
  | "twin"
  | "security"
  | "office"
  | "warehouse"
  | "weighing"
  | "mixing"
  | "bulk"
  | "packaging"
  | "quality"
  | "rnd"
  | "automation"
  | "lean"
  | "shipping"
  | "compliance"
  | "analytics"
  | "thread"
  | "alerts"
  | "historian"
  | "intelligence"
  | "sustainability"
  | "workforce"
  | "readiness";

interface ZoneDefinition {
  id: ZoneId;
  label: string;
  shortLabel: string;
  description: string;
  status: "live" | "planned";
}

const zones: ZoneDefinition[] = [
  { id: "command", label: "Enterprise Command Center", shortLabel: "Command", description: "Enterprise overview and digital thread", status: "live" },
  { id: "readiness", label: "Release Readiness & Demo Administration", shortLabel: "Release", description: "Controlled demo reset, validation gates, documentation, and public-release preparation", status: "live" },
  { id: "security", label: "Security Command Center", shortLabel: "Security", description: "Parking access, active occupants, security reviews, and gate activity", status: "live" },
  { id: "twin", label: "Immersive 3D Plant Digital Twin", shortLabel: "3D Twin", description: "Interactive isometric facility, live equipment state, camera presets, and asset navigation", status: "live" },
  { id: "office", label: "Office & Production Scheduling", shortLabel: "Office", description: "PO registration, materials, approvals, and routing", status: "live" },
  { id: "warehouse", label: "Warehouse Black Zone", shortLabel: "Warehouse", description: "Inventory, FEFO, transfer orders, and delivery", status: "live" },
  { id: "weighing", label: "Weighing & Dispensing", shortLabel: "Weighing", description: "Controlled rooms, tickets, tare, barcode, and signatures", status: "live" },
  { id: "bulk", label: "Bulk Materials Receiving & Tank Farm", shortLabel: "Bulk", description: "Tanker inspection, QA release, tank inventory, and liquid transfer", status: "live" },
  { id: "mixing", label: "Premix & Mixing White Zone", shortLabel: "Mixing", description: "Automatic recipe execution, premix, PLC faults, and hold transfer", status: "live" },
  { id: "packaging", label: "Packaging Grey Zone", shortLabel: "Packaging", description: "Automatic filling, jams, FG sampling, and campaign release", status: "live" },
  { id: "quality", label: "QA / QC Laboratories", shortLabel: "Quality", description: "Bulk sample review, QA hold, disposition, and release", status: "live" },
  { id: "rnd", label: "Research & Development Laboratory", shortLabel: "R&D", description: "Formulation trials, pilot batches, scale-up evidence, and controlled production handoff", status: "live" },
  { id: "shipping", label: "Shipping & Docks", shortLabel: "Shipping", description: "Carrier scheduling, dock loading, BOL, and final release", status: "live" },
  { id: "automation", label: "PLC & Automation Center", shortLabel: "Automation", description: "Live PLC racks, read-only I/O, ladder/FBD monitoring, interlocks, alarms, and fault tracing", status: "live" },
  { id: "compliance", label: "Electronic Batch Record & Compliance", shortLabel: "Compliance", description: "EBR, audit trail, review by exception, signatures, and ALCOA+", status: "live" },
  { id: "lean", label: "Reliability & Lean Six Sigma Center", shortLabel: "Reliability", description: "Packaging downtime, MTBF, MTTR, Pareto, work orders, and DMAIC linkage", status: "live" },
  { id: "analytics", label: "Executive Analytics", shortLabel: "Analytics", description: "OEE, yield, cycle time, quality, warehouse, and shipping performance", status: "live" },
  { id: "thread", label: "Digital Thread Explorer & Replay", shortLabel: "Thread", description: "Batch lifecycle, records, exceptions, signatures, and replay controls", status: "live" },
  { id: "alerts", label: "Enterprise Alert Center", shortLabel: "Alerts", description: "Cross-functional alarms, notifications, severity filters, and response context", status: "live" },
  { id: "historian", label: "Process Historian & Trend Analytics", shortLabel: "Historian", description: "Time-series trends, alarm history, event chronology, and equipment performance", status: "live" },
  { id: "intelligence", label: "Predictive Maintenance & Operational Intelligence", shortLabel: "Intelligence", description: "Equipment health, failure risk, anomalies, and maintenance recommendations", status: "live" },
  { id: "sustainability", label: "Energy, Sustainability & Resource Optimization", shortLabel: "Sustainability", description: "Energy, water, CIP efficiency, carbon estimates, and resource optimization", status: "live" },
  { id: "workforce", label: "Workforce, Training & Skills Matrix", shortLabel: "Workforce", description: "Role readiness, certification coverage, skills gaps, training, and staffing visibility", status: "live" },
];

const initialPo: T.ProductionOrderPayload = {
  po_number: "PO-260742",
  batch_number: "",
  material_number: "PC-1308",
  product_name: "Liquid Prednisone 15 mg/5 mL",
  quantity: 4200,
  priority: "Critical",
  destination: "Chem Weigh Staging",
  weigh_room: "WR-01",
  mix_tank: "V-201",
  hold_tank: "H-301",
  packaging_line: "PKG-01",
  requires_premix: true,
  flavor: "Cherry",
  dye: "FD&C Red No. 33 + FD&C Red No. 40",
  bulk_material: "Multi-Bulk Recipe",
};

const approvedFormulaVariants: T.FormulationVariant[] = [
  { material_number: "PDFC-0813", name: "Dye Free Cherry", flavor: "Cherry", dyes: [] },
  { material_number: "PC-1308", name: "Cherry", flavor: "Cherry", dyes: ["FD&C Red No. 33", "FD&C Red No. 40"] },
  { material_number: "PDFS-0914", name: "Dye Free Strawberry", flavor: "Strawberry", dyes: [] },
  { material_number: "PS-1409", name: "Strawberry", flavor: "Strawberry", dyes: ["FD&C Red No. 33", "FD&C Yellow No. 5"] },
  { material_number: "PDFG-0715", name: "Dye Free Grape", flavor: "Grape", dyes: [] },
  { material_number: "PG-1507", name: "Grape", flavor: "Grape", dyes: ["FD&C Blue No. 1", "FD&C Red No. 40"] },
  { material_number: "PDFB-0616", name: "Dye Free Berry", flavor: "Berry", dyes: [] },
  { material_number: "PB-1606", name: "Berry", flavor: "Berry", dyes: ["FD&C Red No. 40"] },
];

const initialRoute: T.SchedulerConflictPayload = {
  weigh_room: "WR-02",
  mix_tank: "V-202",
  hold_tank: "H-302",
  packaging_line: "PKG-02",
};

const bulkRecipeByMaterial: Record<string, { tankCode: string; quantityKg: number }> = {
  "Glycerin": { tankCode: "GLY-101", quantityKg: 920 },
  "Propylene Glycol": { tankCode: "PG-101", quantityKg: 750 },
  "Sucrose": { tankCode: "SUC-101", quantityKg: 2175 },
};

// USP Water requirement is 4,000 kg per production batch and is supplied by the qualified automatic utility feed.

function asArray<TValue>(value: unknown): TValue[] {
  return Array.isArray(value) ? (value as TValue[]) : [];
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Unexpected error";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function App() {
  const [activeZone, setActiveZone] = useState<ZoneId>("command");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [health, setHealth] = useState<T.HealthResponse | null>(null);
  const [parkingStatus, setParkingStatus] = useState<T.ParkingStatus | null>(null);
  const [securityStatus, setSecurityStatus] = useState<T.SecurityStatus | null>(null);
  const [formulationOptions, setFormulationOptions] = useState<T.FormulationOptions | null>(null);
  const [rndSamples, setRndSamples] = useState<T.RnDSampleBatch[]>([]);
  const [rndCatalog, setRndCatalog] = useState<T.RnDMaterialCatalog | null>(null);
  const [rndFormulaName, setRndFormulaName] = useState("Development Liquid Prednisone");
  const [rndFlavor, setRndFlavor] = useState("Cherry");
  const [rndDye, setRndDye] = useState("None");
  const [rndScale, setRndScale] = useState(10);
  const [rndResult, setRndResult] = useState("Assay and appearance within development target; agitation profile acceptable.");
  const [rndMaterialCodes, setRndMaterialCodes] = useState<string[]>(["9PHQ9Y1OLM"]);
  const [rndBulkTanks, setRndBulkTanks] = useState<string[]>(["PG-101","GLY-101","SUC-101"]);
  const [rndAgitationRpm, setRndAgitationRpm] = useState(120);
  const [rndAgitationMinutes, setRndAgitationMinutes] = useState(10);
  const [rndPremixRpm, setRndPremixRpm] = useState(850);
  const [rndPremixMinutes, setRndPremixMinutes] = useState(5);
  const [rndVacuum, setRndVacuum] = useState(false);
  const [formulaVariants, setFormulaVariants] = useState<T.FormulationVariant[]>(approvedFormulaVariants);
  const [roles, setRoles] = useState<string[]>([]);
  const [productionOrders, setProductionOrders] = useState<T.ProductionOrder[]>([]);
  const [campaigns, setCampaigns] = useState<T.ProductionCampaign[]>([]);
  const [warehouseQueue, setWarehouseQueue] = useState<T.WarehouseTransferOrder[]>([]);
  const [materialPRs, setMaterialPRs] = useState<T.MaterialPR[]>([]);
  const [materialPositions, setMaterialPositions] = useState<T.MaterialPosition[]>([]);
  const [materialMovements, setMaterialMovements] = useState<T.MaterialMovement[]>([]);
  const [activeWeighCampaignId, setActiveWeighCampaignId] = useState("");
  const [campaignPlantInventory, setCampaignPlantInventory] = useState<T.CampaignPlantInventory | null>(null);
  const [prDraftLines, setPrDraftLines] = useState<T.MaterialPRLineDraft[]>([]);
  const [separationReason, setSeparationReason] = useState("Scheduling/resource change requested by Weighing");
  const [weighMaterialSearch, setWeighMaterialSearch] = useState("");
  const [weighInventoryMode, setWeighInventoryMode] = useState<"required"|"substitutes"|"full">("required");
  const [selectedRequirementCode, setSelectedRequirementCode] = useState("");
  const [campaignWeighTask, setCampaignWeighTask] = useState<any | null>(null);
  const [events, setEvents] = useState<T.PlatformEvent[]>([]);
  const [notifications, setNotifications] = useState<T.NotificationRecord[]>([]);
  const [inventory, setInventory] = useState<T.InventoryLot[]>([]);
  const [substitutions, setSubstitutions] = useState<T.SubstitutionRequest[]>([]);
  const [weighRooms, setWeighRooms] = useState<T.WeighRoom[]>([]);
  const [weighTickets, setWeighTickets] = useState<T.WeighTicket[]>([]);
  const [mixRooms, setMixRooms] = useState<T.MixRoom[]>([]);
  const [holdTanks, setHoldTanks] = useState<T.HoldTank[]>([]);
  const [mixQueue, setMixQueue] = useState<T.ProductionOrder[]>([]);
  const [mixBatches, setMixBatches] = useState<T.MixBatch[]>([]);
  const [routeChanges, setRouteChanges] = useState<T.RouteChangeRequest[]>([]);
  const [qaBulkTasks, setQaBulkTasks] = useState<T.QABulkTask[]>([]);
  const [packagingComponents, setPackagingComponents] = useState<T.PackagingComponent[]>([]);
  const [packagingLines, setPackagingLines] = useState<T.PackagingLine[]>([]);
  const [packagingQueue, setPackagingQueue] = useState<T.ProductionOrder[]>([]);
  const [packagingRuns, setPackagingRuns] = useState<T.PackagingRun[]>([]);
  const [qaFgTasks, setQaFgTasks] = useState<T.QAFinishedGoodsTask[]>([]);
  const [packagingDowntime, setPackagingDowntime] = useState<T.PackagingDowntimeEvent[]>([]);
  const [packagingKpis, setPackagingKpis] = useState<T.PackagingReliabilityKPI | null>(null);
  const [maintenanceWorkOrders, setMaintenanceWorkOrders] = useState<T.MaintenanceWorkOrder[]>([]);
  const [bulkTanks, setBulkTanks] = useState<T.BulkTank[]>([]);
  const [bulkDeliveries, setBulkDeliveries] = useState<T.BulkDelivery[]>([]);
  const [bulkTransfers, setBulkTransfers] = useState<T.BulkTransfer[]>([]);
  const [bulkVendor, setBulkVendor] = useState("Global Pharma Glycols");
  const [bulkQuantity, setBulkQuantity] = useState("5000");
  const [selectedBulkTank, setSelectedBulkTank] = useState("PG-101");
  const [bulkPo, setBulkPo] = useState("");
  const [ebrBatches, setEbrBatches] = useState<T.EBRBatchSummary[]>([]);
  const [batchReviews, setBatchReviews] = useState<T.BatchReview[]>([]);
  const [auditTrail, setAuditTrail] = useState<T.AuditTrailEntry[]>([]);
  const [ebrDetail, setEbrDetail] = useState<T.EBRBatchDetail | null>(null);
  const [mesRecord, setMesRecord] = useState<T.MESBatchRecord | null>(null);
  const [compliancePo, setCompliancePo] = useState("");
  const [complianceCipId, setComplianceCipId] = useState("");
  const [ebrSearch, setEbrSearch] = useState("");
  const [reviewer, setReviewer] = useState("QA Reviewer");
  const [reviewSignature, setReviewSignature] = useState("Q. Reviewer");
  const [reviewNote, setReviewNote] = useState("Review by exception completed");
  const [replayPo, setReplayPo] = useState("");
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(2);
  const [alertSeverity, setAlertSeverity] = useState("All");
  const [alertDepartment, setAlertDepartment] = useState("All");


  const [workspace, setWorkspace] = useState<T.ProductionOrderWorkspace | null>(null);
  const [weighWorkspace, setWeighWorkspace] = useState<T.WeighTicketWorkspace | null>(null);
  const [selectedPo, setSelectedPo] = useState("");
  const [selectedTo, setSelectedTo] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("WR-01");
  const [selectedTicket, setSelectedTicket] = useState("");
  const [selectedMixRoom, setSelectedMixRoom] = useState("MR-01");
  const [selectedMixPo, setSelectedMixPo] = useState("");
  const [selectedMixBatch, setSelectedMixBatch] = useState("");
  const [mixWorkspace, setMixWorkspace] = useState<T.MixWorkspace | null>(null);
  // HMI visibility is an operator-presence state, not an equipment-state flag.
  // Active batches may continue/recover in the background, but the Batch HMI
  // stays closed until the operator explicitly opens/resumes the mix room.
  const [mixRoomEntered, setMixRoomEntered] = useState(false);
  const [selectedPackagingLine, setSelectedPackagingLine] = useState("PKG-01");
  const [selectedPackagingPo, setSelectedPackagingPo] = useState("");
  const [selectedPackagingRun, setSelectedPackagingRun] = useState("");
  const [packagingWorkspace, setPackagingWorkspace] = useState<T.PackagingWorkspace | null>(null);
  const [packagingOperator, setPackagingOperator] = useState("Packaging Operator");
  const [requestedPackagingLine, setRequestedPackagingLine] = useState("PKG-02");
  const [cipRuns, setCipRuns] = useState<T.CIPRun[]>([]);
  const [cipSignature, setCipSignature] = useState("Maintenance Technician");
  const cipTicksInFlight = useRef<Set<string>>(new Set());
  const refreshInFlight = useRef(false);
  const [shippingReady, setShippingReady] = useState<T.ProductionOrder[]>([]);
  const [shipments, setShipments] = useState<T.Shipment[]>([]);
  const [shipmentPo, setShipmentPo] = useState("");
  const [carrier, setCarrier] = useState("LTL Carrier");
  const [dock, setDock] = useState("Dock 1");
  const [pickupDate, setPickupDate] = useState("2026-08-01");
  const [pickupTime, setPickupTime] = useState("14:00");
  const [sealNumber, setSealNumber] = useState("SEAL-260742");

  const [poForm, setPoForm] = useState(initialPo);
  const [nextPo, setNextPo] = useState("Auto");
  const [route, setRoute] = useState(initialRoute);
  const [routeResult, setRouteResult] = useState<T.SchedulerConflictResponse | null>(null);
  const [role, setRole] = useState("Production Scheduler");
  const [difficulty, setDifficulty] = useState("Beginner");
  const [session, setSession] = useState<T.TrainingSession | null>(null);
  const [campaignSize, setCampaignSize] = useState<1 | 2 | 3 | 4>(1);
  const [weighOperator, setWeighOperator] = useState("Weigh Technician");
  const [selectedScale, setSelectedScale] = useState("Bench Scale");
  const [barcode, setBarcode] = useState("");
  const [actualWeight, setActualWeight] = useState("");
  const [signature, setSignature] = useState("J. WeighTech");
  const [mixOperator, setMixOperator] = useState("Process Engineer");
  const [mixMaterialBarcode, setMixMaterialBarcode] = useState("");
  const [requestedHoldTank, setRequestedHoldTank] = useState("H-302");
  const [requestedWeighRoom, setRequestedWeighRoom] = useState("WR-02");
  const [requestedMixTank, setRequestedMixTank] = useState("V-202");
  const [resourceChangeReason, setResourceChangeReason] = useState("Scheduled resource is unavailable or conflicts with current operations");
  const [requestedProductionQuantity, setRequestedProductionQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.nextPo().then((value) => setNextPo(value.po_number)).catch(() => setNextPo("Auto"));
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoading(true);
    setError(null);

    // Check API health independently. Optional parking/security integration
    // must never make a healthy FastAPI service display as API OFFLINE.
    let healthData: T.HealthResponse;

try {
  healthData = await api.health();
  setHealth(healthData);
} catch (healthError) {
  setHealth(null);
  setError(errorMessage(healthError));
  refreshInFlight.current = false;
  setLoading(false);
  return;
}

    try {
      const [
        parkingData,
        securityData,
        formulationData,
        rndSampleData,
        rndCatalogData,
        formulaVariantData,
        roleData,
        poData,
        campaignData,
        queueData,
        materialPRData,
        materialPositionData,
        materialMovementData,
        eventData,
        notificationData,
        inventoryData,
        substitutionData,
        roomData,
        ticketData,
        mixRoomData,
        holdTankData,
        mixQueueData,
        mixBatchData,
        routeChangeData,
        qaTaskData,
        packagingComponentData,
        packagingLineData,
        packagingQueueData,
        packagingRunData,
        qaFgTaskData, packagingDowntimeData, packagingKpiData, maintenanceWorkOrderData, cipRunData, shippingReadyData, shipmentData, ebrBatchData, batchReviewData, auditTrailData, bulkTankData, bulkDeliveryData, bulkTransferData,
      ] = await Promise.all([
        api.parkingStatus().catch(() => null),
        api.securityStatus().catch(() => null),
        api.formulationOptions().catch(() => null),
        api.rndSampleBatches().catch(() => []),
        api.rndMaterialCatalog().catch(() => null),
        api.formulationVariants().catch(() => ({variants: approvedFormulaVariants})),
        api.trainingRoles(),
        api.productionOrders(),
        api.campaigns(),
        api.warehouseQueue(),
        api.materialPRs(),
        api.materialPositions(),
        api.materialMovements(),
        api.events(),
        api.notifications(),
        api.inventory(),
        api.substitutions(),
        api.weighRooms(),
        api.weighTickets(),
        api.mixRooms(),
        api.holdTanks(),
        api.mixQueue(),
        api.mixBatches(),
        api.routeChanges(),
        api.qaBulkTasks(),
        api.packagingComponents(),
        api.packagingLines(),
        api.packagingQueue(),
        api.packagingRuns(),
        api.qaFgTasks(), api.packagingDowntime(), api.packagingKpis(), api.maintenanceWorkOrders(), api.cipRuns(), api.shippingReady(), api.shipments(), api.ebrBatches(), api.batchReviews(), api.auditTrail(), api.bulkTanks(), api.bulkDeliveries(), api.bulkTransfers(),
      ]);

      const normalizedPos = asArray<T.ProductionOrder>(poData);
      const normalizedQueue = asArray<T.WarehouseTransferOrder>(queueData);

      setParkingStatus((parkingData as T.ParkingStatus | null) ?? null);
      setSecurityStatus((securityData as T.SecurityStatus | null) ?? null);
      setFormulationOptions((formulationData as T.FormulationOptions | null) ?? null);
      setRndSamples(asArray<T.RnDSampleBatch>(rndSampleData));
      setRndCatalog(rndCatalogData);
      setFormulaVariants(asArray<T.FormulationVariant>(formulaVariantData?.variants).length ? asArray<T.FormulationVariant>(formulaVariantData?.variants) : approvedFormulaVariants);
      setRoles(asArray<string>(roleData));
      setProductionOrders(normalizedPos);
      setCampaigns(asArray<T.ProductionCampaign>(campaignData));
      setWarehouseQueue(normalizedQueue);
      setMaterialPRs(asArray<T.MaterialPR>(materialPRData));
      setMaterialPositions(asArray<T.MaterialPosition>(materialPositionData));
      setMaterialMovements(asArray<T.MaterialMovement>(materialMovementData));
      setEvents(asArray<T.PlatformEvent>(eventData));
      setNotifications(asArray<T.NotificationRecord>(notificationData));
      setInventory(asArray<T.InventoryLot>(inventoryData));
      setSubstitutions(asArray<T.SubstitutionRequest>(substitutionData));
      setWeighRooms(asArray<T.WeighRoom>(roomData));
      setWeighTickets(asArray<T.WeighTicket>(ticketData));
      setMixRooms(asArray<T.MixRoom>(mixRoomData));
      setHoldTanks(asArray<T.HoldTank>(holdTankData));
      setMixQueue(asArray<T.ProductionOrder>(mixQueueData));
      setMixBatches(asArray<T.MixBatch>(mixBatchData));
      setRouteChanges(asArray<T.RouteChangeRequest>(routeChangeData));
      setQaBulkTasks(asArray<T.QABulkTask>(qaTaskData));
      setPackagingComponents(asArray<T.PackagingComponent>(packagingComponentData));
      setPackagingLines(asArray<T.PackagingLine>(packagingLineData));
      setPackagingQueue(asArray<T.ProductionOrder>(packagingQueueData));
      setPackagingRuns(asArray<T.PackagingRun>(packagingRunData));
      setQaFgTasks(asArray<T.QAFinishedGoodsTask>(qaFgTaskData));
      setPackagingDowntime(asArray<T.PackagingDowntimeEvent>(packagingDowntimeData));
      setPackagingKpis(packagingKpiData as T.PackagingReliabilityKPI);
      setMaintenanceWorkOrders(asArray<T.MaintenanceWorkOrder>(maintenanceWorkOrderData));
      setCipRuns(asArray<T.CIPRun>(cipRunData));
      const ready = asArray<T.ProductionOrder>(shippingReadyData); setShippingReady(ready); if (!shipmentPo && ready[0]) setShipmentPo(ready[0].po_number);
      setShipments(asArray<T.Shipment>(shipmentData));
      setEbrBatches(asArray<T.EBRBatchSummary>(ebrBatchData));
      setBatchReviews(asArray<T.BatchReview>(batchReviewData));
      setAuditTrail(asArray<T.AuditTrailEntry>(auditTrailData));
      setBulkTanks(asArray<T.BulkTank>(bulkTankData));
      setBulkDeliveries(asArray<T.BulkDelivery>(bulkDeliveryData));
      setBulkTransfers(asArray<T.BulkTransfer>(bulkTransferData));

      // Keep the open Mixing HMI synchronized with automatic bulk-transfer updates.
      // The transfer tick changes the MixBatch phase to "Bulk Excipient Confirmation"
      // on the backend, so the selected workspace must be reloaded as well.
      if (selectedMixBatch) {
        setMixWorkspace(await api.mixWorkspace(selectedMixBatch));
      }

      if (!bulkPo && normalizedPos[0]) setBulkPo(normalizedPos[0].po_number);

      const poNumber = selectedPo || normalizedPos[0]?.po_number || "";
      if (poNumber) {
        setSelectedPo(poNumber);
        setWorkspace(await api.poWorkspace(poNumber));
      } else {
        setWorkspace(null);
      }

      if (!selectedTo && normalizedQueue[0]) {
        setSelectedTo(normalizedQueue[0].to_number);
      }
    } catch (refreshError) {
      // API health already passed. Surface the subsystem failure without
      // falsely marking the FastAPI service offline.
      setError(errorMessage(refreshError));
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, [selectedPo, selectedTo, selectedMixBatch]);

  const refreshBulkState = useCallback(async () => {
    const [tankData, deliveryData, transferData] = await Promise.all([
      api.bulkTanks(),
      api.bulkDeliveries(),
      api.bulkTransfers(),
    ]);

    setBulkTanks(asArray<T.BulkTank>(tankData));
    setBulkDeliveries(asArray<T.BulkDelivery>(deliveryData));
    setBulkTransfers(asArray<T.BulkTransfer>(transferData));
  }, []);

  useEffect(() => {
    // Initial hydration must run once. Selection state is populated by this
    // request, so depending on the refresh callback would recursively trigger
    // full-platform reloads as selected PO/TO/batch values are initialized.
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const batch = mixWorkspace?.batch;
    const premixRunning = mixWorkspace?.premix?.status === "Running";
    const automatic = batch && ["Running", "Transferring"].includes(batch.status);
    if (!selectedMixBatch || (!automatic && !premixRunning)) return undefined;

    const timer = window.setInterval(async () => {
      try {
        await api.tickMixBatch(selectedMixBatch);
        setMixWorkspace(await api.mixWorkspace(selectedMixBatch));
        const latest = await api.mixBatches();
        setMixBatches(asArray<T.MixBatch>(latest));
      } catch (tickError) {
        setError(errorMessage(tickError));
      }
    }, 900);

    return () => window.clearInterval(timer);
  }, [mixWorkspace?.batch.status, mixWorkspace?.premix?.status, selectedMixBatch]);

  useEffect(() => {
    const run = packagingWorkspace?.run;
    if (!selectedPackagingRun || run?.status !== "Running") return undefined;
    const timer = window.setInterval(async () => {
      try {
        await api.packagingAction(selectedPackagingRun, "tick", packagingOperator);
        setPackagingWorkspace(await api.packagingWorkspace(selectedPackagingRun));
        setPackagingRuns(asArray<T.PackagingRun>(await api.packagingRuns()));
      } catch (tickError) {
        setError(errorMessage(tickError));
      }
    }, 850);
    return () => window.clearInterval(timer);
  }, [packagingWorkspace?.run.status, packagingOperator, selectedPackagingRun]);

  useEffect(() => {
    if (activeZone !== "packaging" || loading || busy) return;

    if (
      packagingWorkspace?.run &&
      !["Complete", "Released"].includes(packagingWorkspace.run.status)
    ) {
      return;
    }

    const lineWithActivePo =
      packagingLines.find(
        (line) =>
          line.line_code === selectedPackagingLine && Boolean(line.active_po),
      ) ??
      packagingLines.find((line) => Boolean(line.active_po));

    if (!lineWithActivePo?.active_po) return;

    const existing = activePackagingRunForLine(
      lineWithActivePo.line_code,
      lineWithActivePo.active_po,
    );
    if (!existing) return;

    void resumePackagingLineWorkflow(
      lineWithActivePo.line_code,
      lineWithActivePo.active_po,
      { silent: true },
    ).catch((resumeError) => {
      setError(errorMessage(resumeError));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZone, loading, packagingLines, packagingRuns]);

  useEffect(() => {
    if (!replayPlaying) return undefined;
    const replayEvents = events
      .filter((event) => !replayPo || event.entity_id === replayPo || event.message.includes(replayPo))
      .slice()
      .reverse();
    if (!replayEvents.length) return undefined;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        if (current >= replayEvents.length - 1) {
          setReplayPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, Math.max(250, 1800 / replaySpeed));
    return () => window.clearInterval(timer);
  }, [events, replayPlaying, replayPo, replaySpeed]);

  const systemState = useMemo(
    () => (health?.status === "ok" ? "online" : loading ? "loading" : "offline"),
    [health, loading],
  );

  const activeZoneDefinition = zones.find((zone) => zone.id === activeZone) ?? zones[0];
  const activeTo = warehouseQueue.find((order) => order.to_number === selectedTo) ?? warehouseQueue[0];

  // Keep the Office material-readiness workspace synchronized with the
  // warehouse transfer order currently selected by the operator. Without
  // this, a newly selected batch could continue displaying the previous
  // batch's comparison data until a full browser refresh was performed.
  useEffect(() => {
    // Warehouse selections may drive the material-readiness workspace, but
    // Office must retain the PO explicitly selected by the scheduler.
    if (activeZone !== "warehouse") return;
    const poNumber = activeTo?.po_number;
    if (!poNumber || poNumber === selectedPo) return;
    void loadWorkspace(poNumber);
  }, [activeZone, activeTo?.po_number, selectedPo]);

  const deliveredOrders = warehouseQueue.filter((order) => order.status === "Delivered");
  const bentOrders = warehouseQueue.filter((order) => order.status === "Bent Into Room");
  const pendingApprovals = substitutions.filter((request) => request.status === "Pending");
  const unreadNotifications = notifications.filter((item) => !item.is_read);
  const openWorkOrders = maintenanceWorkOrders.filter((item) => item.status !== "Completed");
  const qaBacklog = [...qaBulkTasks, ...qaFgTasks].filter((task) => task.status === "Pending Review").length;
  const shippedOrders = productionOrders.filter((po) => /shipped|closed/i.test(po.status));
  const completedPackagingRuns = packagingRuns.filter((run) => run.progress >= 100);
  const totalPlannedUnits = completedPackagingRuns.reduce((sum, run) => {
    const po = productionOrders.find((item) => item.po_number === run.po_number);
    return sum + (po?.quantity ?? run.bottles_completed);
  }, 0);
  const totalProducedUnits = completedPackagingRuns.reduce((sum, run) => sum + Math.max(0, run.bottles_completed - run.rejects), 0);
  const yieldPercent = totalPlannedUnits ? Math.min(100, Number((totalProducedUnits / totalPlannedUnits * 100).toFixed(1))) : 100;
  const rightFirstTime = productionOrders.length
    ? Number(((productionOrders.length - ebrBatches.filter((batch) => batch.exception_count > 0).length) / productionOrders.length * 100).toFixed(1))
    : 100;
  const equipmentAssets = [...mixRooms, ...holdTanks, ...packagingLines];
  const availableEquipment = equipmentAssets.filter((asset) => /available|clean/i.test(`${asset.status} ${asset.cip_status}`)).length;
  const equipmentAvailability = equipmentAssets.length ? Number((availableEquipment / equipmentAssets.length * 100).toFixed(1)) : 100;
  const oee = Number(((packagingKpis?.availability_percent ?? 100) * (yieldPercent / 100) * 0.92).toFixed(1));
  const activeBatches = productionOrders.filter((po) => !/shipped|closed|completed/i.test(po.status)).length;
  const currentAlarms = [
    ...mixBatches.filter((batch) => Boolean(batch.fault_code)),
    ...packagingRuns.filter((run) => Boolean(run.jam_code)),
    ...cipRuns.filter((run) => Boolean(run.fault_code)),
  ].length;
  const replayEvents = events
    .filter((event) => !replayPo || event.entity_id === replayPo || event.message.includes(replayPo))
    .slice()
    .reverse();
  const filteredAlerts = notifications.filter((item) =>
    (alertSeverity === "All" || item.severity.toLowerCase() === alertSeverity.toLowerCase()) &&
    (alertDepartment === "All" || item.recipient === alertDepartment),
  );

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await action();
      setNotice(successMessage);
      await refresh();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function runBulkAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await action();
      await refreshBulkState();

      if (selectedMixBatch) {
        setMixWorkspace(await api.mixWorkspace(selectedMixBatch));
      }

      setNotice(successMessage);
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function registerProductionOrder(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const created = await api.createProductionRun(poForm, campaignSize);
      const poNumbers = created.production_orders.map((po) => po.po_number).join(", ");
      setNotice(`${created.campaign.campaign_id} created with ${created.production_orders.length} PO${created.production_orders.length === 1 ? "" : "s"}: ${poNumbers}. Warehouse notified.`);
      const next = await api.nextPo(); setNextPo(next.po_number);
      await refresh();
    } catch (actionError) { setError(errorMessage(actionError)); } finally { setBusy(false); }
  }

  async function loadWorkspace(poNumber: string) {
    setSelectedPo(poNumber);
    try {
      setWorkspace(await api.poWorkspace(poNumber));
    } catch (workspaceError) {
      setError(errorMessage(workspaceError));
    }
  }

  async function loadWeighTicket(ticketNumber: string) {
    setSelectedTicket(ticketNumber);
    setWeighWorkspace(await api.weighTicketWorkspace(ticketNumber));
  }

  function campaignContainsPo(campaign: T.ProductionCampaign, poNumber: string) {
    const raw = campaign.po_numbers as unknown;
    if (Array.isArray(raw)) {
      return raw.map((value) => String(value).trim()).includes(poNumber);
    }
    return String(raw ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(poNumber);
  }

  function activeRoomTicket(
    roomCode: string,
    activePo: string | null | undefined,
    tickets: T.WeighTicket[] = weighTickets,
  ) {
    if (!activePo) return undefined;
    return tickets.find(
      (ticket) =>
        ticket.po_number === activePo &&
        ticket.room_code === roomCode &&
        ticket.status !== "Completed",
    );
  }

  async function resumeRoomWorkflow(
    roomCode: string,
    activePo: string,
    options: { silent?: boolean } = {},
  ) {
    const campaign = campaigns.find((item) => campaignContainsPo(item, activePo));
    const ticket = activeRoomTicket(roomCode, activePo);

    setSelectedRoom(roomCode);

    if (campaign) {
      setActiveWeighCampaignId(campaign.campaign_id);

      // Reconciliation/PR is already complete once the campaign is physically
      // bent into the white-zone room. Reloading the inventory view is useful
      // context only; it must not gate recovery of the existing weigh task.
      try {
        setCampaignPlantInventory(await api.campaignPlantInventory(campaign.campaign_id));
      } catch {
        // Room/ticket recovery remains authoritative.
      }

      try {
        const synced = await api.syncCampaignWeighing(
          campaign.campaign_id,
          roomCode,
          weighOperator,
        );
        setCampaignWeighTask(synced?.task ?? null);

        if (synced?.ticket?.ticket_number) {
          setSelectedTicket(synced.ticket.ticket_number);
          setWeighWorkspace(
            synced.workspace ??
              (await api.weighTicketWorkspace(synced.ticket.ticket_number)),
          );
          if (!options.silent) {
            setNotice(`Resumed ${roomCode} at ${synced.ticket.ticket_number}`);
          }
          return;
        }
      } catch (syncError) {
        // If campaign synchronization is temporarily unavailable, the
        // persisted room ticket can still be recovered below.
        if (!ticket) throw syncError;
      }
    }

    if (ticket) {
      setSelectedTicket(ticket.ticket_number);
      setWeighWorkspace(await api.weighTicketWorkspace(ticket.ticket_number));
      if (!options.silent) {
        setNotice(`Resumed ${roomCode} at ${ticket.ticket_number}`);
      }
      return;
    }

    throw new Error(`${roomCode} has ${activePo} assigned but no resumable weigh ticket was found`);
  }

  async function resumeSelectedRoomWorkflow() {
    const room = weighRooms.find((item) => item.room_code === selectedRoom);
    if (!room?.active_po) {
      throw new Error(`${selectedRoom} has no active PO to resume`);
    }
    await resumeRoomWorkflow(selectedRoom, room.active_po);
  }

  async function bendIntoSelectedRoom() {
    const room = weighRooms.find((item) => item.room_code === selectedRoom);
    const existingBentOrder = bentOrders.find(
      (item) => item.po_number === room?.active_po || item.owner.startsWith(selectedRoom),
    );

    // A same-PO reservation means the cart is already in this room. Treat it
    // as an idempotent success rather than calling the backend a second time.
    if (room?.active_po && existingBentOrder?.po_number === room.active_po) {
      return;
    }

    const order = deliveredOrders.find((item) => {
      const scheduledPo = productionOrders.find((po) => po.po_number === item.po_number);
      return scheduledPo?.weigh_room === selectedRoom;
    });
    if (!order) {
      throw new Error(`No delivered cart in Chem Weigh Staging is scheduled for ${selectedRoom}`);
    }
    await api.bendIntoWeighRoom(order.po_number, selectedRoom, weighOperator);
  }

  async function openWeighTicket() {
    const room = weighRooms.find((item) => item.room_code === selectedRoom);
    const order = bentOrders.find(
      (item) => item.po_number === room?.active_po || item.owner.startsWith(selectedRoom),
    );
    const poNumber = order?.po_number ?? room?.active_po;
    if (!poNumber) {
      throw new Error(`Bend the delivered cart into ${selectedRoom} before opening a weigh ticket`);
    }

    const existingTicket = weighTickets.find(
      (ticket) =>
        ticket.po_number === poNumber &&
        ticket.room_code === selectedRoom &&
        ticket.status !== "Completed",
    );
    if (existingTicket) {
      await loadWeighTicket(existingTicket.ticket_number);
      return;
    }

    const ticket = await api.openWeighTicket(poNumber, selectedRoom, weighOperator);
    setSelectedTicket(ticket.ticket_number);
    setWeighWorkspace(await api.weighTicketWorkspace(ticket.ticket_number));
  }

  async function loadMixWorkspace(batchId: string) {
    setSelectedMixBatch(batchId);
    setMixWorkspace(await api.mixWorkspace(batchId));
    setMixRoomEntered(true);
  }

  function activeMixBatchForRoom(roomCode: string, activePo?: string | null) {
    return mixBatches.find(
      (item) =>
        item.room_code === roomCode &&
        (!activePo || item.po_number === activePo) &&
        item.status !== "Complete",
    );
  }

  async function resumeMixRoomWorkflow(
    roomCode: string,
    activePo: string,
    options: { silent?: boolean } = {},
  ) {
    const existing = activeMixBatchForRoom(roomCode, activePo);
    if (!existing) {
      throw new Error(`${roomCode} is assigned to ${activePo}, but no active mix batch was found`);
    }

    setSelectedMixRoom(roomCode);
    setSelectedMixBatch(existing.batch_id);
    setMixWorkspace(await api.mixWorkspace(existing.batch_id));

    if (!options.silent) {
      setMixRoomEntered(true);
      setNotice(`Resumed ${roomCode} batch ${existing.batch_number}`);
    }
  }

  async function openMixBatch() {
    const selectedRoomAsset = mixRooms.find((room) => room.room_code === selectedMixRoom);

    // Once a PO is already physically assigned to a white-zone mix room, the
    // room/batch is the authoritative recovery point. Do not require the PO to
    // reappear in the completed-weighing queue after refresh/navigation.
    if (!selectedMixPo && selectedRoomAsset?.active_po) {
      const existing = activeMixBatchForRoom(
        selectedMixRoom,
        selectedRoomAsset.active_po,
      );
      if (existing) {
        await resumeMixRoomWorkflow(selectedMixRoom, selectedRoomAsset.active_po);
        return;
      }
    }

    const poNumber = selectedMixPo;
    if (!poNumber) {
      throw new Error("Select a PO from the Mixing Work Queue before opening a batch");
    }
    const selectedPo = mixQueue.find((item) => item.po_number === poNumber);
    if (!selectedPo) {
      throw new Error(`${poNumber} is no longer available in the Mixing Work Queue`);
    }
    const scheduledRoom = mixRooms.find((room) => room.tank_code === selectedPo.mix_tank);
    if (!scheduledRoom) {
      throw new Error(`No mix room is configured for scheduled tank ${selectedPo.mix_tank}`);
    }
    if (scheduledRoom.room_code !== selectedMixRoom) {
      setSelectedMixRoom(scheduledRoom.room_code);
    }

    const batch = await api.openMixBatch(poNumber, scheduledRoom.room_code, mixOperator);
    setSelectedMixBatch(batch.batch_id);
    setMixWorkspace(await api.mixWorkspace(batch.batch_id));
    setMixRoomEntered(true);
  }

  async function syncCampaignWeighSequence() {
    if (!activeWeighCampaignId) return;
    const synced = await api.syncCampaignWeighing(activeWeighCampaignId, selectedRoom, weighOperator);
    const task = synced?.task ?? null;
    setCampaignWeighTask(task);

    if (!synced?.ticket?.ticket_number) {
      setSelectedTicket("");
      setWeighWorkspace(null);
      return;
    }

    setSelectedTicket(synced.ticket.ticket_number);
    setWeighWorkspace(synced.workspace ?? await api.weighTicketWorkspace(synced.ticket.ticket_number));
  }

  async function runWeighAction(
    action: () => Promise<unknown>,
    message: string,
    options: { clearBarcode?: boolean; clearWeight?: boolean } = {},
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await action();
      await refresh();

      if (activeWeighCampaignId) {
        // Campaign sequencing is authoritative. Keep the current HMI mounted
        // while asking the backend for the exact next PO/material ticket, then
        // replace the workspace atomically. Blank/unmount transitions here
        // caused the Scale HMI to disappear between tare/scan/weigh steps.
        const synced = await api.syncCampaignWeighing(
          activeWeighCampaignId,
          selectedRoom,
          weighOperator,
        );

        const task = synced?.task ?? null;
        setCampaignWeighTask(task);

        if (synced?.ticket?.ticket_number) {
          setSelectedTicket(synced.ticket.ticket_number);
          setWeighWorkspace(
            synced.workspace ??
              (await api.weighTicketWorkspace(synced.ticket.ticket_number)),
          );
        } else {
          setSelectedTicket("");
          setWeighWorkspace(null);
        }
      } else if (selectedTicket) {
        setWeighWorkspace(await api.weighTicketWorkspace(selectedTicket));
      }

      if (options.clearBarcode) setBarcode("");
      if (options.clearWeight) setActualWeight("");
      setNotice(message);
    } catch (actionError) {
      // Surface the exact sequencing/sync failure instead of silently leaving
      // the previous PO on the HMI.
      setError(errorMessage(actionError));
      if (activeWeighCampaignId) {
        try {
          const task = await api.campaignWeighSequence(activeWeighCampaignId);
          setCampaignWeighTask(task);
        } catch {
          // Preserve the original error.
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function resumeCurrentCampaignWeighTask() {
    if (!activeWeighCampaignId) return;
    setBusy(true);
    setError(null);
    try {
      // Preserve the current HMI while the canonical room/campaign task is
      // reloaded. The workspace is replaced only after the backend responds.
      await syncCampaignWeighSequence();
    } catch (syncError) {
      setError(errorMessage(syncError));
    } finally {
      setBusy(false);
    }
  }

  async function runMixAction(action: () => Promise<unknown>, message: string) {
    await runAction(action, message);
    if (selectedMixBatch) {
      setMixWorkspace(await api.mixWorkspace(selectedMixBatch));
    }
  }

  async function scanMixMaterialBarcode(valueOverride?: string) {
    if (!selectedMixBatch) throw new Error("Open or resume a mix batch first");
    const value=(valueOverride ?? mixMaterialBarcode).trim();
    if (!value) throw new Error("Scan or select the current material");

    await runAction(
      () =>
        api.mixPhaseAction(
          selectedMixBatch,
          `scan-barcode-${encodeURIComponent(value)}`,
          mixOperator,
        ),
      "Current manual-add material verified",
    );

    setMixMaterialBarcode("");
    setMixWorkspace(await api.mixWorkspace(selectedMixBatch));
  }

  async function loadPackagingWorkspace(runId: string) {
    setSelectedPackagingRun(runId);
    setPackagingWorkspace(await api.packagingWorkspace(runId));
  }

  function activePackagingRunForLine(lineCode: string, activePo?: string | null) {
    return packagingRuns.find(
      (item) =>
        item.line_code === lineCode &&
        (!activePo || item.po_number === activePo) &&
        !["Complete", "Released"].includes(item.status),
    );
  }

  async function resumePackagingLineWorkflow(
    lineCode: string,
    activePo: string,
    options: { silent?: boolean } = {},
  ) {
    const existing = activePackagingRunForLine(lineCode, activePo);
    if (!existing) {
      throw new Error(`${lineCode} is assigned to ${activePo}, but no active packaging run was found`);
    }

    setSelectedPackagingLine(lineCode);
    setSelectedPackagingRun(existing.run_id);
    setPackagingWorkspace(await api.packagingWorkspace(existing.run_id));

    if (!options.silent) {
      setNotice(`Resumed ${lineCode} run for ${activePo}`);
    }
  }

  async function openPackagingRun() {
    const selectedLineAsset = packagingLines.find(
      (line) => line.line_code === selectedPackagingLine,
    );

    if (!selectedPackagingPo && selectedLineAsset?.active_po) {
      const existing = activePackagingRunForLine(
        selectedPackagingLine,
        selectedLineAsset.active_po,
      );
      if (existing) {
        await resumePackagingLineWorkflow(
          selectedPackagingLine,
          selectedLineAsset.active_po,
        );
        return;
      }
    }

    const po = packagingQueue.find((item) => item.po_number === selectedPackagingPo);
    if (!po) throw new Error("Select a PO from the Packaging Queue before opening a run");

    const scheduledLine = packagingLines.find((line) => line.line_code === po.packaging_line);
    if (!scheduledLine) throw new Error(`Scheduled packaging line ${po.packaging_line} is not configured`);
    if (scheduledLine.line_code !== selectedPackagingLine) {
      setSelectedPackagingLine(scheduledLine.line_code);
    }

    const run = await api.openPackagingRun(
      po.po_number,
      scheduledLine.line_code,
      packagingOperator,
    );
    setSelectedPackagingRun(run.run_id);
    setPackagingWorkspace(await api.packagingWorkspace(run.run_id));
  }

  async function runPackagingAction(action: string, message: string) {
    if (!selectedPackagingRun) throw new Error("Open a packaging run first");
    await runAction(() => api.packagingAction(selectedPackagingRun, action, packagingOperator), message);
    setPackagingWorkspace(await api.packagingWorkspace(selectedPackagingRun));
    setPackagingRuns(asArray<T.PackagingRun>(await api.packagingRuns()));
  }

  useEffect(() => {
    if (activeZone !== "weighing" || loading || busy) return;

    // If an HMI is already loaded, leave it mounted. This prevents normal
    // refreshes and React state updates from reconstructing the scale card.
    if (weighWorkspace?.ticket && weighWorkspace.ticket.status !== "Completed") {
      return;
    }

    const roomWithActivePo =
      weighRooms.find((room) => room.room_code === selectedRoom && room.active_po) ??
      weighRooms.find((room) => Boolean(room.active_po));

    if (!roomWithActivePo?.active_po) return;

    const ticket = activeRoomTicket(
      roomWithActivePo.room_code,
      roomWithActivePo.active_po,
      weighTickets,
    );
    if (!ticket) return;

    void resumeRoomWorkflow(
      roomWithActivePo.room_code,
      roomWithActivePo.active_po,
      { silent: true },
    ).catch((resumeError) => {
      setError(errorMessage(resumeError));
    });
    // Recovery is intentionally driven by the persisted room/ticket state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZone, loading, weighRooms, weighTickets]);

  useEffect(() => {
    if (activeZone !== "mixing" || loading || busy) return;

    // Keep an already-open batch HMI mounted. Browser refresh/navigation can
    // reconstruct it from persisted room + MixBatch state below.
    if (mixWorkspace?.batch && mixWorkspace.batch.status !== "Complete") {
      return;
    }

    const roomWithActivePo =
      mixRooms.find(
        (room) => room.room_code === selectedMixRoom && Boolean(room.active_po),
      ) ??
      mixRooms.find((room) => Boolean(room.active_po));

    if (!roomWithActivePo?.active_po) return;

    const existing = activeMixBatchForRoom(
      roomWithActivePo.room_code,
      roomWithActivePo.active_po,
    );
    if (!existing) return;

    void resumeMixRoomWorkflow(
      roomWithActivePo.room_code,
      roomWithActivePo.active_po,
      { silent: true },
    ).catch((resumeError) => {
      setError(errorMessage(resumeError));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZone, loading, mixRooms, mixBatches]);

  function navigateTo(zone: ZoneId) {
    if (zone !== "mixing") {
      setMixRoomEntered(false);
    }
    setActiveZone(zone);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderCommandCenter() {
    const eventZone = (source: string): "office" | "warehouse" | "weighing" | "bulk" | "mixing" | "quality" | "rnd" | "packaging" | "shipping" | "lean" | "compliance" | "automation" => {
      const normalized = source.toLowerCase();
      if (normalized.includes("warehouse")) return "warehouse";
      if (normalized.includes("weigh")) return "weighing";
      if (normalized.includes("bulk")) return "bulk";
      if (normalized.includes("mix") || normalized.includes("hold")) return "mixing";
      if (normalized.includes("qa") || normalized.includes("quality") || normalized.includes("lims")) return "quality";
      if (normalized.includes("research") || normalized.includes("r&d")) return "rnd";
      if (normalized.includes("pack")) return "packaging";
      if (normalized.includes("ship") || normalized.includes("dock")) return "shipping";
      if (normalized.includes("maint") || normalized.includes("reliab") || normalized.includes("cip")) return "lean";
      if (normalized.includes("compliance") || normalized.includes("audit") || normalized.includes("ebr")) return "compliance";
      if (normalized.includes("plc") || normalized.includes("automation")) return "automation";
      return "office";
    };

    const overviewAssets = [
      ...weighRooms.map((asset) => ({ code: asset.room_code, label: "Controlled Weigh Room", zone: "weighing" as const, status: asset.status, poNumber: asset.active_po })),
      ...bulkTanks.map((asset) => ({ code: asset.tank_code, label: asset.material_name, zone: "bulk" as const, status: `${asset.status} ${asset.qa_status}`, progress: asset.capacity_kg ? asset.quantity_kg / asset.capacity_kg * 100 : 0, primaryMetric: `${asset.quantity_kg.toFixed(0)} kg`, secondaryMetric: `${asset.temperature_c.toFixed(1)} °C` })),
      ...mixRooms.map((asset) => ({ code: asset.tank_code, label: asset.name, zone: "mixing" as const, status: `${asset.status} ${asset.cip_status}`, poNumber: asset.active_po, primaryMetric: asset.plc_code })),
      ...holdTanks.map((asset) => ({ code: asset.tank_code, label: "Bulk Hold Tank", zone: "mixing" as const, status: `${asset.status} ${asset.qa_status} ${asset.cip_status}`, poNumber: asset.active_po, progress: asset.level_percent, primaryMetric: `${asset.level_percent.toFixed(0)}% full`, secondaryMetric: asset.qa_status })),
      ...packagingLines.map((asset) => ({ code: asset.line_code, label: asset.name, zone: "packaging" as const, status: `${asset.status} ${asset.cip_status}`, poNumber: asset.active_po, primaryMetric: `${asset.rated_speed_bpm} BPM`, secondaryMetric: asset.plc_code })),
      ...shipments.slice(0, 2).map((asset) => ({ code: asset.dock, label: "Shipping Dock", zone: "shipping" as const, status: asset.status, poNumber: asset.po_number, progress: asset.pallets_loaded / 4 * 100, primaryMetric: `${asset.pallets_loaded}/4 pallets`, secondaryMetric: asset.carrier })),
    ];

    return (
      <ProcessOverview
        connected={Boolean(health)}
        kpis={{
          activeBatches,
          oee,
          rightFirstTime,
          yieldPercent,
          equipmentAvailability,
          currentAlarms,
          qaBacklog,
          shipmentsClosed: shippedOrders.length,
          downtimeMinutes: packagingKpis?.total_downtime_minutes ?? 0,
        }}
        orders={productionOrders.map((order) => ({
          poNumber: order.po_number,
          productName: order.product_name,
          status: order.status,
          weighRoom: order.weigh_room,
          mixTank: order.mix_tank,
          holdTank: order.hold_tank,
          packagingLine: order.packaging_line,
        }))}
        assets={overviewAssets}
        events={events.map((event) => ({ id: event.id, source: event.source, message: event.message, severity: event.severity, createdAt: event.created_at, zone: eventZone(event.source) }))}
        parking={securityStatus}
        onOpenSecurity={() => navigateTo("security")}
        onNavigate={(zone) => navigateTo(zone)}
      />
    );
  }


  function renderSecurityZone() {
    return <SecurityCommandCenter
      security={securityStatus}
      onOpenParking={() =>
  window.open(
    import.meta.env.VITE_PARKING_APP_URL ??
      "https://jd-dev-king.github.io/EES-Pharma-Parking-Access-Digital-Twin/",
    "_blank",
    "noopener,noreferrer"
  )
}
      onReturn={() => navigateTo("command")}
    />;
  }


  function renderDigitalTwinZone() {
    const twinAssets = [
      ...weighRooms.map((asset) => ({ code: asset.room_code, label: "Controlled Weigh Room", zone: "weighing" as const, status: asset.status, poNumber: asset.active_po, level: 18 })),
      ...bulkTanks.map((asset) => ({ code: asset.tank_code, label: asset.material_name, zone: "bulk" as const, status: `${asset.status} ${asset.qa_status}`, poNumber: null, level: asset.capacity_kg ? asset.quantity_kg / asset.capacity_kg * 100 : 0 })),
      ...mixRooms.map((asset) => ({ code: asset.tank_code, label: asset.name, zone: "mixing" as const, status: `${asset.status} ${asset.cip_status}`, poNumber: asset.active_po, level: asset.active_po ? 62 : 8 })),
      ...holdTanks.map((asset) => ({ code: asset.tank_code, label: "Bulk Hold Tank", zone: "mixing" as const, status: `${asset.status} ${asset.qa_status} ${asset.cip_status}`, poNumber: asset.active_po, level: asset.level_percent })),
      ...packagingLines.map((asset) => ({ code: asset.line_code, label: asset.name, zone: "packaging" as const, status: `${asset.status} ${asset.cip_status}`, poNumber: asset.active_po, level: asset.active_po ? 68 : 5 })),
      ...shipments.slice(0, 3).map((asset) => ({ code: asset.dock, label: "Shipping Dock", zone: "shipping" as const, status: asset.status, poNumber: asset.po_number, level: asset.pallets_loaded / 4 * 100 })),
    ];

    return (
      <DigitalTwinScene
        connected={Boolean(health)}
        assets={twinAssets}
        alarms={currentAlarms}
        activeOrders={activeBatches}
        parking={parkingStatus}
        onOpenParking={() =>
  window.open(
    import.meta.env.VITE_PARKING_APP_URL ??
      "https://jd-dev-king.github.io/EES-Pharma-Parking-Access-Digital-Twin/",
    "_blank",
    "noopener,noreferrer"
  )
}
        onNavigate={(zone) => navigateTo(zone as ZoneId)}
        onReturn={() => navigateTo("command")}
      />
    );
  }

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const unloading = bulkDeliveries.find((item) => item.status === "Unloading");
      const transferring = bulkTransfers.find((item) => item.status === "Transferring");

      try {
        if (unloading) {
          await api.bulkDeliveryAction(unloading.delivery_id, "tick");
        }

        if (transferring) {
          await api.bulkTransferAction(transferring.transfer_id, "tick");
        }

        if (unloading || transferring) {
          await refreshBulkState();

          if (transferring && selectedMixBatch) {
            setMixWorkspace(await api.mixWorkspace(selectedMixBatch));
          }
        }
      } catch (bulkTickError) {
        setError(errorMessage(bulkTickError));
      }
    }, 1600);

    return () => window.clearInterval(timer);
  }, [bulkDeliveries, bulkTransfers, refreshBulkState, selectedMixBatch]);

  function renderOfficeZone() {
    return (
      <div className="zone-stack">
        <div className="zone-summary-grid">
          <article><span>Active POs</span><strong>{productionOrders.length}</strong></article>
          <article><span>Material Warnings</span><strong>{workspace?.comparison.filter((item) => item.status !== "Ready").length ?? 0}</strong></article>
          <article><span>Pending Decisions</span><strong>{pendingApprovals.length}</strong></article>
          <article><span>Route Status</span><strong>{routeResult?.available === false ? "Conflict" : "Available"}</strong></article>
        </div>

        <div className="zone-columns">
          <SectionCard title="Register Production Run" eyebrow="Office Planning">
            <form onSubmit={registerProductionOrder} className="form-grid">
              <label>Next PO<input value={nextPo} readOnly /></label>
              <label>Approved Material<select value={poForm.material_number} onChange={(event) => { const material_number=event.target.value; const v=formulaVariants.find(x=>x.material_number===material_number)!; setPoForm({ ...poForm, material_number, flavor:v.flavor, dye:v.dyes.length?v.dyes.join(" + "):"None", requires_premix:v.dyes.length>0 }); }}>{formulaVariants.map(v => <option key={v.material_number} value={v.material_number}>{v.material_number} · {v.name}</option>)}</select></label>
              <label>Number of Batches / POs<select value={campaignSize} onChange={(event) => setCampaignSize(Number(event.target.value) as 1 | 2 | 3 | 4)}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
              <label className="wide">Product<input value={poForm.product_name} onChange={(event) => setPoForm({ ...poForm, product_name: event.target.value })} /></label>
              <label>Locked Flavor<input value={poForm.flavor} readOnly /></label>
              <label>Locked Dye Recipe<input value={poForm.dye} readOnly /></label>
              <label className="wide">Bulk Recipe<input value="Water → Glycerin + PPG → Sucrose (automatic gated adds)" readOnly /></label>
              <label>Quantity<input type="number" value={poForm.quantity} onChange={(event) => setPoForm({ ...poForm, quantity: Number(event.target.value) })} /></label>
              <label>Priority<select value={poForm.priority} onChange={(event) => setPoForm({ ...poForm, priority: event.target.value })}><option>Critical</option><option>High</option><option>Normal</option><option>Low</option></select></label>
              <label className="wide">Destination<input value={poForm.destination} onChange={(event) => setPoForm({ ...poForm, destination: event.target.value })} /></label>
              <label>Weigh Room<select value={poForm.weigh_room} onChange={(event) => setPoForm({ ...poForm, weigh_room: event.target.value })}><option>WR-01</option><option>WR-02</option></select></label>
              <label>Mix Tank<select value={poForm.mix_tank} onChange={(event) => setPoForm({ ...poForm, mix_tank: event.target.value })}><option>V-201</option><option>V-202</option></select></label>
              <label>Hold Tank<select value={poForm.hold_tank} onChange={(event) => setPoForm({ ...poForm, hold_tank: event.target.value })}><option>H-301</option><option>H-302</option></select></label>
              <label>Packaging Line<select value={poForm.packaging_line} onChange={(event) => setPoForm({ ...poForm, packaging_line: event.target.value })}><option>PKG-01</option><option>PKG-02</option></select></label>
              <label className="wide checkbox-field"><input type="checkbox" checked={poForm.requires_premix} readOnly /> Dye premix locked by approved material recipe</label>
              <button className="button primary wide" disabled={busy}>Generate Production Run</button>
            </form>
          </SectionCard>

          <SectionCard title="Training Session" eyebrow="Role-Based Learning">
            <div className="form-grid compact">
              <label>Role<select value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((roleName) => <option key={roleName}>{roleName}</option>)}</select></label>
              <label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
            </div>
            <button className="button primary" onClick={() => void runAction(async () => setSession(await api.startTrainingSession(role, difficulty)), "Fresh session started at 0%")}>Start Fresh Session</button>
            {session && (
              <div className="session-panel training-session-panel">
                <div><span>Session</span><strong>{session.session_id}</strong></div>
                <div><span>Score</span><strong>{session.score}%</strong></div>
                <div><span>Status</span><strong>{session.status}</strong></div>
                <progress value={session.score} max={100} />
                <div className="training-step-copy">
                  <strong>{session.status === "Completed" ? "Training complete" : `Step ${Math.floor(session.score / (difficulty === "Beginner" ? 25 : 20)) + 1}`}</strong>
                  <span>{session.status === "Completed" ? "All required learning checks are complete." : "Review the current role scenario, then record the result."}</span>
                </div>
                {session.status !== "Completed" && (
                  <div className="button-row">
                    <button className="button primary" onClick={() => void runAction(async () => setSession(await api.advanceTrainingSession(session.session_id, true)), "Training step completed")}>Complete Step</button>
                    <button className="button secondary" onClick={() => void runAction(async () => setSession(await api.advanceTrainingSession(session.session_id, false, "Retry requested")), "Step marked for retry")}>Retry Step</button>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Bulk Tanker Delivery Scheduler" eyebrow="Office Planning & Vendor Coordination">
          <div className="form-grid compact">
            <label>Vendor
              <input value={bulkVendor} onChange={(event) => setBulkVendor(event.target.value)} />
            </label>
            <label>Quantity kg
              <input type="number" value={bulkQuantity} onChange={(event) => setBulkQuantity(event.target.value)} />
            </label>
            <label>Receiving Bay
              <input value="BAY-01" readOnly />
            </label>
            <label>Destination Tank
              <select value={selectedBulkTank} onChange={(event) => setSelectedBulkTank(event.target.value)}>
                {bulkTanks.map((tank) => (
                  <option key={tank.tank_code} value={tank.tank_code}>
                    {tank.tank_code} · {tank.material_name} · {tank.quantity_kg.toFixed(0)}/{tank.capacity_kg.toFixed(0)} kg
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="button primary"
            disabled={busy || Number(bulkQuantity) <= 0}
            onClick={() =>
              void runBulkAction(
                () =>
                  (() => {
                    const tank = bulkTanks.find((item) => item.tank_code === selectedBulkTank);
                    if (!tank) throw new Error("Select a destination bulk tank");
                    return api.scheduleBulkDelivery({
                      material_code: tank.material_code,
                      material_name: tank.material_name,
                      vendor: bulkVendor,
                      carrier: "Vendor Tanker",
                      quantity_kg: Number(bulkQuantity),
                      receiving_bay: "BAY-01",
                      tank_code: tank.tank_code,
                      delivery_window: "08:00-10:00",
                      lot_number: `${tank.material_code}-${Date.now().toString().slice(-6)}`,
                      coa_number: `COA-${tank.material_code}-260728`,
                      seal_number: `SEAL-${tank.tank_code}`,
                      temperature_c: 22,
                    });
                  })(),
                "Bulk tanker scheduled and sent to Warehouse Receiving",
              )
            }
          >
            Schedule Bulk Tanker
          </button>
          <div className="queue-list compact-list">
            {bulkDeliveries.slice(0, 4).map((delivery) => (
              <article key={delivery.delivery_id} className="queue-card">
                <div>
                  <strong>{delivery.delivery_id}</strong>
                  <span>{delivery.status}</span>
                </div>
                <p>{delivery.vendor} · {delivery.quantity_kg.toFixed(0)} kg → {delivery.receiving_bay}</p>
              </article>
            ))}
            {!bulkDeliveries.length && <p className="empty-state">No tanker deliveries scheduled.</p>}
          </div>
        </SectionCard>

        <SectionCard
          title="Active PO Workspace"
          eyebrow="Materials, Readiness & Approval Warnings"
          action={<select value={selectedPo} onChange={(event) => void loadWorkspace(event.target.value)}>{productionOrders.map((po) => <option key={po.id}>{po.po_number}</option>)}</select>}
        >
          {workspace ? (
            <>
              <div className="detail-list horizontal-details">
                <div><span>PO</span><strong>{workspace.production_order.po_number}</strong></div>
                <div><span>Batch</span><strong>{workspace.production_order.batch_number}</strong></div>
                <div><span>Status</span><strong>{workspace.production_order.status}</strong></div>
                <div><span>Readiness</span><strong>{workspace.ready_for_release ? "Ready for Warehouse" : "Action Required"}</strong></div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Material</th><th>Required</th><th>Available</th><th>Released</th><th>FEFO Lot</th><th>Status / Warning</th></tr></thead>
                  <tbody>
                    {asArray<T.MaterialComparison>(workspace.comparison).map((material) => (
                      <tr key={material.material_code}>
                        <td>{material.material_name}<small className="subtext">{material.material_code}</small></td>
                        <td>{material.required_quantity} {material.unit}</td>
                        <td>{material.available_quantity}</td>
                        <td>{material.released_quantity}</td>
                        <td>{material.recommended_lot ?? "—"}</td>
                        <td><span className={`material-status status-${material.status.toLowerCase()}`}>{material.status}</span>{material.warning && <small className="warning-text">{material.warning}</small>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const bulkCodes = new Set(["059QF0KO0R","PDC6A3C0OX","6DC9Q167V3","C151H8M554"]);
                const bulks = asArray<T.MaterialRequirement>(workspace.requirements).filter((item) => bulkCodes.has(item.material_code));
                if (!bulks.length) return null;
                return (
                  <div className="route-request-panel" style={{marginTop: "16px"}}>
                    <div className="approval-card__header">
                      <strong>Bulk Materials on PO</strong>
                      <span>Direct bulk system · Not sent to Weighing</span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Bulk Material</th><th>PO Requirement</th><th>Execution Path</th></tr></thead>
                        <tbody>
                          {bulks.map((item) => (
                            <tr key={item.material_code}>
                              <td>{item.material_name}<small className="subtext">{item.material_code}</small></td>
                              <td>{item.required_quantity} {item.unit}</td>
                              <td>Truck Unload → Bulk Tank → Mix Tank</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          ) : <p className="empty-state">Register a PO to populate material requirements.</p>}
        </SectionCard>

        <SectionCard title="Resource Reassignment Center" eyebrow="Controlled Scheduling Requests">
          {workspace ? (
            <div className="resource-reassignment-grid">
              <article className="route-request-panel">
                <div className="approval-card__header">
                  <strong>Weigh Room</strong>
                  <span>Current: {workspace.production_order.weigh_room}</span>
                </div>
                <label>Requested room
                  <select
                    value={requestedWeighRoom}
                    onChange={(event) => setRequestedWeighRoom(event.target.value)}
                  >
                    {weighRooms.map((room) => (
                      <option key={room.id} value={room.room_code}>
                        {room.room_code} · {room.status}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={busy || requestedWeighRoom === workspace.production_order.weigh_room}
                  onClick={() =>
                    void runAction(
                      () =>
                        api.requestRouteChange({
                          po_number: workspace.production_order.po_number,
                          resource_type: "weigh_room",
                          current_resource: workspace.production_order.weigh_room,
                          requested_resource: requestedWeighRoom,
                          reason: resourceChangeReason,
                          requester: "Office",
                        }),
                      "Weigh-room change request submitted",
                    )
                  }
                >
                  Request Weigh Room Change
                </button>
              </article>

              <article className="route-request-panel">
                <div className="approval-card__header">
                  <strong>Mix Tank</strong>
                  <span>Current: {workspace.production_order.mix_tank}</span>
                </div>
                <label>Requested tank
                  <select
                    value={requestedMixTank}
                    onChange={(event) => setRequestedMixTank(event.target.value)}
                  >
                    {mixRooms.map((room) => (
                      <option key={room.id} value={room.tank_code}>
                        {room.tank_code} · {room.status} · {room.cip_status}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={busy || requestedMixTank === workspace.production_order.mix_tank}
                  onClick={() =>
                    void runAction(
                      () =>
                        api.requestRouteChange({
                          po_number: workspace.production_order.po_number,
                          resource_type: "mix_tank",
                          current_resource: workspace.production_order.mix_tank,
                          requested_resource: requestedMixTank,
                          reason: resourceChangeReason,
                          requester: "Office",
                        }),
                      "Mix-tank change request submitted",
                    )
                  }
                >
                  Request Mix Tank Change
                </button>
              </article>

              <article className="route-request-panel">
                <div className="approval-card__header">
                  <strong>Hold Tank</strong>
                  <span>Current: {workspace.production_order.hold_tank}</span>
                </div>
                <label>Requested hold tank
                  <select
                    value={requestedHoldTank}
                    onChange={(event) => setRequestedHoldTank(event.target.value)}
                  >
                    {holdTanks.map((tank) => (
                      <option key={tank.id} value={tank.tank_code}>
                        {tank.tank_code} · {tank.status} · {tank.cip_status}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={busy || requestedHoldTank === workspace.production_order.hold_tank}
                  onClick={() =>
                    void runAction(
                      () =>
                        api.requestRouteChange({
                          po_number: workspace.production_order.po_number,
                          resource_type: "hold_tank",
                          current_resource: workspace.production_order.hold_tank,
                          requested_resource: requestedHoldTank,
                          reason: resourceChangeReason,
                          requester: "Office",
                        }),
                      "Hold-tank change request submitted",
                    )
                  }
                >
                  Request Hold Tank Change
                </button>
              </article>

              <label className="wide">Reason for requested change
                <input
                  value={resourceChangeReason}
                  onChange={(event) => setResourceChangeReason(event.target.value)}
                />
              </label>
            </div>
          ) : (
            <p className="empty-state">Register or select a PO to request resource changes.</p>
          )}
        </SectionCard>

        <div className="zone-columns">
          <SectionCard title="Office Approval Queue" eyebrow="Material Substitutions & Route Changes">
            {substitutions.length ? substitutions.map((request) => (
              <article className="approval-card" key={request.id}>
                <div><strong>{request.request_id}</strong><span className={`material-status status-${request.status.toLowerCase()}`}>{request.status}</span></div>
                <p>{request.po_number} · {request.material_code} → {request.proposed_lot}</p>
                <small>{request.reason}</small>
                {request.status === "Pending" && <div className="button-row"><button className="button primary" onClick={() => void runAction(() => api.decideSubstitution(request.request_id, true), "Substitution approved")}>Approve</button><button className="button secondary" onClick={() => void runAction(() => api.decideSubstitution(request.request_id, false), "Substitution denied")}>Deny</button></div>}
              </article>
            )) : <p className="empty-state">No material substitution requests.</p>}
            {routeChanges.map((request) => (
              <article className="approval-card" key={request.id}>
                <div><strong>{request.request_id}</strong><span className={`material-status status-${request.status.toLowerCase()}`}>{request.status}</span></div>
                <p>{request.po_number} · {request.current_resource} → {request.requested_resource}</p>
                <small>{request.reason}</small>
                {request.status === "Pending" && <div className="button-row"><button className="button primary" onClick={() => void runAction(() => api.decideRouteChange(request.request_id, true), request.resource_type === "production_quantity" ? "Production quantity approved" : "Route change approved")}>{request.resource_type === "production_quantity" ? "Approve Quantity" : "Approve Route"}</button><button className="button secondary" onClick={() => void runAction(() => api.decideRouteChange(request.request_id, false), request.resource_type === "production_quantity" ? "Production quantity denied" : "Route change denied")}>{request.resource_type === "production_quantity" ? "Deny Quantity" : "Deny Route"}</button></div>}
              </article>
            ))}
          </SectionCard>

          <SectionCard title="Route Conflict Check" eyebrow="Capacity Planning">
            <div className="form-grid">
              <label>Weigh Room<input value={route.weigh_room} onChange={(event) => setRoute({ ...route, weigh_room: event.target.value })} /></label>
              <label>Mix Tank<input value={route.mix_tank} onChange={(event) => setRoute({ ...route, mix_tank: event.target.value })} /></label>
              <label>Hold Tank<input value={route.hold_tank} onChange={(event) => setRoute({ ...route, hold_tank: event.target.value })} /></label>
              <label>Packaging Line<input value={route.packaging_line} onChange={(event) => setRoute({ ...route, packaging_line: event.target.value })} /></label>
            </div>
            <button className="button primary" onClick={() => void runAction(async () => setRouteResult(await api.checkSchedulerConflicts(route)), "Route conflict check completed")}>Check Route</button>
            {routeResult && <div className={`route-result ${routeResult.available ? "available" : "blocked"}`}><strong>{routeResult.available ? "Route available" : "Conflicts detected"}</strong>{routeResult.conflicts.map((conflict) => <p key={`${conflict.resource_type}-${conflict.resource_id}`}>{conflict.message}</p>)}</div>}
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderWarehouseZone() {
    return (
      <div className="zone-stack">
        <div className="zone-summary-grid">
          <article><span>Pending TOs</span><strong>{warehouseQueue.filter((order) => order.status !== "Delivered").length}</strong></article>
          <article><span>Delivered</span><strong>{deliveredOrders.length}</strong></article>
          <article><span>Released Lots</span><strong>{inventory.filter((lot) => lot.qa_status === "Released").length}</strong></article>
          <article><span>Blocked Orders</span><strong>{warehouseQueue.filter((order) => Boolean(order.blocker)).length}</strong></article>
        </div>

        <SectionCard title="Bulk Tanker Receiving" eyebrow="Receiving Bay Inspection & Automatic Unloading">
          <div className="queue-list">
            {bulkDeliveries
              .filter((delivery) => !["Pending QA Review", "Released", "On Hold", "Rejected"].includes(delivery.status))
              .map((delivery) => (
                <article key={delivery.delivery_id} className="queue-card">
                  <div>
                    <strong>{delivery.delivery_id}</strong>
                    <span>{delivery.status}</span>
                  </div>
                  <p>{delivery.vendor} · {delivery.quantity_kg.toFixed(0)} kg {delivery.material_name}</p>
                  <small>{delivery.receiving_bay} → {delivery.tank_code} · Seal {delivery.seal_number}</small>
                  <div className="progress-track">
                    <span style={{ width: `${delivery.unload_progress}%` }} />
                  </div>
                  <div className="button-row">
                    {delivery.status === "Scheduled" && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          void runBulkAction(
                            () => api.inspectBulkDelivery(delivery.delivery_id),
                            "Driver, tanker, seal, material, COA, and temperature verified; collect pre-unload sample",
                          )
                        }
                      >
                        Complete Receiving Inspection
                      </button>
                    )}
                    {delivery.status === "Ready for Pre-Unload Sample" && (
                      <button
                        className="button primary"
                        onClick={() =>
                          void runBulkAction(
                            () => api.bulkDeliveryAction(delivery.delivery_id, "sample"),
                            "Pre-unload sample collected and sent to QA",
                          )
                        }
                      >
                        Collect Pre-Unload Sample
                      </button>
                    )}
                    {delivery.status === "QA Released for Unloading" && (
                      <button
                        className="button primary"
                        onClick={() =>
                          void runBulkAction(
                            () => api.bulkDeliveryAction(delivery.delivery_id, "start"),
                            "QA-released tanker unloading started",
                          )
                        }
                      >
                        Start Automatic Unloading
                      </button>
                    )}
                  </div>
                </article>
              ))}
            {!bulkDeliveries.some((delivery) => !["Pending QA Review", "Released", "On Hold", "Rejected"].includes(delivery.status)) && (
              <p className="empty-state">Office-scheduled tanker deliveries will appear here.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Warehouse Transfer Order Dispatch" eyebrow="Priority Queue & Operator Ownership">
          <div className="queue-layout">
            <div className="queue-list">
              {warehouseQueue.length ? warehouseQueue.map((order) => (
                <button
                  key={order.id}
                  className={`queue-card ${activeTo?.to_number === order.to_number ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedTo(order.to_number);
                    void loadWorkspace(order.po_number);
                  }}
                >
                  <div><strong>{order.to_number}</strong><span className={`priority priority-${order.priority.toLowerCase()}`}>{order.priority}</span></div>
                  <span>{order.po_number} → {order.destination}</span>
                  <small>{order.status} · {order.owner}</small>
                  <progress max="100" value={order.progress} />
                </button>
              )) : <p className="empty-state">No transfer orders are waiting.</p>}
            </div>

            <div className="work-panel">
              {activeTo ? (
                <>
                  <p className="eyebrow">Selected Warehouse Job</p>
                  <h3>{activeTo.to_number}</h3>
                  <div className="detail-list">
                    <div><span>PO</span><strong>{activeTo.po_number}</strong></div>
                    <div><span>Destination</span><strong>{activeTo.destination}</strong></div>
                    <div><span>Owner</span><strong>{activeTo.owner}</strong></div>
                    <div><span>Status</span><strong>{activeTo.status}</strong></div>
                    <div><span>Progress</span><strong>{activeTo.progress}%</strong></div>
                  </div>
                  {activeTo.blocker && <div className="alert error">{activeTo.blocker}</div>}
                  <div className="button-row">
                    <button className="button primary" onClick={() => void runAction(() => api.warehouseAction(activeTo.to_number, "accept"), activeTo.to_number.startsWith("TO-FG-") ? "Outbound FG pickup accepted" : "Warehouse accepted the transfer order")}>Accept</button>
                    <button className="button primary" onClick={() => void runAction(() => api.warehouseAction(activeTo.to_number, "pick"), activeTo.to_number.startsWith("TO-FG-") ? "Finished goods picked up from Packaging" : "Automatic warehouse pick completed")}>{activeTo.to_number.startsWith("TO-FG-") ? "Pick Up FG" : "Start Automatic Pick"}</button>
                    <button className="button primary" onClick={() => void runAction(() => api.warehouseAction(activeTo.to_number, "deliver"), activeTo.to_number.startsWith("TO-FG-") ? "Finished goods staged at Shipping Dock" : "Transfer order delivered")}>{activeTo.to_number.startsWith("TO-FG-") ? "Stage at Shipping Dock" : "Deliver"}</button>
                  </div>
                  {activeTo.to_number.startsWith("TO-FG-") && (() => {
                    const po = productionOrders.find((item) => item.po_number === activeTo.po_number);
                    const run = packagingRuns.find((item) => item.po_number === activeTo.po_number);
                    if (!po || !run) return null;
                    const gross = run.bottles_completed;
                    const rejects = run.rejects;
                    const good = Math.max(0, gross - rejects);
                    const shortfall = Math.max(0, po.quantity - good);
                    const reconciliation = routeChanges.find((request) => request.po_number === po.po_number && request.resource_type === "finished_goods_quantity" && request.requested_resource === String(good));
                    return (
                      <div className={`fg-reconciliation-panel ${shortfall > 0 ? "short" : "balanced"}`}>
                        <div className="fg-count-grid">
                          <article><span>PO Target</span><strong>{po.quantity}</strong></article>
                          <article><span>Gross Filled</span><strong>{gross}</strong></article>
                          <article><span>Rejected</span><strong>{rejects}</strong></article>
                          <article><span>Final Good Bottles</span><strong>{good}</strong></article>
                          <article><span>Exact Difference</span><strong>{shortfall}</strong></article>
                        </div>
                        {shortfall > 0 && !reconciliation && (
                          <button className="button warning" onClick={() => void runAction(() => api.requestRouteChange({
                            po_number: po.po_number,
                            resource_type: "finished_goods_quantity",
                            current_resource: String(po.quantity),
                            requested_resource: String(good),
                            reason: `FG reconciliation before pickup: ${good} good bottles, ${rejects} rejects, exact shortfall ${shortfall}`,
                            requester: "Warehouse",
                          }), `Office notified of exact FG count: ${good} (-${shortfall})`)}>
                            Request Exact Difference from Office · {good} (-{shortfall})
                          </button>
                        )}
                        {reconciliation && <p><strong>Office reconciliation:</strong> {reconciliation.status} · {reconciliation.current_resource} → {reconciliation.requested_resource}</p>}
                      </div>
                    );
                  })()}
                  {(() => {
                    const comparison = asArray<T.MaterialComparison>(workspace?.comparison);
                    const substitutionCandidate = comparison.find(
                      (item) =>
                        item.status !== "Ready" &&
                        Boolean(item.recommended_substitute_lot),
                    );
                    const alternateLotCandidate = comparison.find(
                      (item) =>
                        item.status !== "Ready" &&
                        Boolean(item.recommended_lot),
                    );

                    const candidate = substitutionCandidate ?? alternateLotCandidate;
                    const requestedLot = substitutionCandidate?.recommended_substitute_lot ?? alternateLotCandidate?.recommended_lot;
                    if (!candidate || !requestedLot) return null;

                    const substituteName = substitutionCandidate?.recommended_substitute_material_name;
                    const label = substituteName
                      ? `Request Substitute: ${substituteName} · ${requestedLot}`
                      : `Request Alternate Lot: ${requestedLot}`;

                    return (
                      <button
                        className="button warning"
                        onClick={() =>
                          void runAction(
                            () =>
                              api.requestSubstitution(
                                activeTo.po_number,
                                candidate.material_code,
                                requestedLot,
                              ),
                            substituteName
                              ? `Office notified: substitute ${substituteName} requested`
                              : `Office notified: alternate lot ${requestedLot} requested`,
                          )
                        }
                      >
                        {label}
                      </button>
                    );
                  })()}
               </>
              ) : <p className="empty-state">Select a transfer order.</p>}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Live Material Position" eyebrow="Warehouse → Vestibule → Chem Weigh → Kitting">
          <div className="inventory-grid">
            {materialPositions.map((pos) => <article key={pos.container_id} className="inventory-card"><div><strong>{pos.material_name}</strong><span>{pos.hazard_class === "Hazardous" ? "⚠ HAZARDOUS" : pos.status}</span></div><p>{pos.lot_number} · {pos.container_id}</p><dl><div><dt>Quantity</dt><dd>{pos.quantity} {pos.unit}</dd></div><div><dt>Live Location</dt><dd>{pos.location_code}</dd></div><div><dt>PO / PR</dt><dd>{pos.po_number ?? "Staging stock"} · {pos.pr_number ?? "—"}</dd></div></dl></article>)}
          </div>
        </SectionCard>

        <SectionCard title="Warehouse Inventory Browser" eyebrow="Lot Status, FEFO & Locations">
          <div className="inventory-grid">
            {inventory.map((lot) => (
              <article key={lot.id} className="inventory-card">
                <div><strong>{lot.material_name}</strong><span className={`material-status status-${lot.qa_status.toLowerCase().replace(" ", "-")}`}>{lot.qa_status}</span></div>
                <p>{lot.material_code} · {lot.lot_number}</p>
                <dl><div><dt>Available</dt><dd>{lot.quantity - lot.reserved_quantity} {lot.unit}</dd></div><div><dt>Location</dt><dd>{lot.location}</dd></div><div><dt>Expires</dt><dd>{lot.expiration_date}</dd></div></dl>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    );
  }

  function mergeLiveStagingPositions(rows: T.MaterialPosition[]) {
    const grouped = new Map<string, T.MaterialPosition>();
    for (const row of rows) {
      const key = `${row.location_code}|${row.material_code}|${row.lot_number}|${row.unit}|${row.hazard_class}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, { ...row });
      } else {
        grouped.set(key, {
          ...existing,
          quantity: existing.quantity + row.quantity,
          status: "Staged",
        });
      }
    }
    return Array.from(grouped.values());
  }

  async function loadCampaignInventory(campaignId: string) {
    if (!campaignId) { setCampaignPlantInventory(null); return; }
    const data = await api.campaignPlantInventory(campaignId);
    setCampaignPlantInventory(data);
  }

  function addPrDraftLine(req: T.CampaignInventoryRequirement, lot: T.InventoryLot, quantity: number) {
    if (quantity <= 0) return;
    setPrDraftLines((current) => [...current, {
      material_code: req.material_code,
      material_name: req.material_name,
      lot_number: lot.lot_number,
      requested_quantity: quantity,
      unit: req.unit,
      source_location: lot.location,
      hazard_class: req.hazard_class,
    }]);
  }

  function renderWeighingZone() {
    const weighRoutePo = workspace?.production_order
      ?? productionOrders.find((po) => deliveredOrders.some((order) => order.po_number === po.po_number))
      ?? productionOrders[0];
    const selectedRoomAsset = weighRooms.find((room) => room.room_code === selectedRoom);
    const selectedBentOrder = bentOrders.find(
      (order) => order.po_number === selectedRoomAsset?.active_po || order.owner.startsWith(selectedRoom),
    );
    const cartAlreadyBent = Boolean(
      selectedRoomAsset?.active_po && selectedBentOrder?.po_number === selectedRoomAsset.active_po,
    );
    const activeTickets = weighTickets.filter((ticket) => ticket.status !== "Completed");
    const completedTickets = weighTickets.filter((ticket) => ticket.status === "Completed");

    return (
      <div className="zone-stack">
        <div className="zone-summary-grid">
          <article><span>Rooms Available</span><strong>{weighRooms.filter((room) => room.status === "Available").length}</strong></article>
          <article><span>Delivered Carts</span><strong>{deliveredOrders.length}</strong></article>
          <article><span>Bent Into Rooms</span><strong>{bentOrders.length}</strong></article>
          <article><span>Open Tickets</span><strong>{weighTickets.filter((ticket) => ticket.status !== "Completed").length}</strong></article>
          <article><span>Completed Tickets</span><strong>{weighTickets.filter((ticket) => ticket.status === "Completed").length}</strong></article>
        </div>

        <SectionCard title="PAS-X Material Reconciliation & PR Builder" eyebrow="Search PO Material → Check Staging → Select Warehouse Lot → Build PR">
          <p className="subtext">Work one PO material at a time. PAS-X stores each selected lot and quantity in the PR draft until every campaign requirement is covered, then the complete PR can be submitted to Warehouse.</p>

          <div className="weigh-pr-toolbar">
            <label>Office Campaign
              <select value={activeWeighCampaignId} onChange={(event) => {
                const id=event.target.value;
                setActiveWeighCampaignId(id);
                setPrDraftLines([]);
                setSelectedRequirementCode("");
                setWeighMaterialSearch("");
                setWeighInventoryMode("required");
                void loadCampaignInventory(id);
              }}>
                <option value="">Select campaign...</option>
                {campaigns.filter(c=>c.status!=="Closed").map(c=><option key={c.campaign_id} value={c.campaign_id}>{c.campaign_id} · {c.po_numbers}</option>)}
              </select>
            </label>

            {campaignPlantInventory && <label>PO Material Number Search
              <input
                placeholder="Example: 9PHQ9Y1OLM"
                value={weighMaterialSearch}
                onChange={(event)=>{
                  const value=event.target.value.toUpperCase();
                  setWeighMaterialSearch(value);
                  const exact=campaignPlantInventory.requirements.find(r=>r.material_code.toUpperCase()===value);
                  if(exact) setSelectedRequirementCode(exact.material_code);
                }}
              />
            </label>}
          </div>

          {campaignPlantInventory && (
            <>
              <div className="campaign-workload-strip">
                <div><strong>{campaignPlantInventory.campaign.campaign_id}</strong><span>{campaignPlantInventory.campaign.po_numbers.join(" · ")}</span></div>
                <span className="status-chip">{campaignPlantInventory.campaign.status}</span>
                {campaignPlantInventory.campaign.status==="Pending Weigh Acceptance" &&
                  <button className="button primary" onClick={()=>void runAction(async()=>{
                    await api.acceptCampaignWorkload(campaignPlantInventory.campaign.campaign_id,weighOperator);
                    await loadCampaignInventory(campaignPlantInventory.campaign.campaign_id);
                  },"Campaign workload accepted")}>Accept Campaign Workload</button>}
              </div>

              <div className="material-chip-row">
                {campaignPlantInventory.requirements.map(req=>{
                  const selected=req.material_code===selectedRequirementCode;
                  const draftQty=prDraftLines.filter(x=>x.material_code===req.material_code).reduce((a,b)=>a+b.requested_quantity,0);
                  const covered=req.staged_available+draftQty >= req.campaign_required-0.0001;
                  return <button
                    key={req.material_code}
                    className={`material-chip ${selected?"selected":""} ${covered?"complete":""}`}
                    onClick={()=>{setSelectedRequirementCode(req.material_code);setWeighMaterialSearch(req.material_code);setWeighInventoryMode("required")}}
                  >
                    <strong>{req.material_code}</strong>
                    <span>{req.material_name}</span>
                    <small>{covered?"Covered":`${Math.max(0,req.remaining_to_request-draftQty).toFixed(3)} ${req.unit} to request`}</small>
                  </button>
                })}
              </div>

              {(()=>{
                const req=campaignPlantInventory.requirements.find(r=>r.material_code===selectedRequirementCode) ??
                  campaignPlantInventory.requirements.find(r=>r.material_code.toUpperCase()===weighMaterialSearch.trim().toUpperCase());
                if(!req) return <div className="empty-state">Enter or select a material number from the PO to reconcile staging and Warehouse inventory.</div>;

                const staged=campaignPlantInventory.staging.filter(x=>x.material_code===req.material_code);
                const draftQty=prDraftLines.filter(x=>x.material_code===req.material_code).reduce((a,b)=>a+b.requested_quantity,0);
                const stillNeeded=Math.max(0,req.campaign_required-req.staged_available-draftQty);
                const primaryLots=campaignPlantInventory.required_warehouse.filter(x=>x.material_code===req.material_code);
                const subs=campaignPlantInventory.approved_substitutes[req.material_code] ?? [];
                const rnd=campaignPlantInventory.rnd_candidates.filter(x=>x.target_material_code===req.material_code);

                return <div className="material-reconcile-panel">
                  <div className="material-summary-strip">
                    <div><span>Required</span><strong>{req.campaign_required.toFixed(3)} {req.unit}</strong></div>
                    <div><span>Already Staged</span><strong>{req.staged_available.toFixed(3)} {req.unit}</strong></div>
                    <div><span>PR Draft</span><strong>{draftQty.toFixed(3)} {req.unit}</strong></div>
                    <div><span>Remaining</span><strong>{stillNeeded.toFixed(3)} {req.unit}</strong></div>
                  </div>

                  <div className="inventory-mode-tabs">
                    <button className={weighInventoryMode==="required"?"active":""} onClick={()=>setWeighInventoryMode("required")}>Required Material</button>
                    <button className={weighInventoryMode==="substitutes"?"active":""} onClick={()=>setWeighInventoryMode("substitutes")}>Approved Substitutes</button>
                    <button className={weighInventoryMode==="full"?"active":""} onClick={()=>setWeighInventoryMode("full")}>Advanced Plant Search</button>
                  </div>

                  {weighInventoryMode==="required" && <>
                    <div className="compact-inventory-section">
                      <h4>Chem Weigh Staging</h4>
                      {staged.length ? <div className="compact-lot-list">{staged.map(pos=><div key={pos.container_id} className="compact-lot-row"><span>{pos.lot_number}</span><span>{pos.location_code}</span><strong>{pos.quantity} {pos.unit}</strong>{pos.hazard_class==="Hazardous"&&<em>⚠ HAZ</em>}</div>)}</div>
                      : <p className="empty-state">No {req.material_name} is currently staged. A Warehouse PR is required.</p>}
                    </div>

                    <div className="compact-inventory-section">
                      <h4>Warehouse Lots — {req.material_name}</h4>
                      {primaryLots.length ? <div className="compact-lot-list">{primaryLots.map(lot=>{
                        const available=Math.max(0,lot.quantity-(lot.reserved_quantity??0));
                        const qty=Math.min(stillNeeded,available);
                        return <div key={lot.lot_number} className="compact-lot-row">
                          <span>{lot.lot_number}</span><span>{lot.location}</span><strong>{available.toFixed(3)} {lot.unit}</strong>
                          <button className="button secondary" disabled={qty<=0 || campaignPlantInventory.campaign.status==="Pending Weigh Acceptance"} onClick={()=>addPrDraftLine(req,lot,qty)}>Add {qty.toFixed(3)}</button>
                        </div>
                      })}</div>:<p className="empty-state">No primary Warehouse lot is available. Check approved substitutes.</p>}
                    </div>
                  </>}

                  {weighInventoryMode==="substitutes" && <div className="compact-inventory-section">
                    <h4>Approved Alternative Materials</h4>
                    {subs.length ? <div className="compact-lot-list">{subs.map(sub=><div key={sub.internal_lot_number} className="compact-lot-row"><span>{sub.material_name}</span><span>{sub.internal_lot_number}</span><strong>{Number(sub.available_quantity).toFixed(3)} {sub.unit_of_measure}</strong><button className="button warning" onClick={()=>void runAction(()=>api.requestWeighSubstitution(campaignPlantInventory.campaign.po_numbers[0],req.material_code,sub.internal_lot_number),`Office approval requested for ${sub.material_name}`)}>Request Office Approval</button></div>)}</div>
                    : <p className="empty-state">No approved substitute inventory is available. Use Advanced Plant Search to request an R&D evaluation through Office.</p>}
                  </div>}

                  {weighInventoryMode==="full" && <div className="compact-inventory-section">
                    <h4>Advanced Plant Search / R&D Escalation</h4>
                    <p className="subtext">This view is intentionally hidden during normal PR construction. Use it only when the required material and approved alternatives cannot satisfy the campaign.</p>
                    {rnd.length ? <div className="compact-lot-list">{rnd.map(candidate=><div key={candidate.candidate_code} className="compact-lot-row"><span>{candidate.candidate_name}</span><span>{candidate.candidate_code}</span><strong>{candidate.approval_status}</strong><button className="button warning" onClick={()=>void runAction(()=>api.requestRndAlternativeEvaluation({campaign_id:campaignPlantInventory.campaign.campaign_id,po_number:campaignPlantInventory.campaign.po_numbers[0],original_material_code:req.material_code,candidate_code:candidate.candidate_code,requester:weighOperator,note:"Primary and approved substitute inventory cannot satisfy campaign requirement."}),`Office asked to initiate R&D evaluation of ${candidate.candidate_name}`)}>Request Office → R&D</button></div>)}</div>:null}
                    <details className="full-inventory-details"><summary>Open complete Warehouse inventory</summary><div className="compact-lot-list">{campaignPlantInventory.warehouse.filter(l=>!weighMaterialSearch || `${l.material_code} ${l.material_name} ${l.lot_number}`.toUpperCase().includes(weighMaterialSearch.toUpperCase())).map(lot=><div key={`${lot.material_code}-${lot.lot_number}`} className="compact-lot-row"><span>{lot.material_name}</span><span>{lot.material_code} · {lot.lot_number}</span><strong>{lot.quantity} {lot.unit} · {lot.location}</strong></div>)}</div></details>
                  </div>}

                  <div className="pr-draft-compact">
                    <h4>PAS-X PR Draft</h4>
                    {prDraftLines.length ? prDraftLines.map((line,index)=><div key={`${line.material_code}-${line.lot_number}-${index}`} className="compact-lot-row"><span>{line.material_code}</span><span>{line.lot_number}</span><strong>{line.requested_quantity.toFixed(3)} {line.unit}</strong><button className="button secondary" onClick={()=>setPrDraftLines(current=>current.filter((_,i)=>i!==index))}>Remove</button></div>):<p className="empty-state">No Warehouse lots have been added yet.</p>}
                  </div>
                </div>
              })()}

              {(()=>{
                const uncovered=campaignPlantInventory.requirements.filter(req=>{
                  const draft=prDraftLines.filter(x=>x.material_code===req.material_code).reduce((a,b)=>a+b.requested_quantity,0);
                  return req.staged_available+draft < req.campaign_required-0.0001;
                });
                return <div className="pr-submit-strip">
                  <span>{uncovered.length ? `${uncovered.length} PO material requirement(s) still need coverage.` : "All PO materials covered. PR is ready for Warehouse."}</span>
                  <button className="button primary" disabled={!prDraftLines.length || uncovered.length>0 || campaignPlantInventory.campaign.status==="Pending Weigh Acceptance"} onClick={()=>void runAction(async()=>{
                    const primaryPo=campaignPlantInventory.campaign.po_numbers[0];
                    await api.createMaterialPR(primaryPo,campaignPlantInventory.campaign.campaign_id,weighOperator,prDraftLines);
                    setPrDraftLines([]);
                    await refresh();
                    await loadCampaignInventory(campaignPlantInventory.campaign.campaign_id);
                  },"Complete Material PR submitted to Warehouse")}>Submit Complete PR to Warehouse</button>
                </div>
              })()}
            </>
          )}
        </SectionCard>

        <SectionCard title="Material Zone Handoff" eyebrow="Warehouse → Vestibule → Weigh Staging → Weigh Room → Knitting">
          {campaignPlantInventory ? (()=>{
            const campaignId=campaignPlantInventory.campaign.campaign_id;
            const requiredCodes=new Set(campaignPlantInventory.requirements.map(r=>r.material_code));
            const vestibule=materialPositions.filter(p=>p.campaign_id===campaignId && p.location_code==="WH-VEST-01");
            const general=mergeLiveStagingPositions(materialPositions.filter(p=>p.location_code==="CW-STAGE-01" && requiredCodes.has(p.material_code)));
            const hazardous=mergeLiveStagingPositions(materialPositions.filter(p=>p.location_code==="CW-HAZ-01" && requiredCodes.has(p.material_code)));
            const inRoom=materialPositions.filter(p=>p.campaign_id===campaignId && ["WR-01","WR-02"].includes(p.location_code));
            const stagedQty=(code:string)=>[...general,...hazardous,...inRoom].filter(p=>p.material_code===code).reduce((sum,p)=>sum+p.quantity,0);
            const stagingComplete=vestibule.length===0 && campaignPlantInventory.requirements.every(r=>stagedQty(r.material_code)+1e-9>=r.campaign_required);
            const campaignInRoom=inRoom.length>0 || campaignPlantInventory.campaign.status==="In Weighing";

            return <>
              <div className="zone-handoff-path">
                <span>Warehouse / Black Zone</span><b>→</b>
                <span className={vestibule.length?"active":""}>Weigh Vestibule / Transition</span><b>→</b>
                <span className={!campaignInRoom && (general.length||hazardous.length)?"active":""}>CW-Staging + CWH-Staging / Grey Zone</span><b>→</b>
                <span className={campaignInRoom?"active":""}>{selectedRoom} / White Zone</span><b>→</b>
                <span>Chem Weigh Knitting / Grey Zone</span>
              </div>

              {vestibule.length > 0 && (
                <div className="handoff-stage-block handoff-stage-block--attention">
                  <div className="handoff-stage-heading">
                    <div>
                      <span className="eyebrow">STEP 1 · WEIGH OPERATOR CUSTODY</span>
                      <h3>Bend Delivered Material Into Weigh Staging</h3>
                      <p>Warehouse custody ends at the Vestibule. Each container must be accepted by Weighing and bent into CW-Staging or CWH-Staging before a weigh-room bend is available.</p>
                    </div>
                    <span className="status-chip">{vestibule.length} waiting</span>
                  </div>

                  <div className="vestibule-bend-list">
                    {vestibule.map(pos=>{
                      const destination=pos.hazard_class==="Hazardous" ? "CWH-Staging" : "CW-Staging";
                      return <article key={pos.container_id} className="vestibule-bend-row">
                        <div><strong>{pos.material_name}</strong><small>{pos.material_code} · {pos.lot_number}</small></div>
                        <div><span>{pos.quantity} {pos.unit}</span><small>WH-VEST-01</small></div>
                        <div className="handoff-arrow">→</div>
                        <div><strong>{destination}</strong><small>{pos.hazard_class==="Hazardous"?"CW-HAZ-01":"CW-STAGE-01"}</small></div>
                        <button className="button primary bend-staging-button" onClick={()=>void runAction(async()=>{
                          await api.bendVestibuleToStaging(pos.container_id,weighOperator);
                          await refresh();
                          await loadCampaignInventory(campaignId);
                        },`${pos.material_name} accepted and bent into ${destination}`)}>Accept + Bend Into {destination}</button>
                      </article>
                    })}
                  </div>
                </div>
              )}

              <div className="handoff-stage-block">
                <div className="handoff-stage-heading">
                  <div>
                    <span className="eyebrow">STEP 2 · GREY ZONE INVENTORY</span>
                    <h3>Current Weigh Staging Inventory</h3>
                    <p>General material remains in CW-Staging. Alcohol and flavors remain in CWH-Staging. The room bend stays locked until the complete campaign requirement is present.</p>
                  </div>
                  <span className={`status-chip ${stagingComplete?"ready-chip":""}`}>{stagingComplete?"READY":"NOT READY"}</span>
                </div>

                <div className="staging-two-column">
                  <div className="compact-inventory-section">
                    <h4>CW-Staging — General</h4>
                    {general.length ? <div className="compact-lot-list">{general.map(pos=><div key={pos.container_id} className="compact-lot-row staging-row"><span>{pos.material_name}</span><span>{pos.lot_number}</span><strong>{pos.quantity} {pos.unit}</strong><em>CW-STAGE-01</em></div>)}</div>:<p className="empty-state">No general material currently staged.</p>}
                  </div>
                  <div className="compact-inventory-section">
                    <h4>CWH-Staging — Hazardous</h4>
                    {hazardous.length ? <div className="compact-lot-list">{hazardous.map(pos=><div key={pos.container_id} className="compact-lot-row staging-row"><span>{pos.material_name}</span><span>{pos.lot_number}</span><strong>{pos.quantity} {pos.unit}</strong><em>⚠ CW-HAZ-01</em></div>)}</div>:<p className="empty-state">No hazardous material currently staged.</p>}
                  </div>
                </div>

                <div className="staging-requirement-grid">
                  {campaignPlantInventory.requirements.map(req=>{
                    const staged=stagedQty(req.material_code);
                    const short=Math.max(0,req.campaign_required-staged);
                    return <div key={req.material_code} className={`staging-requirement ${short<=1e-9?"complete":""}`}>
                      <strong>{req.material_name}</strong><span>{req.material_code}</span>
                      <small>Required {req.campaign_required.toFixed(3)} {req.unit}</small>
                      <small>In staging {staged.toFixed(3)} {req.unit}</small>
                      <b>{short<=1e-9?"Ready":`Short ${short.toFixed(3)} ${req.unit}`}</b>
                    </div>
                  })}
                </div>
              </div>

              {!campaignInRoom && (
                <div className={`campaign-bend-gate ${stagingComplete?"ready":""}`}>
                  <div>
                    <span className="eyebrow">STEP 3 · WHITE ZONE ENTRY</span>
                    <strong>{stagingComplete ? `Campaign Ready For ${selectedRoom}` : "Bend Into Weigh Room Interlocked"}</strong>
                    <span>{stagingComplete
                      ? `All campaign material is physically present in CW-Staging/CWH-Staging.`
                      : vestibule.length
                        ? "Material remains in the Weigh Vestibule. Bend every delivered container into staging first."
                        : "Staging does not yet cover the complete campaign requirement."}</span>
                  </div>
                  {stagingComplete && <button className="button primary white-zone-bend-button" onClick={()=>void runAction(async()=>{
                    await api.bendCampaignToWeighRoom(campaignId,selectedRoom,weighOperator);
                    await refresh();
                    await loadCampaignInventory(campaignId);
                    await syncCampaignWeighSequence();
                  },`Complete campaign bent from Weigh Staging into ${selectedRoom}`)}>Bend Complete Campaign Into {selectedRoom}</button>}
                </div>
              )}

              {campaignInRoom && (
                <div className="handoff-stage-block handoff-stage-block--ready">
                  <div className="handoff-stage-heading">
                    <div>
                      <span className="eyebrow">STEP 4 · WHITE ZONE DISPENSING</span>
                      <h3>Campaign Is In {selectedRoom}</h3>
                      <p>Open the sequenced PO ticket, tare the required scale, and weigh only the materials permitted on that selected scale.</p>
                    </div>
                    <span className="status-chip ready-chip">IN WHITE ZONE</span>
                  </div>
                </div>
              )}
            </>
          })():<p className="empty-state">Select an Office campaign above to begin the controlled material handoff.</p>}
        </SectionCard>

        <SectionCard title="Weigh Room Selection" eyebrow="White Zone Work Centers">
          <div className="weigh-room-grid">
            {weighRooms.map((room) => (
              <button key={room.id} className={`weigh-room-card ${selectedRoom === room.room_code ? "selected" : ""}`} onClick={() => setSelectedRoom(room.room_code)}>
                <div><strong>{room.room_code}</strong><span>{room.status}</span></div>
                <p>{room.name}</p>
                <small>Scale {room.scale_id} · {room.scale_status}</small>
                <small>Calibration due {room.calibration_due}</small>
                <small>{room.active_po ? `Active ${room.active_po}` : "No active PO"}</small>
              </button>
            ))}
          </div>
          <div className="button-row">
            <label className="inline-field">Operator<input value={weighOperator} onChange={(event) => setWeighOperator(event.target.value)} /></label>
            <span className="status-note">
              {selectedRoomAsset?.active_po
                ? `${selectedRoom} sequenced for ${selectedRoomAsset.active_po}`
                : "No campaign has completed the staging-to-white-zone bend."}
            </span>
            <button
              className="button primary"
              disabled={!selectedRoomAsset?.active_po}
              onClick={() => void runAction(
                activeRoomTicket(selectedRoom, selectedRoomAsset?.active_po)
                  ? resumeSelectedRoomWorkflow
                  : openWeighTicket,
                activeRoomTicket(selectedRoom, selectedRoomAsset?.active_po)
                  ? `Current ${selectedRoom} task resumed`
                  : "Electronic weigh ticket opened",
              )}
            >
              {activeRoomTicket(selectedRoom, selectedRoomAsset?.active_po)
                ? `Resume Current ${selectedRoom} Task`
                : `Open Ticket for ${selectedRoomAsset?.active_po ?? "Awaiting Campaign Bend"}`}
            </button>
          </div>
          {weighRoutePo && (
            <div className="route-request-panel">
              <p>Scheduled weigh room: <strong>{weighRoutePo.weigh_room}</strong>. A change remains scheduling-only until the operator bends the cart into the approved room.</p>
              <label>Requested room
                <select value={requestedWeighRoom} onChange={(event) => setRequestedWeighRoom(event.target.value)}>
                  {weighRooms.map((room) => <option key={room.id} value={room.room_code}>{room.room_code} · {room.status}</option>)}
                </select>
              </label>
              <label>Reason<input value={resourceChangeReason} onChange={(event) => setResourceChangeReason(event.target.value)} /></label>
              <button className="button secondary" onClick={() => void runAction(() => api.requestRouteChange({ po_number: weighRoutePo.po_number, resource_type: "weigh_room", current_resource: weighRoutePo.weigh_room, requested_resource: requestedWeighRoom, reason: resourceChangeReason, requester: "Weighing" }), "Weigh-room change request sent to Office")}>Request Weigh Room Change</button>
            </div>
          )}
        </SectionCard>

          {activeWeighCampaignId && (
            <div className="campaign-weigh-sequence-banner">
              <div>
                <span className="eyebrow">CAMPAIGN DISPENSE SEQUENCE</span>
                <strong>Material-by-material across every campaign PO</strong>
                <small>API PO1 → API PO2 → API PO3 → next material PO1 → PO2 → PO3.</small>
              </div>
              {campaignWeighTask?.po_number && <div className="campaign-weigh-next">
                <span>{campaignWeighTask.phase === "signature" ? "Next Signature" : "Current Weigh Task"}</span>
                <strong>{campaignWeighTask.po_number}</strong>
                <small>{campaignWeighTask.material_name ?? "Electronic signature"}</small>
                <button className="button secondary campaign-sync-button" onClick={()=>void resumeCurrentCampaignWeighTask()}>
                  {selectedRoomAsset?.active_po ? `Resume ${selectedRoom} Task` : "Load Current Task"}
                </button>
              </div>}
            </div>
          )}

        <div className="zone-columns weighing-layout">
          <SectionCard title="Electronic Ticket Queue" eyebrow="PAS-X Dispensing Records">
            <div className="ticket-list">
              {activeTickets.length ? activeTickets.map((ticket) => (
                <button key={ticket.id} className={`ticket-card ${selectedTicket === ticket.ticket_number ? "selected" : ""}`} onClick={() => void loadWeighTicket(ticket.ticket_number)}>
                  <strong>{ticket.ticket_number}</strong>
                  <span>{ticket.po_number} · {ticket.room_code}</span>
                  <small>{ticket.status} · Material {ticket.current_material_index + 1}</small>
                </button>
              )) : <p className="empty-state">No weigh tickets are open.</p>}
              {completedTickets.length > 0 && (
                <details className="completed-ticket-history">
                  <summary>Completed Tickets ({completedTickets.length})</summary>
                  {completedTickets.map((ticket) => (
                    <button key={ticket.id} className={`ticket-card ${selectedTicket === ticket.ticket_number ? "selected" : ""}`} onClick={() => void loadWeighTicket(ticket.ticket_number)}>
                      <strong>{ticket.ticket_number}</strong>
                      <span>{ticket.po_number} · {ticket.room_code}</span>
                      <small>Completed</small>
                    </button>
                  ))}
                </details>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Scale HMI" eyebrow="Tare, Barcode & Tolerance Interlocks">
            {weighWorkspace && campaignWeighTask?.po_number && weighWorkspace.ticket.po_number !== campaignWeighTask.po_number ? (
              <div className="weigh-hmi stale-campaign-hmi">
                <div className="hmi-header">
                  <div><span>Previous Ticket</span><strong>{weighWorkspace.ticket.ticket_number}</strong></div>
                  <div><span>Required Next PO</span><strong>{campaignWeighTask.po_number}</strong></div>
                </div>
                <div className="campaign-advance-interlock">
                  <span className="eyebrow">CAMPAIGN ADVANCE INTERLOCK</span>
                  <h3>Previous PO is complete for this material.</h3>
                  <p>The HMI will not allow another tare or dispense against {weighWorkspace.ticket.po_number}. Resume the canonical campaign task to load {campaignWeighTask.po_number} / {campaignWeighTask.material_name ?? "next material"}.</p>
                  <button className="button primary" onClick={()=>void resumeCurrentCampaignWeighTask()}>Load {campaignWeighTask.po_number}</button>
                </div>
              </div>
            ) : weighWorkspace ? (
              <div className="weigh-hmi">
                <div className="hmi-header"><div><span>Ticket</span><strong>{weighWorkspace.ticket.ticket_number}</strong></div><div><span>Status</span><strong>{weighWorkspace.ticket.status}</strong></div></div>
                <div className="scale-selector">{["Bench Scale","Hazardous Scale","Dye Scale Booth"].map((scale) => <button key={scale} className={`button ${selectedScale===scale?"primary":"secondary"}`} onClick={() => setSelectedScale(scale)}>{scale}</button>)}</div>
                <progress max="100" value={weighWorkspace.completion_percent} />
                <p>{weighWorkspace.completion_percent}% complete</p>
                {weighWorkspace.current_line ? (
                  <>
                    <h3>{weighWorkspace.current_line.material_name}</h3>
                    <div className="detail-list">
                      <div><span>Required Scale</span><strong>{weighWorkspace.current_line.scale_type}</strong></div><div><span>Container</span><strong>{weighWorkspace.current_line.container_id ?? "Pending"}</strong></div><div><span>Material</span><strong>{weighWorkspace.current_line.material_code}</strong></div>
                      <div><span>Lot</span><strong>{weighWorkspace.current_line.lot_number}</strong></div>
                      <div><span>Target</span><strong>{weighWorkspace.current_line.target_quantity} {weighWorkspace.current_line.unit}</strong></div>
                      <div><span>Tolerance</span><strong>±{weighWorkspace.current_line.tolerance}%</strong></div>
                      <div><span>Tare</span><strong>{weighWorkspace.ticket.tare_confirmed ? "Confirmed" : "Required"}</strong></div>
                      <div><span>Barcode</span><strong>{weighWorkspace.current_line.barcode_verified ? "Verified" : "Required"}</strong></div>
                    </div>
                    <div className="hmi-controls">
                      <button className="button primary" disabled={selectedScale !== weighWorkspace.current_line.scale_type} onClick={() => void runWeighAction(() => api.tareWeighTicket(weighWorkspace.ticket.ticket_number, weighOperator), "Scale tare confirmed")}>Tare Scale</button>
                      <label>Barcode<input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder={`${weighWorkspace.current_line.material_code} or ${weighWorkspace.current_line.lot_number}`} /></label>
                      <button className="button secondary" disabled={selectedScale !== weighWorkspace.current_line.scale_type} onClick={() => void runWeighAction(() => api.verifyWeighBarcode(weighWorkspace.ticket.ticket_number, barcode.trim() || weighWorkspace.current_line!.lot_number), "Barcode verified")}>Scan / Verify Barcode</button>
                      <label>Actual Weight<input type="number" step="0.001" value={actualWeight} placeholder="Enter weight" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setActualWeight(event.target.value)} /></label>
                      <button className="button primary" disabled={actualWeight.trim() === "" || selectedScale !== weighWorkspace.current_line.scale_type} onClick={() => void runWeighAction(() => api.weighMaterial(weighWorkspace.ticket.ticket_number, Number(actualWeight), weighOperator), "Material dispensed within tolerance", { clearBarcode: true, clearWeight: true })}>Record Weight</button>
                    </div>
                  </>
                ) : (
                  <div className="signature-panel"><p>All material lines are complete.</p><label>Electronic Signature<input value={signature} onChange={(event) => setSignature(event.target.value)} /></label><button className="button primary" onClick={() => void runWeighAction(() => api.signWeighTicket(weighWorkspace.ticket.ticket_number, signature), "Weigh ticket signed and released to Mixing")}>Sign & Complete Ticket</button></div>
                )}
              </div>
            ) : <p className="empty-state">Open the sequenced PO ticket, then tare the correct scale. Only materials permitted on that scale are visible for weighing.</p>}
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderMixingZone() {
    // Persisted workspace may be recovered silently so automatic PLC/tick
    // behavior continues, but it is not exposed as an operator HMI until the
    // operator explicitly enters/resumes the room.
    const batch = mixRoomEntered ? mixWorkspace?.batch : undefined;
    const premix = mixRoomEntered ? mixWorkspace?.premix : undefined;
    const scheduledHold = productionOrders.find((po) => po.po_number === batch?.po_number)?.hold_tank;
    const bulkProductionOrder = productionOrders.find((po) => po.po_number === bulkPo);
    const bulkMaterial = bulkProductionOrder?.bulk_material ?? "Propylene Glycol";
    const bulkRecipe = bulkRecipeByMaterial[bulkMaterial] ?? bulkRecipeByMaterial["Propylene Glycol"];
    const bulkSourceTank = bulkTanks.find((tank) => tank.tank_code === bulkRecipe.tankCode);

    const currentManualMaterialName =
      batch?.phase === "Manual Add - Alcohol"
        ? "Alcohol"
        : batch?.phase === "Manual Add - Anhydrous Citric Acid"
          ? "Anhydrous Citric Acid"
          : batch?.phase === "Manual Add - Benzoic Acid"
            ? "Benzoic Acid"
            : batch?.phase === "Manual Add - Edetate Disodium"
              ? "Edetate Disodium"
              : batch?.phase === "Manual Add - Saccharin Sodium"
                ? "Saccharin Sodium"
                : batch?.phase === "Controlled API Addition"
                  ? "Prednisolone"
                  : batch?.phase === "Flavor Addition"
                    ? (mixWorkspace?.materials ?? []).find((item) =>
                        ["Cherry", "Strawberry", "Grape", "Berry"].includes(item.material_name),
                      )?.material_name ?? null
                    : null;

    const currentManualMaterial = (mixWorkspace?.materials ?? []).find(
      (item) => item.material_name === currentManualMaterialName,
    );

    const activeManualSequenceNames =
      batch?.phase === "Open Tank - Manual Group 1" ||
      ["Manual Add - Alcohol", "Manual Add - Anhydrous Citric Acid", "Manual Add - Benzoic Acid"].includes(batch?.phase ?? "")
        ? ["Alcohol", "Anhydrous Citric Acid", "Benzoic Acid"]
        : batch?.phase === "Open Tank - Manual Group 2" ||
          ["Manual Add - Edetate Disodium", "Manual Add - Saccharin Sodium"].includes(batch?.phase ?? "")
          ? ["Edetate Disodium", "Saccharin Sodium"]
          : batch?.phase === "Open Tank - API / Flavor" ||
            ["Controlled API Addition", "Flavor Addition"].includes(batch?.phase ?? "")
            ? [
                "Prednisolone",
                ...((mixWorkspace?.materials ?? [])
                  .filter((item) => ["Cherry", "Strawberry", "Grape", "Berry"].includes(item.material_name))
                  .map((item) => item.material_name)),
              ]
            : [];

    const activeManualSequenceMaterials=(mixWorkspace?.materials ?? []).filter(
      (item) => activeManualSequenceNames.includes(item.material_name),
    );

    const currentManualVerified =
      Boolean(currentManualMaterial) &&
      (
        currentManualMaterial!.weighing_status.includes("BARCODE VERIFIED") ||
        currentManualMaterial!.weighing_status.includes("ADDED TO MIX TANK")
      );

    return (
      <div className="zone-stack">
        <div className="zone-summary-grid">
          <article><span>Mix Rooms Available</span><strong>{mixRooms.filter((room) => room.status === "Available").length}</strong></article>
          <article><span>Ready Queue</span><strong>{mixQueue.length}</strong></article>
          <article><span>Active Batches</span><strong>{mixBatches.filter((item) => item.status !== "Complete").length}</strong></article>
          <article><span>Process Faults</span><strong>{mixBatches.filter((item) => item.status === "Faulted").length}</strong></article>
        </div>

        <SectionCard title="Bulk Excipient Production Charge" eyebrow="PO-Selected Bulk Material · Tank Verification & Automatic Transfer">
          <div className="form-grid compact">
            <label>Production Order
              <select value={bulkPo} onChange={(event) => setBulkPo(event.target.value)}>
                {productionOrders.map((po) => (
                  <option key={po.id} value={po.po_number}>{po.po_number} · {po.mix_tank}</option>
                ))}
              </select>
            </label>
            <label>Bulk Material
              <input value={bulkMaterial} readOnly />
            </label>
            <label>Source Tank
              <input value={`${bulkRecipe.tankCode} · ${bulkMaterial}`} readOnly />
            </label>
            <label>Recipe Charge
              <input value={`${bulkRecipe.quantityKg} kg`} readOnly />
            </label>
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={!bulkPo || bulkSourceTank?.qa_status !== "Released"}
              onClick={() =>
                void runBulkAction(
                  () =>
                    api.createBulkTransfer({
                      po_number: bulkPo,
                      source_tank: bulkRecipe.tankCode,
                      destination_tank: productionOrders.find((po) => po.po_number === bulkPo)?.mix_tank ?? "V-201",
                      quantity_kg: bulkRecipe.quantityKg,
                      operator: "Process Operator",
                    }),
                  `${bulkMaterial} charge created for Mixing verification`,
                )
              }
            >
              Create Bulk Excipient Charge
            </button>
          </div>
          <div className="queue-list">
            {bulkTransfers.map((transfer) => (
              <article key={transfer.transfer_id} className="queue-card">
                <div><strong>{transfer.transfer_id}</strong><span>{transfer.status}</span></div>
                <p>{transfer.po_number} · {transfer.quantity_kg.toFixed(0)} kg {transfer.source_tank} → {transfer.destination_tank}</p>
                <small>{transfer.status === "Complete" ? "Transferred — awaiting operator confirmation in Batch HMI" : `${bulkMaterial} recipe charge`}</small>
                <div className="progress-track"><span style={{ width: `${transfer.progress}%` }} /></div>
                <div className="button-row">
                  {transfer.status === "Awaiting Verification" && (
                    <button className="button secondary" onClick={() => void runBulkAction(() => api.verifyBulkTransfer(transfer.transfer_id), "PG tank identity, QA release, and transfer hose verified")}>Verify Tank / QA / Hose</button>
                  )}
                  {transfer.status === "Ready" && (
                    <button className="button primary" onClick={() => void runBulkAction(() => api.bulkTransferAction(transfer.transfer_id, "start"), "Automatic PG transfer started")}>Start Automatic PG Transfer</button>
                  )}
                </div>
              </article>
            ))}
            {!bulkTransfers.length && <p className="empty-state">The PO-selected QA-released bulk excipient can be assigned to production here.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Mix Room Work Centers" eyebrow="White Zone Scheduling & Ownership">
          <div className="mix-room-grid">
            {mixRooms.map((room) => (
              <button
                key={room.id}
                className={`mix-room-card ${selectedMixRoom === room.room_code ? "selected" : ""}`}
                onClick={() => setSelectedMixRoom(room.room_code)}
              >
                <div><strong>{room.room_code}</strong><span>{room.status}</span></div>
                <p>{room.name} · {room.tank_code}</p>
                <small>{room.capacity_l} L · {room.plc_code}</small>
                <small>CIP: {room.cip_status}</small>{room.cip_status.includes("Dirty") && <button className="button secondary" onClick={() => void startCip("mix_tank", room.tank_code)}>Start CIP</button>}
                <small>{room.active_po ? `Active ${room.active_po}` : "No active PO"}</small>
              </button>
            ))}
          </div>
          <div className="button-row">
            <label className="inline-field">Operator<input value={mixOperator} onChange={(event) => setMixOperator(event.target.value)} /></label>
            <button
              className="button primary"
              onClick={() =>
                void runAction(
                  openMixBatch,
                  mixRooms.find((room) => room.room_code === selectedMixRoom)?.active_po &&
                    activeMixBatchForRoom(
                      selectedMixRoom,
                      mixRooms.find((room) => room.room_code === selectedMixRoom)?.active_po,
                    )
                    ? `Current ${selectedMixRoom} batch resumed`
                    : "Mix batch opened from the completed weighing queue",
                )
              }
            >
              {mixRooms.find((room) => room.room_code === selectedMixRoom)?.active_po &&
              activeMixBatchForRoom(
                selectedMixRoom,
                mixRooms.find((room) => room.room_code === selectedMixRoom)?.active_po,
              )
                ? `Resume Current ${selectedMixRoom} Batch`
                : selectedMixPo ? `Open ${selectedMixPo} in Mixing` : "Select PO to Open"}
            </button>
          </div>
          {(batch || selectedMixPo) && (() => {
            const po = productionOrders.find((item) => item.po_number === (batch?.po_number ?? selectedMixPo));
            if (!po) return null;
            return (
              <div className="route-request-panel">
                <p>Scheduled mix tank: <strong>{po.mix_tank}</strong>. Approval changes the route only; the requested room remains available until the operator opens the batch.</p>
                <label>Requested tank
                  <select value={requestedMixTank} onChange={(event) => setRequestedMixTank(event.target.value)}>
                    {mixRooms.map((room) => <option key={room.id} value={room.tank_code}>{room.tank_code} · {room.status} · {room.cip_status}</option>)}
                  </select>
                </label>
                <label>Reason<input value={resourceChangeReason} onChange={(event) => setResourceChangeReason(event.target.value)} /></label>
                <button className="button secondary" onClick={() => void runAction(() => api.requestRouteChange({ po_number: po.po_number, resource_type: "mix_tank", current_resource: po.mix_tank, requested_resource: requestedMixTank, reason: resourceChangeReason, requester: "Mixing" }), "Mix-tank change request sent to Office")}>Request Mix Tank Change</button>
              </div>
            );
          })()}
        </SectionCard>

        <div className="zone-columns mixing-layout">
          <SectionCard title="Mixing Work Queue" eyebrow="Completed Weigh Tickets & Active Batches">
            <div className="mix-queue-list">
              {mixQueue.map((po) => (
                <button
                  type="button"
                  className={`mix-queue-card ${selectedMixPo === po.po_number ? "selected" : ""}`}
                  key={po.id}
                  onClick={() => {
                    setSelectedMixPo(po.po_number);
                    const scheduledRoom = mixRooms.find((room) => room.tank_code === po.mix_tank);
                    if (scheduledRoom) setSelectedMixRoom(scheduledRoom.room_code);
                    setMixRoomEntered(false);
                  }}
                >
                  <div><strong>{po.po_number}</strong><span>{selectedMixPo === po.po_number ? "Selected" : "Ready"}</span></div>
                  <p>{po.product_name}</p>
                  <small>{po.batch_number} · {po.mix_tank} → {po.hold_tank}</small>
                  <small>Water → Glycerin + PPG → Sucrose · {po.requires_premix ? "Parallel dye premix required" : "No dye premix"}</small>
                </button>
              ))}
              {mixBatches.map((item) => (
                <button key={item.id} className={`ticket-card ${selectedMixBatch === item.batch_id ? "selected" : ""}`} onClick={() => void loadMixWorkspace(item.batch_id)}>
                  <strong>{item.batch_id}</strong>
                  <span>{item.po_number} · {item.tank_code}</span>
                  <small>{item.status} · {item.phase}</small>
                </button>
              ))}
              {!mixQueue.length && !mixBatches.length && <p className="empty-state">Complete a weigh ticket to populate the mixing queue.</p>}
            </div>
          </SectionCard>

          <SectionCard title="Batch HMI" eyebrow="Automatic Recipe Sequence & PLC Interlocks">
            {batch ? (
              <div className="mix-hmi">
                <div className="hmi-header">
                  <div><span>Batch</span><strong>{batch.batch_id}</strong></div>
                  <div><span>Status</span><strong>{batch.status}</strong></div>
                  <div><span>Phase</span><strong>{batch.phase}</strong></div>
                </div>

                <div className="process-progress">
                  <progress max="100" value={batch.progress} />
                  <span>{batch.progress}%</span>
                </div>

                <div className="tank-telemetry">
                  <article><span>Tank Level</span><strong>{batch.level_percent.toFixed(1)}%</strong></article>
                  <article><span>Mass</span><strong>{batch.mass_kg.toFixed(1)} kg</strong></article>
                  <article><span>Temperature</span><strong>{batch.temperature_c.toFixed(1)} °C</strong></article>
                  <article><span>Agitator</span><strong>{batch.rpm} / {batch.agitator_command_rpm} RPM</strong></article>
                  <article><span>Motor Load</span><strong>{batch.motor_load_percent.toFixed(1)}%</strong></article>
                  <article><span>Vacuum</span><strong>{batch.vessel_closed ? `${batch.vacuum_bar.toFixed(2)} bar` : "VENTED"}</strong></article>
                </div>

                {batch.fault_code && (
                  <div className="fault-banner">
                    <div><strong>{batch.fault_code}</strong><span>PLC FAULT</span></div>
                    <p>{batch.fault_message}</p>
                    <small>{batch.fault_diagnosed ? "Fault diagnosed — reset permitted" : "Diagnose the failed interlock before reset"}</small>
                    <div className="button-row">
                      <button
                        className="button secondary"
                        disabled={busy || batch.fault_diagnosed}
                        onClick={() => void runMixAction(() => api.diagnoseMixFault(batch.batch_id), "Fault diagnosed")}
                      >
                        {batch.fault_diagnosed ? "Diagnosed" : "Diagnose"}
                      </button>
                      <button
                        className="button primary"
                        disabled={busy || !batch.fault_diagnosed}
                        onClick={() => void runMixAction(() => api.resetMixFault(batch.batch_id), "PLC reset; sequence resumed")}
                      >
                        Reset PLC
                      </button>
                    </div>
                  </div>
                )}

                <div className="current-step-panel">
                  <span>CURRENT EXECUTION STEP</span>
                  <strong>{batch.readiness_verified ? batch.phase : "Pre-Batch Bulk Readiness"}</strong>
                  <small>
                    {batch.fault_code
                      ? "PROCESS PAUSED BY PLC INTERLOCK. Diagnose and reset the active fault before any batch operation can continue."
                      : "Only the active operation is executable. Completion, operator confirmation, and process values are written to MES before the next operation is released."}
                  </small>
                </div>

                {!batch.readiness_verified && mixWorkspace && (
                  <div className="premix-panel">
                    <div><strong>Pre-Batch Bulk Material Verification</strong><span>{mixWorkspace.readiness_passed ? "READY" : "BLOCKED"}</span></div>
                    {mixWorkspace.bulk_readiness.map((item) => (
                      <p key={item.material}>
                        <strong>{item.material}</strong>
                        {" · "}{item.tank_code}
                        {" · Required "}{item.required_quantity} kg
                        {item.source_type === "Automatic USP Utility"
                          ? " · Automatic USP Utility Feed"
                          : ` · Available ${(item.available_quantity ?? 0).toFixed(2)} kg`}
                        {" · QA "}{item.qa_status}
                        {" · "}{item.source_type === "Automatic USP Utility" ? "Utility" : "Tank"}{" "}{item.equipment_status}
                        {" · "}{item.ready ? "READY" : item.reason}
                      </p>
                    ))}
                    {!mixWorkspace.readiness_passed && <><small>Resolve shortages through Office/Receiving, QA holds through Quality, and dirty/unavailable tank status through Operations/CIP. Mixing cannot override readiness.</small><button className="button secondary" onClick={() => void loadMixWorkspace(batch.batch_id)}>Refresh Live Bulk Readiness</button></>}
                  </div>
                )}

                {!batch.fault_code && activeManualSequenceMaterials.length > 0 && (
                  <div className="premix-panel">
                    <div>
                      <strong>Manual Add Material Scanner</strong>
                      <span>
                        {currentManualMaterial
                          ? currentManualVerified
                            ? "CURRENT MATERIAL VERIFIED"
                            : `SCAN REQUIRED · ${currentManualMaterial.material_name}`
                          : "SELECT REQUIRED MATERIAL"}
                      </span>
                    </div>
                    <p>
                      Select a material pill to place that material into the scanner,
                      then press Scan / Verify Barcode like squeezing the scanner trigger.
                      The backend rejects the wrong material for the active add step.
                    </p>

                    <div className="planned-checklist">
                      {activeManualSequenceMaterials.map((item) => {
                        const isCurrent=item.material_name === currentManualMaterialName;
                        const isDone=item.weighing_status.includes("ADDED TO MIX TANK");
                        return (
                          <span
                            key={`${item.material_code}-${item.material_lot ?? "pending"}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`Load ${item.material_name} into scanner`}
                            onClick={() => setMixMaterialBarcode(item.material_code)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setMixMaterialBarcode(item.material_code);
                              }
                            }}
                            style={{
                              cursor: "pointer",
                              fontWeight: isCurrent ? 700 : 500,
                              opacity: isDone ? 0.65 : 1,
                            }}
                          >
                            {isCurrent ? "REQUIRED · " : ""}
                            {item.material_name}
                            {" · "}{item.material_code}
                            {" · "}{item.material_lot ?? "lot pending"}
                          </span>
                        );
                      })}
                    </div>

                    {currentManualMaterial && (
                      <div className="form-grid compact">
                        <label>
                          Scanner Input
                          <input
                            value={mixMaterialBarcode}
                            placeholder={`${currentManualMaterial.material_code} or ${currentManualMaterial.material_lot ?? "lot"}`}
                            onChange={(event) => setMixMaterialBarcode(event.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={!mixMaterialBarcode.trim() || currentManualVerified}
                          onClick={() =>
                            void scanMixMaterialBarcode().catch((scanError) =>
                              setError(errorMessage(scanError)),
                            )
                          }
                        >
                          Scan / Verify Barcode
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="hmi-controls mix-controls">
                  {batch.status === "Ready" && !batch.readiness_verified && <button className="button primary" disabled={!mixWorkspace?.readiness_passed} onClick={() => void runMixAction(() => api.verifyMixReadiness(batch.batch_id, mixOperator), "Bulk material and equipment readiness verified; MES record created")}>Verify Batch Readiness · Sign</button>}
                  {batch.status === "Ready" && batch.readiness_verified && <button className="button primary" onClick={() => void runMixAction(() => api.mixAction(batch.batch_id, "start", mixOperator), "Batch started; slow agitation enabled and water charge released")}>Start Batch · Operator Sign</button>}
                  {!batch.fault_code && (
                    <>
                  {batch.phase === "Confirm Water Charge" && <><p className="interlock-note">Verify actual vessel weight matches the completed water charge before signing.</p><button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-water", mixOperator), "Water charge confirmed; automatic check weight started")}>Confirm Water Charge</button></>}
                  {batch.phase === "Open Tank - Manual Group 1" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "open-tank-1", mixOperator), "Tank opened; agitator reduced to safe-add speed")}>Open Tank · Verify Safe Add</button>}
                  {batch.phase === "Manual Add - Alcohol" && <><p className="interlock-note">Scan Alcohol, confirm identity/lot, add to the vessel, then confirm only this material.</p><button className="button primary" disabled={!currentManualVerified} onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-manual-alcohol", mixOperator), "Alcohol addition confirmed")}>Confirm Alcohol Add</button></>}
                  {batch.phase === "Manual Add - Anhydrous Citric Acid" && <><p className="interlock-note">Scan Anhydrous Citric Acid, add to the vessel, then confirm only this material.</p><button className="button primary" disabled={!currentManualVerified} onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-manual-citric", mixOperator), "Citric Acid addition confirmed")}>Confirm Citric Acid Add</button></>}
                  {batch.phase === "Manual Add - Benzoic Acid" && <><p className="interlock-note">Scan Benzoic Acid, add to the vessel, then confirm only this material.</p><button className="button primary" disabled={!currentManualVerified} onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-manual-benzoic", mixOperator), "Benzoic Acid addition confirmed")}>Confirm Benzoic Acid Add</button></>}
                  {batch.phase === "Close Tank - Glycerin" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "close-tank-1", mixOperator), "Closure/vacuum verified; Glycerin automatic add started")}>Close Tank · Establish Vacuum</button>}
                  {batch.phase === "Confirm Glycerin Add" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-glycerin", mixOperator), "Glycerin actual quantity confirmed")}>Confirm Glycerin Add</button>}
                  {batch.phase === "Confirm Propylene Glycol Add" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-propylene-glycol", mixOperator), "Propylene Glycol actual quantity confirmed")}>Confirm Propylene Glycol Add</button>}
                  {batch.phase === "Open Tank - Manual Group 2" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "open-tank-2", mixOperator), "Tank opened; safe-add agitation established")}>Open Tank · Verify Safe Add</button>}
                  {batch.phase === "Manual Add - Edetate Disodium" && <><p className="interlock-note">Scan Edetate Disodium, add to the vessel, then confirm only this material.</p><button className="button primary" disabled={!currentManualVerified} onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-manual-edetate", mixOperator), "Edetate Disodium addition confirmed")}>Confirm Edetate Disodium Add</button></>}
                  {batch.phase === "Manual Add - Saccharin Sodium" && <><p className="interlock-note">Scan Saccharin Sodium, add to the vessel, then confirm only this material.</p><button className="button primary" disabled={!currentManualVerified} onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-manual-saccharin", mixOperator), "Saccharin Sodium addition confirmed")}>Confirm Saccharin Sodium Add</button></>}
                  {batch.phase === "Close Tank - Sucrose" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "close-tank-2", mixOperator), "Closure/vacuum verified; Sucrose addition started")}>Close Tank · Establish Vacuum</button>}
                  {batch.phase === "Confirm Sucrose Bulk Add" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-sucrose", mixOperator), "Sucrose addition confirmed; automatic check weight started")}>Confirm Sucrose Add</button>}
                  {batch.phase === "Open Tank - API / Flavor" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "open-tank-3", mixOperator), "Tank opened for API and approved flavor")}>Open Tank · Verify Safe Add</button>}
                  {batch.phase === "Controlled API Addition" && <><p className="interlock-note">Scan Prednisolone identity/lot before confirming the API addition.</p><button className="button primary" disabled={!currentManualVerified} onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-api", mixOperator), "Prednisolone API addition confirmed")}>Confirm Prednisolone Add</button></>}
                  {batch.phase === "Flavor Addition" && <><p className="interlock-note">Scan the flavor locked to this PO before confirming its addition.</p><button className="button primary" disabled={!currentManualVerified} onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-flavor", mixOperator), "Approved flavor addition confirmed")}>Confirm Approved Flavor Add</button></>}
                  {batch.phase === "Dye Premix Transfer" && <><p className="interlock-note">This approved material requires dye. Qualified PMX-01 must be COMPLETE before transfer.</p><button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-dye-premix", mixOperator), "Approved dye premix transfer reported to MES")}>Confirm Premix Add</button></>}
                    </>
                  )}

                  {batch.phase.startsWith("Weight Check -") && (
                    <div className="premix-panel">
                      <div>
                        <strong>Automatic Check Weight</strong>
                        <span>RUNNING</span>
                      </div>
                      <p>
                        Addition confirmed. Vessel mass is {batch.mass_kg.toFixed(3)} kg.
                        The load-cell check is executing automatically.
                      </p>
                      <progress value={batch.progress} max={100} />
                      <small>
                        CHECK WEIGHT · {Math.round(batch.progress)}% · MES remains interlocked until the tolerance check passes.
                      </small>
                    </div>
                  )}

                  {batch.phase.startsWith("Weight Exception -") && (
                    <>
                      <p className="interlock-note">
                        MES ERROR · Check weight is outside the allowed tolerance.
                        Sequence is interlocked until Automation Override and QA Approval are both recorded.
                      </p>
                      <button
                        className="button warning"
                        onClick={() =>
                          void runMixAction(
                            () => api.mixPhaseAction(batch.batch_id, "automation-weight-override", "Automation Engineer"),
                            "Automation override recorded",
                          )
                        }
                      >
                        Automation Override
                      </button>
                      <button
                        className="button warning"
                        onClick={() =>
                          void runMixAction(
                            () => api.mixPhaseAction(batch.batch_id, "qa-weight-approve", "QA Reviewer"),
                            "QA exception approval recorded",
                          )
                        }
                      >
                        QA Approve Weight Exception
                      </button>
                    </>
                  )}

                  {batch.phase.startsWith("MES Report -") && (
                    <div className="premix-panel">
                      <div>
                        <strong>MES Transaction</strong>
                        <span>REPORTING</span>
                      </div>
                      <p>
                        Check weight passed. Material, lot, vessel mass, equipment,
                        and execution details are being transmitted automatically to MES.
                      </p>
                      <progress value={batch.progress} max={100} />
                      <small>
                        REPORTING TO MES · {Math.round(batch.progress)}% · Operator signature releases after MES acceptance.
                      </small>
                    </div>
                  )}

                  {batch.phase.startsWith("Operator Sign -") && (
                    <>
                      <p className="interlock-note">
                        CHECK WEIGHT PASSED · MES ACCEPTED. Electronic operator signature is required before the next material or phase is released.
                      </p>
                      <button
                        className="button primary"
                        onClick={() =>
                          void runMixAction(
                            () => api.mixPhaseAction(batch.batch_id, "operator-sign-addition", mixOperator),
                            "Operator electronic signature recorded; next phase released",
                          )
                        }
                      >
                        Operator Sign
                      </button>
                    </>
                  )}

                  {batch.phase === "Close Tank - Final Agitation" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "close-tank-3", mixOperator), "Closure/vacuum verified; final agitation started")}>Close Tank · Establish Vacuum</button>}
                  {batch.phase === "Confirm Final Agitation" && <button className="button primary" onClick={() => void runMixAction(() => api.mixPhaseAction(batch.batch_id, "confirm-final-agitation", mixOperator), "Final qualified agitation confirmed")}>Verify Qualified Mix · Sign</button>}
                  {premix?.status === "Awaiting Premix Water" && <button className="button primary" onClick={() => void runMixAction(() => api.confirmPremixWater(batch.batch_id, "premix", mixOperator), "10 kg premix-pot water verified; main tank unchanged")}>Confirm 10 kg Premix Water</button>}
                  {premix?.status === "Awaiting Rinse Water" && <button className="button primary" onClick={() => void runMixAction(() => api.confirmPremixWater(batch.batch_id, "rinse", mixOperator), "10 kg rinse-pot water verified; main tank unchanged")}>Confirm 10 kg Rinse Water</button>}
                  {premix?.status === "Ready for Agitation" && <button className="button primary" onClick={() => void runMixAction(() => api.startPremix(batch.batch_id, mixOperator), "Premix agitation started after both water pots verified")}>Start Premix Agitation</button>}
                  {premix?.status?.startsWith("Faulted") && <button className="button warning" onClick={() => void runMixAction(() => api.startPremix(batch.batch_id, mixOperator), "Premix fault acknowledged; qualified timer resumed")}>Acknowledge Premix Fault · Restore 850 RPM</button>}
                  {premix?.status === "Awaiting Confirmation" && <button className="button secondary" onClick={() => void runMixAction(() => api.confirmPremix(batch.batch_id, mixOperator), "Premix qualified time confirmed")}>Confirm Premix Completed</button>}
                  {batch.status === "Ready for Transfer" && <button className="button primary" onClick={() => void runMixAction(() => api.mixAction(batch.batch_id, "start-transfer", mixOperator), "Automatic transfer started")}>Start Automatic Transfer</button>}
                  {batch.status === "Sample Hold" && <button className="button primary" onClick={() => void runMixAction(() => api.mixAction(batch.batch_id, "collect-sample", mixOperator), "LIMS transfer sample collected")}>Collect Transfer Sample</button>}
                  {batch.status === "Awaiting Termination" && <button className="button primary" onClick={() => void runMixAction(() => api.terminateMixBatch(batch.batch_id, mixOperator), "Batch terminated; hold tank placed on QA Hold")}>Terminate Batch</button>}
                </div>

                {(mixWorkspace?.materials?.length ?? 0) > 0 && (
                  <div className="premix-panel">
                    <div>
                      <strong>Current PO Material Execution · {batch.po_number}</strong>
                      <span>{mixWorkspace?.materials?.length ?? 0} materials</span>
                    </div>
                    {(mixWorkspace?.materials ?? []).map((item) => (
                      <p key={`${item.material_code}-${item.material_lot ?? "pending"}`}>
                        <strong>{item.material_name}</strong>
                        {" · "}{item.material_lot ?? "lot pending"}
                        {" · "}{item.actual_quantity ?? item.required_quantity} {item.unit_of_measure}
                        {" · "}{item.weighing_status}
                      </p>
                    ))}
                  </div>
                )}
                {premix && (
                  <div className="premix-panel">
                    <div><strong>Dye Premix · PMX-01</strong><span>{premix.status}</span></div>
                    <progress max="100" value={premix.progress} />
                    <p>{premix.progress}% qualified mix time · {premix.level_percent.toFixed(1)}% vessel level · {premix.rpm} RPM</p>
                    <small>Target 850 RPM · qualified range 825–875 RPM. Fault time does not count toward required mixing time.</small>
                  </div>
                )}
              </div>
            ) : <p className="empty-state">Open or select a mix batch to display the live HMI.</p>}
          </SectionCard>
        </div>

        <SectionCard title="Hold Tank Assignment" eyebrow="Scheduled Route, Availability & Office Approval">
          <div className="hold-tank-grid">
            {holdTanks.map((tank) => (
              <article key={tank.id} className={`hold-tank-card ${batch?.selected_hold_tank === tank.tank_code ? "selected" : ""}`}>
                <div><strong>{tank.tank_code}</strong><span>{tank.status}</span></div>
                <p>{tank.level_percent.toFixed(1)}% level · QA {tank.qa_status}</p>
                <small>{tank.capacity_l} L · CIP {tank.cip_status}</small>{tank.cip_status.includes("Dirty") && <button className="button secondary" onClick={() => void startCip("hold_tank", tank.tank_code)}>Start CIP</button>}
                {tank.batch_number && <small>Batch {tank.batch_number} · {tank.product_name}</small>}
                {tank.source_mix_tank && <small>Source {tank.source_mix_tank} · {tank.transferred_quantity.toFixed(1)} kg</small>}
                {tank.lims_sample_id && <small>LIMS {tank.lims_sample_id}</small>}
                <button className="button secondary" disabled={!batch || batch.status !== "Ready for Hold Selection"} onClick={() => batch && void runMixAction(() => api.selectHoldTank(batch.batch_id, tank.tank_code), `${tank.tank_code} selected for transfer`)}>Select Hold Tank</button>
              </article>
            ))}
          </div>
          {batch && batch.status === "Ready for Hold Selection" && (
            <div className="route-request-panel">
              <p>Scheduled hold tank: <strong>{scheduledHold ?? "Not assigned"}</strong>. Request Office approval before using a different tank.</p>
              <label>Requested tank<select value={requestedHoldTank} onChange={(event) => setRequestedHoldTank(event.target.value)}>{holdTanks.map((tank) => <option key={tank.id}>{tank.tank_code}</option>)}</select></label>
              <label>Reason<input value={resourceChangeReason} onChange={(event) => setResourceChangeReason(event.target.value)} /></label>
              <button className="button secondary" onClick={() => void runAction(() => api.requestRouteChange({ po_number: batch.po_number, resource_type: "hold_tank", current_resource: scheduledHold ?? "Unassigned", requested_resource: requestedHoldTank, reason: resourceChangeReason, requester: "Mixing" }), "Route-change request sent to Office")}>Request Different Hold Tank</button>
            </div>
          )}
        </SectionCard>

        {routeChanges.length > 0 && (
          <SectionCard title="Route Change Status" eyebrow="Office Decisions">
            <div className="approval-list">
              {routeChanges.slice(0, 6).map((request) => <article key={request.id} className="approval-card"><div><strong>{request.request_id}</strong><span>{request.status}</span></div><p>{request.po_number}: {request.current_resource} → {request.requested_resource}</p><small>{request.reason}</small></article>)}
            </div>
          </SectionCard>
        )}
      </div>
    );
  }


  useEffect(() => {
    const runningCips = cipRuns.filter(
      (cip) => cip.status === "Running" && cip.progress < 100,
    );

    if (runningCips.length === 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      for (const cip of runningCips) {
        if (cipTicksInFlight.current.has(cip.cip_id)) {
          continue;
        }

        cipTicksInFlight.current.add(cip.cip_id);

        void api
          .cipAction(cip.cip_id, "tick", "")
          .then((updatedRun) => {
            setCipRuns((currentRuns) =>
              currentRuns.map((currentRun) =>
                currentRun.cip_id === updatedRun.cip_id
                  ? updatedRun
                  : currentRun,
              ),
            );

            if (updatedRun.status === "Faulted") {
              setNotice(
                `${updatedRun.asset_code} CIP paused: ${updatedRun.fault_message ?? "PLC fault detected"}`,
              );
            }
          })
          .catch((cipError: unknown) => {
            setError(errorMessage(cipError));
          })
          .finally(() => {
            cipTicksInFlight.current.delete(cip.cip_id);
          });
      }
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [cipRuns]);

  async function startCip(assetType: string, assetCode: string) {
    await runAction(() => api.startCip(assetType, assetCode, "Maintenance Technician"), `CIP started for ${assetCode}`);
    await refresh();
  }

  async function runCipAction(cipId: string, action: string) {
    await runAction(() => api.cipAction(cipId, action, action === "verify" ? cipSignature : ""), `CIP ${action} completed`);
    await refresh();
  }

  async function scheduleShipment() {
    if (!shipmentPo) throw new Error("Select a staged finished-goods lot");
    await runAction(() => api.scheduleShipment({ po_number: shipmentPo, carrier, dock, pickup_date: pickupDate, pickup_time: pickupTime }), "Carrier pickup scheduled");
    await refresh();
  }

  async function runShipmentAction(shipmentId: string, action: string) {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await api.shipmentAction(
        shipmentId,
        action,
        {
          operator: "Warehouse Operator",
          seal_number: sealNumber,
          signature: "Warehouse Supervisor",
        },
      );

      // The shipment action response is the authoritative post-commit state.
      // Update the queue immediately instead of waiting for a full-platform
      // refresh. The old implementation refreshed twice and could leave the
      // Shipping card on the pre-action "Verified" snapshot even though the
      // backend had already returned "Loaded".
      setShipments((current) =>
        current.map((item) =>
          item.shipment_id === shipmentId ? (updated as T.Shipment) : item,
        ),
      );

      const actionMessage =
        action === "load"
          ? "Shipment load completed"
          : action === "verify"
            ? "Shipment verification completed"
            : action === "seal"
              ? "Trailer sealed"
              : action === "ship"
                ? "Shipment completed"
                : `Shipment ${action} completed`;

      setNotice(actionMessage);

      // Refresh the rest of the platform after the local authoritative update.
      // If a global refresh is already in flight, the card still remains correct
      // because its state was updated directly from the action response.
      await refresh();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusy(false);
    }
  }

  function renderBulkZone() {
    return (
      <div className="zone-stack">
        <div className="zone-heading">
          <div>
            <span className="eyebrow">Released inventory and operational visibility</span>
            <h1>Bulk Tank Farm</h1>
            <p>This zone displays tank inventory and provides controlled per-tank demo reset. Office schedules deliveries, Warehouse receives and unloads tankers, QA releases lots, and Mixing executes production transfers.</p>
          </div>
          <StatusBadge label={`${bulkTanks.filter((tank) => tank.qa_status === "Released").length} released tanks`} state="online"/>
        </div>
        <div className="kpi-grid compact-kpis">
          {bulkTanks.map((tank) => <article key={tank.tank_code}><span>{tank.tank_code}</span><strong>{tank.quantity_kg.toFixed(0)} kg</strong><small>{tank.material_name} · {tank.qa_status}</small></article>)}
        </div>
        <SectionCard title="Tank Farm Inventory" eyebrow="Material Status & Demo Recovery">
          <div className="hold-tank-grid">
            {bulkTanks.map((tank) => (
              <article key={tank.tank_code} className="hold-tank-card">
                <div><strong>{tank.tank_code}</strong><span>{tank.qa_status}</span></div>
                <p>{tank.material_name}</p>
                <small>{tank.quantity_kg.toFixed(0)} kg available</small>
                <small>Lot {tank.lot_number ?? "Not assigned"} · {tank.temperature_c.toFixed(1)}°C</small>
                <button
                  className="button secondary"
                  disabled={busy || tank.quantity_kg <= 0}
                  onClick={() =>
                    void runBulkAction(
                      () => api.resetBulkTank(tank.tank_code, { operator: "Bulk Operations", reason: "Reset individual tank for demo retest" }),
                      `${tank.tank_code} reset for retesting`,
                    )
                  }
                >
                  Reset Tank for Retest
                </button>
              </article>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Departmental Workflow Status" eyebrow="Planning → Receiving → QA → Production">
          <div className="digital-thread-flow">
            <button onClick={() => setActiveZone("office")}>Office Scheduling</button>
            <span>→</span>
            <button onClick={() => setActiveZone("warehouse")}>Warehouse Receiving</button>
            <span>→</span>
            <button onClick={() => setActiveZone("quality")}>QA Release</button>
            <span>→</span>
            <button onClick={() => setActiveZone("mixing")}>Mixing Transfer</button>
          </div>
        </SectionCard>
      </div>
    );
  }

  function renderPackagingZone() {
    const run = packagingWorkspace?.run;
    const routePo = productionOrders.find((po) => po.po_number === (run?.po_number ?? selectedPackagingPo));
    const grossBottleCount = run?.bottles_completed ?? 0;
    const rejectedBottleCount = run?.rejects ?? 0;
    const finalGoodBottleCount = Math.max(0, grossBottleCount - rejectedBottleCount);
    const plannedBottleCount = routePo?.quantity ?? 0;
    const finishedGoodsShortfall = Math.max(0, plannedBottleCount - finalGoodBottleCount);
    const fgReconciliation = routePo
      ? routeChanges.find((request) => request.po_number === routePo.po_number && request.resource_type === "finished_goods_quantity" && request.requested_resource === String(finalGoodBottleCount))
      : undefined;
    return (
      <div className="zone-stack">
        <div className="zone-summary-grid">
          <article><span>Lines Available</span><strong>{packagingLines.filter((line) => line.status === "Available").length}</strong></article>
          <article><span>Ready Queue</span><strong>{packagingQueue.length}</strong></article>
          <article><span>Active Runs</span><strong>{packagingRuns.filter((item) => ["Running", "Faulted", "Awaiting FG Sample", "FG QA Hold"].includes(item.status)).length}</strong></article>
          <article><span>FG QA Tasks</span><strong>{qaFgTasks.filter((task) => task.status === "Pending Review").length}</strong></article>
        </div>
        <div className="packaging-component-strip"><strong>Line-side packaging components:</strong>{packagingComponents.length ? packagingComponents.map((item) => <span key={item.material_code}>{item.material_name} · {item.available_quantity.toLocaleString()} {item.unit_of_measure}</span>) : <span>Awaiting packaging component master data in ees_data_platform</span>}<small>Packaging components are read from Supply and are excluded from formulation weigh-room tickets.</small></div>
        <SectionCard title="Packaging Line Work Centers" eyebrow="Grey Zone Campaign Scheduling">
          <div className="hold-tank-grid">
            {packagingLines.map((line) => (
              <article key={line.id} className={`hold-tank-card ${selectedPackagingLine === line.line_code ? "selected" : ""}`}>
                <div><strong>{line.line_code}</strong><span>{line.status}</span></div>
                <p>{line.name} · {line.rated_speed_bpm} bottles/min rated</p>
                <small>{line.plc_code} · CIP {line.cip_status}</small>{line.cip_status.includes("Dirty") && <button className="button secondary" onClick={() => void startCip("packaging_line", line.line_code)}>Start CIP / Line Clearance</button>}
                <button className="button secondary" onClick={() => setSelectedPackagingLine(line.line_code)}>Select Line</button>
              </article>
            ))}
          </div>
          <div className="form-grid compact">
            <label>Operator<input value={packagingOperator} onChange={(event) => setPackagingOperator(event.target.value)} /></label>
            <button
              className="button primary"
              onClick={() =>
                void runAction(
                  openPackagingRun,
                  packagingLines.find(
                    (line) => line.line_code === selectedPackagingLine,
                  )?.active_po &&
                    activePackagingRunForLine(
                      selectedPackagingLine,
                      packagingLines.find(
                        (line) => line.line_code === selectedPackagingLine,
                      )?.active_po,
                    )
                    ? `Current ${selectedPackagingLine} PO resumed`
                    : "Packaging run opened",
                )
              }
            >
              {packagingLines.find(
                (line) => line.line_code === selectedPackagingLine,
              )?.active_po &&
              activePackagingRunForLine(
                selectedPackagingLine,
                packagingLines.find(
                  (line) => line.line_code === selectedPackagingLine,
                )?.active_po,
              )
                ? `Resume Current ${selectedPackagingLine} PO`
                : selectedPackagingPo ? `Open ${selectedPackagingPo} on ${selectedPackagingLine}` : "Select PO to Open"}
            </button>
          </div>
        </SectionCard>
        <div className="zone-two-column">
          <SectionCard title="Packaging Queue" eyebrow="QA-Released Bulk">
            <div className="queue-list">
              {packagingQueue.map((po) => <button type="button" key={po.id} className={`queue-item ${selectedPackagingPo === po.po_number ? "selected" : ""}`} onClick={() => { setSelectedPackagingPo(po.po_number); setSelectedPackagingLine(po.packaging_line); setSelectedPackagingRun(""); setPackagingWorkspace(null); }}><div><strong>{po.po_number}</strong><span>{selectedPackagingPo === po.po_number ? "Selected" : po.packaging_line}</span></div><p>{po.product_name}</p><small>{po.batch_number} · {po.quantity} bottles · scheduled {po.packaging_line}</small></button>)}
              {!packagingQueue.length && <p className="empty-state">Release bulk from QA to populate the packaging queue.</p>}
            </div>
            {routePo && (
              <div className="route-request-panel">
                <p>Scheduled line: <strong>{routePo.packaging_line}</strong></p>
                <label>Requested line<select value={requestedPackagingLine} onChange={(event) => setRequestedPackagingLine(event.target.value)}>{packagingLines.map((line) => <option key={line.id}>{line.line_code}</option>)}</select></label>
                <label>Reason<input value={resourceChangeReason} onChange={(event) => setResourceChangeReason(event.target.value)} /></label>
                <button className="button secondary" onClick={() => void runAction(() => api.requestRouteChange({ po_number: routePo.po_number, resource_type: "packaging_line", current_resource: routePo.packaging_line, requested_resource: requestedPackagingLine, reason: resourceChangeReason, requester: "Packaging" }), "Packaging-line change request sent to Office")}>Request Packaging Line Change</button>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Packaging HMI" eyebrow="Automatic Line, PLC Jams & FG Sampling">
            {run ? (
              <div className="mix-hmi">
                <div className="hmi-header"><div><span>{run.run_id}</span><strong>{run.po_number} · {run.line_code}</strong></div><StatusBadge label={run.status} state={run.status === "Faulted" ? "offline" : "online"} /></div>
                <div className="process-metrics"><article><span>Progress</span><strong>{run.progress}%</strong></article><article><span>Speed</span><strong>{run.speed_bpm} bpm</strong></article><article><span>Gross Filled</span><strong>{grossBottleCount}</strong></article><article><span>Rejects</span><strong>{rejectedBottleCount}</strong></article><article><span>Final Good Bottles</span><strong>{finalGoodBottleCount}</strong></article><article><span>Exact Shortfall</span><strong>{finishedGoodsShortfall}</strong></article><article><span>Cases</span><strong>{run.cases_staged}</strong></article></div>
                {run.progress >= 100 && routePo && (
                  <div className={`fg-reconciliation-panel ${finishedGoodsShortfall > 0 ? "short" : "balanced"}`}>
                    <div>
                      <small>FINISHED GOODS RECONCILIATION</small>
                      <strong>{finalGoodBottleCount} good / {plannedBottleCount} planned</strong>
                      <p>{finishedGoodsShortfall > 0 ? `${rejectedBottleCount} rejected bottles create an exact ${finishedGoodsShortfall}-bottle shortfall.` : "Finished-goods count matches the production order."}</p>
                    </div>
                    {finishedGoodsShortfall > 0 && !fgReconciliation && (
                      <button className="button warning" onClick={() => void runAction(() => api.requestRouteChange({
                        po_number: routePo.po_number,
                        resource_type: "finished_goods_quantity",
                        current_resource: String(plannedBottleCount),
                        requested_resource: String(finalGoodBottleCount),
                        reason: `FG reconciliation: ${finalGoodBottleCount} good bottles, ${rejectedBottleCount} rejects, exact shortfall ${finishedGoodsShortfall}`,
                        requester: "Packaging",
                      }), `Exact FG reconciliation sent to Office: ${finalGoodBottleCount} (-${finishedGoodsShortfall})`)}>
                        Request Exact Office Reconciliation · {finalGoodBottleCount} (-{finishedGoodsShortfall})
                      </button>
                    )}
                    {fgReconciliation && <span className={`material-status status-${fgReconciliation.status.toLowerCase()}`}>Office {fgReconciliation.status}</span>}
                  </div>
                )}
                <progress max="100" value={run.progress} />
                {run.jam_code && <div className="fault-banner"><div><strong>{run.jam_code}</strong><span>PACKAGING PLC FAULT</span></div><p>{run.fault_message}</p><small>{run.fault_diagnosed ? "Diagnosed — reset permitted" : "Diagnose before PLC reset"}</small></div>}
                <div className="button-row">
                  {run.status === "Ready" && <button className="button primary" onClick={() => void runPackagingAction("start", "Automatic packaging line started")}>Start Automatic Line</button>}
                  {run.status === "Faulted" && !run.fault_diagnosed && <button className="button secondary" onClick={() => void runPackagingAction("diagnose", "Packaging fault diagnosed")}>Diagnose Jam</button>}
                  {run.status === "Faulted" && run.fault_diagnosed && <button className="button primary" onClick={() => void runPackagingAction("reset", "PLC reset; line resumed")}>Reset PLC</button>}
                  {run.status === "Awaiting FG Sample" && <button className="button primary" onClick={() => void runPackagingAction("collect-sample", "FG sample collected and sent to QA")}>Collect FG Sample</button>}
                </div>
              </div>
            ) : <p className="empty-state">Open a QA-released campaign to display the packaging HMI.</p>}
          </SectionCard>
        </div>
        <SectionCard title="CIP Recovery Center" eyebrow="Drain, Wash, Rinse & Verification">
          <div className="approval-list">{cipRuns.map((cip) => <article key={cip.id} className="approval-card"><div><strong>{cip.asset_code}</strong><span>{cip.status}</span></div><p>{cip.phase} · {cip.progress}%</p><progress max="100" value={cip.progress} />{cip.fault_message && <small className="warning-text">{cip.fault_code}: {cip.fault_message}</small>}<div className="button-row">{cip.status === "Running" && (
            <span className="cip-auto-status">
              Automatic sequence running — next stage advances automatically
            </span>
          )}{cip.status === "Faulted" && !cip.fault_diagnosed && <button className="button secondary" onClick={() => void runCipAction(cip.cip_id, "diagnose")}>Diagnose</button>}{cip.status === "Faulted" && cip.fault_diagnosed && <button className="button primary" onClick={() => void runCipAction(cip.cip_id, "reset")}>Reset PLC</button>}{cip.status === "Awaiting Verification" && <><input value={cipSignature} onChange={(e) => setCipSignature(e.target.value)} placeholder="Electronic signature" /><button className="button primary" onClick={() => void runCipAction(cip.cip_id, "verify")}>Verify Clean / Available</button></>}</div></article>)}{!cipRuns.length && <p className="empty-state">Dirty equipment will appear here when CIP is started.</p>}</div>
        </SectionCard>
        {packagingRuns.length > 0 && <SectionCard title="Packaging Run History" eyebrow="Campaign Status"><div className="approval-list">{packagingRuns.map((item) => <article key={item.id} className="approval-card" onClick={() => void loadPackagingWorkspace(item.run_id)}><div><strong>{item.run_id}</strong><span>{item.status}</span></div><p>{item.po_number} · {item.line_code}</p><small>{item.progress}% · {item.bottles_completed} bottles · {item.rejects} rejects</small></article>)}</div></SectionCard>}
      </div>
    );
  }

  function renderQualityZone() {
    return (
      <div className="zone-stack">
        <div className="zone-summary-grid">
          <article><span>Pending Review</span><strong>{qaBulkTasks.filter((task) => task.status === "Pending Review").length}</strong></article>
          <article><span>Released</span><strong>{qaBulkTasks.filter((task) => task.status === "Released").length}</strong></article>
          <article><span>On Hold</span><strong>{qaBulkTasks.filter((task) => task.status === "On Hold").length}</strong></article>
          <article><span>Rejected</span><strong>{qaBulkTasks.filter((task) => task.status === "Rejected").length}</strong></article>
        </div>
        <SectionCard title="Inbound Bulk Material QA Queue" eyebrow="COA Review, Pre-Unload Sample & Unload Authorization">
          <div className="approval-list">
            {bulkDeliveries
              .filter((delivery) => ["Pending QA Review", "QA Released for Unloading", "Released", "On Hold", "Rejected"].includes(delivery.status))
              .map((delivery) => (
                <article key={delivery.delivery_id} className="approval-card">
                  <div>
                    <strong>{delivery.sample_id ?? delivery.delivery_id}</strong>
                    <span>{delivery.status}</span>
                  </div>
                  <p>{delivery.material_name} · Lot {delivery.lot_number} · {delivery.quantity_kg.toFixed(0)} kg</p>
                  <small>{delivery.vendor} · COA {delivery.coa_number} · Tank {delivery.tank_code}</small>
                  {delivery.status === "Pending QA Review" && (
                    <div className="button-row">
                      <button className="button primary" onClick={() => void runBulkAction(() => api.decideBulkDelivery(delivery.delivery_id, "Release"), "Inbound bulk lot released for Warehouse unloading")}>Release Bulk Lot</button>
                      <button className="button secondary" onClick={() => void runBulkAction(() => api.decideBulkDelivery(delivery.delivery_id, "Hold"), "Inbound bulk lot placed on QA Hold")}>Place on Hold</button>
                      <button className="button danger" onClick={() => void runBulkAction(() => api.decideBulkDelivery(delivery.delivery_id, "Reject"), "Inbound bulk lot rejected")}>Reject</button>
                    </div>
                  )}
                </article>
              ))}
            {!bulkDeliveries.some((delivery) => ["Pending QA Review", "Released", "On Hold", "Rejected"].includes(delivery.status)) && (
              <p className="empty-state">Warehouse pre-unload samples awaiting QA disposition will appear here.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Bulk QA Disposition Queue" eyebrow="LIMS Samples & Hold-Tank Release">
          <div className="approval-list">
            {qaBulkTasks.map((task) => (
              <article key={task.id} className="approval-card">
                <div><strong>{task.task_id}</strong><span>{task.status}</span></div>
                <p>{task.po_number} · {task.batch_number} · {task.product_name}</p>
                <small>{task.hold_tank} · Sample {task.sample_id}</small>
                {task.status === "Pending Review" && (
                  <div className="button-row">
                    <button className="button primary" onClick={() => void runAction(() => api.decideQABulkTask(task.task_id, "Release", "Bulk sample meets release criteria"), "Bulk released to Packaging")}>Release</button>
                    <button className="button secondary" onClick={() => void runAction(() => api.decideQABulkTask(task.task_id, "Hold", "Additional investigation required"), "Bulk remains on QA Hold")}>Place on Hold</button>
                    <button className="button danger" onClick={() => void runAction(() => api.decideQABulkTask(task.task_id, "Reject", "Bulk failed specification review"), "Bulk rejected")}>Reject</button>
                  </div>
                )}
              </article>
            ))}
            {!qaBulkTasks.length && <p className="empty-state">Terminate a transferred mix batch to create a QA bulk-disposition task.</p>}
          </div>
        </SectionCard>
        <SectionCard title="Finished Goods QA Queue" eyebrow="FG Samples, Release & Outbound Handoff">
          <div className="approval-list">
            {qaFgTasks.map((task) => <article key={task.id} className="approval-card"><div><strong>{task.task_id}</strong><span>{task.status}</span></div><p>{task.po_number} · {task.product_name}</p><small>{task.packaging_line} · Sample {task.sample_id} · {task.quantity} bottles</small>{task.status === "Pending Review" && <div className="button-row"><button className="button primary" onClick={() => void runAction(() => api.decideQaFgTask(task.task_id, "Release", "Finished goods meet release criteria"), "FG released; outbound TO created")}>Release FG</button><button className="button secondary" onClick={() => void runAction(() => api.decideQaFgTask(task.task_id, "Hold", "Additional FG testing required"), "FG remains on QA Hold")}>Hold FG</button><button className="button danger" onClick={() => void runAction(() => api.decideQaFgTask(task.task_id, "Reject", "FG failed specification review"), "FG rejected")}>Reject FG</button></div>}</article>)}
            {!qaFgTasks.length && <p className="empty-state">Collect an FG sample after packaging completes.</p>}
          </div>
        </SectionCard>
        <SectionCard title="Hold-Tank Genealogy" eyebrow="Batch, Product, Source, Sample & Disposition">
          <div className="hold-tank-grid">
            {holdTanks.map((tank) => (
              <article key={tank.id} className="hold-tank-card">
                <div><strong>{tank.tank_code}</strong><span>{tank.qa_status}</span></div>
                <p>{tank.product_name ?? "No active bulk"}</p>
                <small>{tank.batch_number ? `Batch ${tank.batch_number}` : "No batch assigned"}</small>
                <small>{tank.source_mix_tank ? `Source ${tank.source_mix_tank}` : "No transfer source"} · {tank.transferred_quantity.toFixed(1)} kg</small>
                <small>{tank.lims_sample_id ?? "No LIMS sample"}</small>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    );
  }

  async function createRndSample() {
    const allMaterials = [...(rndCatalog?.materials ?? []), ...(rndCatalog?.candidates ?? [])];
    const selectedMaterials = rndMaterialCodes
      .map((code) => allMaterials.find((item) => item.material_code === code))
      .filter(Boolean)
      .map((item, index) => ({
        material_code: item!.material_code,
        material_name: item!.material_name,
        quantity: index === 0 ? 1 : 0.25,
        unit: item!.unit_of_measure || "kg",
        role: /flavor/i.test(item!.material_type) || /cherry|grape|berry|strawberry/i.test(item!.material_name) ? "flavor" : /dye|fd&c/i.test(item!.material_name) ? "dye" : "manual",
        source: item!.qualification_status === "approved" ? "approved" : "R&D candidate",
      }));
    const selectedBulks = (rndCatalog?.bulks ?? [])
      .filter((item) => rndBulkTanks.includes(item.tank_code))
      .map((item) => ({
        tank_code: item.tank_code,
        material_code: item.material_code,
        material_name: item.material_name,
        // R&D uses a 1% scale of the locked production bulk recipe.
        quantity_kg:
          item.tank_code === "SUC-101"
            ? 21.75
            : item.tank_code === "GLY-101"
              ? 9.2
              : item.tank_code === "PG-101"
                ? 7.5
                : item.tank_code === "HFCS-101"
                  ? 180
                  : item.tank_code === "TANK-X"
                    ? 180
                    : 0,
      }));

    await runAction(async () => {
      const created = await api.createRndSampleBatch({
        formula_name: rndFormulaName,
        flavor: rndFlavor,
        dye: rndDye,
        scale_l: rndScale,
        materials: selectedMaterials,
        bulks: selectedBulks,
        process: {
          agitation_rpm: rndAgitationRpm,
          agitation_minutes: rndAgitationMinutes,
          premix_rpm: rndPremixRpm,
          premix_minutes: rndPremixMinutes,
          vacuum_required: rndVacuum,
          target_temperature_c: 22,
          addition_sequence: [...selectedBulks.map((b) => b.material_name), ...selectedMaterials.map((m) => m.material_name)],
        },
      });
      setRndSamples((current) => [created, ...current]);
    }, "R&D full test PO created");
  }

  async function updateRndSample(id: string, action: string) {
    await runAction(async () => {
      const updated = await api.rndSampleAction(id, action, rndResult);
      setRndSamples((current) => current.map((item) => item.sample_batch_id === id ? updated : item));
    }, `R&D sample ${action.replaceAll("-", " ")} recorded`);
  }

  function renderRndZone() {
    const allRndMaterials = [...(rndCatalog?.materials ?? []), ...(rndCatalog?.candidates ?? [])];
    const candidateCodes = new Set((rndCatalog?.candidates ?? []).map((item) => item.material_code));
    const toggleMaterial = (code: string) => setRndMaterialCodes((current) => current.includes(code) ? current.filter((x) => x !== code) : [...current, code]);
    const toggleBulk = (tank: string) => setRndBulkTanks((current) => current.includes(tank) ? current.filter((x) => x !== tank) : [...current, tank]);

    return (
      <div className="zone-stack">
        <div className="zone-hero">
          <div>
            <span className="eyebrow">Development MES · R&D WR → R&D MR → R&D PL</span>
            <h1>Research & Development Laboratory</h1>
            <p>Build a complete development PO from approved plant materials and candidate materials, execute a controlled laboratory workflow, then approve, require more testing, or reject the formulation.</p>
          </div>
        </div>

        <div className="zone-columns">
          <SectionCard title="R&D Full Test PO Builder" eyebrow="Formula · Materials · Bulk · Process Logic">
            <div className="form-grid">
              <label className="wide">Development Formula Name<input value={rndFormulaName} onChange={(e)=>setRndFormulaName(e.target.value)} /></label>
              <label>Target Flavor<input value={rndFlavor} onChange={(e)=>setRndFlavor(e.target.value)} /></label>
              <label>Sample Scale<input type="number" min="1" max="500" value={rndScale} onChange={(e)=>setRndScale(Number(e.target.value))} /></label>
              <label>Final Agitation RPM<input type="number" value={rndAgitationRpm} onChange={(e)=>setRndAgitationRpm(Number(e.target.value))} /></label>
              <label>Final Agitation Minutes<input type="number" value={rndAgitationMinutes} onChange={(e)=>setRndAgitationMinutes(Number(e.target.value))} /></label>
              <label>Premix RPM<input type="number" value={rndPremixRpm} onChange={(e)=>setRndPremixRpm(Number(e.target.value))} /></label>
              <label>Premix Minutes<input type="number" value={rndPremixMinutes} onChange={(e)=>setRndPremixMinutes(Number(e.target.value))} /></label>
              <label className="wide checkbox-field"><input type="checkbox" checked={rndVacuum} onChange={(e)=>setRndVacuum(e.target.checked)} /> Closed-tank vacuum required</label>
            </div>

            <div className="route-request-panel">
              <strong>Selectable R&D Materials</strong>
              <p className="subtext">Approved materials and development candidates are both visible. Candidate materials remain R&D-controlled until a successful trial is approved.</p>
              <div className="approval-grid">
                {allRndMaterials.map((item) => (
                  <label key={item.material_code} className="checkbox-field">
                    <input type="checkbox" checked={rndMaterialCodes.includes(item.material_code)} onChange={()=>toggleMaterial(item.material_code)} />
                    <span><strong>{item.material_name}</strong><small>{item.material_code} · {candidateCodes.has(item.material_code) ? "R&D EVALUATION REQUIRED" : "Approved plant material"}</small></span>
                  </label>
                ))}
              </div>
            </div>

            <div className="route-request-panel">
              <strong>Development Bulk Usage</strong>
              <p className="subtext">R&D may build recipes using normal bulk tanks, HSCF alternate/special bulk, or BULK-X overage storage.</p>
              <div className="approval-grid">
                {(rndCatalog?.bulks ?? []).map((tank) => (
                  <label key={tank.tank_code} className="checkbox-field">
                    <input type="checkbox" checked={rndBulkTanks.includes(tank.tank_code)} onChange={()=>toggleBulk(tank.tank_code)} />
                    <span><strong>{tank.tank_code} · {tank.material_name}</strong><small>{tank.quantity_kg.toFixed(1)} kg available · {tank.qa_status} · {tank.status}</small></span>
                  </label>
                ))}
              </div>
            </div>

            <button className="button primary wide" onClick={()=>void createRndSample()}>Create Full R&D Test PO</button>
          </SectionCard>

          <SectionCard title="R&D Execution Queue" eyebrow="Request → Staging → WR → MR → PL → Test">
            <label className="wide">Development Result / Technical Note<input value={rndResult} onChange={(event) => setRndResult(event.target.value)} /></label>
            <div className="approval-stack">
              {rndSamples.map((sample) => {
                const materials = (()=>{try{return JSON.parse(sample.materials_json||"[]")}catch{return []}})();
                const bulks = (()=>{try{return JSON.parse(sample.bulk_json||"[]")}catch{return []}})();
                const process = (()=>{try{return JSON.parse(sample.process_json||"{}")}catch{return {}}})();
                return (
                  <article key={sample.sample_batch_id} className="approval-card">
                    <div className="approval-card__header"><div><strong>{sample.test_po_number ?? sample.sample_batch_id}</strong><span>{sample.formula_name ?? sample.formula_code}</span></div><span className="status-chip">{sample.status}</span></div>
                    <p>{sample.product_name} · Revision {sample.revision_no} · {sample.scale_l} development scale</p>
                    <small>{materials.length} formulation materials · {bulks.length} bulk selections · Agitation {process.agitation_rpm ?? sample.agitation_rpm} RPM / {process.agitation_minutes ?? sample.agitation_minutes} min</small>
                    {sample.promoted_material_number && <p className="success-message">Promoted to Office: {sample.promoted_material_number}</p>}
                    <div className="button-row">
                      {sample.status === "Draft" && <button className="button primary" onClick={()=>void updateRndSample(sample.sample_batch_id,"request-materials")}>Raise R&D Material Request</button>}
                      {sample.status === "Warehouse Requested" && <button className="button primary" onClick={()=>void updateRndSample(sample.sample_batch_id,"receive-staging")}>Receive at R&D Staging</button>}
                      {sample.status === "R&D Staging" && <button className="button primary" onClick={()=>void updateRndSample(sample.sample_batch_id,"weigh")}>Execute R&D WR</button>}
                      {sample.status === "R&D WR" && <button className="button primary" onClick={()=>void updateRndSample(sample.sample_batch_id,"mix")}>Execute R&D MR</button>}
                      {sample.status === "R&D MR" && <button className="button primary" onClick={()=>void updateRndSample(sample.sample_batch_id,"pack")}>Execute R&D PL</button>}
                      {sample.status === "R&D PL" && <button className="button primary" onClick={()=>void updateRndSample(sample.sample_batch_id,"start-test")}>Start Sample Testing</button>}
                      {sample.status === "Test Run" && <button className="button primary" onClick={()=>void updateRndSample(sample.sample_batch_id,"complete-test")}>Complete Testing</button>}
                      {sample.status === "Test Complete" && <>
                        <button className="button primary" onClick={()=>void updateRndSample(sample.sample_batch_id,"approve")}>Approve Formula</button>
                        <button className="button secondary" onClick={()=>void updateRndSample(sample.sample_batch_id,"more-testing")}>Requires More Testing</button>
                        <button className="button secondary" onClick={()=>void updateRndSample(sample.sample_batch_id,"reject")}>Reject</button>
                      </>}
                    </div>
                  </article>
                );
              })}
              {!rndSamples.length && <p className="empty-state">No R&D development POs yet.</p>}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="R&D Approval Gate" eyebrow="Production Formula Promotion">
          <p className="subtext">Only formulations with an R&D disposition of APPROVED are promoted to the MES formulation master and become selectable in Office. Requires More Testing and Rejected trials remain visible in development history but cannot be scheduled for commercial production.</p>
        </SectionCard>
      </div>
    );
  }

  function renderShippingZone() {
    return <div className="zone-stack">
      <div className="zone-summary-grid"><article><span>Ready to Schedule</span><strong>{shippingReady.length}</strong></article><article><span>Scheduled</span><strong>{shipments.filter(x => x.status === "Scheduled").length}</strong></article><article><span>Loading</span><strong>{shipments.filter(x => ["Verified", "Loading", "Loaded", "Sealed"].includes(x.status)).length}</strong></article><article><span>Shipped</span><strong>{shipments.filter(x => x.status === "Shipped").length}</strong></article></div>
      <SectionCard title="Office Shipment Scheduler" eyebrow="Carrier, Dock, Date & Time"><div className="form-grid"><label>PO<select value={shipmentPo} onChange={e => setShipmentPo(e.target.value)}>{shippingReady.map(po => <option key={po.id}>{po.po_number}</option>)}</select></label><label>Carrier<select value={carrier} onChange={e => setCarrier(e.target.value)}><option>LTL Carrier</option><option>UPS Freight</option><option>FedEx Freight</option><option>DHL Supply Chain</option><option>Customer Pickup</option></select></label><label>Dock<select value={dock} onChange={e => setDock(e.target.value)}><option>Dock 1</option><option>Dock 2</option><option>Dock 3</option></select></label><label>Date<input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} /></label><label>Time<input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} /></label><button className="button primary" onClick={() => void scheduleShipment()}>Schedule Carrier Pickup</button></div></SectionCard>
      <SectionCard title="Warehouse Shipping Queue" eyebrow="Verify, Load, Seal & Ship"><div className="approval-list">{shipments.map(item => <article key={item.id} className="approval-card"><div><strong>{item.shipment_id}</strong><span>{item.status}</span></div><p>{item.po_number} · {item.carrier} · {item.dock}</p><small>{item.pickup_date} {item.pickup_time} · {item.pallets_loaded}/4 pallets · {item.bol_number ?? "BOL pending"}</small><div className="button-row">{item.status === "Scheduled" && <button className="button primary" onClick={() => void runShipmentAction(item.shipment_id, "verify")}>Verify Shipment</button>}{["Verified", "Loading"].includes(item.status) && <button className="button primary" onClick={() => void runShipmentAction(item.shipment_id, "load")}>Start Automatic Loading</button>}{item.status === "Loaded" && <><input value={sealNumber} onChange={e => setSealNumber(e.target.value)} /><button className="button primary" onClick={() => void runShipmentAction(item.shipment_id, "seal")}>Seal Trailer</button></>}{item.status === "Sealed" && <button className="button primary" onClick={() => void runShipmentAction(item.shipment_id, "ship")}>Complete Shipment</button>}</div></article>)}{!shipments.length && <p className="empty-state">Stage released finished goods at the shipping dock to schedule pickup.</p>}</div></SectionCard>
    </div>;
  }


  async function loadEbrDetail(poNumber: string) {
    if (!poNumber) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const [ebr, mes] = await Promise.all([
        api.ebrDetail(poNumber),
        api.mesBatch(poNumber),
      ]);
      setCompliancePo(poNumber);
      setEbrDetail(ebr);
      setMesRecord(mes);
      setNotice(`Loaded compliance record ${poNumber}`);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function submitBatchReview(poNumber: string, decision: string) {
    await runAction(() => api.decideBatchReview(poNumber, { decision, reviewer, signature: reviewSignature, note: reviewNote }), `Batch review ${decision.toLowerCase()} recorded`);
  }

  function renderComplianceZone() {
    const filtered = ebrBatches.filter(
      (x) =>
        !ebrSearch ||
        `${x.po_number} ${x.batch_number} ${x.product_name}`
          .toLowerCase()
          .includes(ebrSearch.toLowerCase()),
    );

    const selectedCip =
      cipRuns.find((run) => run.cip_id === complianceCipId) ?? null;

    const cipEvents = selectedCip
      ? events
          .filter(
            (event) =>
              event.entity_id === selectedCip.cip_id ||
              event.entity_id === selectedCip.asset_code ||
              event.message.includes(selectedCip.cip_id) ||
              event.message.includes(selectedCip.asset_code),
          )
          .slice()
          .sort(
            (left, right) =>
              new Date(left.created_at).getTime() -
              new Date(right.created_at).getTime(),
          )
      : [];

    // A historical PO can predate the mes.execution_events table. Keep that
    // visible instead of presenting an apparently broken blank MES panel.
    const mesEvents = mesRecord?.events ?? [];
    const mesFallbackEvents =
      mesEvents.length === 0 && ebrDetail
        ? ebrDetail.timeline.map((event) => ({
            event_id: `thread-${event.id}`,
            event_timestamp: event.created_at,
            phase: event.source,
            event_type: event.event_type,
            material_name: null,
            metric: null,
            lot_number: null,
            material_code: null,
            quantity: null,
            value: null,
            unit: null,
            equipment_id: null,
            operator_id: null,
            qualified: event.severity !== "error" && event.severity !== "critical",
            message: event.message,
          }))
        : [];

    const displayedMesEvents =
      mesEvents.length > 0 ? mesEvents : mesFallbackEvents;

    return (
      <div className="zone-stack">
        <div className="zone-summary-grid">
          <article>
            <span>Batch Records</span>
            <strong>{ebrBatches.length}</strong>
          </article>
          <article>
            <span>MES Events</span>
            <strong>{mesRecord?.events.length ?? 0}</strong>
          </article>
          <article>
            <span>CIP Records</span>
            <strong>{cipRuns.length}</strong>
          </article>
          <article>
            <span>Audit Entries</span>
            <strong>{auditTrail.length}</strong>
          </article>
        </div>

        <SectionCard
          title="Compliance Report Browser"
          eyebrow="PO / MES / CIP Record Selection"
        >
          <div className="form-grid compact">
            <label>
              Production Order
              <select
                value={compliancePo}
                onChange={(event) => {
                  const po = event.target.value;
                  setCompliancePo(po);
                  if (po) void loadEbrDetail(po);
                }}
              >
                <option value="">Select PO</option>
                {ebrBatches.map((item) => (
                  <option key={item.po_number} value={item.po_number}>
                    {item.po_number} · {item.batch_number} · {item.status}
                  </option>
                ))}
              </select>
            </label>

            <label>
              CIP Record
              <select
                value={complianceCipId}
                onChange={(event) => setComplianceCipId(event.target.value)}
              >
                <option value="">Select CIP run</option>
                {cipRuns
                  .slice()
                  .sort(
                    (left, right) =>
                      new Date(right.created_at).getTime() -
                      new Date(left.created_at).getTime(),
                  )
                  .map((run) => (
                    <option key={run.cip_id} value={run.cip_id}>
                      {run.cip_id} · {run.asset_code} · {run.status}
                    </option>
                  ))}
              </select>
            </label>

            <label className="wide">
              Search Batch Records
              <input
                value={ebrSearch}
                onChange={(event) => setEbrSearch(event.target.value)}
                placeholder="PO, batch number, or product"
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard
          title="Electronic Batch Records"
          eyebrow="Selectable Batch Genealogy"
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PO / Batch</th>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Yield</th>
                  <th>Downtime</th>
                  <th>Exceptions</th>
                  <th>Review</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.po_number}>
                    <td>
                      <strong>{item.po_number}</strong>
                      <small className="subtext">{item.batch_number}</small>
                    </td>
                    <td>{item.product_name}</td>
                    <td>{item.status}</td>
                    <td>{item.yield_percent}%</td>
                    <td>{item.downtime_minutes} min</td>
                    <td>{item.exception_count}</td>
                    <td>{item.review_status}</td>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => void loadEbrDetail(item.po_number)}
                      >
                        Open Full Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {ebrDetail && (
          <>
            <div className="zone-two-column">
              <SectionCard
                title={`Review by Exception · ${ebrDetail.summary.po_number}`}
                eyebrow="QA Batch Review"
              >
                <div className="detail-list">
                  <div>
                    <span>Batch</span>
                    <strong>{ebrDetail.summary.batch_number}</strong>
                  </div>
                  <div>
                    <span>Shipment</span>
                    <strong>{ebrDetail.summary.shipment_status}</strong>
                  </div>
                  <div>
                    <span>Exceptions</span>
                    <strong>{ebrDetail.summary.exception_count}</strong>
                  </div>
                  <div>
                    <span>Rejects</span>
                    <strong>{ebrDetail.summary.rejects}</strong>
                  </div>
                </div>

                <div className="form-grid compact">
                  <label>
                    Reviewer
                    <input
                      value={reviewer}
                      onChange={(event) => setReviewer(event.target.value)}
                    />
                  </label>
                  <label>
                    Electronic Signature
                    <input
                      value={reviewSignature}
                      onChange={(event) => setReviewSignature(event.target.value)}
                    />
                  </label>
                  <label className="wide">
                    Review Note
                    <input
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                    />
                  </label>
                </div>

                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={() =>
                      void submitBatchReview(
                        ebrDetail.summary.po_number,
                        "Approve",
                      )
                    }
                  >
                    Approve Batch Record
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      void submitBatchReview(
                        ebrDetail.summary.po_number,
                        "Return",
                      )
                    }
                  >
                    Return for Correction
                  </button>
                  <button
                    className="button secondary"
                    onClick={() =>
                      void submitBatchReview(
                        ebrDetail.summary.po_number,
                        "Reject",
                      )
                    }
                  >
                    Reject
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                title="ALCOA+ Data Integrity"
                eyebrow="cGMP Record Controls"
              >
                <div className="alcoa-grid">
                  {Object.entries(ebrDetail.alcoa_plus).map(([key, value]) => (
                    <article key={key}>
                      <span>{key.replaceAll("_", " ")}</span>
                      <strong>{value ? "Verified" : "Review"}</strong>
                    </article>
                  ))}
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Exceptions" eyebrow="Review by Exception">
              <div className="approval-list">
                {ebrDetail.exceptions.map((item, index) => (
                  <article
                    key={`${item.source}-${index}`}
                    className="approval-card"
                  >
                    <div>
                      <strong>{item.category}</strong>
                      <span>{item.status}</span>
                    </div>
                    <p>{item.description}</p>
                    <small>{item.timestamp ? formatDate(item.timestamp) : "—"}</small>
                  </article>
                ))}
                {!ebrDetail.exceptions.length && (
                  <p className="empty-state">
                    No review-by-exception records were recorded for this batch.
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Chronological Electronic Batch Record"
              eyebrow="Attributable, Contemporaneous Event History"
            >
              <div className="timeline-list">
                {ebrDetail.timeline.map((event) => (
                  <article key={event.id}>
                    <span>{formatDate(event.created_at)}</span>
                    <div>
                      <strong>
                        {event.source} · {event.event_type}
                      </strong>
                      <p>{event.message}</p>
                    </div>
                  </article>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Audit Trail"
              eyebrow="Before / After · Reason · Actor · Signature"
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Before</th>
                      <th>After</th>
                      <th>Reason</th>
                      <th>Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ebrDetail.audit_trail.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.created_at)}</td>
                        <td>{entry.action}</td>
                        <td>{entry.before_value ?? "—"}</td>
                        <td>{entry.after_value ?? "—"}</td>
                        <td>{entry.reason}</td>
                        <td>{entry.actor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard
              title={`MES Execution Record · ${ebrDetail.summary.po_number}`}
              eyebrow="Material · Amount · Timestamp · Operator · Equipment"
            >
              {mesEvents.length === 0 && (
                <p className="warning-text">
                  No rows were returned from mes.execution_events for this PO.
                  The chronological digital thread is displayed below as a
                  compatibility report so the compliance record is never blank.
                  The next clean E2E run should be used to verify native MES
                  event persistence.
                </p>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Phase / Event</th>
                      <th>Material / Metric</th>
                      <th>Amount / Value</th>
                      <th>Equipment</th>
                      <th>Operator</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedMesEvents.map((event) => (
                      <tr key={event.event_id}>
                        <td>{formatDate(event.event_timestamp)}</td>
                        <td>
                          <strong>{event.phase}</strong>
                          <small className="subtext">{event.event_type}</small>
                        </td>
                        <td>
                          {event.material_name ?? event.metric ?? "—"}
                          <small className="subtext">
                            {event.lot_number ?? event.material_code ?? ""}
                          </small>
                        </td>
                        <td>
                          {event.quantity ?? event.value ?? "—"} {event.unit ?? ""}
                        </td>
                        <td>{event.equipment_id ?? "—"}</td>
                        <td>{event.operator_id ?? "—"}</td>
                        <td>{event.qualified ? "Qualified" : "Exception"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!displayedMesEvents.length && (
                <p className="empty-state">
                  No MES or digital-thread execution records are available for
                  this PO.
                </p>
              )}
            </SectionCard>
          </>
        )}

        {selectedCip && (
          <SectionCard
            title={`CIP Execution Report · ${selectedCip.cip_id}`}
            eyebrow="Asset · Phase · Timestamp · Operator · Faults · Signature"
          >
            <div className="detail-list">
              <div>
                <span>Asset</span>
                <strong>
                  {selectedCip.asset_code} · {selectedCip.asset_type}
                </strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{selectedCip.status}</strong>
              </div>
              <div>
                <span>Current / Final Phase</span>
                <strong>{selectedCip.phase}</strong>
              </div>
              <div>
                <span>Progress</span>
                <strong>{selectedCip.progress}%</strong>
              </div>
              <div>
                <span>Operator</span>
                <strong>{selectedCip.operator}</strong>
              </div>
              <div>
                <span>Electronic Signature</span>
                <strong>{selectedCip.signature ?? "Not yet signed"}</strong>
              </div>
              <div>
                <span>Started</span>
                <strong>{formatDate(selectedCip.created_at)}</strong>
              </div>
              <div>
                <span>Completed</span>
                <strong>
                  {selectedCip.completed_at
                    ? formatDate(selectedCip.completed_at)
                    : "In progress"}
                </strong>
              </div>
            </div>

            {selectedCip.fault_code && (
              <p className="warning-text">
                {selectedCip.fault_code}: {selectedCip.fault_message}
              </p>
            )}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Source</th>
                    <th>Event</th>
                    <th>Record</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {cipEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{formatDate(event.created_at)}</td>
                      <td>{event.source}</td>
                      <td>{event.event_type}</td>
                      <td>{event.message}</td>
                      <td>{event.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!cipEvents.length && (
              <p className="empty-state">
                No digital-thread events for this CIP run are present in the
                currently loaded event window. The run header above remains the
                authoritative CIP record.
              </p>
            )}
          </SectionCard>
        )}
      </div>
    );
  }

  function renderReliabilityZone() {
    const maxMinutes = Math.max(1, ...(packagingKpis?.pareto.map(item => item.minutes) ?? [1]));
    return <div className="zone-stack">
      <div className="zone-summary-grid"><article><span>Packaging Faults</span><strong>{packagingKpis?.total_faults ?? 0}</strong></article><article><span>Downtime</span><strong>{packagingKpis?.total_downtime_minutes ?? 0} min</strong></article><article><span>MTBF</span><strong>{packagingKpis?.mtbf_minutes ?? 0} min</strong></article><article><span>MTTR</span><strong>{packagingKpis?.mttr_minutes ?? 0} min</strong></article><article><span>Availability</span><strong>{packagingKpis?.availability_percent ?? 100}%</strong></article></div>
      <div className="zone-two-column">
        <SectionCard title="Packaging Downtime Pareto" eyebrow="Lean Six Sigma · Define / Measure">
          <div className="pareto-chart">{(packagingKpis?.pareto ?? []).map(item => <article key={item.category}><div><strong>{item.category}</strong><span>{item.minutes} min · {item.percent}%</span></div><div className="pareto-track"><span style={{ width: `${Math.max(6, item.minutes / maxMinutes * 100)}%` }} /></div></article>)}{!(packagingKpis?.pareto.length) && <p className="empty-state">Run a packaging campaign to generate guaranteed demo faults.</p>}</div>
        </SectionCard>
        <SectionCard title="Maintenance Work Orders" eyebrow="Reliability Response">
          <div className="approval-list">{maintenanceWorkOrders.map(wo => <article key={wo.id} className="approval-card"><div><strong>{wo.work_order_id}</strong><span>{wo.status}</span></div><p>{wo.asset_code} · {wo.priority}</p><small>{wo.problem_description}</small></article>)}{!maintenanceWorkOrders.length && <p className="empty-state">Packaging faults automatically create maintenance work orders.</p>}</div>
        </SectionCard>
      </div>
      <SectionCard title="Downtime Event Log" eyebrow="Analyze · Root Cause · Corrective Action"><div className="table-wrap"><table><thead><tr><th>Fault</th><th>Line</th><th>Category</th><th>Duration</th><th>Root Cause</th><th>Corrective Action</th></tr></thead><tbody>{packagingDowntime.map(e => <tr key={e.id}><td>{e.fault_code}</td><td>{e.line_code}</td><td>{e.category}</td><td>{e.status === "Open" ? "Active" : `${e.duration_minutes} min`}</td><td>{e.root_cause ?? "Pending diagnosis"}</td><td>{e.corrective_action ?? "Pending"}</td></tr>)}</tbody></table></div></SectionCard>
    </div>;
  }

  function renderAnalyticsZone() {
    const maxPareto = Math.max(1, ...(packagingKpis?.pareto ?? []).map((item) => item.minutes));
    const stageCounts = [
      ["Planning", productionOrders.filter((po) => /registered|planned|warehouse/i.test(po.status)).length],
      ["Weigh / Mix", productionOrders.filter((po) => /weigh|mix|bulk/i.test(po.status)).length],
      ["Quality", productionOrders.filter((po) => /qa|hold|review/i.test(po.status)).length],
      ["Packaging", productionOrders.filter((po) => /packag|finished/i.test(po.status)).length],
      ["Shipping", productionOrders.filter((po) => /ship|closed/i.test(po.status)).length],
    ] as const;
    return <div className="zone-stack analytics-zone">
      <div className="executive-kpi-grid compact"><article><span>OEE</span><strong>{oee}%</strong></article><article><span>RFT</span><strong>{rightFirstTime}%</strong></article><article><span>Yield</span><strong>{yieldPercent}%</strong></article><article><span>Availability</span><strong>{equipmentAvailability}%</strong></article><article><span>MTBF</span><strong>{packagingKpis?.mtbf_minutes ?? 0} min</strong></article><article><span>MTTR</span><strong>{packagingKpis?.mttr_minutes ?? 0} min</strong></article></div>
      <div className="analytics-grid">
        <SectionCard title="Batch Flow Distribution" eyebrow="Operations Throughput"><div className="bar-chart">{stageCounts.map(([label, value]) => <article key={label}><div><strong>{label}</strong><span>{value} batches</span></div><div className="analytics-track"><span style={{ width: `${Math.max(value ? 12 : 2, value / Math.max(1, productionOrders.length) * 100)}%` }} /></div></article>)}</div></SectionCard>
        <SectionCard title="Downtime Pareto" eyebrow="Reliability Performance"><div className="bar-chart">{(packagingKpis?.pareto ?? []).map((item) => <article key={item.category}><div><strong>{item.category}</strong><span>{item.minutes} min · {item.percent}%</span></div><div className="analytics-track warning"><span style={{ width: `${Math.max(5, item.minutes / maxPareto * 100)}%` }} /></div></article>)}{!(packagingKpis?.pareto.length) && <p className="empty-state">Run packaging campaigns to populate reliability analytics.</p>}</div></SectionCard>
        <SectionCard title="Quality Performance" eyebrow="Review by Exception"><div className="metric-ring-grid"><article><span>QA Backlog</span><strong>{qaBacklog}</strong></article><article><span>EBR Exceptions</span><strong>{ebrBatches.reduce((sum, b) => sum + b.exception_count, 0)}</strong></article><article><span>Approved Reviews</span><strong>{batchReviews.filter((r) => r.status === "Approved").length}</strong></article><article><span>Audit Entries</span><strong>{auditTrail.length}</strong></article></div></SectionCard>
        <SectionCard title="Warehouse & Shipping" eyebrow="Logistics Performance"><div className="metric-ring-grid"><article><span>TO Completion</span><strong>{warehouseQueue.filter((o) => /delivered|staged|shipped/i.test(o.status)).length}/{warehouseQueue.length}</strong></article><article><span>Ready Shipments</span><strong>{shippingReady.length}</strong></article><article><span>Scheduled</span><strong>{shipments.filter((s) => !(/shipped/i.test(s.status))).length}</strong></article><article><span>Shipped</span><strong>{shipments.filter((s) => /shipped/i.test(s.status)).length}</strong></article></div></SectionCard>
      </div>
      <SectionCard title="Executive Batch Scorecard" eyebrow="Closed and Active Batch Comparison"><div className="table-wrap"><table><thead><tr><th>PO</th><th>Product</th><th>Status</th><th>Yield</th><th>Rejects</th><th>Downtime</th><th>Exceptions</th><th>Shipment</th></tr></thead><tbody>{ebrBatches.map((batch) => <tr key={batch.po_number}><td>{batch.po_number}</td><td>{batch.product_name}</td><td>{batch.status}</td><td>{batch.yield_percent}%</td><td>{batch.rejects}</td><td>{batch.downtime_minutes} min</td><td>{batch.exception_count}</td><td>{batch.shipment_status}</td></tr>)}</tbody></table></div></SectionCard>
    </div>;
  }

  function renderThreadZone() {
    const current = replayEvents[Math.min(replayIndex, Math.max(0, replayEvents.length - 1))];
    const selectedBatch = ebrBatches.find((batch) => batch.po_number === replayPo) ?? ebrBatches[0];
    return <div className="zone-stack thread-zone">
      <SectionCard title="Batch Digital Thread Explorer" eyebrow="Lifecycle, Evidence & Replay" action={<select value={replayPo} onChange={(event) => { setReplayPo(event.target.value); setReplayIndex(0); setReplayPlaying(false); }}><option value="">All Enterprise Events</option>{productionOrders.map((po) => <option key={po.id} value={po.po_number}>{po.po_number} · {po.batch_number}</option>)}</select>}>
        <div className="lifecycle-track">{["Office", "Weigh PR", "Warehouse", "Vestibule", "Weigh", "Premix", "Mix", "Hold", "QA", "Packaging", "FG QA", "Shipping", "Closed"].map((stage, index) => <article key={stage} className={index <= Math.min(10, Math.floor((replayIndex / Math.max(1, replayEvents.length - 1)) * 10)) ? "complete" : "pending"}><span>{index + 1}</span><strong>{stage}</strong></article>)}</div>
        <div className="replay-console"><div className="replay-screen"><p className="eyebrow">Current Replay Event</p>{current ? <><h3>{current.source}</h3><p>{current.message}</p><small>{current.entity_type} · {current.entity_id} · {formatDate(current.created_at)}</small></> : <p>No events available for this selection.</p>}</div><div className="replay-controls"><button className="button secondary" onClick={() => setReplayIndex(Math.max(0, replayIndex - 1))}>Previous</button><button className="button primary" onClick={() => setReplayPlaying((playing) => !playing)}>{replayPlaying ? "Pause" : "Play"}</button><button className="button secondary" onClick={() => setReplayIndex(Math.min(replayEvents.length - 1, replayIndex + 1))}>Step</button><select value={replaySpeed} onChange={(event) => setReplaySpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={5}>5×</option><option value={10}>10×</option></select><span>{replayEvents.length ? replayIndex + 1 : 0}/{replayEvents.length}</span></div><progress max={Math.max(1, replayEvents.length - 1)} value={replayIndex} /></div>
      </SectionCard>
      <div className="zone-two-column">
        <SectionCard title="Event Evidence" eyebrow="Operators, Equipment & Timestamps"><div className="timeline-list">{replayEvents.map((event, index) => <button key={event.id} className={`thread-event ${index === replayIndex ? "active" : ""}`} onClick={() => setReplayIndex(index)}><span>{formatDate(event.created_at)}</span><div><strong>{event.source}</strong><p>{event.message}</p><small>{event.entity_type} · {event.entity_id}</small></div></button>)}{!replayEvents.length && <p className="empty-state">No events recorded for this selection.</p>}</div></SectionCard>
        <SectionCard title="Batch Record Context" eyebrow="EBR, Exceptions & Audit"><div className="thread-context"><article><span>PO</span><strong>{selectedBatch?.po_number ?? "—"}</strong></article><article><span>Status</span><strong>{selectedBatch?.status ?? "—"}</strong></article><article><span>Yield</span><strong>{selectedBatch?.yield_percent ?? 100}%</strong></article><article><span>Exceptions</span><strong>{selectedBatch?.exception_count ?? 0}</strong></article><article><span>Review</span><strong>{selectedBatch?.review_status ?? "Not Started"}</strong></article><article><span>Shipment</span><strong>{selectedBatch?.shipment_status ?? "Not Scheduled"}</strong></article></div><button className="button primary" onClick={() => { if (selectedBatch) { setActiveZone("compliance"); void loadEbrDetail(selectedBatch.po_number); } }}>Open Full EBR</button></SectionCard>
      </div>
    </div>;
  }

  function renderAlertsZone() {
    const departments = Array.from(new Set(notifications.map((item) => item.recipient)));
    return <div className="zone-stack alert-center-zone">
      <div className="zone-summary-grid"><article><span>Total Alerts</span><strong>{notifications.length}</strong></article><article><span>Unread</span><strong>{unreadNotifications.length}</strong></article><article><span>Critical</span><strong>{notifications.filter((item) => /critical|high|error/i.test(item.severity)).length}</strong></article><article><span>Active Alarms</span><strong>{currentAlarms}</strong></article></div>
      <SectionCard title="Enterprise Alert Center" eyebrow="Cross-Functional Response" action={<div className="alert-filters"><select value={alertSeverity} onChange={(event) => setAlertSeverity(event.target.value)}><option>All</option><option>Info</option><option>Warning</option><option>Critical</option></select><select value={alertDepartment} onChange={(event) => setAlertDepartment(event.target.value)}><option>All</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></div>}>
        <div className="enterprise-alert-list">{filteredAlerts.map((item) => <article key={item.id} className={`enterprise-alert severity-${item.severity}`}><div><span>{item.recipient}</span><strong>{item.title}</strong><em>{item.severity}</em></div><p>{item.message}</p><small>{formatDate(item.created_at)}</small></article>)}{!filteredAlerts.length && <p className="empty-state">No alerts match the selected filters.</p>}</div>
      </SectionCard>
      <div className="zone-two-column"><SectionCard title="Live Equipment Alarms" eyebrow="PLC, Packaging & CIP"><div className="approval-list">{mixBatches.filter((b) => b.fault_code).map((b) => <article key={b.id} className="approval-card"><div><strong>{b.fault_code}</strong><span>Mixing</span></div><p>{b.fault_message}</p></article>)}{packagingRuns.filter((r) => r.jam_code).map((r) => <article key={r.id} className="approval-card"><div><strong>{r.jam_code}</strong><span>Packaging</span></div><p>{r.fault_message}</p></article>)}{cipRuns.filter((r) => r.fault_code).map((r) => <article key={r.id} className="approval-card"><div><strong>{r.fault_code}</strong><span>CIP</span></div><p>{r.fault_message}</p></article>)}{!currentAlarms && <p className="empty-state">No active PLC or CIP alarms.</p>}</div></SectionCard><SectionCard title="Response Backlog" eyebrow="Quality & Maintenance"><div className="attention-stack"><article><span>Open Work Orders</span><strong>{openWorkOrders.length}</strong></article><article><span>QA Review Backlog</span><strong>{qaBacklog}</strong></article><article><span>Pending Route Changes</span><strong>{routeChanges.filter((r) => r.status === "Pending").length}</strong></article><article><span>Pending Substitutions</span><strong>{pendingApprovals.length}</strong></article></div></SectionCard></div>
    </div>;
  }

  function renderHistorianZone() {
    const samples = [
      ...mixBatches.map((batch) => ({ assetCode: `${batch.tank_code}.TEMP`, label: "Mix temperature", unit: "°C", value: batch.temperature_c, status: batch.status, zone: "mixing" })),
      ...mixBatches.map((batch) => ({ assetCode: `${batch.tank_code}.RPM`, label: "Agitator speed", unit: "RPM", value: batch.rpm, status: batch.status, zone: "mixing" })),
      ...holdTanks.map((tank) => ({ assetCode: `${tank.tank_code}.LEVEL`, label: "Hold tank level", unit: "%", value: tank.level_percent, status: `${tank.status} ${tank.qa_status}`, zone: "mixing" })),
      ...bulkTanks.map((tank) => ({ assetCode: `${tank.tank_code}.INV`, label: `${tank.material_name} inventory`, unit: "kg", value: tank.quantity_kg, status: `${tank.status} ${tank.qa_status}`, zone: "bulk" })),
      ...bulkTanks.map((tank) => ({ assetCode: `${tank.tank_code}.TEMP`, label: `${tank.material_name} temperature`, unit: "°C", value: tank.temperature_c, status: tank.status, zone: "bulk" })),
      ...packagingRuns.map((run) => ({ assetCode: `${run.line_code}.SPEED`, label: "Packaging line speed", unit: "BPM", value: run.speed_bpm, status: run.status, zone: "packaging" })),
      ...packagingRuns.map((run) => ({ assetCode: `${run.line_code}.PROGRESS`, label: "Packaging campaign progress", unit: "%", value: run.progress, status: run.status, zone: "packaging" })),
      ...cipRuns.map((run) => ({ assetCode: `${run.asset_code}.CIP`, label: `CIP ${run.phase}`, unit: "%", value: run.progress, status: run.status, zone: "lean" })),
    ];

    const alarms = [
      ...mixBatches.filter((batch) => batch.fault_code).map((batch) => ({ id: `mix-${batch.id}`, timestamp: batch.created_at, source: batch.tank_code, code: batch.fault_code ?? "MIX", message: batch.fault_message ?? "Mixing fault", severity: "Critical", status: batch.fault_diagnosed ? "Diagnosed" : "Active" })),
      ...packagingRuns.filter((run) => run.jam_code).map((run) => ({ id: `pkg-${run.id}`, timestamp: run.created_at, source: run.line_code, code: run.jam_code ?? "PKG", message: run.fault_message ?? "Packaging fault", severity: "Critical", status: run.fault_diagnosed ? "Diagnosed" : "Active" })),
      ...cipRuns.filter((run) => run.fault_code).map((run) => ({ id: `cip-${run.id}`, timestamp: run.created_at, source: run.asset_code, code: run.fault_code ?? "CIP", message: run.fault_message ?? "CIP fault", severity: "Warning", status: run.fault_diagnosed ? "Diagnosed" : "Active" })),
      ...notifications.filter((item) => /warning|critical|error/i.test(item.severity)).map((item) => ({ id: `notification-${item.id}`, timestamp: item.created_at, source: item.recipient, code: item.title, message: item.message, severity: /critical|error/i.test(item.severity) ? "Critical" : "Warning", status: item.is_read ? "Acknowledged" : "Active" })),
    ];

    return <HistorianCenter
      connected={Boolean(health)}
      samples={samples}
      events={events.map((event) => ({ id: event.id, timestamp: event.created_at, source: event.source, message: event.message, severity: event.severity, entityId: event.entity_id }))}
      alarms={alarms}
      downtimeMinutes={packagingKpis?.total_downtime_minutes ?? 0}
      availabilityPercent={packagingKpis?.availability_percent ?? 100}
      mtbfMinutes={packagingKpis?.mtbf_minutes ?? 0}
      mttrMinutes={packagingKpis?.mttr_minutes ?? 0}
      onNavigate={(zone) => navigateTo(zone as ZoneId)}
    />;
  }


  function renderIntelligenceZone() {
    const assets = [
      ...mixBatches.map((batch) => ({ assetCode: batch.tank_code, label: "Mix tank and agitator", zone: "mixing", status: batch.status, faultCode: batch.fault_code, primaryValue: batch.rpm, unit: "RPM" })),
      ...holdTanks.map((tank) => ({ assetCode: tank.tank_code, label: "Bulk hold tank", zone: "mixing", status: `${tank.status} ${tank.qa_status}`, primaryValue: tank.level_percent, unit: "%" })),
      ...bulkTanks.map((tank) => ({ assetCode: tank.tank_code, label: tank.material_name, zone: "bulk", status: `${tank.status} ${tank.qa_status}`, primaryValue: tank.quantity_kg, unit: "kg" })),
      ...packagingRuns.map((run) => ({ assetCode: run.line_code, label: "Packaging line", zone: "packaging", status: run.status, faultCode: run.jam_code, primaryValue: run.speed_bpm, unit: "BPM" })),
      ...cipRuns.map((run) => ({ assetCode: run.asset_code, label: `CIP ${run.phase}`, zone: "lean", status: run.status, faultCode: run.fault_code, primaryValue: run.progress, unit: "%" })),
    ];
    return <OperationalIntelligence
      assets={assets}
      workOrders={maintenanceWorkOrders.map((item) => ({ id: item.id, workOrderId: item.work_order_id, assetCode: item.asset_code, priority: item.priority, status: item.status, description: item.problem_description }))}
      alarmCount={currentAlarms}
      downtimeMinutes={packagingKpis?.total_downtime_minutes ?? 0}
      availabilityPercent={packagingKpis?.availability_percent ?? 100}
      mtbfMinutes={packagingKpis?.mtbf_minutes ?? 0}
      mttrMinutes={packagingKpis?.mttr_minutes ?? 0}
      onNavigate={(zone) => navigateTo(zone as ZoneId)}
    />;
  }

  function renderSustainabilityZone() {
    const activeRuns = packagingRuns.filter((run) => /running|packaging/i.test(run.status)).length;
    const activeMix = mixBatches.filter((batch) => /running|mixing|agitation|transfer/i.test(batch.status)).length;
    const activeCip = cipRuns.filter((run) => /running|cip/i.test(run.status)).length;
    const bulkInventory = bulkTanks.reduce((sum, tank) => sum + Number(tank.quantity_kg || 0), 0);
    const waterInventory = bulkTanks.filter((tank) => /water/i.test(tank.material_name)).reduce((sum, tank) => sum + Number(tank.quantity_kg || 0), 0);
    const energyKw = 18 + activeMix * 14 + activeRuns * 11 + activeCip * 9;
    const waterUse = Math.round(activeCip * 480 + activeMix * 120 + packagingRuns.reduce((sum, run) => sum + Number(run.bottles_completed || 0) * 0.015, 0));
    const carbonKg = Math.round(energyKw * 0.37 * 10) / 10;
    const yieldPercent = packagingKpis?.availability_percent ?? 100;
    return <SustainabilityCenter
      energyKw={energyKw}
      waterLiters={waterUse}
      carbonKg={carbonKg}
      bulkInventoryKg={bulkInventory}
      purifiedWaterKg={waterInventory}
      cipRuns={cipRuns.map((run) => ({ assetCode: run.asset_code, phase: run.phase, progress: run.progress, status: run.status, faultCode: run.fault_code }))}
      equipment={{ activeMix, activePackaging: activeRuns, activeCip }}
      availabilityPercent={yieldPercent}
      downtimeMinutes={packagingKpis?.total_downtime_minutes ?? 0}
      onNavigate={(zone) => navigateTo(zone as ZoneId)}
    />;
  }

  function renderWorkforceZone() {
    return <WorkforceErrorBoundary onReturn={() => navigateTo("command")}>
      <WorkforceCenter
        roles={roles ?? []}
        activeSession={session ? { sessionId: session.session_id, role: session.role, difficulty: session.difficulty, status: session.status, score: session.score, createdAt: session.created_at } : null}
        activeProductionOrders={(productionOrders ?? []).filter((po) => !/closed|shipped|complete/i.test(po.status)).length}
        openAlerts={Number.isFinite(currentAlarms) ? currentAlarms : 0}
        openWorkOrders={(maintenanceWorkOrders ?? []).filter((item) => !/closed|complete/i.test(item.status)).length}
        qaBacklog={Number.isFinite(qaBacklog) ? qaBacklog : 0}
        onNavigate={(zone) => navigateTo(zone as ZoneId)}
      />
    </WorkforceErrorBoundary>;
  }

  function renderAutomationZone() {
    return <AutomationCenter
      mixRooms={mixRooms}
      mixBatches={mixBatches}
      packagingLines={packagingLines}
      packagingRuns={packagingRuns}
      bulkTanks={bulkTanks}
      bulkTransfers={bulkTransfers}
      cipRuns={cipRuns}
      navigateTo={(zone) => navigateTo(zone)}
    />;
  }

  function renderPlannedZone() {
    return (
      <section className="planned-zone">
        <div className={`planned-icon planned-icon-${activeZone}`}>{activeZoneDefinition.shortLabel.slice(0, 2).toUpperCase()}</div>
        <p className="eyebrow">Upcoming Operational Sprint</p>
        <h2>{activeZoneDefinition.label}</h2>
        <p>{activeZoneDefinition.description}</p>
        <div className="planned-checklist">
          <span>Shared digital thread</span>
          <span>Role-based training</span>
          <span>Live equipment state</span>
          <span>Lean Six Sigma event capture</span>
        </div>
        <button className="button secondary" onClick={() => navigateTo("command")}>Return to Command Center</button>
      </section>
    );
  }

  function renderActiveZone() {
    if (activeZone === "command") return renderCommandCenter();
    if (activeZone === "twin") return renderDigitalTwinZone();
    if (activeZone === "security") return renderSecurityZone();
    if (activeZone === "office") return renderOfficeZone();
    if (activeZone === "warehouse") return renderWarehouseZone();
    if (activeZone === "weighing") return renderWeighingZone();
    if (activeZone === "mixing") return renderMixingZone();
    if (activeZone === "bulk") return renderBulkZone();
    if (activeZone === "packaging") return renderPackagingZone();
    if (activeZone === "quality") return renderQualityZone();
    if (activeZone === "rnd") return renderRndZone();
    if (activeZone === "shipping") return renderShippingZone();
    if (activeZone === "lean") return renderReliabilityZone();
    if (activeZone === "compliance") return renderComplianceZone();
    if (activeZone === "analytics") return renderAnalyticsZone();
    if (activeZone === "thread") return renderThreadZone();
    if (activeZone === "alerts") return renderAlertsZone();
    if (activeZone === "automation") return renderAutomationZone();
    if (activeZone === "historian") return renderHistorianZone();
    if (activeZone === "intelligence") return renderIntelligenceZone();
    if (activeZone === "sustainability") return renderSustainabilityZone();
    if (activeZone === "workforce") return renderWorkforceZone();
    if (activeZone === "readiness") return <ReleaseReadinessCenter onResetComplete={refresh} />;
    return renderPlannedZone();
  }

  return (
    <div className="app-shell zoned-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">EES</span>
          <div><p>Enterprise Execution Suite</p><small>EES Pharma Process Twin · Public Cloud Edition</small></div>
        </div>
        <div className="topbar-actions">
          <StatusBadge label={health ? "API Online" : loading ? "Connecting" : "API Offline"} state={systemState} />
          <button type="button" className="button secondary" onClick={() => navigateTo("readiness")}>Demo Reset</button>
          <button type="button" className="button secondary" onClick={() => void refresh()}>Refresh</button>
          <button type="button" className="mobile-menu-button" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle zone navigation">Zones</button>
        </div>
      </header>

      <div className="operations-layout">
        <aside className={`zone-sidebar ${mobileNavOpen ? "open" : ""}`}>
          <div className="sidebar-heading"><span>Plant Navigation</span><small>Operational zones</small></div>
          <nav>
            {zones.map((zone) => (
              <button key={zone.id} className={`zone-nav-item ${activeZone === zone.id ? "active" : ""}`} onClick={() => navigateTo(zone.id)}>
                <span className={`zone-nav-icon zone-nav-icon-${zone.id}`}>{zone.shortLabel.slice(0, 2).toUpperCase()}</span>
                <span><strong>{zone.shortLabel}</strong><small>{zone.status === "live" ? "Live workflow" : "Planned"}</small></span>
              </button>
            ))}
          </nav>
          <div className="sidebar-footer"><span>Digital Thread</span><strong>{events.length} events</strong><span>Open Alerts</span><strong>{unreadNotifications.length}</strong></div>
        </aside>

        <main className="zone-main">
          <section className="zone-titlebar">
            <div><p className="eyebrow">Current Operational Zone</p><h1>{activeZoneDefinition.label}</h1><p>{activeZoneDefinition.description}</p></div>
            <div className="zone-title-status"><span className={activeZoneDefinition.status}>{activeZoneDefinition.status === "live" ? "Live & Connected" : "Planned Module"}</span></div>
          </section>

          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}
          {renderActiveZone()}
        </main>

        <aside className="context-rail">
          <section><p className="eyebrow">Live Context</p><h3>{activeZoneDefinition.shortLabel}</h3><p>{activeZoneDefinition.description}</p></section>
          <section><span>System</span><strong>{health ? "Connected" : "Offline"}</strong><span>Database</span><strong>{health?.database ?? "Unknown"}</strong></section>
          <section><span>Active PO</span><strong>{selectedPo || "None"}</strong><span>Selected TO</span><strong>{selectedTo || "None"}</strong></section>
          <section><p className="eyebrow">Latest Alert</p>{notifications[0] ? <><strong>{notifications[0].title}</strong><p>{notifications[0].message}</p></> : <p>No active alerts.</p>}</section>
        </aside>
      </div>

      <footer><span>Enterprise Execution Suite · Zoned Operations Interface</span><span>Global Supply Nexus ↔ Pharma Process Twin</span></footer>
    </div>
  );
}
