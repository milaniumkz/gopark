import 'api.dart';

class DriverRepository {
  DriverRepository(this.api);

  final DriverApiClient api;

  DriverAuthSessionDto? get currentSession => api.currentSession;

  Future<DriverAuthSessionDto> authenticate(String login, String password) {
    return api.login(login, password).then((session) {
      if (session.requestUserRole != 'driver') {
        throw Exception(
          'Для приложения водителя требуется роль driver. Эта учётная запись не подходит.',
        );
      }

      return session;
    });
  }

  Future<DriverAuthSessionDto> changePassword({
    required String currentPassword,
    required String newPassword,
  }) {
    return api
        .changePassword(
      currentPassword: currentPassword,
      newPassword: newPassword,
    )
        .then((session) {
      if (session.requestUserRole != 'driver') {
        throw Exception(
          'Смена пароля вернула учётную запись без роли driver. Проверьте настройки системы.',
        );
      }

      return session;
    });
  }

  Future<void> requestPasswordReset(String login) {
    return api.requestPasswordReset(login);
  }

  Future<DriverAuthSessionDto> refreshSession() {
    return api.refresh().then((session) {
      if (session.requestUserRole != 'driver') {
        throw Exception(
          'Сессия вернулась без роли driver. Войдите заново.',
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

  void restoreSession(DriverAuthSessionDto session) {
    api.restoreSession(session);
  }

  Future<void> registerPushToken(String token) {
    return api.registerPushToken(token);
  }

  Future<DriverHomeSummaryDto> loadHomeSummary(String driverId) {
    return api.getHomeSummary(driverId);
  }

  Future<DriverProfileSummaryDto?> loadProfileSummary(String driverId) {
    return api.getProfileSummary(driverId);
  }

  Future<DriverDebtSummaryDto> loadDebtSummary(String driverId) {
    return api.getDebtSummary(driverId);
  }

  Future<DriverActiveContractDto?> loadActiveContract(String driverId) {
    return api.getActiveContract(driverId);
  }

  Future<List<DriverPayoutItemDto>> loadPayouts(String driverId) {
    return api.getPayouts(driverId);
  }

  Future<List<DriverStatusRequestDto>> loadStatusRequests(String driverId) {
    return api.getStatusRequests(driverId);
  }

  Future<List<DriverPaymentScheduleItemDto>> loadPaymentSchedule(
      String driverId) {
    return api.getPaymentSchedule(driverId);
  }

  Future<List<DriverPaymentStatementItemDto>> loadPaymentStatement(
      String driverId) {
    return api.getPaymentStatement(driverId);
  }

  Future<List<DriverNotificationItemDto>> loadNotifications(String driverId) {
    return api.getNotifications(driverId);
  }

  Future<List<DriverChatThreadDto>> loadChats() {
    return api.getChats();
  }

  Future<DriverChatThreadDetailDto> loadChat(String threadId) {
    return api.getChat(threadId);
  }

  Future<void> markChatRead(String driverId) {
    return api.markChatRead(driverId);
  }

  Future<DriverChatThreadDetailDto> startManagerChat(String body) {
    return api.createChat(body);
  }

  Future<DriverChatThreadDetailDto> sendChatMessage(
    String threadId,
    String body,
  ) {
    return api.sendChatMessage(threadId, body);
  }

  Future<DriverPayoutItemDto> requestPayout(
    String driverId,
    int amount, {
    String? payoutDestination,
  }) {
    return api.createPayout(
      driverId,
      amount,
      payoutDestination: payoutDestination,
    );
  }

  Future<void> payCurrentPayment(
    String driverId,
    num amount, {
    String? paymentType,
  }) {
    return api.createFakeBankPayment(
      driverId,
      amount,
      paymentType: paymentType,
    );
  }

  Future<DriverStatusRequestDto> requestStatus(
    String driverId,
    String type,
    String period, {
    String? note,
  }) {
    return api.createStatusRequest(driverId, type, period, note);
  }

  Future<DriverProfileSummaryDto?> submitPhoto(
    String driverId,
    String photoDataUrl,
  ) {
    return api.submitPhoto(driverId, photoDataUrl);
  }
}
