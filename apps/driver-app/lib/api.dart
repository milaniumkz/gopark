import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class DriverAuthSessionDto {
  const DriverAuthSessionDto({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresInSeconds,
    required this.requestUserId,
    required this.requestUserRole,
    required this.mustChangePassword,
  });

  factory DriverAuthSessionDto.fromJson(Map<String, dynamic> json) {
    return DriverAuthSessionDto(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresInSeconds: _asInt(json['expiresInSeconds']),
      requestUserId: json['requestUserId'] as String,
      requestUserRole: json['requestUserRole'] as String,
      mustChangePassword: json['mustChangePassword'] == true,
    );
  }

  final String accessToken;
  final String refreshToken;
  final int expiresInSeconds;
  final String requestUserId;
  final String requestUserRole;
  final bool mustChangePassword;

  Map<String, dynamic> toJson() {
    return {
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'expiresInSeconds': expiresInSeconds,
      'requestUserId': requestUserId,
      'requestUserRole': requestUserRole,
      'mustChangePassword': mustChangePassword,
    };
  }
}

class DriverHomeSummaryDto {
  const DriverHomeSummaryDto({
    required this.driverId,
    required this.driverName,
    required this.currentStatus,
    required this.currentDebt,
    required this.creditBalance,
    required this.overdueDebt,
    required this.nextPaymentAmount,
    required this.nextPaymentDate,
    required this.monthlyGpsAmount,
    required this.monthlyInsuranceAmount,
    required this.gpsDueAmount,
    required this.gpsDueDate,
    required this.insuranceDueAmount,
    required this.insuranceDueDate,
    required this.yandexBalance,
    required this.availableToWithdraw,
    required this.unreadNotifications,
    required this.photoUrl,
    required this.photoStatus,
    required this.photoReviewNote,
  });

  factory DriverHomeSummaryDto.fromJson(Map<String, dynamic> json) {
    return DriverHomeSummaryDto(
      driverId: json['driverId'] as String,
      driverName: json['driverName'] as String,
      currentStatus: json['currentStatus'] as String,
      currentDebt: _asNum(json['currentDebt']),
      creditBalance: _asNum(json['creditBalance']),
      overdueDebt: _asNum(json['overdueDebt']),
      nextPaymentAmount: _asNum(json['nextPaymentAmount']),
      nextPaymentDate: json['nextPaymentDate'] as String?,
      monthlyGpsAmount: _asNum(json['monthlyGpsAmount']),
      monthlyInsuranceAmount: _asNum(json['monthlyInsuranceAmount']),
      gpsDueAmount: _asNum(json['gpsDueAmount']),
      gpsDueDate: json['gpsDueDate'] as String?,
      insuranceDueAmount: _asNum(json['insuranceDueAmount']),
      insuranceDueDate: json['insuranceDueDate'] as String?,
      yandexBalance: _asNum(json['yandexBalance']),
      availableToWithdraw: _asNum(json['availableToWithdraw']),
      unreadNotifications: _asInt(json['unreadNotifications']),
      photoUrl: json['photoUrl'] as String?,
      photoStatus: json['photoStatus'] as String? ?? 'missing',
      photoReviewNote: json['photoReviewNote'] as String?,
    );
  }

  final String driverId;
  final String driverName;
  final String currentStatus;
  final num currentDebt;
  final num creditBalance;
  final num overdueDebt;
  final num nextPaymentAmount;
  final String? nextPaymentDate;
  final num monthlyGpsAmount;
  final num monthlyInsuranceAmount;
  final num gpsDueAmount;
  final String? gpsDueDate;
  final num insuranceDueAmount;
  final String? insuranceDueDate;
  final num yandexBalance;
  final num availableToWithdraw;
  final int unreadNotifications;
  final String? photoUrl;
  final String photoStatus;
  final String? photoReviewNote;
}

