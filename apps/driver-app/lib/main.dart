import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'platform_storage.dart';
import 'push_notifications.dart';
import 'repository.dart';

const _driverBg = Color(0xFFF2F7F3);
const _driverSurface = Color(0xFFFFFFFF);
const _driverText = Color(0xFF0F172A);
const _driverMuted = Color(0xFF64748B);
const _driverGreen = Color(0xFF16A34A);
const _driverEmerald = Color(0xFF10B981);
const _driverBlue = Color(0xFF2563EB);
const _driverCyan = Color(0xFF06B6D4);
const _driverPurple = Color(0xFF9333EA);
const _driverOrange = Color(0xFFF97316);
const _driverSessionStorageKey = 'gopark_driver_session';
const _driverSessionMaxAge = Duration(days: 30);

String _encodeDriverStoredSession(DriverAuthSessionDto session) {
  return jsonEncode({
    'savedAt': DateTime.now().toUtc().toIso8601String(),
    'session': session.toJson(),
  });
}

Map<String, dynamic>? _decodeDriverStoredSession(String stored) {
  final decoded = jsonDecode(stored);
  if (decoded is! Map<String, dynamic>) {
    return null;
  }

  final sessionJson = decoded['session'];
  if (sessionJson is Map<String, dynamic>) {
    final savedAt = DateTime.tryParse('${decoded['savedAt'] ?? ''}');
    if (savedAt != null &&
        DateTime.now().toUtc().difference(savedAt.toUtc()) >
            _driverSessionMaxAge) {
      return null;
    }

    return sessionJson;
  }

  return decoded;
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const GoParkDriverApp());
}

class GoParkDriverApp extends StatelessWidget {
  const GoParkDriverApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GoPark Driver',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: _driverGreen,
          primary: _driverGreen,
          secondary: _driverEmerald,
          surface: _driverSurface,
        ),
        scaffoldBackgroundColor: _driverBg,
        useMaterial3: true,
        textTheme: ThemeData.light().textTheme.apply(
              bodyColor: _driverText,
              displayColor: _driverText,
            ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: Colors.white.withValues(alpha: 0.94),
          indicatorColor: _driverGreen.withValues(alpha: 0.14),
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => TextStyle(
              fontWeight: FontWeight.w700,
              color: states.contains(WidgetState.selected)
                  ? _driverGreen
                  : _driverMuted,
            ),
          ),
        ),
      ),
      home: const DriverShell(),
    );
  }
}

class DriverShell extends StatefulWidget {
  const DriverShell({super.key});

  @override
  State<DriverShell> createState() => _DriverShellState();
}

class _DriverShellState extends State<DriverShell> with WidgetsBindingObserver {
  int index = 0;
  int unreadNotifications = 0;
  final repository = DriverRepository(DriverApiClient());
  DriverAuthSessionDto? session;
  String? authError;
  String? authInfo;
  bool isAuthenticating = false;
  bool isRequestingPasswordReset = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_restoreStoredSession());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && session != null) {
      unawaited(_refreshStoredSession());
    }
  }

  Future<void> _restoreStoredSession() async {
    final stored = await readStorageValue(_driverSessionStorageKey);
    if (stored == null || stored.isEmpty) {
      return;
    }

    try {
      final decoded = _decodeDriverStoredSession(stored);
      if (decoded == null) {
        await removeStorageValue(_driverSessionStorageKey);
        return;
      }
      final restoredSession = DriverAuthSessionDto.fromJson(decoded);
      repository.restoreSession(restoredSession);
      if (!mounted) {
        return;
      }
      setState(() {
        session = restoredSession;
      });
      unawaited(_refreshStoredSession());
      if (!restoredSession.mustChangePassword) {
        unawaited(_loadUnreadNotifications(restoredSession.requestUserId));
        unawaited(_registerPushToken());
      }
    } catch (_) {
      await removeStorageValue(_driverSessionStorageKey);
    }
  }

  Future<void> _refreshStoredSession() async {
    try {
      final refreshedSession = await repository.refreshSession();
      await writeStorageValue(
        _driverSessionStorageKey,
        _encodeDriverStoredSession(refreshedSession),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        session = refreshedSession;
      });
      if (!refreshedSession.mustChangePassword) {
        unawaited(_registerPushToken());
      }
    } catch (_) {
      if (!mounted) {
        return;
      }
      // Keep the saved session on temporary network/API refresh failures.
      // The user should stay authorized until pressing the explicit sign-out button.
      setState(() {
        authError = null;
        authInfo = null;
      });
    }
  }

  Future<void> _loadUnreadNotifications(String driverId) async {
    try {
      final summary = await repository.loadHomeSummary(driverId);
      if (!mounted) {
        return;
      }
      setState(() {
        unreadNotifications = summary.unreadNotifications;
      });
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final activeSession = session;
    if (activeSession == null) {
      return DriverLoginPage(
        isSubmitting: isAuthenticating,
        isRequestingPasswordReset: isRequestingPasswordReset,
        errorText: authError,
        infoText: authInfo,
        onSubmit: _signIn,
        onPasswordResetRequest: _requestPasswordReset,
      );
    }

    if (activeSession.mustChangePassword) {
      return DriverPasswordChangePage(
        isSubmitting: isAuthenticating,
        errorText: authError,
        onSubmit: _changePassword,
        onSignOut: _signOut,
      );
    }

    void openPayoutPage() {
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => DriverPayoutPage(
            repository: repository,
            driverId: activeSession.requestUserId,
            onOpenPayments: () {
              Navigator.of(context).pop();
              setState(() => index = 1);
            },
            onOpenActivity: () {
              Navigator.of(context).pop();
              setState(() => index = 2);
            },
          ),
        ),
      );
    }

    final pages = [
      DriverDashboardPage(
        repository: repository,
        driverId: activeSession.requestUserId,
        onSummaryChanged: (summary) => setState(() {
          unreadNotifications = summary.unreadNotifications;
        }),
        onOpenPayments: () => setState(() => index = 1),
        onOpenActivity: () => setState(() => index = 2),
        onOpenPayout: openPayoutPage,
        onOpenProfile: () => setState(() => index = 3),
      ),
      DriverPaymentsPage(
        repository: repository,
        driverId: activeSession.requestUserId,
        onOpenActivity: () => setState(() => index = 2),
        onOpenPayout: openPayoutPage,
      ),
      DriverChatPage(
        repository: repository,
        driverId: activeSession.requestUserId,
        onUnreadChanged: (value) => setState(() {
          unreadNotifications = value;
        }),
        onOpenPayout: openPayoutPage,
        onOpenProfile: () => setState(() => index = 3),
      ),
      DriverProfilePage(
        repository: repository,
        driverId: activeSession.requestUserId,
        session: activeSession,
        onOpenPayments: () => setState(() => index = 1),
        onOpenActivity: () => setState(() => index = 2),
        onOpenPayout: openPayoutPage,
        onSignOut: _signOut,
      ),
    ];

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [_driverBg, Color(0xFFE8F6EC)],
          ),
        ),
        child: SafeArea(child: pages[index]),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() {
          index = value;
          if (value == 2) {
            unreadNotifications = 0;
          }
        }),
        destinations: [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            label: 'Главная',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            label: 'Договор',
          ),
          NavigationDestination(
            icon: unreadNotifications > 0
                ? Badge(
                    label: Text(
                      unreadNotifications > 9
                          ? '9+'
                          : unreadNotifications.toString(),
                    ),
                    child: const Icon(Icons.chat_bubble_outline),
                  )
                : const Icon(Icons.chat_bubble_outline),
            label: 'Чат',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: 'Профиль',
          ),
        ],
      ),
    );
  }

  Future<void> _signIn(String login, String password) async {
    final normalizedLogin = _normalizeKgPhoneLogin(login);
    final normalizedPassword = password.trim();

    setState(() {
      isAuthenticating = true;
      authError = null;
      authInfo = null;
    });

    try {
      final nextSession = await repository.authenticate(
        normalizedLogin,
        normalizedPassword,
      );
      await writeStorageValue(
        _driverSessionStorageKey,
        _encodeDriverStoredSession(nextSession),
      );
      setState(() {
        session = nextSession;
        index = 0;
        unreadNotifications = 0;
      });
      if (!nextSession.mustChangePassword) {
        unawaited(_loadUnreadNotifications(nextSession.requestUserId));
        unawaited(_registerPushToken());
      }
    } catch (error) {
      setState(() {
        authError = _driverUserError(error);
        authInfo = null;
      });
    } finally {
      if (mounted) {
        setState(() {
          isAuthenticating = false;
        });
      }
    }
  }

  Future<void> _requestPasswordReset(String login) async {
    final normalizedLogin = _normalizeKgPhoneLogin(login);

    setState(() {
      isRequestingPasswordReset = true;
      authError = null;
      authInfo = null;
    });

    try {
      await repository.requestPasswordReset(normalizedLogin);
      setState(() {
        authInfo =
            'Запрос отправлен. Дождитесь сброса пароля в CRM, потом войдите с паролем 123456.';
      });
    } catch (error) {
      setState(() {
        authError = _driverUserError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          isRequestingPasswordReset = false;
        });
      }
    }
  }

  Future<void> _changePassword(
      String currentPassword, String newPassword) async {
    setState(() {
      isAuthenticating = true;
      authError = null;
      authInfo = null;
    });

    try {
      final nextSession = await repository.changePassword(
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      );
      await writeStorageValue(
        _driverSessionStorageKey,
        _encodeDriverStoredSession(nextSession),
      );
      setState(() {
        session = nextSession;
        index = 0;
        unreadNotifications = 0;
      });
      unawaited(_loadUnreadNotifications(nextSession.requestUserId));
      unawaited(_registerPushToken());
    } catch (error) {
      setState(() {
        authError = _driverUserError(error);
        authInfo = null;
      });
    } finally {
      if (mounted) {
        setState(() {
          isAuthenticating = false;
        });
      }
    }
  }

  void _signOut() {
    unawaited(repository.signOut());
    unawaited(removeStorageValue(_driverSessionStorageKey));
    setState(() {
      session = null;
      authError = null;
      authInfo = null;
      index = 0;
      unreadNotifications = 0;
    });
  }

  Future<void> _registerPushToken() async {
    final token = await DriverPushNotifications.initAndGetToken();
    if (token == null || token.trim().isEmpty) {
      return;
    }

    await repository.registerPushToken(token);
    DriverPushNotifications.listenTokenRefresh(repository.registerPushToken);
  }
}

class DriverDashboardPage extends StatefulWidget {
  const DriverDashboardPage({
    super.key,
    required this.repository,
    required this.driverId,
    required this.onSummaryChanged,
    required this.onOpenPayments,
    required this.onOpenActivity,
    required this.onOpenPayout,
    required this.onOpenProfile,
  });

  final DriverRepository repository;
  final String driverId;
  final ValueChanged<DriverHomeSummaryDto> onSummaryChanged;
  final VoidCallback onOpenPayments;
  final VoidCallback onOpenActivity;
  final VoidCallback onOpenPayout;
  final VoidCallback onOpenProfile;

  @override
  State<DriverDashboardPage> createState() => _DriverDashboardPageState();
}

class _DriverDashboardPageState extends State<DriverDashboardPage> {
  late Future<DriverHomeSummaryDto> _homeFuture;
  late Future<List<DriverNotificationItemDto>> _notificationsFuture;
  late Future<List<DriverPayoutItemDto>> _payoutsFuture;
  late Future<List<DriverStatusRequestDto>> _statusRequestsFuture;
  bool _paymentSubmitting = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _homeFuture = widget.repository.loadHomeSummary(widget.driverId);
    _notificationsFuture = widget.repository.loadNotifications(widget.driverId);
    _payoutsFuture = widget.repository.loadPayouts(widget.driverId);
    _statusRequestsFuture =
        widget.repository.loadStatusRequests(widget.driverId);
  }

  Future<void> _refresh() async {
    setState(() {
      _reload();
    });
    await Future.wait([
      _homeFuture,
      _notificationsFuture,
      _payoutsFuture,
      _statusRequestsFuture,
    ]);
  }

  Future<void> _handleFakeBankPayment(DriverHomeSummaryDto? data) async {
    final messenger = ScaffoldMessenger.of(context);
    final suggestedAmount = _currentPaymentAmount(data);
    if (_paymentSubmitting) {
      return;
    }

    final amount = await _showPartialPaymentSheet(
      context,
      suggestedAmount: suggestedAmount,
    );
    if (!mounted || amount == null || amount <= 0) {
      return;
    }

    setState(() {
      _paymentSubmitting = true;
    });

    try {
      await widget.repository.payCurrentPayment(widget.driverId, amount);
      if (!mounted) {
        return;
      }
      await _refresh();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Оплата через банк проведена: ${_driverMoneyLabel(amount)}',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      messenger.showSnackBar(
        SnackBar(content: Text('Не удалось провести оплату: ${_driverUserError(error)}')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _paymentSubmitting = false;
        });
      }
    }
  }

  Future<void> _pickAndSubmitPhoto() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 42,
        maxWidth: 720,
        maxHeight: 720,
      );
      if (file == null) {
        return;
      }
      final bytes = await file.readAsBytes();
      final dataUrl = 'data:image/jpeg;base64,${base64Encode(bytes)}';
      await widget.repository.submitPhoto(widget.driverId, dataUrl);
      if (!mounted) {
        return;
      }
      await _refresh();
      messenger.showSnackBar(
        const SnackBar(content: Text('Фото отправлено на проверку')),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      messenger.showSnackBar(
        SnackBar(content: Text('Не удалось загрузить фото: ${_driverUserError(error)}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DriverHomeSummaryDto>(
      future: _homeFuture,
      builder: (context, snapshot) {
        final data = snapshot.data;
        if (data != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              widget.onSummaryChanged(data);
            }
          });
        }

        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              _DriverHero(
                title: data?.driverName ?? 'Водитель',
                subtitle: 'GoPark',
                icon: Icons.local_taxi_rounded,
              ),
              if (_driverRequiresPhoto(data)) ...[
                const SizedBox(height: 12),
                _DriverSelfieCard(
                  status: data?.photoStatus ?? 'missing',
                  note: data?.photoReviewNote,
                  onUpload: _pickAndSubmitPhoto,
                ),
              ],
              const SizedBox(height: 12),
              _DriverPaymentActionCard(
                balance: data?.yandexBalance ?? 0,
                currentPayment: _currentPaymentAmount(data),
                paymentDate: _currentPaymentDate(data),
                availableToWithdraw: data?.availableToWithdraw ?? 0,
                overdueDebt: data?.overdueDebt ?? 0,
                submitting: _paymentSubmitting,
                onPay: !_paymentSubmitting && _currentPaymentAmount(data) > 0
                    ? () => _handleFakeBankPayment(data)
                    : null,
                onPayout: widget.onOpenPayout,
              ),
              const SizedBox(height: 12),
              InfoCard(
                title: 'Оплаты',
                lines: [
                  'Сегодня: ${_driverMoneyLabel(_currentPaymentAmount(data))}',
                  'Дата: ${_driverDateLabel(_currentPaymentDate(data))}',
                  'GPS: ${_driverMoneyLabel(data?.gpsDueAmount ?? 0)}',
                  'Страховка: ${_driverMoneyLabel(data?.insuranceDueAmount ?? 0)}',
                ],
                icon: Icons.payments_rounded,
              ),
              const SizedBox(height: 12),
              InfoCard(
                title: 'Вывод с Яндекса',
                lines: [
                  'Баланс: ${_driverMoneyLabel(data?.yandexBalance ?? 0)}',
                  'Доступно: ${_driverMoneyLabel(data?.availableToWithdraw ?? 0)}',
                ],
                icon: Icons.account_balance_wallet_rounded,
              ),
            ],
          ),
        );
      },
    );
  }

  num _currentPaymentAmount(DriverHomeSummaryDto? data) {
    if (data == null) {
      return 0;
    }

    final hasOverdue = data.overdueDebt > 0 ||
        (data.nextPaymentDate != null &&
            data.nextPaymentDate!.compareTo(_driverDateOnly(DateTime.now())) <=
                0);
    final regularPayment =
        hasOverdue || _isDriverDateToday(data.nextPaymentDate)
            ? data.nextPaymentAmount
            : 0;
    return regularPayment + data.gpsDueAmount + data.insuranceDueAmount;
  }

  String? _currentPaymentDate(DriverHomeSummaryDto? data) {
    if (data == null) {
      return null;
    }
    if (_currentPaymentAmount(data) <= 0) {
      return null;
    }
    return _driverDateOnly(DateTime.now());
  }
}

