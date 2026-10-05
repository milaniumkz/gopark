import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import * as XLSX from "xlsx";
import type { DriverCreditWriteoffResult, DriverListItem, ManagerIncidentItem, OutboxEventItem, VehicleListItem } from "@gopark/contracts";
import { postJson } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { StatCard } from "../ui/StatCard";
import { DriversIcon, FinanceIcon, IncidentIcon, ReportsIcon } from "../ui/CrmIcons";
import { formatCurrency, formatDateOnly } from "../lib/utils";

type SupportedImportType =
  | "accident"
  | "repair"
  | "fine"
  | "inspection"
  | "blacklist"
  | "writeoff"
  | "insurance_gps";

type IncidentImportInput = {
  title: string;
  incidentType: string;
  status: string;
  priority: string;
  driverId?: string | null;
  carId?: string | null;
  occurredAt?: string | null;
  periodLabel?: string | null;
  referenceNumber?: string | null;
  amount?: number | null;
  insuranceCompensationAmount?: number | null;
  writeoffAmount?: number | null;
  description?: string | null;
  insuranceNote?: string | null;
  repairNote?: string | null;
  locationNote?: string | null;
  managerLabel?: string | null;
};

type ParsedImportRecord = {
  sourceType: SupportedImportType;
  summary: string;
  mode: "incident" | "writeoff";
  payload: IncidentImportInput | { driverId: string; amount: number; reason?: string };
  duplicateKey: string;
  isDuplicate?: boolean;
};

type ImportReport = {
  fileName: string;
  importType: SupportedImportType;
  detectedRows: number;
  importedRows: number;
  duplicateRows: number;
  unresolvedDriverRows: number;
  unresolvedCarRows: number;
  unresolvedSamples: string[];
  finishedAt: string;
};

function isIncidentImportRow(
  row: ParsedImportRecord,
): row is ParsedImportRecord & { mode: "incident"; payload: IncidentImportInput } {
  return row.mode === "incident";
}

function isWriteoffImportRow(
  row: ParsedImportRecord,
): row is ParsedImportRecord & { mode: "writeoff"; payload: { driverId: string; amount: number; reason?: string } } {
  return row.mode === "writeoff";
}

function normalizePlate(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9А-ЯЁ]/g, "");
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s\r\n\t.,/\\\-"'`’()]+/g, " ")
    .trim();
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).replace(/\s+/g, " ").trim();
  return text ? text : null;
}

function excelDateToIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const isoCandidate = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoCandidate) {
      return text;
    }
    const ruCandidate = text.match(/^(\d{2})\.(\d{2})\.(\d{2,4})/);
    if (ruCandidate) {
      const year = ruCandidate[3].length === 2 ? `20${ruCandidate[3]}` : ruCandidate[3];
      return `${year}-${ruCandidate[2]}-${ruCandidate[1]}`;
    }
  }
  return null;
}

function parseMoneyLoose(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, "").replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMoneySummary(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  if (!/сом|итого/i.test(value)) {
    return null;
  }
  return parseMoneyLoose(value);
}

function detectImportType(fileName: string): SupportedImportType | null {
  const normalized = fileName.toLowerCase();
  if (normalized.includes("дтп")) return "accident";
  if (normalized.includes("сто")) return "repair";
  if (normalized.includes("штраф")) return "fine";
  if (normalized.includes("осмотр")) return "inspection";
  if (normalized.includes("черн")) return "blacklist";
  if (normalized.includes("спис")) return "writeoff";
  if (normalized.includes("жпс") || normalized.includes("gps") || normalized.includes("страх")) return "insurance_gps";
  return null;
}

function getImportTypeLabel(type: SupportedImportType): string {
  switch (type) {
    case "accident":
      return "ДТП";
    case "repair":
      return "СТО";
    case "fine":
      return "Штрафы";
    case "inspection":
      return "Осмотр";
    case "blacklist":
      return "Чёрный список";
    case "writeoff":
      return "Списания";
    case "insurance_gps":
      return "Страховка и ТО";
  }
}

