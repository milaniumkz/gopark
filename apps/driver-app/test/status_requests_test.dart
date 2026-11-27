import 'package:flutter/material.dart';
import 'package:gopark_driver_app/main.dart';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_driver_app/api.dart';

void main() {
  testWidgets('home displays the saved force-majeure request with reason and review status', (t) async {
    final item = DriverStatusRequestDto.fromJson({'id':'fixture','type':'force_majeure','status':'pending','period':'2026-11-27','note':'Больничный','createdAt':'2026-11-27T06:00:00Z'});
    await t.pumpWidget(MaterialApp(home: Scaffold(body: DriverStatusRequestSummary(
      requests: Future.value([item]), onRetry: () async {}, onOpenHistory: () {},
    ))));
    await t.pumpAndSettle();
    expect(find.text('Мои запросы'), findsOneWidget);
    expect(find.textContaining('Больничный'), findsOneWidget);
    expect(find.textContaining('27.11.2026'), findsWidgets);
    expect(find.text('Запросов пока нет'), findsNothing);
    expect(t.takeException(), isNull);
  });

  test('expired authorization is refreshed once; request reason is preserved', () async {
    var posts = 0, refreshes = 0;
    final api = DriverApiClient(baseUrl: 'https://fixture.invalid/api', httpClient: MockClient((r) async {
      if (r.url.path.endsWith('/auth/refresh')) {
        refreshes++;
        return http.Response(jsonEncode({'accessToken':'new','refreshToken':'new-refresh','expiresInSeconds':3600,'requestUserId':'driver','requestUserRole':'driver'}), 200);
      }
      posts++;
      expect(jsonDecode(r.body)['note'], 'Больничный');
      if (posts == 1) return http.Response('{}', 401);
      expect(r.headers['authorization'], 'Bearer new');
      return http.Response(jsonEncode({'id':'request','type':'force_majeure','status':'pending','period':'2026-11-27','note':'Больничный','createdAt':'2026-11-27T06:00:00Z'}), 201, headers: {'content-type':'application/json; charset=utf-8'});
    }))..restoreSession(const DriverAuthSessionDto(accessToken:'old',refreshToken:'refresh',expiresInSeconds:3600,requestUserId:'driver',requestUserRole:'driver',mustChangePassword:false));
    final result = await api.createStatusRequest('driver','force_majeure','2026-11-27','Больничный');
    expect(result.note, 'Больничный');
    expect(result.status, 'pending');
    expect(posts, 2);
    expect(refreshes, 1);
  });
  test('an uncertain server failure is never automatically posted again', () async {
    var posts = 0;
    final api = DriverApiClient(baseUrl:'https://fixture.invalid/api',httpClient:MockClient((r) async {
      posts++;
      return http.Response('{}',504);
    }))..restoreSession(const DriverAuthSessionDto(accessToken:'token',refreshToken:'refresh',expiresInSeconds:3600,requestUserId:'driver',requestUserRole:'driver',mustChangePassword:false));
    await expectLater(api.createStatusRequest('driver','force_majeure','2026-11-27','Больничный'),throwsA(isA<DriverApiException>()));
    expect(posts,1);
  });
}
