import type { DriverDetail, DriverListItem, DriverRiskStatusChangeItem, ManagerRiskStatusReviewItem } from "@gopark/contracts";
import type { CreateDriverDto } from "../../modules/drivers/dto/create-driver.dto.js";
import type { UpdateDriverDto } from "../../modules/drivers/dto/update-driver.dto.js";

export interface DriverRepository {
  list(): Promise<DriverListItem[]>;
  listByCompany(companyName: string): Promise<DriverListItem[]>;
  getById(driverId: string): Promise<DriverDetail | null>;
  create(input: CreateDriverDto): Promise<DriverListItem>;
  update(driverId: string, input: UpdateDriverDto): Promise<DriverListItem | null>;
  updateManager(driverId: string, managerId: string | null): Promise<DriverListItem | null>;
  updateRiskStatus(
    driverId: string,
    riskStatus: string,
    changedByUserId?: string | null,
    note?: string | null,
  ): Promise<DriverListItem | null>;
  listRiskStatusChanges(limit?: number): Promise<DriverRiskStatusChangeItem[]>;
  createRiskStatusReview(
    driverId: string,
    requestedByManagerId: string,
    requestedStatus: string,
    note?: string | null,
  ): Promise<ManagerRiskStatusReviewItem | null>;
  listRiskStatusReviews(managerIds: string[], limit?: number): Promise<ManagerRiskStatusReviewItem[]>;
  reviewRiskStatusRequest(
    requestId: string,
    reviewedByManagerId: string,
    action: "approve" | "reject",
  ): Promise<ManagerRiskStatusReviewItem | null>;
}