function buildIncidentDuplicateKey(payload: IncidentImportInput): string {
  return JSON.stringify([
    payload.incidentType,
    payload.title,
    payload.driverId ?? "",
    payload.carId ?? "",
    payload.periodLabel ?? "",
    payload.occurredAt ?? "",
    payload.amount ?? "",
  ]);
}

function buildWriteoffDuplicateKey(driverId: string, amount: number, reason: string): string {
  return JSON.stringify(["writeoff", driverId, amount, reason.trim()]);
}

function readSheetRows(file: File): Promise<unknown[][]> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }) as unknown[][];
  });
}

function makeDriverMap(drivers: DriverListItem[]): Map<string, DriverListItem> {
  return new Map(drivers.map((item) => [normalizeName(item.fullName), item]));
}

function makeCarMap(cars: VehicleListItem[]): Map<string, VehicleListItem> {
  return new Map(cars.map((item) => [normalizePlate(item.plateNumber), item]));
}

function resolveDriverId(
  driverName: string | null,
  fallbackDriverId: string | null,
  driverMap: Map<string, DriverListItem>,
): string | null {
  const matchedDriver = driverName ? driverMap.get(normalizeName(driverName)) : null;
  return matchedDriver?.id ?? fallbackDriverId;
}

function parseAccidentRows(
  rows: unknown[][],
  driverMap: Map<string, DriverListItem>,
  carMap: Map<string, VehicleListItem>,
): ParsedImportRecord[] {
  return rows.slice(1).flatMap((row) => {
    const plate = toNullableString(row[1]);
    const driverName = toNullableString(row[2]);
    const description = toNullableString(row[3]);
    const insuranceNote = toNullableString(row[4]);
    if (!plate && !driverName && !description) {
      return [];
    }

    const car = plate ? carMap.get(normalizePlate(plate)) ?? null : null;
    const driverId = resolveDriverId(driverName, car?.assignedDriverId ?? null, driverMap);
    const title = `ДТП ${plate ?? driverName ?? "без номера"}`;
    return [
      {
        sourceType: "accident",
        summary: `${title}${driverName ? ` · ${driverName}` : ""}`,
        payload: {
          title,
          incidentType: "accident",
          status: "open",
          priority: "high",
          driverId,
          carId: car?.id ?? null,
          description,
          insuranceNote,
        },
        mode: "incident",
        duplicateKey: buildIncidentDuplicateKey({
          title,
          incidentType: "accident",
          status: "open",
          priority: "high",
          driverId,
          carId: car?.id ?? null,
          description,
          insuranceNote,
        }),
      },
    ];
  });
}

function parseRepairRows(
  rows: unknown[][],
  carMap: Map<string, VehicleListItem>,
): ParsedImportRecord[] {
  return rows.slice(1).flatMap((row) => {
    const plate = toNullableString(row[0]);
    const model = toNullableString(row[1]);
    const detail = toNullableString(row[2]);
    const insuranceNote = toNullableString(row[3]);
    const amount = parseMoneyLoose(row[4]);
    const writeoffAmount = parseMoneyLoose(row[6]);
    if (!plate && !detail && !amount) {
      return [];
    }

    const car = plate ? carMap.get(normalizePlate(plate)) ?? null : null;
    const title = `СТО ${plate ?? model ?? "без номера"}`;
    return [
      {
        sourceType: "repair",
        summary: `${title}${amount ? ` · ${formatCurrency(amount)}` : ""}`,
        payload: {
          title,
          incidentType: "repair",
          status: "open",
          priority: "medium",
          driverId: car?.assignedDriverId ?? null,
          carId: car?.id ?? null,
          description: detail,
          insuranceNote,
          amount,
          writeoffAmount,
          repairNote: model,
        },
        mode: "incident",
        duplicateKey: buildIncidentDuplicateKey({
          title,
          incidentType: "repair",
          status: "open",
          priority: "medium",
          driverId: car?.assignedDriverId ?? null,
          carId: car?.id ?? null,
          description: detail,
          insuranceNote,
          amount,
          writeoffAmount,
          repairNote: model,
        }),
      },
    ];
  });
}

