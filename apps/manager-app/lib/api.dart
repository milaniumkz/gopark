import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class ManagerAuthSessionDto {
  const ManagerAuthSessionDto({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresInSeconds,
    required this.requestUserId,
    required this.requestUserRole,
    this.managerLevel,
  });

  factory ManagerAuthSessionDto.fromJson(Map<String, dynamic> json) {
    return ManagerAuthSessionDto(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresInSeconds: _asInt(json['expiresInSeconds']),
      requestUserId: json['requestUserId'] as String,
      requestUserRole: json['requestUserRole'] as String,
      managerLevel: json['managerLevel'] as String?,
    );
  }

  final String accessToken;
  final String refreshToken;
  final int expiresInSeconds;
  final String requestUserId;
  final String requestUserRole;
  final String? managerLevel;

  Map<String, dynamic> toJson() {
    return {
      'accessToken': accessToken,
      'refreshToken': refreshToken,
      'expiresInSeconds': expiresInSeconds,
      'requestUserId': requestUserId,
      'requestUserRole': requestUserRole,
      'managerLevel': managerLevel,
    };
  }
}

class ManagerSummaryDto {
  const ManagerSummaryDto({
    required this.assignedDrivers,
    required this.overdueDrivers,
    required this.paymentDueDrivers,
    required this.activeCars,
    required this.incidentsOpen,
    required this.dueTodayAmount,
    required this.pendingStatusRequests,
    required this.criticalAlerts,
  });

  factory ManagerSummaryDto.fromJson(Map<String, dynamic> json) {
    return ManagerSummaryDto(
      assignedDrivers: _asInt(json['assignedDrivers']),
      overdueDrivers: _asInt(json['overdueDrivers']),
      paymentDueDrivers: _asInt(json['paymentDueDrivers']),
      activeCars: _asInt(json['activeCars']),
      incidentsOpen: _asInt(json['incidentsOpen']),
      dueTodayAmount: _asNum(json['dueTodayAmount']),
      pendingStatusRequests: _asInt(json['pendingStatusRequests']),
      criticalAlerts: _asInt(json['criticalAlerts']),
    );
  }

  final int assignedDrivers;
  final int overdueDrivers;
  final int paymentDueDrivers;
  final int activeCars;
  final int incidentsOpen;
  final num dueTodayAmount;
  final int pendingStatusRequests;
  final int criticalAlerts;
}

class ManagerAssignedDriverDto {
  const ManagerAssignedDriverDto({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.status,
    required this.riskStatus,
    required this.weeklyDayOff,
    required this.vehicle,
    required this.vehicleStatus,
    required this.debt,
    required this.creditBalance,
    required this.overdueDebt,
    required this.overdueSinceDate,
    required this.overdueUntilDate,
    required this.yandexBalance,
    required this.nextPaymentAmount,
    required this.nextPaymentDate,
    required this.lastPaymentDate,
    required this.managerId,
    required this.managerName,
    required this.contractId,
    required this.photoUrl,
    required this.photoStatus,
  });

  factory ManagerAssignedDriverDto.fromJson(Map<String, dynamic> json) {
    return ManagerAssignedDriverDto(
      id: json['id'] as String,
      fullName: json['fullName'] as String,
      phone: json['phone'] as String,
      status: json['status'] as String,
      riskStatus: json['riskStatus'] as String? ?? 'normal',
      weeklyDayOff: json['weeklyDayOff'] as String?,
      vehicle: json['vehicle'] as String,
      vehicleStatus: json['vehicleStatus'] as String?,
      debt: _asNum(json['debt']),
      creditBalance: _asNum(json['creditBalance']),
      overdueDebt: _asNum(json['overdueDebt']),
      overdueSinceDate: json['overdueSinceDate'] as String?,
      overdueUntilDate: json['overdueUntilDate'] as String?,
      yandexBalance: _asNum(json['yandexBalance']),
      nextPaymentAmount: _asNum(json['nextPaymentAmount']),
      nextPaymentDate: json['nextPaymentDate'] as String?,
      lastPaymentDate: json['lastPaymentDate'] as String?,
      managerId: json['managerId'] as String?,
      managerName: json['managerName'] as String?,
      contractId: json['contractId'] as String?,
      photoUrl: json['photoUrl'] as String?,
      photoStatus: json['photoStatus'] as String? ?? 'missing',
    );
  }

  final String id;
  final String fullName;
  final String phone;
  final String status;
  final String riskStatus;
  final String? weeklyDayOff;
  final String vehicle;
  final String? vehicleStatus;
  final num debt;
  final num creditBalance;
  final num overdueDebt;
  final String? overdueSinceDate;
  final String? overdueUntilDate;
  final num yandexBalance;
  final num nextPaymentAmount;
  final String? nextPaymentDate;
  final String? lastPaymentDate;
  final String? managerId;
  final String? managerName;
  final String? contractId;
  final String? photoUrl;
  final String photoStatus;
}

