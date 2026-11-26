import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_driver_app/api.dart';
import 'package:gopark_driver_app/main.dart';
import 'package:gopark_driver_app/repository.dart';

class ChatFixture {
  int count=80, reads=0; bool fail=false;
  Completer<http.Response>? delayed;
  Map<String,dynamic> data()=>{'id':'chat','subject':'Chat','status':'open','createdAt':'2026-11-26T09:00:00Z','unreadCount':0,'managerName':'Manager','messages':List.generate(count,(i)=>{'id':'m$i','threadId':'chat','senderRole':i.isEven?'driver':'manager','senderName':'Fixture','body':'Message $i: ${'Long text for reading. '*4}','createdAt':'2026-11-26T09:00:00Z'})};
  http.Response response()=>http.Response(jsonEncode(data()),200,headers:{'content-type':'application/json; charset=utf-8'});
  Future<http.Response> handle(http.Request r)async {
    if(r.url.path.endsWith('/chats'))return http.Response(jsonEncode([data()]),200,headers:{'content-type':'application/json; charset=utf-8'});
    reads++;
    if(delayed!=null){final next=delayed!;delayed=null;return next.future;}
    if(fail)throw Exception('fixture offline');
    return response();
  }
  Future<void> open(WidgetTester t)async {
    t.view.physicalSize=const Size(430,932);t.view.devicePixelRatio=1;
    addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);
    final api=DriverApiClient(baseUrl:'https://fixture.invalid/api',httpClient:MockClient(handle))..restoreSession(const DriverAuthSessionDto(accessToken:'token',refreshToken:'refresh',expiresInSeconds:3600,requestUserId:'driver',requestUserRole:'driver',mustChangePassword:false));
    await t.pumpWidget(MaterialApp(home:Scaffold(body:DriverManagerChatPanel(repository:DriverRepository(api),fullScreen:true,onChanged:()async{}))));
    await t.pumpAndSettle();
  }
}
ScrollController controller(WidgetTester t)=>t.widget<ListView>(find.byType(ListView).first).controller!;
Future<void> poll(WidgetTester t)async{await t.pump(const Duration(seconds:3));await t.pump();await t.pump(const Duration(milliseconds:250));}
void main(){
 testWidgets('unchanged polling keeps the same transcript, offset and draft', (t)async{
  final f=ChatFixture();await f.open(t);final c=controller(t);
  c.jumpTo(c.position.maxScrollExtent-200);await t.pump();
  await t.enterText(find.byType(TextField).last,'Unfinished draft');await t.pump();
  final before=c.offset;final list=t.widget<ListView>(find.byType(ListView).first);
  await poll(t);await poll(t);
  expect(c.offset,closeTo(before,1));expect(identical(list,t.widget<ListView>(find.byType(ListView).first)),true);
  expect(find.text('Unfinished draft'),findsOneWidget);expect(find.byType(LinearProgressIndicator),findsNothing);
  expect(f.reads,greaterThan(1));await t.pumpWidget(const SizedBox());expect(t.takeException(),isNull);
 });
 testWidgets('incoming message 60px above the bottom never moves text; new-message button is explicit', (t)async{
  final f=ChatFixture();await f.open(t);final c=controller(t);
  c.jumpTo(c.position.maxScrollExtent-60);await t.pump();final before=c.offset;
  f.count++;await poll(t);expect(c.offset,closeTo(before,1));expect(find.text('Новые сообщения'),findsOneWidget);
  await t.tap(find.text('Новые сообщения'));await t.pumpAndSettle();expect(c.offset,closeTo(c.position.maxScrollExtent,1));
  expect(find.text('Новые сообщения'),findsNothing);await t.pumpWidget(const SizedBox());expect(t.takeException(),isNull);
 });
 testWidgets('scrolling while a poll is pending and temporary errors keep the reading position', (t)async{
  final f=ChatFixture();await f.open(t);final c=controller(t);final delayed=Completer<http.Response>();f.delayed=delayed;
  await t.pump(const Duration(seconds:3));c.jumpTo(c.position.maxScrollExtent-700);await t.pump();final before=c.offset;
  f.count++;delayed.complete(f.response());await t.pumpAndSettle();expect(c.offset,closeTo(before,1));
  f.fail=true;await poll(t);expect(c.offset,closeTo(before,1));expect(find.byType(ListView),findsOneWidget);
  f.fail=false;await poll(t);expect(c.offset,closeTo(before,1));await t.pumpWidget(const SizedBox());expect(t.takeException(),isNull);
 });
 testWidgets('new messages follow only when already at the bottom', (t)async{
  final f=ChatFixture();await f.open(t);final c=controller(t);c.jumpTo(c.position.maxScrollExtent);await t.pump();
  f.count++;await poll(t);expect(c.offset,closeTo(c.position.maxScrollExtent,1));expect(find.text('Новые сообщения'),findsNothing);
  await t.pumpWidget(const SizedBox());expect(t.takeException(),isNull);
 });
 testWidgets('empty history can receive its first message without a controller exception', (t)async{
  final f=ChatFixture()..count=0;await f.open(t);f.count=1;await poll(t);expect(find.byType(ListView),findsOneWidget);
  await t.pumpWidget(const SizedBox());expect(t.takeException(),isNull);
 });
}