function parseFineRows(
  rows: unknown[][],
  carMap: Map<string, VehicleListItem>,
): ParsedImportRecord[] {
  const plateRow = rows[1] ?? [];
  const dataRows = rows.slice(2);
  const parsed: ParsedImportRecord[] = [];

  for (let columnIndex = 0; columnIndex < plateRow.length; columnIndex += 1) {
    const plate = toNullableString(plateRow[columnIndex]);
    if (!plate) {
      continue;
    }

    const refs: string[] = [];
    let amount: number | null = null;
    for (const row of dataRows) {
      const cell = row[columnIndex];
      const text = toNullableString(cell);
      if (!text) {
        continue;
      }
      const totalCandidate = parseMoneySummary(text);
      if (totalCandidate !== null) {
        amount = totalCandidate;
      } else if (!/итого/i.test(text)) {
        refs.push(text);
      }
    }

    const car = carMap.get(normalizePlate(plate)) ?? null;
    parsed.push({
      sourceType: "fine",
      summary: `Штрафы ${plate}${amount ? ` · ${formatCurrency(amount)}` : ""}`,
      payload: {
        title: `Штрафы ${plate}`,
        incidentType: "fine",
        status: "open",
        priority: "medium",
        driverId: car?.assignedDriverId ?? null,
        carId: car?.id ?? null,
        amount,
        referenceNumber: refs.slice(0, 5).join(", "),
        description: refs.join(", "),
      },
      mode: "incident",
      duplicateKey: buildIncidentDuplicateKey({
        title: `Штрафы ${plate}`,
        incidentType: "fine",
        status: "open",
        priority: "medium",
        driverId: car?.assignedDriverId ?? null,
        carId: car?.id ?? null,
        amount,
        referenceNumber: refs.slice(0, 5).join(", "),
        description: refs.join(", "),
      }),
    });
  }

  return parsed;
}

function parseMatrixRows(
  rows: unknown[][],
  type: "inspection" | "insurance_gps",
  driverMap: Map<string, DriverListItem>,
  carMap: Map<string, VehicleListItem>,
): ParsedImportRecord[] {
  const headerRow = rows[1] ?? [];
  let currentManager = "";
  const parsed: ParsedImportRecord[] = [];

  for (const row of rows.slice(2)) {
    const rowLabel = toNullableString(row[0]);
    const hasEntityData = row.slice(1, 6).some((value) => value !== null && value !== "");

    if (rowLabel && !hasEntityData) {
      currentManager = rowLabel;
      continue;
    }

    const model = toNullableString(row[1]);
    const plate = toNullableString(row[2]);
    const vin = toNullableString(row[3]);
    const driverName = toNullableString(row[5]);
    if (!plate && !driverName) {
      continue;
    }

    const car = plate ? carMap.get(normalizePlate(plate)) ?? null : null;
    const driverId = resolveDriverId(driverName, car?.assignedDriverId ?? null, driverMap);

    for (let columnIndex = 6; columnIndex < row.length; columnIndex += 1) {
      const cell = row[columnIndex];
      if (cell === null || cell === "") {
        continue;
      }

      const periodLabel = toNullableString(headerRow[columnIndex]) ?? `Период ${columnIndex - 5}`;
      const occurredAt = excelDateToIso(cell);
      const amount = type === "insurance_gps" ? parseMoneyLoose(cell) : null;
      const locationNote =
        type === "insurance_gps" && typeof cell === "string" ? toNullableString(cell) : null;
      const title = `${type === "inspection" ? "Осмотр" : "Страховка и ТО"} ${plate ?? driverName ?? "без номера"} · ${periodLabel}`;

      parsed.push({
        sourceType: type,
        summary: `${title}${amount ? ` · ${formatCurrency(amount)}` : ""}`,
        payload: {
          title,
          incidentType: type,
          status: "open",
          priority: type === "inspection" ? "low" : "medium",
          driverId,
          carId: car?.id ?? null,
          occurredAt,
          periodLabel,
          amount,
          description: [model, vin].filter(Boolean).join(" · ") || null,
          locationNote,
          managerLabel: currentManager || null,
        },
        mode: "incident",
        duplicateKey: buildIncidentDuplicateKey({
          title,
          incidentType: type,
          status: "open",
          priority: type === "inspection" ? "low" : "medium",
          driverId,
          carId: car?.id ?? null,
          occurredAt,
          periodLabel,
          amount,
          description: [model, vin].filter(Boolean).join(" · ") || null,
          locationNote,
          managerLabel: currentManager || null,
        }),
      });
    }
  }

  return parsed;
}

