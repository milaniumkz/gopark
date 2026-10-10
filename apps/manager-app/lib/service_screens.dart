import 'package:flutter/material.dart';
import 'api.dart';
import 'repository.dart';

Future<Map<String, dynamic>?> showAccidentForm(BuildContext context) async {
  final form = GlobalKey<FormState>();
  final controllers = List.generate(4, (_) => TextEditingController());
  var occurred = DateTime.now();
  String fault = 'unknown', insurer = 'gosstrakh';
  try {
    return await showDialog<Map<String, dynamic>>(
        context: context,
        builder: (dialog) => StatefulBuilder(
            builder: (context, update) => AlertDialog(
                  title: const Text('Оформление ДТП'),
                  content: SizedBox(
                      width: 420,
                      child: SingleChildScrollView(
                          child: Form(
                              key: form,
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    for (var i = 0; i < 4; i++)
                                      Padding(
                                          padding:
                                              const EdgeInsets.only(bottom: 14),
                                          child: TextFormField(
                                              controller: controllers[i],
                                              decoration: InputDecoration(
                                                  labelText: [
                                                'Место происшествия *',
                                                'Госномер второго участника *',
                                                'Марка второго участника *',
                                                'Модель второго участника *'
                                              ][i]),
                                              validator: (v) =>
                                                  v?.trim().isNotEmpty == true
                                                      ? null
                                                      : 'Обязательное поле')),
                                    ListTile(
                                        contentPadding: EdgeInsets.zero,
                                        title: const Text('Дата и время ДТП'),
                                        subtitle: Text(
                                            '${occurred.day}.${occurred.month}.${occurred.year} ${occurred.hour.toString().padLeft(2, '0')}:${occurred.minute.toString().padLeft(2, '0')}'),
                                        trailing:
                                            const Icon(Icons.calendar_month),
                                        onTap: () async {
                                          final date = await showDatePicker(
                                              context: context,
                                              initialDate: occurred,
                                              firstDate: DateTime(2000),
                                              lastDate: DateTime.now());
                                          if (date == null || !context.mounted)
                                            return;
                                          final time = await showTimePicker(
                                              context: context,
                                              initialTime:
                                                  TimeOfDay.fromDateTime(
                                                      occurred));
                                          if (time != null)
                                            update(() => occurred = DateTime(
                                                date.year,
                                                date.month,
                                                date.day,
                                                time.hour,
                                                time.minute));
                                        }),
                                    DropdownButtonFormField<String>(
                                        initialValue: fault,
                                        decoration: const InputDecoration(
                                            labelText: 'Кто виноват'),
                                        items: const [
                                          DropdownMenuItem(
                                              value: 'driver',
                                              child: Text('Наш водитель')),
                                          DropdownMenuItem(
                                              value: 'other',
                                              child: Text('Второй участник')),
                                          DropdownMenuItem(
                                              value: 'both',
                                              child: Text('Оба участника')),
                                          DropdownMenuItem(
                                              value: 'unknown',
                                              child: Text('Не установлен'))
                                        ],
                                        onChanged: (v) => fault = v!),
                                    const SizedBox(height: 14),
                                    DropdownButtonFormField<String>(
                                        initialValue: insurer,
                                        decoration: const InputDecoration(
                                            labelText: 'Страховая компания'),
                                        items: const [
                                          DropdownMenuItem(
                                              value: 'gosstrakh',
                                              child: Text('Госстрах')),
                                          DropdownMenuItem(
                                              value: 'nsk', child: Text('НСК')),
                                          DropdownMenuItem(
                                              value: 'alma',
                                              child: Text('Алма'))
                                        ],
                                        onChanged: (v) => insurer = v!),
                                    const SizedBox(height: 16),
                                    const Text(
                                        'Данные попадут в карточку ДТП в CRM. Фотография не требуется.',
                                        style:
                                            TextStyle(color: Colors.blueGrey)),
                                  ])))),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(dialog),
                        child: const Text('Отмена')),
                    FilledButton(
                        onPressed: () {
                          if (!form.currentState!.validate()) return;
                          if (occurred.isAfter(DateTime.now())) {
                            ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text(
                                        'Дата ДТП не может быть в будущем')));
                            return;
                          }
                          Navigator.pop(dialog, {
                            'location': controllers[0].text.trim(),
                            'otherPlate': controllers[1].text.trim(),
                            'otherMake': controllers[2].text.trim(),
                            'otherModel': controllers[3].text.trim(),
                            'occurredAt': occurred.toUtc().toIso8601String(),
                            'fault': fault,
                            'insurer': insurer
                          });
                        },
                        child: const Text('Сохранить ДТП'))
                  ],
                )));
  } finally {
    for (final c in controllers) {
      c.dispose();
    }
  }
}

