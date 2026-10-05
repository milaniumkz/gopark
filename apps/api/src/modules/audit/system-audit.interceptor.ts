import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { makeAuditRepository } from "../../common/application/repository.factory.js";
import type { AuditRepository } from "../../common/repositories/index.js";
import type { RequestWithUser } from "../rbac/request-with-user.js";

@Injectable()
export class SystemAuditInterceptor implements NestInterceptor {
  private readonly repository: AuditRepository = makeAuditRepository();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser & {
      method?: string;
      originalUrl?: string;
      url?: string;
      body?: unknown;
    }>();
    const method = (request.method ?? "GET").toUpperCase();
    const path = request.originalUrl ?? request.url ?? "";

    if (!["POST", "PATCH", "DELETE"].includes(method) || shouldSkip(path)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.repository.create(`system.${method.toLowerCase()}`, "system", null, {
            afterData: {
              actor: request.user ? {
                id: request.user.id,
                role: request.user.role,
                companyName: request.user.companyName ?? null,
                managerLevel: request.user.managerLevel ?? null,
                customRoleKey: request.user.customRoleKey ?? null,
              } : null,
              method,
              path,
              requestBody: redactSensitive(request.body),
              result: summarizeResult(result),
            },
          }).catch(() => undefined);
        },
      }),
    );
  }
}

function shouldSkip(path: string): boolean {
  return path.includes("/audit/logs")
    || path.includes("/auth/login")
    || path.includes("/auth/refresh")
    || path.includes("/auth/logout");
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, fieldValue]) => [
      key,
      /password|token|secret/i.test(key) ? "***" : redactSensitive(fieldValue),
    ]),
  );
}

function summarizeResult(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    driverId: typeof record.driverId === "string" ? record.driverId : undefined,
    contractId: typeof record.contractId === "string" ? record.contractId : undefined,
    amount: typeof record.amount === "number" ? record.amount : undefined,
  };
}
