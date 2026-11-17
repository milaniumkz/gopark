import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/repository.dart';
import 'package:gopark_manager_app/main.dart';

Map<String, dynamic> thread(List<String> texts) => {
  'id':'chat', 'subject':'Чат', 'status':'open', 'unreadCount':0,
  'createdAt':'2026-11-17T00:00:00Z',
  'messages': [for (var i=0;i<texts.length;i++) {
    'id':'m$i', 'threadId':'chat', 'senderRole':'manager',
    'senderName':'Бригадир', 'body':texts[i], 'createdAt':'2026-11-17T00:00:00Z',
  }],
};
http.Response response(List<String> texts) => http.Response(jsonEncode(thread(texts)),200,headers:{'content-type':'application/json; charset=utf-8'});
Widget page(Future<http.Response> Function(http.Request) handler) {
  final api=ManagerApiClient(baseUrl:'https://fixture.invalid/api',httpClient:MockClient(handler))
    ..restoreSession(const ManagerAuthSessionDto(accessToken:'token', refreshToken:'refresh', expiresInSeconds:3600, requestUserId:'manager', requestUserRole:'manager'));
  return MaterialApp(home:ManagerChatThreadPage(repository:ManagerRepository(api),threadId:'chat',title:'Тестовый чат'));
}
void main() {
  testWidgets('pending send is visible, stale poll cannot erase sent message, draft is preserved', (t) async {
    var reads=0;
    final oldPoll=Completer<http.Response>();
    final send=Completer<http.Response>();
    await t.pumpWidget(page((r) async {
      if(r.method=='POST') return send.future;
      reads++;
      return reads==1?response(['Первое']):oldPoll.future;
    }));
    await t.pumpAndSettle();
    await t.pump(const Duration(seconds:2));
    await t.enterText(find.byType(TextField),'Новое');
    await t.tap(find.byIcon(Icons.send_rounded));await t.pump();
    expect(find.text('Отправляется…'),findsOneWidget);
    await t.enterText(find.byType(TextField),'Следующий черновик');
    send.complete(response(['Первое','Новое']));await t.pump();await t.pump(const Duration(milliseconds:300));
    expect(find.text('Отправляется…'),findsNothing);
    expect(find.text('Новое'),findsOneWidget);
    oldPoll.complete(response(['Первое']));await t.pump();
    expect(find.text('Новое'),findsOneWidget);
    expect(find.text('Следующий черновик'),findsOneWidget);
    await t.pumpWidget(const SizedBox());
  });
  testWidgets('incoming messages update without reopening and polls never overlap', (t) async {
    var reads=0;final pending=Completer<http.Response>();
    await t.pumpWidget(page((r) async {
      reads++;return reads==1?response(['Первое']):pending.future;
    }));
    await t.pumpAndSettle();await t.pump(const Duration(seconds:2));
    await t.pump(const Duration(seconds:6));expect(reads,2);
    pending.complete(response(['Первое','Ответ водителя']));await t.pump();await t.pump(const Duration(milliseconds:300));
    expect(find.text('Ответ водителя'),findsOneWidget);
    await t.pumpWidget(const SizedBox());expect(t.takeException(),isNull);
  });
  testWidgets('failed send retains draft and enables retry', (t) async {
    await t.pumpWidget(page((r) async => r.method=='POST'?http.Response('{}',503):response([])));
    await t.pumpAndSettle();await t.enterText(find.byType(TextField),'Не потерять');
    await t.tap(find.byIcon(Icons.send_rounded));await t.pump();await t.pump(const Duration(milliseconds:300));
    expect(find.text('Отправляется…'),findsNothing);
    expect(find.text('Не потерять'),findsOneWidget);
    expect(find.byIcon(Icons.send_rounded),findsOneWidget);
    await t.pumpWidget(const SizedBox());expect(t.takeException(),isNull);
  });
}