class ManagerIdleVehicleDto {
  const ManagerIdleVehicleDto({
    required this.id,
    required this.plateNumber,
    required this.label,
    required this.status,
    required this.category,
    required this.categoryLabel,
    required this.reason,
    required this.driverId,
    required this.driverName,
    required this.managerId,
    required this.managerName,
    required this.incidentId,
    required this.sinceDate,
  });

  factory ManagerIdleVehicleDto.fromJson(Map<String, dynamic> json) {
    return ManagerIdleVehicleDto(
      id: json['id'] as String,
      plateNumber: json['plateNumber'] as String,
      label: json['label'] as String? ?? '',
      status: json['status'] as String,
      category: json['category'] as String,
      categoryLabel: json['categoryLabel'] as String,
      reason: json['reason'] as String,
      driverId: json['driverId'] as String?,
      driverName: json['driverName'] as String?,
      managerId: json['managerId'] as String?,
      managerName: json['managerName'] as String?,
      incidentId: json['incidentId'] as String?,
      sinceDate: json['sinceDate'] as String?,
    );
  }

  final String id;
  final String plateNumber;
  final String label;
  final String status;
  final String category;
  final String categoryLabel;
  final String reason;
  final String? driverId;
  final String? driverName;
  final String? managerId;
  final String? managerName;
  final String? incidentId;
  final String? sinceDate;
}

class ManagerVehicleAssignmentDto {
  const ManagerVehicleAssignmentDto({
    required this.id,
    required this.driverId,
    required this.driverName,
    required this.startedAt,
    required this.endedAt,
  });

  factory ManagerVehicleAssignmentDto.fromJson(Map<String, dynamic> json) {
    return ManagerVehicleAssignmentDto(
      id: json['id'] as String,
      driverId: json['driverId'] as String,
      driverName: json['driverName'] as String? ?? 'Водитель',
      startedAt: json['startedAt'] as String,
      endedAt: json['endedAt'] as String?,
    );
  }

  final String id;
  final String driverId;
  final String driverName;
  final String startedAt;
  final String? endedAt;
}

class ManagerVehicleDto {
  const ManagerVehicleDto({
    required this.id,
    required this.plateNumber,
    required this.vin,
    required this.make,
    required this.model,
    required this.companyName,
    required this.status,
    required this.assignedDriverId,
    required this.managerId,
    required this.managerName,
    required this.activeContractId,
    required this.statusSinceDate,
    required this.mileage,
    required this.osagoStartDate,
    required this.osagoEndDate,
    required this.cascoStartDate,
    required this.cascoEndDate,
    required this.technicalInspectionStartDate,
    required this.technicalInspectionEndDate,
    required this.engineOilReplacementKm,
    required this.gearboxOilReplacementKm,
    required this.assignmentHistory,
  });

  factory ManagerVehicleDto.fromJson(Map<String, dynamic> json) {
    return ManagerVehicleDto(
      id: json['id'] as String,
      plateNumber: json['plateNumber'] as String,
      vin: json['vin'] as String,
      make: json['make'] as String? ?? '',
      model: json['model'] as String? ?? '',
      companyName: json['companyName'] as String?,
      status: json['status'] as String,
      assignedDriverId: json['assignedDriverId'] as String?,
      managerId: json['managerId'] as String?,
      managerName: json['managerName'] as String?,
      activeContractId: json['activeContractId'] as String?,
      statusSinceDate: json['statusSinceDate'] as String?,
      mileage: _asInt(json['mileage']),
      osagoStartDate: json['osagoStartDate'] as String?,
      osagoEndDate: json['osagoEndDate'] as String?,
      cascoStartDate: json['cascoStartDate'] as String?,
      cascoEndDate: json['cascoEndDate'] as String?,
      technicalInspectionStartDate:
          json['technicalInspectionStartDate'] as String?,
      technicalInspectionEndDate: json['technicalInspectionEndDate'] as String?,
      engineOilReplacementKm: _asInt(json['engineOilReplacementKm']),
      gearboxOilReplacementKm: _asInt(json['gearboxOilReplacementKm']),
      assignmentHistory: _asJsonList(json['assignmentHistory'])
          .map(ManagerVehicleAssignmentDto.fromJson)
          .toList(),
    );
  }