bool _driverRequiresPhoto(DriverHomeSummaryDto? data) {
  final status = data?.photoStatus ?? 'missing';
  return status == 'missing' || status == 'rejected' || status == 'pending';
}

class _DriverSelfieCard extends StatelessWidget {
  const _DriverSelfieCard({
    required this.status,
    required this.note,
    required this.onUpload,
  });

  final String status;
  final String? note;
  final VoidCallback onUpload;

  @override
  Widget build(BuildContext context) {
    final pending = status == 'pending';
    return InfoCard(
      title: pending ? 'Фото на проверке' : 'Загрузите селфи',
      lines: [
        if (status == 'rejected')
          'Фото отклонено: ${note ?? 'загрузите новое'}',
        if (status == 'missing') 'После первого входа нужно подтвердить фото.',
        if (pending) 'Бригадир проверит фото. Пока заменить его нельзя.',
      ],
      icon: Icons.photo_camera_front_outlined,
      action: pending
          ? null
          : FilledButton.icon(
              onPressed: onUpload,
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Сделать селфи'),
            ),
    );
  }
}

class _DriverPaymentActionCard extends StatelessWidget {
  const _DriverPaymentActionCard({
    required this.balance,
    required this.currentPayment,
    required this.paymentDate,
    required this.availableToWithdraw,
    required this.overdueDebt,
    required this.submitting,
    required this.onPay,
    required this.onPayout,
  });

  final num balance;
  final num currentPayment;
  final String? paymentDate;
  final num availableToWithdraw;
  final num overdueDebt;
  final bool submitting;
  final VoidCallback? onPay;
  final VoidCallback onPayout;