class DriverProfileSummaryDto {
  const DriverProfileSummaryDto({
    required this.driverId,
    required this.driverName,
    required this.phone,
    required this.currentStatus,
    required this.assignedVehicle,
    required this.activeContractNumber,
    required this.managerId,
    required this.totalObligations,
    required this.totalPaid,
    required this.currentDebt,
    required this.creditBalance,
    required this.overdueDebt,
    required this.lastPaymentDate,
    required this.yandexBalance,
    required this.photoUrl,
    required this.photoStatus,
    required this.photoUploadedAt,
    required this.photoReviewedAt,
    required this.photoReviewNote,
  });

  factory DriverProfileSummaryDto.fromJson(Map<String, dynamic> json) {
    return DriverProfileSummaryDto(
      driverId: json['driverId'] as String,
      driverName: json['driverName'] as String,
      phone: json['phone'] as String,
      currentStatus: json['currentStatus'] as String,
      assignedVehicle: json['assignedVehicle'] as String?,
      activeContractNumber: json['activeContractNumber'] as String?,
      managerId: json['managerId'] as String?,
      totalObligations: _asNum(json['totalObligations']),
      totalPaid: _asNum(json['totalPaid']),
      currentDebt: _asNum(json['currentDebt']),
      creditBalance: _asNum(json['creditBalance']),
      overdueDebt: _asNum(json['overdueDebt']),
      lastPaymentDate: json['lastPaymentDate'] as String?,
      yandexBalance: _asNum(json['yandexBalance']),
      photoUrl: json['photoUrl'] as String?,
      photoStatus: json['photoStatus'] as String? ?? 'missing',
      photoUploadedAt: json['photoUploadedAt'] as String?,
      photoReviewedAt: json['photoReviewedAt'] as String?,
      photoReviewNote: json['photoReviewNote'] as String?,
    );
  }

  final String driverId;
  final String driverName;
  final String phone;
  final String currentStatus;
  final String? assignedVehicle;
  final String? activeContractNumber;
  final String? managerId;
  final num totalObligations;
  final num totalPaid;
  final num currentDebt;
  final num creditBalance;
  final num overdueDebt;
  final String? lastPaymentDate;
  final num yandexBalance;
  final String? photoUrl;
  final String photoStatus;
  final String? photoUploadedAt;
  final String? photoReviewedAt;
  final String? photoReviewNote;
}

class DriverDebtSummaryDto {
  const DriverDebtSummaryDto({
    required this.driverId,
    required this.totalDebt,
    required this.creditBalance,
    required this.overdueDebt,
    required this.nextPaymentAmount,
    required this.nextPaymentDate,
  });

  factory DriverDebtSummaryDto.fromJson(Map<String, dynamic> json) {
    return DriverDebtSummaryDto(
      driverId: json['driverId'] as String,
      totalDebt: _asNum(json['totalDebt']),
      creditBalance: _asNum(json['creditBalance']),
      overdueDebt: _asNum(json['overdueDebt']),
      nextPaymentAmount: _asNum(json['nextPaymentAmount']),
      nextPaymentDate: json['nextPaymentDate'] as String?,
    );
  }

  final String driverId;
  final num totalDebt;
  final num creditBalance;
  final num overdueDebt;
  final num nextPaymentAmount;
  final String? nextPaymentDate;
}

class DriverActiveContractDto {
  const DriverActiveContractDto({
    required this.id,
    required this.contractNumber,
    required this.status,
    required this.carLabel,
    required this.startDate,
    required this.plannedEndDate,
    required this.totalCost,
    required this.paidAmount,
    required this.remainingAmount,
    required this.installmentAmount,
    required this.installmentDay,
    required this.currentDebt,
  });

  factory DriverActiveContractDto.fromJson(Map<String, dynamic> json) {
    return DriverActiveContractDto(
      id: json['id'] as String,
      contractNumber: json['contractNumber'] as String,
      status: json['status'] as String,
      carLabel: json['carLabel'] as String,
      startDate: json['startDate'] as String,
      plannedEndDate: json['plannedEndDate'] as String,
      totalCost: _asNum(json['totalCost']),
      paidAmount: _asNum(json['paidAmount']),
      remainingAmount: _asNum(json['remainingAmount']),
      installmentAmount: _asNum(json['installmentAmount']),
      installmentDay: _asInt(json['installmentDay']),
      currentDebt: _asNum(json['currentDebt']),
    );
  }

