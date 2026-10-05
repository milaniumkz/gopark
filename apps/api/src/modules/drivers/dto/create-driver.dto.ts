export interface CreateDriverDto {
  firstName: string;
  lastName: string;
  phone: string;
  nearestRelativePhone?: string;
  licenseNumber?: string;
  passportNumber?: string;
  companyName?: string;
  weeklyDayOff?: string;
  managerId?: string;
}