  final String id;
  final String plateNumber;
  final String vin;
  final String make;
  final String model;
  final String? companyName;
  final String status;
  final String? assignedDriverId;
  final String? managerId;
  final String? managerName;
  final String? activeContractId;
  final String? statusSinceDate;
  final int mileage;
  final String? osagoStartDate;
  final String? osagoEndDate;
  final String? cascoStartDate;
  final String? cascoEndDate;
  final String? technicalInspectionStartDate;
  final String? technicalInspectionEndDate;
  final int engineOilReplacementKm;
  final int gearboxOilReplacementKm;
  final List<ManagerVehicleAssignmentDto> assignmentHistory;
}

class ManagerTeamDto {
  const ManagerTeamDto({
    required this.id,
    required this.managerProfileId,
    required this.displayName,
    required this.phone,
    required this.managerLevel,
    required this.driversTotal,
    required this.problemDrivers,
    required this.carsTotal,
    required this.idleCarsTotal,
    required this.idleOfficeCars,
    required this.idleAccidentCars,
    required this.idleInsuranceGpsCars,
    required this.idleServiceCars,
    required this.idleImpoundCars,
    required this.debtTotal,
  });

  factory ManagerTeamDto.fromJson(Map<String, dynamic> json) {
    return ManagerTeamDto(
      id: json['id'] as String,
      managerProfileId: json['managerProfileId'] as String,
      displayName: json['displayName'] as String,
      phone: json['phone'] as String,
      managerLevel: json['managerLevel'] as String?,
      driversTotal: _asInt(json['driversTotal']),
      problemDrivers: _asInt(json['problemDrivers']),
      carsTotal: _asInt(json['carsTotal']),
      idleCarsTotal: _asInt(json['idleCarsTotal']),
      idleOfficeCars: _asInt(json['idleOfficeCars']),
      idleAccidentCars: _asInt(json['idleAccidentCars']),
      idleInsuranceGpsCars: _asInt(json['idleInsuranceGpsCars']),
      idleServiceCars: _asInt(json['idleServiceCars']),
      idleImpoundCars: _asInt(json['idleImpoundCars']),
      debtTotal: _asNum(json['debtTotal']),
    );
  }

  final String id;
  final String managerProfileId;
  final String displayName;
  final String phone;
  final String? managerLevel;
  final int driversTotal;
  final int problemDrivers;
  final int carsTotal;
  final int idleCarsTotal;
  final int idleOfficeCars;
  final int idleAccidentCars;
  final int idleInsuranceGpsCars;
  final int idleServiceCars;
  final int idleImpoundCars;
  final num debtTotal;
}

class ManagerDriverStatusRequestDto {
  const ManagerDriverStatusRequestDto({
    required this.id,
    required this.type,
    required this.status,
    required this.period,
    required this.note,
  });

  factory ManagerDriverStatusRequestDto.fromJson(Map<String, dynamic> json) {
    return ManagerDriverStatusRequestDto(
      id: _asString(json['id']),
      type: _asString(json['type']),
      status: _asString(json['status'], fallback: 'pending'),
      period: _asString(json['period']),
      note: json['note'] as String?,
    );
  }

  final String id;
  final String type;
  final String status;
  final String period;
  final String? note;
}

class ManagerRiskStatusReviewDto {
  const ManagerRiskStatusReviewDto({
    required this.id,
    required this.driverId,
    required this.driverName,
    required this.requestedByManagerId,
    required this.requestedByManagerName,
    required this.previousStatus,
    required this.requestedStatus,
    required this.reviewStatus,
    required this.note,
    required this.createdAt,
    required this.reviewedAt,
  });

  factory ManagerRiskStatusReviewDto.fromJson(Map<String, dynamic> json) {
    return ManagerRiskStatusReviewDto(
      id: json['id'] as String,
      driverId: json['driverId'] as String,
      driverName: json['driverName'] as String,
      requestedByManagerId: json['requestedByManagerId'] as String,
      requestedByManagerName: json['requestedByManagerName'] as String,
      previousStatus: json['previousStatus'] as String,
      requestedStatus: json['requestedStatus'] as String,
      reviewStatus: json['reviewStatus'] as String,
      note: json['note'] as String?,
      createdAt: json['createdAt'] as String,
      reviewedAt: json['reviewedAt'] as String?,
    );
  }

  final String id;
  final String driverId;
  final String driverName;
  final String requestedByManagerId;
  final String requestedByManagerName;
  final String previousStatus;
  final String requestedStatus;
  final String reviewStatus;
  final String? note;
  final String createdAt;
  final String? reviewedAt;
}

class ManagerDriverIncidentDto {
  const ManagerDriverIncidentDto({
    required this.id,
    required this.title,
    required this.incidentType,
    required this.priority,
    required this.status,
    required this.occurredAt,
    required this.periodLabel,
    required this.serviceStage,
    required this.serviceCaseType,
    required this.repairNote,
    required this.accidentPhotoUrl,
  });

