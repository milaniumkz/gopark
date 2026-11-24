import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gopark_manager_app/api.dart';
import 'package:gopark_manager_app/repository.dart';
import 'package:gopark_manager_app/main.dart';

const session = ManagerAuthSessionDto(accessToken:'old', refreshToken:'refresh', expiresInSeconds:1, requestUserId:'manager', requestUserRole:'manager');
void main() {
  test('300 vehicles reuse one read; mutation invalidates it; failed reads can retry', () async {
    var reads=0; var fail=false;
    final api=ManagerApiClient(baseUrl:'https://fixture.invalid/api', httpClient:MockClient((r) async {
      if(r.method=='POST')return http.Response(jsonEncode({'id':'case','title':'Case','incidentType':'repair','status':'open','priority':'high'}),200);
      reads++; if(fail)return http.Response('{}',503);
      return http.Response(jsonEncode(List.generate(300,(i)=>{'id':'car-$i','plateNumber':'TEST-$i','vin':'TEST-$i','status':'assigned'})),200);
    }))..restoreSession(session);
    final repo=ManagerRepository(api);
    final first=repo.loadVehicles();expect(identical(first,repo.loadVehicles()),true);
    expect((await first).length,300);
    for(var i=0;i<100;i++)expect((await repo.loadVehicles()).length,300);
    expect(reads,1);
    await repo.createVehicleIncidentAction('car-0','repair',note:'Fixture');
    await repo.loadVehicles();expect(reads,2);
    repo.invalidate();fail=true;await expectLater(repo.loadVehicles(),throwsException);
    fail=false;await repo.loadVehicles();expect(reads,4);
  });
  test('parallel expired requests share one bounded session refresh', () async {
    var refreshes=0;
    final api=ManagerApiClient(baseUrl:'https://fixture.invalid/api', httpClient:MockClient((r) async {
      if(r.url.path.endsWith('/auth/refresh')) {refreshes++;await Future<void>.delayed(const Duration(milliseconds:10));return http.Response(jsonEncode({...session.toJson(),'accessToken':'new','refreshToken':'new-refresh'}),200);}
      if(r.headers['authorization']=='Bearer old')return http.Response('{}',401);
      return http.Response('[]',200);
    }))..restoreSession(session);
    await Future.wait([api.getVehicles(),api.getDrivers()]);expect(refreshes,1);
  });
  testWidgets('manager screen shows only assigned vehicles among 300 records and typing does not refetch', (t) async {
    t.view.physicalSize=const Size(430,932);t.view.devicePixelRatio=1;
    addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);
    var vehicleReads=0;
    final api=ManagerApiClient(baseUrl:'https://fixture.invalid/api',httpClient:MockClient((r) async {
      if(r.url.path.endsWith('/vehicles')) {vehicleReads++;return http.Response(jsonEncode(List.generate(300,(i)=>{'id':'car-$i','plateNumber':i<10?'OWN-$i':'OTHER-$i','vin':'VIN-$i','managerId':i<10?'team':'other','status':'assigned'})),200);}
      return http.Response(jsonEncode(List.generate(300,(i)=>{'id':'driver-$i','fullName':'Fixture Driver $i','vehicle':'TEST-$i','phone':'fixture-$i','status':'active','managerId':i<10?'team':'other','overdueDebt':0,'debt':0,'creditBalance':0,'yandexBalance':0})),200);
    }))..restoreSession(session);
    final repo=ManagerRepository(api);
    await t.pumpWidget(MaterialApp(home:Scaffold(body:ManagerDriversPage(repository:repo,initialFilter:ManagerDriverListFilter.all,selectedManagerId:'team',selectedManagerName:'Fixture Manager',onFilterChanged:(_){}))));
    await t.pumpAndSettle();expect(find.text('Автомобили бригадира (10)'),findsOneWidget);expect(find.text('OTHER-10'),findsNothing);
    await t.pumpWidget(MaterialApp(home:Scaffold(body:ManagerVehiclesPage(repository:repo,initialFilter:ManagerVehicleFilter.all,selectedManagerId:'team',selectedManagerName:'Fixture Manager',onFilterChanged:(_){}))));
    await t.pumpAndSettle();await t.enterText(find.byType(TextField).first,'OWN-1');await t.pumpAndSettle();expect(vehicleReads,1);expect(find.byType(CircularProgressIndicator),findsNothing);
    final navigator=t.state<NavigatorState>(find.byType(Navigator));
    navigator.push(MaterialPageRoute<void>(builder:(_)=>const Scaffold(body:Text('Fixture detail'))));await t.pumpAndSettle();navigator.pop();await t.pumpAndSettle();
    expect(vehicleReads,1);expect(find.byType(CircularProgressIndicator),findsNothing);expect(t.takeException(),isNull);
  });
  testWidgets('unresponsive server exits loading with an error', (t) async {
    final api=ManagerApiClient(baseUrl:'https://fixture.invalid/api',httpClient:MockClient((_) => Completer<http.Response>().future))..restoreSession(session);
    await t.pumpWidget(MaterialApp(home:Scaffold(body:ManagerDriversPage(repository:ManagerRepository(api),initialFilter:ManagerDriverListFilter.all,selectedManagerId:null,selectedManagerName:null,onFilterChanged:(_){}))));
    await t.pump();expect(find.byType(CircularProgressIndicator),findsOneWidget);
    await t.pump(const Duration(seconds:26));await t.pump();
    expect(find.byType(CircularProgressIndicator),findsNothing);expect(find.textContaining('Сервер не ответил'),findsWidgets);expect(t.takeException(),isNull);
  });

}