class ManagerPaymentCalendarPage extends StatefulWidget {
  const ManagerPaymentCalendarPage(
      {super.key, required this.repository, this.driverId});
  final ManagerRepository repository;
  final String? driverId;
  @override
  State<ManagerPaymentCalendarPage> createState() => _CalendarState();
}

class _CalendarState extends State<ManagerPaymentCalendarPage> {
  DateTime month = DateTime(DateTime.now().year, DateTime.now().month);
  String? driverId;
  late Future<List<ManagerAssignedDriverDto>> drivers;
  Future<Map<String, dynamic>>? calendar;
  static const labels = {
    'paid': 'Оплачено',
    'unpaid': 'Не оплачено',
    'partial': 'Частично',
    'dayoff': 'Выходной',
    'day_off': 'Выходной',
    'asked_leave': 'Отпросился',
    'sick': 'Больничный',
    'repair': 'Ремонт / СТО',
    'accident': 'ДТП',
    'failed': 'Ошибка',
    'future': 'Будущие / вне договора',
    'other': 'Прочее'
  };
  static const colors = {
    'paid': Color(0xffdcfce7),
    'unpaid': Color(0xfffee2e2),
    'partial': Color(0xfffef3c7),
    'dayoff': Color(0xffe2e8f0),
    'day_off': Color(0xffe2e8f0),
    'asked_leave': Color(0xfff3e8ff),
    'sick': Color(0xffcffafe),
    'repair': Color(0xffffedd5),
    'accident': Color(0xfffecaca),
    'failed': Color(0xffe5e7eb),
    'future': Color(0xfff1f5f9),
    'other': Color(0xffe0e7ff)
  };
  @override
  void initState() {
    super.initState();
    driverId = widget.driverId;
    drivers = widget.repository.loadDrivers();
    if (driverId != null) reload();
  }

  void reload() {
    calendar = widget.repository.loadDriverCalendar(
        driverId!, '${month.year}-${month.month.toString().padLeft(2, '0')}');
  }