function parseBlacklistRows(
  rows: unknown[][],
  driverMap: Map<string, DriverListItem>,
): ParsedImportRecord[] {
  return rows.slice(1).flatMap((row) => {
    const driverName = toNullableString(row[1]);
    const occurredAt = excelDateToIso(row[2]);
    const description = toNullableString(row[3]);
    if (!driverName) {
      return [];
    }

    const driver = driverMap.get(normalizeName(driverName)) ?? null;
    const title = `Чёрный список ${driverName}`;
    return [
      {
        sourceType: "blacklist",
        summary: `${title}${occurredAt ? ` · ${formatDateOnly(occurredAt)}` : ""}`,
        payload: {
          title,
          incidentType: "blacklist",
          status: "open",
          priority: "high",
          driverId: driver?.id ?? null,
          occurredAt,
          description,
        },
        mode: "incident",
        duplicateKey: buildIncidentDuplicateKey({
          title,
          incidentType: "blacklist",
          status: "open",
          priority: "high",
          driverId: driver?.id ?? null,
          occurredAt,
          description,
        }),
      },
    ];
  });
}

function parseWriteoffRows(
  rows: unknown[][],
  carMap: Map<string, VehicleListItem>,
): ParsedImportRecord[] {
  return rows.slice(1).flatMap((row) => {
    const plate = toNullableString(row[0]);
    const occurredAt = excelDateToIso(row[1]);
    const amount = parseMoneyLoose(row[2]);
    if (!plate || amount === null) {
      return [];
    }

    const car = carMap.get(normalizePlate(plate)) ?? null;
    if (!car?.assignedDriverId) {
      return [];
    }

    const reason = `Импорт Excel Списание${occurredAt ? ` ${occurredAt}` : ""} · ${plate}`;
    return [
      {
        sourceType: "writeoff",
        summary: `Списание ${plate} · ${formatCurrency(amount)}`,
        mode: "writeoff",
        payload: {
          driverId: car.assignedDriverId,
          amount,
          reason,
        },
        duplicateKey: buildWriteoffDuplicateKey(car.assignedDriverId, amount, reason),
      },
    ];
  });
}

