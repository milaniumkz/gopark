export class UpdateDriverDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
  nearestRelativePhone?: string;
  licenseNumber?: string;
  passportNumber?: string;
  companyName?: string | null;
  weeklyDayOff?: string | null;
  status?: string;
  riskStatus?: string;
}