  final String id;
  final String contractNumber;
  final String status;
  final String carLabel;
  final String startDate;
  final String plannedEndDate;
  final num totalCost;
  final num paidAmount;
  final num remainingAmount;
  final num installmentAmount;
  final int installmentDay;
  final num currentDebt;
}

class DriverPayoutItemDto {
  const DriverPayoutItemDto({
    required this.id,
    required this.driverId,
    required this.amount,
    required this.status,
    required this.createdAt,
    required this.approvedByUserId,
  });

  factory DriverPayoutItemDto.fromJson(Map<String, dynamic> json) {
    return DriverPayoutItemDto(
      id: json['id'] as String,
      driverId: json['driverId'] as String,
      amount: _asNum(json['amount']),
      status: json['status'] as String,
      createdAt: json['createdAt'] as String,
      approvedByUserId: json['approvedByUserId'] as String?,
    );
  }

  final String id;
  final String driverId;
  final num amount;
  final String status;
  final String createdAt;
  final String? approvedByUserId;
}

class DriverStatusRequestDto {
  const DriverStatusRequestDto({
    required this.id,
    required this.driverId,
    required this.type,
    required this.status,
    required this.period,
    required this.note,
    required this.createdAt,
  });

  factory DriverStatusRequestDto.fromJson(Map<String, dynamic> json) {
    return DriverStatusRequestDto(
      id: json['id'] as String,
      driverId: json['driverId'] as String?,
      type: json['type'] as String,
      status: json['status'] as String,
      period: json['period'] as String,
      note: json['note'] as String?,
      createdAt: json['createdAt'] as String?,
    );
  }

  final String id;
  final String? driverId;
  final String type;
  final String status;
  final String period;
  final String? note;
  final String? createdAt;
}

class DriverPaymentScheduleItemDto {
  const DriverPaymentScheduleItemDto({
    required this.id,
    required this.dueDate,
    required this.amount,
    required this.paidAmount,
    required this.installmentAmount,
    required this.gpsAmount,
    required this.insuranceAmount,
    required this.type,
    required this.status,
  });

  factory DriverPaymentScheduleItemDto.fromJson(Map<String, dynamic> json) {
    return DriverPaymentScheduleItemDto(
      id: json['id'] as String,
      dueDate: json['dueDate'] as String,
      amount: _asNum(json['amount']),
      paidAmount: _asNum(json['paidAmount']),
      installmentAmount: _asNum(json['installmentAmount']),
      gpsAmount: _asNum(json['gpsAmount']),
      insuranceAmount: _asNum(json['insuranceAmount']),
      type: json['type'] as String? ?? 'installment',
      status: json['status'] as String,
    );
  }

  final String id;
  final String dueDate;
  final num amount;
  final num paidAmount;
  final num installmentAmount;
  final num gpsAmount;
  final num insuranceAmount;
  final String type;
  final String status;
}

class DriverPaymentStatementItemDto {
  const DriverPaymentStatementItemDto({
    required this.id,
    required this.driverId,
    required this.contractId,
    required this.amount,
    required this.appliedAmount,
    required this.unappliedAmount,
    required this.status,
    required this.provider,
    required this.paymentForDate,
    required this.createdAt,
  });

  factory DriverPaymentStatementItemDto.fromJson(Map<String, dynamic> json) {
    return DriverPaymentStatementItemDto(
      id: json['id'] as String,
      driverId: json['driverId'] as String,
      contractId: json['contractId'] as String,
      amount: _asNum(json['amount']),
      appliedAmount: _asNum(json['appliedAmount']),
      unappliedAmount: _asNum(json['unappliedAmount']),
      status: json['status'] as String,
      provider: json['provider'] as String,
      paymentForDate: json['paymentForDate'] as String?,
      createdAt: json['createdAt'] as String,
    );
  }

