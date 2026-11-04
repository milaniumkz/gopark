import 'package:flutter/material.dart';
import 'service_screens.dart' show showAccidentForm, accidentDetailLines;

Future<Map<String, dynamic>?> showServiceDispatchForm(BuildContext context) =>
    showDialog<Map<String, dynamic>>(
        context: context, builder: (_) => const ServiceDispatchFormDialog());

class ServiceDispatchFormDialog extends StatefulWidget {
  const ServiceDispatchFormDialog({super.key});
  @override
  State<ServiceDispatchFormDialog> createState() => _DispatchState();
}

class _DispatchState extends State<ServiceDispatchFormDialog> {
  final form = GlobalKey<FormState>();
  final reason = TextEditingController();
  String? workshop, payer;
  String category = 'repair';
  Map<String, dynamic>? accident;
  bool missingAccident = false;
  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Отправить на СТО'),
        content: SizedBox(
            width: 440,
            child: SingleChildScrollView(
                child: Form(
                    key: form,
                    child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          DropdownButtonFormField<String>(
                              initialValue: workshop,
                              isExpanded: true,
                              decoration:
                                  const InputDecoration(labelText: 'Цех *'),
                              items: const [
                                DropdownMenuItem(
                                    value: 'main', child: Text('Основной цех')),
                                DropdownMenuItem(
                                    value: 'body', child: Text('Малярный цех')),
                                DropdownMenuItem(
                                    value: 'both', child: Text('Оба цеха'))
                              ],
                              validator: (v) =>
                                  v == null ? 'Выберите цех' : null,
                              onChanged: (v) => setState(() => workshop = v)),
                          const SizedBox(height: 16),
                          DropdownButtonFormField<String>(
                              initialValue: category,
                              isExpanded: true,
                              decoration: const InputDecoration(
                                  labelText: 'Вид обращения *'),
                              items: const [
                                DropdownMenuItem(
                                    value: 'repair', child: Text('Ремонт')),
                                DropdownMenuItem(
                                    value: 'accident', child: Text('ДТП')),
                                DropdownMenuItem(
                                    value: 'accident_repair',
                                    child: Text('ДТП и ремонт'))
                              ],
                              onChanged: (v) => setState(() {
                                    category = v!;
                                    missingAccident = false;
                                  })),
                          const SizedBox(height: 16),
                          TextFormField(
                              controller: reason,
                              minLines: 2,
                              maxLines: 4,
                              decoration: const InputDecoration(
                                  labelText: 'Причина отправки на СТО *'),
                              validator: (v) => v?.trim().isNotEmpty == true
                                  ? null
                                  : 'Укажите причину'),
                          if (category != 'repair') ...[
                            const SizedBox(height: 16),
                            DropdownButtonFormField<String>(
                                initialValue: payer ?? 'later',
                                isExpanded: true,
                                decoration: const InputDecoration(
                                    labelText: 'Плательщик (можно позже)'),
                                items: const [
                                  DropdownMenuItem(
                                      value: 'later',
                                      child: Text('Укажут на СТО')),
                                  DropdownMenuItem(
                                      value: 'company', child: Text('GoPark')),
                                  DropdownMenuItem(
                                      value: 'driver', child: Text('Водитель')),
                                  DropdownMenuItem(
                                      value: 'insurance',
                                      child: Text('Страховая компания'))
                                ],
                                onChanged: (v) => setState(
                                    () => payer = v == 'later' ? null : v)),
                            const SizedBox(height: 12),
                            OutlinedButton.icon(
                                icon: const Icon(Icons.description_outlined),
                                label: Text(accident == null
                                    ? 'Заполнить данные ДТП *'
                                    : 'Изменить данные ДТП'),
                                onPressed: () async {
                                  final data = await showAccidentForm(context);
                                  if (data != null && mounted)
                                    setState(() {
                                      accident = data;
                                      missingAccident = false;
                                    });
                                }),
                            if (missingAccident)
                              Text(
                                  'Укажите место, дату ДТП, виновника, страховую и второго участника',
                                  style: TextStyle(
                                      color:
                                          Theme.of(context).colorScheme.error)),
                            if (accident != null)
                              for (final line in accidentDetailLines(accident))
                                Padding(
                                    padding: const EdgeInsets.only(top: 6),
                                    child: Text(line)),
                          ],
                        ])))),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Отмена')),
          FilledButton(
              onPressed: () {
                final valid = form.currentState!.validate();
                setState(() =>
                    missingAccident = category != 'repair' && accident == null);
                if (!valid || missingAccident) return;
                Navigator.pop(context, {
                  'note': reason.text.trim(),
                  'serviceDetails': {
                    'workshop': workshop,
                    'repairCategory': category,
                    if (payer != null) 'expectedPayer': payer
                  },
                  if (category != 'repair') 'accidentDetails': accident
                });
              },
              child: const Text('Отправить на СТО'))
        ],
      );
}
