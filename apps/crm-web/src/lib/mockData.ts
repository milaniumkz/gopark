export type VehicleStatus =
  | "customs"
  | "office"
  | "installment"
  | "accident"
  | "impound"
  | "abandon"
  | "idle"
  | "sold";

export type DriverStatus =
  | "active"
  | "dayoff"
  | "vacation"
  | "force_majeure"
  | "accident"
  | "office"
  | "idle";

export type PaymentStatus = "paid" | "unpaid" | "partial";

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  generation: string;
  year: number;
  vin: string;
  plateNumber: string;
  mileageOnReceipt: number;
  purchaseCost: number;
  remainingCost: number;
  actualPayments: number;
  status: VehicleStatus;
  currentDriver?: string;
  brigade?: string;
}

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  experience: number;
  vehicle?: string;
  tariff?: string;
  brigade: string;
  paymentStatus: PaymentStatus;
  status: DriverStatus;
  contractDate: string;
  plannedBuyoutDate: string;
  plannedPayment: number;
  actualPayment: number;
  debt: number;
  overpayment: number;
  rating: number;
}

export const mockVehicles: Vehicle[] = [
  {
    id: "1",
    brand: "BYD",
    model: "E2",
    generation: "2023",
    year: 2023,
    vin: "LGXC16EF5P0123456",
    plateNumber: "01 KG 1234",
    mileageOnReceipt: 15000,
    purchaseCost: 1200000,
    remainingCost: 850000,
    actualPayments: 350000,
    status: "installment",
    currentDriver: "Алиев Бакыт",
    brigade: "Бригадир Азамат",
  },
  {
    id: "2",
    brand: "Hyundai",
    model: "Solaris",
    generation: "2020",
    year: 2020,
    vin: "Z94CB41AABR123456",
    plateNumber: "01 KG 5678",
    mileageOnReceipt: 42000,
    purchaseCost: 980000,
    remainingCost: 320000,
    actualPayments: 660000,
    status: "installment",
    currentDriver: "Токтогулов Эмир",
    brigade: "Бригадир Нурбек",
  },
  {
    id: "3",
    brand: "Volkswagen",
    model: "Polo",
    generation: "2022",
    year: 2022,
    vin: "XW8ZZZ61ZMG123456",
    plateNumber: "01 KG 7890",
    mileageOnReceipt: 12000,
    purchaseCost: 1100000,
    remainingCost: 950000,
    actualPayments: 150000,
    status: "office",
    brigade: "Бригадир Азамат",
  },
];

export const mockDrivers: Driver[] = [
  {
    id: "1",
    firstName: "Бакыт",
    lastName: "Алиев",
    phone: "+996 555 123 456",
    experience: 5,
    vehicle: "BYD E2 (01 KG 1234)",
    tariff: "BYD E2 - 2023",
    brigade: "Бригадир Азамат",
    paymentStatus: "paid",
    status: "active",
    contractDate: "2024-01-15",
    plannedBuyoutDate: "2025-01-15",
    plannedPayment: 420000,
    actualPayment: 420000,
    debt: 0,
    overpayment: 0,
    rating: 4.8,
  },
  {
    id: "2",
    firstName: "Эмир",
    lastName: "Токтогулов",
    phone: "+996 555 234 567",
    experience: 3,
    vehicle: "Hyundai Solaris (01 KG 5678)",
    tariff: "Hyundai Solaris - 2020",
    brigade: "Бригадир Нурбек",
    paymentStatus: "unpaid",
    status: "active",
    contractDate: "2023-11-20",
    plannedBuyoutDate: "2024-11-20",
    plannedPayment: 385000,
    actualPayment: 362000,
    debt: 23000,
    overpayment: 0,
    rating: 3.9,
  },
  {
    id: "3",
    firstName: "Эркин",
    lastName: "Маматов",
    phone: "+996 555 456 789",
    experience: 4,
    vehicle: "Kia Rio (01 KG 3456)",
    tariff: "Kia Rio - 2021",
    brigade: "Бригадир Нурбек",
    paymentStatus: "partial",
    status: "dayoff",
    contractDate: "2024-02-01",
    plannedBuyoutDate: "2025-02-01",
    plannedPayment: 280000,
    actualPayment: 230000,
    debt: 50000,
    overpayment: 0,
    rating: 4.2,
  },
];

export function getDashboardStats(period: "today" | "week" | "month" | "year" = "today") {
  const multiplier = period === "today" ? 1 : period === "week" ? 7 : period === "month" ? 30 : 365;

  return {
    plannedPayment: 5670000 * multiplier,
    actualPayment: 5480000 * multiplier,
    debt: 190000 * multiplier,
    overpayment: 45000 * multiplier,
    drivers: {
      total: 135,
      active: 125,
      paid: 98,
      unpaid: 27,
      dayoff: 5,
      vacation: 3,
      forceMajeure: 2,
      accident: 1,
      idle: 4,
    },
    vehicles: {
      customs: 3,
      office: 8,
      installment: 112,
      accident: 2,
      impound: 1,
      abandon: 3,
      idle: 6,
      sold: 4,
    },
  };
}