  final String id;
  final String driverId;
  final String contractId;
  final num amount;
  final num appliedAmount;
  final num unappliedAmount;
  final String status;
  final String provider;
  final String? paymentForDate;
  final String createdAt;
}

class DriverNotificationItemDto {
  const DriverNotificationItemDto({
    required this.id,
    required this.userId,
    required this.driverId,
    required this.channel,
    required this.template,
    required this.status,
    required this.createdAt,
  });

  factory DriverNotificationItemDto.fromJson(Map<String, dynamic> json) {
    return DriverNotificationItemDto(
      id: json['id'] as String,
      userId: json['userId'] as String?,
      driverId: json['driverId'] as String?,
      channel: json['channel'] as String,
      template: json['template'] as String,
      status: json['status'] as String,
      createdAt: json['createdAt'] as String?,
    );
  }

  final String id;
  final String? userId;
  final String? driverId;
  final String channel;
  final String template;
  final String status;
  final String? createdAt;
}

class DriverChatThreadDto {
  const DriverChatThreadDto({
    required this.id,
    required this.driverId,
    required this.managerId,
    required this.subject,
    required this.status,
    required this.driverName,
    required this.managerName,
    required this.lastMessagePreview,
    required this.lastMessageAt,
    required this.unreadCount,
    required this.createdAt,
  });

  factory DriverChatThreadDto.fromJson(Map<String, dynamic> json) {
    return DriverChatThreadDto(
      id: json['id'] as String,
      driverId: json['driverId'] as String?,
      managerId: json['managerId'] as String?,
      subject: json['subject'] as String,
      status: json['status'] as String,
      driverName: json['driverName'] as String?,
      managerName: json['managerName'] as String?,
      lastMessagePreview: json['lastMessagePreview'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      unreadCount: _asInt(json['unreadCount']),
      createdAt: json['createdAt'] as String,
    );
  }

  final String id;
  final String? driverId;
  final String? managerId;
  final String subject;
  final String status;
  final String? driverName;
  final String? managerName;
  final String? lastMessagePreview;
  final String? lastMessageAt;
  final int unreadCount;
  final String createdAt;
}

class DriverChatMessageDto {
  const DriverChatMessageDto({
    required this.id,
    required this.threadId,
    required this.senderUserId,
    required this.senderRole,
    required this.senderName,
    required this.body,
    required this.createdAt,
  });

  factory DriverChatMessageDto.fromJson(Map<String, dynamic> json) {
    return DriverChatMessageDto(
      id: json['id'] as String,
      threadId: json['threadId'] as String,
      senderUserId: json['senderUserId'] as String?,
      senderRole: json['senderRole'] as String,
      senderName: json['senderName'] as String,
      body: json['body'] as String,
      createdAt: json['createdAt'] as String,
    );
  }

  final String id;
  final String threadId;
  final String? senderUserId;
  final String senderRole;
  final String senderName;
  final String body;
  final String createdAt;
}

class DriverChatThreadDetailDto extends DriverChatThreadDto {
  const DriverChatThreadDetailDto({
    required super.id,
    required super.driverId,
    required super.managerId,
    required super.subject,
    required super.status,
    required super.driverName,
    required super.managerName,
    required super.lastMessagePreview,
    required super.lastMessageAt,
    required super.unreadCount,
    required super.createdAt,
    required this.messages,
  });

