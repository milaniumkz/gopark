import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { RequestUser } from "./request-user.js";
import { matchesCompanyScope } from "./company-scope.js";
import type {
  CarRepository,
  ContractRepository,
  DriverRepository,
  UserRepository,
} from "../../common/repositories/index.js";

export function resolveScopedCompanyInput(
  currentUser: RequestUser | null,
  companyName?: string | null,
): string | null {
  const scopedCompanyName = currentUser?.companyName?.trim() || null;
  const trimmedCompanyName = companyName?.trim() || null;

  if (!scopedCompanyName) {
    return trimmedCompanyName;
  }

  if (trimmedCompanyName && trimmedCompanyName !== scopedCompanyName) {
    throw new ForbiddenException("Current company cannot write records for another company");
  }

  return scopedCompanyName;
}

export async function assertSeniorManagerOperationalWrite(
  userRepository: UserRepository,
  currentUser: RequestUser | null,
): Promise<void> {
  if (currentUser?.role !== "manager") {
    return;
  }

  const manager = await userRepository.getManagerProfile(currentUser.id, currentUser.companyName ?? null);
  if (manager?.managerLevel !== "senior") {
    throw new ForbiddenException("Only senior managers can perform this operation");
  }

  if (!currentUser.companyName?.trim()) {
    throw new ForbiddenException("Senior manager must be assigned to a company");
  }
}

export async function assertDriverWriteScope(
  driverRepository: DriverRepository,
  driverId: string,
  currentUser: RequestUser | null,
) {
  const driver = await driverRepository.getById(driverId);
  if (!driver) {
    throw new NotFoundException("Driver not found");
  }

  if (!matchesCompanyScope(currentUser, driver.companyName)) {
    throw new ForbiddenException("Current company cannot use this driver");
  }

  return driver;
}

export async function assertCarWriteScope(
  carRepository: CarRepository,
  carId: string,
  currentUser: RequestUser | null,
) {
  const car = await carRepository.getById(carId);
  if (!car) {
    throw new NotFoundException("Car not found");
  }

  if (!matchesCompanyScope(currentUser, car.companyName)) {
    throw new ForbiddenException("Current company cannot use this car");
  }

  return car;
}

export async function assertContractWriteScope(
  contractRepository: ContractRepository,
  driverRepository: DriverRepository,
  carRepository: CarRepository,
  contractId: string,
  currentUser: RequestUser | null,
) {
  const contract = await contractRepository.getById(contractId);
  if (!contract) {
    throw new NotFoundException("Contract not found");
  }

  const [driver, car] = await Promise.all([
    driverRepository.getById(contract.driverId),
    carRepository.getById(contract.carId),
  ]);

  if (!driver || !car) {
    throw new NotFoundException("Contract relation not found");
  }

  if (
    !matchesCompanyScope(currentUser, driver.companyName)
    || !matchesCompanyScope(currentUser, car.companyName)
  ) {
    throw new ForbiddenException("Current company cannot use this contract");
  }

  return { contract, driver, car };
}

export function assertSameCompanyPair(
  leftCompanyName?: string | null,
  rightCompanyName?: string | null,
  message = "Driver and car must belong to the same company",
): void {
  const left = leftCompanyName?.trim() || null;
  const right = rightCompanyName?.trim() || null;

  if (left && right && left !== right) {
    throw new BadRequestException(message);
  }
}

export async function assertManagerAssignmentScope(
  userRepository: UserRepository,
  managerId: string | null,
  driverCompanyName: string | null | undefined,
  currentUser: RequestUser | null,
): Promise<void> {
  if (!managerId) {
    return;
  }

  const users = await userRepository.listAdmin();
  const manager = users.find((item) => (
    item.role === "manager"
    && (item.managerProfileId === managerId || item.id === managerId)
  ));

  if (!manager) {
    throw new NotFoundException("Manager not found");
  }

  if (!matchesCompanyScope(currentUser, manager.companyName)) {
    throw new ForbiddenException("Current company cannot assign this manager");
  }

  assertSameCompanyPair(
    driverCompanyName,
    manager.companyName,
    "Driver and manager must belong to the same company",
  );
}