  @override
  Widget build(BuildContext context) {
    final hasPayment = currentPayment > 0;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: _driverGreen.withValues(alpha: 0.14)),
        boxShadow: [
          BoxShadow(
            color: _driverGreen.withValues(alpha: 0.10),
            blurRadius: 30,
            offset: const Offset(0, 16),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: _driverGreen.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(
                  Icons.account_balance_rounded,
                  color: _driverGreen,
                ),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Финансы водителя',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        color: _driverText,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Баланс, текущий платёж и вывод',
                      style: TextStyle(color: _driverMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: _DriverMiniAmount(
                  title: 'Баланс',
                  value: _driverMoneyLabel(balance),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _DriverMiniAmount(
                  title: overdueDebt > 0 ? 'К оплате сейчас' : 'Текущий платёж',
                  value: _driverMoneyLabel(currentPayment),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            hasPayment
                ? 'Дата платежа: ${_driverDateLabel(paymentDate)}'
                : 'Активного платежа сейчас нет',
            style: const TextStyle(color: _driverMuted),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: onPay,
                  icon: submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.credit_card_rounded),
                  label: Text(submitting ? 'Проводим' : 'Оплатить'),
                  style: FilledButton.styleFrom(
                    backgroundColor: _driverGreen,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onPayout,
                  icon: const Icon(Icons.account_balance_wallet_outlined),
                  label: Text(
                    availableToWithdraw > 0
                        ? 'Вывод ${_driverMoneyLabel(availableToWithdraw)}'
                        : 'Вывод',
                  ),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DriverMiniAmount extends StatelessWidget {
  const _DriverMiniAmount({
    required this.title,
    required this.value,
  });

  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _driverBg,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(color: _driverMuted)),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              color: _driverText,
              fontSize: 20,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }
}

class DriverPaymentsPage extends StatefulWidget {
  const DriverPaymentsPage({
    super.key,
    required this.repository,
    required this.driverId,
    required this.onOpenActivity,
    required this.onOpenPayout,
  });

  final DriverRepository repository;
  final String driverId;
  final VoidCallback onOpenActivity;
  final VoidCallback onOpenPayout;

  @override
  State<DriverPaymentsPage> createState() => _DriverPaymentsPageState();
}

class _DriverPaymentsPageState extends State<DriverPaymentsPage> {
  late Future<DriverActiveContractDto?> _contractFuture;
  late Future<List<DriverPaymentScheduleItemDto>> _scheduleFuture;
  late Future<List<DriverPaymentStatementItemDto>> _paymentStatementFuture;
  late Future<DriverDebtSummaryDto> _debtFuture;
  _DriverPaymentStatementSort _statementSort =
      _DriverPaymentStatementSort.operationDate;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _contractFuture = widget.repository.loadActiveContract(widget.driverId);
    _scheduleFuture = widget.repository.loadPaymentSchedule(widget.driverId);
    _paymentStatementFuture =
        widget.repository.loadPaymentStatement(widget.driverId);
    _debtFuture = widget.repository.loadDebtSummary(widget.driverId);
  }

  Future<void> _refresh() async {
    setState(_reload);
    await Future.wait([
      _contractFuture,
      _scheduleFuture,
      _paymentStatementFuture,
      _debtFuture,
    ]);
  }

  List<DriverPaymentStatementItemDto> _sortedPaymentStatement(
    List<DriverPaymentStatementItemDto> items,
  ) {
    final sorted = [...items];
    sorted.sort((left, right) {
      final leftDate = _statementSort == _DriverPaymentStatementSort.period
          ? left.paymentForDate
          : left.createdAt;
      final rightDate = _statementSort == _DriverPaymentStatementSort.period
          ? right.paymentForDate
          : right.createdAt;
      return _driverComparableDate(rightDate)
          .compareTo(_driverComparableDate(leftDate));
    });
    return sorted;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DriverActiveContractDto?>(
      future: _contractFuture,
      builder: (context, contractSnapshot) {
        if (contractSnapshot.hasError) {
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const _DriverHero(
                title: 'Платежи и договор',
                subtitle: 'График, прогресс оплат и сроки по договору',
                icon: Icons.receipt_long_rounded,
              ),
              const SizedBox(height: 20),
              _DriverErrorCard(
                title: 'Не удалось загрузить договор',
                lines: const ['Проверь соединение и попробуй обновить экран.'],
                onRetry: _refresh,
              ),
            ],
          );
        }

        final contract = contractSnapshot.data;
        final progress = contract == null || contract.totalCost == 0
            ? 0.0
            : contract.paidAmount / contract.totalCost;

        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const _DriverHero(
                title: 'Платежи и договор',
                subtitle: 'График, прогресс оплат и сроки по договору',
                icon: Icons.receipt_long_rounded,
              ),
              const SizedBox(height: 20),
              if (contract != null) ...[
                HighlightCard(
                  title: contract.contractNumber,
                  value: '${contract.remainingAmount} сом',
                  subtitle: 'Остаток по ${contract.carLabel}',
                  colorA: _driverBlue,
                  colorB: _driverCyan,
                  icon: Icons.directions_car_filled_rounded,
                  badge: '${(progress * 100).round()}%',
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.94),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: _driverText.withValues(alpha: 0.05),
                        blurRadius: 24,
                        offset: const Offset(0, 12),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: _driverBlue.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Icon(
                              Icons.timelapse_rounded,
                              color: _driverBlue,
                            ),
                          ),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Text(
                              'Прогресс выкупа',
                              style: TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          Text(
                            '${(progress * 100).round()}%',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w900,
                              color: _driverBlue,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: progress.clamp(0, 1),
                          minHeight: 12,
                          backgroundColor: _driverBlue.withValues(alpha: 0.08),
                          valueColor:
                              const AlwaysStoppedAnimation<Color>(_driverBlue),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        '${contract.paidAmount} сом оплачено из ${contract.totalCost} сом',
                        style: const TextStyle(color: _driverMuted),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                InfoCard(
                  title: 'Финансовый контур',
                  lines: [
                    'Текущий долг: ${contract.currentDebt} сом',
                    'Остаток к закрытию: ${contract.remainingAmount} сом',
                    'Платёж по договору: ${contract.installmentAmount} сом',
                    'Ближайший день списания: ${contract.installmentDay}',
                  ],
                  icon: Icons.account_balance_wallet_outlined,
                ),
                const SizedBox(height: 16),
                GridView.count(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  children: [
                    MetricTile(
                      title: 'Ежемесячно',
                      value: '${contract.installmentAmount} сом',
                      icon: Icons.wallet_outlined,
                      colorA: _driverPurple,
                      colorB: const Color(0xFFEC4899),
                    ),
                    MetricTile(
                      title: 'День списания',
                      value: '${contract.installmentDay}',
                      icon: Icons.calendar_month_rounded,
                      colorA: _driverOrange,
                      colorB: const Color(0xFFEF4444),
                    ),
                    MetricTile(
                      title: 'Старт',
                      value: contract.startDate,
                      icon: Icons.play_circle_outline_rounded,
                      colorA: _driverGreen,
                      colorB: _driverEmerald,
                    ),
                    MetricTile(
                      title: 'Финиш',
                      value: contract.plannedEndDate,
                      icon: Icons.flag_circle_outlined,
                      colorA: _driverBlue,
                      colorB: _driverCyan,
                    ),
                  ],
                ),
                const SizedBox(height: 20),
              ] else ...[
                const InfoCard(
                  title: 'Нет активного договора',
                  lines: ['Активный договор пока не найден'],
                  icon: Icons.info_outline_rounded,
                ),
                const SizedBox(height: 20),
              ],
              FutureBuilder<DriverDebtSummaryDto>(
                future: _debtFuture,
                builder: (context, debtSnapshot) {
                  return FutureBuilder<List<DriverPaymentScheduleItemDto>>(
                    future: _scheduleFuture,
                    builder: (context, scheduleSnapshot) {
                      if (debtSnapshot.hasError || scheduleSnapshot.hasError) {
                        return const SizedBox.shrink();
                      }

                      return _DriverOverdueAndCalendar(
                        debt: debtSnapshot.data,
                        schedule: scheduleSnapshot.data ?? const [],
                      );
                    },
                  );
                },
              ),
              const SizedBox(height: 20),
              const SectionTitle('Финансовый фокус'),
              const SizedBox(height: 12),
              FutureBuilder<DriverDebtSummaryDto>(
                future: _debtFuture,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return _DriverErrorCard(
                      title: 'Не удалось загрузить долг',
                      lines: const [
                        'Проверь соединение и попробуй обновить экран.',
                      ],
                      onRetry: _refresh,
                    );
                  }

                  final debt = snapshot.data;
                  if (debt == null) {
                    return const InfoCard(
                      title: 'Долг не найден',
                      lines: ['Сводка по долгу пока недоступна.'],
                      icon: Icons.account_balance_wallet_outlined,
                    );
                  }

                  return Column(
                    children: [
                      InfoCard(
                        title: 'Что сейчас важно',
                        lines: [
                          'Общий долг: ${debt.totalDebt} сом',
                          'Просрочка: ${debt.overdueDebt} сом',
                          'Следующий платёж: ${debt.nextPaymentAmount} сом',
                          'Дата следующего платежа: ${_driverDateLabel(debt.nextPaymentDate)}',
                          'Переплата: ${debt.creditBalance} сом',
                        ],
                        icon: Icons.account_balance_wallet_outlined,
                      ),
                      const SizedBox(height: 12),
                      InfoCard(
                        title: 'Следующий шаг',
                        lines: [
                          if (debt.overdueDebt > 0)
                            'Сначала закрой просрочку, потом переходи к следующему платежу.'
                          else if (debt.nextPaymentAmount > 0)
                            'Держи в фокусе ближайший платёж ${debt.nextPaymentAmount} сом.'
                          else if (debt.creditBalance > 0)
                            'Сейчас есть переплата. Проверь события и следующие начисления.'
                          else
                            'Открой события или профиль, если нужно проверить статус и договор.',
                        ],
                        icon: Icons.explore_outlined,
                      ),
                      const SizedBox(height: 12),
                      GridView.count(
                        crossAxisCount: 2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        children: [
                          MetricTile(
                            title: 'Общий долг',
                            value: '${debt.totalDebt} сом',
                            icon: Icons.payments_outlined,
                            colorA: _driverBlue,
                            colorB: _driverCyan,
                          ),
                          MetricTile(
                            title: 'Просрочка',
                            value: '${debt.overdueDebt} сом',
                            icon: Icons.warning_amber_rounded,
                            colorA: _driverOrange,
                            colorB: const Color(0xFFEF4444),
                          ),
                          MetricTile(
                            title: 'След. платёж',
                            value: '${debt.nextPaymentAmount} сом',
                            icon: Icons.calendar_month_outlined,
                            colorA: _driverPurple,
                            colorB: const Color(0xFFEC4899),
                          ),
                          MetricTile(
                            title: 'Переплата',
                            value: '${debt.creditBalance} сом',
                            icon: Icons.savings_outlined,
                            colorA: _driverGreen,
                            colorB: _driverEmerald,
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          OutlinedButton.icon(
                            onPressed: widget.onOpenActivity,
                            icon: const Icon(Icons.notifications_outlined),
                            label: const Text('Чат'),
                          ),
                          FilledButton.icon(
                            onPressed: widget.onOpenPayout,
                            icon: const Icon(
                                Icons.account_balance_wallet_outlined),
                            label: const Text('К выводу'),
                            style: FilledButton.styleFrom(
                              backgroundColor: _driverGreen,
                            ),
                          ),
                        ],
                      ),
                    ],
                  );
                },
              ),
              const SizedBox(height: 20),
              const SectionTitle('Выписка по платежам'),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.94),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: _driverText.withValues(alpha: 0.05),
                      blurRadius: 24,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Сортировка выписки',
                      style:
                          TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        _DriverFeedFilterChip(
                          label: 'По дате оплаты',
                          selected: _statementSort ==
                              _DriverPaymentStatementSort.operationDate,
                          onSelected: () => setState(() {
                            _statementSort =
                                _DriverPaymentStatementSort.operationDate;
                          }),
                        ),
                        _DriverFeedFilterChip(
                          label: 'По периоду',
                          selected: _statementSort ==
                              _DriverPaymentStatementSort.period,
                          onSelected: () => setState(() {
                            _statementSort = _DriverPaymentStatementSort.period;
                          }),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              FutureBuilder<List<DriverPaymentStatementItemDto>>(
                future: _paymentStatementFuture,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return _DriverErrorCard(
                      title: 'Не удалось загрузить выписку',
                      lines: const [
                        'Проверь соединение и попробуй обновить экран.',
                      ],
                      onRetry: _refresh,
                    );
                  }

                  final items =
                      _sortedPaymentStatement(snapshot.data ?? const []);
                  if (items.isEmpty) {
                    return const InfoCard(
                      title: 'Выписка пустая',
                      lines: ['После первой оплаты записи появятся здесь.'],
                      icon: Icons.receipt_long_outlined,
                    );
                  }

                  return Column(
                    children: items
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: DriverTimelineCard(
                              title:
                                  '${_driverMoneyLabel(item.amount)} · ${_driverDateLabel(item.createdAt)}',
                              subtitle:
                                  'Период: ${_driverDateLabel(item.paymentForDate)} · зачтено ${_driverMoneyLabel(item.appliedAmount)}${item.unappliedAmount > 0 ? ' · остаток ${_driverMoneyLabel(item.unappliedAmount)}' : ''}',
                              badge: _driverPaymentStatusLabel(item.status),
                              icon: Icons.payments_rounded,
                              accent: _driverPaymentStatusColor(item.status),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
              const SizedBox(height: 20),
              const SectionTitle('График платежей'),
              const SizedBox(height: 12),
              FutureBuilder<List<DriverPaymentScheduleItemDto>>(
                future: _scheduleFuture,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return _DriverErrorCard(
                      title: 'Не удалось загрузить график',
                      lines: const [
                        'Проверь соединение и попробуй обновить экран.',
                      ],
                      onRetry: _refresh,
                    );
                  }

                  final items = snapshot.data ?? const [];
                  if (items.isEmpty) {
                    return const InfoCard(
                      title: 'Платежей пока нет',
                      lines: ['График появится после активации договора'],
                      icon: Icons.event_busy_outlined,
                    );
                  }

                  return Column(
                    children: items
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: DriverTimelineCard(
                              title:
                                  '${_driverPaymentTypeLabel(item.type)} ${item.dueDate}',
                              subtitle: _driverPaymentScheduleSubtitle(item),
                              badge: _driverScheduleBadge(item.status),
                              icon: Icons.event_note_rounded,
                              accent: _driverScheduleColor(item.status),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

class _DriverOverdueAndCalendar extends StatelessWidget {
  const _DriverOverdueAndCalendar({
    required this.debt,
    required this.schedule,
  });

  final DriverDebtSummaryDto? debt;
  final List<DriverPaymentScheduleItemDto> schedule;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final todayOnly = _driverDateOnly(today);
    final overdueItems = schedule.where((item) {
      return _driverScheduleDayStatus(item, todayOnly) == 'overdue';
    }).toList();
    final remainingOverdueAmount = overdueItems.fold<num>(
      0,
      (sum, item) =>
          sum + (item.amount - item.paidAmount).clamp(0, item.amount),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: remainingOverdueAmount > 0
                  ? _driverOrange.withValues(alpha: 0.25)
                  : _driverGreen.withValues(alpha: 0.18),
            ),
            boxShadow: [
              BoxShadow(
                color: _driverText.withValues(alpha: 0.05),
                blurRadius: 22,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: remainingOverdueAmount > 0
                      ? _driverOrange.withValues(alpha: 0.14)
                      : _driverGreen.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  remainingOverdueAmount > 0
                      ? Icons.warning_amber_rounded
                      : Icons.verified_rounded,
                  color:
                      remainingOverdueAmount > 0 ? _driverOrange : _driverGreen,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Просрочка',
                      style: TextStyle(
                        color: _driverMuted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_driverMoneyLabel(debt?.overdueDebt ?? remainingOverdueAmount)} · ${overdueItems.length} дн.',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        color: _driverText,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      overdueItems.isEmpty
                          ? 'Просроченных дней нет'
                          : 'Осталось закрыть: ${overdueItems.length} дней на ${_driverMoneyLabel(remainingOverdueAmount)}',
                      style: const TextStyle(color: _driverMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _DriverPaymentCalendar(schedule: schedule, month: today),
      ],
    );
  }
}

class _DriverPaymentCalendar extends StatefulWidget {
  const _DriverPaymentCalendar({
    required this.schedule,
    required this.month,
  });

  final List<DriverPaymentScheduleItemDto> schedule;
  final DateTime month;

  @override
  State<_DriverPaymentCalendar> createState() => _DriverPaymentCalendarState();
}

class _DriverPaymentCalendarState extends State<_DriverPaymentCalendar> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    _month = DateTime(widget.month.year, widget.month.month);
  }

  @override
  Widget build(BuildContext context) {
    final firstDay = DateTime(_month.year, _month.month);
    final daysCount = DateTime(_month.year, _month.month + 1, 0).day;
    final todayOnly = _driverDateOnly(DateTime.now());
    final byDate = <String, List<DriverPaymentScheduleItemDto>>{};
    for (final item in widget.schedule) {
      (byDate[item.dueDate] ??= []).add(item);
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: _driverText.withValues(alpha: 0.05),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: () => setState(() {
                  _month = DateTime(_month.year, _month.month - 1);
                }),
                icon: const Icon(Icons.chevron_left_rounded),
                tooltip: 'Предыдущий месяц',
              ),
              Expanded(
                child: Text(
                  '${_driverMonthName(firstDay.month)} ${firstDay.year}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              IconButton(
                onPressed: () => setState(() {
                  _month = DateTime(_month.year, _month.month + 1);
                }),
                icon: const Icon(Icons.chevron_right_rounded),
                tooltip: 'Следующий месяц',
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: const [
              _DriverCalendarLegend(color: _driverGreen, label: 'оплачено'),
              _DriverCalendarLegend(color: _driverOrange, label: 'частично'),
              _DriverCalendarLegend(
                  color: Color(0xFFEF4444), label: 'просрочка'),
              _DriverCalendarLegend(
                  color: Color(0xFFE5E7EB), label: 'нет платежа'),
            ],
          ),
          const SizedBox(height: 14),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: daysCount,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              crossAxisSpacing: 6,
              mainAxisSpacing: 6,
              childAspectRatio: 0.92,
            ),
            itemBuilder: (context, index) {
              final day = DateTime(_month.year, _month.month, index + 1);
              final date = _driverDateOnly(day);
              final items = byDate[date] ?? const [];
              final status = items.isEmpty
                  ? 'empty'
                  : _driverCalendarAggregateStatus(items, todayOnly);
              final amount = items.fold<num>(
                0,
                (sum, item) =>
                    sum + (item.amount - item.paidAmount).clamp(0, item.amount),
              );
              return _DriverCalendarDay(
                day: index + 1,
                status: status,
                amount: amount,
                isToday: date == todayOnly,
              );
            },
          ),
        ],
      ),
    );
  }
}

class _DriverCalendarLegend extends StatelessWidget {
  const _DriverCalendarLegend({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: _driverMuted,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _DriverCalendarDay extends StatelessWidget {
  const _DriverCalendarDay({
    required this.day,
    required this.status,
    required this.amount,
    required this.isToday,
  });

  final int day;
  final String status;
  final num amount;
  final bool isToday;

  @override
  Widget build(BuildContext context) {
    final color = _driverCalendarStatusColor(status);
    final hasPayment = status != 'empty';
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: hasPayment ? 0.92 : 1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isToday ? _driverBlue : Colors.transparent,
          width: 1.4,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '$day',
            style: TextStyle(
              color:
                  hasPayment && status != 'future' ? Colors.white : _driverText,
              fontWeight: FontWeight.w900,
              fontSize: 12,
            ),
          ),
          if (amount > 0) ...[
            const SizedBox(height: 2),
            Text(
              amount.round() >= 1000
                  ? '${(amount / 1000).round()}к'
                  : '${amount.round()}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: hasPayment && status != 'future'
                    ? Colors.white.withValues(alpha: 0.9)
                    : _driverMuted,
                fontSize: 9,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class DriverPayoutPage extends StatefulWidget {
  const DriverPayoutPage({
    super.key,
    required this.repository,
    required this.driverId,
    required this.onOpenPayments,
    required this.onOpenActivity,
  });

  final DriverRepository repository;
  final String driverId;
  final VoidCallback onOpenPayments;
  final VoidCallback onOpenActivity;

  @override
  State<DriverPayoutPage> createState() => _DriverPayoutPageState();
}

class _DriverPayoutPageState extends State<DriverPayoutPage> {
  int selectedAmount = 5000;
  bool isSubmitting = false;
  late final TextEditingController amountController;
  late final TextEditingController cardNumberController;
  late final TextEditingController cardHolderController;
  late Future<DriverHomeSummaryDto> _summaryFuture;
  late Future<List<DriverPayoutItemDto>> _payoutsFuture;

  @override
  void initState() {
    super.initState();
    amountController = TextEditingController();
    cardNumberController = TextEditingController();
    cardHolderController = TextEditingController();
    _reload();
  }

  void _reload() {
    _summaryFuture = widget.repository.loadHomeSummary(widget.driverId);
    _payoutsFuture = widget.repository.loadPayouts(widget.driverId);
  }

  Future<void> _refresh() async {
    setState(_reload);
    await Future.wait([_summaryFuture, _payoutsFuture]);
  }

  @override
  void dispose() {
    amountController.dispose();
    cardNumberController.dispose();
    cardHolderController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DriverHomeSummaryDto>(
      future: _summaryFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const _DriverHero(
                title: 'Вывод средств',
                subtitle: 'Баланс, выбор суммы и история заявок',
                icon: Icons.account_balance_wallet_rounded,
              ),
              const SizedBox(height: 20),
              _DriverErrorCard(
                title: 'Не удалось загрузить баланс',
                lines: const ['Проверь соединение и попробуй обновить экран.'],
                onRetry: _refresh,
              ),
            ],
          );
        }

        final data = snapshot.data;
        final available = (data?.availableToWithdraw ?? 0).toInt();
        final quickAmounts = <int>{5000, 10000, 20000, available}
            .where((value) => value > 0)
            .toList()
          ..sort();
        final customAmount = int.tryParse(amountController.text.trim());
        final requestedBase = customAmount ?? selectedAmount;
        final int amountToRequest =
            available > 0 ? requestedBase.clamp(0, available) : 0;
        final hasInvalidCustomAmount =
            amountController.text.trim().isNotEmpty && customAmount == null;
        final cardDigits = cardNumberController.text.replaceAll(
          RegExp(r'\D'),
          '',
        );
        final cardHolder = cardHolderController.text.trim();
        final canUseCard = cardDigits.length >= 12 && cardHolder.length >= 3;
        final payoutDestination = canUseCard
            ? 'Карта **** ${cardDigits.substring(cardDigits.length - 4)} · $cardHolder'
            : null;

        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const _DriverHero(
                title: 'Вывод средств',
                subtitle: 'Баланс, выбор суммы и история заявок',
                icon: Icons.account_balance_wallet_rounded,
              ),
              const SizedBox(height: 20),
              HighlightCard(
                title: 'Доступно к выводу',
                value: '$available сом',
                subtitle: 'Баланс Яндекс: ${data?.yandexBalance ?? 0} сом',
                colorA: const Color(0xFFEAB308),
                colorB: _driverOrange,
                icon: Icons.wallet_rounded,
                badge: available > 0 ? 'Готово' : 'Пусто',
              ),
              const SizedBox(height: 16),
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  MetricTile(
                    title: 'Выбранная сумма',
                    value: '$amountToRequest сом',
                    icon: Icons.tune_rounded,
                    colorA: _driverBlue,
                    colorB: _driverCyan,
                  ),
                  MetricTile(
                    title: 'Проверка данных',
                    value: available > 0 ? 'Активна' : 'Ожидание',
                    icon: Icons.policy_outlined,
                    colorA: _driverPurple,
                    colorB: const Color(0xFFEC4899),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              InfoCard(
                title: 'Следующий шаг',
                lines: [
                  if (available > 0)
                    'Можно создать заявку на вывод прямо сейчас.'
                  else if ((data?.yandexBalance ?? 0) > 0)
                    'Баланс есть, но свободной суммы на вывод пока нет. Проверь платежи и события.'
                  else
                    'Сейчас свободного остатка нет. Сначала накопи баланс или проверь новые события.',
                ],
                icon: Icons.explore_outlined,
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  OutlinedButton.icon(
                    onPressed: widget.onOpenPayments,
                    icon: const Icon(Icons.receipt_long_outlined),
                    label: const Text('Платежи'),
                  ),
                  OutlinedButton.icon(
                    onPressed: widget.onOpenActivity,
                    icon: const Icon(Icons.notifications_outlined),
                    label: const Text('Чат'),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.94),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: _driverText.withValues(alpha: 0.05),
                      blurRadius: 24,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Быстрый выбор суммы',
                      style:
                          TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Сумма проверяется по доступному балансу и уже созданным заявкам.',
                      style: TextStyle(color: _driverMuted, height: 1.5),
                    ),
                    const SizedBox(height: 16),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: quickAmounts
                          .map(
                            (value) => DriverAmountChip(
                              label: value == available
                                  ? 'Все $value'
                                  : '$value сом',
                              selected: amountToRequest == value,
                              onTap: () => setState(() {
                                selectedAmount = value;
                                amountController.text = '';
                              }),
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: amountController,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: _driverInputDecoration(
                        'Своя сумма вывода',
                        Icons.edit_note_rounded,
                      ).copyWith(
                        helperText: available > 0
                            ? 'Максимум доступно $available сом'
                            : 'Сейчас вывод недоступен',
                        errorText: hasInvalidCustomAmount
                            ? 'Введите сумму цифрами'
                            : null,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: cardNumberController,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: _driverInputDecoration(
                        'Номер карты для вывода',
                        Icons.credit_card_rounded,
                      ).copyWith(
                        helperText: 'Введите карту, куда отправлять вывод',
                        errorText: cardNumberController.text.isNotEmpty &&
                                cardDigits.length < 12
                            ? 'Проверь номер карты'
                            : null,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: cardHolderController,
                      textCapitalization: TextCapitalization.words,
                      decoration: _driverInputDecoration(
                        'Имя владельца карты',
                        Icons.person_outline_rounded,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 18),
                    FilledButton(
                      onPressed: available == 0 ||
                              isSubmitting ||
                              hasInvalidCustomAmount ||
                              amountToRequest <= 0 ||
                              !canUseCard
                          ? null
                          : () async {
                              setState(() => isSubmitting = true);
                              try {
                                await widget.repository.requestPayout(
                                  widget.driverId,
                                  amountToRequest,
                                  payoutDestination: payoutDestination,
                                );
                                if (!context.mounted) {
                                  return;
                                }
                                setState(_reload);
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text('Заявка на вывод создана'),
                                  ),
                                );
                              } finally {
                                if (mounted) {
                                  setState(() => isSubmitting = false);
                                }
                              }
                            },
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(56),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(18),
                        ),
                        backgroundColor: _driverOrange,
                      ),
                      child: Text(
                        isSubmitting
                            ? 'Отправка...'
                            : 'Создать заявку на $amountToRequest сом',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              const SectionTitle('История заявок'),
              const SizedBox(height: 12),
              FutureBuilder<List<DriverPayoutItemDto>>(
                future: _payoutsFuture,
                builder: (context, payoutSnapshot) {
                  if (payoutSnapshot.hasError) {
                    return _DriverErrorCard(
                      title: 'Не удалось загрузить историю заявок',
                      lines: const [
                        'Проверь соединение и попробуй обновить экран.',
                      ],
                      onRetry: _refresh,
                    );
                  }

                  final items = payoutSnapshot.data ?? const [];
                  if (items.isEmpty) {
                    return const InfoCard(
                      title: 'Заявок пока нет',
                      lines: ['Здесь появятся созданные заявки'],
                      icon: Icons.outbox_outlined,
                    );
                  }

                  return Column(
                    children: items
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: DriverTimelineCard(
                              title: 'Заявка на вывод',
                              subtitle:
                                  '${item.amount} сом • ${_driverPayoutBadge(item.status)}',
                              badge: _driverPayoutBadge(item.status),
                              icon: Icons.account_balance_outlined,
                              accent: _driverPayoutColor(item.status),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

class DriverActivityPage extends StatefulWidget {
  const DriverActivityPage({
    super.key,
    required this.repository,
    required this.driverId,
    required this.onSummaryChanged,
    required this.onOpenPayments,
    required this.onOpenPayout,
    required this.onOpenProfile,
  });

  final DriverRepository repository;
  final String driverId;
  final ValueChanged<DriverHomeSummaryDto> onSummaryChanged;
  final VoidCallback onOpenPayments;
  final VoidCallback onOpenPayout;
  final VoidCallback onOpenProfile;

  @override
  State<DriverActivityPage> createState() => _DriverActivityPageState();
}

class _DriverActivityPageState extends State<DriverActivityPage> {
  late Future<DriverHomeSummaryDto> _summaryFuture;
  late Future<List<DriverNotificationItemDto>> _notificationsFuture;
  late Future<List<DriverPayoutItemDto>> _payoutsFuture;
  late Future<List<DriverStatusRequestDto>> _statusRequestsFuture;
  _DriverActivityFeedFilter _selectedFeedFilter = _DriverActivityFeedFilter.all;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _summaryFuture = widget.repository.loadHomeSummary(widget.driverId);
    _notificationsFuture = widget.repository.loadNotifications(widget.driverId);
    _payoutsFuture = widget.repository.loadPayouts(widget.driverId);
    _statusRequestsFuture =
        widget.repository.loadStatusRequests(widget.driverId);
  }

  Future<void> _refresh() async {
    setState(_reload);
    await Future.wait([
      _summaryFuture,
      _notificationsFuture,
      _payoutsFuture,
      _statusRequestsFuture,
    ]);
  }

  Future<void> _submitQuickStatusRequest(
    String type,
    String successMessage,
  ) async {
    final confirmed = await _confirmQuickStatusRequest(
      context,
      type: type,
      period: _driverDateOnly(DateTime.now()),
    );
    if (!mounted || !confirmed) {
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    final period = _driverDateOnly(DateTime.now());
    final note = type == 'force_majeure'
        ? await _showForceMajeureReasonDialog(context)
        : null;
    if (!mounted || (type == 'force_majeure' && note == null)) {
      return;
    }

    try {
      await widget.repository.requestStatus(
        widget.driverId,
        type,
        period,
        note: note,
      );
      if (!mounted) {
        return;
      }
      await _refresh();
      messenger.showSnackBar(
        SnackBar(content: Text(successMessage)),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      messenger.showSnackBar(
        SnackBar(
          content: Text(_driverStatusRequestErrorMessage(error)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<DriverHomeSummaryDto>(
      future: _summaryFuture,
      builder: (context, summarySnapshot) {
        if (summarySnapshot.hasError) {
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const _DriverHero(
                title: 'Чат',
                subtitle: 'Сообщения, заявки и статусы',
                icon: Icons.notifications_active_outlined,
              ),
              const SizedBox(height: 20),
              _DriverErrorCard(
                title: 'Не удалось загрузить события',
                lines: const ['Проверь соединение и попробуй обновить экран.'],
                onRetry: _refresh,
              ),
            ],
          );
        }

        final summary = summarySnapshot.data;
        if (summary != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              widget.onSummaryChanged(summary);
            }
          });
        }

        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const _DriverHero(
                title: 'Чат',
                subtitle: 'Диалог с бригадиром, заявки и статусы',
                icon: Icons.chat_bubble_outline_rounded,
              ),
              const SizedBox(height: 20),
              DriverManagerChatPanel(
                repository: widget.repository,
                onChanged: _refresh,
              ),
              const SizedBox(height: 20),
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  MetricTile(
                    title: 'Новые уведомления',
                    value: '${summary?.unreadNotifications ?? 0}',
                    icon: Icons.notifications_active_outlined,
                    colorA: _driverOrange,
                    colorB: const Color(0xFFEF4444),
                  ),
                  MetricTile(
                    title: 'К выводу',
                    value: '${summary?.availableToWithdraw ?? 0} сом',
                    icon: Icons.account_balance_wallet_outlined,
                    colorA: _driverBlue,
                    colorB: _driverCyan,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  OutlinedButton.icon(
                    onPressed: widget.onOpenPayments,
                    icon: const Icon(Icons.receipt_long_outlined),
                    label: const Text('Платежи'),
                  ),
                  FilledButton.icon(
                    onPressed: widget.onOpenPayout,
                    icon: const Icon(Icons.account_balance_wallet_outlined),
                    label: const Text('К выводу'),
                    style: FilledButton.styleFrom(
                      backgroundColor: _driverGreen,
                    ),
                  ),
                  OutlinedButton.icon(
                    onPressed: widget.onOpenProfile,
                    icon: const Icon(Icons.person_outline),
                    label: const Text('Запрос статуса'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _submitQuickStatusRequest(
                      'day_off',
                      'Выходной на сегодня отправлен',
                    ),
                    icon: const Icon(Icons.event_available_outlined),
                    label: const Text('Выходной сегодня'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _submitQuickStatusRequest(
                      'force_majeure',
                      'Форс-мажор на сегодня отправлен',
                    ),
                    icon: const Icon(Icons.warning_amber_outlined),
                    label: const Text('Форс-мажор'),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              InfoCard(
                title: 'Следующий шаг',
                lines: [
                  if ((summary?.unreadNotifications ?? 0) > 0)
                    'Сначала проверь новые уведомления и подтверждения по выводу.'
                  else if ((summary?.availableToWithdraw ?? 0) > 0)
                    'Можно перейти к выводу и создать новую заявку.'
                  else
                    'Если нужен выходной или отпуск, открой профиль и создай статусный запрос.',
                ],
                icon: Icons.explore_outlined,
              ),
              const SizedBox(height: 20),
              const SectionTitle('Лента событий'),
              const SizedBox(height: 12),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _DriverFeedFilterChip(
                    label: 'Все',
                    selected:
                        _selectedFeedFilter == _DriverActivityFeedFilter.all,
                    onSelected: () {
                      setState(() {
                        _selectedFeedFilter = _DriverActivityFeedFilter.all;
                      });
                    },
                  ),
                  _DriverFeedFilterChip(
                    label: 'Новые',
                    selected: _selectedFeedFilter ==
                        _DriverActivityFeedFilter.newOnly,
                    onSelected: () {
                      setState(() {
                        _selectedFeedFilter = _DriverActivityFeedFilter.newOnly;
                      });
                    },
                  ),
                  _DriverFeedFilterChip(
                    label: 'Вывод',
                    selected: _selectedFeedFilter ==
                        _DriverActivityFeedFilter.payouts,
                    onSelected: () {
                      setState(() {
                        _selectedFeedFilter = _DriverActivityFeedFilter.payouts;
                      });
                    },
                  ),
                  _DriverFeedFilterChip(
                    label: 'Статусы',
                    selected: _selectedFeedFilter ==
                        _DriverActivityFeedFilter.statusRequests,
                    onSelected: () {
                      setState(() {
                        _selectedFeedFilter =
                            _DriverActivityFeedFilter.statusRequests;
                      });
                    },
                  ),
                ],
              ),
              const SizedBox(height: 12),
              FutureBuilder<List<dynamic>>(
                future: Future.wait<dynamic>([
                  _notificationsFuture,
                  _payoutsFuture,
                  _statusRequestsFuture,
                ]),
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return _DriverErrorCard(
                      title: 'Не удалось собрать ленту событий',
                      lines: const [
                        'Проверь соединение и попробуй обновить экран.',
                      ],
                      onRetry: _refresh,
                    );
                  }

                  if (!snapshot.hasData) {
                    return const SizedBox.shrink();
                  }

                  final notifications =
                      snapshot.data![0] as List<DriverNotificationItemDto>;
                  final payouts =
                      snapshot.data![1] as List<DriverPayoutItemDto>;
                  final statusRequests =
                      snapshot.data![2] as List<DriverStatusRequestDto>;
                  final items = _buildActivityFeed(
                    notifications: notifications,
                    payouts: payouts,
                    statusRequests: statusRequests,
                  );
                  final filteredItems = _applyActivityFeedFilter(items);

                  if (items.isEmpty) {
                    return const InfoCard(
                      title: 'Событий пока нет',
                      lines: [
                        'Когда появятся уведомления, выводы или статусные запросы, они соберутся здесь одной лентой.'
                      ],
                      icon: Icons.timeline_outlined,
                    );
                  }

                  if (filteredItems.isEmpty) {
                    return InfoCard(
                      title: 'По этому фильтру событий нет',
                      lines: [
                        'Переключи фильтр выше или дождись новых событий в выбранной категории.',
                      ],
                      icon: Icons.filter_list_off_outlined,
                    );
                  }

                  return Column(
                    children: filteredItems
                        .take(8)
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: DriverTimelineCard(
                              title: item.title,
                              subtitle: item.subtitle,
                              badge: item.badge,
                              icon: item.icon,
                              accent: item.accent,
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
              const SizedBox(height: 20),
              const SectionTitle('Уведомления'),
              const SizedBox(height: 12),
              FutureBuilder<List<DriverNotificationItemDto>>(
                future: _notificationsFuture,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return _DriverErrorCard(
                      title: 'Не удалось загрузить уведомления',
                      lines: const [
                        'Проверь соединение и попробуй обновить экран.',
                      ],
                      onRetry: _refresh,
                    );
                  }

                  final items = snapshot.data ?? const [];
                  if (items.isEmpty) {
                    return const InfoCard(
                      title: 'Уведомлений пока нет',
                      lines: [
                        'Подтверждения по выводу и системные события появятся здесь.'
                      ],
                      icon: Icons.notifications_off_outlined,
                    );
                  }

                  return Column(
                    children: items
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: DriverTimelineCard(
                              title: _driverNotificationTemplateLabel(
                                  item.template),
                              subtitle:
                                  '${_driverDateLabel(item.createdAt)} • ${_driverNotificationStatusLabel(item.status)} • ${_driverNotificationChannelLabel(item.channel)}',
                              badge:
                                  _driverNotificationStatusLabel(item.status),
                              icon: Icons.campaign_outlined,
                              accent: _driverNotificationColor(item),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
              const SizedBox(height: 20),
              const SectionTitle('Заявки на вывод'),
              const SizedBox(height: 12),
              FutureBuilder<List<DriverPayoutItemDto>>(
                future: _payoutsFuture,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return _DriverErrorCard(
                      title: 'Не удалось загрузить заявки на вывод',
                      lines: const [
                        'Проверь соединение и попробуй обновить экран.',
                      ],
                      onRetry: _refresh,
                    );
                  }

                  final items = snapshot.data ?? const [];
                  if (items.isEmpty) {
                    return const InfoCard(
                      title: 'Выводов пока нет',
                      lines: [
                        'Создай первую заявку на вывод, и история появится здесь.'
                      ],
                      icon: Icons.outbox_outlined,
                    );
                  }

                  return Column(
                    children: items
                        .take(5)
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: DriverTimelineCard(
                              title: 'Заявка на вывод ${item.amount} сом',
                              subtitle:
                                  '${_driverPayoutBadge(item.status)} • ${_driverDateLabel(item.createdAt)}',
                              badge: _driverPayoutBadge(item.status),
                              icon: Icons.account_balance_outlined,
                              accent: _driverPayoutColor(item.status),
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
              const SizedBox(height: 20),
              const SectionTitle('Статусные запросы'),
              const SizedBox(height: 12),
              FutureBuilder<List<DriverStatusRequestDto>>(
                future: _statusRequestsFuture,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return _DriverErrorCard(
                      title: 'Не удалось загрузить статусные запросы',
                      lines: const [
                        'Проверь соединение и попробуй обновить экран.',
                      ],
                      onRetry: _refresh,
                    );
                  }

                  final items = snapshot.data ?? const [];
                  if (items.isEmpty) {
                    return const InfoCard(
                      title: 'Статусных запросов пока нет',
                      lines: [
                        'Создай выходной, отпуск или форс-мажор, и история появится здесь.'
                      ],
                      icon: Icons.event_busy_outlined,
                    );
                  }

                  return Column(
                    children: items
                        .take(5)
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: DriverTimelineCard(
                              title: _driverRequestTypeLabel(item.type),
                              subtitle: _driverStatusRequestSubtitle(
                                item,
                                includeDate: true,
                              ),
                              badge: _driverRequestStatusLabel(item.status),
                              icon: Icons.event_available_outlined,
                              accent: item.status == 'approved'
                                  ? _driverGreen
                                  : item.status == 'pending'
                                      ? _driverOrange
                                      : _driverBlue,
                            ),
                          ),
                        )
                        .toList(),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }

  List<_DriverActivityFeedItem> _buildActivityFeed({
    required List<DriverNotificationItemDto> notifications,
    required List<DriverPayoutItemDto> payouts,
    required List<DriverStatusRequestDto> statusRequests,
  }) {
    final items = <_DriverActivityFeedItem>[
      ...notifications.map(
        (item) => _DriverActivityFeedItem(
          kind: _DriverActivityFeedFilter.newOnly,
          createdAt: item.createdAt,
          title: _driverNotificationTemplateLabel(item.template),
          subtitle:
              '${_driverDateLabel(item.createdAt)} • ${_driverNotificationStatusLabel(item.status)} • ${_driverNotificationChannelLabel(item.channel)}',
          badge: _driverNotificationStatusLabel(item.status),
          icon: Icons.campaign_outlined,
          accent: _driverNotificationColor(item),
        ),
      ),
      ...payouts.map(
        (item) => _DriverActivityFeedItem(
          kind: _DriverActivityFeedFilter.payouts,
          createdAt: item.createdAt,
          title: 'Заявка на вывод ${item.amount} сом',
          subtitle:
              '${_driverDateLabel(item.createdAt)} • ${_driverPayoutBadge(item.status)}',
          badge: _driverPayoutBadge(item.status),
          icon: Icons.account_balance_outlined,
          accent: _driverPayoutColor(item.status),
        ),
      ),
      ...statusRequests.map(
        (item) => _DriverActivityFeedItem(
          kind: _DriverActivityFeedFilter.statusRequests,
          createdAt: item.createdAt,
          title: _driverRequestTypeLabel(item.type),
          subtitle: _driverStatusRequestSubtitle(item, includeDate: true),
          badge: _driverRequestStatusLabel(item.status),
          icon: Icons.event_available_outlined,
          accent: item.status == 'approved'
              ? _driverGreen
              : item.status == 'pending'
                  ? _driverOrange
                  : _driverBlue,
        ),
      ),
    ];

    items.sort((left, right) {
      final leftDate =
          DateTime.tryParse(left.createdAt ?? '') ?? DateTime(1970);
      final rightDate =
          DateTime.tryParse(right.createdAt ?? '') ?? DateTime(1970);
      return rightDate.compareTo(leftDate);
    });

    return items;
  }

  List<_DriverActivityFeedItem> _applyActivityFeedFilter(
    List<_DriverActivityFeedItem> items,
  ) {
    switch (_selectedFeedFilter) {
      case _DriverActivityFeedFilter.all:
        return items;
      case _DriverActivityFeedFilter.newOnly:
        return items
            .where((item) => item.kind == _DriverActivityFeedFilter.newOnly)
            .toList();
      case _DriverActivityFeedFilter.payouts:
        return items
            .where((item) => item.kind == _DriverActivityFeedFilter.payouts)
            .toList();
      case _DriverActivityFeedFilter.statusRequests:
        return items
            .where(
                (item) => item.kind == _DriverActivityFeedFilter.statusRequests)
            .toList();
    }
  }
}

class DriverChatPage extends StatefulWidget {
  const DriverChatPage({
    super.key,
    required this.repository,
    required this.driverId,
    required this.onUnreadChanged,
    required this.onOpenPayout,
    required this.onOpenProfile,
  });

  final DriverRepository repository;
  final String driverId;
  final ValueChanged<int> onUnreadChanged;
  final VoidCallback onOpenPayout;
  final VoidCallback onOpenProfile;

  @override
  State<DriverChatPage> createState() => _DriverChatPageState();
}

class _DriverChatPageState extends State<DriverChatPage> {
  bool _isMarkingRead = false;

  @override
  void initState() {
    super.initState();
    unawaited(_markChatReadAndRefreshBadge());
  }

  Future<void> _markChatReadAndRefreshBadge() async {
    if (_isMarkingRead) {
      return;
    }
    _isMarkingRead = true;
    try {
      await widget.repository.markChatRead(widget.driverId);
      final summary = await widget.repository.loadHomeSummary(widget.driverId);
      if (mounted) {
        widget.onUnreadChanged(summary.unreadNotifications);
      }
    } catch (_) {
      if (mounted) {
        widget.onUnreadChanged(0);
      }
    } finally {
      _isMarkingRead = false;
    }
  }

  Future<void> _submitQuickStatusRequest(String type, String message) async {
    final confirmed = await _confirmQuickStatusRequest(
      context,
      type: type,
      period: _driverDateOnly(DateTime.now()),
    );
    if (!mounted || !confirmed) {
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    final note = type == 'force_majeure'
        ? await _showForceMajeureReasonDialog(context)
        : null;
    if (!mounted || (type == 'force_majeure' && note == null)) {
      return;
    }
    try {
      await widget.repository.requestStatus(
        widget.driverId,
        type,
        _driverDateOnly(DateTime.now()),
        note: note,
      );
      if (mounted) {
        messenger.showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (error) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(content: Text(_driverStatusRequestErrorMessage(error))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 8, 8),
          child: Row(
            children: [
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Чат',
                      style: TextStyle(
                        color: _driverText,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'Диалог с бригадиром',
                      style: TextStyle(
                        color: _driverMuted,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_vert_rounded),
                onSelected: (value) {
                  switch (value) {
                    case 'profile':
                      widget.onOpenProfile();
                      break;
                    case 'payout':
                      widget.onOpenPayout();
                      break;
                    case 'day_off':
                      unawaited(_submitQuickStatusRequest(
                        'day_off',
                        'Выходной на сегодня отправлен',
                      ));
                      break;
                    case 'force_majeure':
                      unawaited(_submitQuickStatusRequest(
                        'force_majeure',
                        'Форс-мажор на сегодня отправлен',
                      ));
                      break;
                  }
                },
                itemBuilder: (context) => const [
                  PopupMenuItem(
                    value: 'day_off',
                    child: Text('Запросить выходной'),
                  ),
                  PopupMenuItem(
                    value: 'force_majeure',
                    child: Text('Форс-мажор / инцидент'),
                  ),
                  PopupMenuItem(
                    value: 'payout',
                    child: Text('Создать вывод'),
                  ),
                  PopupMenuItem(
                    value: 'profile',
                    child: Text('Профиль'),
                  ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: DriverManagerChatPanel(
            repository: widget.repository,
            fullScreen: true,
            onRead: _markChatReadAndRefreshBadge,
            onChanged: _markChatReadAndRefreshBadge,
          ),
        ),
      ],
    );
  }
}

class DriverManagerChatPanel extends StatefulWidget {
  const DriverManagerChatPanel({
    super.key,
    required this.repository,
    required this.onChanged,
    this.fullScreen = false,
    this.onRead,
  });

  final DriverRepository repository;
  final Future<void> Function() onChanged;
  final bool fullScreen;
  final Future<void> Function()? onRead;

  @override
  State<DriverManagerChatPanel> createState() => _DriverManagerChatPanelState();
}

class _DriverManagerChatPanelState extends State<DriverManagerChatPanel> {
  late Future<List<DriverChatThreadDto>> _threadsFuture;
  String? _selectedThreadId;
  bool _isSending = false;
  bool _isThreadLoading = false;
  Timer? _refreshTimer;
  String? _lastMessageSignature;
  DriverChatThreadDetailDto? _threadDetailCache;
  Object? _threadError;
  bool _stickMessagesToBottom = true;
  final _messageController = TextEditingController();
  final _messagesScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _reloadThreads();
    _messagesScrollController.addListener(_rememberChatScrollPosition);
    _refreshTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      _refreshChat();
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _messagesScrollController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  void _rememberChatScrollPosition() {
    if (!_messagesScrollController.hasClients) {
      return;
    }
    _stickMessagesToBottom = _isMessagesListNearBottom(threshold: 140);
  }

  void _reloadThreads() {
    _threadsFuture = widget.repository.loadChats();
  }

  Future<DriverChatThreadDetailDto> _loadChatAndMarkRead(
      String threadId) async {
    final detail = await widget.repository.loadChat(threadId);
    unawaited(widget.onRead?.call());
    return detail;
  }

  Future<void> _selectThread(String threadId, {bool force = false}) async {
    if (!force && _selectedThreadId == threadId && _threadDetailCache != null) {
      return;
    }
    setState(() {
      if (_selectedThreadId != threadId) {
        _lastMessageSignature = null;
        _threadDetailCache = null;
      }
      _selectedThreadId = threadId;
      _isThreadLoading = true;
      _threadError = null;
    });

    try {
      final detail = await _loadChatAndMarkRead(threadId);
      if (!mounted || _selectedThreadId != threadId) {
        return;
      }
      setState(() {
        _threadDetailCache = detail;
        _isThreadLoading = false;
      });
      _rememberMessagesAndScrollIfNeeded(detail);
    } catch (error) {
      if (!mounted || _selectedThreadId != threadId) {
        return;
      }
      setState(() {
        _threadError = error;
        _isThreadLoading = false;
      });
    }
  }

  void _scheduleMessagesScrollToBottom({bool animated = true, int attempt = 0}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_messagesScrollController.hasClients) {
        if (attempt < 5 && mounted) {
          Future.delayed(const Duration(milliseconds: 80), () {
            if (mounted) {
              _scheduleMessagesScrollToBottom(
                animated: animated,
                attempt: attempt + 1,
              );
            }
          });
        }
        return;
      }
      final target = _messagesScrollController.position.maxScrollExtent;
      if (animated) {
        _messagesScrollController.animateTo(
          target,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      } else {
        _messagesScrollController.jumpTo(target);
      }
    });
  }

  bool _isMessagesListNearBottom({double threshold = 80}) {
    if (!_messagesScrollController.hasClients) {
      return true;
    }
    final position = _messagesScrollController.position;
    return position.maxScrollExtent - position.pixels < threshold;
  }

  String _messageSignature(DriverChatThreadDetailDto thread) {
    if (thread.messages.isEmpty) {
      return '${thread.id}:empty';
    }
    final last = thread.messages.last;
    return '${thread.id}:${thread.messages.length}:${last.id}:${last.createdAt}';
  }

  void _rememberMessagesAndScrollIfNeeded(
    DriverChatThreadDetailDto thread, {
    bool force = false,
  }) {
    final signature = _messageSignature(thread);
    if (_lastMessageSignature == signature && !force) {
      return;
    }

    final shouldScroll =
        force || _lastMessageSignature == null || _stickMessagesToBottom;
    _lastMessageSignature = signature;
    if (shouldScroll) {
      _scheduleMessagesScrollToBottom();
    }
  }

  Future<void> _refreshChat() async {
    if (_isSending) {
      return;
    }

    try {
      final keepBottom = _stickMessagesToBottom || _isMessagesListNearBottom();
      final threads = await widget.repository.loadChats();
      final selectedId =
          _selectedThreadId ?? (threads.isNotEmpty ? threads.first.id : null);
      final selectedStillExists = selectedId != null &&
          threads.any((thread) => thread.id == selectedId);
      final effectiveThreadId = selectedStillExists
          ? selectedId
          : (threads.isNotEmpty ? threads.first.id : null);
      final detail = effectiveThreadId == null
          ? null
          : await _loadChatAndMarkRead(effectiveThreadId);
      if (!mounted) {
        return;
      }
      setState(() {
        _threadsFuture = Future.value(threads);
        if (_selectedThreadId != effectiveThreadId) {
          _lastMessageSignature = null;
          _threadDetailCache = null;
        }
        _selectedThreadId = effectiveThreadId;
        _threadDetailCache = detail;
        _threadError = null;
        _isThreadLoading = false;
      });
      if (detail != null && keepBottom) {
        _rememberMessagesAndScrollIfNeeded(detail);
      }
    } catch (_) {
      // Следующий опрос попробует обновить чат ещё раз.
    }
  }

  Future<void> _sendMessage() async {
    final text = _messageController.text.trim();
    if (text.isEmpty || _isSending) {
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _isSending = true;
    });

    try {
      final threadId = _selectedThreadId;
      final updated = threadId == null
          ? await widget.repository.startManagerChat(text)
          : await widget.repository.sendChatMessage(threadId, text);
      if (!mounted) {
        return;
      }
      _messageController.clear();
      setState(() {
        _selectedThreadId = updated.id;
        _threadDetailCache = updated;
        _threadError = null;
        _isThreadLoading = false;
        _reloadThreads();
      });
      _rememberMessagesAndScrollIfNeeded(updated, force: true);
      _scheduleMessagesScrollToBottom(animated: false);
      await widget.onChanged();
    } catch (error) {
      if (!mounted) {
        return;
      }
      messenger.showSnackBar(
        SnackBar(content: Text('Не удалось отправить сообщение: ${_driverUserError(error)}')),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSending = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<DriverChatThreadDto>>(
      future: _threadsFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _DriverErrorCard(
            title: 'Чат с бригадиром недоступен',
            lines: const [
              'Проверь соединение. Если водитель закреплён за бригадиром, чат появится после обновления.',
            ],
            onRetry: () async {
              setState(_reloadThreads);
              await _threadsFuture;
            },
          );
        }

        final threads = snapshot.data ?? const <DriverChatThreadDto>[];
        if (threads.isNotEmpty && _selectedThreadId == null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _selectedThreadId == null) {
              unawaited(_selectThread(threads.first.id));
            }
          });
        }

        return Container(
          padding: EdgeInsets.all(widget.fullScreen ? 12 : 18),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.96),
            borderRadius: BorderRadius.circular(widget.fullScreen ? 18 : 26),
            boxShadow: widget.fullScreen
                ? const []
                : [
                    BoxShadow(
                      color: _driverText.withValues(alpha: 0.06),
                      blurRadius: 28,
                      offset: const Offset(0, 16),
                    ),
                  ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: _driverGreen.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Icon(
                      Icons.support_agent_outlined,
                      color: _driverGreen,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Чат с бригадиром',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Пиши закреплённому бригадиру напрямую',
                          style: TextStyle(color: _driverMuted),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () {
                      setState(() => _reloadThreads());
                      if (_selectedThreadId != null) {
                        unawaited(_selectThread(
                          _selectedThreadId!,
                          force: true,
                        ));
                      }
                    },
                    icon: const Icon(Icons.refresh_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              if (snapshot.connectionState == ConnectionState.waiting &&
                  _threadDetailCache == null)
                const LinearProgressIndicator(minHeight: 2)
              else if (_threadError != null && _threadDetailCache == null)
                InfoCard(
                  title: 'Не удалось открыть чат',
                  lines: [_driverUserError(_threadError!)],
                  icon: Icons.sms_failed_outlined,
                )
              else if (_isThreadLoading && _threadDetailCache == null)
                const LinearProgressIndicator(minHeight: 2)
              else if (_threadDetailCache == null)
                const InfoCard(
                  title: 'Сообщений пока нет',
                  lines: [
                    'Напиши первое сообщение. Чат автоматически привяжется к закреплённому бригадиру.'
                  ],
                  icon: Icons.chat_bubble_outline,
                )
              else if (widget.fullScreen)
                Expanded(child: _buildThreadDetail(_threadDetailCache!))
              else
                _buildThreadDetail(_threadDetailCache!),
              const SizedBox(height: 14),
              TextField(
                controller: _messageController,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendMessage(),
                decoration: _driverInputDecoration(
                  'Сообщение бригадиру',
                  Icons.edit_outlined,
                ).copyWith(
                  suffixIcon: IconButton(
                    onPressed: _isSending ? null : _sendMessage,
                    icon: _isSending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send_rounded),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildThreadDetail(DriverChatThreadDetailDto thread) {
    final messages = thread.messages;
    _rememberMessagesAndScrollIfNeeded(thread);
    final messageList = ListView(
      controller: _messagesScrollController,
      padding: EdgeInsets.zero,
      children: messages
          .map(
            (message) => _DriverChatBubble(
              message: message,
            ),
          )
          .toList(),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          thread.managerName == null
              ? 'Бригадир не указан'
              : 'Бригадир: ${thread.managerName}',
          style: const TextStyle(
            color: _driverMuted,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        if (messages.isEmpty)
          const InfoCard(
            title: 'История пустая',
            lines: ['Отправь первое сообщение бригадиру.'],
            icon: Icons.mark_chat_unread_outlined,
          )
        else if (widget.fullScreen)
          Expanded(child: messageList)
        else
          SizedBox(height: 320, child: messageList),
      ],
    );
  }
}

class _DriverChatBubble extends StatelessWidget {
  const _DriverChatBubble({required this.message});

  final DriverChatMessageDto message;

  @override
  Widget build(BuildContext context) {
    final isDriver = message.senderRole == 'driver';
    return Align(
      alignment: isDriver ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 520),
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isDriver
              ? _driverGreen.withValues(alpha: 0.12)
              : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isDriver
                ? _driverGreen.withValues(alpha: 0.22)
                : _driverText.withValues(alpha: 0.06),
          ),
        ),
        child: Column(
          crossAxisAlignment:
              isDriver ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            Text(
              message.senderName,
              style: const TextStyle(
                color: _driverMuted,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message.body,
              style: const TextStyle(
                color: _driverText,
                fontWeight: FontWeight.w600,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _driverDateLabel(message.createdAt),
              style: const TextStyle(color: _driverMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class DriverProfilePage extends StatefulWidget {
  const DriverProfilePage({
    super.key,
    required this.repository,
    required this.driverId,
    required this.session,
    required this.onOpenPayments,
    required this.onOpenActivity,
    required this.onOpenPayout,
    required this.onSignOut,
  });

  final DriverRepository repository;
  final String driverId;
  final DriverAuthSessionDto session;
  final VoidCallback onOpenPayments;
  final VoidCallback onOpenActivity;
  final VoidCallback onOpenPayout;
  final VoidCallback onSignOut;

  @override
  State<DriverProfilePage> createState() => _DriverProfilePageState();
}

class _DriverProfilePageState extends State<DriverProfilePage> {
  late Future<DriverProfileSummaryDto?> _profileFuture;
  late Future<DriverActiveContractDto?> _contractFuture;
  late Future<List<DriverStatusRequestDto>> _statusRequestsFuture;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _profileFuture = widget.repository.loadProfileSummary(widget.driverId);
    _contractFuture = widget.repository.loadActiveContract(widget.driverId);
    _statusRequestsFuture =
        widget.repository.loadStatusRequests(widget.driverId);
  }

  Future<void> _refresh() async {
    setState(_reload);
    await Future.wait([
      _profileFuture,
      _contractFuture,
      _statusRequestsFuture,
    ]);
  }

  Future<void> _submitQuickStatusRequest(
    String type,
    String successMessage,
  ) async {
    final confirmed = await _confirmQuickStatusRequest(
      context,
      type: type,
      period: _driverDateOnly(DateTime.now()),
    );
    if (!mounted || !confirmed) {
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    final period = _driverDateOnly(DateTime.now());
    final note = type == 'force_majeure'
        ? await _showForceMajeureReasonDialog(context)
        : null;
    if (!mounted || (type == 'force_majeure' && note == null)) {
      return;
    }

    try {
      await widget.repository.requestStatus(
        widget.driverId,
        type,
        period,
        note: note,
      );
      if (!mounted) {
        return;
      }
      await _refresh();
      messenger.showSnackBar(
        SnackBar(content: Text(successMessage)),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      messenger.showSnackBar(
        SnackBar(
          content: Text(_driverStatusRequestErrorMessage(error)),
        ),
      );
    }
  }

  Future<void> _openStatusRequestForm() async {
    final messenger = ScaffoldMessenger.of(context);
    final typeController = ValueNotifier<String>('day_off');
    final startDateController = TextEditingController();
    final endDateController = TextEditingController();
    final noteController = TextEditingController();

    Future<void> pickDate(
      BuildContext dialogContext,
      TextEditingController controller,
    ) async {
      final now = DateTime.now();
      final picked = await showDatePicker(
        context: dialogContext,
        initialDate: now,
        firstDate: now,
        lastDate: now.add(const Duration(days: 365)),
      );
      if (picked != null) {
        controller.text = _driverDateOnly(picked);
      }
    }

    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) {
        bool isSubmitting = false;

        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            return AlertDialog(
              title: const Text('Новый запрос статуса'),
              content: SizedBox(
                width: 420,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ValueListenableBuilder<String>(
                      valueListenable: typeController,
                      builder: (context, value, _) {
                        return DropdownButtonFormField<String>(
                          initialValue: value,
                          decoration: _driverInputDecoration(
                            'Тип статуса',
                            Icons.flag_outlined,
                          ),
                          items: const [
                            DropdownMenuItem(
                              value: 'day_off',
                              child: Text('Выходной'),
                            ),
                            DropdownMenuItem(
                              value: 'vacation',
                              child: Text('Отпросился / отпуск'),
                            ),
                            DropdownMenuItem(
                              value: 'force_majeure',
                              child: Text('Форс-мажор'),
                            ),
                          ],
                          onChanged: (next) {
                            if (next != null) {
                              typeController.value = next;
                            }
                          },
                        );
                      },
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: startDateController,
                      readOnly: true,
                      decoration: _driverInputDecoration(
                        'Дата начала',
                        Icons.event_outlined,
                      ),
                      onTap: () => pickDate(dialogContext, startDateController),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: endDateController,
                      readOnly: true,
                      decoration: _driverInputDecoration(
                        'Дата конца (необязательно)',
                        Icons.event_repeat_outlined,
                      ),
                      onTap: () => pickDate(dialogContext, endDateController),
                    ),
                    ValueListenableBuilder<String>(
                      valueListenable: typeController,
                      builder: (context, value, _) {
                        if (value != 'force_majeure') {
                          return const SizedBox.shrink();
                        }
                        return Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: TextField(
                            controller: noteController,
                            maxLines: 3,
                            decoration: _driverInputDecoration(
                              'Причина форс-мажора',
                              Icons.edit_note_rounded,
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: isSubmitting
                      ? null
                      : () => Navigator.of(dialogContext).pop(false),
                  child: const Text('Отмена'),
                ),
                FilledButton(
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          final start = startDateController.text.trim();
                          final end = endDateController.text.trim();
                          if (start.isEmpty) {
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('Выбери дату начала'),
                              ),
                            );
                            return;
                          }

                          final period = end.isEmpty ? start : '$start .. $end';
                          final note = noteController.text.trim();
                          if (typeController.value == 'force_majeure' &&
                              note.isEmpty) {
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('Укажите причину форс-мажора'),
                              ),
                            );
                            return;
                          }
                          setDialogState(() => isSubmitting = true);
                          await widget.repository.requestStatus(
                            widget.driverId,
                            typeController.value,
                            period,
                            note: note.isEmpty ? null : note,
                          );
                          if (!dialogContext.mounted) {
                            return;
                          }
                          Navigator.of(dialogContext).pop(true);
                        },
                  child: Text(isSubmitting ? 'Отправка...' : 'Отправить'),
                ),
              ],
            );
          },
        );
      },
    );

    startDateController.dispose();
    endDateController.dispose();
    noteController.dispose();
    typeController.dispose();

    if (result == true && mounted) {
      setState(_reload);
      messenger.showSnackBar(
        const SnackBar(content: Text('Запрос отправлен')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const _DriverHero(
            title: 'Мой профиль',
            subtitle: 'Личные данные, договор и запросы',
            icon: Icons.person_rounded,
          ),
          const SizedBox(height: 20),
          FutureBuilder<DriverProfileSummaryDto?>(
            future: _profileFuture,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return _DriverErrorCard(
                  title: 'Не удалось загрузить профиль',
                  lines: const [
                    'Проверь соединение и попробуй обновить экран.',
                  ],
                  onRetry: _refresh,
                );
              }

              final data = snapshot.data;
              if (data == null) {
                return const InfoCard(
                  title: 'Профиль не найден',
                  lines: ['Данные профиля пока недоступны'],
                );
              }

              return Column(
                children: [
                  HighlightCard(
                    title: data.driverName,
                    value: _driverStatusLabel(data.currentStatus),
                    subtitle:
                        'Автомобиль: ${data.assignedVehicle ?? 'не назначен'} • договор: ${data.activeContractNumber ?? 'нет'}',
                    colorA: _driverGreen,
                    colorB: _driverEmerald,
                    icon: Icons.person_rounded,
                    badge: _driverRoleLabel(widget.session.requestUserRole),
                  ),
                  const SizedBox(height: 16),
                  GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      MetricTile(
                        title: 'Долг',
                        value: '${data.currentDebt} сом',
                        icon: Icons.account_balance_wallet_outlined,
                        colorA: _driverOrange,
                        colorB: const Color(0xFFEF4444),
                      ),
                      MetricTile(
                        title: 'Оплачено',
                        value: '${data.totalPaid} сом',
                        icon: Icons.check_circle_outline_rounded,
                        colorA: _driverBlue,
                        colorB: _driverCyan,
                      ),
                      MetricTile(
                        title: 'Переплата',
                        value: '${data.creditBalance} сом',
                        icon: Icons.savings_outlined,
                        colorA: _driverGreen,
                        colorB: _driverEmerald,
                      ),
                      MetricTile(
                        title: 'Начислено',
                        value: '${data.totalObligations} сом',
                        icon: Icons.receipt_long_outlined,
                        colorA: _driverPurple,
                        colorB: const Color(0xFFEC4899),
                      ),
                      MetricTile(
                        title: 'Последний платёж',
                        value: _driverDateLabel(data.lastPaymentDate),
                        icon: Icons.history_toggle_off_rounded,
                        colorA: _driverGreen,
                        colorB: _driverEmerald,
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  InfoCard(
                    title: 'Профиль',
                    lines: [
                      'Роль: ${_driverRoleLabel(widget.session.requestUserRole)}',
                      'Телефон: ${data.phone}',
                      'Статус: ${_driverStatusLabel(data.currentStatus)}',
                      'Переплата: ${data.creditBalance} сом',
                      'Баланс Яндекс: ${data.yandexBalance} сом',
                    ],
                    icon: Icons.badge_outlined,
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      FilledButton.icon(
                        onPressed: _openStatusRequestForm,
                        icon: const Icon(Icons.event_available_outlined),
                        label: const Text('Создать статус'),
                        style: FilledButton.styleFrom(
                          backgroundColor: _driverGreen,
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => _submitQuickStatusRequest(
                          'day_off',
                          'Выходной на сегодня отправлен',
                        ),
                        icon: const Icon(Icons.today_outlined),
                        label: const Text('Выходной сегодня'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => _submitQuickStatusRequest(
                          'force_majeure',
                          'Форс-мажор на сегодня отправлен',
                        ),
                        icon: const Icon(Icons.warning_amber_outlined),
                        label: const Text('Форс-мажор'),
                      ),
                      OutlinedButton.icon(
                        onPressed: widget.onOpenPayments,
                        icon: const Icon(Icons.receipt_long_outlined),
                        label: const Text('Платежи'),
                      ),
                      OutlinedButton.icon(
                        onPressed: widget.onOpenActivity,
                        icon: const Icon(Icons.notifications_outlined),
                        label: const Text('Чат'),
                      ),
                      OutlinedButton.icon(
                        onPressed: widget.onOpenPayout,
                        icon: const Icon(Icons.account_balance_wallet_outlined),
                        label: const Text('Вывод'),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: widget.onSignOut,
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              side: BorderSide(color: _driverText.withValues(alpha: 0.14)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
            ),
            child: const Text('Выйти'),
          ),
          const SizedBox(height: 16),
          const SectionTitle('Активный договор'),
          const SizedBox(height: 12),
          FutureBuilder<DriverActiveContractDto?>(
            future: _contractFuture,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return _DriverErrorCard(
                  title: 'Не удалось загрузить договор',
                  lines: const [
                    'Проверь соединение и попробуй обновить экран.',
                  ],
                  onRetry: _refresh,
                );
              }

              final item = snapshot.data;
              if (item == null) {
                return const InfoCard(
                  title: 'Договор не найден',
                  lines: ['Активный договор пока не найден'],
                );
              }

              final progress =
                  item.totalCost == 0 ? 0.0 : item.paidAmount / item.totalCost;

              return Column(
                children: [
                  HighlightCard(
                    title: item.contractNumber,
                    value: '${item.currentDebt} сом',
                    subtitle: '${item.carLabel} • до ${item.plannedEndDate}',
                    colorA: _driverBlue,
                    colorB: _driverCyan,
                    icon: Icons.directions_car_filled_outlined,
                    badge: '${(progress * 100).round()}%',
                  ),
                  const SizedBox(height: 12),
                  InfoCard(
                    title: 'Договор',
                    lines: [
                      'Статус: ${_driverRequestStatusLikeLabel(item.status)}',
                      'Начало: ${_driverDateLabel(item.startDate)}',
                      'Плановое завершение: ${_driverDateLabel(item.plannedEndDate)}',
                      'Платёж: ${item.installmentAmount} сом',
                      'День списания: ${item.installmentDay}',
                      'Оплачено: ${item.paidAmount} сом из ${item.totalCost} сом',
                    ],
                    icon: Icons.description_outlined,
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          const SectionTitle('Запросы'),
          const SizedBox(height: 12),
          FutureBuilder<List<DriverStatusRequestDto>>(
            future: _statusRequestsFuture,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return _DriverErrorCard(
                  title: 'Не удалось загрузить запросы',
                  lines: const [
                    'Проверь соединение и попробуй обновить экран.',
                  ],
                  onRetry: _refresh,
                );
              }

              final items = snapshot.data ?? const [];
              if (items.isEmpty) {
                return const InfoCard(
                  title: 'Запросов пока нет',
                  lines: ['Здесь появятся выходные, отпуски и форс-мажоры'],
                  icon: Icons.event_busy_outlined,
                );
              }
              return Column(
                children: items
                    .map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: DriverTimelineCard(
                          title: _driverRequestTypeLabel(item.type),
                          subtitle: _driverStatusRequestSubtitle(item),
                          badge: _driverRequestStatusLabel(item.status),
                          icon: Icons.event_available_outlined,
                          accent: item.status == 'approved'
                              ? _driverGreen
                              : item.status == 'pending'
                                  ? _driverOrange
                                  : _driverBlue,
                        ),
                      ),
                    )
                    .toList(),
              );
            },
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _openStatusRequestForm,
            child: const Text('Создать запрос статуса'),
          ),
        ],
      ),
    );
  }
}

class DriverTimelineCard extends StatelessWidget {
  const DriverTimelineCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.icon,
    required this.accent,
  });

  final String title;
  final String subtitle;
  final String badge;
  final IconData icon;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: _driverText.withValues(alpha: 0.05),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: accent),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: const TextStyle(color: _driverMuted, height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              badge,
              style: TextStyle(
                color: accent,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverActivityFeedItem {
  const _DriverActivityFeedItem({
    required this.kind,
    required this.createdAt,
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.icon,
    required this.accent,
  });

  final _DriverActivityFeedFilter kind;
  final String? createdAt;
  final String title;
  final String subtitle;
  final String badge;
  final IconData icon;
  final Color accent;
}

enum _DriverActivityFeedFilter {
  all,
  newOnly,
  payouts,
  statusRequests,
}

enum _DriverPaymentStatementSort {
  operationDate,
  period,
}

class _DriverFeedFilterChip extends StatelessWidget {
  const _DriverFeedFilterChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  final String label;
  final bool selected;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(),
      labelStyle: TextStyle(
        color: selected ? Colors.white : _driverText,
        fontWeight: FontWeight.w700,
      ),
      selectedColor: _driverBlue,
      backgroundColor: Colors.white.withValues(alpha: 0.95),
      side: BorderSide(
        color: selected
            ? _driverBlue.withValues(alpha: 0.2)
            : _driverText.withValues(alpha: 0.08),
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    );
  }
}

class DriverAmountChip extends StatelessWidget {
  const DriverAmountChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          color: selected ? _driverGreen : Colors.white.withValues(alpha: 0.92),
          border: Border.all(
            color:
                selected ? _driverGreen : _driverText.withValues(alpha: 0.08),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : _driverText,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    );
  }
}

class DriverLoginPage extends StatefulWidget {
  const DriverLoginPage({
    super.key,
    required this.isSubmitting,
    required this.isRequestingPasswordReset,
    required this.errorText,
    required this.infoText,
    required this.onSubmit,
    required this.onPasswordResetRequest,
  });

  final bool isSubmitting;
  final bool isRequestingPasswordReset;
  final String? errorText;
  final String? infoText;
  final Future<void> Function(String login, String password) onSubmit;
  final Future<void> Function(String login) onPasswordResetRequest;

  @override
  State<DriverLoginPage> createState() => _DriverLoginPageState();
}

class DriverPasswordChangePage extends StatefulWidget {
  const DriverPasswordChangePage({
    super.key,
    required this.isSubmitting,
    required this.errorText,
    required this.onSubmit,
    required this.onSignOut,
  });

  final bool isSubmitting;
  final String? errorText;
  final Future<void> Function(String currentPassword, String newPassword)
      onSubmit;
  final VoidCallback onSignOut;

  @override
  State<DriverPasswordChangePage> createState() =>
      _DriverPasswordChangePageState();
}

class _DriverPasswordChangePageState extends State<DriverPasswordChangePage> {
  late final TextEditingController currentPasswordController;
  late final TextEditingController newPasswordController;
  late final TextEditingController repeatPasswordController;
  String? localError;

  @override
  void initState() {
    super.initState();
    currentPasswordController = TextEditingController(text: '123456');
    newPasswordController = TextEditingController();
    repeatPasswordController = TextEditingController();
  }

  @override
  void dispose() {
    currentPasswordController.dispose();
    newPasswordController.dispose();
    repeatPasswordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final errorText = localError ?? widget.errorText;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [_driverBg, Color(0xFFE6F5EA)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 380),
                child: Container(
                  padding: const EdgeInsets.all(28),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(30),
                    boxShadow: [
                      BoxShadow(
                        color: _driverGreen.withValues(alpha: 0.14),
                        blurRadius: 36,
                        offset: const Offset(0, 18),
                      ),
                    ],
                    border:
                        Border.all(color: Colors.white.withValues(alpha: 0.7)),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20),
                          gradient: const LinearGradient(
                            colors: [_driverGreen, _driverEmerald],
                          ),
                        ),
                        child: const Icon(
                          Icons.lock_reset_rounded,
                          color: Colors.white,
                          size: 30,
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Text(
                        'Смените пароль',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Первый пароль выдан в CRM. Чтобы открыть приложение, задайте новый пароль.',
                        style: TextStyle(color: _driverMuted, height: 1.5),
                      ),
                      const SizedBox(height: 20),
                      TextField(
                        controller: currentPasswordController,
                        obscureText: true,
                        decoration: _driverInputDecoration(
                          'Текущий пароль',
                          Icons.lock_outline_rounded,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: newPasswordController,
                        obscureText: true,
                        decoration: _driverInputDecoration(
                          'Новый пароль',
                          Icons.lock_reset_rounded,
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: repeatPasswordController,
                        obscureText: true,
                        decoration: _driverInputDecoration(
                          'Повторите пароль',
                          Icons.verified_user_outlined,
                        ),
                      ),
                      if (errorText != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          errorText,
                          style: const TextStyle(color: Color(0xFFB91C1C)),
                        ),
                      ],
                      const SizedBox(height: 18),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(54),
                          backgroundColor: _driverGreen,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                        ),
                        onPressed: widget.isSubmitting ? null : _submit,
                        child: Text(
                          widget.isSubmitting
                              ? 'Сохраняем...'
                              : 'Сохранить пароль',
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextButton(
                        onPressed:
                            widget.isSubmitting ? null : widget.onSignOut,
                        child: const Text('Выйти'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _submit() {
    final currentPassword = currentPasswordController.text.trim();
    final newPassword = newPasswordController.text.trim();
    final repeatedPassword = repeatPasswordController.text.trim();

    if (newPassword.length < 6) {
      setState(() {
        localError = 'Новый пароль должен быть не короче 6 символов.';
      });
      return;
    }

    if (newPassword != repeatedPassword) {
      setState(() {
        localError = 'Пароли не совпадают.';
      });
      return;
    }

    setState(() {
      localError = null;
    });
    widget.onSubmit(currentPassword, newPassword);
  }
}

class _DriverLoginPageState extends State<DriverLoginPage> {
  late final TextEditingController loginController;
  late final TextEditingController passwordController;

  @override
  void initState() {
    super.initState();
    loginController = TextEditingController();
    passwordController = TextEditingController();
  }

  @override
  void dispose() {
    loginController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [_driverBg, Color(0xFFE6F5EA)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 380),
                child: Container(
                  padding: const EdgeInsets.all(28),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.9),
                    borderRadius: BorderRadius.circular(30),
                    boxShadow: [
                      BoxShadow(
                        color: _driverGreen.withValues(alpha: 0.14),
                        blurRadius: 36,
                        offset: const Offset(0, 18),
                      ),
                    ],
                    border:
                        Border.all(color: Colors.white.withValues(alpha: 0.7)),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20),
                          gradient: const LinearGradient(
                            colors: [_driverGreen, _driverEmerald],
                          ),
                        ),
                        child: const Icon(
                          Icons.local_taxi_rounded,
                          color: Colors.white,
                          size: 30,
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'Вход водителя',
                        style: TextStyle(
                            fontSize: 28, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Аккаунт создаётся в CRM. Первый пароль: 123456.',
                        style: TextStyle(color: _driverMuted, height: 1.5),
                      ),
                      const SizedBox(height: 20),
                      TextField(
                        controller: loginController,
                        keyboardType: TextInputType.phone,
                        decoration: _driverInputDecoration(
                          'Логин',
                          Icons.phone_android_rounded,
                        ).copyWith(
                          prefixText: '+996 ',
                          helperText: 'Введите номер без кода страны',
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: passwordController,
                        obscureText: true,
                        decoration: _driverInputDecoration(
                          'Пароль',
                          Icons.lock_outline_rounded,
                        ),
                      ),
                      if (widget.errorText != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          widget.errorText!,
                          style: const TextStyle(color: Color(0xFFB91C1C)),
                          textAlign: TextAlign.left,
                        ),
                      ],
                      if (widget.infoText != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          widget.infoText!,
                          style: const TextStyle(color: _driverGreen),
                          textAlign: TextAlign.left,
                        ),
                      ],
                      const SizedBox(height: 18),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(54),
                          backgroundColor: _driverGreen,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                          ),
                        ),
                        onPressed: widget.isSubmitting
                            ? null
                            : () {
                                widget.onSubmit(
                                  loginController.text.trim(),
                                  passwordController.text,
                                );
                              },
                        child: Text(
                          widget.isSubmitting ? 'Вход...' : 'Войти',
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextButton(
                        onPressed: widget.isSubmitting ||
                                widget.isRequestingPasswordReset
                            ? null
                            : () {
                                widget.onPasswordResetRequest(
                                  loginController.text.trim(),
                                );
                              },
                        child: Text(
                          widget.isRequestingPasswordReset
                              ? 'Отправляем запрос...'
                              : 'Запросить сброс пароля',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _normalizeKgPhoneLogin(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty || trimmed.contains('@') || trimmed.startsWith('+')) {
    return trimmed;
  }

  var digits = trimmed.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('996')) {
    return '+$digits';
  }
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  return digits.isEmpty ? trimmed : '+996$digits';
}

class HighlightCard extends StatelessWidget {
  const HighlightCard({
    super.key,
    required this.title,
    required this.value,
    required this.subtitle,
    required this.colorA,
    required this.colorB,
    required this.icon,
    this.badge,
  });

  final String title;
  final String value;
  final String subtitle;
  final Color colorA;
  final Color colorB;
  final IconData icon;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(colors: [colorA, colorB]),
        boxShadow: [
          BoxShadow(
            color: colorA.withValues(alpha: 0.16),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: Colors.white, size: 20),
              ),
              const Spacer(),
              if (badge != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    badge!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class MetricTile extends StatelessWidget {
  const MetricTile({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    required this.colorA,
    required this.colorB,
  });

  final String title;
  final String value;
  final IconData icon;
  final Color colorA;
  final Color colorB;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: _driverText.withValues(alpha: 0.05),
            blurRadius: 24,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: LinearGradient(colors: [colorA, colorB]),
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
          const SizedBox(height: 14),
          Text(title, style: const TextStyle(color: _driverMuted)),
          const SizedBox(height: 10),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 20),
          ),
        ],
      ),
    );
  }
}

class InfoCard extends StatelessWidget {
  const InfoCard({
    super.key,
    required this.title,
    required this.lines,
    this.icon,
    this.action,
  });

  final String title;
  final List<String> lines;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: _driverText.withValues(alpha: 0.05),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: _driverGreen.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: _driverGreen, size: 20),
                ),
                const SizedBox(width: 12),
              ],
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 18),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...lines.map(
            (line) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(
                line,
                style: const TextStyle(color: Color(0xFF475569), height: 1.45),
              ),
            ),
          ),
          if (action != null) ...[
            const SizedBox(height: 8),
            action!,
          ],
        ],
      ),
    );
  }
}

class _DriverErrorCard extends StatelessWidget {
  const _DriverErrorCard({
    required this.title,
    required this.lines,
    required this.onRetry,
  });

  final String title;
  final List<String> lines;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InfoCard(
          title: title,
          lines: lines,
          icon: Icons.wifi_off_rounded,
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh_rounded),
          label: const Text('Обновить'),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(48),
            side: BorderSide(color: _driverText.withValues(alpha: 0.14)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
            ),
          ),
        ),
      ],
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.label, {super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            color: _driverMuted,
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

class _DriverHero extends StatelessWidget {
  const _DriverHero({
    required this.title,
    required this.subtitle,
    required this.icon,
  });

  final String title;
  final String subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0F172A), Color(0xFF166534)],
        ),
        boxShadow: [
          BoxShadow(
            color: _driverGreen.withValues(alpha: 0.18),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'GoPark',
                  style: TextStyle(
                    color: Colors.white70,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                    letterSpacing: 0.8,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    height: 1.0,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 13,
                    height: 1.2,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Container(
            width: 56,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Image.asset(
                'assets/gopark-logo.png',
                fit: BoxFit.contain,
                semanticLabel: 'GoPark',
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Color _driverScheduleColor(String status) {
  switch (status) {
    case 'paid':
      return _driverGreen;
    case 'partial':
      return _driverOrange;
    case 'overdue':
      return const Color(0xFFEF4444);
    default:
      return _driverBlue;
  }
}

String _driverScheduleBadge(String status) {
  switch (status) {
    case 'paid':
      return 'Оплачен';
    case 'partial':
      return 'Частично';
    case 'deferred':
      return 'Отложен';
    case 'overdue':
      return 'Просрочен';
    case 'planned':
      return 'Ожидает';
    default:
      return status;
  }
}

String _driverPaymentScheduleSubtitle(DriverPaymentScheduleItemDto item) {
  final parts = <String>[];
  if (item.installmentAmount > 0) {
    parts.add('Договор ${_driverMoneyLabel(item.installmentAmount)}');
  }
  if (item.gpsAmount > 0) {
    parts.add('GPS ${_driverMoneyLabel(item.gpsAmount)}');
  }
  if (item.insuranceAmount > 0) {
    parts.add('Страховка ${_driverMoneyLabel(item.insuranceAmount)}');
  }

  final paidLine =
      'Оплачено ${_driverMoneyLabel(item.paidAmount)} из ${_driverMoneyLabel(item.amount)}';
  if (parts.isEmpty || item.type != 'installment') {
    return paidLine;
  }

  return '${parts.join(' · ')}\n$paidLine';
}

String _driverScheduleDayStatus(
  DriverPaymentScheduleItemDto item,
  String todayOnly,
) {
  if (item.status == 'paid' ||
      item.status == 'partial' ||
      item.status == 'deferred') {
    return item.status;
  }
  if (item.dueDate.compareTo(todayOnly) < 0 && item.amount > item.paidAmount) {
    return 'overdue';
  }
  return 'planned';
}

String _driverCalendarAggregateStatus(
  List<DriverPaymentScheduleItemDto> items,
  String todayOnly,
) {
  if (items
      .any((item) => _driverScheduleDayStatus(item, todayOnly) == 'overdue')) {
    return 'overdue';
  }
  if (items.any((item) => item.status == 'partial')) {
    return 'partial';
  }
  if (items.every((item) => item.status == 'paid')) {
    return 'paid';
  }
  if (items.any((item) => item.status == 'deferred')) {
    return 'deferred';
  }
  return 'future';
}

Color _driverCalendarStatusColor(String status) {
  switch (status) {
    case 'paid':
      return _driverGreen;
    case 'partial':
      return _driverOrange;
    case 'overdue':
      return const Color(0xFFEF4444);
    case 'deferred':
      return _driverPurple;
    case 'future':
      return const Color(0xFFCBD5E1);
    default:
      return const Color(0xFFE5E7EB);
  }
}

String _driverMonthName(int month) {
  const months = [
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
    'Декабрь',
  ];
  return months[(month - 1).clamp(0, 11)];
}

String _driverPaymentTypeLabel(String type) {
  switch (type) {
    case 'gps':
      return 'GPS';
    case 'insurance':
      return 'Страховка';
    case 'penalty':
      return 'Штраф';
    case 'adjustment':
      return 'Корректировка';
    default:
      return 'Договор';
  }
}

Color _driverPaymentStatusColor(String status) {
  switch (status) {
    case 'succeeded':
    case 'paid':
      return _driverGreen;
    case 'pending':
    case 'processing':
      return _driverOrange;
    case 'failed':
    case 'rejected':
      return const Color(0xFFEF4444);
    default:
      return _driverBlue;
  }
}

String _driverPaymentStatusLabel(String status) {
  switch (status) {
    case 'succeeded':
      return 'Оплачено';
    case 'paid':
      return 'Оплачен';
    case 'pending':
      return 'Ожидает';
    case 'processing':
      return 'В обработке';
    case 'failed':
      return 'Ошибка';
    case 'rejected':
      return 'Отклонено';
    default:
      return status;
  }
}

Color _driverPayoutColor(String status) {
  switch (status) {
    case 'approved':
      return _driverGreen;
    case 'requested':
      return _driverOrange;
    default:
      return _driverBlue;
  }
}

String _driverPayoutBadge(String status) {
  switch (status) {
    case 'approved':
      return 'Одобрено';
    case 'requested':
      return 'Ожидает';
    default:
      return status;
  }
}

String _driverStatusRequestSubtitle(
  DriverStatusRequestDto item, {
  bool includeDate = false,
}) {
  final parts = [
    if (includeDate) _driverDateLabel(item.createdAt),
    _driverPeriodLabel(item.period),
    _driverRequestStatusLabel(item.status),
  ];
  final note = item.note?.trim();
  if (note?.isNotEmpty == true) {
    return '${parts.join(' • ')}\n\nПричина: $note';
  }
  return parts.join(' • ');
}

String _driverNotificationTemplateLabel(String template) {
  switch (template) {
    case 'payout_requested':
      return 'Заявка на вывод создана';
    case 'payout_approved':
      return 'Вывод одобрен';
    case 'payout_rejected':
      return 'Вывод отклонён';
    case 'payment_registered':
      return 'Платёж принят';
    case 'status_request_created':
      return 'Запрос отправлен';
    case 'status_request_approved':
      return 'Запрос одобрен';
    case 'status_request_rejected':
      return 'Запрос отклонён';
    case 'chat_message_received':
      return 'Новое сообщение';
    default:
      return template;
  }
}

Color _driverNotificationColor(DriverNotificationItemDto item) {
  if (item.template == 'payment_registered') {
    return _driverGreen;
  }
  if (item.status == 'pending') {
    return _driverOrange;
  }
  return _driverBlue;
}

String _driverNotificationStatusLabel(String status) {
  switch (status) {
    case 'pending':
      return 'Новое';
    case 'sent':
      return 'Отправлено';
    case 'published':
      return 'Отправлено';
    case 'failed':
      return 'Ошибка';
    default:
      return status;
  }
}

String _driverNotificationChannelLabel(String channel) {
  switch (channel) {
    case 'push':
      return 'Push';
    case 'sms':
      return 'SMS';
    case 'in_app':
      return 'В приложении';
    default:
      return channel;
  }
}

Future<bool> _confirmQuickStatusRequest(
  BuildContext context, {
  required String type,
  required String period,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) {
      return AlertDialog(
        title: const Text('Подтвердить запрос?'),
        content: Text(
          'Создать быстрый статус "${_driverRequestTypeLabel(type)}" на ${_driverDateLabel(period)}?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Подтвердить'),
          ),
        ],
      );
    },
  );
  return result ?? false;
}

Future<String?> _showForceMajeureReasonDialog(BuildContext context) async {
  final controller = TextEditingController();
  try {
    return showDialog<String?>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: const Text('Причина форс-мажора'),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 4,
            decoration: _driverInputDecoration(
              'Опишите причину',
              Icons.edit_note_rounded,
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(null),
              child: const Text('Отмена'),
            ),
            FilledButton(
              onPressed: () {
                final note = controller.text.trim();
                if (note.isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Укажите причину форс-мажора'),
                    ),
                  );
                  return;
                }
                Navigator.of(dialogContext).pop(note);
              },
              child: const Text('Отправить'),
            ),
          ],
        );
      },
    );
  } finally {
    controller.dispose();
  }
}

Future<num?> _showPartialPaymentSheet(
  BuildContext context, {
  required num suggestedAmount,
}) async {
  final controller = TextEditingController(
    text: suggestedAmount > 0 ? suggestedAmount.round().toString() : '',
  );
  try {
    return showModalBottomSheet<num>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final entered = num.tryParse(controller.text.trim());
            final isValid = entered != null && entered > 0;

            void setAmount(num value) {
              controller.text = value.round().toString();
              setSheetState(() {});
            }

            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 16,
              ),
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: [
                    BoxShadow(
                      color: _driverText.withValues(alpha: 0.14),
                      blurRadius: 32,
                      offset: const Offset(0, 18),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Оплата частями',
                      style:
                          TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Можно оплатить любую сумму. Сначала закрывается платеж за сегодня, затем просрочка, остаток уходит на будущие платежи.',
                      style: TextStyle(color: _driverMuted, height: 1.5),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: controller,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: _driverInputDecoration(
                        'Сумма оплаты',
                        Icons.payments_rounded,
                      ).copyWith(
                        helperText: suggestedAmount > 0
                            ? 'Ориентир сейчас ${_driverMoneyLabel(suggestedAmount)}'
                            : 'Без ограничения сверху',
                        errorText: controller.text.trim().isNotEmpty && !isValid
                            ? 'Введите сумму больше 0'
                            : null,
                      ),
                      onChanged: (_) => setSheetState(() {}),
                    ),
                    const SizedBox(height: 14),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        if (suggestedAmount > 0)
                          DriverAmountChip(
                            label: 'Текущий платёж',
                            selected: entered == suggestedAmount.round(),
                            onTap: () => setAmount(suggestedAmount),
                          ),
                        DriverAmountChip(
                          label: '1 000',
                          selected: entered == 1000,
                          onTap: () => setAmount(1000),
                        ),
                        DriverAmountChip(
                          label: '5 000',
                          selected: entered == 5000,
                          onTap: () => setAmount(5000),
                        ),
                        DriverAmountChip(
                          label: '10 000',
                          selected: entered == 10000,
                          onTap: () => setAmount(10000),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.of(sheetContext).pop(),
                            child: const Text('Отмена'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            onPressed: isValid
                                ? () => Navigator.of(sheetContext).pop(entered)
                                : null,
                            style: FilledButton.styleFrom(
                              backgroundColor: _driverGreen,
                            ),
                            child: const Text('Оплатить'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  } finally {
    controller.dispose();
  }
}

String _driverRequestTypeLabel(String type) {
  switch (type) {
    case 'day_off':
      return 'Выходной';
    case 'vacation':
      return 'Отпросился / отпуск';
    case 'force_majeure':
      return 'Форс-мажор';
    default:
      return type;
  }
}

String _driverRequestStatusLabel(String status) {
  switch (status) {
    case 'approved':
      return 'Одобрено';
    case 'rejected':
      return 'Отклонено';
    case 'pending':
      return 'На рассмотрении';
    default:
      return status;
  }
}

String _driverStatusRequestErrorMessage(Object error) {
  final message = _driverUserError(error);
  if (message.contains('overlaps an existing pending or approved request')) {
    return 'На эту дату уже есть активный запрос. Проверьте раздел запросов.';
  }
  if (message.contains('Status request period must')) {
    return 'Неверная дата запроса. Обновите приложение и попробуйте снова.';
  }
  if (message.contains('Unsupported status request type')) {
    return 'Такой тип запроса сейчас отключён в настройках CRM.';
  }
  if (message.contains('Drivers can access only their own mobile routes') ||
      message.contains('Driver not found') ||
      message.contains('Current user is required')) {
    return 'Не удалось определить водителя. Выйдите и войдите заново.';
  }

  return 'Не удалось создать быстрый запрос: $message';
}

String _driverUserError(Object error) {
  var message = error.toString().trim();
  if (message.startsWith('Exception: ')) {
    message = message.substring('Exception: '.length).trim();
  }
  final normalized = message.toLowerCase();
  if (normalized.contains('clientexception') ||
      normalized.contains('socketexception') ||
      normalized.contains('failed host lookup') ||
      normalized.contains('connection failed') ||
      normalized.contains('network is unreachable') ||
      normalized.contains('connection refused')) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
  }
  if (normalized.contains('internal server error')) {
    return 'На сервере произошла ошибка. Попробуйте ещё раз или обратитесь к администратору.';
  }
  if (normalized.contains('driver api failed') || normalized.contains('request failed')) {
    return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
  }
  if (normalized.contains('payload too large')) {
    return 'Файл слишком большой. Уменьшите фото и попробуйте снова.';
  }
  if (normalized.contains('forbidden') || normalized.contains('insufficient role')) {
    return 'Недостаточно прав для этого действия.';
  }
  if (normalized.contains('not found')) {
    return 'Запись не найдена или уже удалена.';
  }
  return message.isEmpty ? 'Не удалось выполнить действие. Попробуйте ещё раз.' : message;
}

String _driverDateOnly(DateTime value) {
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '${value.year}-$month-$day';
}

DateTime _driverComparableDate(String? value) {
  return DateTime.tryParse(value ?? '') ??
      DateTime.fromMillisecondsSinceEpoch(0);
}

bool _isDriverDateToday(String? value) {
  if (value == null || value.isEmpty) {
    return false;
  }
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return false;
  }
  return _driverDateOnly(parsed) == _driverDateOnly(DateTime.now());
}

String _driverMoneyLabel(num value) {
  final rounded = value.round();
  final formatted = rounded.toString().replaceAllMapped(
        RegExp(r'\B(?=(\d{3})+(?!\d))'),
        (_) => ' ',
      );
  return '$formatted сом';
}

String _driverRequestStatusLikeLabel(String status) {
  switch (status) {
    case 'active':
      return 'Активен';
    case 'closed':
      return 'Закрыт';
    default:
      return status;
  }
}

String _driverStatusLabel(String? status) {
  switch (status) {
    case 'active':
      return 'Активен';
    case 'day_off':
      return 'Выходной';
    case 'vacation':
      return 'Отпросился / отпуск';
    case 'force_majeure':
      return 'Форс-мажор';
    case null:
      return 'Не указан';
    default:
      return status;
  }
}

String _driverRoleLabel(String role) {
  switch (role) {
    case 'driver':
      return 'Водитель';
    default:
      return role;
  }
}

String _driverDateLabel(String? value) {
  if (value == null || value.isEmpty) {
    return 'нет';
  }

  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return value;
  }

  final day = parsed.day.toString().padLeft(2, '0');
  final month = parsed.month.toString().padLeft(2, '0');
  return '$day.$month.${parsed.year}';
}

String _driverPeriodLabel(String period) {
  if (!period.contains('..')) {
    return _driverDateLabel(period);
  }

  final parts = period.split('..').map((item) => item.trim()).toList();
  if (parts.length != 2) {
    return period;
  }

  return '${_driverDateLabel(parts[0])} - ${_driverDateLabel(parts[1])}';
}

InputDecoration _driverInputDecoration(String label, IconData icon) {
  return InputDecoration(
    labelText: label,
    prefixIcon: Icon(icon, color: _driverMuted),
    filled: true,
    fillColor: Colors.white.withValues(alpha: 0.92),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(18),
      borderSide: BorderSide(color: _driverText.withValues(alpha: 0.08)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(18),
      borderSide: BorderSide(color: _driverText.withValues(alpha: 0.08)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(18),
      borderSide: const BorderSide(color: _driverGreen, width: 1.5),
    ),
  );
}