  factory DriverChatThreadDetailDto.fromJson(Map<String, dynamic> json) {
    return DriverChatThreadDetailDto(
      id: json['id'] as String,
      driverId: json['driverId'] as String?,
      managerId: json['managerId'] as String?,
      subject: json['subject'] as String,
      status: json['status'] as String,
      driverName: json['driverName'] as String?,
      managerName: json['managerName'] as String?,
      lastMessagePreview: json['lastMessagePreview'] as String?,
      lastMessageAt: json['lastMessageAt'] as String?,
      unreadCount: _asInt(json['unreadCount']),
      createdAt: json['createdAt'] as String,
      messages: ((json['messages'] as List<dynamic>?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map(DriverChatMessageDto.fromJson)
          .toList(),
    );
  }

  final List<DriverChatMessageDto> messages;
}

class DriverApiClient {
  DriverApiClient({
    String? baseUrl,
    http.Client? httpClient,
  })  : baseUrl = baseUrl ?? _resolveBaseUrl(),
        _httpClient = httpClient;

  final String baseUrl;
  final http.Client? _httpClient;
  DriverAuthSessionDto? _session;

  http.Client get client => _httpClient ?? http.Client();

  Future<DriverAuthSessionDto> login(String login, String password) async {
    final response = await client.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'login': login, 'password': password}),
    );

    final session = DriverAuthSessionDto.fromJson(_decodeObject(response));
    _session = session;
    return session;
  }

  Future<DriverAuthSessionDto> refresh() async {
    final session = _session;
    if (session == null) {
      throw Exception('Driver session is not initialized');
    }

    final response = await client.post(
      Uri.parse('$baseUrl/auth/refresh'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'refreshToken': session.refreshToken}),
    );