function markDuplicates(
  rows: ParsedImportRecord[],
  incidents: ManagerIncidentItem[],
  outboxEvents: OutboxEventItem[],
): ParsedImportRecord[] {
  const existingIncidentKeys = new Set(
    incidents.map((item) =>
      buildIncidentDuplicateKey({
        title: item.title,
        incidentType: item.incidentType ?? "general",
        status: item.status,
        priority: item.priority,
        driverId: item.driverId ?? null,
        carId: item.carId ?? null,
        occurredAt: item.occurredAt ?? null,
        periodLabel: item.periodLabel ?? null,
        amount: item.amount ?? null,
      }),
    ),
  );
  const existingWriteoffKeys = new Set(
    outboxEvents
      .filter((item) => item.topic === "driver.credit.written_off")
      .map((item) =>
        buildWriteoffDuplicateKey(
          typeof item.payload.driverId === "string" ? item.payload.driverId : item.aggregateId,
          typeof item.payload.amount === "number" ? item.payload.amount : Number(item.payload.amount ?? 0),
          typeof item.payload.reason === "string" ? item.payload.reason : "",
        ),
      ),
  );
  const seen = new Set<string>();

  return rows.map((row) => {
    const alreadyExists =
      row.mode === "incident" ? existingIncidentKeys.has(row.duplicateKey) : existingWriteoffKeys.has(row.duplicateKey);
    const duplicatedInsideFile = seen.has(row.duplicateKey);
    seen.add(row.duplicateKey);
    return {
      ...row,
      isDuplicate: alreadyExists || duplicatedInsideFile,
    };
  });
}

