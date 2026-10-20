import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/design.dart';
import 'package:gopark_manager_app/service_screens.dart';
import 'service_screens_test.dart' show CalendarRepo, app;

class CommentRepo extends CalendarRepo {
  String? saved;
  bool fail = true;
  @override
  Future<Map<String, dynamic>> loadDriverCalendar(
      String id, String month) async {
    final data = await super.loadDriverCalendar(id, month);
    final days = (data['days'] as List)
        .map((d) => Map<String, dynamic>.from(d))
        .toList();
    days.first['comment'] = saved;
    data['days'] = days;
    return data;
  }

  @override
  Future<Map<String, dynamic>> saveDriverCalendarComment(
      String id, String day, String comment) async {
    if (fail) throw Exception('offline');
    expect(id, 'test');
    expect(day, '2026-10-01');
    saved = comment.isEmpty ? null : comment;
    return {'day': day, 'comment': saved};
  }
}

void main() {
  test(
      'calendar comment uses authenticated JSON PATCH without changing payment status',
      () async {
    final api = ManagerApiClient(
        baseUrl: 'http://test/api',
        httpClient: MockClient((request) async {
          expect(request.method, 'PATCH');
          expect(request.url.path,
              '/api/mobile/manager/drivers/driver/calendar/2026-10-01/comment');
          expect(request.headers['authorization'], 'Bearer token');
          expect(request.headers['content-type'], 'application/json');
          expect(jsonDecode(request.body), {'comment': 'Причина просрочки'});
          return http.Response(
              jsonEncode({'day': '2026-10-01', 'comment': 'Причина просрочки'}),
              200,
              headers: {'content-type': 'application/json; charset=utf-8'});
        }));
    api.restoreSession(const ManagerAuthSessionDto(
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresInSeconds: 3600,
        requestUserId: 'manager',
        requestUserRole: 'manager'));
    expect(
        (await api.saveDriverCalendarComment(
            'driver', '2026-10-01', 'Причина просрочки'))['comment'],
        'Причина просрочки');
  });
  testWidgets(
      'failed save keeps draft, retry persists comment, reopening permits deletion',
      (t) async {
    final repo = CommentRepo();
    await t.pumpWidget(
        app(ManagerPaymentCalendarPage(repository: repo, driverId: 'test'), 1));
    await t.pumpAndSettle();
    await t.tap(find.text('1').first);
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('calendar-comment')),
        'Банк задержал перевод');
    await t.tap(find.text('Сохранить'));
    await t.pumpAndSettle();
    expect(find.textContaining('Не удалось сохранить комментарий'),
        findsOneWidget);
    expect(find.text('Банк задержал перевод'), findsOneWidget);
    repo.fail = false;
    await t.tap(find.text('Сохранить'));
    await t.pumpAndSettle();
    expect(repo.saved, 'Банк задержал перевод');
    expect(find.byIcon(Icons.chat_bubble_rounded), findsOneWidget);
    await t.tap(find.text('1').first);
    await t.pumpAndSettle();
    expect(find.text('Банк задержал перевод'), findsOneWidget);
    expect(find.textContaining('Оплачено: 2300 сом'), findsOneWidget);
    await t.tap(find.text('Удалить'));
    await t.pumpAndSettle();
    expect(repo.saved, isNull);
    expect(find.byIcon(Icons.chat_bubble_rounded), findsNothing);
    expect(t.takeException(), isNull);
  });
  testWidgets(
      'approved theme respects larger system fonts without startup errors',
      (t) async {
    await t.pumpWidget(MaterialApp(
        theme: ManagerDesign.theme(),
        home: const Scaffold(body: Text('Проверка'))));
    await t.pumpAndSettle();
    final c = t.element(find.text('Проверка'));
    expect(Theme.of(c).textTheme.bodyMedium!.fontSize, 16);
    expect(t.takeException(), isNull);
  });
}