  factory ManagerDriverIncidentDto.fromJson(Map<String, dynamic> json) {
    return ManagerDriverIncidentDto(
      id: json['id'] as String,
      title: json['title'] as String,
      incidentType: json['incidentType'] as String?,
      priority: json['priority'] as String,
      status: json['status'] as String,
      occurredAt: json['occurredAt'] as String?,
      periodLabel: json['periodLabel'] as String?,
      serviceStage: json['serviceStage'] as String?,
      serviceCaseType: json['serviceCaseType'] as String?,
      repairNote: json['repairNote'] as String?,
      accidentPhotoUrl: json['accidentPhotoUrl'] as String?,
    );
  }

  final String id;
  final String title;
  final String? incidentType;
  final String priority;
  final String status;
  final String? occurredAt;
  final String? periodLabel;
  final String? serviceStage;
  final String? serviceCaseType;
  final String? repairNote;
  final String? accidentPhotoUrl;
}

class ManagerDriverDetailDto {
  const ManagerDriverDetailDto({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.status,
    required this.riskStatus,
    required this.weeklyDayOff,
    required this.vehicle,
    required this.contractNumber,
    required this.managerId,
    required this.debt,
    required this.creditBalance,
    required this.overdueDebt,
    required this.overdueSinceDate,
    required this.overdueUntilDate,
    required this.yandexBalance,
    required this.nextPaymentAmount,
    required this.nextPaymentDate,
    required this.lastPaymentDate,
    required this.pendingStatusRequestsCount,
    required this.recentStatusRequests,
    required this.openIncidents,
    required this.photoUrl,
    required this.photoStatus,
    required this.photoUploadedAt,
    required this.photoReviewedAt,
    required this.photoReviewNote,
  });

  factory ManagerDriverDetailDto.fromJson(Map<String, dynamic> json) {
    return ManagerDriverDetailDto(
      id: json['id'] as String,
      fullName: json['fullName'] as String,
      phone: json['phone'] as String,
      status: json['status'] as String,
      riskStatus: json['riskStatus'] as String? ?? 'normal',
      weeklyDayOff: json['weeklyDayOff'] as String?,
      vehicle: json['vehicle'] as String?,
      contractNumber: json['contractNumber'] as String?,
      managerId: json['managerId'] as String?,
      debt: _asNum(json['debt']),
      creditBalance: _asNum(json['creditBalance']),
      overdueDebt: _asNum(json['overdueDebt']),
      overdueSinceDate: json['overdueSinceDate'] as String?,
      overdueUntilDate: json['overdueUntilDate'] as String?,
      yandexBalance: _asNum(json['yandexBalance']),
      nextPaymentAmount: _asNum(json['nextPaymentAmount']),
      nextPaymentDate: json['nextPaymentDate'] as String?,
      lastPaymentDate: json['lastPaymentDate'] as String?,
      pendingStatusRequestsCount: _asInt(json['pendingStatusRequestsCount']),
      recentStatusRequests: _asJsonList(json['recentStatusRequests'])
          .map(ManagerDriverStatusRequestDto.fromJson)
          .toList(),
      openIncidents: _asJsonList(json['openIncidents'])
          .map(ManagerDriverIncidentDto.fromJson)
          .toList(),
      photoUrl: json['photoUrl'] as String?,
      photoStatus: json['photoStatus'] as String? ?? 'missing',
      photoUploadedAt: json['photoUploadedAt'] as String?,
      photoReviewedAt: json['photoReviewedAt'] as String?,
      photoReviewNote: json['photoReviewNote'] as String?,
    );
  }

  final String id;
  final String fullName;
  final String phone;
  final String status;
  final String riskStatus;
  final String? weeklyDayOff;
  final String? vehicle;
  final String? contractNumber;
  final String? managerId;
  final num debt;
  final num creditBalance;
  final num overdueDebt;
  final String? overdueSinceDate;
  final String? overdueUntilDate;
  final num yandexBalance;
  final num nextPaymentAmount;
  final String? nextPaymentDate;
  final String? lastPaymentDate;
  final int pendingStatusRequestsCount;
  final List<ManagerDriverStatusRequestDto> recentStatusRequests;
  final List<ManagerDriverIncidentDto> openIncidents;
  final String? photoUrl;
  final String photoStatus;
  final String? photoUploadedAt;
  final String? photoReviewedAt;
  final String? photoReviewNote;
}

class ManagerAlertDto {
  const ManagerAlertDto({
    required this.id,
    required this.title,
    required this.details,
    required this.managerId,
    required this.managerName,
  });