    final refreshedSession =
        DriverAuthSessionDto.fromJson(_decodeObject(response));
    _session = refreshedSession;
    return refreshedSession;
  }

  Future<DriverAuthSessionDto> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final response = await client.post(
      Uri.parse('$baseUrl/auth/change-password'),
      headers: {
        'content-type': 'application/json',
        ..._headers,
      },
      body: jsonEncode({
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      }),
    );

    final session = DriverAuthSessionDto.fromJson(_decodeObject(response));
    _session = session;
    return session;
  }

  Future<void> requestPasswordReset(String login) async {
    final response = await client.post(
      Uri.parse('$baseUrl/auth/password-reset-request'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'login': login}),
    );

    _decodeObject(response);
  }

  Future<void> logout() async {
    final session = _session;
    _session = null;
    if (session == null) {
      return;
    }

    await client.post(
      Uri.parse('$baseUrl/auth/logout'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'refreshToken': session.refreshToken}),
    );
  }

  Future<void> registerPushToken(String token) async {
    if (token.trim().isEmpty) {
      return;
    }

    await client.post(
      Uri.parse('$baseUrl/mobile/push-tokens'),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode({
        'token': token,
        'platform': 'android',
        'app': 'driver',
      }),
    );
  }

  void clearSession() {
    _session = null;
  }

  DriverAuthSessionDto? get currentSession => _session;

  void restoreSession(DriverAuthSessionDto session) {
    _session = session;
  }

  Map<String, String> get _headers {
    final session = _session;
    if (session == null) {
      throw Exception('Driver session is not initialized');
    }

    return {
      'authorization': 'Bearer ${session.accessToken}',
    };
  }

  Future<DriverHomeSummaryDto> getHomeSummary(String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/home-summary'),
      headers: _headers,
    );

    return DriverHomeSummaryDto.fromJson(_decodeObject(response));
  }

  Future<DriverProfileSummaryDto?> getProfileSummary(String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/profile-summary'),
      headers: _headers,
    );

    final decoded = _decodeNullableObject(response);
    return decoded == null ? null : DriverProfileSummaryDto.fromJson(decoded);
  }

  Future<DriverDebtSummaryDto> getDebtSummary(String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/debt-summary'),
      headers: _headers,
    );

    return DriverDebtSummaryDto.fromJson(_decodeObject(response));
  }

  Future<DriverActiveContractDto?> getActiveContract(String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/contract'),
      headers: _headers,
    );

    final decoded = _decodeNullableObject(response);
    return decoded == null ? null : DriverActiveContractDto.fromJson(decoded);
  }

  Future<List<DriverPayoutItemDto>> getPayouts(String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/payouts'),
      headers: _headers,
    );

    return _decodeList(response).map(DriverPayoutItemDto.fromJson).toList();
  }

  Future<List<DriverStatusRequestDto>> getStatusRequests(
      String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/status-requests'),
      headers: _headers,
    );

    return _decodeList(response).map(DriverStatusRequestDto.fromJson).toList();
  }

  Future<List<DriverPaymentScheduleItemDto>> getPaymentSchedule(
      String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/payment-schedule'),
      headers: _headers,
    );

    return _decodeList(response)
        .map(DriverPaymentScheduleItemDto.fromJson)
        .toList();
  }

  Future<List<DriverPaymentStatementItemDto>> getPaymentStatement(
      String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/payment-statement'),
      headers: _headers,
    );

    return _decodeList(response)
        .map(DriverPaymentStatementItemDto.fromJson)
        .toList();
  }

  Future<List<DriverNotificationItemDto>> getNotifications(
      String driverId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/mobile/driver/$driverId/notifications'),
      headers: _headers,
    );

    return _decodeList(response)
        .map(DriverNotificationItemDto.fromJson)
        .toList();
  }

  Future<List<DriverChatThreadDto>> getChats() async {
    final response = await client.get(
      Uri.parse('$baseUrl/chats'),
      headers: _headers,
    );

    return _decodeList(response).map(DriverChatThreadDto.fromJson).toList();
  }

  Future<DriverChatThreadDetailDto> getChat(String threadId) async {
    final response = await client.get(
      Uri.parse('$baseUrl/chats/$threadId'),
      headers: _headers,
    );

    return DriverChatThreadDetailDto.fromJson(_decodeObject(response));
  }

  Future<void> markChatRead(String driverId) async {
    final response = await client.post(
      Uri.parse('$baseUrl/mobile/driver/$driverId/chat/read'),
      headers: _headers,
    );

    _decodeObject(response);
  }

  Future<DriverChatThreadDetailDto> createChat(String body) async {
    final response = await client.post(
      Uri.parse('$baseUrl/chats'),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode({
        'subject': 'Чат с бригадиром',
        'body': body,
      }),
    );

    return DriverChatThreadDetailDto.fromJson(_decodeObject(response));
  }

  Future<DriverChatThreadDetailDto> sendChatMessage(
    String threadId,
    String body,
  ) async {
    final response = await client.post(
      Uri.parse('$baseUrl/chats/$threadId/messages'),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode({'body': body}),
    );

    return DriverChatThreadDetailDto.fromJson(_decodeObject(response));
  }

  Future<DriverPayoutItemDto> createPayout(
    String driverId,
    int amount, {
    String? payoutDestination,
  }) async {
    final response = await client.post(
      Uri.parse('$baseUrl/mobile/driver/$driverId/payouts'),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode({
        'amount': amount,
        if (payoutDestination != null) 'payoutDestination': payoutDestination,
      }),
    );

    return DriverPayoutItemDto.fromJson(_decodeObject(response));
  }

  Future<void> createFakeBankPayment(
    String driverId,
    num amount, {
    String? paymentType,
  }) async {
    final response = await client.post(
      Uri.parse('$baseUrl/mobile/driver/$driverId/payments/fake-bank'),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode({
        'amount': amount,
        if (paymentType != null) 'paymentType': paymentType,
      }),
    );

    _decodeObject(response);
  }

  Future<DriverStatusRequestDto> createStatusRequest(
    String driverId,
    String type,
    String period,
    String? note,
  ) async {
    final response = await client.post(
      Uri.parse('$baseUrl/mobile/driver/$driverId/status-requests'),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode({
        'type': type,
        'period': period,
        if (note?.trim().isNotEmpty == true) 'note': note!.trim(),
      }),
    );

    return DriverStatusRequestDto.fromJson(_decodeObject(response));
  }

  Future<DriverProfileSummaryDto?> submitPhoto(
    String driverId,
    String photoDataUrl,
  ) async {
    final response = await client.post(
      Uri.parse('$baseUrl/mobile/driver/$driverId/photo'),
      headers: {..._headers, 'content-type': 'application/json'},
      body: jsonEncode({'photoDataUrl': photoDataUrl}),
    );

    final decoded = _decodeNullableObject(response);
    return decoded == null ? null : DriverProfileSummaryDto.fromJson(decoded);
  }

  Map<String, dynamic>? _decodeNullableObject(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw DriverApiException(_decodeErrorMessage(response));
    }

    if (response.body == 'null' || response.body.isEmpty) {
      return null;
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
    final decoded = _decodeNullableObject(response);
    if (decoded == null) {
      throw const DriverApiException('Сервер вернул пустой ответ. Попробуйте ещё раз.');
    }
    return decoded;
  }

  List<Map<String, dynamic>> _decodeList(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw DriverApiException(_decodeErrorMessage(response));
    }

    final decoded = jsonDecode(response.body) as List<dynamic>;
    return decoded.cast<Map<String, dynamic>>();
  }
}

