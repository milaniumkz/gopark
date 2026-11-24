import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gopark_driver_app/main.dart';

void main() {
  testWidgets('driver app renders', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(430, 932);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(const GoParkDriverApp());
    expect(find.text('Вход водителя'), findsWidgets);
  });
}
