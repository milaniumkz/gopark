import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/main.dart';
import 'package:gopark_manager_app/repository.dart';

http.Response jsonResponse(Object? data,[int status=200])=>http.Response(jsonEncode(data),status,headers:{'content-type':'application/json; charset=utf-8'});
Future<void> openDrivers(WidgetTester t,Future<http.Response> Function(http.Request) handler)async{
 t.view.physicalSize=const Size(430,932);t.view.devicePixelRatio=1;
 addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);
 final api=ManagerApiClient(baseUrl:'https://fixture.invalid/api',httpClient:MockClient(handler))..restoreSession(const ManagerAuthSessionDto(accessToken:'token',refreshToken:'refresh',expiresInSeconds:3600,requestUserId:'manager',requestUserRole:'manager'));
 await t.pumpWidget(MaterialApp(home:Scaffold(body:ManagerDriversPage(repository:ManagerRepository(api),initialFilter:ManagerDriverListFilter.all,selectedManagerId:null,selectedManagerName:null,onFilterChanged:(_){}))));
 await t.pumpAndSettle();await t.ensureVisible(find.text('Детали и действия'));await t.tap(find.text('Детали и действия'));await t.pumpAndSettle();
}
Map<String,dynamic> driver(bool active)=>{'id':'fixture-driver','fullName':'Fixture Driver','phone':'fixture','status':active?'active':'terminated','vehicle':'TEST','contractId':'historic-or-active','canTerminateContract':active};
http.Response calendar(http.Request r)=>jsonResponse({'month':r.url.queryParameters['month'],'days':[],'paid':0,'expected':0,'rate':2300,'driverName':'Fixture Driver'});
void main(){
 testWidgets('expanded Details and actions includes termination below calendar, cancel never posts; confirm sends once and refreshes', (t)async{
  var active=true,posts=0;final completion=Completer<http.Response>();
  await openDrivers(t,(r)async{
   if(r.method=='POST'){expect(r.url.path,'/api/mobile/manager/drivers/fixture-driver/terminate-contract');posts++;return completion.future;}
   if(r.url.path.contains('/calendar'))return calendar(r);
   return jsonResponse([driver(active)]);
  });
  final button=find.text('Расторгнуть договор');expect(button,findsOneWidget);await t.ensureVisible(button);await t.pumpAndSettle();await t.tap(button);await t.pumpAndSettle();
  await t.tap(find.text('Отмена'));await t.pumpAndSettle();expect(posts,0);
  await t.tap(button);await t.pumpAndSettle();await t.tap(find.text('Расторгнуть'));await t.pump();expect(posts,1);
  active=false;completion.complete(jsonResponse(null));await t.pumpAndSettle();expect(posts,1);expect(find.text('Договор расторгнут'),findsOneWidget);expect(button,findsNothing);expect(t.takeException(),isNull);
 });
 testWidgets('historical contract does not allow termination', (t)async{
  await openDrivers(t,(r)async=>r.url.path.contains('/calendar')?calendar(r):jsonResponse([{...driver(false),'status':'active'}]));
  expect(find.text('Расторгнуть договор'),findsNothing);expect(find.text('Нет действующего договора для расторжения'),findsOneWidget);expect(t.takeException(),isNull);
 });
 testWidgets('failed termination retains action and permits retry', (t)async{
  var posts=0;
  await openDrivers(t,(r)async{if(r.method=='POST'){posts++;return jsonResponse({},503);}return r.url.path.contains('/calendar')?calendar(r):jsonResponse([driver(true)]);});
  final button=find.text('Расторгнуть договор');await t.ensureVisible(button);await t.pumpAndSettle();await t.tap(button);await t.pumpAndSettle();await t.tap(find.text('Расторгнуть'));await t.pumpAndSettle();
  expect(posts,1);expect(button,findsOneWidget);expect(find.textContaining('Не удалось расторгнуть'),findsOneWidget);expect(t.takeException(),isNull);
 });
}