  factory ManagerAlertDto.fromJson(Map<String, dynamic> json) {
    return ManagerAlertDto(
      id: json['id'] as String,
      title: json['title'] as String,
      details: json['details'] as String,
      managerId: json['managerId'] as String?,
      managerName: json['managerName'] as String?,
    );
  }

  final String id;
  final String title;
  final String details;
  final String? managerId;
  final String? managerName;
}

class ManagerStatusRequestItemDto {
  const ManagerStatusRequestItemDto({
    required this.id,
    required this.driverId,
    required this.driverName,
    required this.managerName,
    required this.type,
    required this.status,
    required this.period,
    required this.note,
    required this.createdAt,
  });

  factory ManagerStatusRequestItemDto.fromJson(Map<String, dynamic> json) {
    return ManagerStatusRequestItemDto(
      id: _asString(json['id']),
      driverId: _asString(json['driverId']),
      driverName: _asString(json['driverName'], fallback: 'Водитель'),
      managerName: json['managerName'] as String?,
      type: _asString(json['type']),
      status: _asString(json['status'], fallback: 'pending'),
      period: _asString(json['period']),
      note: json['note'] as String?,
      createdAt: _asString(json['createdAt']),
    );
  }

  final String id;
  final String driverId;
  final String driverName;
  final String? managerName;
  final String type;
  final String status;
  final String period;
  final String? note;
  final String createdAt;
}

class ManagerQuickActionDto {
  const ManagerQuickActionDto({
    required this.id,
    required this.label,
    required this.target,
    required this.managerId,
  });

  factory ManagerQuickActionDto.fromJson(Map<String, dynamic> json) {
    return ManagerQuickActionDto(
      id: json['id'] as String,
      label: json['label'] as String,
      target: json['target'] as String,
      managerId: json['managerId'] as String?,
    );
  }

  final String id;
  final String label;
  final String target;
  final String? managerId;
}

class ManagerIncidentDto {
  const ManagerIncidentDto({
    required this.id,
    required this.title,
    required this.incidentType,
    required this.status,
    required this.priority,
    required this.driverId,
    required this.driverName,
    required this.carId,
    required this.occurredAt,
    required this.periodLabel,
    required this.serviceStage,
    required this.serviceCaseType,
    required this.repairNote,
  });

  factory ManagerIncidentDto.fromJson(Map<String, dynamic> json) {
    return ManagerIncidentDto(
      id: json['id'] as String,
      title: json['title'] as String,
      incidentType: json['incidentType'] as String?,
      status: json['status'] as String,
      priority: json['priority'] as String,
      driverId: json['driverId'] as String?,
      driverName: json['driverName'] as String?,
      carId: json['carId'] as String?,
      occurredAt: json['occurredAt'] as String?,
      periodLabel: json['periodLabel'] as String?,
      serviceStage: json['serviceStage'] as String?,
      serviceCaseType: json['serviceCaseType'] as String?,
      repairNote: json['repairNote'] as String?,
    );
  }

  final String id;
  final String title;
  final String? incidentType;
  final String status;
  final String priority;
  final String? driverId;
  final String? driverName;
  final String? carId;
  final String? occurredAt;
  final String? periodLabel;
  final String? serviceStage;
  final String? serviceCaseType;
  final String? repairNote;
}

