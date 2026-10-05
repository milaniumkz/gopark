class DriverSummary {
  const DriverSummary({
    required this.yandexBalance,
    required this.todayEarnings,
    required this.weekEarnings,
    required this.monthEarnings,
    required this.nextPaymentAmount,
    required this.nextPaymentDate,
    required this.debtAmount,
  });

  final int yandexBalance;
  final int todayEarnings;
  final int weekEarnings;
  final int monthEarnings;
  final int nextPaymentAmount;
  final String nextPaymentDate;
  final int debtAmount;
}

class DriverTrip {
  const DriverTrip({
    required this.from,
    required this.to,
    required this.amount,
    required this.time,
  });

  final String from;
  final String to;
  final int amount;
  final String time;
}

const driverSummary = DriverSummary(
  yandexBalance: 45680,
  todayEarnings: 8540,
  weekEarnings: 52300,
  monthEarnings: 186450,
  nextPaymentAmount: 12500,
  nextPaymentDate: '15.03.2026',
  debtAmount: 23000,
);

const driverTrips = [
  DriverTrip(from: 'Центр', to: 'Аэропорт', amount: 1250, time: '14:30'),
  DriverTrip(from: 'Бишкек Парк', to: 'Ош Базар', amount: 380, time: '13:15'),
  DriverTrip(from: 'Асанбай', to: 'Дордой Плаза', amount: 520, time: '12:40'),
];

