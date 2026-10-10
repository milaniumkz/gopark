import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/repository.dart';
import 'package:gopark_manager_app/service_screens.dart';

class CalendarRepo extends ManagerRepository {
  CalendarRepo() : super(ManagerApiClient());
  @override
  Future<List<ManagerAssignedDriverDto>> loadDrivers() async => [
        ManagerAssignedDriverDto.fromJson({
          'id': 'test',
          'fullName': 'Учебный водитель',
          'phone': 'test',
          'status': 'maintenance',
          'vehicle': 'TEST'
        })
      ];
  @override
  Future<Map<String, dynamic>> loadDriverCalendar(
          String id, String month) async =>
      {
        'month': month,
        'contractNumber': '101',
        'rate': 2300,
        'paid': 4600,
        'expected': 6900,
        'days': List.generate(
            31,
            (n) => {
                  'day': '2026-10-${(n + 1).toString().padLeft(2, '0')}',
                  'status': n < 2
                      ? 'paid'
                      : n < 4
                          ? 'repair'
                          : 'future',
                  'amount': n < 2 ? 2300 : 0,
                  'expected': 2300,
                  'note': 'Диагностика'
                })
      };
}

Widget app(Widget child, double scale) => MaterialApp(
    locale: const Locale('ru'),
    supportedLocales: const [Locale('ru')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    builder: (c, w) => MediaQuery(
        data: MediaQuery.of(c).copyWith(textScaler: TextScaler.linear(scale)),
        child: w!),
    home: child);
void main() {
  for (final scale in [1.0, 2.0]) {
    testWidgets('payment calendar stays readable at 320px and scale $scale',
        (t) async {
      t.view.physicalSize = const Size(320, 1000);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      await t.pumpWidget(app(
          ManagerPaymentCalendarPage(
              repository: CalendarRepo(), driverId: 'test'),
          scale));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      expect(find.text('Календарь платежей'), findsOneWidget);
      expect(find.text('31'), findsOneWidget);
      await t.tap(find.text('3'));
      await t.pumpAndSettle();
      expect(find.textContaining('Оплачено: 0 сом'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
    testWidgets(
        'repair timeline, work order and payments at 320px and scale $scale',
        (t) async {
      t.view.physicalSize = const Size(320, 1000);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      await t.pumpWidget(app(
          Scaffold(
              body: SingleChildScrollView(
                  child: ManagerRepairCard(
                      title: 'Учебный ремонт',
                      stage: 'in_repair',
                      details: {
                'reason': 'Стук в передней подвеске',
                'sentAt': '2026-10-09T10:00:00Z',
                'arrivedAt': '2026-10-10T04:00:00Z',
                'repairStartedAt': '2026-10-10T05:00:00Z',
                'orderNumber': 'СТО-1',
                'works': ['Диагностика', 'Замена втулок'],
                'serviceCost': 10000,
                'costDate': '2026-10-10',
                'payments': [
                  {
                    'id': 'test',
                    'amount': 4000,
                    'paidAt': '2026-10-10',
                    'payer': 'company'
                  }
                ]
              }))),
          scale));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
      expect(find.text('Заказ-наряд № СТО-1'), findsOneWidget);
    });
  }
}