class ManagerChatThreadDto {
  const ManagerChatThreadDto({
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

  factory ManagerChatThreadDto.fromJson(Map<String, dynamic> json) {
    return ManagerChatThreadDto(
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

class ManagerChatMessageDto {
  const ManagerChatMessageDto({
    required this.id,
    required this.threadId,
    required this.senderUserId,
    required this.senderRole,
    required this.senderName,
    required this.body,
    required this.createdAt,
  });

  factory ManagerChatMessageDto.fromJson(Map<String, dynamic> json) {
    return ManagerChatMessageDto(
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

class ManagerChatThreadDetailDto extends ManagerChatThreadDto {
  const ManagerChatThreadDetailDto({
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

  factory ManagerChatThreadDetailDto.fromJson(Map<String, dynamic> json) {
    return ManagerChatThreadDetailDto(
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
          .map(ManagerChatMessageDto.fromJson)
          .toList(),
    );
  }

  final List<ManagerChatMessageDto> messages;
}

class ManagerExecuteActionResultDto {
  const ManagerExecuteActionResultDto({
    required this.success,
    required this.actionId,
    required this.executedAt,
  });

  factory ManagerExecuteActionResultDto.fromJson(Map<String, dynamic> json) {
    return ManagerExecuteActionResultDto(
      success: json['success'] as bool? ?? false,
      actionId: json['actionId'] as String,
      executedAt: json['executedAt'] as String,
    );
  }

  final bool success;
  final String actionId;
  final String executedAt;
}

class ManagerApiClient {
  ManagerApiClient({
    String? baseUrl,
    http.Client? httpClient,
  })  : baseUrl = baseUrl ?? _resolveBaseUrl(),
        _httpClient = httpClient;

  final String baseUrl;
  final http.Client? _httpClient;
  ManagerAuthSessionDto? _session;

  http.Client get client => _httpClient ?? http.Client();

  Future<ManagerAuthSessionDto> login(String login, String password) async {
    final response = await client.post(
      Uri.parse('$baseUrl/auth/login'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'login': login, 'password': password}),
    );

    final session = ManagerAuthSessionDto.fromJson(_decodeObject(response));
    _session = session;
    return session;
  }

  Future<ManagerAuthSessionDto> refresh() async {
    final session = _session;
    if (session == null) {
      throw Exception('Manager session is not initialized');
    }

    final response = await client.post(
      Uri.parse('$baseUrl/auth/refresh'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'refreshToken': session.refreshToken}),
    );

    final refreshedSession =
        ManagerAuthSessionDto.fromJson(_decodeObject(response));
    _session = refreshedSession;
    return refreshedSession;
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

    await _authorizedPost(
      Uri.parse('$baseUrl/mobile/push-tokens'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'token': token,
        'platform': 'android',
        'app': 'manager',
      }),
    );
  }

  void clearSession() {
    _session = null;
  }

  ManagerAuthSessionDto? get currentSession => _session;

  void restoreSession(ManagerAuthSessionDto session) {
    _session = session;
  }

  Map<String, String> get _headers {
    final session = _session;
    if (session == null) {
      throw Exception('Manager session is not initialized');
    }

    return {
      'authorization': 'Bearer ${session.accessToken}',
    };
  }

  Future<http.Response> _authorizedGet(Uri uri) {
    return _sendAuthorized((headers) => client.get(uri, headers: headers));
  }

  Future<http.Response> _authorizedPost(
    Uri uri, {
    Map<String, String> headers = const {},
    Object? body,
  }) {
    return _sendAuthorized(
      (authHeaders) => client.post(
        uri,
        headers: {...authHeaders, ...headers},
        body: body,
      ),
    );
  }

  Future<http.Response> _authorizedPatch(
    Uri uri, {
    Map<String, String> headers = const {},
    Object? body,
  }) {
    return _sendAuthorized(
      (authHeaders) => client.patch(
        uri,
        headers: {...authHeaders, ...headers},
        body: body,
      ),
    );
  }

  Future<http.Response> _sendAuthorized(
    Future<http.Response> Function(Map<String, String> headers) send,
  ) async {
    var response = await send(_headers);
    if (response.statusCode != 401) {
      return response;
    }

    await refresh();
    response = await send(_headers);
    return response;
  }

  Future<ManagerSummaryDto> getSummary() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/summary'),
    );

    return ManagerSummaryDto.fromJson(_decodeObject(response));
  }

  Future<List<ManagerAssignedDriverDto>> getDrivers() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/drivers'),
    );

    return _decodeList(response)
        .map(ManagerAssignedDriverDto.fromJson)
        .toList();
  }

  Future<List<ManagerIdleVehicleDto>> getIdleVehicles() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/idle-vehicles'),
    );

    return _decodeList(response).map(ManagerIdleVehicleDto.fromJson).toList();
  }

  Future<List<ManagerVehicleDto>> getVehicles() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/vehicles'),
    );
    return _decodeList(response).map(ManagerVehicleDto.fromJson).toList();
  }

  Future<ManagerVehicleDto?> getVehicleDetail(String vehicleId) async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/vehicles/$vehicleId'),
    );
    final decoded = _decodeNullableObject(response);
    return decoded == null ? null : ManagerVehicleDto.fromJson(decoded);
  }

  Future<List<ManagerTeamDto>> getManagers() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/managers'),
    );

    return _decodeList(response).map(ManagerTeamDto.fromJson).toList();
  }

  Future<ManagerDriverDetailDto?> getDriverDetail(String driverId) async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/drivers/$driverId'),
    );

    final decoded = _decodeNullableObject(response);
    return decoded == null ? null : ManagerDriverDetailDto.fromJson(decoded);
  }

  Future<ManagerAssignedDriverDto> updateDriverRiskStatus(
    String driverId,
    String riskStatus,
    String? note,
  ) async {
    final trimmedNote = note?.trim();
    final response = await _authorizedPatch(
      Uri.parse('$baseUrl/mobile/manager/drivers/$driverId/risk-status'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'riskStatus': riskStatus,
        if (trimmedNote?.isNotEmpty == true) 'note': trimmedNote,
      }),
    );

    return ManagerAssignedDriverDto.fromJson(_decodeObject(response));
  }

  Future<List<ManagerAlertDto>> getAlerts() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/alerts'),
    );

    return _decodeList(response).map(ManagerAlertDto.fromJson).toList();
  }

  Future<List<ManagerStatusRequestItemDto>> getStatusRequests() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/status-requests'),
    );

    return _decodeList(response)
        .map(ManagerStatusRequestItemDto.fromJson)
        .toList();
  }

  Future<List<ManagerRiskStatusReviewDto>> getRiskStatusRequests() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/risk-status-requests'),
    );

    return _decodeList(response)
        .map(ManagerRiskStatusReviewDto.fromJson)
        .toList();
  }

  Future<ManagerRiskStatusReviewDto> reviewRiskStatusRequest(
    String requestId,
    String action,
  ) async {
    final response = await _authorizedPost(
      Uri.parse(
          '$baseUrl/mobile/manager/risk-status-requests/$requestId/$action'),
      headers: const {'content-type': 'application/json'},
    );

    return ManagerRiskStatusReviewDto.fromJson(_decodeObject(response));
  }

  Future<ManagerStatusRequestItemDto> reviewStatusRequest(
    String requestId,
    String action,
  ) async {
    final response = await _authorizedPost(
      Uri.parse('$baseUrl/mobile/manager/status-requests/$requestId/$action'),
      headers: const {'content-type': 'application/json'},
    );

    return ManagerStatusRequestItemDto.fromJson(_decodeObject(response));
  }

  Future<List<ManagerQuickActionDto>> getQuickActions() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/quick-actions'),
    );

    return _decodeList(response).map(ManagerQuickActionDto.fromJson).toList();
  }

  Future<List<ManagerIncidentDto>> getIncidents() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/mobile/manager/incidents'),
    );

    return _decodeList(response).map(ManagerIncidentDto.fromJson).toList();
  }

  Future<ManagerIncidentDto> createDriverIncidentAction(
    String driverId,
    String action, {
    String? note,
    String? accidentPhotoUrl,
  }) async {
    final trimmedNote = note?.trim();
    final trimmedAccidentPhotoUrl = accidentPhotoUrl?.trim();
    final payload = {
      'action': action,
      if (trimmedNote?.isNotEmpty == true) 'note': trimmedNote,
      if (trimmedAccidentPhotoUrl?.isNotEmpty == true)
        'accidentPhotoUrl': trimmedAccidentPhotoUrl,
    };
    final response = await _authorizedPost(
      Uri.parse('$baseUrl/mobile/manager/drivers/$driverId/incidents'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode(payload),
    );

    return ManagerIncidentDto.fromJson(_decodeObject(response));
  }

  Future<ManagerDriverDetailDto?> reviewDriverPhoto(
    String driverId,
    String action, {
    String? note,
  }) async {
    final response = await _authorizedPost(
      Uri.parse('$baseUrl/mobile/manager/drivers/$driverId/photo-review'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'action': action,
        if (note?.trim().isNotEmpty == true) 'note': note!.trim(),
      }),
    );
    final decoded = _decodeNullableObject(response);
    return decoded == null ? null : ManagerDriverDetailDto.fromJson(decoded);
  }

  Future<ManagerDriverDetailDto?> terminateDriverContract(
      String driverId) async {
    final response = await _authorizedPost(
      Uri.parse('$baseUrl/mobile/manager/drivers/$driverId/terminate-contract'),
      headers: const {'content-type': 'application/json'},
    );
    final decoded = _decodeNullableObject(response);
    return decoded == null ? null : ManagerDriverDetailDto.fromJson(decoded);
  }

  Future<ManagerIncidentDto> updateIncidentAction(
    String incidentId,
    String action, {
    String? note,
  }) async {
    final trimmedNote = note?.trim();
    if (!{
      'awaiting_repair',
      'in_repair',
      'completed',
      'closed',
      'written_off',
    }.contains(action)) {
      throw Exception('Unsupported incident action: $action');
    }
    final payload = {
      'action': action,
      if (trimmedNote?.isNotEmpty == true) 'note': trimmedNote,
    };
    final response = await _authorizedPatch(
      Uri.parse('$baseUrl/mobile/manager/incidents/$incidentId/action'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode(payload),
    );

    return ManagerIncidentDto.fromJson(_decodeObject(response));
  }

  Future<List<ManagerChatThreadDto>> getChats() async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/chats'),
    );

    return _decodeList(response).map(ManagerChatThreadDto.fromJson).toList();
  }

  Future<ManagerChatThreadDetailDto> getChat(String threadId) async {
    final response = await _authorizedGet(
      Uri.parse('$baseUrl/chats/$threadId'),
    );

    return ManagerChatThreadDetailDto.fromJson(_decodeObject(response));
  }

  Future<ManagerChatThreadDetailDto> createChat(
    String driverId,
    String body,
  ) async {
    final response = await _authorizedPost(
      Uri.parse('$baseUrl/chats'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'driverId': driverId,
        'subject': 'Чат с водителем',
        'body': body,
      }),
    );

    return ManagerChatThreadDetailDto.fromJson(_decodeObject(response));
  }

  Future<ManagerChatThreadDetailDto> sendChatMessage(
    String threadId,
    String body,
  ) async {
    final response = await _authorizedPost(
      Uri.parse('$baseUrl/chats/$threadId/messages'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'body': body}),
    );

    return ManagerChatThreadDetailDto.fromJson(_decodeObject(response));
  }

  Future<ManagerExecuteActionResultDto> executeQuickAction(
      String actionId) async {
    final response = await _authorizedPost(
      Uri.parse('$baseUrl/mobile/manager/quick-actions/execute'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'actionId': actionId}),
    );

    return ManagerExecuteActionResultDto.fromJson(_decodeObject(response));
  }

  Map<String, dynamic>? _decodeNullableObject(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ManagerApiException(_formatApiError(response));
    }

    if (response.body == 'null' || response.body.isEmpty) {
      return null;
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
    final decoded = _decodeNullableObject(response);
    if (decoded == null) {
      throw const ManagerApiException('Сервер вернул пустой ответ. Попробуйте ещё раз.');
    }
    return decoded;
  }

  List<Map<String, dynamic>> _decodeList(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ManagerApiException(_formatApiError(response));
    }

    final decoded = jsonDecode(response.body) as List<dynamic>;
    return decoded.cast<Map<String, dynamic>>();
  }

  String _formatApiError(http.Response response) {
    if (response.statusCode == 401) {
      return 'Неверный номер телефона или пароль.';
    }
    if (response.statusCode == 413) {
      return 'Файл слишком большой. Уменьшите фото и попробуйте снова.';
    }
    if (response.statusCode >= 500) {
      return 'На сервере произошла ошибка. Попробуйте ещё раз или обратитесь к администратору.';
    }
    if (response.body.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) {
          final message = decoded['message'];
          if (message is List) {
            return _translateManagerApiError(
              message.whereType<Object>().join('; '),
              response.statusCode,
            );
          }
          if (message is String && message.trim().isNotEmpty) {
            return _translateManagerApiError(message, response.statusCode);
          }
          final error = decoded['error'];
          if (error is String && error.trim().isNotEmpty) {
            return _translateManagerApiError(error, response.statusCode);
          }
        }
      } catch (_) {
        // Fall back to the HTTP code below.
      }
    }

    return _translateManagerApiError('', response.statusCode);
  }
}

