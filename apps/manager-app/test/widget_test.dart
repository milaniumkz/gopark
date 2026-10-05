import 'package:flutter_test/flutter_test.dart';
import 'package:gopark_manager_app/main.dart';

void main() {
  testWidgets('manager app renders', (WidgetTester tester) async {
    await tester.pumpWidget(const GoParkManagerApp());
    expect(find.text('Вход бригадира'), findsWidgets);
  });
}
