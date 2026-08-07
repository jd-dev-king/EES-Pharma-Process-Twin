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
  batch_number: "B-26-0813",
  product_name: "Prednisone Oral Suspension 5 mg/5 mL",
  quantity: 4200,
  priority: "Critical",
  destination: "Weighing Staging 01",
  weigh_room: "WR-01",
  mix_tank: "V-201",
  hold_tank: "H-301",
  packaging_line: "PKG-01",
  requires_premix: true,
  flavor: "Cherry",
  bulk_material: "Propylene Glycol",
};

const initialRoute: T.SchedulerConflictPayload = {
  weigh_room: "WR-02",
  mix_tank: "V-202",
  hold_tank: "H-302",
  packaging_line: "PKG-02",
};

const bulkRecipeByMaterial: Record<string, { tankCode: string; quantityKg: number }> = {
  "Propylene Glycol": { tankCode: "PG-101", quantityKg: 420 },
  "Glycerin": { tankCode: "GLY-101", quantityKg: 400 },
  "Sorbitol Solution": { tankCode: "SOR-101", quantityKg: 450 },
};

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
  const [roles, setRoles] = useState<string[]>([]);
  const [productionOrders, setProductionOrders] = useState<T.ProductionOrder[]>([]);
  const [warehouseQueue, setWarehouseQueue] = useState<T.WarehouseTransferOrder[]>([]);
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
  const [selectedMixBatch, setSelectedMixBatch] = useState("");
  const [mixWorkspace, setMixWorkspace] = useState<T.MixWorkspace | null>(null);
  const [selectedPackagingLine, setSelectedPackagingLine] = useState("PKG-01");
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
  const [route, setRoute] = useState(initialRoute);
  const [routeResult, setRouteResult] = useState<T.SchedulerConflictResponse | null>(null);
  const [role, setRole] = useState("Production Scheduler");
  const [difficulty, setDifficulty] = useState("Beginner");
  const [session, setSession] = useState<T.TrainingSession | null>(null);
  const [weighOperator, setWeighOperator] = useState("Weigh Technician");
  const [barcode, setBarcode] = useState("");
  const [actualWeight, setActualWeight] = useState("");
  const [signature, setSignature] = useState("J. WeighTech");
  const [mixOperator, setMixOperator] = useState("Process Engineer");
  const [requestedHoldTank, setRequestedHoldTank] = useState("H-302");
  const [requestedWeighRoom, setRequestedWeighRoom] = useState("WR-02");
  const [requestedMixTank, setRequestedMixTank] = useState("V-202");
  const [resourceChangeReason, setResourceChangeReason] = useState("Scheduled resource is unavailable or conflicts with current operations");
  const [requestedProductionQuantity, setRequestedProductionQuantity] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        roleData,
        poData,
        queueData,
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
        packagingLineData,
        packagingQueueData,
        packagingRunData,
        qaFgTaskData, packagingDowntimeData, packagingKpiData, maintenanceWorkOrderData, cipRunData, shippingReadyData, shipmentData, ebrBatchData, batchReviewData, auditTrailData, bulkTankData, bulkDeliveryData, bulkTransferData,
      ] = await Promise.all([
        api.parkingStatus().catch(() => null),
        api.securityStatus().catch(() => null),
        api.trainingRoles(),
        api.productionOrders(),
        api.warehouseQueue(),
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
        api.packagingLines(),
        api.packagingQueue(),
        api.packagingRuns(),
        api.qaFgTasks(), api.packagingDowntime(), api.packagingKpis(), api.maintenanceWorkOrders(), api.cipRuns(), api.shippingReady(), api.shipments(), api.ebrBatches(), api.batchReviews(), api.auditTrail(), api.bulkTanks(), api.bulkDeliveries(), api.bulkTransfers(),
      ]);

      const normalizedPos = asArray<T.ProductionOrder>(poData);
      const normalizedQueue = asArray<T.WarehouseTransferOrder>(queueData);

      setParkingStatus((parkingData as T.ParkingStatus | null) ?? null);
      setSecurityStatus((securityData as T.SecurityStatus | null) ?? null);
      setRoles(asArray<string>(roleData));
      setProductionOrders(normalizedPos);
      setWarehouseQueue(normalizedQueue);
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
    await runAction(
      () => api.registerProductionOrder(poForm),
      "PO registered and Warehouse notified.",
    );
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

    const roomSuffix = selectedRoom.split("-").pop();
    const order = deliveredOrders.find(
      (item) =>
        !item.destination ||
        item.destination === "Weighing Staging" ||
        item.destination.endsWith(roomSuffix ?? ""),
    );
    if (!order) {
      throw new Error(`No delivered cart is staged for ${selectedRoom}`);
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
  }

  async function openMixBatch() {
    const poNumber = mixQueue[0]?.po_number;
    if (!poNumber) {
      throw new Error("No completed weighing record is available for mixing");
    }
    const batch = await api.openMixBatch(poNumber, selectedMixRoom, mixOperator);
    setSelectedMixBatch(batch.batch_id);
    setMixWorkspace(await api.mixWorkspace(batch.batch_id));
  }

  async function runWeighAction(
    action: () => Promise<unknown>,
    message: string,
    options: { clearBarcode?: boolean; clearWeight?: boolean } = {},
  ) {
    await runAction(action, message);
    if (selectedTicket) {
      setWeighWorkspace(await api.weighTicketWorkspace(selectedTicket));
    }
    if (options.clearBarcode) setBarcode("");
    if (options.clearWeight) setActualWeight("");
  }

  async function runMixAction(action: () => Promise<unknown>, message: string) {
    await runAction(action, message);
    if (selectedMixBatch) {
      setMixWorkspace(await api.mixWorkspace(selectedMixBatch));
    }
  }

  async function loadPackagingWorkspace(runId: string) {
    setSelectedPackagingRun(runId);
    setPackagingWorkspace(await api.packagingWorkspace(runId));
  }

  async function openPackagingRun() {
    const po = packagingQueue[0];
    if (!po) throw new Error("No QA-released bulk is ready for Packaging");
    const run = await api.openPackagingRun(po.po_number, selectedPackagingLine, packagingOperator);
    setSelectedPackagingRun(run.run_id);
    setPackagingWorkspace(await api.packagingWorkspace(run.run_id));
  }

  async function runPackagingAction(action: string, message: string) {
    if (!selectedPackagingRun) throw new Error("Open a packaging run first");
    await runAction(() => api.packagingAction(selectedPackagingRun, action, packagingOperator), message);
    setPackagingWorkspace(await api.packagingWorkspace(selectedPackagingRun));
    setPackagingRuns(asArray<T.PackagingRun>(await api.packagingRuns()));
  }

  function navigateTo(zone: ZoneId) {
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
      onOpenParking={() => window.open(import.meta.env.VITE_PARKING_APP_URL ?? "http://localhost:5501", "_blank", "noopener,noreferrer")}
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
        onOpenParking={() => window.open(import.meta.env.VITE_PARKING_APP_URL ?? "http://localhost:5501", "_blank", "noopener,noreferrer")}
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
          <SectionCard title="Register Production Order" eyebrow="Office Planning">
            <form onSubmit={registerProductionOrder} className="form-grid">
              <label>PO<input value={poForm.po_number} onChange={(event) => setPoForm({ ...poForm, po_number: event.target.value })} /></label>
              <label>Batch<input value={poForm.batch_number} onChange={(event) => setPoForm({ ...poForm, batch_number: event.target.value })} /></label>
              <label className="wide">Product<input value={poForm.product_name} onChange={(event) => setPoForm({ ...poForm, product_name: event.target.value })} /></label>
              <label>Flavor<select value={poForm.flavor} onChange={(event) => setPoForm({ ...poForm, flavor: event.target.value })}><option>Unflavored</option><option>Cherry</option><option>Orange</option><option>Lemon</option><option>Berry</option></select></label>
              <label>Bulk Excipient<select value={poForm.bulk_material} onChange={(event) => setPoForm({ ...poForm, bulk_material: event.target.value })}><option>Propylene Glycol</option><option>Glycerin</option><option>Sorbitol Solution</option></select></label>
              <label>Bulk Water<input value="Purified Water (fixed recipe bulk)" readOnly /></label>
              <label>Quantity<input type="number" value={poForm.quantity} onChange={(event) => setPoForm({ ...poForm, quantity: Number(event.target.value) })} /></label>
              <label>Priority<select value={poForm.priority} onChange={(event) => setPoForm({ ...poForm, priority: event.target.value })}><option>Critical</option><option>High</option><option>Normal</option><option>Low</option></select></label>
              <label className="wide">Destination<input value={poForm.destination} onChange={(event) => setPoForm({ ...poForm, destination: event.target.value })} /></label>
              <label>Weigh Room<select value={poForm.weigh_room} onChange={(event) => setPoForm({ ...poForm, weigh_room: event.target.value })}><option>WR-01</option><option>WR-02</option></select></label>
              <label>Mix Tank<select value={poForm.mix_tank} onChange={(event) => setPoForm({ ...poForm, mix_tank: event.target.value })}><option>V-201</option><option>V-202</option></select></label>
              <label>Hold Tank<select value={poForm.hold_tank} onChange={(event) => setPoForm({ ...poForm, hold_tank: event.target.value })}><option>H-301</option><option>H-302</option></select></label>
              <label>Packaging Line<select value={poForm.packaging_line} onChange={(event) => setPoForm({ ...poForm, packaging_line: event.target.value })}><option>PKG-01</option><option>PKG-02</option></select></label>
              <label className="wide checkbox-field"><input type="checkbox" checked={poForm.requires_premix} onChange={(event) => setPoForm({ ...poForm, requires_premix: event.target.checked })} /> Dye formula requires premix</label>
              <button className="button primary wide" disabled={busy}>Register PO</button>
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
                    const substitutionCandidate = asArray<T.MaterialComparison>(
                      workspace?.comparison,
                    ).find(
                      (item) =>
                        item.status !== "Ready" &&
                        Boolean(item.recommended_lot),
                    );

                    if (!substitutionCandidate?.recommended_lot) {
                      return null;
                    }

                    return (
                      <button
                        className="button warning"
                        onClick={() =>
                          void runAction(
                            () =>
                              api.requestSubstitution(
                                activeTo.po_number,
                                substitutionCandidate.material_code,
                                substitutionCandidate.recommended_lot as string,
                              ),
                            `Office notified: request ${substitutionCandidate.recommended_lot}`,
                          )
                        }
                      >
                        Notify Office: Request {substitutionCandidate.recommended_lot}
                      </button>
                    );
                  })()}
                  {(() => {
                    const bottleShortage = asArray<T.MaterialComparison>(workspace?.comparison).find(
                      (item) => item.material_code === "BOTTLE-120" && item.status === "Shortage",
                    );
                    if (!bottleShortage) return null;
                    const maximumQuantity = Math.max(1, Math.floor(bottleShortage.available_quantity));
                    return (
                      <div className="quantity-change-panel">
                        <p className="warning-text">
                          Available bottles support up to {maximumQuantity} finished units. Request Office approval to revise the PO quantity.
                        </p>
                        <div className="form-grid compact">
                          <label>Requested finished quantity
                            <input
                              type="number"
                              min="1"
                              max={maximumQuantity}
                              placeholder={String(maximumQuantity)}
                              value={requestedProductionQuantity}
                              onChange={(event) => setRequestedProductionQuantity(event.target.value)}
                            />
                          </label>
                          <label>Reason
                            <input
                              value={resourceChangeReason}
                              onChange={(event) => setResourceChangeReason(event.target.value)}
                            />
                          </label>
                        </div>
                        <button
                          className="button warning"
                          disabled={!requestedProductionQuantity || Number(requestedProductionQuantity) <= 0 || Number(requestedProductionQuantity) > maximumQuantity}
                          onClick={() =>
                            void runAction(
                              () => api.requestRouteChange({
                                po_number: activeTo.po_number,
                                resource_type: "production_quantity",
                                current_resource: String(workspace?.production_order.quantity ?? ""),
                                requested_resource: requestedProductionQuantity,
                                reason: resourceChangeReason || `Packaging material shortage; revise quantity to ${requestedProductionQuantity}`,
                                requester: "Warehouse",
                              }),
                              "Quantity revision request sent to Office",
                            )
                          }
                        >
                          Request Different Quantity
                        </button>
                      </div>
                    );
                  })()}
                </>
              ) : <p className="empty-state">Select a transfer order.</p>}
            </div>
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
            {cartAlreadyBent ? (
              <span className="status-note">Cart already bent into {selectedRoom} for {selectedRoomAsset?.active_po}</span>
            ) : (
              <button className="button secondary" onClick={() => void runAction(bendIntoSelectedRoom, `Cart bent into ${selectedRoom}`)}>Bend Into {selectedRoom}</button>
            )}
            <button className="button primary" onClick={() => void runAction(openWeighTicket, "Electronic weigh ticket opened")}>Open Ticket for {selectedRoomAsset?.active_po ?? "Bent-In PO"}</button>
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
            {weighWorkspace ? (
              <div className="weigh-hmi">
                <div className="hmi-header"><div><span>Ticket</span><strong>{weighWorkspace.ticket.ticket_number}</strong></div><div><span>Status</span><strong>{weighWorkspace.ticket.status}</strong></div></div>
                <progress max="100" value={weighWorkspace.completion_percent} />
                <p>{weighWorkspace.completion_percent}% complete</p>
                {weighWorkspace.current_line ? (
                  <>
                    <h3>{weighWorkspace.current_line.material_name}</h3>
                    <div className="detail-list">
                      <div><span>Material</span><strong>{weighWorkspace.current_line.material_code}</strong></div>
                      <div><span>Lot</span><strong>{weighWorkspace.current_line.lot_number}</strong></div>
                      <div><span>Target</span><strong>{weighWorkspace.current_line.target_quantity} {weighWorkspace.current_line.unit}</strong></div>
                      <div><span>Tolerance</span><strong>±{weighWorkspace.current_line.tolerance}%</strong></div>
                      <div><span>Tare</span><strong>{weighWorkspace.ticket.tare_confirmed ? "Confirmed" : "Required"}</strong></div>
                      <div><span>Barcode</span><strong>{weighWorkspace.current_line.barcode_verified ? "Verified" : "Required"}</strong></div>
                    </div>
                    <div className="hmi-controls">
                      <button className="button primary" onClick={() => void runWeighAction(() => api.tareWeighTicket(weighWorkspace.ticket.ticket_number, weighOperator), "Scale tare confirmed")}>Tare Scale</button>
                      <label>Barcode<input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder={`${weighWorkspace.current_line.material_code} or ${weighWorkspace.current_line.lot_number}`} /></label>
                      <button className="button secondary" onClick={() => void runWeighAction(() => api.verifyWeighBarcode(weighWorkspace.ticket.ticket_number, barcode.trim() || weighWorkspace.current_line!.lot_number), "Barcode verified")}>Scan / Verify Barcode</button>
                      <label>Actual Weight<input type="number" step="0.001" value={actualWeight} placeholder="Enter weight" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setActualWeight(event.target.value)} /></label>
                      <button className="button primary" disabled={actualWeight.trim() === ""} onClick={() => void runWeighAction(() => api.weighMaterial(weighWorkspace.ticket.ticket_number, Number(actualWeight), weighOperator), "Material dispensed within tolerance", { clearBarcode: true, clearWeight: true })}>Record Weight</button>
                    </div>
                  </>
                ) : (
                  <div className="signature-panel"><p>All material lines are complete.</p><label>Electronic Signature<input value={signature} onChange={(event) => setSignature(event.target.value)} /></label><button className="button primary" onClick={() => void runWeighAction(() => api.signWeighTicket(weighWorkspace.ticket.ticket_number, signature), "Weigh ticket signed and released to Mixing")}>Sign & Complete Ticket</button></div>
                )}
              </div>
            ) : <p className="empty-state">Open or select a weigh ticket to display the scale HMI.</p>}
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderMixingZone() {
    const batch = mixWorkspace?.batch;
    const premix = mixWorkspace?.premix;
    const scheduledHold = productionOrders.find((po) => po.po_number === batch?.po_number)?.hold_tank;
    const bulkProductionOrder = productionOrders.find((po) => po.po_number === bulkPo);
    const bulkMaterial = bulkProductionOrder?.bulk_material ?? "Propylene Glycol";
    const bulkRecipe = bulkRecipeByMaterial[bulkMaterial] ?? bulkRecipeByMaterial["Propylene Glycol"];
    const bulkSourceTank = bulkTanks.find((tank) => tank.tank_code === bulkRecipe.tankCode);

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
            <button className="button primary" onClick={() => void runAction(openMixBatch, "Mix batch opened from the completed weighing queue")}>Open Scheduled Batch</button>
          </div>
          {(batch || mixQueue[0]) && (() => {
            const po = productionOrders.find((item) => item.po_number === (batch?.po_number ?? mixQueue[0]?.po_number));
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
                <article className="mix-queue-card" key={po.id}>
                  <div><strong>{po.po_number}</strong><span>Ready</span></div>
                  <p>{po.product_name}</p>
                  <small>{po.batch_number} · {po.mix_tank} → {po.hold_tank}</small>
                  <small>{po.bulk_material} bulk · {po.requires_premix ? "Dye premix required" : "No dye premix"}</small>
                </article>
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
                  <article><span>Agitator</span><strong>{batch.rpm} RPM</strong></article>
                </div>

                {batch.fault_code && (
                  <div className="fault-banner">
                    <div><strong>{batch.fault_code}</strong><span>PLC FAULT</span></div>
                    <p>{batch.fault_message}</p>
                    <small>{batch.fault_diagnosed ? "Fault diagnosed — reset permitted" : "Diagnose the failed interlock before reset"}</small>
                    <div className="button-row">
                      <button className="button secondary" onClick={() => void runMixAction(() => api.diagnoseMixFault(batch.batch_id), "Fault diagnosed")}>Diagnose</button>
                      <button className="button primary" onClick={() => void runMixAction(() => api.resetMixFault(batch.batch_id), "PLC reset; sequence resumed")}>Reset PLC</button>
                    </div>
                  </div>
                )}

                <div className="recipe-steps">
                  {["Bulk Water Addition", "Bulk Excipient Verification", "Bulk Excipient Charge", "Bulk Excipient Confirmation", "Manual Additions", "Premix Required", "Final Agitation", "Select Hold Tank", "Transfer", "Transfer Complete"].map((step) => (
                    <span key={step} className={batch.phase === step || (step === "Transfer" && batch.phase === "Transfer Sample Required") ? "active" : ""}>{step}</span>
                  ))}
                </div>

                <div className="hmi-controls mix-controls">
                  {batch.status === "Ready" && <button className="button primary" onClick={() => void runMixAction(() => api.mixAction(batch.batch_id, "start", mixOperator), "Automatic batch sequence started")}>Start Batch</button>}
                  {batch.phase === "Bulk Excipient Verification" && <p className="interlock-note">Create and verify the PO-selected bulk excipient charge above. Manual additions remain interlocked.</p>}
                  {batch.phase === "Bulk Excipient Confirmation" && (
                    <button className="button primary" onClick={() => void runMixAction(() => api.confirmBulkPg(batch.batch_id, mixOperator), "Bulk excipient addition confirmed; manual additions released")}>Confirm Bulk Excipient Addition</button>
                  )}
                  {batch.phase === "Manual Additions" && <button className="button primary" onClick={() => void runMixAction(() => api.mixAction(batch.batch_id, "confirm-manual-adds", mixOperator), "Manual additions confirmed")}>Confirm Manual Adds Complete</button>}
                  {batch.phase === "Premix Required" && premix?.status !== "Complete" && <button className="button secondary" onClick={() => void runMixAction(() => api.startPremix(batch.batch_id, mixOperator), "Premix automatic sequence started")}>Start Premix</button>}
                  {batch.phase === "Premix Required" && <button className="button primary" onClick={() => void runMixAction(() => api.confirmPremix(batch.batch_id, mixOperator), "Premix confirmed and charged")}>Confirm Premix Complete</button>}
                  {batch.status === "Ready for Transfer" && <button className="button primary" onClick={() => void runMixAction(() => api.mixAction(batch.batch_id, "start-transfer", mixOperator), "Automatic transfer started")}>Start Automatic Transfer</button>}
                  {batch.status === "Sample Hold" && <button className="button primary" onClick={() => void runMixAction(() => api.mixAction(batch.batch_id, "collect-sample", mixOperator), "LIMS transfer sample collected")}>Collect Transfer Sample</button>}
                  {batch.status === "Awaiting Termination" && <button className="button primary" onClick={() => void runMixAction(() => api.terminateMixBatch(batch.batch_id, mixOperator), "Batch terminated; hold tank placed on QA Hold")}>Terminate Batch</button>}
                </div>

                {premix && (
                  <div className="premix-panel">
                    <div><strong>Premix Skid</strong><span>{premix.status}</span></div>
                    <progress max="100" value={premix.progress} />
                    <p>{premix.progress}% recipe progress · {premix.level_percent.toFixed(1)}% vessel level · {premix.rpm} RPM</p>
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
    await runAction(() => api.shipmentAction(shipmentId, action, { operator: "Warehouse Operator", seal_number: sealNumber, signature: "Warehouse Supervisor" }), `Shipment ${action} completed`);
    await refresh();
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
    const routePo = productionOrders.find((po) => po.po_number === (run?.po_number ?? packagingQueue[0]?.po_number));
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
            <button className="button primary" onClick={() => void runAction(openPackagingRun, "Packaging run opened")}>Open Scheduled Campaign</button>
          </div>
        </SectionCard>
        <div className="zone-two-column">
          <SectionCard title="Packaging Queue" eyebrow="QA-Released Bulk">
            <div className="queue-list">
              {packagingQueue.map((po) => <article key={po.id} className="queue-item"><div><strong>{po.po_number}</strong><span>{po.packaging_line}</span></div><p>{po.product_name}</p><small>{po.batch_number} · {po.quantity} bottles</small></article>)}
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

  function renderRndZone() {
    const developmentOrders = productionOrders.slice(0, 6);
    const linkedEvents = events.filter((event) => /formula|trial|sample|change|development|scale/i.test(`${event.event_type} ${event.message}`)).slice(0, 8);

    return (
      <div className="zone-stack">
        <section className="zone-hero">
          <div>
            <p className="eyebrow">Research, Pilot & Scale-Up</p>
            <h1>Research & Development Laboratory</h1>
            <p>Manage formulation evidence, pilot-batch readiness, experimental material requests, and controlled handoff into commercial production.</p>
          </div>
          <div className="hero-status-grid">
            <article><span>Linked Programs</span><strong>{developmentOrders.length}</strong></article>
            <article><span>Open Evidence</span><strong>{linkedEvents.length}</strong></article>
            <article><span>Scale-Up Ready</span><strong>{developmentOrders.filter((po) => /qa|packag|ship|closed/i.test(po.status)).length}</strong></article>
          </div>
        </section>

        <div className="zone-two-column">
          <SectionCard title="Formulation & Pilot Portfolio" eyebrow="Development Programs">
            <div className="approval-list">
              {developmentOrders.map((po) => (
                <article key={po.id} className="approval-card">
                  <div><strong>{po.product_name}</strong><span>{po.status}</span></div>
                  <p>{po.po_number} · {po.batch_number}</p>
                  <small>Route: {po.weigh_room} → {po.mix_tank} → {po.hold_tank} → {po.packaging_line}</small>
                </article>
              ))}
              {!developmentOrders.length && <p className="empty-state">No formulation or pilot programs are linked yet.</p>}
            </div>
          </SectionCard>

          <SectionCard title="Scale-Up Readiness" eyebrow="Controlled Handoff">
            <div className="planned-checklist">
              <span>Formulation and material rationale</span>
              <span>Pilot-batch evidence and sample linkage</span>
              <span>Critical process parameter recommendations</span>
              <span>Change-control and production handoff notes</span>
            </div>
            <p className="subtext">R&D remains separate from QA: R&D develops and recommends; QA independently reviews and releases.</p>
          </SectionCard>
        </div>

        <SectionCard title="Development Evidence Timeline" eyebrow="Samples, Trials & Change Recommendations">
          <div className="approval-list">
            {linkedEvents.map((event) => (
              <article key={event.id} className="approval-card">
                <div><strong>{event.event_type}</strong><span>{event.source}</span></div>
                <p>{event.message}</p>
                <small>{event.entity_id || "Enterprise"} · {new Date(event.created_at).toLocaleString()}</small>
              </article>
            ))}
            {!linkedEvents.length && <p className="empty-state">Development evidence will appear as trials, samples, and change recommendations are recorded.</p>}
          </div>
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
    await runAction(async () => { setEbrDetail(await api.ebrDetail(poNumber)); }, `Loaded electronic batch record ${poNumber}`);
  }

  async function submitBatchReview(poNumber: string, decision: string) {
    await runAction(() => api.decideBatchReview(poNumber, { decision, reviewer, signature: reviewSignature, note: reviewNote }), `Batch review ${decision.toLowerCase()} recorded`);
  }

  function renderComplianceZone() {
    const filtered = ebrBatches.filter(x => !ebrSearch || `${x.po_number} ${x.batch_number} ${x.product_name}`.toLowerCase().includes(ebrSearch.toLowerCase()));
    return <div className="zone-stack">
      <div className="zone-summary-grid"><article><span>Batch Records</span><strong>{ebrBatches.length}</strong></article><article><span>Pending Reviews</span><strong>{batchReviews.filter(x => x.status === "Pending Review").length}</strong></article><article><span>Exceptions</span><strong>{ebrBatches.reduce((n, x) => n + x.exception_count, 0)}</strong></article><article><span>Audit Entries</span><strong>{auditTrail.length}</strong></article></div>
      <SectionCard title="Electronic Batch Record" eyebrow="Searchable Batch Genealogy"><div className="form-grid compact"><label className="wide">Search PO, Batch, Product<input value={ebrSearch} onChange={e => setEbrSearch(e.target.value)} placeholder="PO-260742 or batch number" /></label></div><div className="table-wrap"><table><thead><tr><th>PO / Batch</th><th>Product</th><th>Status</th><th>Yield</th><th>Downtime</th><th>Exceptions</th><th>Review</th><th></th></tr></thead><tbody>{filtered.map(x => <tr key={x.po_number}><td><strong>{x.po_number}</strong><small className="subtext">{x.batch_number}</small></td><td>{x.product_name}</td><td>{x.status}</td><td>{x.yield_percent}%</td><td>{x.downtime_minutes} min</td><td>{x.exception_count}</td><td>{x.review_status}</td><td><button className="button secondary" onClick={() => void loadEbrDetail(x.po_number)}>Open EBR</button></td></tr>)}</tbody></table></div></SectionCard>
      {ebrDetail && <><div className="zone-two-column"><SectionCard title={`Review by Exception · ${ebrDetail.summary.po_number}`} eyebrow="QA Batch Review"><div className="detail-list"><div><span>Batch</span><strong>{ebrDetail.summary.batch_number}</strong></div><div><span>Shipment</span><strong>{ebrDetail.summary.shipment_status}</strong></div><div><span>Exceptions</span><strong>{ebrDetail.summary.exception_count}</strong></div><div><span>Rejects</span><strong>{ebrDetail.summary.rejects}</strong></div></div><div className="form-grid compact"><label>Reviewer<input value={reviewer} onChange={e => setReviewer(e.target.value)} /></label><label>Electronic Signature<input value={reviewSignature} onChange={e => setReviewSignature(e.target.value)} /></label><label className="wide">Review Note<input value={reviewNote} onChange={e => setReviewNote(e.target.value)} /></label></div><div className="button-row"><button className="button primary" onClick={() => void submitBatchReview(ebrDetail.summary.po_number, "Approve")}>Approve Batch Record</button><button className="button secondary" onClick={() => void submitBatchReview(ebrDetail.summary.po_number, "Return")}>Return for Correction</button><button className="button secondary" onClick={() => void submitBatchReview(ebrDetail.summary.po_number, "Reject")}>Reject</button></div></SectionCard><SectionCard title="ALCOA+ Data Integrity" eyebrow="cGMP Record Controls"><div className="alcoa-grid">{Object.entries(ebrDetail.alcoa_plus).map(([key, value]) => <article key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value ? "Verified" : "Review"}</strong></article>)}</div></SectionCard></div><SectionCard title="Exceptions" eyebrow="Review by Exception"><div className="approval-list">{ebrDetail.exceptions.map((x, i) => <article key={`${x.source}-${i}`} className="approval-card"><div><strong>{x.category}</strong><span>{x.status}</span></div><p>{x.description}</p><small>{x.source} · {x.severity}</small></article>)}{!ebrDetail.exceptions.length && <p className="empty-state">No exceptions recorded for this batch.</p>}</div></SectionCard><SectionCard title="Chronological Electronic Batch Record" eyebrow="Attributable, Contemporaneous Event History"><div className="timeline-list">{ebrDetail.timeline.map(e => <article key={e.id}><span>{formatDate(e.created_at)}</span><div><strong>{e.source} · {e.event_type}</strong><p>{e.message}</p></div></article>)}</div></SectionCard><SectionCard title="Audit Trail" eyebrow="Before / After · Reason · Actor · Signature"><div className="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Before</th><th>After</th><th>Reason</th><th>Actor</th></tr></thead><tbody>{ebrDetail.audit_trail.map(a => <tr key={a.id}><td>{formatDate(a.created_at)}</td><td>{a.action}</td><td>{a.before_value ?? "—"}</td><td>{a.after_value ?? "—"}</td><td>{a.reason}</td><td>{a.actor}</td></tr>)}</tbody></table></div></SectionCard></>}
    </div>;
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
        <div className="lifecycle-track">{["Office", "Warehouse", "Weigh", "Premix", "Mix", "Hold", "QA", "Packaging", "FG QA", "Shipping", "Closed"].map((stage, index) => <article key={stage} className={index <= Math.min(10, Math.floor((replayIndex / Math.max(1, replayEvents.length - 1)) * 10)) ? "complete" : "pending"}><span>{index + 1}</span><strong>{stage}</strong></article>)}</div>
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
