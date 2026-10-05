import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { UserRole } from "@gopark/contracts";
import type { RequestWithUser } from "./request-with-user.js";
import { verifyAccessToken } from "../auth/auth-token.util.js";
import { getRuntimeStatus } from "../../runtime-status.js";

const allowedRoles: UserRole[] = [
  "owner",
  "admin",
  "finance",
  "manager",
  "operator",
  "auditor",
  "driver",
];

@Injectable()
export class RequestUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const runtime = getRuntimeStatus();
    const authorization = getHeaderValue(request.headers["authorization"]);
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : null;

    if (bearerToken) {
      const token = verifyAccessToken(bearerToken);
      if (!token) {
        throw new UnauthorizedException("Invalid bearer token");
      }

      request.user = {
        id: token.sub,
        role: token.role,
        customRoleKey: token.customRoleKey ?? null,
        managerLevel: token.managerLevel ?? null,
        companyName: token.companyName ?? null,
      };

      return true;
    }

    const headerRole = getHeaderValue(request.headers["x-role"]);
    const headerUserId = getHeaderValue(request.headers["x-user-id"]);
    const role =
      typeof headerRole === "string" && allowedRoles.includes(headerRole as UserRole)
        ? (headerRole as UserRole)
        : null;
    const userId = typeof headerUserId === "string" && headerUserId.length > 0
      ? headerUserId
      : null;
    const companyName = getHeaderValue(request.headers["x-company-name"]);

    request.user = runtime.bootstrapAuthEnabled && role && userId
      ? {
          id: userId,
          role,
          companyName: companyName?.trim() || null,
        }
      : undefined;

    return true;
  }
}

function getHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}
