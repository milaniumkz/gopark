import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/main.dart';
import 'package:gopark_manager_app/repository.dart';

void main() {
  testWidgets('loading and failure do not hide requests; retry loads pending sick-note request', (t) async {
    t.view.physicalSize = const Size(430, 932);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final pending = Completer<http.Response>();
    var reads = 0;
    final api = ManagerApiClient(baseUrl: 'https://fixture.invalid/api', httpClient: MockClient((r) async {
      if (r.url.path.endsWith('/status-requests')) {
        reads++;
        if (reads == 1) return pending.future;
        return http.Response(jsonEncode([{
          'id': 'request', 'driverId': 'driver', 'driverName': 'Fixture Driver',
          'type': 'force_majeure', 'status': 'pending', 'period': '2026-11-27',
          'note': 'Больничный', 'createdAt': '2026-11-27T06:00:00Z',
        }]), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }
      return http.Response('[]', 200);
    }))..restoreSession(const ManagerAuthSessionDto(accessToken: 'token', refreshToken: 'refresh',
      expiresInSeconds: 3600, requestUserId: 'manager', requestUserRole: 'manager'));
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ManagerAlertsPage(
      repository: ManagerRepository(api), initialSection: ManagerAlertsSection.requests, isSeniorManager: false))));
    await t.pump();
    expect(find.text('Нет запросов'), findsNothing);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    pending.complete(http.Response('{}', 503));
    await t.pumpAndSettle();
    expect(find.text('Не удалось загрузить запросы'), findsOneWidget);
    expect(find.text('Нет запросов'), findsNothing);
    final refresh = find.byTooltip('Обновить запросы');
    await t.ensureVisible(refresh);
    await t.tap(refresh);
    await t.pumpAndSettle();
    expect(reads, 2);
    expect(find.text('Fixture Driver'), findsOneWidget);
    expect(find.textContaining('Больничный'), findsOneWidget);
    expect(find.text('Нет запросов'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
