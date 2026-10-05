import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { decimalToNumber, toIsoString } from "../../infrastructure/prisma/prisma.utils.js";
import type { CreatePartDto } from "./dto/create-part.dto.js";
import type { ReceivePartDto } from "./dto/receive-part.dto.js";
import type { WriteoffPartDto } from "./dto/writeoff-part.dto.js";

export interface PartItem {
  id: string;
  name: string;
  sku: string | null;
  companyName: string | null;
  make: string | null;
  model: string | null;
  productionYear: number | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  unitPrice: number | null;
  supplier: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PartMovementItem {
  id: string;
  partId: string;
  partName: string;
  carId: string | null;
  carLabel: string | null;
  type: "receive" | "writeoff";
  quantity: number;
  unitPrice: number | null;
  reason: string | null;
  note: string | null;
  createdAt: string;
}

export interface PartsOverview {
  parts: PartItem[];
  movements: PartMovementItem[];
}

function normalizeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePositiveInt(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${fieldName} должно быть положительным целым числом.`);
  }

  return parsed;
}

function normalizeNonNegativeInt(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100 ? parsed : null;
}

function mapPart(part: any): PartItem {
  return {
    id: part.id,
    name: part.name,
    sku: part.sku ?? null,
    companyName: part.companyName ?? null,
    make: part.make ?? null,
    model: part.model ?? null,
    productionYear: part.productionYear ?? null,
    unit: part.unit,
    quantity: part.quantity,
    minQuantity: part.minQuantity,
    unitPrice: part.unitPrice === null || part.unitPrice === undefined ? null : decimalToNumber(part.unitPrice),
    supplier: part.supplier ?? null,
    note: part.note ?? null,
    createdAt: toIsoString(part.createdAt),
    updatedAt: toIsoString(part.updatedAt),
  };
}

function mapMovement(movement: any): PartMovementItem {
  const carLabel =
    movement.car?.plateNumber || movement.car?.vin
      ? [movement.car?.plateNumber, movement.car?.make, movement.car?.model].filter(Boolean).join(" ")
      : null;

  return {
    id: movement.id,
    partId: movement.partId,
    partName: movement.part?.name ?? "Запчасть",
    carId: movement.carId ?? null,
    carLabel,
    type: movement.type,
    quantity: movement.quantity,
    unitPrice: movement.unitPrice === null || movement.unitPrice === undefined ? null : decimalToNumber(movement.unitPrice),
    reason: movement.reason ?? null,
    note: movement.note ?? null,
    createdAt: toIsoString(movement.createdAt),
  };
}

@Injectable()
export class PartsService {
  private readonly prisma = new PrismaService();

  async overview(companyName?: string | null): Promise<PartsOverview> {
    const client = this.prisma.client;
    if (!client) {
      return { parts: [], movements: [] };
    }

    const partWhere = companyName ? { companyName } : {};
    const [parts, movements] = await Promise.all([
      client.part.findMany({ where: partWhere, orderBy: [{ quantity: "asc" }, { name: "asc" }] }),
      client.partMovement.findMany({
        where: companyName ? { part: { companyName } } : {},
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { part: true, car: true },
      }),
    ]);

    return {
      parts: parts.map(mapPart),
      movements: movements.map(mapMovement),
    };
  }

  async create(input: CreatePartDto, companyName?: string | null): Promise<PartItem> {
    const client = this.prisma.client;
    if (!client) {
      throw new BadRequestException("База данных не подключена.");
    }

    const name = normalizeText(input.name);
    if (!name) {
      throw new BadRequestException("Укажите название запчасти.");
    }

    const part = await client.part.create({
      data: {
        name,
        sku: normalizeText(input.sku),
        companyName: normalizeText(companyName),
        make: normalizeText(input.make),
        model: normalizeText(input.model),
        productionYear: normalizeYear(input.productionYear),
        unit: normalizeText(input.unit) ?? "шт",
        quantity: normalizeNonNegativeInt(input.quantity),
        minQuantity: normalizeNonNegativeInt(input.minQuantity),
        unitPrice: normalizeMoney(input.unitPrice),
        supplier: normalizeText(input.supplier),
        note: normalizeText(input.note),
      },
    });

    return mapPart(part);
  }

  async receive(input: ReceivePartDto, companyName?: string | null): Promise<PartsOverview> {
    const client = this.prisma.client;
    if (!client) {
      throw new BadRequestException("База данных не подключена.");
    }

    const quantity = normalizePositiveInt(input.quantity, "Количество прихода");
    const unitPrice = normalizeMoney(input.unitPrice);
    const scopedCompanyName = normalizeText(companyName);
    const part = input.partId
      ? await client.part.findFirst({ where: { id: input.partId, ...(scopedCompanyName ? { companyName: scopedCompanyName } : {}) } })
      : null;

    if (input.partId && !part) {
      throw new NotFoundException("Запчасть не найдена.");
    }

    const name = normalizeText(input.name);
    if (!part && !name) {
      throw new BadRequestException("Выберите существующую запчасть или укажите новую.");
    }

    await client.$transaction(async (tx: any) => {
      const target = part
        ? await tx.part.update({
            where: { id: part.id },
            data: {
              quantity: { increment: quantity },
              unitPrice: unitPrice ?? part.unitPrice,
              make: normalizeText(input.make) ?? part.make,
              model: normalizeText(input.model) ?? part.model,
              productionYear: normalizeYear(input.productionYear) ?? part.productionYear,
              supplier: normalizeText(input.supplier) ?? part.supplier,
              note: normalizeText(input.note) ?? part.note,
            },
          })
        : await tx.part.create({
            data: {
              name: name!,
              sku: normalizeText(input.sku),
              companyName: scopedCompanyName,
              make: normalizeText(input.make),
              model: normalizeText(input.model),
              productionYear: normalizeYear(input.productionYear),
              unit: normalizeText(input.unit) ?? "шт",
              quantity,
              minQuantity: normalizeNonNegativeInt(input.minQuantity),
              unitPrice,
              supplier: normalizeText(input.supplier),
              note: normalizeText(input.note),
            },
          });

      await tx.partMovement.create({
        data: {
          partId: target.id,
          type: "receive",
          quantity,
          unitPrice,
          reason: "Приход",
          note: normalizeText(input.note),
        },
      });
    });

    return this.overview(scopedCompanyName);
  }

  async writeoff(input: WriteoffPartDto, companyName?: string | null): Promise<PartsOverview> {
    const client = this.prisma.client;
    if (!client) {
      throw new BadRequestException("База данных не подключена.");
    }

    const quantity = normalizePositiveInt(input.quantity, "Количество списания");
    const scopedCompanyName = normalizeText(companyName);
    const part = await client.part.findFirst({
      where: { id: input.partId, ...(scopedCompanyName ? { companyName: scopedCompanyName } : {}) },
    });
    if (!part) {
      throw new NotFoundException("Запчасть не найдена.");
    }

    if (part.quantity < quantity) {
      throw new BadRequestException(`Недостаточно остатка: доступно ${part.quantity} ${part.unit}.`);
    }

    if (input.carId) {
      const car = await client.car.findFirst({
        where: { id: input.carId, ...(scopedCompanyName ? { companyName: scopedCompanyName } : {}) },
      });
      if (!car) {
        throw new NotFoundException("Автомобиль не найден.");
      }
    }

    await client.$transaction(async (tx: any) => {
      await tx.part.update({
        where: { id: part.id },
        data: { quantity: { decrement: quantity } },
      });

      await tx.partMovement.create({
        data: {
          partId: part.id,
          carId: normalizeText(input.carId),
          type: "writeoff",
          quantity,
          unitPrice: part.unitPrice,
          reason: normalizeText(input.reason) ?? "Списание на авто",
          note: normalizeText(input.note),
        },
      });
    });

    return this.overview(scopedCompanyName);
  }
}