  void shift(int n) {
    setState(() {
      month = DateTime(month.year, month.month + n);
      if (driverId != null) reload();
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      backgroundColor: const Color(0xfff4f7fb),
      appBar: AppBar(title: const Text('Календарь платежей')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        FutureBuilder<List<ManagerAssignedDriverDto>>(
            future: drivers,
            builder: (context, s) {
              if (s.hasError)
                return TextButton(
                    onPressed: () => setState(
                        () => drivers = widget.repository.loadDrivers()),
                    child: const Text(
                        'Не удалось загрузить водителей. Повторить'));
              if (!s.hasData) return const LinearProgressIndicator();
              final rows = s.data!;
              if (rows.isEmpty) return const Text('Доступных водителей нет');
              return DropdownButtonFormField<String>(
                  initialValue: driverId,
                  decoration: const InputDecoration(
                      labelText: 'Водитель', border: OutlineInputBorder()),
                  isExpanded: true,
                  items: rows
                      .map((d) => DropdownMenuItem(
                          value: d.id,
                          child: Text(d.fullName,
                              overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: (v) => setState(() {
                        driverId = v;
                        reload();
                      }));
            }),
        const SizedBox(height: 16),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          IconButton(
              tooltip: 'Предыдущий месяц',
              onPressed: () => shift(-1),
              icon: const Icon(Icons.chevron_left)),
          Expanded(
              child: Text(
                  '${[
                    'Январь',
                    'Февраль',
                    'Март',
                    'Апрель',
                    'Май',
                    'Июнь',
                    'Июль',
                    'Август',
                    'Сентябрь',
                    'Октябрь',
                    'Ноябрь',
                    'Декабрь'
                  ][month.month - 1]} ${month.year}',
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 18),
                  textAlign: TextAlign.center)),
          IconButton(
              tooltip: 'Следующий месяц',
              onPressed: () => shift(1),
              icon: const Icon(Icons.chevron_right))
        ]),
        if (calendar == null)
          const Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                  'Выберите водителя, чтобы увидеть платежи и статусы по дням.'))
        else
          FutureBuilder<Map<String, dynamic>>(
              future: calendar,
              builder: (context, s) {
                if (s.connectionState != ConnectionState.done)
                  return const Center(child: CircularProgressIndicator());
                if (s.hasError)
                  return TextButton(
                      onPressed: () => setState(reload),
                      child: const Text(
                          'Не удалось загрузить календарь. Повторить'));
                final data = s.data!;
                final days =
                    (data['days'] as List).cast<Map<String, dynamic>>();
                final offset = (month.weekday + 6) % 7;
                return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                          'Договор № ${data['contractNumber'] ?? '—'} · ${data['rate']} сом / день',
                          style: const TextStyle(color: Colors.blueGrey)),
                      const SizedBox(height: 14),
                      Row(
                          children: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
                              .map((d) =>
                                  Expanded(child: Center(child: Text(d))))
                              .toList()),
                      const SizedBox(height: 8),
                      GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: offset + days.length,
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 7,
                                  crossAxisSpacing: 5,
                                  mainAxisSpacing: 5),
                          itemBuilder: (context, n) {
                            if (n < offset) return const SizedBox();
                            final day = days[n - offset];
                            final status = '${day['status']}';
                            return Semantics(
                                label:
                                    '${day['day']}: ${labels[status] ?? status}',
                                button: true,
                                child: InkWell(
                                    onTap: () => showDialog<void>(
                                        context: context,
                                        builder: (c) => AlertDialog(
                                                title: Text(
                                                    '${day['day']} · ${labels[status] ?? status}'),
                                                content: Text('Оплачено: ${day['amount']} сом\nПо графику: ${day['expected']} сом\n${day['note'] ?? ''}'),
                                                actions: [
                                                  TextButton(
                                                      onPressed: () =>
                                                          Navigator.pop(c),
                                                      child:
                                                          const Text('Закрыть'))
                                                ])),
                                    child: Container(
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(
                                            color: colors[status] ??
                                                Colors.grey.shade100,
                                            borderRadius:
                                                BorderRadius.circular(8)),
                                        child: Text('${n - offset + 1}',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.bold,
                                                color: Color(0xff172a45))))));
                          }),
                      const SizedBox(height: 18),
                      Wrap(
                          spacing: 12,
                          runSpacing: 10,
                          children: labels.entries
                              .map((e) => Text.rich(
                                  TextSpan(children: [
                                    WidgetSpan(
                                        child: Container(
                                            width: 10,
                                            height: 10,
                                            color: colors[e.key])),
                                    TextSpan(text: '  ${e.value}')
                                  ]),
                                  style: const TextStyle(fontSize: 12)))
                              .toList()),
                      const SizedBox(height: 20),
                      Card(
                          child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Text(
                                  'Оплачено за месяц: ${data['paid']} сом\nПо графику за месяц: ${data['expected']} сом',
                                  style: const TextStyle(
                                      height: 1.8,
                                      fontWeight: FontWeight.w600)))),
                    ]);
              }),
      ]));
}

List<String> repairDetailLines(Map<String, dynamic>? details) {
  if (details == null) return const [];
  String date(dynamic d) {
    final v = DateTime.tryParse('$d')?.toLocal();
    return v == null
        ? 'Дата не указана'
        : '${v.day}.${v.month}.${v.year} ${v.hour.toString().padLeft(2, '0')}:${v.minute.toString().padLeft(2, '0')}';
  }

  final payments = (details['payments'] as List?) ?? [];
  return [
    'Причина: ${details['reason'] ?? '—'}',
    'Отправлен: ${date(details['sentAt'])}',
    'Прибыл: ${date(details['arrivedAt'])}',
    'Ремонт начат: ${date(details['repairStartedAt'])}',
    'Завершён: ${date(details['completedAt'])}',
    if (details['orderNumber'] != null)
      'Заказ-наряд № ${details['orderNumber']}',
    ...(details['works'] as List? ?? []).map((w) => '• $w'),
    if (details['serviceCost'] != null) 'Услуги: ${details['serviceCost']} сом',
    ...payments.map((p) => 'Оплата: ${p['amount']} сом · ${p['paidAt']} · ${{
          'company': 'GoPark',
          'driver': 'Водитель',
          'insurance': 'Страховая'
        }[p['payer']] ?? p['payer']}')
  ];
}

