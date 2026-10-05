import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { makeDriverRepository, makeUserRepository } from "../../common/application/repository.factory.js";
import type { DriverRepository, UserRepository } from "../../common/repositories/index.js";
import type { RequestUser } from "../rbac/request-user.js";
import { getScopedCompanyName } from "../rbac/company-scope.js";

@Injectable()
export class MobileAccessService {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly userRepository: UserRepository = makeUserRepository();

  async assertCanAccessDriver(driverId: string, currentUser: RequestUser | null): Promise<void> {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }
    const scopedCompanyName = getScopedCompanyName(currentUser);
    if (scopedCompanyName && (driver.companyName ?? null) !== scopedCompanyName) {
      throw new ForbiddenException("Current company cannot access this driver");
    }

    if (this.isElevated(currentUser.role)) {
      return;
    }

    if (currentUser.role === "driver") {
      if (currentUser.id !== driverId) {
        throw new ForbiddenException("Drivers can access only their own mobile routes");
      }

      return;
    }

    if (currentUser.role === "manager") {
      if (currentUser.managerLevel === "senior") {
        return;
      }
      const managerIds = await this.getManagerScopeIds(currentUser);
      if (!driver.managerId || !managerIds.has(driver.managerId)) {
        throw new ForbiddenException("Managers can access only assigned drivers");
      }

      return;
    }

    throw new ForbiddenException("Role is not allowed for this mobile route");
  }

  async getScopedDrivers(currentUser: RequestUser | null) {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    const scopedCompanyName = getScopedCompanyName(currentUser);
    const companyScopedDrivers = scopedCompanyName
      ? await this.driverRepository.listByCompany(scopedCompanyName)
      : await this.driverRepository.list();

    if (this.isElevated(currentUser.role)) {
      return companyScopedDrivers;
    }

    if (currentUser.role === "manager") {
      if (currentUser.managerLevel === "senior") {
        return companyScopedDrivers;
      }
      const managerIds = await this.getManagerScopeIds(currentUser);
      return companyScopedDrivers.filter((driver) => driver.managerId && managerIds.has(driver.managerId));
    }

    throw new ForbiddenException("Role is not allowed for this mobile route");
  }

  private async getManagerScopeIds(currentUser: RequestUser): Promise<Set<string>> {
    return this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
  }

  private isElevated(role: RequestUser["role"]): boolean {
    return role === "owner" || role === "admin" || role === "finance";
  }
}
