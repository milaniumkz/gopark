import type { ContractDetail, ContractListItem } from "@gopark/contracts";
import type { CreateContractDto } from "../../modules/contracts/dto/create-contract.dto.js";
import type { UpdateContractDto } from "../../modules/contracts/dto/update-contract.dto.js";

export interface ContractRepository {
  list(): Promise<ContractListItem[]>;
  listByCompany(companyName: string): Promise<ContractListItem[]>;
  getById(contractId: string): Promise<ContractDetail | null>;
  getActiveByDriver(driverId: string): Promise<ContractDetail | null>;
  getMaxIssuedAmountByCar(carId: string): Promise<number>;
  getNextNumber(): Promise<string>;
  create(input: CreateContractDto): Promise<ContractListItem>;
  update(contractId: string, input: UpdateContractDto): Promise<ContractDetail | null>;
  updateStatus(contractId: string, status: ContractListItem["status"]): Promise<ContractDetail | null>;
}
