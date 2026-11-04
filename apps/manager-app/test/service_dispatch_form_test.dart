import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gopark_manager_app/service_dispatch_form.dart';

void main() {
  test('dispatch metadata reaches authenticated API through the repository',
      () async {
    Map<String, dynamic>? payload;
    final api = ManagerApiClient(
        baseUrl: 'http://test/api',
        httpClient: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer test');
          payload = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
              jsonEncode({
                'id': 'case',
                'title': 'Test',
                'incidentType': 'repair',
                'status': 'open',
                'priority': 'high'
              }),
              200);
        }));
    api.restoreSession(const ManagerAuthSessionDto(
        accessToken: 'test',
        refreshToken: 'test',
        expiresInSeconds: 3600,
        requestUserId: 'manager',
        requestUserRole: 'manager'));
    const dispatch = {
      'workshop': 'both',
      'repairCategory': 'accident_repair',
      'expectedPayer': 'insurance'
    };
    const accident = {
      'location': 'Test',
      'fault': 'other',
      'otherPlate': 'TEST',
      'otherMake': 'Test',
      'otherModel': 'Test',
      'insurer': 'nsk',
      'occurredAt': '2026-01-01T10:00:00Z'
    };
    await ManagerRepository(api).createDriverIncidentAction('driver', 'repair',
        note: 'Reason', serviceDetails: dispatch, accidentDetails: accident);
    expect(payload?['serviceDetails'], dispatch);
    expect(payload?['accidentDetails'], accident);
  });
  testWidgets(
      'dispatch requires workshop and reason, returns the selected workshop',
      (tester) async {
    Map<String, dynamic>? result;
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () async {
                      result = await showServiceDispatchForm(context);
                    },
                    child: const Text('Открыть'))))));
    await tester.tap(find.text('Открыть'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Отправить на СТО'));
    await tester.pumpAndSettle();
    expect(find.text('Выберите цех'), findsOneWidget);
    expect(find.text('Укажите причину'), findsOneWidget);
    expect(result, isNull);
    await tester.tap(find.byType(DropdownButtonFormField<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Малярный цех').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'Покраска крыла');
    await tester.tap(find.widgetWithText(FilledButton, 'Отправить на СТО'));
    await tester.pumpAndSettle();
    expect(result?['serviceDetails']['workshop'], 'body');
    expect(result?['note'], 'Покраска крыла');
  });
  testWidgets('DTP requires accident details but payer can be assigned later',
      (tester) async {
    await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: ServiceDispatchFormDialog())));
    await tester.tap(find.byType(DropdownButtonFormField<String>).at(1));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ДТП и ремонт').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Отправить на СТО'));
    await tester.pumpAndSettle();
    expect(find.text('Выберите плательщика'), findsNothing);
    expect(
        find.text(
            'Укажите место, дату ДТП, виновника, страховую и второго участника'),
        findsOneWidget);
  });
}
