import 'api.dart';

class ManagerRepository {
  ManagerRepository(this.api);

  final ManagerApiClient api;

  ManagerAuthSessionDto? get currentSession => api.currentSession;

  Future<ManagerAuthSessionDto> authenticate(String login, String password) {
    return api.login(login, password).then((session) {
      if (session.requestUserRole != 'manager') {
        throw Exception(
          'Для версии бригадира требуется роль manager. Эта учётная запись не подходит.',
        );
      }

      return session;
    });
  }

  Future<void> signOut() async {
    try {
      await api.logout();
    } catch (_) {
      api.clearSession();
    }
  }

  Future<ManagerAuthSessionDto> refreshSession() {
    return api.refresh().then((session) {
      if (session.requestUserRole != 'manager') {
        throw Exception(
          'Сессия вернулась без роли manager. Войдите заново.',
        );
      }

      return session;
    });
  }

  void restoreSession(ManagerAuthSessionDto session) {
    api.restoreSession(session);
  }

  Future<void> registerPushToken(String token) {
    return api.registerPushToken(token);
  }

  Future<ManagerSummaryDto> loadSummary() {
    return api.getSummary();
  }

  Future<List<ManagerAssignedDriverDto>> loadDrivers() {
    return api.getDrivers();
  }

  Future<List<ManagerIdleVehicleDto>> loadIdleVehicles() {
    return api.getIdleVehicles();
  }

  Future<List<ManagerVehicleDto>> loadVehicles() {
    return api.getVehicles();
  }

  Future<ManagerVehicleDto?> loadVehicleDetail(String vehicleId) {
    return api.getVehicleDetail(vehicleId);
  }

  Future<List<ManagerTeamDto>> loadManagers() {
    return api.getManagers();
  }

  Future<num> loadDriverOverduePeriod(String driverId, DateTime from, DateTime to) async {
    String date(DateTime value) => '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
    final drivers = await api.getDrivers(from: date(from), to: date(to));
    for (final driver in drivers) {
      if (driver.id == driverId) return driver.overduePeriodAmount ?? 0;
    }
    throw StateError('Водитель недоступен. Обновите список.');
  }

  Future<ManagerDriverDetailDto?> loadDriverDetail(String driverId) {
    return api.getDriverDetail(driverId);
  }

  Future<ManagerAssignedDriverDto> updateDriverRiskStatus(
    String driverId,
    String riskStatus,
    String? note,
  ) {
    return api.updateDriverRiskStatus(driverId, riskStatus, note);
  }

  Future<List<ManagerAlertDto>> loadAlerts() {
    return api.getAlerts();
  }

  Future<List<ManagerStatusRequestItemDto>> loadStatusRequests() {
    return api.getStatusRequests();
  }

  Future<List<ManagerRiskStatusReviewDto>> loadRiskStatusRequests() {
    return api.getRiskStatusRequests();
  }

  Future<ManagerRiskStatusReviewDto> reviewRiskStatusRequest(
    String requestId,
    String action,
  ) {
    return api.reviewRiskStatusRequest(requestId, action);
  }

  Future<ManagerStatusRequestItemDto> reviewStatusRequest(
    String requestId,
    String action,
  ) {
    return api.reviewStatusRequest(requestId, action);
  }

  Future<List<ManagerQuickActionDto>> loadQuickActions() {
    return api.getQuickActions();
  }

  Future<List<ManagerIncidentDto>> loadIncidents() {
    return api.getIncidents();
  }

  Future<ManagerIncidentDto> createDriverIncidentAction(
    String driverId,
    String action, {
    String? note,
    String? accidentPhotoUrl,
  }) {
    return api.createDriverIncidentAction(
      driverId,
      action,
      note: note,
      accidentPhotoUrl: accidentPhotoUrl,
    );
  }

  Future<ManagerDriverDetailDto?> reviewDriverPhoto(
    String driverId,
    String action, {
    String? note,
  }) {
    return api.reviewDriverPhoto(driverId, action, note: note);
  }

  Future<ManagerDriverDetailDto?> terminateDriverContract(String driverId) {
    return api.terminateDriverContract(driverId);
  }

  Future<ManagerIncidentDto> updateIncidentAction(
    String incidentId,
    String action, {
    String? note,
  }) {
    return api.updateIncidentAction(incidentId, action, note: note);
  }

  Future<List<ManagerChatThreadDto>> loadChats() {
    return api.getChats();
  }

  Future<ManagerChatThreadDetailDto> loadChat(String threadId) {
    return api.getChat(threadId);
  }

  Future<ManagerChatThreadDetailDto> startDriverChat(
    String driverId,
    String body,
  ) {
    return api.createChat(driverId, body);
  }

  Future<ManagerChatThreadDetailDto> sendChatMessage(
    String threadId,
    String body,
  ) {
    return api.sendChatMessage(threadId, body);
  }

  Future<ManagerExecuteActionResultDto> executeQuickAction(String actionId) {
    return api.executeQuickAction(actionId);
  }
}
