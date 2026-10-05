import 'package:flutter_test/flutter_test.dart';
import 'package:gopark_driver_app/main.dart';

void main() {
  testWidgets('driver app renders', (WidgetTester tester) async {
    await tester.pumpWidget(const GoParkDriverApp());
    expect(find.text('Вход водителя'), findsWidgets);
  });
}
