import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_driver_app/api.dart';
import 'package:gopark_driver_app/main.dart';
import 'package:gopark_driver_app/repository.dart';

const session = DriverAuthSessionDto(
    accessToken: 'old',
    refreshToken: 'refresh',
    expiresInSeconds: 1,
    requestUserId: 'driver',
    requestUserRole: 'driver',
    mustChangePassword: false);
Map<String, dynamic> get summary => {
      'driverId': 'driver',
      'driverName': 'Test',
      'currentStatus': 'active',
      'availableToWithdraw': 10000
    };
Map<String, dynamic> get renewed =>
    {...session.toJson(), 'accessToken': 'new', 'refreshToken': 'new-refresh'};

void main() {
  test(
      'expired token refreshes once for parallel reads and persists the new session',
      () async {
    var refreshes = 0;
    var persisted = 0;
    final client = DriverApiClient(
        baseUrl: 'https://fixture.invalid/api',
        onSessionRefreshed: (s) async {
          persisted++;
          expect(s.accessToken, 'new');
        },
        httpClient: MockClient((r) async {
          if (r.url.path.endsWith('/auth/refresh')) {
            refreshes++;
            await Future<void>.delayed(const Duration(milliseconds: 10));
            return http.Response(jsonEncode(renewed), 200);
          }
          if (r.headers['authorization'] == 'Bearer old')
            return http.Response('{}', 401);
          expect(r.headers['authorization'], 'Bearer new');
          return http.Response(
              jsonEncode(r.url.path.endsWith('/payouts') ? [] : summary), 200);
        }))
      ..restoreSession(session);
    final result = await Future.wait(
        [client.getHomeSummary('driver'), client.getPayouts('driver')]);
    expect(result.first, isA<DriverHomeSummaryDto>());
    expect(refreshes, 1);
    expect(persisted, 1);
    expect(client.currentSession?.refreshToken, 'new-refresh');
  });

  test(
      'rejected refresh asks for login and never retries a money-changing POST',
      () async {
    var refreshes = 0;
    final client = DriverApiClient(
        baseUrl: 'https://fixture.invalid/api',
        httpClient: MockClient((r) async {
          if (r.url.path.endsWith('/auth/refresh')) refreshes++;
          return http.Response('{}', 401);
        }))
      ..restoreSession(session);
    await expectLater(
        client.getHomeSummary('driver'),
        throwsA(isA<DriverApiException>()
            .having((e) => e.message, 'message', contains('Войдите'))));
    expect(refreshes, 1);
    await expectLater(
        client.createPayout('driver', 100), throwsA(isA<DriverApiException>()));
    expect(refreshes, 1);
  });

  testWidgets(
      'payout error route has normal Material typography, safe retry and back navigation',
      (tester) async {
    final api = DriverApiClient(
        baseUrl: 'https://fixture.invalid/api',
        httpClient: MockClient((_) async => http.Response('{}', 503)))
      ..restoreSession(session);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Builder(
                builder: (context) => TextButton(
                    onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                            builder: (_) => DriverPayoutPage(
                                repository: DriverRepository(api),
                                driverId: 'driver',
                                onOpenPayments: () {},
                                onOpenActivity: () {}))),
                    child: const Text('Открыть'))))));
    await tester.tap(find.text('Открыть'));
    await tester.pumpAndSettle();
    expect(find.text('Не удалось загрузить баланс'), findsOneWidget);
    final message = find.text(
        'На сервере произошла ошибка. Попробуйте ещё раз или обратитесь к администратору.');
    expect(message, findsOneWidget);
    final text = tester.widget<Text>(message);
    expect(text.style?.fontSize, 14);
    expect(DefaultTextStyle.of(tester.element(message)).style.decoration,
        isNot(TextDecoration.underline));
    await tester.tap(find.text('Обновить'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Открыть'), findsOneWidget);
  });
}