export function ImportsPage() {
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const carsApi = useApiQuery<VehicleListItem[]>("cars");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const outboxApi = useApiQuery<OutboxEventItem[]>("outbox");
  const [fileName, setFileName] = useState<string | null>(null);
  const [detectedType, setDetectedType] = useState<SupportedImportType | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedImportRecord[]>([]);
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [previewFilter, setPreviewFilter] = useState<"all" | "duplicates" | "unresolved_driver" | "unresolved_car">("all");

  const driverMap = useMemo(() => makeDriverMap(driversApi.data ?? []), [driversApi.data]);
  const carMap = useMemo(() => makeCarMap(carsApi.data ?? []), [carsApi.data]);
  const linkedDrivers = previewRows.filter((item) => item.payload.driverId).length;
  const linkedCars = previewRows.filter((item) => isIncidentImportRow(item) && item.payload.carId).length;
  const duplicateCount = previewRows.filter((item) => item.isDuplicate).length;
  const unresolvedDriverCount = previewRows.filter((item) => !item.payload.driverId).length;
  const unresolvedCarCount = previewRows.filter((item) => isIncidentImportRow(item) && !item.payload.carId).length;
  const totalAmount = previewRows.reduce((sum, item) => sum + ("amount" in item.payload ? item.payload.amount ?? 0 : 0), 0);
  const visiblePreviewRows = previewRows.filter((row) => {
    if (previewFilter === "duplicates") {
      return row.isDuplicate;
    }
    if (previewFilter === "unresolved_driver") {
      return !row.payload.driverId;
    }
    if (previewFilter === "unresolved_car") {
      return isIncidentImportRow(row) && !row.payload.carId;
    }

    return true;
  });
  const importableRowIndexes = previewRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.isDuplicate)
    .map(({ index }) => index);
  const selectedRows = selectedRowIndexes.map((index) => previewRows[index]).filter(Boolean);
  const selectedImportableCount = selectedRows.filter((row) => !row.isDuplicate).length;

  function selectImportableRows(): void {
    setSelectedRowIndexes(importableRowIndexes);
  }

  function clearSelectedRows(): void {
    setSelectedRowIndexes([]);
  }

  function toggleRowSelection(index: number): void {
    setSelectedRowIndexes((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    setMessage(null);
    if (!file) {
      setFileName(null);
      setDetectedType(null);
      setPreviewRows([]);
      setSelectedRowIndexes([]);
      setReport(null);
      return;
    }

    const importType = detectImportType(file.name);
    if (!importType) {
      setFileName(file.name);
      setDetectedType(null);
      setPreviewRows([]);
      setSelectedRowIndexes([]);
      setReport(null);
      setMessage("Файл не распознан. Сейчас поддержаны: ДТП, СТО, Штрафы, Осмотр, Чёрный список, Страховка и ТО.");
      return;
    }

    try {
      const rows = await readSheetRows(file);
      let parsed: ParsedImportRecord[] = [];
      if (importType === "accident") {
        parsed = parseAccidentRows(rows, driverMap, carMap);
      } else if (importType === "repair") {
        parsed = parseRepairRows(rows, carMap);
      } else if (importType === "fine") {
        parsed = parseFineRows(rows, carMap);
      } else if (importType === "inspection") {
        parsed = parseMatrixRows(rows, "inspection", driverMap, carMap);
      } else if (importType === "blacklist") {
        parsed = parseBlacklistRows(rows, driverMap);
      } else if (importType === "writeoff") {
        parsed = parseWriteoffRows(rows, carMap);
      } else if (importType === "insurance_gps") {
        parsed = parseMatrixRows(rows, "insurance_gps", driverMap, carMap);
      }
      parsed = markDuplicates(parsed, incidentsApi.data ?? [], outboxApi.data ?? []);

      setFileName(file.name);
      setDetectedType(importType);
      setPreviewRows(parsed);
      setSelectedRowIndexes(
        parsed
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => !row.isDuplicate)
          .map(({ index }) => index),
      );
      setReport(null);
      setMessage(parsed.length ? `Распознано ${parsed.length} строк для импорта, дублей: ${parsed.filter((item) => item.isDuplicate).length}.` : "Подходящих строк для импорта не найдено.");
    } catch (error) {
      setFileName(file.name);
      setDetectedType(importType);
      setPreviewRows([]);
      setSelectedRowIndexes([]);
      setReport(null);
      setMessage(error instanceof Error ? error.message : "Не удалось разобрать файл.");
    }
  }

  async function handleImport(): Promise<void> {
    if (!selectedRows.length) {
      return;
    }

    setImporting(true);
    setMessage("Импорт запускается...");
    setReport(null);
    let success = 0;
    const rowsToImport = selectedRows.filter((row) => !row.isDuplicate);
    const unresolvedSamples = rowsToImport
      .filter((row) => !row.payload.driverId || (isIncidentImportRow(row) && !row.payload.carId))
      .slice(0, 5)
      .map((row) => row.summary);

    try {
      for (const row of rowsToImport) {
        if (isIncidentImportRow(row)) {
          await postJson<ManagerIncidentItem, IncidentImportInput>("incidents", row.payload);
        } else if (isWriteoffImportRow(row)) {
          await postJson<DriverCreditWriteoffResult, { driverId: string; amount: number; reason?: string }>(
            "payments/credit-writeoff",
            row.payload,
          );
        }
        success += 1;
        setMessage(`Импортировано ${success} из ${rowsToImport.length} выбранных строк...`);
      }

      const nextReport: ImportReport = {
        fileName: fileName ?? "Без имени",
        importType: detectedType ?? "accident",
        detectedRows: rowsToImport.length,
        importedRows: success,
        duplicateRows: selectedRows.filter((item) => item.isDuplicate).length,
        unresolvedDriverRows: rowsToImport.filter((item) => !item.payload.driverId).length,
        unresolvedCarRows: rowsToImport.filter((item) => isIncidentImportRow(item) && !item.payload.carId).length,
        unresolvedSamples,
        finishedAt: new Date().toISOString(),
      };

      setReport(nextReport);
      setMessage(`Импорт завершён: ${success} выбранных строк загружено в CRM, пропущено дублей: ${nextReport.duplicateRows}.`);
      setPreviewRows([]);
      setSelectedRowIndexes([]);
      setFileName(null);
      setDetectedType(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Импорт остановлен на строке ${success + 1}: ${error.message}`
          : `Импорт остановлен на строке ${success + 1}.`,
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="page-stack imports-page">
      <div className="hero-card">
        <p className="eyebrow">Импорт Excel</p>
        <h2>Загрузка ручных файлов в CRM</h2>
        <p>Пакетный перенос действующих Excel-таблиц в CRM без ручного переписывания строк. Сейчас поддержаны operational-файлы по ДТП, СТО, штрафам, осмотру, чёрному списку и страховке/GPS.</p>
        <div className="file-picker">
          <label className="file-picker__button">
            Выбрать файл
            <input type="file" accept=".xlsx,.xls" onChange={(event) => void handleFileSelect(event)} />
          </label>
          <span>{fileName ?? "Файл не выбран"}</span>
        </div>
        {message ? <div className="panel-note">{message}</div> : null}
      </div>

      <div className="stats-grid">
        <StatCard
          title="Распознано строк"
          value={String(previewRows.length)}
          subtitle={detectedType ? getImportTypeLabel(detectedType) : "Ожидает файл"}
          tone="blue"
          icon={<IncidentIcon width={18} height={18} />}
          onClick={() => setPreviewFilter("all")}
        />
        <StatCard
          title="Связано с водителем"
          value={String(linkedDrivers)}
          subtitle="Совпадение по ФИО или привязанному авто"
          tone="green"
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => setPreviewFilter("all")}
        />
        <StatCard
          title="Связано с авто"
          value={String(linkedCars)}
          subtitle="Совпадение по гос. номеру"
          tone="purple"
          icon={<ReportsIcon width={18} height={18} />}
          onClick={() => setPreviewFilter("all")}
        />
        <StatCard
          title="Дубли"
          value={String(duplicateCount)}
          subtitle="Будут пропущены при импорте"
          tone={duplicateCount ? "orange" : "green"}
          icon={<IncidentIcon width={18} height={18} />}
          onClick={() => setPreviewFilter("duplicates")}
        />
        <StatCard
          title="Без водителя"
          value={String(unresolvedDriverCount)}
          subtitle="Не удалось связать по ФИО/привязке"
          tone={unresolvedDriverCount ? "orange" : "green"}
          icon={<DriversIcon width={18} height={18} />}
          onClick={() => setPreviewFilter("unresolved_driver")}
        />
        <StatCard
          title="Без авто"
          value={String(unresolvedCarCount)}
          subtitle="Не удалось связать по гос. номеру"
          tone={unresolvedCarCount ? "orange" : "green"}
          icon={<ReportsIcon width={18} height={18} />}
          onClick={() => setPreviewFilter("unresolved_car")}
        />
        <StatCard
          title="Сумма"
          value={formatCurrency(totalAmount)}
          subtitle="Если в файле есть денежные поля"
          tone="orange"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => setPreviewFilter("all")}
        />
      </div>

      {report ? (
        <article className="panel">
          <div className="panel__title">
            <ReportsIcon width={18} height={18} />
            <h3>Итог импорта</h3>
          </div>
          <div className="summary-list">
            <div>
              <span>{report.fileName}</span>
              <strong>{getImportTypeLabel(report.importType)}</strong>
              <div className="panel-note">
                Строк обнаружено {report.detectedRows} · загружено {report.importedRows} · дублей {report.duplicateRows}
              </div>
              <div className="panel-note">
                Без водителя {report.unresolvedDriverRows} · без авто {report.unresolvedCarRows} · завершено {formatDateOnly(report.finishedAt)}
              </div>
            </div>
            {report.unresolvedSamples.length ? (
              <div>
                <span>Требуют ручной разбор</span>
                <strong>{report.unresolvedSamples[0]}</strong>
                <div className="panel-note">
                  {report.unresolvedSamples.slice(1).join(" · ") || "Остальные строки в этом же отчёте."}
                </div>
              </div>
            ) : null}
          </div>
        </article>
      ) : null}

      <article className="panel">
        <div className="panel__title">
          <IncidentIcon width={18} height={18} />
          <h3>Предпросмотр импорта</h3>
        </div>
        <div className="toolbar">
          <span>{fileName ?? "Файл не выбран"}</span>
          {previewRows.length ? (
            <>
              <select value={previewFilter} onChange={(event) => setPreviewFilter(event.target.value as typeof previewFilter)}>
                <option value="all">Все строки</option>
                <option value="duplicates">Дубли</option>
                <option value="unresolved_driver">Без водителя</option>
                <option value="unresolved_car">Без авто</option>
              </select>
              <button type="button" className="button-secondary" onClick={selectImportableRows}>
                Выбрать все новые
              </button>
              <button type="button" className="button-secondary" onClick={clearSelectedRows}>
                Снять выбор
              </button>
              <span>Выбрано: {selectedRowIndexes.length}</span>
            </>
          ) : null}
          {previewRows.length ? (
            <button type="button" onClick={() => void handleImport()} disabled={importing}>
              {importing ? "Импортируем..." : "Импортировать выбранные строки"}
            </button>
          ) : null}
        </div>

        <AsyncState
          loading={driversApi.loading || carsApi.loading || incidentsApi.loading || outboxApi.loading}
          error={driversApi.error || carsApi.error || incidentsApi.error || outboxApi.error}
          empty={!previewRows.length}
          emptyContent={
            <EmptyStatePanel
              title="Нет строк для импорта"
              message="Загрузите один из поддержанных Excel-файлов, и CRM покажет распознанные записи перед пакетной записью."
            />
          }
        >
          <table className="data-table imports-table">
            <thead>
              <tr>
                <th>Выбор</th>
                <th>Тип</th>
                <th>Заголовок</th>
                <th>Период / дата</th>
                <th>Описание</th>
                <th>Сумма</th>
                <th>Связка</th>
                <th>Импорт</th>
              </tr>
            </thead>
            <tbody>
              {visiblePreviewRows.slice(0, 40).map((row) => {
                const index = previewRows.indexOf(row);

                return (
                <tr key={`${isIncidentImportRow(row) ? row.payload.title : row.summary}-${index}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedRowIndexes.includes(index)}
                      disabled={row.isDuplicate}
                      onChange={() => toggleRowSelection(index)}
                    />
                  </td>
                  <td>{getImportTypeLabel(row.sourceType)}</td>
                  <td>
                    <div className="amount-stack">
                      <strong title={isIncidentImportRow(row) ? row.payload.title : row.summary}>{isIncidentImportRow(row) ? row.payload.title : row.summary}</strong>
                      <span>{row.summary}</span>
                    </div>
                  </td>
                  <td>{isIncidentImportRow(row) ? row.payload.periodLabel ?? (row.payload.occurredAt ? formatDateOnly(row.payload.occurredAt) : "—") : "—"}</td>
                  <td title={isIncidentImportRow(row) ? row.payload.description ?? row.payload.insuranceNote ?? row.payload.repairNote ?? row.payload.locationNote ?? "" : isWriteoffImportRow(row) ? row.payload.reason ?? "" : ""}>{isIncidentImportRow(row) ? row.payload.description ?? row.payload.insuranceNote ?? row.payload.repairNote ?? row.payload.locationNote ?? "—" : isWriteoffImportRow(row) ? row.payload.reason ?? "—" : "—"}</td>
                  <td>{"amount" in row.payload && row.payload.amount ? formatCurrency(row.payload.amount) : "—"}</td>
                  <td>
                    <div className="amount-stack">
                      <span>{row.payload.driverId ? "Водитель найден" : "Без водителя"}</span>
                      <span>{isIncidentImportRow(row) && row.payload.carId ? "Авто найдено" : "Без авто"}</span>
                    </div>
                  </td>
                  <td>{row.isDuplicate ? "Дубликат" : selectedRowIndexes.includes(index) ? "Будет импортирована" : "Новая строка"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {visiblePreviewRows.length > 40 ? <div className="panel-note">Показаны первые 40 строк из {visiblePreviewRows.length}.</div> : null}
        </AsyncState>
      </article>
    </section>
  );
}
