import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gopark_manager_app/service_dispatch_form.dart';

void main() {
  testWidgets('complete accident dispatch preserves entered metadata',
      (t) async {
    Map<String, dynamic>? result;
    await t.pumpWidget(MaterialApp(
        home: Builder(
            builder: (c) => Scaffold(
                body: TextButton(
                    onPressed: () async {
                      result = await showServiceDispatchForm(c);
                    },
                    child: const Text('Open'))))));
    await t.tap(find.text('Open'));
    await t.pumpAndSettle();
    await t.tap(find.byType(DropdownButtonFormField<String>).first);
    await t.pumpAndSettle();
    await t.tap(find.text('Оба цеха').last);
    await t.pumpAndSettle();
    await t.tap(find.byType(DropdownButtonFormField<String>).at(1));
    await t.pumpAndSettle();
    await t.tap(find.text('ДТП').last);
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextFormField), 'Повреждение крыла');
    await t.ensureVisible(find.text('Заполнить данные ДТП *'));
    await t.tap(find.text('Заполнить данные ДТП *'));
    await t.pumpAndSettle();
    for (var i = 0; i < 4; i++) {
      await t.enterText(find.byType(TextFormField).at(i + 1),
          ['Test location', 'TEST-02', 'Test make', 'Test model'][i]);
    }
    await t.ensureVisible(find.byType(DropdownButtonFormField<String>).at(3));
    await t.tap(find.byType(DropdownButtonFormField<String>).at(3));
    await t.pumpAndSettle();
    await t.tap(find.text('Второй участник').last);
    await t.pumpAndSettle();
    await t.ensureVisible(find.byType(DropdownButtonFormField<String>).at(4));
    await t.tap(find.byType(DropdownButtonFormField<String>).at(4));
    await t.pumpAndSettle();
    await t.tap(find.text('НСК').last);
    await t.pumpAndSettle();
    await t.tap(find.text('Сохранить ДТП'));
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    await t.tap(find.widgetWithText(FilledButton, 'Отправить на СТО'));
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    expect(result?['accidentDetails']['otherPlate'], 'TEST-02');
    expect(result?['serviceDetails']['workshop'], 'both');
    expect(
        (result?['serviceDetails'] as Map).containsKey('expectedPayer'), false);
  });
}
