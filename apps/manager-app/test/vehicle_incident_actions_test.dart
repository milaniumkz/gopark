import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/repository.dart';
import 'package:gopark_manager_app/vehicle_incident_actions.dart';

class VehicleRepo extends ManagerRepository {
  VehicleRepo() : super(ManagerApiClient());
  final calls = <Map<String, dynamic>>[];
  @override
  Future<ManagerIncidentDto> createVehicleIncidentAction(
      String vehicleId, String action,
      {String? note,
      Map<String, dynamic>? serviceDetails,
      Map<String, dynamic>? accidentDetails}) async {
    calls.add({
      'vehicleId': vehicleId,
      'action': action,
      'note': note,
      'details': serviceDetails
    });
    return ManagerIncidentDto.fromJson({
      'id': 'test',
      'title': 'Test',
      'incidentType': action,
      'status': 'open',
      'priority': 'high'
    });
  }
}

void main() {
  testWidgets(
      'vehicle repair and impound actions send the vehicle ID without a driver',
      (t) async {
    final repo = VehicleRepo();
    int saved = 0;
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ManagerVehicleIncidentActions(
                repository: repo,
                vehicleId: 'vehicle-only',
                onSaved: () => saved++))));
    expect(find.text('ДТП'), findsOneWidget);
    await t.tap(find.text('СТО / ремонт'));
    await t.pumpAndSettle();
    await t.tap(find.byType(DropdownButtonFormField<String>).first);
    await t.pumpAndSettle();
    await t.tap(find.text('Основной цех').last);
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextFormField), 'Замена фильтра');
    await t.tap(find.widgetWithText(FilledButton, 'Отправить на СТО'));
    await t.pumpAndSettle();
    expect(repo.calls.single['vehicleId'], 'vehicle-only');
    expect(repo.calls.single['details']['workshop'], 'main');
    expect(saved, 1);
    await t.tap(find.text('Штрафстоянка'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextFormField), 'Test location');
    await t.tap(find.text('Отправить'));
    await t.pumpAndSettle();
    expect(repo.calls.last['action'], 'impound');
    expect(saved, 2);
    expect(t.takeException(), isNull);
  });
}
