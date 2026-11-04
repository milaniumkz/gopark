import 'package:flutter/material.dart';
import 'repository.dart';
import 'service_dispatch_form.dart';
import 'service_screens.dart' show showAccidentForm;

class ManagerVehicleIncidentActions extends StatefulWidget {
  const ManagerVehicleIncidentActions(
      {super.key,
      required this.repository,
      required this.vehicleId,
      required this.onSaved});
  final ManagerRepository repository;
  final String vehicleId;
  final VoidCallback onSaved;
  @override
  State<ManagerVehicleIncidentActions> createState() => _ActionsState();
}

class _ActionsState extends State<ManagerVehicleIncidentActions> {
  bool busy = false;
  bool submitting = false;
  String? error;
  Future<void> run(String action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      Map<String, dynamic>? data;
      if (action == 'repair') {
        data = await showServiceDispatchForm(context);
      } else if (action == 'accident') {
        final accident = await showAccidentForm(context);
        if (accident != null) data = {'accidentDetails': accident};
      } else {
        final form = GlobalKey<FormState>();
        String note = '';
        data = await showDialog<Map<String, dynamic>>(
            context: context,
            builder: (dialog) => AlertDialog(
                    title: const Text('Штрафстоянка'),
                    content: Form(
                        key: form,
                        child: TextFormField(
                            minLines: 2,
                            maxLines: 4,
                            decoration: const InputDecoration(
                                labelText: 'Причина / место *'),
                            onChanged: (v) => note = v,
                            validator: (v) => v?.trim().isNotEmpty == true
                                ? null
                                : 'Укажите причину или место')),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(dialog),
                          child: const Text('Отмена')),
                      FilledButton(
                          onPressed: () {
                            if (form.currentState!.validate())
                              Navigator.pop(dialog, {'note': note.trim()});
                          },
                          child: const Text('Отправить'))
                    ]));
      }
      if (data == null || !mounted) return;
      setState(() => submitting = true);
      await widget.repository.createVehicleIncidentAction(
          widget.vehicleId, action,
          note: data['note'] as String?,
          serviceDetails: data['serviceDetails'] as Map<String, dynamic>?,
          accidentDetails: data['accidentDetails'] as Map<String, dynamic>?);
      if (mounted) widget.onSaved();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted)
        setState(() {
          busy = false;
          submitting = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Действия с автомобилем',
            style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          OutlinedButton.icon(
              onPressed: busy ? null : () => run('repair'),
              icon: const Icon(Icons.build_outlined),
              label: const Text('СТО / ремонт')),
          OutlinedButton.icon(
              onPressed: busy ? null : () => run('accident'),
              icon: const Icon(Icons.car_crash_outlined),
              label: const Text('ДТП')),
          OutlinedButton.icon(
              onPressed: busy ? null : () => run('impound'),
              icon: const Icon(Icons.local_parking),
              label: const Text('Штрафстоянка')),
        ]),
        if (submitting)
          const Padding(
              padding: EdgeInsets.only(top: 8),
              child: LinearProgressIndicator()),
        if (error != null)
          Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(error!,
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.error))),
      ]);
}