class ManagerApiException implements Exception {
  const ManagerApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

String _translateManagerApiError(String message, int statusCode) {
  final normalized = message.trim().toLowerCase();
  if (normalized.isEmpty) {
    if (statusCode == 400) return 'Проверьте заполненные данные.';
    if (statusCode == 403) return 'Недостаточно прав для этого действия.';
    if (statusCode == 404) return 'Запись не найдена или уже удалена.';
    if (statusCode == 409) return 'Такая запись уже есть в системе.';
    return 'Не удалось выполнить запрос. Код ошибки: $statusCode.';
  }
  if (normalized.contains('internal server error')) {
    return 'На сервере произошла ошибка. Попробуйте ещё раз или обратитесь к администратору.';
  }
  if (normalized.contains('manager session is not initialized')) {
    return 'Сессия бригадира не найдена. Выйдите и войдите заново.';
  }
  if (normalized.contains('driver phone is already registered')) {
    return 'Водитель с таким номером уже зарегистрирован.';
  }
  if (normalized.contains('current manager cannot use this driver')) {
    return 'Этот водитель не закреплён за текущим бригадиром.';
  }
  if (normalized.contains('unsupported incident action')) {
    return 'Это действие по инциденту сейчас недоступно.';
  }
  if (normalized.contains('unsupported photo review action')) {
    return 'Это действие с фото сейчас недоступно.';
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
  return message.trim();
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

List<Map<String, dynamic>> _asJsonList(Object? value) {
  final list = value as List<dynamic>? ?? const [];
  return list.cast<Map<String, dynamic>>();
}

int _asInt(Object? value) => (value as num?)?.toInt() ?? 0;

num _asNum(Object? value) => (value as num?) ?? 0;

String _asString(Object? value, {String fallback = ''}) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? fallback : text;
}
