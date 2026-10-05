class ManagerDashboardData {
  const ManagerDashboardData({
    required this.assignedDrivers,
    required this.overdueDrivers,
    required this.activeCars,
    required this.incidentsOpen,
  });

  final int assignedDrivers;
  final int overdueDrivers;
  final int activeCars;
  final int incidentsOpen;
}

const managerDashboardData = ManagerDashboardData(
  assignedDrivers: 45,
  overdueDrivers: 7,
  activeCars: 41,
  incidentsOpen: 3,
);

