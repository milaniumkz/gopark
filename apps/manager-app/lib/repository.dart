import 'api.dart';

class ManagerRepository {
  ManagerRepository(this.api) {
    api.onDataChanged = invalidate;
  }
  final _reads = <String, ({DateTime at, Future<dynamic> future})>{};
  void invalidate() => _reads.clear();
  Future<T> _read<T>(String key, Future<T> Function() load) {
    final scoped = '${api.currentSession?.requestUserId}:$key';
    final cached = _reads[scoped];
    if (cached != null && DateTime.now().difference(cached.at) < const Duration(seconds: 30)) {
      return cached.future as Future<T>;
    }
    final future = Future<T>.sync(load);
    if (_reads.length >= 128) _reads.remove(_reads.keys.first);
    _reads[scoped] = (at: DateTime.now(), future: future);
    future.then<void>((_) {}, onError: (Object error, StackTrace stack) {
      if (identical(_reads[scoped]?.future, future)) _reads.remove(scoped);
    });
    return future;
  }

  final ManagerApiClient api;

  ManagerAuthSessionDto? get currentSession => api.currentSession;

  Future<ManagerAuthSessionDto> authenticate(String login, String password) {
    invalidate();
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
    invalidate();
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
    invalidate();
    api.restoreSession(session);
  }

  Future<void> registerPushToken(String token) {
    return api.registerPushToken(token);
  }

  Future<ManagerSummaryDto> loadSummary() {
    return _read('getSummary', () => api.getSummary());
  }

  Future<List<ManagerAssignedDriverDto>> loadDrivers() {
    return _read('getDrivers', () => api.getDrivers());
  }

  Future<List<ManagerAssignedDriverDto>> loadDriversDueYesterday(
      {DateTime? now}) {
    // Match the API's UTC obligation day; calendar dates remain read-only.
    final current = (now ?? DateTime.now()).toUtc();
    final day = DateTime.utc(current.year, current.month, current.day - 1);
    final date =
        '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
    return _read('drivers:$date', () => api.getDrivers(from: date, to: date));
  }

  Future<List<ManagerIdleVehicleDto>> loadIdleVehicles() {
    return _read('getIdleVehicles', () => api.getIdleVehicles());
  }

  Future<List<ManagerVehicleDto>> loadVehicles() {
    return _read('getVehicles', () => api.getVehicles());
  }

  Future<ManagerVehicleDto?> loadVehicleDetail(String vehicleId) {
    return _read('vehicle:$vehicleId', () => api.getVehicleDetail(vehicleId));
  }

  Future<List<ManagerTeamDto>> loadManagers() {
    return _read('getManagers', () => api.getManagers());
  }

  Future<num> loadDriverOverduePeriod(
      String driverId, DateTime from, DateTime to) async {
    String date(DateTime value) =>
        '${value.year}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
    final drivers = await api.getDrivers(from: date(from), to: date(to));
    for (final driver in drivers) {
      if (driver.id == driverId) return driver.overduePeriodAmount ?? 0;
    }
    throw StateError('Водитель недоступен. Обновите список.');
  }

  Future<ManagerDriverDetailDto?> loadDriverDetail(String driverId) {
    return _read('driver:$driverId', () => api.getDriverDetail(driverId));
  }

  Future<ManagerAssignedDriverDto> updateDriverRiskStatus(
    String driverId,
    String riskStatus,
    String? note,
  ) {
    return api.updateDriverRiskStatus(driverId, riskStatus, note);
  }

  Future<List<ManagerAlertDto>> loadAlerts() {
    return _read('getAlerts', () => api.getAlerts());
  }

  Future<List<ManagerStatusRequestItemDto>> loadStatusRequests() {
    return _read('getStatusRequests', () => api.getStatusRequests());
  }

  Future<List<ManagerRiskStatusReviewDto>> loadRiskStatusRequests() {
    return _read('getRiskStatusRequests', () => api.getRiskStatusRequests());
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
    return _read('getQuickActions', () => api.getQuickActions());
  }

  Future<List<ManagerIncidentDto>> loadIncidents() {
    return _read('getIncidents', () => api.getIncidents());
  }

  Future<Map<String, dynamic>> loadDriverCalendar(
          String driverId, String month) =>
      api.getDriverCalendar(driverId, month);

  Future<Map<String, dynamic>> saveDriverCalendarComment(
          String driverId, String day, String comment) =>
      api.saveDriverCalendarComment(driverId, day, comment);

  Future<ManagerIncidentDto> createVehicleIncidentAction(
          String vehicleId, String action,
          {String? note,
          Map<String, dynamic>? serviceDetails,
          Map<String, dynamic>? accidentDetails}) =>
      api.createVehicleIncidentAction(vehicleId, action,
          note: note,
          serviceDetails: serviceDetails,
          accidentDetails: accidentDetails);

  Future<ManagerIncidentDto> createDriverIncidentAction(
    String driverId,
    String action, {
    String? note,
    String? accidentPhotoUrl,
    Map<String, dynamic>? accidentDetails,
    Map<String, dynamic>? serviceDetails,
  }) {
    return api.createDriverIncidentAction(
      driverId,
      action,
      note: note,
      accidentPhotoUrl: accidentPhotoUrl,
      accidentDetails: accidentDetails,
      serviceDetails: serviceDetails,
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
