import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/main.dart';
import 'package:gopark_manager_app/repository.dart';

const session = ManagerAuthSessionDto(
    accessToken: 'test',
    refreshToken: 'test',
    expiresInSeconds: 3600,
    requestUserId: 'manager',
    requestUserRole: 'manager');
final detail = ManagerDriverDetailDto.fromJson({
  'id': 'driver',
  'fullName': 'Test Driver',
  'phone': 'test',
  'status': 'active',
  'vehicle': 'TEST',
  'debt': 100000,
  'overdueDebt': 500,
  'creditBalance': 1000,
  'yandexBalance': 2000,
  'overdueSinceDate': '2026-10-01',
  'overdueUntilDate': '2026-10-06',
});

class TestRepository extends ManagerRepository {
  TestRepository() : super(ManagerApiClient());
  bool failSummary = true;
  final calendarDrivers = <String>[];
  @override
  Future<Map<String, dynamic>> loadDriverCalendar(
      String id, String month) async {
    calendarDrivers.add(id);
    return {
      'month': month,
      'rate': 2300,
      'paid': 0,
      'expected': 2300,
      'days': [
        {'day': '$month-01', 'status': 'unpaid', 'amount': 0, 'expected': 2300}
      ]
    };
  }

  @override
  Future<List<ManagerAssignedDriverDto>> loadDriversDueYesterday(
          {DateTime? now}) async =>
      [
        ManagerAssignedDriverDto.fromJson({
          'id': 'driver',
          'fullName': 'Test Driver',
          'phone': 'test',
          'status': 'active',
          'vehicle': 'TEST',
          'overdueDebt': 9000,
          'overduePeriodAmount': 2300
        })
      ];
  @override
  Future<List<ManagerAssignedDriverDto>> loadDrivers() async => [
        ManagerAssignedDriverDto.fromJson({
          'id': 'driver',
          'fullName': 'Test Driver',
          'phone': 'test',
          'status': 'active',
          'vehicle': 'TEST',
          'debt': 100000,
          'overdueDebt': 500,
          'creditBalance': 1000,
          'yandexBalance': 2000,
        })
      ];
  @override
  Future<ManagerDriverDetailDto?> loadDriverDetail(String driverId) async =>
      detail;
  @override
  Future<ManagerSummaryDto> loadSummary() async {
    if (failSummary) throw Exception('Сервер недоступен');
    return ManagerSummaryDto.fromJson({'assignedDrivers': 5, 'activeCars': 4});
  }

  @override
  Future<List<ManagerQuickActionDto>> loadQuickActions() async => [];
  @override
  Future<List<ManagerTeamDto>> loadManagers() async => [];
  @override
  Future<List<ManagerIdleVehicleDto>> loadIdleVehicles() async => [];
  @override
  Future<List<ManagerAlertDto>> loadAlerts() async => [];
  @override
  Future<List<ManagerStatusRequestItemDto>> loadStatusRequests() async => [];
}

Widget app(Widget child, {double scale = 1}) => MaterialApp(
      locale: const Locale('ru'),
      supportedLocales: const [Locale('ru')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(scale)),
          child: child!),
      home: child,
    );