List<String> accidentDetailLines(Map<String, dynamic>? data) {
  if (data == null) return const [];
  return [
    'Место ДТП: ${data['location']}',
    'Дата ДТП: ${data['occurredAt']}',
    'Виновник: ${{
      'driver': 'Наш водитель',
      'other': 'Второй участник',
      'both': 'Оба участника',
      'unknown': 'Не установлен'
    }[data['fault']]}',
    'Страховая: ${{
      'gosstrakh': 'Госстрах',
      'nsk': 'НСК',
      'alma': 'Алма'
    }[data['insurer']]}',
    'Второй участник: ${data['otherPlate']} · ${data['otherMake']} ${data['otherModel']}'
  ];
}

class ManagerRepairCard extends StatelessWidget {
  const ManagerRepairCard(
      {super.key,
      required this.title,
      required this.stage,
      required this.details,
      this.accidentDetails});
  final String title;
  final String? stage;
  final Map<String, dynamic> details;
  final Map<String, dynamic>? accidentDetails;
  @override
  Widget build(BuildContext context) {
    const stages = [
      'sent_to_service',
      'awaiting_repair',
      'in_repair',
      'completed'
    ];
    const titles = [
      'Отправлен на СТО',
      'Прибыл · в ожидании',
      'В ремонте',
      'Машина готова'
    ];
    const keys = ['sentAt', 'arrivedAt', 'repairStartedAt', 'completedAt'];
    final current = stages.indexOf(stage ?? '');
    String date(dynamic raw) {
      final d = DateTime.tryParse('$raw')?.toLocal();
      return d == null
          ? 'Дата не указана'
          : '${d.day}.${d.month}.${d.year} · ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    }

    final payments = details['payments'] as List? ?? [];
    final paid = payments.fold<num>(0, (s, p) => s + (p['amount'] as num));
    final cost = details['serviceCost'] as num?;
    return Card(
        margin: const EdgeInsets.symmetric(vertical: 8),
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  Align(
                      alignment: Alignment.centerLeft,
                      child: Chip(
                          label: Text(current < 0 ? 'Ремонт' : titles[current]),
                          backgroundColor: const Color(0xfff3e8ff),
                          side: BorderSide.none)),
                  Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                          color: const Color(0xffeff6ff),
                          borderRadius: BorderRadius.circular(10)),
                      child: Text('Причина: ${details['reason']}',
                          style: const TextStyle(height: 1.5))),
                  const SizedBox(height: 12),
                  for (var n = 0; n < 4; n++)
                    Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                  n < current
                                      ? Icons.check_circle
                                      : n == current
                                          ? Icons.radio_button_checked
                                          : Icons.radio_button_unchecked,
                                  color: n <= current
                                      ? const Color(0xff2563eb)
                                      : Colors.blueGrey,
                                  size: 22),
                              const SizedBox(width: 12),
                              Expanded(
                                  child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                    Text(titles[n],
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 4),
                                    Text(date(details[keys[n]]),
                                        style: const TextStyle(
                                            color: Colors.blueGrey,
                                            fontSize: 13))
                                  ]))
                            ])),
                  for (final line in accidentDetailLines(accidentDetails))
                    Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Text(line)),
                  if (details['orderNumber'] != null) ...[
                    const Divider(),
                    Text('Заказ-наряд № ${details['orderNumber']}',
                        style: const TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 8),
                    ...(details['works'] as List? ?? []).map((w) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Text('• $w')))
                  ],
                  if (cost != null) ...[
                    const Divider(),
                    Text('Услуги: $cost сом · ${details['costDate'] ?? ''}'),
                    const SizedBox(height: 8),
                    Text(
                        'Оплачено: $paid сом · остаток ${(cost - paid).clamp(0, cost)} сом')
                  ],
                  for (final p in payments)
                    Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                            '${p['paidAt']} · ${{
                              'company': 'GoPark',
                              'driver': 'Водитель',
                              'insurance': 'Страховая компания'
                            }[p['payer']]} · ${p['amount']} сом',
                            style: const TextStyle(
                                color: Colors.blueGrey, fontSize: 13))),
                  if (current < 3) ...[
                    const SizedBox(height: 12),
                    const Text(
                        'При изменении этапа и готовности машины вы получите уведомление.',
                        style: TextStyle(color: Colors.blueGrey, fontSize: 13))
                  ],
                ])));
  }
}