class DriverApiException implements Exception {
  const DriverApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

String _decodeErrorMessage(http.Response response) {
  final statusCode = response.statusCode;
  final body = response.body.trim();

  if (statusCode == 401) {
    return 'Неверный номер телефона или пароль.';
  }

  if (statusCode == 404) {
    return 'Нужный сервис пока недоступен. Обновите страницу и попробуйте снова.';
  }

  if (statusCode == 413) {
    return 'Файл слишком большой. Уменьшите фото и попробуйте снова.';
  }

  if (statusCode >= 500) {
    return 'На сервере произошла ошибка. Попробуйте ещё раз или обратитесь к администратору.';
  }

  if (body.isNotEmpty) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic>) {
        final message = decoded['message'];
        if (message is String && message.trim().isNotEmpty) {
          return _translateApiError(message.trim(), statusCode);
        }
        final error = decoded['error'];
        if (error is String && error.trim().isNotEmpty) {
          return _translateApiError(error.trim(), statusCode);
        }
      }
    } catch (_) {}
  }

  return _translateApiError('', statusCode);
}

String _translateApiError(String message, int statusCode) {
  final normalized = message.toLowerCase();
  if (message.trim().isEmpty) {
    if (statusCode == 400) return 'Проверьте заполненные данные.';
    if (statusCode == 403) return 'Недостаточно прав для этого действия.';
    if (statusCode == 409) return 'Такая запись уже есть в системе.';
    return 'Не удалось выполнить запрос. Код ошибки: $statusCode.';
  }
  if (normalized.contains('internal server error')) {
    return 'На сервере произошла ошибка. Попробуйте ещё раз или обратитесь к администратору.';
  }
  if (normalized.contains('driver session is not initialized')) {
    return 'Сессия водителя не найдена. Выйдите и войдите заново.';
  }
  if (normalized.contains('driver phone is already registered')) {
    return 'Водитель с таким номером уже зарегистрирован.';
  }
  if (normalized.contains('field "') && normalized.contains('required')) {
    return 'Заполните обязательные поля.';
  }
  if (normalized.contains('insufficient role') || normalized.contains('forbidden')) {
    return 'Недостаточно прав для этого действия.';
  }
  if (normalized.contains('not found')) {
    return 'Запись не найдена или уже удалена.';
  }
  if (normalized.contains('bad request')) {
    return 'Проверьте заполненные данные.';
  }
  if (normalized.contains('only pending status requests can be reviewed')) {
    return 'Эта заявка уже рассмотрена.';
  }
  if (normalized.contains('payload too large')) {
    return 'Файл слишком большой. Уменьшите фото и попробуйте снова.';
  }
  return message;
}

String _resolveBaseUrl() {
  const configured = String.fromEnvironment('API_BASE_URL', defaultValue: '');
  if (configured.isNotEmpty) {
    return configured;
  }

  if (kIsWeb) {
    try {
      final origin = Uri.base.origin;
      if (origin.isNotEmpty) {
        return '$origin/api';
      }
    } catch (_) {
      // Fall through to the production API below.
    }
  }

  return 'http://185.138.185.36/api';
}

int _asInt(Object? value) => (value as num?)?.toInt() ?? 0;

num _asNum(Object? value) => (value as num?) ?? 0;