void main() {
  test(
      'debt calendar sends a read-only period query and uses the period amount, not the whole debt',
      () async {
    final calls = <http.Request>[];
    final api = ManagerApiClient(
        baseUrl: 'http://test/api',
        httpClient: MockClient((request) async {
          calls.add(request);
          return http.Response(
              jsonEncode([
                {
                  'id': 'driver',
                  'fullName': 'Test',
                  'phone': 'test',
                  'status': 'active',
                  'vehicle': 'TEST',
                  'overdueDebt': 9000,
                  'overduePeriodAmount': 500
                }
              ]),
              200);
        }));
    api.restoreSession(session);
    final repo = ManagerRepository(api);
    expect(
        await repo.loadDriverOverduePeriod(
            'driver', DateTime(2026, 10, 1), DateTime(2026, 10, 6)),
        500);
    expect(calls.single.method, 'GET');
    expect(calls.single.url.queryParameters,
        {'dueDateFrom': '2026-10-01', 'dueDateTo': '2026-10-06'});
    expect(calls.single.headers['authorization'], 'Bearer test');
    await expectLater(
        repo.loadDriverOverduePeriod(
            'outside-scope', DateTime(2026, 10, 1), DateTime(2026, 10, 6)),
        throwsStateError);
  });

  test('yesterday query uses one UTC obligation day including month boundaries',
      () async {
    final calls = <http.Request>[];
    final api = ManagerApiClient(
        baseUrl: 'http://test/api',
        httpClient: MockClient((request) async {
          calls.add(request);
          return http.Response('[]', 200);
        }));
    api.restoreSession(session);
    await ManagerRepository(api)
        .loadDriversDueYesterday(now: DateTime.utc(2026, 11, 1, 0, 5));
    expect(calls.single.url.queryParameters,
        {'dueDateFrom': '2026-10-31', 'dueDateTo': '2026-10-31'});
    expect(calls.single.method, 'GET');
  });
  testWidgets(
      'payment due preview uses yesterday, expansion retains full arrears and automatically loads the same driver calendar',
      (tester) async {
    final repo = TestRepository();
    await tester.pumpWidget(app(Scaffold(
        body: ManagerDriversPage(
            repository: repo,
            initialFilter: ManagerDriverListFilter.paymentDue,
            selectedManagerId: null,
            selectedManagerName: null,
            onFilterChanged: (_) {}))));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Просрочка за вчера'), 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Просрочка за вчера'), findsOneWidget);
    expect(find.text('2 300 сом'), findsOneWidget);
    expect(repo.calendarDrivers, isEmpty);
    await tester.scrollUntilVisible(find.text('Детали и действия'), 200,
        scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Детали и действия'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Детали и действия'));
    await tester.pumpAndSettle();
    expect(find.text('Вся просрочка: 9 000 сом'), findsOneWidget);
    expect(repo.calendarDrivers, ['driver']);
    await tester.scrollUntilVisible(find.text('Календарь платежей'), 200,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('Календарь платежей'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final scale in [1.0, 1.5, 2.0]) {
    testWidgets(
        'driver finance and calendar remain readable at 320px and text scale $scale',
        (tester) async {
      tester.view.physicalSize = const Size(320, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(app(
          ManagerDriverDetailPage(
              repository: TestRepository(), driverId: 'driver'),
          scale: scale));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Переплата'), findsOneWidget);
      expect(find.text('Яндекс'), findsOneWidget);
      expect(find.byIcon(Icons.savings_outlined), findsOneWidget);
      expect(find.byIcon(Icons.currency_exchange_rounded), findsOneWidget);
      await tester.scrollUntilVisible(
          find.text('Выбрать период просрочки'), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Выбрать период просрочки'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Выбрать период просрочки'));
      await tester.pumpAndSettle();
      expect(find.byType(DateRangePickerDialog), findsOneWidget);
      expect(find.text('Готово'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  for (final scale in [1.0, 1.5, 2.0]) {
    testWidgets('driver list stays usable at 320px and text scale $scale',
        (tester) async {
      tester.view.physicalSize = const Size(320, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(app(
          Scaffold(
              body: ManagerDriversPage(
                  repository: TestRepository(),
                  initialFilter: ManagerDriverListFilter.all,
                  selectedManagerId: null,
                  selectedManagerName: null,
                  onFilterChanged: (_) {})),
          scale: scale));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Test Driver'), 200,
          scrollable: find.byType(Scrollable).first);
      expect(find.text('Test Driver'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
      'dashboard error is explicit and retry replaces it with real counts',
      (tester) async {
    final repo = TestRepository();
    await tester.pumpWidget(app(ManagerDashboardPage(
        repository: repo,
        session: session,
        onOpenDrivers: (_) {},
        onOpenManagerDrivers: (_) {},
        onOpenAlerts: (_) {},
        onOpenVehicles: (_) {},
        onOpenInsuranceTo: () {})));
    await tester.pumpAndSettle();
    expect(find.textContaining('Не удалось загрузить данные'), findsOneWidget);
    expect(find.byType(ManagerMetric), findsNothing);
    repo.failSummary = false;
    await tester.tap(find.text('Повторить'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Не удалось загрузить данные'), findsNothing);
    expect(find.byType(ManagerMetric), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
