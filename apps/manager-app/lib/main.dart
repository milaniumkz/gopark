import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'platform_storage.dart';
import 'push_notifications.dart';
import 'repository.dart';

const _managerBg = Color(0xFFF4F7FB);
const _managerSurface = Color(0xFFFFFFFF);
const _managerText = Color(0xFF0F172A);
const _managerMuted = Color(0xFF64748B);
const _managerBlue = Color(0xFF2563EB);
const _managerCyan = Color(0xFF06B6D4);
const _managerPurple = Color(0xFF9333EA);
const _managerOrange = Color(0xFFF97316);
const _managerGreen = Color(0xFF10B981);
const _managerSessionStorageKey = 'gopark_manager_session';
const _managerSessionMaxAge = Duration(days: 7);

String _encodeManagerStoredSession(ManagerAuthSessionDto session) {
  return jsonEncode({
    'savedAt': DateTime.now().toUtc().toIso8601String(),
    'session': session.toJson(),
  });
}

Map<String, dynamic>? _decodeManagerStoredSession(String stored) {
  final decoded = jsonDecode(stored);
  if (decoded is! Map<String, dynamic>) {
    return null;
  }

  final sessionJson = decoded['session'];
  if (sessionJson is Map<String, dynamic>) {
    final savedAt = DateTime.tryParse('${decoded['savedAt'] ?? ''}');
    if (savedAt != null &&
        DateTime.now().toUtc().difference(savedAt.toUtc()) >
            _managerSessionMaxAge) {
      return null;
    }

    return sessionJson;
  }

  return decoded;
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const GoParkManagerApp());
}

class GoParkManagerApp extends StatelessWidget {
  const GoParkManagerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GoPark Brigadier',
      locale: const Locale('ru'),
      supportedLocales: const [Locale('ru')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: _managerBlue,
          primary: _managerBlue,
          secondary: _managerCyan,
          surface: _managerSurface,
        ),
        scaffoldBackgroundColor: _managerBg,
        useMaterial3: true,
        textTheme: ThemeData.light().textTheme.apply(
              bodyColor: _managerText,
              displayColor: _managerText,
            ),
        navigationBarTheme: NavigationBarThemeData(
          height: 50,
          backgroundColor: Colors.white.withValues(alpha: 0.94),
          indicatorColor: _managerBlue.withValues(alpha: 0.14),
          labelTextStyle: WidgetStateProperty.resolveWith(
            (states) => TextStyle(
              fontWeight: FontWeight.w700,
              color: states.contains(WidgetState.selected)
                  ? _managerBlue
                  : _managerMuted,
            ),
          ),
        ),
      ),
      home: const ManagerShell(),
    );
  }
}

class ManagerShell extends StatefulWidget {
  const ManagerShell({super.key});

  @override
  State<ManagerShell> createState() => _ManagerShellState();
}

class _ManagerShellState extends State<ManagerShell>
    with WidgetsBindingObserver {
  int index = 0;
  ManagerDriverListFilter driverFilter = ManagerDriverListFilter.all;
  ManagerVehicleFilter vehicleFilter = ManagerVehicleFilter.assigned;
  ManagerAlertsSection alertsSection = ManagerAlertsSection.all;
  String? selectedManagerId;
  String? selectedManagerName;
  final repository = ManagerRepository(ManagerApiClient());
  ManagerAuthSessionDto? session;
  String? authError;
  bool isAuthenticating = false;
  DateTime? _lastBackPressedAt;

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

  @override
  Widget build(BuildContext context) {
    final activeSession = session;
    if (activeSession == null) {
      return ManagerLoginPage(
        isSubmitting: isAuthenticating,
        errorText: authError,
        onSubmit: _signIn,
      );
    }

    void openDrivers(ManagerDriverListFilter filter) {
      setState(() {
        driverFilter = filter;
        alertsSection = ManagerAlertsSection.all;
        selectedManagerId = null;
        selectedManagerName = null;
        index = 1;
      });
    }

    void openManagerDrivers(ManagerTeamDto manager) {
      setState(() {
        selectedManagerId = manager.managerProfileId;
        selectedManagerName = manager.displayName;
        driverFilter = ManagerDriverListFilter.all;
        alertsSection = ManagerAlertsSection.all;
        index = 1;
      });
    }

    void openAlerts(ManagerAlertsSection section) {
      setState(() {
        alertsSection = section;
        index = 4;
      });
    }

    void openVehicles(
        [ManagerVehicleFilter filter = ManagerVehicleFilter.assigned]) {
      setState(() {
        vehicleFilter = filter;
        index = 2;
      });
    }

    void openInsuranceTo() {
      setState(() {
        index = 3;
      });
    }

    void openNotifications() {
      setState(() {
        alertsSection = ManagerAlertsSection.all;
        index = 4;
      });
    }

    final pages = [
      ManagerDashboardPage(
        repository: repository,
        session: activeSession,
        onOpenDrivers: openDrivers,
        onOpenManagerDrivers: openManagerDrivers,
        onOpenAlerts: openAlerts,
        onOpenVehicles: openVehicles,
        onOpenInsuranceTo: openInsuranceTo,
      ),
      ManagerDriversPage(
        repository: repository,
        initialFilter: driverFilter,
        selectedManagerId: selectedManagerId,
        selectedManagerName: selectedManagerName,
        onFilterChanged: (filter) => setState(() => driverFilter = filter),
      ),
      ManagerVehiclesPage(
        repository: repository,
        initialFilter: vehicleFilter,
        onFilterChanged: (filter) => setState(() => vehicleFilter = filter),
      ),
      ManagerInsuranceToPage(repository: repository),
      ManagerAlertsPage(
        repository: repository,
        initialSection: alertsSection,
        isSeniorManager: activeSession.managerLevel == 'senior',
      ),
      ManagerChatPage(repository: repository),
      ManagerProfilePage(
        session: activeSession,
        onOpenNotifications: openNotifications,
        onSignOut: _signOut,
      ),
    ];

    final selectedNavIndex = index <= 3
        ? index
        : index == 5
            ? 4
            : 5;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) {
          return;
        }
        if (index != 0) {
          setState(() {
            index = 0;
            driverFilter = ManagerDriverListFilter.all;
            vehicleFilter = ManagerVehicleFilter.assigned;
            alertsSection = ManagerAlertsSection.all;
            selectedManagerId = null;
            selectedManagerName = null;
            _lastBackPressedAt = null;
          });
          return;
        }

        final now = DateTime.now();
        final canExit = _lastBackPressedAt != null &&
            now.difference(_lastBackPressedAt!) < const Duration(seconds: 2);
        if (canExit) {
          SystemNavigator.pop();
          return;
        }

        _lastBackPressedAt = now;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Нажмите назад ещё раз для выхода')),
        );
      },
      child: Scaffold(
        body: ColoredBox(
          color: _managerBg,
          child: SafeArea(child: pages[index]),
        ),
        bottomNavigationBar: NavigationBar(
          height: 54,
          selectedIndex: selectedNavIndex,
          onDestinationSelected: (value) => setState(() {
            index = value <= 3
                ? value
                : value == 4
                    ? 5
                    : 6;
            if (value == 2) {
              vehicleFilter = ManagerVehicleFilter.assigned;
            }
            _lastBackPressedAt = null;
          }),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.dashboard_outlined),
              label: 'Главная',
            ),
            NavigationDestination(
              icon: Icon(Icons.groups_outlined),
              label: 'Водители',
            ),
            NavigationDestination(
              icon: Icon(Icons.directions_car_outlined),
              label: 'Авто',
            ),
            NavigationDestination(
              icon: Icon(Icons.verified_user_outlined),
              label: 'ТО',
            ),
            NavigationDestination(
              icon: Icon(Icons.chat_bubble_outline),
              label: 'Чат',
            ),
            NavigationDestination(
              icon: Icon(Icons.person_outline),
              label: 'Профиль',
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _signIn(String login, String password) async {
    final normalizedLogin = _normalizeKgPhoneLogin(login);
    final normalizedPassword = password.trim();

    setState(() {
      isAuthenticating = true;
      authError = null;
    });

    try {
      final nextSession = await repository.authenticate(
        normalizedLogin,
        normalizedPassword,
      );
      await writeStorageValue(
        _managerSessionStorageKey,
        _encodeManagerStoredSession(nextSession),
      );
      setState(() {
        session = nextSession;
        index = 0;
      });
      unawaited(_registerPushToken());
    } catch (error) {
      setState(() {
        authError = _managerUserError(error);
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
    unawaited(removeStorageValue(_managerSessionStorageKey));
    setState(() {
      session = null;
      authError = null;
      index = 0;
    });
  }

  Future<void> _restoreStoredSession() async {
    final stored = await readStorageValue(_managerSessionStorageKey);
    if (stored == null || stored.isEmpty) {
      return;
    }

    try {
      final decoded = _decodeManagerStoredSession(stored);
      if (decoded == null) {
        await removeStorageValue(_managerSessionStorageKey);
        return;
      }
      final restoredSession = ManagerAuthSessionDto.fromJson(decoded);
      repository.restoreSession(restoredSession);
      var activeSession = restoredSession;
      try {
        activeSession = await repository.refreshSession();
        await writeStorageValue(
          _managerSessionStorageKey,
          _encodeManagerStoredSession(activeSession),
        );
      } catch (_) {
        // Keep the saved session on temporary network/API refresh failures.
      }
      if (!mounted) {
        return;
      }
      setState(() {
        session = activeSession;
        index = 0;
      });
      unawaited(_registerPushToken());
    } catch (_) {
      await removeStorageValue(_managerSessionStorageKey);
    }
  }

  Future<void> _refreshStoredSession() async {
    try {
      final refreshedSession = await repository.refreshSession();
      await writeStorageValue(
        _managerSessionStorageKey,
        _encodeManagerStoredSession(refreshedSession),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        session = refreshedSession;
      });
      unawaited(_registerPushToken());
    } catch (_) {
      if (!mounted) {
        return;
      }
      // Keep the saved session on temporary network/API refresh failures.
      // The user should stay authorized until pressing the explicit sign-out button.
      setState(() => authError = null);
    }
  }

  Future<void> _registerPushToken() async {
    final token = await ManagerPushNotifications.initAndGetToken();
    if (token == null || token.trim().isEmpty) {
      return;
    }

    await repository.registerPushToken(token);
    ManagerPushNotifications.listenTokenRefresh(repository.registerPushToken);
  }
}

enum ManagerDriverListFilter {
  all,
  paymentDue,
  overdue,
  withCar,
  withoutCar,
  terminated,
  vehicleOffice,
  vehicleAssigned,
  vehicleAccident,
  vehicleRepair,
  vehicleIdle,
  vehicleImpound,
  vehicleWrittenOff,
}

enum ManagerAlertsSection { all, requests, risk, alerts, incidents }

enum ManagerVehicleFilter {
  all,
  office,
  assigned,
  accident,
  repair,
  idle,
  impound,
  writtenOff
}

int _countIdleVehicles(List<ManagerIdleVehicleDto> items, String category) {
  return items.where((item) => item.category == category).length;
}

String _currentManagerDisplayName(
  ManagerAuthSessionDto session,
  List<ManagerTeamDto> managers,
) {
  for (final manager in managers) {
    if (manager.id == session.requestUserId ||
        manager.managerProfileId == session.requestUserId) {
      final name = manager.displayName.trim();
      if (name.isNotEmpty) {
        return name;
      }
    }
  }
  return session.managerLevel == 'senior' ? 'Старший бригадир' : 'Бригадир';
}

void _showIdleVehiclesSheet(
  BuildContext context,
  List<ManagerIdleVehicleDto> items,
) {
  const categories = [
    ('office', 'В офисе'),
    ('accident', 'ДТП'),
    ('insurance_gps', 'Страховка/GPS'),
    ('service', 'СТО'),
    ('impound', 'Штрафстоянка'),
    ('written_off', 'Списанные'),
  ];

  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) {
      return DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.88,
        minChildSize: 0.36,
        builder: (context, controller) {
          return Container(
            decoration: const BoxDecoration(
              color: _managerSurface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.all(8),
              children: [
                const _SectionTitle('Машины в простое'),
                const SizedBox(height: 6),
                for (final category in categories) ...[
                  ManagerInfoCard(
                    title:
                        '${category.$2} · ${_countIdleVehicles(items, category.$1)}',
                    lines: items
                        .where((item) => item.category == category.$1)
                        .map((item) {
                      final since = item.sinceDate == null
                          ? ''
                          : ' · с ${_managerDateLabel(item.sinceDate)}';
                      final owner = [
                        if (item.driverName?.trim().isNotEmpty == true)
                          'водитель: ${item.driverName}',
                        if (item.managerName?.trim().isNotEmpty == true)
                          'бригадир: ${item.managerName}',
                      ].join(' · ');
                      return '${item.plateNumber} · ${item.label.isEmpty ? item.reason : item.label} · ${item.reason}${owner.isEmpty ? '' : ' · $owner'}$since';
                    }).toList()
                      ..sort(),
                    icon: Icons.directions_car_filled_outlined,
                  ),
                  const SizedBox(height: 6),
                ],
              ],
            ),
          );
        },
      );
    },
  );
}

void _showManagersSheet(
  BuildContext context,
  List<ManagerTeamDto> items,
  ValueChanged<ManagerTeamDto> onOpenManager,
) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) {
      return DraggableScrollableSheet(
        initialChildSize: 0.66,
        maxChildSize: 0.92,
        minChildSize: 0.42,
        builder: (context, controller) {
          return Container(
            decoration: const BoxDecoration(
              color: _managerSurface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: ListView(
              controller: controller,
              padding: const EdgeInsets.all(8),
              children: [
                const _SectionTitle('Бригадиры'),
                const SizedBox(height: 6),
                if (items.isEmpty)
                  const ManagerInfoCard(
                    title: 'Бригадиров нет',
                    lines: ['Список доступных бригадиров пуст'],
                    icon: Icons.supervisor_account_outlined,
                  ),
                for (final item in items) ...[
                  GestureDetector(
                    onTap: () {
                      Navigator.of(context).pop();
                      onOpenManager(item);
                    },
                    child: ManagerInfoCard(
                      title: item.displayName,
                      lines: [
                        item.managerLevel == 'senior'
                            ? 'Старший бригадир'
                            : 'Бригадир',
                        'Телефон: ${item.phone}',
                        'Водители: ${item.driversTotal} · Проблемные: ${item.problemDrivers}',
                        'Машины: ${item.carsTotal} · Долг: ${item.debtTotal} сом',
                        'В простое: ${item.idleCarsTotal} · В офисе: ${item.idleOfficeCars}',
                        'ДТП: ${item.idleAccidentCars} · СТО: ${item.idleServiceCars}',
                        'Страховка/GPS: ${item.idleInsuranceGpsCars} · Штрафстоянка: ${item.idleImpoundCars}',
                        'Нажмите, чтобы открыть карточку бригадира',
                      ],
                      icon: Icons.groups_2_outlined,
                    ),
                  ),
                  const SizedBox(height: 6),
                ],
              ],
            ),
          );
        },
      );
    },
  );
}

class ManagerDashboardPage extends StatefulWidget {
  const ManagerDashboardPage({
    super.key,
    required this.repository,
    required this.session,
    required this.onOpenDrivers,
    required this.onOpenManagerDrivers,
    required this.onOpenAlerts,
    required this.onOpenVehicles,
    required this.onOpenInsuranceTo,
  });

  final ManagerRepository repository;
  final ManagerAuthSessionDto session;
  final ValueChanged<ManagerDriverListFilter> onOpenDrivers;
  final ValueChanged<ManagerTeamDto> onOpenManagerDrivers;
  final ValueChanged<ManagerAlertsSection> onOpenAlerts;
  final ValueChanged<ManagerVehicleFilter> onOpenVehicles;
  final VoidCallback onOpenInsuranceTo;

  @override
  State<ManagerDashboardPage> createState() => _ManagerDashboardPageState();
}

class _ManagerDashboardPageState extends State<ManagerDashboardPage> {
  late Future<ManagerSummaryDto> _summaryFuture;
  ManagerRepository get repository => widget.repository;
  ManagerAuthSessionDto get session => widget.session;
  ValueChanged<ManagerDriverListFilter> get onOpenDrivers => widget.onOpenDrivers;
  ValueChanged<ManagerTeamDto> get onOpenManagerDrivers => widget.onOpenManagerDrivers;
  ValueChanged<ManagerAlertsSection> get onOpenAlerts => widget.onOpenAlerts;
  ValueChanged<ManagerVehicleFilter> get onOpenVehicles => widget.onOpenVehicles;
  VoidCallback get onOpenInsuranceTo => widget.onOpenInsuranceTo;

  @override
  void initState() { super.initState(); _summaryFuture = repository.loadSummary(); }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<ManagerSummaryDto>(
      future: _summaryFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) return _ManagerLoadError(error: snapshot.error, onRetry: () => setState(() { _summaryFuture = repository.loadSummary(); }));
        final summary = snapshot.data;

        return ListView(
          padding: const EdgeInsets.all(8),
          children: [
            FutureBuilder<List<ManagerTeamDto>>(
              future: repository.loadManagers(),
              builder: (context, managersSnapshot) {
                final managerName = _currentManagerDisplayName(
                  session,
                  managersSnapshot.data ?? const <ManagerTeamDto>[],
                );
                return _ManagerHero(
                  title: managerName,
                  subtitle: session.managerLevel == 'senior'
                      ? 'Старший бригадир'
                      : 'Бригадир',
                  icon: Icons.dashboard_customize_rounded,
                );
              },
            ),
            const SizedBox(height: 6),
            SummaryGrid(
              repository: repository,
              summary: summary,
              onOpenDrivers: onOpenDrivers,
              onOpenAlerts: onOpenAlerts,
              onOpenVehicles: onOpenVehicles,
              onOpenInsuranceTo: onOpenInsuranceTo,
            ),
            const SizedBox(height: 6),
            FutureBuilder<List<ManagerIdleVehicleDto>>(
              future: repository.loadIdleVehicles(),
              builder: (context, snapshot) {
                final idleVehicles =
                    snapshot.data ?? const <ManagerIdleVehicleDto>[];
                return GestureDetector(
                  onTap: () => _showIdleVehiclesSheet(context, idleVehicles),
                  child: ManagerInfoCard(
                    title: 'Машины в простое',
                    lines: [
                      '${idleVehicles.length} авто без активной выдачи',
                      'В офисе: ${_countIdleVehicles(idleVehicles, 'office')}',
                      'ДТП: ${_countIdleVehicles(idleVehicles, 'accident')} · СТО: ${_countIdleVehicles(idleVehicles, 'service')}',
                      'Страховка/GPS: ${_countIdleVehicles(idleVehicles, 'insurance_gps')} · Штрафстоянка: ${_countIdleVehicles(idleVehicles, 'impound')}',
                    ],
                    icon: Icons.local_parking_rounded,
                  ),
                );
              },
            ),
            const SizedBox(height: 6),
            FutureBuilder<List<ManagerTeamDto>>(
              future: repository.loadManagers(),
              builder: (context, snapshot) {
                final managers = snapshot.data ?? const <ManagerTeamDto>[];
                return GestureDetector(
                  onTap: () => _showManagersSheet(
                      context, managers, onOpenManagerDrivers),
                  child: ManagerInfoCard(
                    title: 'Бригадиры',
                    lines: [
                      '${managers.length} бригадиров в доступе',
                      'Водителей: ${managers.fold<int>(0, (sum, item) => sum + item.driversTotal)}',
                      'Проблемных: ${managers.fold<int>(0, (sum, item) => sum + item.problemDrivers)}',
                      'Машин: ${managers.fold<int>(0, (sum, item) => sum + item.carsTotal)}',
                      'В простое: ${managers.fold<int>(0, (sum, item) => sum + item.idleCarsTotal)}',
                    ],
                    icon: Icons.supervisor_account_outlined,
                  ),
                );
              },
            ),
            const SizedBox(height: 6),
            const _SectionTitle('Быстрые действия'),
            const SizedBox(height: 6),
            FutureBuilder<List<ManagerQuickActionDto>>(
              future: repository.loadQuickActions(),
              builder: (context, snapshot) {
                final items = snapshot.data ?? const [];
                return Column(
                  children: items
                      .map(
                        (item) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: GestureDetector(
                            onTap: () async {
                              final messenger = ScaffoldMessenger.of(context);
                              await repository.executeQuickAction(item.id);
                              messenger.showSnackBar(
                                const SnackBar(
                                  content: Text('Действие выполнено'),
                                ),
                              );
                            },
                            child: ManagerInfoCard(
                              title: item.label,
                              lines: [item.target],
                              icon: Icons.flash_on_rounded,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                );
              },
            ),
          ],
        );
      },
    );
  }
}

class SummaryGrid extends StatelessWidget {
  const SummaryGrid({
    super.key,
    required this.repository,
    required this.summary,
    required this.onOpenDrivers,
    required this.onOpenAlerts,
    required this.onOpenVehicles,
    required this.onOpenInsuranceTo,
  });

  final ManagerRepository repository;
  final ManagerSummaryDto? summary;
  final ValueChanged<ManagerDriverListFilter> onOpenDrivers;
  final ValueChanged<ManagerAlertsSection> onOpenAlerts;
  final ValueChanged<ManagerVehicleFilter> onOpenVehicles;
  final VoidCallback onOpenInsuranceTo;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 6,
      mainAxisSpacing: 6,
      childAspectRatio: 1.8 / (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1.0, 3.0),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        ManagerMetric(
          title: 'Водители',
          value: '${summary?.assignedDrivers ?? 0}',
          icon: Icons.groups_rounded,
          colorA: _managerBlue,
          colorB: _managerCyan,
          onTap: () => onOpenDrivers(ManagerDriverListFilter.all),
        ),
        ManagerMetric(
          title: 'К оплате',
          value:
              '${summary?.paymentDueDrivers ?? summary?.overdueDrivers ?? 0}',
          icon: Icons.warning_amber_rounded,
          colorA: _managerOrange,
          colorB: const Color(0xFFEF4444),
          onTap: () => onOpenDrivers(ManagerDriverListFilter.paymentDue),
        ),
        ManagerMetric(
          title: 'Автомобили',
          value: '${summary?.activeCars ?? 0}',
          icon: Icons.local_taxi_rounded,
          colorA: _managerGreen,
          colorB: const Color(0xFF16A34A),
          onTap: () => onOpenVehicles(ManagerVehicleFilter.all),
        ),
        ManagerMetric(
          title: 'Инциденты',
          value: '${summary?.incidentsOpen ?? 0}',
          icon: Icons.report_gmailerrorred_rounded,
          colorA: _managerPurple,
          colorB: const Color(0xFFEC4899),
          onTap: () => onOpenAlerts(ManagerAlertsSection.incidents),
        ),
        FutureBuilder<List<ManagerVehicleDto>>(
          future: repository.loadVehicles(),
          builder: (context, snapshot) {
            final freeCars = _filterManagerVehicles(
              snapshot.data ?? const <ManagerVehicleDto>[],
              ManagerVehicleFilter.office,
            ).length;
            return ManagerMetric(
              title: 'Свободные авто',
              value: '$freeCars',
              icon: Icons.local_parking_rounded,
              colorA: _managerBlue,
              colorB: _managerCyan,
              onTap: () => onOpenVehicles(ManagerVehicleFilter.office),
            );
          },
        ),
        FutureBuilder<List<ManagerVehicleDto>>(
          future: repository.loadVehicles(),
          builder: (context, snapshot) {
            final rows = snapshot.data ?? const <ManagerVehicleDto>[];
            final attention = rows
                .where((vehicle) =>
                    _managerVehicleHasExpiredDocument(vehicle) ||
                    _managerVehicleHasMissingDocument(vehicle) ||
                    _managerVehicleNeedsOil(vehicle))
                .length;
            return ManagerMetric(
              title: 'Страховка и ТО',
              value: '$attention',
              icon: Icons.verified_user_outlined,
              colorA: _managerOrange,
              colorB: const Color(0xFFEF4444),
              onTap: onOpenInsuranceTo,
            );
          },
        ),
      ],
    );
  }
}

enum ManagerInsuranceToFilter { all, expired, soon, missing, oil, mileage }

enum ManagerInsuranceToChip { osago, casco, inspection, engine, gearbox }

class ManagerInsuranceToPage extends StatefulWidget {
  const ManagerInsuranceToPage({super.key, required this.repository});

  final ManagerRepository repository;

  @override
  State<ManagerInsuranceToPage> createState() => _ManagerInsuranceToPageState();
}

class _ManagerInsuranceToPageState extends State<ManagerInsuranceToPage> {
  final _searchController = TextEditingController();
  String _query = '';
  ManagerInsuranceToFilter _filter = ManagerInsuranceToFilter.all;
  ManagerInsuranceToChip _chip = ManagerInsuranceToChip.osago;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ManagerVehicleDto>>(
      future: widget.repository.loadVehicles(),
      builder: (context, snapshot) {
        final allRows = snapshot.data ?? const <ManagerVehicleDto>[];
        final rows = _sortManagerInsuranceRows(
          _filterManagerInsuranceRows(
            _searchManagerVehicles(allRows, _query),
            _filter,
          ),
          _chip,
        );
        final expiredCount =
            allRows.where(_managerVehicleHasExpiredDocument).length;
        final soonCount = allRows.where(_managerVehicleHasSoonDocument).length;
        final missingCount =
            allRows.where(_managerVehicleHasMissingDocument).length;
        final oilCount = allRows.where(_managerVehicleNeedsOil).length;
        final mileageCount = allRows.where((item) => item.mileage <= 0).length;

        return ListView(
          padding: const EdgeInsets.all(8),
          children: [
            const _ManagerHero(
              title: 'Страховка и техосмотр',
              subtitle: 'ОСАГО, КАСКО и техосмотр по всему парку',
              icon: Icons.verified_user_rounded,
            ),
            const SizedBox(height: 6),
            GridView.count(
              crossAxisCount: 2,
              crossAxisSpacing: 6,
              mainAxisSpacing: 6,
              childAspectRatio: 1.8 / (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1.0, 3.0),
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                ManagerMetric(
                  title: 'Просрочено',
                  value: '$expiredCount',
                  icon: Icons.error_outline_rounded,
                  colorA: _managerOrange,
                  colorB: const Color(0xFFEF4444),
                  onTap: () => setState(
                    () => _filter = ManagerInsuranceToFilter.expired,
                  ),
                ),
                ManagerMetric(
                  title: 'Истекает <14',
                  value: '$soonCount',
                  icon: Icons.schedule_rounded,
                  colorA: _managerOrange,
                  colorB: const Color(0xFFF59E0B),
                  onTap: () => setState(
                    () => _filter = ManagerInsuranceToFilter.soon,
                  ),
                ),
                ManagerMetric(
                  title: 'Нет документа',
                  value: '$missingCount',
                  icon: Icons.description_outlined,
                  colorA: _managerPurple,
                  colorB: const Color(0xFFEC4899),
                  onTap: () => setState(
                    () => _filter = ManagerInsuranceToFilter.missing,
                  ),
                ),
                ManagerMetric(
                  title: 'Пора масло',
                  value: '$oilCount',
                  icon: Icons.oil_barrel_outlined,
                  colorA: _managerGreen,
                  colorB: const Color(0xFF16A34A),
                  onTap: () => setState(
                    () => _filter = ManagerInsuranceToFilter.oil,
                  ),
                ),
                ManagerMetric(
                  title: 'Нет пробега',
                  value: '$mileageCount',
                  icon: Icons.speed_rounded,
                  colorA: _managerBlue,
                  colorB: _managerCyan,
                  onTap: () => setState(
                    () => _filter = ManagerInsuranceToFilter.mileage,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _searchController,
              decoration: _managerInputDecoration(
                'Поиск по номеру авто',
                Icons.search_rounded,
              ).copyWith(helperText: 'Номер, VIN, марка, модель'),
              onChanged: (value) => setState(() => _query = value),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 5,
              runSpacing: 5,
              children: [
                _ManagerFilterChip(
                  label: 'ОСАГО',
                  selected: _chip == ManagerInsuranceToChip.osago,
                  onTap: () =>
                      setState(() => _chip = ManagerInsuranceToChip.osago),
                ),
                _ManagerFilterChip(
                  label: 'КАСКО',
                  selected: _chip == ManagerInsuranceToChip.casco,
                  onTap: () =>
                      setState(() => _chip = ManagerInsuranceToChip.casco),
                ),
                _ManagerFilterChip(
                  label: 'Техосмотр',
                  selected: _chip == ManagerInsuranceToChip.inspection,
                  onTap: () => setState(
                    () => _chip = ManagerInsuranceToChip.inspection,
                  ),
                ),
                _ManagerFilterChip(
                  label: 'Замена ДВС',
                  selected: _chip == ManagerInsuranceToChip.engine,
                  onTap: () =>
                      setState(() => _chip = ManagerInsuranceToChip.engine),
                ),
                _ManagerFilterChip(
                  label: 'Замена КПП',
                  selected: _chip == ManagerInsuranceToChip.gearbox,
                  onTap: () =>
                      setState(() => _chip = ManagerInsuranceToChip.gearbox),
                ),
                _ManagerFilterChip(
                  label: 'Все',
                  selected: _filter == ManagerInsuranceToFilter.all,
                  onTap: () =>
                      setState(() => _filter = ManagerInsuranceToFilter.all),
                ),
              ],
            ),
            const SizedBox(height: 6),
            if (snapshot.hasError)
              ManagerInfoCard(
                title: 'Не удалось загрузить страховку и ТО',
                lines: [_managerUserError(snapshot.error!)],
                icon: Icons.error_outline,
              )
            else if (rows.isEmpty)
              const ManagerInfoCard(
                title: 'Авто по фильтру нет',
                lines: ['Измените поиск или фильтр'],
                icon: Icons.verified_user_outlined,
              )
            else
              ...rows.map(
                (vehicle) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: _ManagerInsuranceVehicleCard(vehicle: vehicle),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _ManagerInsuranceVehicleCard extends StatelessWidget {
  const _ManagerInsuranceVehicleCard({required this.vehicle});

  final ManagerVehicleDto vehicle;

  @override
  Widget build(BuildContext context) {
    final osago = _managerDocumentStatus(vehicle.osagoEndDate);
    final casco = _managerDocumentStatus(vehicle.cascoEndDate);
    final inspection =
        _managerDocumentStatus(vehicle.technicalInspectionEndDate);
    final group = _managerCurrentVehicleDriver(vehicle) == 'нет'
        ? vehicle.managerName ?? vehicle.companyName ?? 'Без группы'
        : _managerCurrentVehicleDriver(vehicle);

    return ManagerInfoCard(
      title: vehicle.plateNumber,
      icon: Icons.directions_car_filled_rounded,
      lines: [
        '${vehicle.make} ${vehicle.model}'.trim().isEmpty
            ? 'Марка и модель не указаны'
            : '${vehicle.make} ${vehicle.model}'.trim(),
        'Группа: $group',
        'ОСАГО: ${_managerDocumentStatusLabel(osago)}${vehicle.osagoEndDate == null ? '' : ' · ${_managerDateLabel(vehicle.osagoEndDate)}'}',
        'КАСКО: ${_managerDocumentStatusLabel(casco)}${vehicle.cascoEndDate == null ? '' : ' · ${_managerDateLabel(vehicle.cascoEndDate)}'}',
        'Техосмотр: ${_managerDocumentStatusLabel(inspection)}${vehicle.technicalInspectionEndDate == null ? '' : ' · ${_managerDateLabel(vehicle.technicalInspectionEndDate)}'}',
        'Пробег: ${vehicle.mileage > 0 ? '${_managerNumberLabel(vehicle.mileage)} км' : 'не отмечен'}',
        'ДВС: ${vehicle.engineOilReplacementKm > 0 ? '${_managerNumberLabel(vehicle.engineOilReplacementKm)} км' : 'нет замены'} · КПП: ${vehicle.gearboxOilReplacementKm > 0 ? '${_managerNumberLabel(vehicle.gearboxOilReplacementKm)} км' : 'нет замены'}',
      ],
    );
  }
}

class ManagerVehiclesPage extends StatefulWidget {
  const ManagerVehiclesPage({
    super.key,
    required this.repository,
    required this.initialFilter,
    required this.onFilterChanged,
  });

  final ManagerRepository repository;
  final ManagerVehicleFilter initialFilter;
  final ValueChanged<ManagerVehicleFilter> onFilterChanged;

  @override
  State<ManagerVehiclesPage> createState() => _ManagerVehiclesPageState();
}

class _ManagerVehiclesPageState extends State<ManagerVehiclesPage> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ManagerVehicleDto>>(
      future: widget.repository.loadVehicles(),
      builder: (context, snapshot) {
        final vehicles = _searchManagerVehicles(
          _filterManagerVehicles(
            snapshot.data ?? const [],
            widget.initialFilter,
          ),
          _query,
        );

        return ListView(
          padding: const EdgeInsets.all(8),
          children: [
            const _ManagerHero(
              title: 'Автомобили',
              subtitle: 'Все машины компании',
              icon: Icons.directions_car_rounded,
            ),
            const SizedBox(height: 6),
            TextField(
              controller: _searchController,
              decoration: _managerInputDecoration(
                'Поиск авто',
                Icons.search_rounded,
              ).copyWith(helperText: 'Номер, VIN, марка, модель'),
              onChanged: (value) => setState(() => _query = value),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 5,
              runSpacing: 5,
              children: ManagerVehicleFilter.values
                  .map(
                    (filter) => _ManagerFilterChip(
                      label: _managerVehicleFilterLabel(filter),
                      selected: widget.initialFilter == filter,
                      onTap: () => widget.onFilterChanged(filter),
                    ),
                  )
                  .toList(),
            ),
            const SizedBox(height: 6),
            if (snapshot.hasError)
              ManagerInfoCard(
                title: 'Не удалось загрузить автомобили',
                lines: [_managerUserError(snapshot.error!)],
                icon: Icons.error_outline,
              )
            else if (vehicles.isEmpty)
              const ManagerInfoCard(
                title: 'Автомобили не найдены',
                lines: ['Измените поиск или фильтр'],
                icon: Icons.directions_car_outlined,
              )
            else
              ...vehicles.map(
                (vehicle) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: _ManagerVehicleCard(
                    vehicle: vehicle,
                    onTap: () => _openManagerVehicleCard(context, vehicle.id),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Future<void> _openManagerVehicleCard(
    BuildContext context,
    String vehicleId,
  ) async {
    final detail = await widget.repository.loadVehicleDetail(vehicleId);
    final incidents = await widget.repository.loadIncidents();
    if (!context.mounted || detail == null) {
      return;
    }
    final openIncidents = incidents
        .where(
          (item) =>
              item.carId == vehicleId &&
              !['resolved', 'closed', 'archived'].contains(item.status),
        )
        .toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.66,
        maxChildSize: 0.94,
        minChildSize: 0.42,
        builder: (context, controller) => Container(
          decoration: const BoxDecoration(
            color: _managerSurface,
            borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
          ),
          child: ListView(
            controller: controller,
            padding: const EdgeInsets.all(8),
            children: [
              _SectionTitle(detail.plateNumber),
              const SizedBox(height: 6),
              ManagerInfoCard(
                title: '${detail.make} ${detail.model}'.trim(),
                lines: [
                  'VIN: ${detail.vin}',
                  'Компания: ${detail.companyName ?? 'не указана'}',
                  'Статус: ${_managerStatusLabel(detail.status)}',
                  'С даты: ${_managerDateLabel(detail.statusSinceDate)}',
                  'Бригадир: ${detail.managerName?.trim().isNotEmpty == true ? detail.managerName : 'не назначен'}',
                  'Текущий водитель: ${_managerCurrentVehicleDriver(detail)}',
                ],
                icon: Icons.directions_car_filled_rounded,
              ),
              const SizedBox(height: 6),
              ManagerInfoCard(
                title: 'Открытые инциденты',
                lines: openIncidents.isEmpty
                    ? const ['Открытых инцидентов нет']
                    : openIncidents
                        .map(
                          (item) =>
                              '${item.title}: ${_managerStatusLabel(item.status)} · ${_managerDateLabel(item.occurredAt)}',
                        )
                        .toList(),
                icon: Icons.report_gmailerrorred_outlined,
              ),
              const SizedBox(height: 6),
              ManagerInfoCard(
                title: 'История назначений',
                lines: detail.assignmentHistory.isEmpty
                    ? const ['Назначений пока нет']
                    : detail.assignmentHistory
                        .map(
                          (item) =>
                              '${item.driverName}: ${_managerDateLabel(item.startedAt)} - ${item.endedAt == null ? 'сейчас' : _managerDateLabel(item.endedAt)}',
                        )
                        .toList(),
                icon: Icons.history_rounded,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ManagerVehicleCard extends StatelessWidget {
  const _ManagerVehicleCard({
    required this.vehicle,
    required this.onTap,
  });

  final ManagerVehicleDto vehicle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final model = '${vehicle.make} ${vehicle.model}'.trim();
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Ink(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.95),
            borderRadius: BorderRadius.circular(10),
            boxShadow: [
              BoxShadow(
                color: _managerText.withValues(alpha: 0.04),
                blurRadius: 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: _managerBlue.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                alignment: Alignment.center,
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Image.asset('assets/gopark-logo.png'),
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      vehicle.plateNumber,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      model.isEmpty ? vehicle.vin : '$model · ${vehicle.vin}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: _managerMuted,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        'Бригадир: ${vehicle.managerName?.trim().isNotEmpty == true ? vehicle.managerName : 'не назначен'}',
                        'с ${_managerDateLabel(vehicle.statusSinceDate)}',
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          const TextStyle(color: _managerMuted, fontSize: 10),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _ManagerBadge(
                    label: _managerStatusLabel(vehicle.status),
                    color: _managerVehicleStatusColor(vehicle.status),
                  ),
                  const SizedBox(height: 3),
                  Icon(
                    Icons.arrow_forward_rounded,
                    color: _managerMuted.withValues(alpha: 0.7),
                    size: 14,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

List<ManagerVehicleDto> _filterManagerVehicles(
  List<ManagerVehicleDto> items,
  ManagerVehicleFilter filter,
) {
  switch (filter) {
    case ManagerVehicleFilter.office:
      return items
          .where((item) => item.status == 'office' || item.status == 'free')
          .toList();
    case ManagerVehicleFilter.assigned:
      return items
          .where((item) => _managerVehicleIsOnLine(item.status))
          .toList();
    case ManagerVehicleFilter.accident:
      return items.where((item) => item.status == 'accident').toList();
    case ManagerVehicleFilter.repair:
      return items
          .where(
              (item) => item.status == 'maintenance' || item.status == 'repair')
          .toList();
    case ManagerVehicleFilter.idle:
      return items
          .where((item) => ['idle', 'office', 'free'].contains(item.status))
          .toList();
    case ManagerVehicleFilter.impound:
      return items.where((item) => item.status == 'impound').toList();
    case ManagerVehicleFilter.writtenOff:
      return items.where((item) => item.status == 'written_off').toList();
    case ManagerVehicleFilter.all:
      return items;
  }
}

List<ManagerVehicleDto> _filterManagerInsuranceRows(
  List<ManagerVehicleDto> items,
  ManagerInsuranceToFilter filter,
) {
  switch (filter) {
    case ManagerInsuranceToFilter.expired:
      return items.where(_managerVehicleHasExpiredDocument).toList();
    case ManagerInsuranceToFilter.soon:
      return items.where(_managerVehicleHasSoonDocument).toList();
    case ManagerInsuranceToFilter.missing:
      return items.where(_managerVehicleHasMissingDocument).toList();
    case ManagerInsuranceToFilter.oil:
      return items.where(_managerVehicleNeedsOil).toList();
    case ManagerInsuranceToFilter.mileage:
      return items.where((item) => item.mileage <= 0).toList();
    case ManagerInsuranceToFilter.all:
      return items;
  }
}

List<ManagerVehicleDto> _sortManagerInsuranceRows(
  List<ManagerVehicleDto> items,
  ManagerInsuranceToChip chip,
) {
  final sorted = [...items];
  sorted.sort((left, right) {
    int statusRank(ManagerDocumentStatus status) {
      switch (status) {
        case ManagerDocumentStatus.expired:
          return 0;
        case ManagerDocumentStatus.soon:
          return 1;
        case ManagerDocumentStatus.missing:
          return 2;
        case ManagerDocumentStatus.active:
          return 3;
      }
    }

    int compareStatus(
        ManagerDocumentStatus leftStatus, ManagerDocumentStatus rightStatus) {
      return statusRank(leftStatus).compareTo(statusRank(rightStatus));
    }

    switch (chip) {
      case ManagerInsuranceToChip.osago:
        return compareStatus(
          _managerDocumentStatus(left.osagoEndDate),
          _managerDocumentStatus(right.osagoEndDate),
        );
      case ManagerInsuranceToChip.casco:
        return compareStatus(
          _managerDocumentStatus(left.cascoEndDate),
          _managerDocumentStatus(right.cascoEndDate),
        );
      case ManagerInsuranceToChip.inspection:
        return compareStatus(
          _managerDocumentStatus(left.technicalInspectionEndDate),
          _managerDocumentStatus(right.technicalInspectionEndDate),
        );
      case ManagerInsuranceToChip.engine:
      case ManagerInsuranceToChip.gearbox:
        return (_managerVehicleNeedsOil(right) ? 1 : 0)
            .compareTo(_managerVehicleNeedsOil(left) ? 1 : 0);
    }
  });
  return sorted;
}

enum ManagerDocumentStatus { missing, active, soon, expired }

ManagerDocumentStatus _managerDocumentStatus(String? endDate) {
  final date = _managerDateOnly(endDate);
  if (date == null) {
    return ManagerDocumentStatus.missing;
  }

  final today = _managerDateOnly(DateTime.now().toIso8601String())!;
  if (date.isBefore(today)) {
    return ManagerDocumentStatus.expired;
  }
  if (!date.isAfter(today.add(const Duration(days: 14)))) {
    return ManagerDocumentStatus.soon;
  }
  return ManagerDocumentStatus.active;
}

String _managerDocumentStatusLabel(ManagerDocumentStatus status) {
  switch (status) {
    case ManagerDocumentStatus.active:
      return 'Активно';
    case ManagerDocumentStatus.soon:
      return 'Истекает';
    case ManagerDocumentStatus.expired:
      return 'Просрочено';
    case ManagerDocumentStatus.missing:
      return 'Нет';
  }
}

bool _managerVehicleHasExpiredDocument(ManagerVehicleDto vehicle) {
  return _managerDocumentStatus(vehicle.osagoEndDate) ==
          ManagerDocumentStatus.expired ||
      _managerDocumentStatus(vehicle.cascoEndDate) ==
          ManagerDocumentStatus.expired ||
      _managerDocumentStatus(vehicle.technicalInspectionEndDate) ==
          ManagerDocumentStatus.expired;
}

bool _managerVehicleHasSoonDocument(ManagerVehicleDto vehicle) {
  return _managerDocumentStatus(vehicle.osagoEndDate) ==
          ManagerDocumentStatus.soon ||
      _managerDocumentStatus(vehicle.cascoEndDate) ==
          ManagerDocumentStatus.soon ||
      _managerDocumentStatus(vehicle.technicalInspectionEndDate) ==
          ManagerDocumentStatus.soon;
}

bool _managerVehicleHasMissingDocument(ManagerVehicleDto vehicle) {
  return _managerDocumentStatus(vehicle.osagoEndDate) ==
          ManagerDocumentStatus.missing ||
      _managerDocumentStatus(vehicle.cascoEndDate) ==
          ManagerDocumentStatus.missing ||
      _managerDocumentStatus(vehicle.technicalInspectionEndDate) ==
          ManagerDocumentStatus.missing;
}

bool _managerVehicleNeedsOil(ManagerVehicleDto vehicle) {
  if (vehicle.mileage <= 0) {
    return false;
  }
  return vehicle.engineOilReplacementKm <= 0 ||
      vehicle.gearboxOilReplacementKm <= 0 ||
      vehicle.mileage >= vehicle.engineOilReplacementKm ||
      vehicle.mileage >= vehicle.gearboxOilReplacementKm;
}

bool _managerVehicleIsOnLine(String status) {
  return status == 'assigned' || status == 'active_installment';
}

List<ManagerVehicleDto> _searchManagerVehicles(
  List<ManagerVehicleDto> items,
  String query,
) {
  final normalized = query.trim().toLowerCase();
  if (normalized.isEmpty) {
    return items;
  }
  return items.where((item) {
    return [
      item.plateNumber,
      item.vin,
      item.make,
      item.model,
      item.companyName ?? '',
      item.managerName ?? '',
      _managerCurrentVehicleDriver(item),
      _managerStatusLabel(item.status),
    ].join(' ').toLowerCase().contains(normalized);
  }).toList();
}

String _managerVehicleFilterLabel(ManagerVehicleFilter filter) {
  switch (filter) {
    case ManagerVehicleFilter.office:
      return 'В офисе';
    case ManagerVehicleFilter.assigned:
      return 'На линии';
    case ManagerVehicleFilter.accident:
      return 'ДТП';
    case ManagerVehicleFilter.repair:
      return 'Ремонт';
    case ManagerVehicleFilter.idle:
      return 'Простой';
    case ManagerVehicleFilter.impound:
      return 'Штрафстоянка';
    case ManagerVehicleFilter.writtenOff:
      return 'Списанные';
    case ManagerVehicleFilter.all:
      return 'Все';
  }
}

String _managerCurrentVehicleDriver(ManagerVehicleDto vehicle) {
  if (vehicle.assignedDriverId == null) {
    return 'нет';
  }
  for (final item in vehicle.assignmentHistory) {
    if (item.endedAt == null) {
      return item.driverName;
    }
  }
  return 'назначен';
}

Color _managerVehicleStatusColor(String status) {
  switch (status) {
    case 'assigned':
    case 'active_installment':
      return _managerGreen;
    case 'accident':
    case 'impound':
    case 'written_off':
      return _managerOrange;
    case 'maintenance':
    case 'repair':
    case 'idle':
      return _managerPurple;
    case 'office':
    case 'free':
    default:
      return _managerBlue;
  }
}

class ManagerDriversPage extends StatefulWidget {
  const ManagerDriversPage({
    super.key,
    required this.repository,
    required this.initialFilter,
    required this.selectedManagerId,
    required this.selectedManagerName,
    required this.onFilterChanged,
  });

  final ManagerRepository repository;
  final ManagerDriverListFilter initialFilter;
  final String? selectedManagerId;
  final String? selectedManagerName;
  final ValueChanged<ManagerDriverListFilter> onFilterChanged;

  @override
  State<ManagerDriversPage> createState() => _ManagerDriversPageState();
}

class _ManagerDriversPageState extends State<ManagerDriversPage> {
  final _searchController = TextEditingController();
  String _searchQuery = '';
  String? _pendingDriverAction;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _createDriverIncidentAction(
    ManagerAssignedDriverDto driver,
    String action,
    String successText,
  ) async {
    final details = action == 'inspection' || action == 'impound'
        ? await _showManagerIncidentDetailsDialog(
            context,
            title: action == 'impound'
                ? 'Поставить на штрафстоянку'
                : 'Осмотр водителя',
            noteLabel: action == 'impound'
                ? 'Причина / комментарий по штрафстоянке'
                : 'Комментарий к осмотру',
          )
        : null;
    if ((action == 'inspection' || action == 'impound') && details == null) {
      return;
    }

    final actionKey = '${driver.id}:$action';
    setState(() => _pendingDriverAction = actionKey);
    try {
      await widget.repository.createDriverIncidentAction(
        driver.id,
        action,
        note: details?.note,
      );
      if (!mounted) {
        return;
      }
      setState(() => _pendingDriverAction = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(successText)),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() => _pendingDriverAction = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                'Не удалось выполнить действие: ${_managerUserError(error)}')),
      );
    }
  }

  Future<void> _updateDriverRiskStatus(
    ManagerAssignedDriverDto driver,
    String riskStatus,
  ) async {
    if (driver.riskStatus == riskStatus) {
      return;
    }

    final details = await _showManagerRequiredNoteDialog(
      context,
      title: 'Причина смены риск-статуса',
      noteLabel:
          'Почему ${driver.fullName} переводится в "${_managerRiskStatusLabel(riskStatus)}"',
      confirmLabel: 'Отправить',
    );
    if (details == null) {
      return;
    }

    final actionKey = '${driver.id}:risk:$riskStatus';
    setState(() => _pendingDriverAction = actionKey);
    try {
      final appliedDriver = await widget.repository.updateDriverRiskStatus(
        driver.id,
        riskStatus,
        details.note,
      );
      if (!mounted) {
        return;
      }
      setState(() => _pendingDriverAction = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            appliedDriver.riskStatus == riskStatus
                ? 'Риск-статус: ${_managerRiskStatusLabel(riskStatus)}'
                : 'Заявка отправлена старшему бригадиру',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() => _pendingDriverAction = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                'Не удалось сменить риск-статус: ${_managerUserError(error)}')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ManagerAssignedDriverDto>>(
      future: widget.repository.loadDrivers(),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
        if (snapshot.hasError) return _ManagerLoadError(error: snapshot.error, onRetry: () => setState(() {}));
        final items = snapshot.data ?? const [];
        final scopedItems = widget.selectedManagerId == null
            ? items
            : items
                .where((item) => item.managerId == widget.selectedManagerId)
                .toList();
        final overdue =
            scopedItems.where((item) => item.overdueDebt > 0).length;
        final paymentDue =
            scopedItems.where(_managerIsPaymentDueTodayOrEarlier).length;
        final filteredItems = _sortManagerDriversForFilter(
          _filterManagerDrivers(scopedItems, widget.initialFilter),
          widget.initialFilter,
        );
        final visibleItems = _searchManagerDrivers(filteredItems, _searchQuery);

        return ListView(
          padding: const EdgeInsets.all(8),
          children: [
            _ManagerHero(
              title: widget.selectedManagerName == null
                  ? 'Мои водители'
                  : 'Бригадир ${widget.selectedManagerName}',
              subtitle: widget.selectedManagerName == null
                  ? 'Закреплённые водители, долг, переплата и ежедневные оплаты'
                  : 'Водители, авто, просрочки и проблемы выбранного бригадира',
              icon: Icons.groups_rounded,
            ),
            const SizedBox(height: 6),
            GridView.count(
              crossAxisCount: 2,
              crossAxisSpacing: 6,
              mainAxisSpacing: 6,
              childAspectRatio: 1.8 / (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1.0, 3.0),
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                ManagerMetric(
                  title: 'В выдаче',
                  value: '${scopedItems.length}',
                  icon: Icons.groups_rounded,
                  colorA: _managerBlue,
                  colorB: _managerCyan,
                  onTap: () =>
                      widget.onFilterChanged(ManagerDriverListFilter.all),
                ),
                ManagerMetric(
                  title: 'К оплате',
                  value: '$paymentDue',
                  icon: Icons.account_balance_wallet_outlined,
                  colorA: _managerOrange,
                  colorB: const Color(0xFFEF4444),
                  onTap: () => widget.onFilterChanged(
                    ManagerDriverListFilter.paymentDue,
                  ),
                ),
                ManagerMetric(
                  title: 'Просрочка',
                  value: '$overdue',
                  icon: Icons.warning_amber_rounded,
                  colorA: _managerPurple,
                  colorB: const Color(0xFFEC4899),
                  onTap: () => widget.onFilterChanged(
                    ManagerDriverListFilter.overdue,
                  ),
                ),
              ],
            ),
            if (widget.selectedManagerId != null) ...[
              const SizedBox(height: 6),
              FutureBuilder<List<ManagerIdleVehicleDto>>(
                future: widget.repository.loadIdleVehicles(),
                builder: (context, idleSnapshot) {
                  final idleVehicles = (idleSnapshot.data ??
                          const <ManagerIdleVehicleDto>[])
                      .where(
                          (item) => item.managerId == widget.selectedManagerId)
                      .toList();
                  return GestureDetector(
                    onTap: () => _showIdleVehiclesSheet(context, idleVehicles),
                    child: ManagerInfoCard(
                      title: 'Машины в простое',
                      lines: [
                        '${idleVehicles.length} авто у бригадира',
                        'В офисе: ${_countIdleVehicles(idleVehicles, 'office')}',
                        'ДТП: ${_countIdleVehicles(idleVehicles, 'accident')} · СТО: ${_countIdleVehicles(idleVehicles, 'service')}',
                        'Страховка/GPS: ${_countIdleVehicles(idleVehicles, 'insurance_gps')} · Штрафстоянка: ${_countIdleVehicles(idleVehicles, 'impound')}',
                      ],
                      icon: Icons.local_parking_rounded,
                    ),
                  );
                },
              ),
            ],
            const SizedBox(height: 6),
            TextField(
              controller: _searchController,
              keyboardType: TextInputType.text,
              textInputAction: TextInputAction.search,
              decoration: _managerInputDecoration(
                'Быстрый поиск водителя',
                Icons.search_rounded,
              ).copyWith(
                helperText: 'Имя, телефон или авто',
                suffixIcon: _searchQuery.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = '');
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
              ),
              onChanged: (value) => setState(() => _searchQuery = value),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 5,
              runSpacing: 5,
              children: [
                _ManagerFilterChip(
                  label: 'Активные',
                  selected: widget.initialFilter == ManagerDriverListFilter.all,
                  onTap: () =>
                      widget.onFilterChanged(ManagerDriverListFilter.all),
                ),
                _ManagerFilterChip(
                  label: 'К оплате',
                  selected: widget.initialFilter ==
                      ManagerDriverListFilter.paymentDue,
                  onTap: () => widget.onFilterChanged(
                    ManagerDriverListFilter.paymentDue,
                  ),
                ),
                _ManagerFilterChip(
                  label: 'Просрочка',
                  selected:
                      widget.initialFilter == ManagerDriverListFilter.overdue,
                  onTap: () => widget.onFilterChanged(
                    ManagerDriverListFilter.overdue,
                  ),
                ),
                _ManagerFilterChip(
                  label: 'Расторгнутые',
                  selected: widget.initialFilter ==
                      ManagerDriverListFilter.terminated,
                  onTap: () => widget.onFilterChanged(
                    ManagerDriverListFilter.terminated,
                  ),
                ),
                ...ManagerVehicleFilter.values
                    .where((filter) =>
                        filter != ManagerVehicleFilter.all &&
                        filter != ManagerVehicleFilter.office)
                    .map(
                      (filter) => _ManagerFilterChip(
                        label: _managerVehicleFilterLabel(filter),
                        selected: widget.initialFilter ==
                            _managerDriverFilterForVehicle(filter),
                        onTap: () => widget.onFilterChanged(
                          _managerDriverFilterForVehicle(filter),
                        ),
                      ),
                    ),
              ],
            ),
            const SizedBox(height: 6),
            _SectionTitle(
              '${_managerDriverFilterTitle(widget.initialFilter)} · найдено ${visibleItems.length}',
            ),
            const SizedBox(height: 6),
            if (visibleItems.isEmpty)
              ManagerInfoCard(
                title: _searchQuery.trim().isEmpty
                    ? 'Нет водителей по фильтру'
                    : 'Водитель не найден',
                lines: [
                  _searchQuery.trim().isEmpty
                      ? 'Выберите другой блок или фильтр выше'
                      : 'Проверьте имя, телефон или авто в поиске',
                ],
                icon: Icons.groups_outlined,
              ),
            ...visibleItems.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: GestureDetector(
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ManagerDriverDetailPage(
                          repository: widget.repository,
                          driverId: item.id,
                        ),
                      ),
                    );
                  },
                  child: ManagerDriverCard(
                    driver: item,
                    pendingAction: _pendingDriverAction,
                    onInspection: () => _createDriverIncidentAction(
                      item,
                      'inspection',
                      'Осмотр создан',
                    ),
                    onRepair: () => _createDriverIncidentAction(
                      item,
                      'repair',
                      'Водитель отправлен на СТО/ремонт',
                    ),
                    onAccident: () => _createDriverIncidentAction(
                      item,
                      'accident',
                      'ДТП зафиксировано',
                    ),
                    onImpound: () => _createDriverIncidentAction(
                      item,
                      'impound',
                      'Авто поставлено на штрафстоянку',
                    ),
                    onRiskStatusChanged: (riskStatus) =>
                        _updateDriverRiskStatus(item, riskStatus),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

List<ManagerAssignedDriverDto> _filterManagerDrivers(
  List<ManagerAssignedDriverDto> items,
  ManagerDriverListFilter filter,
) {
  final activeItems =
      items.where((item) => !_managerIsTerminatedDriver(item)).toList();
  switch (filter) {
    case ManagerDriverListFilter.paymentDue:
      return activeItems.where(_managerIsPaymentDueTodayOrEarlier).toList();
    case ManagerDriverListFilter.overdue:
      return activeItems.where((item) => item.overdueDebt > 0).toList();
    case ManagerDriverListFilter.withCar:
      return activeItems.where(_managerHasVehicle).toList();
    case ManagerDriverListFilter.withoutCar:
      return activeItems.where((item) => !_managerHasVehicle(item)).toList();
    case ManagerDriverListFilter.terminated:
      return items.where(_managerIsTerminatedDriver).toList();
    case ManagerDriverListFilter.vehicleOffice:
      return activeItems
          .where((item) =>
              _managerHasVehicle(item) &&
              ['office', 'free'].contains(item.vehicleStatus))
          .toList();
    case ManagerDriverListFilter.vehicleAssigned:
      return activeItems
          .where((item) =>
              _managerHasVehicle(item) &&
              _managerVehicleIsOnLine(item.vehicleStatus ?? ''))
          .toList();
    case ManagerDriverListFilter.vehicleAccident:
      return activeItems
          .where((item) =>
              _managerHasVehicle(item) && item.vehicleStatus == 'accident')
          .toList();
    case ManagerDriverListFilter.vehicleRepair:
      return activeItems
          .where((item) =>
              _managerHasVehicle(item) &&
              (item.vehicleStatus == 'maintenance' ||
                  item.vehicleStatus == 'repair'))
          .toList();
    case ManagerDriverListFilter.vehicleIdle:
      return activeItems
          .where((item) =>
              _managerHasVehicle(item) &&
              ['idle', 'office', 'free'].contains(item.vehicleStatus))
          .toList();
    case ManagerDriverListFilter.vehicleImpound:
      return activeItems
          .where((item) =>
              _managerHasVehicle(item) && item.vehicleStatus == 'impound')
          .toList();
    case ManagerDriverListFilter.vehicleWrittenOff:
      return activeItems
          .where((item) =>
              _managerHasVehicle(item) && item.vehicleStatus == 'written_off')
          .toList();
    case ManagerDriverListFilter.all:
      return activeItems;
  }
}

bool _managerIsTerminatedDriver(ManagerAssignedDriverDto item) {
  return item.status == 'terminated';
}

List<ManagerAssignedDriverDto> _sortManagerDriversForFilter(
  List<ManagerAssignedDriverDto> items,
  ManagerDriverListFilter filter,
) {
  if (filter != ManagerDriverListFilter.paymentDue &&
      filter != ManagerDriverListFilter.overdue) {
    return items;
  }

  final sorted = [...items];
  sorted.sort((a, b) {
    final overdueCompare =
        (b.overdueDebt > 0 ? 1 : 0).compareTo(a.overdueDebt > 0 ? 1 : 0);
    if (overdueCompare != 0) {
      return overdueCompare;
    }

    return _managerDueSortDate(a).compareTo(_managerDueSortDate(b));
  });
  return sorted;
}

bool _managerIsPaymentDueTodayOrEarlier(ManagerAssignedDriverDto item) {
  if (item.overdueDebt > 0) {
    return true;
  }

  if (item.nextPaymentAmount <= 0) {
    return false;
  }

  final dueDate = _managerDateOnly(item.nextPaymentDate);
  if (dueDate == null) {
    return false;
  }

  return !dueDate.isAfter(_managerDateOnly(DateTime.now().toIso8601String())!);
}

DateTime _managerDueSortDate(ManagerAssignedDriverDto item) {
  return _managerDateOnly(item.overdueSinceDate) ??
      _managerDateOnly(item.nextPaymentDate) ??
      DateTime(9999);
}

DateTime? _managerDateOnly(String? value) {
  if (value == null || value.trim().isEmpty) {
    return null;
  }

  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return null;
  }

  return DateTime(parsed.year, parsed.month, parsed.day);
}

List<ManagerAssignedDriverDto> _searchManagerDrivers(
  List<ManagerAssignedDriverDto> items,
  String query,
) {
  final normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.isEmpty) {
    return items;
  }

  return items.where((item) {
    final vehicle = _managerHasVehicle(item) ? item.vehicle : 'без авто';
    final haystack = [
      item.fullName,
      item.phone,
      vehicle,
      item.managerName ?? '',
      _managerStatusLabel(item.status),
      _managerStatusLabel(item.vehicleStatus ?? ''),
    ].join(' ').toLowerCase();
    return haystack.contains(normalizedQuery);
  }).toList();
}

bool _managerHasVehicle(ManagerAssignedDriverDto item) {
  final vehicle = item.vehicle.trim().toLowerCase();
  return vehicle.isNotEmpty && vehicle != 'unassigned';
}

String _managerPaymentDueBadgeLabel(ManagerAssignedDriverDto driver) {
  if (driver.overdueDebt > 0) {
    return 'просрочено с ${_managerDateLabel(driver.overdueSinceDate ?? driver.nextPaymentDate)}';
  }

  final dueDate = _managerDateOnly(driver.nextPaymentDate);
  final today = _managerDateOnly(DateTime.now().toIso8601String())!;
  if (driver.nextPaymentAmount > 0 && dueDate != null) {
    if (dueDate.isAtSameMomentAs(today)) {
      return 'оплата сегодня ${_managerDateLabel(driver.nextPaymentDate)}';
    }
    if (dueDate.isBefore(today)) {
      return 'оплата просрочена ${_managerDateLabel(driver.nextPaymentDate)}';
    }
  }

  return 'след. оплата ${_managerDateLabel(driver.nextPaymentDate)}';
}

String _managerDriverFilterTitle(ManagerDriverListFilter filter) {
  switch (filter) {
    case ManagerDriverListFilter.paymentDue:
      return 'К оплате сегодня и просроченные';
    case ManagerDriverListFilter.overdue:
      return 'Водители с просрочкой';
    case ManagerDriverListFilter.withCar:
      return 'Водители с авто';
    case ManagerDriverListFilter.withoutCar:
      return 'Водители без авто';
    case ManagerDriverListFilter.terminated:
      return 'Расторгнутые договоры';
    case ManagerDriverListFilter.vehicleOffice:
      return 'Водители с авто в офисе';
    case ManagerDriverListFilter.vehicleAssigned:
      return 'Водители с авто на линии';
    case ManagerDriverListFilter.vehicleAccident:
      return 'Водители с авто в ДТП';
    case ManagerDriverListFilter.vehicleRepair:
      return 'Водители с авто в ремонте';
    case ManagerDriverListFilter.vehicleIdle:
      return 'Водители с авто в простое';
    case ManagerDriverListFilter.vehicleImpound:
      return 'Водители с авто на штрафстоянке';
    case ManagerDriverListFilter.vehicleWrittenOff:
      return 'Водители со списанными авто';
    case ManagerDriverListFilter.all:
      return 'Активные водители';
  }
}

ManagerDriverListFilter _managerDriverFilterForVehicle(
  ManagerVehicleFilter filter,
) {
  switch (filter) {
    case ManagerVehicleFilter.office:
      return ManagerDriverListFilter.vehicleOffice;
    case ManagerVehicleFilter.assigned:
      return ManagerDriverListFilter.vehicleAssigned;
    case ManagerVehicleFilter.accident:
      return ManagerDriverListFilter.vehicleAccident;
    case ManagerVehicleFilter.repair:
      return ManagerDriverListFilter.vehicleRepair;
    case ManagerVehicleFilter.idle:
      return ManagerDriverListFilter.vehicleIdle;
    case ManagerVehicleFilter.impound:
      return ManagerDriverListFilter.vehicleImpound;
    case ManagerVehicleFilter.writtenOff:
      return ManagerDriverListFilter.vehicleWrittenOff;
    case ManagerVehicleFilter.all:
      return ManagerDriverListFilter.all;
  }
}

bool _showManagerAlertsSection(
  ManagerAlertsSection current,
  ManagerAlertsSection section,
) {
  return current == ManagerAlertsSection.all || current == section;
}

class _ManagerFilterChip extends StatelessWidget {
  const _ManagerFilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      label: Text(label),
      onPressed: onTap,
      visualDensity: VisualDensity.compact,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
      backgroundColor: selected ? _managerBlue : Colors.white,
      side: BorderSide(
        color: selected ? _managerBlue : _managerText.withValues(alpha: 0.1),
      ),
      labelStyle: TextStyle(
        color: selected ? Colors.white : _managerText,
        fontWeight: FontWeight.w800,
        fontSize: 10.5,
      ),
    );
  }
}

class ManagerAlertsPage extends StatefulWidget {
  const ManagerAlertsPage({
    super.key,
    required this.repository,
    required this.initialSection,
    required this.isSeniorManager,
  });

  final ManagerRepository repository;
  final ManagerAlertsSection initialSection;
  final bool isSeniorManager;

  @override
  State<ManagerAlertsPage> createState() => _ManagerAlertsPageState();
}

class _ManagerAlertsPageState extends State<ManagerAlertsPage> {
  late Future<List<ManagerAlertDto>> _alertsFuture;
  late Future<List<ManagerStatusRequestItemDto>> _requestsFuture;
  late Future<List<ManagerRiskStatusReviewDto>> _riskRequestsFuture;
  late Future<List<ManagerIncidentDto>> _incidentsFuture;
  late ManagerAlertsSection _selectedSection;
  String? _reviewingRequestId;
  String? _reviewingRiskRequestId;
  bool _showIncidentArchive = false;

  @override
  void initState() {
    super.initState();
    _selectedSection = widget.initialSection;
    _reload();
  }

  @override
  void didUpdateWidget(covariant ManagerAlertsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialSection != widget.initialSection) {
      _selectedSection = widget.initialSection;
    }
  }

  void _reload() {
    _alertsFuture = widget.repository.loadAlerts();
    _requestsFuture = widget.repository.loadStatusRequests();
    _riskRequestsFuture = widget.repository.loadRiskStatusRequests();
    _incidentsFuture = widget.repository.loadIncidents();
  }

  Future<void> _reviewStatusRequest(
    ManagerStatusRequestItemDto request,
    String action,
  ) async {
    if (request.status != 'pending') {
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Запрос уже рассмотрен')),
      );
      return;
    }

    setState(() => _reviewingRequestId = request.id);
    try {
      await widget.repository.reviewStatusRequest(request.id, action);
      if (!mounted) {
        return;
      }
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text(action == 'approve' ? 'Запрос одобрен' : 'Запрос отклонён'),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      final message = error.toString();
      if (message.contains('Only pending status requests can be reviewed')) {
        setState(_reload);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Запрос уже рассмотрен')),
        );
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                'Не удалось рассмотреть запрос: ${_managerUserError(error)}')),
      );
    } finally {
      if (mounted) {
        setState(() => _reviewingRequestId = null);
      }
    }
  }

  Future<void> _reviewRiskStatusRequest(
    ManagerRiskStatusReviewDto request,
    String action,
  ) async {
    if (request.reviewStatus != 'pending') {
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заявка уже рассмотрена')),
      );
      return;
    }

    setState(() => _reviewingRiskRequestId = request.id);
    try {
      await widget.repository.reviewRiskStatusRequest(request.id, action);
      if (!mounted) {
        return;
      }
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(action == 'approve'
              ? 'Риск-статус подтверждён'
              : 'Риск-статус отклонён'),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      final message = error.toString();
      if (message.contains('Only pending') ||
          message.contains('already reviewed') ||
          message.contains('уже рассмотр')) {
        setState(_reload);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Заявка уже рассмотрена')),
        );
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось рассмотреть риск-статус: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _reviewingRiskRequestId = null);
      }
    }
  }

  void _showRiskStatusReviewDetails(ManagerRiskStatusReviewDto item) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return DraggableScrollableSheet(
          initialChildSize: 0.5,
          maxChildSize: 0.9,
          minChildSize: 0.38,
          builder: (context, controller) {
            return Container(
              decoration: const BoxDecoration(
                color: _managerSurface,
                borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
              ),
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.all(8),
                children: [
                  const _SectionTitle('Заявка на риск-статус'),
                  const SizedBox(height: 6),
                  ManagerInfoCard(
                    title: item.driverName,
                    lines: [
                      'Бригадир: ${item.requestedByManagerName}',
                      'Было: ${_managerRiskStatusLabel(item.previousStatus)}',
                      'Запрошено: ${_managerRiskStatusLabel(item.requestedStatus)}',
                      item.note?.trim().isNotEmpty == true
                          ? 'Причина: ${item.note!.trim()}'
                          : 'Причина не указана',
                      'Статус: ${_managerRiskReviewStatusLabel(item.reviewStatus)}',
                      'Создано: ${_managerDateTimeLabel(item.createdAt)}',
                      if (item.reviewedAt?.isNotEmpty == true)
                        'Рассмотрено: ${_managerDateTimeLabel(item.reviewedAt)}',
                    ],
                    icon: Icons.manage_accounts_outlined,
                  ),
                  const SizedBox(height: 6),
                  if (item.reviewStatus == 'pending')
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _reviewingRiskRequestId == null
                                ? () {
                                    Navigator.of(context).pop();
                                    _reviewRiskStatusRequest(item, 'reject');
                                  }
                                : null,
                            child: const Text('Отклонить'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                            onPressed: _reviewingRiskRequestId == null
                                ? () {
                                    Navigator.of(context).pop();
                                    _reviewRiskStatusRequest(item, 'approve');
                                  }
                                : null,
                            child: const Text('Подтвердить'),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ManagerAlertDto>>(
      future: _alertsFuture,
      builder: (context, alertsSnapshot) {
        final alerts = alertsSnapshot.data ?? const [];
        return FutureBuilder<List<ManagerStatusRequestItemDto>>(
          future: _requestsFuture,
          builder: (context, requestsSnapshot) {
            final requests = requestsSnapshot.data ?? const [];
            final visibleRequests =
                requests.where((item) => item.status == 'pending').toList();
            final pendingRequests = visibleRequests.length;
            return FutureBuilder<List<ManagerRiskStatusReviewDto>>(
              future: _riskRequestsFuture,
              builder: (context, riskSnapshot) {
                final riskRequests = riskSnapshot.data ?? const [];
                final pendingRiskRequests = riskRequests
                    .where((item) => item.reviewStatus == 'pending')
                    .length;
                return FutureBuilder<List<ManagerIncidentDto>>(
                  future: _incidentsFuture,
                  builder: (context, incidentsSnapshot) {
                    final incidents = incidentsSnapshot.data ?? const [];
                    final activeIncidents = incidents
                        .where((item) => !_managerIncidentIsArchived(item.status))
                        .toList();
                    final visibleIncidents = _showIncidentArchive
                        ? incidents
                            .where((item) => _managerIncidentIsArchived(item.status))
                            .toList()
                        : activeIncidents;

                    return ListView(
                      padding: const EdgeInsets.all(8),
                      children: [
                        const _ManagerHero(
                          title: 'Уведомления и инциденты',
                          subtitle:
                              'Запросы водителей, уведомления и инциденты',
                          icon: Icons.notifications_active_rounded,
                        ),
                        const SizedBox(height: 6),
                        GridView.count(
                          crossAxisCount: 2,
                          crossAxisSpacing: 6,
                          mainAxisSpacing: 6,
                          childAspectRatio: 1.8 / (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1.0, 3.0),
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [
                            ManagerMetric(
                              title: 'Запросы',
                              value: '$pendingRequests',
                              icon: Icons.event_available_outlined,
                              colorA: _managerGreen,
                              colorB: const Color(0xFF16A34A),
                              onTap: () => setState(() => _selectedSection =
                                  ManagerAlertsSection.requests),
                            ),
                            ManagerMetric(
                              title: 'Уведомления',
                              value: '${alerts.length}',
                              icon: Icons.notifications_active_outlined,
                              colorA: _managerBlue,
                              colorB: _managerCyan,
                              onTap: () => setState(() => _selectedSection =
                                  ManagerAlertsSection.alerts),
                            ),
                            ManagerMetric(
                              title: 'Инциденты',
                              value: '${activeIncidents.length}',
                              icon: Icons.report_gmailerrorred_rounded,
                              colorA: _managerOrange,
                              colorB: const Color(0xFFEF4444),
                              onTap: () => setState(() => _selectedSection =
                                  ManagerAlertsSection.incidents),
                            ),
                            ManagerMetric(
                              title: 'Срочные',
                              value: '$pendingRiskRequests',
                              icon: Icons.priority_high_rounded,
                              colorA: _managerPurple,
                              colorB: const Color(0xFFEC4899),
                              onTap: () => setState(() =>
                                  _selectedSection = ManagerAlertsSection.risk),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        if (_showManagerAlertsSection(
                            _selectedSection, ManagerAlertsSection.risk)) ...[
                          const _SectionTitle('Подтверждение риск-статусов'),
                          const SizedBox(height: 6),
                          if (riskRequests.isEmpty)
                            const ManagerInfoCard(
                              title: 'Нет заявок на риск-статус',
                              lines: [
                                'Заявки обычных бригадиров появятся здесь у старшего'
                              ],
                              icon: Icons.verified_user_outlined,
                            ),
                          ...riskRequests.map(
                            (item) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Column(
                                children: [
                                  ManagerSignalCard(
                                    title: item.driverName,
                                    subtitle: [
                                      'Бригадир: ${item.requestedByManagerName}',
                                      'Переход: ${_managerRiskStatusLabel(item.previousStatus)} → ${_managerRiskStatusLabel(item.requestedStatus)}',
                                      item.note?.trim().isNotEmpty == true
                                          ? 'Причина: ${item.note!.trim()}'
                                          : 'Причина не указана',
                                      'Дата: ${_managerDateTimeLabel(item.createdAt)}',
                                      'Нажмите, чтобы открыть подробности',
                                    ].join(' • '),
                                    badge: _managerRiskReviewStatusLabel(
                                        item.reviewStatus),
                                    accent: item.reviewStatus == 'pending'
                                        ? _managerOrange
                                        : _managerBlue,
                                    icon: Icons.manage_accounts_outlined,
                                    onTap: () =>
                                        _showRiskStatusReviewDetails(item),
                                  ),
                                  if (item.reviewStatus == 'pending') ...[
                                    const SizedBox(height: 6),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: OutlinedButton(
                                            onPressed:
                                                _reviewingRiskRequestId == null
                                                    ? () =>
                                                        _reviewRiskStatusRequest(
                                                          item,
                                                          'reject',
                                                        )
                                                    : null,
                                            child: const Text('Отклонить'),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: FilledButton(
                                            onPressed:
                                                _reviewingRiskRequestId == null
                                                    ? () =>
                                                        _reviewRiskStatusRequest(
                                                          item,
                                                          'approve',
                                                        )
                                                    : null,
                                            child: Text(
                                              _reviewingRiskRequestId == item.id
                                                  ? 'Сохраняем...'
                                                  : 'Подтвердить',
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                        ],
                        if (_showManagerAlertsSection(_selectedSection,
                            ManagerAlertsSection.requests)) ...[
                          const _SectionTitle('Запросы водителей'),
                          const SizedBox(height: 6),
                          if (visibleRequests.isEmpty)
                            const ManagerInfoCard(
                              title: 'Нет запросов',
                              lines: [
                                'Выходные, форс-мажоры и отпросы появятся здесь'
                              ],
                              icon: Icons.event_busy_outlined,
                            ),
                          ...visibleRequests.map(
                            (item) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Column(
                                children: [
                                  ManagerSignalCard(
                                    title: item.driverName,
                                    subtitle: [
                                          if (item.managerName
                                                  ?.trim()
                                                  .isNotEmpty ==
                                              true)
                                            'Бригадир: ${item.managerName}',
                                          _managerRequestTypeLabel(item.type),
                                          _managerPeriodLabel(item.period),
                                        ].join(' • ') +
                                        _managerOptionalReasonParagraph(
                                            item.note),
                                    badge:
                                        _managerRequestStatusLabel(item.status),
                                    accent: item.status == 'pending'
                                        ? _managerOrange
                                        : _managerBlue,
                                    icon: Icons.event_available_outlined,
                                  ),
                                  if (item.status == 'pending') ...[
                                    const SizedBox(height: 6),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: OutlinedButton(
                                            onPressed: _reviewingRequestId ==
                                                    null
                                                ? () => _reviewStatusRequest(
                                                      item,
                                                      'reject',
                                                    )
                                                : null,
                                            child: const Text('Отклонить'),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: FilledButton(
                                            onPressed: _reviewingRequestId ==
                                                    null
                                                ? () => _reviewStatusRequest(
                                                      item,
                                                      'approve',
                                                    )
                                                : null,
                                            child: Text(
                                                _reviewingRequestId == item.id
                                                    ? 'Сохраняем...'
                                                    : 'Одобрить'),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                        ],
                        if (_showManagerAlertsSection(
                            _selectedSection, ManagerAlertsSection.alerts)) ...[
                          const _SectionTitle('Уведомления бригадира'),
                          const SizedBox(height: 6),
                          if (alerts.isEmpty)
                            const ManagerInfoCard(
                              title: 'Нет алертов',
                              lines: ['Уведомлений пока нет'],
                              icon: Icons.notifications_none_rounded,
                            ),
                          ...alerts.map(
                            (item) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: ManagerSignalCard(
                                title: item.title,
                                subtitle: [
                                  if (item.managerName?.trim().isNotEmpty ==
                                      true)
                                    'Бригадир: ${item.managerName}',
                                  item.details,
                                ].join(' • '),
                                badge: 'Уведомление',
                                accent: _managerBlue,
                                icon: Icons.campaign_outlined,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                        ],
                        if (_showManagerAlertsSection(_selectedSection,
                            ManagerAlertsSection.incidents)) ...[
                          const _SectionTitle('Инциденты'),
                          const SizedBox(height: 6),
                          _ManagerIncidentArchiveToggle(
                            showArchive: _showIncidentArchive,
                            onChanged: (value) => setState(
                                () => _showIncidentArchive = value),
                          ),
                          const SizedBox(height: 6),
                          if (visibleIncidents.isEmpty)
                            ManagerInfoCard(
                              title: 'Нет инцидентов',
                              lines: [
                                _showIncidentArchive
                                    ? 'Архив инцидентов пуст'
                                    : 'Активных инцидентов нет',
                              ],
                              icon: Icons.verified_outlined,
                            ),
                          ...visibleIncidents.map(
                            (item) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: ManagerSignalCard(
                                showAllDetails: true,
                                title: item.driverName?.isNotEmpty == true
                                    ? item.driverName!
                                    : item.title,
                                subtitle: [
                                  if (item.occurredAt?.isNotEmpty == true)
                                    item.incidentType == 'repair'
                                        ? _managerRepairPeriodLabel(
                                            item.occurredAt, item.periodLabel)
                                        : 'Дата: ${_managerDateTimeLabel(item.occurredAt)}',
                                  'Событие: ${_managerIncidentTypeLabel(item.incidentType)}',
                                  'Приоритет: ${_managerPriorityLabel(item.priority)}',
                                  'Статус: ${_managerStatusLabel(item.status)}',
                                  if (item.repairNote?.isNotEmpty == true)
                                    item.repairNote!,
                                  if (item.carId != null)
                                    'Есть привязанное авто',
                                  ..._managerIncidentHistoryLines(item.statusHistory),
                                ].join('\n'),
                                badge: _managerIncidentTypeLabel(
                                    item.incidentType),
                                accent: item.priority == 'high'
                                    ? _managerOrange
                                    : _managerPurple,
                                icon: Icons.report_problem_outlined,
                              ),
                            ),
                          ),
                        ],
                      ],
                    );
                  },
                );
              },
            );
          },
        );
      },
    );
  }
}

class ManagerDriverDetailPage extends StatefulWidget {
  const ManagerDriverDetailPage({
    super.key,
    required this.repository,
    required this.driverId,
  });

  final ManagerRepository repository;
  final String driverId;

  @override
  State<ManagerDriverDetailPage> createState() =>
      _ManagerDriverDetailPageState();
}

class _ManagerDriverDetailPageState extends State<ManagerDriverDetailPage> {
  late Future<ManagerDriverDetailDto?> _detailFuture;
  String? _pendingAction;
  int _selectedTab = 0;
  bool _showIncidentArchive = false;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _detailFuture = widget.repository.loadDriverDetail(widget.driverId);
  }

  Future<void> _showOverdueCalendar(ManagerDriverDetailDto data) async {
    final today = DateUtils.dateOnly(DateTime.now());
    final since = DateTime.tryParse(data.overdueSinceDate ?? '');
    final earliest = DateTime(2000);
    final initialStart = since != null && !since.isAfter(today) && !since.isBefore(earliest) ? since : today;
    final period = await showDateRangePicker(
      context: context,
      firstDate: earliest,
      lastDate: today,
      initialDateRange: DateTimeRange(start: initialStart, end: today),
      helpText: 'Просрочка',
      saveText: 'Готово',
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(datePickerTheme: Theme.of(context).datePickerTheme.copyWith(
          rangePickerHeaderHeadlineStyle: const TextStyle(fontSize: 18),
        )),
        child: child!,
      ),
    );
    if (period == null || !mounted) return;
    setState(() => _pendingAction = 'debt-period');
    try {
      final amount = await widget.repository.loadDriverOverduePeriod(widget.driverId, period.start, period.end);
      if (!mounted) return;
      await showDialog<void>(context: context, builder: (context) => AlertDialog(
        title: const Text('Просрочка за период'),
        content: Text('${_managerDateLabel(period.start.toIso8601String())} — ${_managerDateLabel(period.end.toIso8601String())}\n$amount сом\nНепогашенные платежи периода, просроченные на сегодня.'),
        actions: [TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Закрыть'))],
      ));
    } catch (error) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$error')));
    } finally {
      if (mounted) setState(() => _pendingAction = null);
    }
  }

  Future<void> _createIncidentAction(String action, String successText) async {
    final details =
        action == 'inspection' || action == 'accident' || action == 'impound'
            ? await _showManagerIncidentDetailsDialog(
                context,
                title: action == 'accident'
                    ? 'Фиксация ДТП'
                    : action == 'impound'
                        ? 'Поставить на штрафстоянку'
                        : 'Осмотр водителя',
                noteLabel: action == 'accident'
                    ? 'Комментарий по ДТП'
                    : action == 'impound'
                        ? 'Причина / комментарий по штрафстоянке'
                        : 'Комментарий к осмотру',
                requirePhoto: action == 'accident',
              )
            : null;
    if ((action == 'inspection' ||
            action == 'accident' ||
            action == 'impound') &&
        details == null) {
      return;
    }

    setState(() => _pendingAction = action);
    try {
      await widget.repository.createDriverIncidentAction(
        widget.driverId,
        action,
        note: details?.note,
        accidentPhotoUrl: details?.photoDataUrl,
      );
      if (!mounted) {
        return;
      }
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(successText)),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось выполнить действие: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _pendingAction = null);
      }
    }
  }

  Future<void> _updateIncidentAction(
    ManagerDriverIncidentDto incident,
    String action,
    String successText,
  ) async {
    if (_managerIncidentIsArchived(incident.status)) {
      return;
    }
    String? note;
    if (action == 'written_off') {
      final details = await _showManagerRequiredNoteDialog(
        context,
        title: 'Не подлежит восстановлению',
        noteLabel:
            'Что именно не работает: мотор, кузов, ходовая, причина списания',
        confirmLabel: 'Отправить заявку',
      );
      if (details == null) {
        return;
      }
      note = details.note;
    }

    setState(() => _pendingAction = '${incident.id}:$action');
    try {
      await widget.repository.updateIncidentAction(
        incident.id,
        action,
        note: note,
      );
      if (!mounted) {
        return;
      }
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(successText)),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text('Не удалось обновить кейс: ${_managerUserError(error)}'),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _pendingAction = null);
      }
    }
  }

  Future<void> _updateDriverRiskStatus(String riskStatus) async {
    final details = await _showManagerRequiredNoteDialog(
      context,
      title: 'Причина смены риск-статуса',
      noteLabel:
          'Почему водитель переводится в "${_managerRiskStatusLabel(riskStatus)}"',
      confirmLabel: 'Отправить',
    );
    if (details == null) {
      return;
    }

    setState(() => _pendingAction = 'risk:$riskStatus');
    try {
      final appliedDriver = await widget.repository.updateDriverRiskStatus(
        widget.driverId,
        riskStatus,
        details.note,
      );
      if (!mounted) {
        return;
      }
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            appliedDriver.riskStatus == riskStatus
                ? 'Риск-статус: ${_managerRiskStatusLabel(riskStatus)}'
                : 'Заявка отправлена старшему бригадиру',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось сменить риск-статус: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _pendingAction = null);
      }
    }
  }

  Future<void> _reviewDriverPhoto(String action) async {
    String? note;
    if (action == 'reject') {
      final details = await _showManagerRequiredNoteDialog(
        context,
        title: 'Причина отклонения фото',
        noteLabel: 'Что водитель должен исправить',
        confirmLabel: 'Отклонить',
      );
      if (details == null) {
        return;
      }
      note = details.note;
    }

    setState(() => _pendingAction = 'photo:$action');
    try {
      await widget.repository.reviewDriverPhoto(
        widget.driverId,
        action,
        note: note,
      );
      if (!mounted) {
        return;
      }
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text(action == 'approve' ? 'Фото одобрено' : 'Фото отклонено'),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось проверить фото: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _pendingAction = null);
      }
    }
  }

  Future<void> _terminateContract() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Расторгнуть договор?'),
        content: const Text(
          'Договор будет расторгнут, автомобиль перейдет в офис.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Отмена'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Расторгнуть'),
          ),
        ],
      ),
    );
    if (confirmed != true) {
      return;
    }

    setState(() => _pendingAction = 'terminate-contract');
    try {
      await widget.repository.terminateDriverContract(widget.driverId);
      if (!mounted) {
        return;
      }
      setState(_reload);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Договор расторгнут')),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось расторгнуть договор: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _pendingAction = null);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _managerBg,
      appBar: AppBar(title: const Text('Карточка водителя')),
      body: SafeArea(
        child: FutureBuilder<ManagerDriverDetailDto?>(
          future: _detailFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (snapshot.hasError) return _ManagerLoadError(error: snapshot.error, onRetry: () => setState(_reload));
            final data = snapshot.data;
            if (data == null) {
              return const Center(child: Text('Данные по водителю не найдены'));
            }

            return Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [_managerBg, Color(0xFFE9F2FF)],
                ),
              ),
              child: ListView(
                padding: const EdgeInsets.all(8),
                children: [
                  ManagerInfoCard(
                    title: data.fullName,
                    lines: [
                      'Телефон: ${data.phone}',
                      'Статус: ${_managerStatusLabel(data.status)}',
                      'Риск: ${_managerRiskStatusLabel(data.riskStatus)}',
                      'Фиксированный выходной: ${_managerWeekdayLabel(data.weeklyDayOff)}',
                      'Авто: ${data.vehicle ?? 'не привязано'}',
                      'Договор: ${data.contractNumber ?? 'нет'}',
                    ],
                    icon: Icons.person_outline_rounded,
                  ),
                  const SizedBox(height: 6),
                  GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: 6,
                    mainAxisSpacing: 6,
                    childAspectRatio: 1.8 / (MediaQuery.textScalerOf(context).scale(14) / 14).clamp(1.0, 3.0),
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      ManagerMetric(
                        title: 'Долг',
                        value: '${data.debt} сом',
                        icon: Icons.account_balance_wallet_outlined,
                        colorA: _managerOrange,
                        colorB: const Color(0xFFEF4444),
                      ),
                      ManagerMetric(
                        title: 'Просрочка',
                        value: '${data.overdueDebt} сом',
                        icon: Icons.warning_amber_rounded,
                        colorA: _managerPurple,
                        colorB: const Color(0xFFEC4899),
                      ),
                      ManagerMetric(
                        title: 'Переплата',
                        value: '${data.creditBalance} сом',
                        icon: Icons.savings_outlined,
                        colorA: _managerGreen,
                        colorB: const Color(0xFF16A34A),
                      ),
                      ManagerMetric(
                        title: 'Яндекс',
                        value: '${data.yandexBalance} сом',
                        icon: Icons.currency_exchange_rounded,
                        colorA: _managerBlue,
                        colorB: _managerCyan,
                      ),
                      ManagerMetric(
                        title: 'След. платёж',
                        value: '${data.nextPaymentAmount} сом',
                        icon: Icons.calendar_month_rounded,
                        colorA: _managerGreen,
                        colorB: const Color(0xFF16A34A),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  if (data.overdueDebt > 0) ...[
                    ManagerInfoCard(
                      title: 'Период просрочки',
                      lines: [
                        _managerOverduePeriodLabel(
                          data.overdueSinceDate,
                          data.overdueUntilDate,
                        ),
                      ],
                      icon: Icons.date_range_rounded,
                    ),
                    TextButton.icon(
                      onPressed: _pendingAction == null ? () => _showOverdueCalendar(data) : null,
                      icon: const Icon(Icons.calendar_month),
                      label: const Text('Выбрать период просрочки'),
                    ),
                    const SizedBox(height: 6),
                  ],
                  _DriverDetailTabs(
                    selected: _selectedTab,
                    onChanged: (value) => setState(() {
                      _selectedTab = value;
                    }),
                  ),
                  const SizedBox(height: 6),
                  if (_selectedTab == 0) ...[
                    ManagerInfoCard(
                      title: 'Основное',
                      lines: [
                        'След. дата оплаты: ${_managerDateLabel(data.nextPaymentDate)}',
                        'Последний платёж: ${_managerDateLabel(data.lastPaymentDate)}',
                        'Запросов: ${data.pendingStatusRequestsCount}',
                        'Переплата: ${data.creditBalance} сом',
                      ],
                      icon: Icons.analytics_outlined,
                    ),
                  ] else if (_selectedTab == 1) ...[
                    const _SectionTitle('Действия бригадира'),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        FilledButton.icon(
                          onPressed: _pendingAction == null
                              ? () => _createIncidentAction(
                                    'inspection',
                                    'Осмотр создан',
                                  )
                              : null,
                          icon: const Icon(Icons.fact_check_outlined),
                          label: const Text('Осмотр',
                              style: TextStyle(fontSize: 10.5)),
                        ),
                        FilledButton.icon(
                          onPressed: _pendingAction == null
                              ? () => _createIncidentAction(
                                    'repair',
                                    'Водитель поставлен на ремонт',
                                  )
                              : null,
                          icon: const Icon(Icons.build_outlined),
                          label: const Text('СТО',
                              style: TextStyle(fontSize: 10.5)),
                        ),
                        OutlinedButton.icon(
                          onPressed: _pendingAction == null
                              ? () => _createIncidentAction(
                                    'accident',
                                    'ДТП зафиксировано',
                                  )
                              : null,
                          icon: const Icon(Icons.car_crash_outlined),
                          label: const Text('ДТП',
                              style: TextStyle(fontSize: 10.5)),
                        ),
                        FilledButton.icon(
                          onPressed: _pendingAction == null
                              ? () => _createIncidentAction(
                                    'impound',
                                    'Авто поставлено на штрафстоянку',
                                  )
                              : null,
                          style: FilledButton.styleFrom(
                            backgroundColor: _managerPurple,
                            visualDensity: VisualDensity.compact,
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                          ),
                          icon: const Icon(Icons.local_parking_rounded),
                          label: const Text(
                            'Штрафстоянка',
                            style: TextStyle(fontSize: 10.5),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const _SectionTitle('Риск-статус водителя'),
                    const SizedBox(height: 6),
                    _ManagerRiskStatusSelector(
                      currentStatus: data.riskStatus,
                      pendingAction: _pendingAction,
                      actionPrefix: 'risk',
                      onChanged: _updateDriverRiskStatus,
                    ),
                    const SizedBox(height: 6),
                    if (data.contractNumber != null)
                      OutlinedButton.icon(
                        onPressed:
                            _pendingAction == null ? _terminateContract : null,
                        icon: const Icon(Icons.link_off_rounded),
                        label: const Text(
                          'Расторгнуть',
                          style: TextStyle(fontSize: 10.5),
                        ),
                      ),
                  ] else if (_selectedTab == 2) ...[
                    const _SectionTitle('Инциденты'),
                    const SizedBox(height: 6),
                    _ManagerIncidentArchiveToggle(
                      showArchive: _showIncidentArchive,
                      onChanged: (value) =>
                          setState(() => _showIncidentArchive = value),
                    ),
                    const SizedBox(height: 6),
                    if (!data.openIncidents.any((item) =>
                        _managerIncidentIsArchived(item.status) ==
                        _showIncidentArchive))
                      ManagerInfoCard(
                        title: 'Нет инцидентов',
                        lines: [
                          _showIncidentArchive
                              ? 'Архив инцидентов пуст'
                              : 'Активных инцидентов нет',
                        ],
                        icon: Icons.verified_outlined,
                      ),
                    ...data.openIncidents.where((item) =>
                        _managerIncidentIsArchived(item.status) ==
                        _showIncidentArchive).map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            ManagerSignalCard(
                              showAllDetails: true,
                              title: item.title,
                              subtitle: [
                                item.incidentType == 'repair'
                                    ? _managerRepairPeriodLabel(
                                        item.occurredAt, item.periodLabel)
                                    : _managerDateLabel(item.occurredAt),
                                _managerPriorityLabel(item.priority),
                                _managerStatusLabel(item.status),
                                if (item.serviceStage != null)
                                  _managerServiceStageLabel(item.serviceStage!),
                                if (item.serviceCaseType != null)
                                  _managerServiceCaseTypeLabel(
                                    item.serviceCaseType!,
                                  ),
                                ..._managerIncidentHistoryLines(item.statusHistory),
                              ].join('\n'),
                              badge: _managerPriorityLabel(item.priority),
                              accent: item.priority == 'high'
                                  ? _managerOrange
                                  : _managerPurple,
                              icon: Icons.report_problem_outlined,
                            ),
                            if (!_managerIncidentIsArchived(item.status)) ...[
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: [
                                  OutlinedButton(
                                    onPressed: _pendingAction == null
                                        ? () => _updateIncidentAction(
                                              item,
                                              'awaiting_repair',
                                              'Кейс переведен в ожидание ремонта',
                                            )
                                        : null,
                                    child: const Text('Ожидает ремонт'),
                                  ),
                                  FilledButton(
                                    onPressed: _pendingAction == null
                                        ? () => _updateIncidentAction(
                                              item,
                                              'in_repair',
                                              'Кейс переведен в ремонт',
                                            )
                                        : null,
                                    child: const Text('В ремонте'),
                                  ),
                                  OutlinedButton(
                                    onPressed: _pendingAction == null
                                        ? () => _updateIncidentAction(
                                              item,
                                              'completed',
                                              item.serviceCaseType == 'inspection'
                                                  ? 'Осмотр завершен'
                                                  : 'Ремонт завершен',
                                            )
                                        : null,
                                    child: Text(item.incidentType == 'inspection' ? 'Завершить осмотр' : 'Завершить ремонт / на линию'),
                                  ),
                                  if (item.incidentType == 'accident' ||
                                      item.incidentType == 'repair' ||
                                      item.serviceCaseType == 'repair')
                                    OutlinedButton(
                                      onPressed: _pendingAction == null
                                          ? () => _updateIncidentAction(
                                                item,
                                                'written_off',
                                                'Заявка на списание отправлена',
                                              )
                                          : null,
                                      child: const Text(
                                        'Не подлежит восстановлению',
                                      ),
                                    ),
                                  TextButton(
                                    onPressed: _pendingAction == null
                                        ? () => _updateIncidentAction(
                                              item,
                                              'closed',
                                              'Кейс закрыт',
                                            )
                                        : null,
                                    child: const Text('Закрыть'),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ] else if (_selectedTab == 3) ...[
                    const _SectionTitle('Запросы'),
                    const SizedBox(height: 6),
                    if (data.recentStatusRequests.isEmpty)
                      const ManagerInfoCard(
                        title: 'Нет запросов',
                        lines: ['У водителя пока нет новых запросов'],
                        icon: Icons.event_busy_outlined,
                      ),
                    ...data.recentStatusRequests.map(
                      (item) => Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: ManagerSignalCard(
                          title: _managerRequestTypeLabel(item.type),
                          subtitle:
                              '${_managerPeriodLabel(item.period)} • ${_managerRequestStatusLabel(item.status)}'
                              '${_managerOptionalReasonParagraph(item.note)}',
                          badge: _managerRequestStatusLabel(item.status),
                          accent: item.status == 'pending'
                              ? _managerOrange
                              : _managerBlue,
                          icon: Icons.event_available_outlined,
                        ),
                      ),
                    ),
                  ] else ...[
                    ManagerDriverPhotoCard(
                      driver: data,
                      pendingAction: _pendingAction,
                      onApprove: () => _reviewDriverPhoto('approve'),
                      onReject: () => _reviewDriverPhoto('reject'),
                    ),
                  ],
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _DriverDetailTabs extends StatelessWidget {
  const _DriverDetailTabs({
    required this.selected,
    required this.onChanged,
  });

  final int selected;
  final ValueChanged<int> onChanged;

  static const _tabs = [
    ('Обзор', Icons.dashboard_outlined),
    ('Действия', Icons.touch_app_outlined),
    ('Инциденты', Icons.report_problem_outlined),
    ('Запросы', Icons.event_available_outlined),
    ('Фото', Icons.photo_camera_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _managerText.withValues(alpha: 0.1)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var index = 0; index < _tabs.length; index++)
              Padding(
                padding: EdgeInsets.only(
                  right: index == _tabs.length - 1 ? 0 : 6,
                ),
                child: ChoiceChip(
                  selected: selected == index,
                  avatar: Icon(_tabs[index].$2, size: 16),
                  label: Text(_tabs[index].$1),
                  onSelected: (_) => onChanged(index),
                  labelStyle: TextStyle(
                    fontSize: 12,
                    fontWeight:
                        selected == index ? FontWeight.w800 : FontWeight.w700,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ManagerChatPage extends StatefulWidget {
  const ManagerChatPage({super.key, required this.repository});

  final ManagerRepository repository;

  @override
  State<ManagerChatPage> createState() => _ManagerChatPageState();
}

class _ManagerChatPageState extends State<ManagerChatPage> {
  late Future<List<ManagerChatThreadDto>> _threadsFuture;
  late Future<List<ManagerAssignedDriverDto>> _driversFuture;
  final _driverSearchController = TextEditingController();
  String _driverSearchQuery = '';
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _reload();
    _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) {
        setState(_reload);
      }
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _driverSearchController.dispose();
    super.dispose();
  }

  void _reload() {
    _threadsFuture = widget.repository.loadChats();
    _driversFuture = widget.repository.loadDrivers();
  }

  List<ManagerChatThreadDto> _searchChatThreads(
    List<ManagerChatThreadDto> threads,
    String query,
  ) {
    final normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.isEmpty) {
      return _sortChatThreads(threads);
    }

    return _sortChatThreads(threads.where((thread) {
      final haystack = [
        thread.driverName ?? '',
        thread.managerName ?? '',
        thread.subject,
        thread.lastMessagePreview ?? '',
      ].join(' ').toLowerCase();
      return haystack.contains(normalizedQuery);
    }).toList());
  }

  List<ManagerChatThreadDto> _sortChatThreads(
    List<ManagerChatThreadDto> threads,
  ) {
    return threads.toList()
      ..sort((left, right) {
        final leftDate = left.lastMessageAt ?? left.createdAt;
        final rightDate = right.lastMessageAt ?? right.createdAt;
        return rightDate.compareTo(leftDate);
      });
  }

  Future<void> _openThread(ManagerChatThreadDto thread) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ManagerChatThreadPage(
          repository: widget.repository,
          threadId: thread.id,
          title: thread.driverName ?? 'Водитель',
        ),
      ),
    );
    if (mounted) {
      setState(_reload);
    }
  }

  Future<void> _openDriverChat(
    String? driverId,
    List<ManagerChatThreadDto> threads,
    List<ManagerAssignedDriverDto> drivers,
  ) async {
    if (driverId == null) {
      return;
    }
    final existing = threads
        .where((thread) => thread.driverId == driverId)
        .toList()
      ..sort((left, right) => (right.lastMessageAt ?? right.createdAt)
          .compareTo(left.lastMessageAt ?? left.createdAt));
    if (existing.isNotEmpty) {
      await _openThread(existing.first);
      return;
    }

    final driverName = drivers
        .where((driver) => driver.id == driverId)
        .map((driver) => driver.fullName)
        .firstOrNull;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ManagerChatThreadPage(
          repository: widget.repository,
          driverId: driverId,
          title: driverName ?? 'Новый чат',
        ),
      ),
    );
    if (mounted) {
      setState(_reload);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<ManagerChatThreadDto>>(
      future: _threadsFuture,
      builder: (context, threadSnapshot) {
        final threads = threadSnapshot.data ?? const <ManagerChatThreadDto>[];
        final filteredThreads = _searchChatThreads(threads, _driverSearchQuery);

        return ListView(
          padding: const EdgeInsets.all(8),
          children: [
            const _ManagerHero(
              title: 'Чат с водителями',
              subtitle: 'Диалоги с закреплёнными водителями и быстрые ответы',
              icon: Icons.chat_bubble_outline,
            ),
            const SizedBox(height: 6),
            if (threadSnapshot.hasError)
              ManagerInfoCard(
                title: 'Чат недоступен',
                lines: ['${threadSnapshot.error}'],
                icon: Icons.sms_failed_outlined,
              )
            else ...[
              FutureBuilder<List<ManagerAssignedDriverDto>>(
                future: _driversFuture,
                builder: (context, driverSnapshot) {
                  final drivers =
                      driverSnapshot.data ?? const <ManagerAssignedDriverDto>[];
                  final filteredDrivers =
                      _searchManagerDrivers(drivers, _driverSearchQuery);
                  return Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.95),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      children: [
                        TextField(
                          controller: _driverSearchController,
                          keyboardType: TextInputType.text,
                          textInputAction: TextInputAction.search,
                          decoration: _managerInputDecoration(
                            'Поиск водителя для чата',
                            Icons.search_rounded,
                          ).copyWith(
                            helperText: 'Имя, телефон или авто',
                            suffixIcon: _driverSearchQuery.isEmpty
                                ? null
                                : IconButton(
                                    onPressed: () {
                                      _driverSearchController.clear();
                                      setState(() {
                                        _driverSearchQuery = '';
                                      });
                                    },
                                    icon: const Icon(Icons.close_rounded),
                                  ),
                          ),
                          onChanged: (value) =>
                              setState(() => _driverSearchQuery = value),
                        ),
                        const SizedBox(height: 6),
                        DropdownButtonFormField<String>(
                          key: ValueKey(
                            'new-chat-$_driverSearchQuery',
                          ),
                          initialValue: null,
                          decoration: _managerInputDecoration(
                            'Новый чат с водителем',
                            Icons.person_add_alt_1_outlined,
                          ),
                          items: filteredDrivers
                              .map(
                                (driver) => DropdownMenuItem(
                                  value: driver.id,
                                  child: Text([
                                    driver.fullName,
                                    if (driver.managerName?.trim().isNotEmpty ==
                                        true)
                                      driver.managerName!,
                                  ].join(' · ')),
                                ),
                              )
                              .toList(),
                          onChanged: filteredDrivers.isEmpty
                              ? null
                              : (value) => unawaited(
                                    _openDriverChat(
                                      value,
                                      threads,
                                      filteredDrivers,
                                    ),
                                  ),
                        ),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 6),
              const _SectionTitle('Диалоги'),
              const SizedBox(height: 6),
              if (threadSnapshot.connectionState == ConnectionState.waiting)
                const LinearProgressIndicator(minHeight: 2)
              else if (threads.isEmpty)
                const ManagerInfoCard(
                  title: 'Диалогов пока нет',
                  lines: [
                    'Выберите водителя выше и отправьте первое сообщение'
                  ],
                  icon: Icons.mark_chat_unread_outlined,
                )
              else if (filteredThreads.isEmpty)
                const ManagerInfoCard(
                  title: 'Ничего не найдено',
                  lines: ['Проверьте имя водителя, телефон или авто'],
                  icon: Icons.search_off_rounded,
                )
              else
                ...filteredThreads.map(
                  (thread) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: GestureDetector(
                      onTap: () => unawaited(_openThread(thread)),
                      child: ManagerSignalCard(
                        title: thread.driverName ?? 'Водитель',
                        subtitle:
                            thread.lastMessagePreview ?? 'Сообщений пока нет',
                        badge: thread.status == 'open' ? 'Открыт' : 'Закрыт',
                        accent: _managerBlue,
                        icon: Icons.chat_outlined,
                      ),
                    ),
                  ),
                ),
            ],
          ],
        );
      },
    );
  }
}

class ManagerChatThreadPage extends StatefulWidget {
  const ManagerChatThreadPage({
    super.key,
    required this.repository,
    required this.title,
    this.threadId,
    this.driverId,
  });

  final ManagerRepository repository;
  final String title;
  final String? threadId;
  final String? driverId;

  @override
  State<ManagerChatThreadPage> createState() => _ManagerChatThreadPageState();
}

class _ManagerChatThreadPageState extends State<ManagerChatThreadPage> {
  ManagerChatThreadDetailDto? _threadDetail;
  Object? _threadError;
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  String? _threadId;
  bool _isSending = false;
  bool _isThreadLoading = false;
  bool _stickToBottom = true;
  String? _lastMessageSignature;
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _threadId = widget.threadId;
    final threadId = _threadId;
    if (threadId != null) {
      unawaited(_loadThread(threadId, forceScroll: true));
    }
    _scrollController.addListener(_rememberScrollPosition);
    _refreshTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      _refreshThread();
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _scrollController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  void _rememberScrollPosition() {
    if (!_scrollController.hasClients) {
      return;
    }
    _stickToBottom = _isNearBottom(threshold: 140);
  }

  bool _isNearBottom({double threshold = 80}) {
    if (!_scrollController.hasClients) {
      return true;
    }
    final position = _scrollController.position;
    return position.maxScrollExtent - position.pixels < threshold;
  }

  String _messageSignature(ManagerChatThreadDetailDto thread) {
    if (thread.messages.isEmpty) {
      return '${thread.id}:empty';
    }
    final last = thread.messages.last;
    return '${thread.id}:${thread.messages.length}:${last.id}:${last.createdAt}';
  }

  void _scrollToBottomIfNeeded(
    ManagerChatThreadDetailDto thread, {
    bool force = false,
  }) {
    final signature = _messageSignature(thread);
    if (!force && _lastMessageSignature == signature) {
      return;
    }
    final shouldScroll =
        force || _lastMessageSignature == null || _stickToBottom;
    _lastMessageSignature = signature;
    if (shouldScroll) {
      _scheduleScrollToBottom(animated: force ? false : true);
    }
  }

  void _scheduleScrollToBottom({bool animated = true, int attempt = 0}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) {
        if (attempt < 5 && mounted) {
          Future.delayed(const Duration(milliseconds: 80), () {
            if (mounted) {
              _scheduleScrollToBottom(
                animated: animated,
                attempt: attempt + 1,
              );
            }
          });
        }
        return;
      }
      final target = _scrollController.position.maxScrollExtent;
      if (animated) {
        _scrollController.animateTo(
          target,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      } else {
        _scrollController.jumpTo(target);
      }
    });
  }

  Future<void> _loadThread(
    String threadId, {
    bool forceScroll = false,
    bool showLoader = true,
  }) async {
    if (showLoader) {
      setState(() {
        _isThreadLoading = true;
        _threadError = null;
      });
    }
    try {
      final detail = await widget.repository.loadChat(threadId);
      if (!mounted || _threadId != threadId) {
        return;
      }
      setState(() {
        _threadDetail = detail;
        _threadError = null;
        _isThreadLoading = false;
      });
      _scrollToBottomIfNeeded(detail, force: forceScroll);
    } catch (error) {
      if (!mounted || _threadId != threadId) {
        return;
      }
      setState(() {
        _threadError = error;
        _isThreadLoading = false;
      });
    }
  }

  Future<void> _refreshThread() async {
    final threadId = _threadId;
    if (threadId == null || _isSending) {
      return;
    }

    try {
      final keepBottom = _stickToBottom || _isNearBottom();
      final updated = await widget.repository.loadChat(threadId);
      if (!mounted || _threadId != threadId) {
        return;
      }
      setState(() {
        _threadDetail = updated;
        _threadError = null;
        _isThreadLoading = false;
      });
      if (keepBottom) {
        _scrollToBottomIfNeeded(updated);
      } else {
        _lastMessageSignature = _messageSignature(updated);
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

    final threadId = _threadId;
    final driverId = widget.driverId;
    if (threadId == null && driverId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Водитель не выбран')),
      );
      return;
    }

    setState(() => _isSending = true);
    try {
      final updated = threadId == null
          ? await widget.repository.startDriverChat(driverId!, text)
          : await widget.repository.sendChatMessage(threadId, text);
      if (!mounted) {
        return;
      }
      _messageController.clear();
      setState(() {
        _threadId = updated.id;
        _threadDetail = updated;
        _threadError = null;
        _isThreadLoading = false;
      });
      _scrollToBottomIfNeeded(updated, force: true);
    } catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Не удалось отправить сообщение: $error')),
      );
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _managerBg,
      appBar: AppBar(title: Text(widget.title)),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                controller: _scrollController,
                padding: const EdgeInsets.all(8),
                children: [_buildThreadBody()],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 5, 8, 8),
              child: TextField(
                controller: _messageController,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _sendMessage(),
                decoration: _managerInputDecoration(
                  'Сообщение водителю',
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
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildThreadBody() {
    final thread = _threadDetail;
    if (_threadId == null && thread == null) {
      return const ManagerInfoCard(
        title: 'Выберите диалог',
        lines: ['Откройте существующий чат или выберите водителя для нового'],
        icon: Icons.chat_bubble_outline,
      );
    }

    if (_threadError != null && thread == null) {
      return ManagerInfoCard(
        title: 'Не удалось открыть диалог',
        lines: [_managerUserError(_threadError!)],
        icon: Icons.sms_failed_outlined,
      );
    }

    if (_isThreadLoading && thread == null) {
      return const LinearProgressIndicator(minHeight: 2);
    }

    if (thread == null || thread.messages.isEmpty) {
      return const ManagerInfoCard(
        title: 'История пустая',
        lines: ['Отправьте первое сообщение водителю'],
        icon: Icons.mark_chat_unread_outlined,
      );
    }

    return Column(
      children: thread.messages
          .map(
            (message) => _ManagerChatBubble(message: message),
          )
          .toList(),
    );
  }
}

class _ManagerChatBubble extends StatelessWidget {
  const _ManagerChatBubble({required this.message});

  final ManagerChatMessageDto message;

  @override
  Widget build(BuildContext context) {
    final isManager = message.senderRole == 'manager';
    final sentAt = _managerMessageDateTimeLabel(message.createdAt);
    return Align(
      alignment: isManager ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 5),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        constraints: const BoxConstraints(maxWidth: 280),
        decoration: BoxDecoration(
          color: isManager
              ? _managerBlue.withValues(alpha: 0.12)
              : Colors.white.withValues(alpha: 0.95),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isManager
                ? _managerBlue.withValues(alpha: 0.22)
                : _managerText.withValues(alpha: 0.08),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    message.senderName,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: isManager ? _managerBlue : _managerMuted,
                      fontWeight: FontWeight.w800,
                      fontSize: 10,
                    ),
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  sentAt,
                  style: const TextStyle(
                    color: _managerMuted,
                    fontWeight: FontWeight.w700,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              message.body,
              style: const TextStyle(
                color: _managerText,
                fontWeight: FontWeight.w600,
                fontSize: 11,
                height: 1.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _managerMessageDateTimeLabel(String value) {
  final parsed = DateTime.tryParse(value);
  if (parsed == null) {
    return value;
  }

  final local = parsed.toLocal();
  final day = local.day.toString().padLeft(2, '0');
  final month = local.month.toString().padLeft(2, '0');
  final year = local.year.toString();
  final hour = local.hour.toString().padLeft(2, '0');
  final minute = local.minute.toString().padLeft(2, '0');
  return '$day.$month.$year $hour:$minute';
}

String _managerDateTimeLabel(String? value) {
  if (value == null || value.isEmpty) {
    return 'нет';
  }
  return _managerMessageDateTimeLabel(value);
}

class ManagerProfilePage extends StatelessWidget {
  const ManagerProfilePage({
    super.key,
    required this.session,
    required this.onOpenNotifications,
    required this.onSignOut,
  });

  final ManagerAuthSessionDto session;
  final VoidCallback onOpenNotifications;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(8),
      children: [
        const _ManagerHero(
          title: 'Профиль бригадира',
          subtitle: 'Роль, профиль и выход из аккаунта',
          icon: Icons.person_rounded,
        ),
        const SizedBox(height: 6),
        ManagerInfoCard(
          title: 'Бригадир GoPark',
          lines: [
            'Роль: ${_managerRoleLabel(session.requestUserRole)}',
            'Работа с водителями и выплатами',
          ],
          icon: Icons.badge_outlined,
        ),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: onOpenNotifications,
          child: const ManagerInfoCard(
            title: 'Уведомления',
            lines: [
              'Запросы, риск-статусы, инциденты и системные сообщения',
            ],
            icon: Icons.notifications_active_outlined,
          ),
        ),
        const SizedBox(height: 6),
        OutlinedButton(
          onPressed: onSignOut,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(34),
            visualDensity: VisualDensity.compact,
            side: BorderSide(color: _managerText.withValues(alpha: 0.14)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(9),
            ),
          ),
          child: const Text('Выйти'),
        ),
      ],
    );
  }
}

class ManagerDriverCard extends StatelessWidget {
  const ManagerDriverCard({
    super.key,
    required this.driver,
    required this.pendingAction,
    required this.onInspection,
    required this.onRepair,
    required this.onAccident,
    required this.onImpound,
    required this.onRiskStatusChanged,
  });

  final ManagerAssignedDriverDto driver;
  final String? pendingAction;
  final VoidCallback onInspection;
  final VoidCallback onRepair;
  final VoidCallback onAccident;
  final VoidCallback onImpound;
  final ValueChanged<String> onRiskStatusChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: _managerText.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  gradient: const LinearGradient(
                    colors: [_managerBlue, _managerCyan],
                  ),
                ),
                child: Center(
                  child: Text(
                    driver.fullName
                        .split(' ')
                        .take(2)
                        .map((part) => part.isEmpty ? '' : part[0])
                        .join(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      fontSize: 10,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      driver.fullName,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      driver.phone,
                      style: const TextStyle(
                        color: _managerMuted,
                        fontSize: 10,
                      ),
                    ),
                    if (driver.managerName?.isNotEmpty == true) ...[
                      const SizedBox(height: 1),
                      Text(
                        'Бригадир: ${driver.managerName}',
                        style: const TextStyle(
                          color: _managerMuted,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              _ManagerBadge(
                label: _managerStatusLabel(driver.status),
                color: driver.overdueDebt > 0 ? _managerOrange : _managerBlue,
              ),
            ],
          ),
          const SizedBox(height: 5),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              _ManagerBadge(
                label: _managerHasVehicle(driver) ? driver.vehicle : 'без авто',
                color: _managerGreen,
              ),
              _ManagerBadge(
                label: 'риск: ${_managerRiskStatusLabel(driver.riskStatus)}',
                color: _managerRiskStatusColor(driver.riskStatus),
              ),
              _ManagerBadge(
                label: _managerPaymentDueBadgeLabel(driver),
                color: _managerIsPaymentDueTodayOrEarlier(driver)
                    ? _managerOrange
                    : _managerPurple,
              ),
              _ManagerBadge(
                label: 'выходной ${_managerWeekdayLabel(driver.weeklyDayOff)}',
                color: _managerBlue,
              ),
            ],
          ),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(
                child: _ManagerStatPill(
                  label: 'Долг',
                  value: '${driver.debt} сом',
                  color: _managerOrange,
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: _ManagerStatPill(
                  label: 'Просрочка',
                  value: '${driver.overdueDebt} сом',
                  color: _managerPurple,
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: _ManagerStatPill(
                  label: 'Переплата',
                  value: '${driver.creditBalance} сом',
                  color: _managerGreen,
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: _ManagerStatPill(
                  label: 'Яндекс',
                  value: '${driver.yandexBalance} сом',
                  color: _managerBlue,
                ),
              ),
            ],
          ),
          if (driver.overdueDebt > 0) ...[
            const SizedBox(height: 5),
            ManagerInfoCard(
              title: 'Период просрочки',
              lines: [
                _managerOverduePeriodLabel(
                  driver.overdueSinceDate,
                  driver.overdueUntilDate,
                ),
              ],
              icon: Icons.date_range_rounded,
            ),
          ],
          const SizedBox(height: 5),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              OutlinedButton.icon(
                onPressed: pendingAction == null ? onInspection : null,
                style: OutlinedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                icon: pendingAction == '${driver.id}:inspection'
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.fact_check_outlined),
                label: const Text('Осмотр', style: TextStyle(fontSize: 10.5)),
              ),
              FilledButton.icon(
                onPressed: pendingAction == null ? onRepair : null,
                style: FilledButton.styleFrom(
                  backgroundColor: _managerOrange,
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                icon: pendingAction == '${driver.id}:repair'
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.build_outlined),
                label: const Text('СТО', style: TextStyle(fontSize: 10.5)),
              ),
              OutlinedButton.icon(
                onPressed: pendingAction == null ? onAccident : null,
                style: OutlinedButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                icon: pendingAction == '${driver.id}:accident'
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.car_crash_outlined),
                label: const Text('ДТП', style: TextStyle(fontSize: 10.5)),
              ),
              FilledButton.icon(
                onPressed: pendingAction == null ? onImpound : null,
                style: FilledButton.styleFrom(
                  backgroundColor: _managerPurple,
                  visualDensity: VisualDensity.compact,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                ),
                icon: pendingAction == '${driver.id}:impound'
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Icon(Icons.local_parking_rounded),
                label: const Text(
                  'Штрафстоянка',
                  style: TextStyle(fontSize: 10.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          _ManagerRiskStatusSelector(
            currentStatus: driver.riskStatus,
            pendingAction: pendingAction,
            actionPrefix: '${driver.id}:risk',
            onChanged: onRiskStatusChanged,
          ),
        ],
      ),
    );
  }
}

class _ManagerRiskStatusSelector extends StatelessWidget {
  const _ManagerRiskStatusSelector({
    required this.currentStatus,
    required this.pendingAction,
    required this.actionPrefix,
    required this.onChanged,
  });

  final String currentStatus;
  final String? pendingAction;
  final String actionPrefix;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    const statuses = ['normal', 'medium', 'risk'];

    return Wrap(
      spacing: 5,
      runSpacing: 5,
      children: statuses.map((status) {
        final isCurrent = currentStatus == status;
        final actionKey = '$actionPrefix:$status';
        final isPending = pendingAction == actionKey;
        final disabled = pendingAction != null || isCurrent;
        final color = _managerRiskStatusColor(status);

        return ChoiceChip(
          selected: isCurrent,
          onSelected: disabled ? null : (_) => onChanged(status),
          avatar: isPending
              ? const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Icon(
                  status == 'risk'
                      ? Icons.warning_amber_rounded
                      : status == 'medium'
                          ? Icons.speed_rounded
                          : Icons.verified_user_outlined,
                  size: 13,
                  color: isCurrent ? Colors.white : color,
                ),
          label: Text(
            _managerRiskStatusLabel(status),
            style: const TextStyle(fontSize: 10),
          ),
          selectedColor: color,
          labelStyle: TextStyle(
            color: isCurrent ? Colors.white : _managerText,
            fontWeight: FontWeight.w800,
          ),
          backgroundColor: color.withValues(alpha: 0.08),
          side: BorderSide(color: color.withValues(alpha: 0.22)),
        );
      }).toList(),
    );
  }
}

class ManagerDriverPhotoCard extends StatelessWidget {
  const ManagerDriverPhotoCard({
    super.key,
    required this.driver,
    required this.pendingAction,
    required this.onApprove,
    required this.onReject,
  });

  final ManagerDriverDetailDto driver;
  final String? pendingAction;
  final VoidCallback onApprove;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final hasPhoto = driver.photoUrl?.startsWith('data:image/') == true;
    return Container(
      padding: const EdgeInsets.all(7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: [
          BoxShadow(
            color: _managerText.withValues(alpha: 0.035),
            blurRadius: 10,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.photo_camera_front_outlined,
                  color: _managerBlue, size: 15),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Фото водителя · ${_managerPhotoStatusLabel(driver.photoStatus)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          if (hasPhoto)
            GestureDetector(
              onTap: () {
                showDialog<void>(
                  context: context,
                  builder: (dialogContext) => Dialog.fullscreen(
                    backgroundColor: Colors.black87,
                    child: SafeArea(
                      child: Stack(
                        children: [
                          Center(
                            child: InteractiveViewer(
                              child: Image.memory(
                                base64Decode(driver.photoUrl!.split(',').last),
                                fit: BoxFit.contain,
                              ),
                            ),
                          ),
                          Positioned(
                            top: 8,
                            right: 8,
                            child: IconButton(
                              onPressed: () =>
                                  Navigator.of(dialogContext).pop(),
                              icon:
                                  const Icon(Icons.close, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
              child: ClipRRect(
                borderRadius: BorderRadius.circular(9),
                child: Image.memory(
                  base64Decode(driver.photoUrl!.split(',').last),
                  height: 92,
                  width: double.infinity,
                  fit: BoxFit.contain,
                ),
              ),
            )
          else
            const Text('Фото еще не загружено',
                style: TextStyle(color: _managerMuted, fontSize: 10)),
          if (driver.photoReviewNote?.trim().isNotEmpty == true) ...[
            const SizedBox(height: 5),
            Text(
              'Комментарий: ${driver.photoReviewNote}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: _managerMuted, fontSize: 10),
            ),
          ],
          if (driver.photoStatus == 'pending') ...[
            const SizedBox(height: 5),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: pendingAction == null ? onReject : null,
                    style: OutlinedButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                    ),
                    child: const Text('Отклонить',
                        style: TextStyle(fontSize: 10.5)),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: FilledButton(
                    onPressed: pendingAction == null ? onApprove : null,
                    style: FilledButton.styleFrom(
                      visualDensity: VisualDensity.compact,
                    ),
                    child: Text(
                      pendingAction == 'photo:approve'
                          ? 'Сохраняем...'
                          : 'Одобрить',
                      style: const TextStyle(fontSize: 10.5),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

String _managerPhotoStatusLabel(String status) {
  switch (status) {
    case 'pending':
      return 'ожидает';
    case 'approved':
      return 'одобрено';
    case 'rejected':
      return 'отклонено';
    case 'missing':
      return 'нет фото';
    default:
      return status;
  }
}

class ManagerSignalCard extends StatelessWidget {
  const ManagerSignalCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.accent,
    required this.icon,
    this.onTap,
    this.showAllDetails = false,
  });

  final String title;
  final String subtitle;
  final String badge;
  final Color accent;
  final IconData icon;
  final VoidCallback? onTap;
  final bool showAllDetails;

  @override
  Widget build(BuildContext context) {
    final detailLines = subtitle
        .split(RegExp(r' • |\n'))
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Ink(
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.95),
            borderRadius: BorderRadius.circular(10),
            boxShadow: [
              BoxShadow(
                color: _managerText.withValues(alpha: 0.04),
                blurRadius: 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: accent, size: 15),
              ),
              const SizedBox(width: 7),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    ...detailLines.take(showAllDetails ? detailLines.length : 4).map(
                          (line) => Padding(
                            padding: const EdgeInsets.only(bottom: 1),
                            child: Text(
                              line,
                              maxLines: showAllDetails ? null : 1,
                              overflow: showAllDetails
                                  ? TextOverflow.visible
                                  : TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: _managerMuted,
                                height: 1.12,
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _ManagerBadge(label: badge, color: accent),
                  if (onTap != null) ...[
                    const SizedBox(height: 5),
                    Icon(
                      Icons.arrow_forward_rounded,
                      size: 14,
                      color: _managerMuted.withValues(alpha: 0.7),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ManagerStatPill extends StatelessWidget {
  const _ManagerStatPill({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: _managerMuted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 1),
          Text(
            value,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w900,
              fontSize: 14,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _ManagerBadge extends StatelessWidget {
  const _ManagerBadge({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w800,
          fontSize: 9,
        ),
      ),
    );
  }
}

class _ManagerIncidentDetails {
  const _ManagerIncidentDetails({
    required this.note,
    this.photoDataUrl,
  });

  final String? note;
  final String? photoDataUrl;
}

Future<_ManagerIncidentDetails?> _showManagerIncidentDetailsDialog(
  BuildContext context, {
  required String title,
  required String noteLabel,
  bool requirePhoto = false,
}) async {
  final noteController = TextEditingController();
  String? photoDataUrl;
  try {
    return await showDialog<_ManagerIncidentDetails>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              insetPadding: const EdgeInsets.all(12),
              titlePadding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              contentPadding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              actionsPadding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              title: Text(title),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: noteController,
                    minLines: 2,
                    maxLines: 4,
                    decoration: InputDecoration(
                      labelText: noteLabel,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 6,
                      ),
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  if (requirePhoto) ...[
                    const SizedBox(height: 6),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(34),
                        visualDensity: VisualDensity.compact,
                      ),
                      onPressed: () async {
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
                        setDialogState(() {
                          photoDataUrl =
                              'data:image/jpeg;base64,${base64Encode(bytes)}';
                        });
                      },
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: Text(
                        photoDataUrl == null
                            ? 'Загрузить фото ДТП'
                            : 'Фото ДТП загружено',
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      photoDataUrl == null
                          ? 'Без фото ДТП не будет зафиксировано.'
                          : 'После отправки статус будет: ДТП зафиксировано.',
                      style: const TextStyle(
                        color: _managerMuted,
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ],
              ),
              actions: [
                TextButton(
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Отмена'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: requirePhoto && photoDataUrl == null
                      ? null
                      : () {
                          final note = noteController.text.trim();
                          Navigator.of(dialogContext).pop(
                            _ManagerIncidentDetails(
                              note: note.isEmpty ? null : note,
                              photoDataUrl: photoDataUrl,
                            ),
                          );
                        },
                  child: const Text('Создать'),
                ),
              ],
            );
          },
        );
      },
    );
  } finally {
    noteController.dispose();
  }
}

Future<_ManagerIncidentDetails?> _showManagerRequiredNoteDialog(
  BuildContext context, {
  required String title,
  required String noteLabel,
  required String confirmLabel,
}) async {
  final noteController = TextEditingController();
  String? errorText;
  try {
    return await showDialog<_ManagerIncidentDetails>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              insetPadding: const EdgeInsets.all(12),
              titlePadding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              contentPadding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              actionsPadding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              title: Text(title),
              content: TextField(
                controller: noteController,
                minLines: 2,
                maxLines: 4,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: noteLabel,
                  errorText: errorText,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 6,
                  ),
                  border: const OutlineInputBorder(),
                ),
              ),
              actions: [
                TextButton(
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: const Text('Отмена'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: () {
                    final note = noteController.text.trim();
                    if (note.isEmpty) {
                      setDialogState(
                        () => errorText = 'Укажите причину изменения',
                      );
                      return;
                    }
                    Navigator.of(dialogContext).pop(
                      _ManagerIncidentDetails(note: note),
                    );
                  },
                  child: Text(confirmLabel),
                ),
              ],
            );
          },
        );
      },
    );
  } finally {
    noteController.dispose();
  }
}

String _managerPriorityLabel(String priority) {
  switch (priority) {
    case 'high':
      return 'Срочно';
    case 'medium':
      return 'Средний';
    case 'low':
      return 'Низкий';
    default:
      return priority;
  }
}

String _managerIncidentTypeLabel(String? incidentType) {
  switch (incidentType) {
    case 'accident':
      return 'ДТП';
    case 'repair':
      return 'Ремонт';
    case 'inspection':
      return 'Осмотр';
    case 'impound':
      return 'Штрафстоянка';
    default:
      return 'Инцидент';
  }
}

String _managerStatusLabel(String status) {
  switch (status) {
    case 'open':
      return 'Открыт';
    case 'pending':
      return 'На проверке';
    case 'approved':
      return 'Одобрен';
    case 'rejected':
      return 'Отклонён';
    case 'active':
      return 'Активен';
    case 'terminated':
      return 'Расторгнут';
    case 'assigned':
      return 'На линии';
    case 'active_installment':
      return 'На линии';
    case 'day_off':
      return 'Выходной';
    case 'vacation':
      return 'Отпросился';
    case 'force_majeure':
      return 'Форс-мажор';
    case 'idle':
      return 'Простой';
    case 'impound':
      return 'Штрафстоянка';
    case 'maintenance':
      return 'Ремонт';
    case 'written_off':
      return 'Списан';
    case 'writeoff_requested':
      return 'Заявка на списание';
    case 'resolved':
      return 'Завершён';
    case 'closed':
      return 'Закрыт';
    case 'accident':
      return 'ДТП';
    default:
      return status;
  }
}

String _managerRiskStatusLabel(String status) {
  switch (status) {
    case 'normal':
      return 'Нормальный';
    case 'medium':
      return 'Средний';
    case 'risk':
      return 'Зона риска';
    default:
      return 'Нормальный';
  }
}

String _managerRiskReviewStatusLabel(String status) {
  switch (status) {
    case 'pending':
      return 'Ожидает';
    case 'approved':
      return 'Подтверждено';
    case 'rejected':
      return 'Отклонено';
    default:
      return status;
  }
}

Color _managerRiskStatusColor(String status) {
  switch (status) {
    case 'normal':
      return _managerGreen;
    case 'medium':
      return _managerOrange;
    case 'risk':
      return const Color(0xFFDC2626);
    default:
      return _managerGreen;
  }
}

String _managerServiceStageLabel(String stage) {
  switch (stage) {
    case 'inspection':
      return 'Осмотр';
    case 'awaiting_repair':
      return 'Ожидает ремонт';
    case 'in_repair':
      return 'В ремонте';
    case 'completed':
      return 'Завершено';
    case 'writeoff_requested':
      return 'Заявка на списание';
    case 'written_off':
      return 'Списан';
    case 'impound':
      return 'Штрафстоянка';
    default:
      return stage;
  }
}

String _managerServiceCaseTypeLabel(String type) {
  switch (type) {
    case 'inspection':
      return 'Осмотр';
    case 'repair':
      return 'Ремонт';
    case 'insurance':
      return 'Страховой случай';
    case 'non_insurance':
      return 'Не страховой';
    case 'impound':
      return 'Штрафстоянка';
    default:
      return type;
  }
}

String _managerRequestStatusLabel(String status) {
  switch (status) {
    case 'pending':
      return 'На рассмотрении';
    case 'approved':
      return 'Одобрено';
    case 'rejected':
      return 'Отклонено';
    default:
      return status;
  }
}

String _managerRequestTypeLabel(String type) {
  switch (type) {
    case 'day_off':
      return 'Выходной';
    case 'vacation':
      return 'Отпросился';
    case 'force_majeure':
      return 'Форс-мажор';
    case 'sick_leave':
      return 'Больничный';
    default:
      return type;
  }
}

String _managerOptionalReasonParagraph(String? note) {
  final trimmed = note?.trim();
  return trimmed?.isNotEmpty == true ? '\n\nПричина: $trimmed' : '';
}

String _managerRoleLabel(String role) {
  switch (role) {
    case 'manager':
      return 'Бригадир';
    default:
      return role;
  }
}

String _managerWeekdayLabel(String? value) {
  switch (value) {
    case 'monday':
      return 'Понедельник';
    case 'tuesday':
      return 'Вторник';
    case 'wednesday':
      return 'Среда';
    case 'thursday':
      return 'Четверг';
    case 'friday':
      return 'Пятница';
    case 'saturday':
      return 'Суббота';
    case 'sunday':
      return 'Воскресенье';
    case null:
    case '':
      return 'не задан';
    default:
      return value;
  }
}

String _managerDateLabel(String? value) {
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

String _managerNumberLabel(num value) {
  final text = value.round().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < text.length; i += 1) {
    final reverseIndex = text.length - i;
    buffer.write(text[i]);
    if (reverseIndex > 1 && reverseIndex % 3 == 1) {
      buffer.write(' ');
    }
  }
  return buffer.toString();
}

String _managerPeriodLabel(String period) {
  if (period.trim().isEmpty) {
    return 'Период не указан';
  }

  if (!period.contains('..')) {
    return _managerDateLabel(period);
  }

  final parts = period.split('..').map((item) => item.trim()).toList();
  if (parts.length != 2) {
    return period;
  }

  return '${_managerDateLabel(parts[0])} - ${_managerDateLabel(parts[1])}';
}

String _managerOverduePeriodLabel(String? sinceDate, String? untilDate) {
  if (sinceDate == null || sinceDate.isEmpty) {
    return 'Даты просрочки не указаны';
  }
  if (untilDate == null || untilDate.isEmpty || untilDate == sinceDate) {
    return 'С ${_managerDateLabel(sinceDate)}';
  }
  return 'С ${_managerDateLabel(sinceDate)} по ${_managerDateLabel(untilDate)}';
}

String _managerRepairPeriodLabel(String? occurredAt, String? periodLabel) {
  final period = periodLabel?.trim() ?? '';
  if (period.contains('..')) {
    final parts = period.split('..').map((item) => item.trim()).toList();
    if (parts.length == 2 && parts[1].isNotEmpty) {
      return 'Ремонт с ${_managerDateLabel(parts[0])} по ${_managerDateLabel(parts[1])}';
    }
    return 'Ремонт с ${_managerDateLabel(parts.first)}';
  }
  if (period.isNotEmpty) {
    return 'Ремонт $period';
  }
  return occurredAt == null || occurredAt.isEmpty
      ? 'Даты ремонта не указаны'
      : 'Ремонт с ${_managerDateLabel(occurredAt)}';
}

class ManagerLoginPage extends StatefulWidget {
  const ManagerLoginPage({
    super.key,
    required this.isSubmitting,
    required this.errorText,
    required this.onSubmit,
  });

  final bool isSubmitting;
  final String? errorText;
  final Future<void> Function(String login, String password) onSubmit;

  @override
  State<ManagerLoginPage> createState() => _ManagerLoginPageState();
}

class _ManagerLoginPageState extends State<ManagerLoginPage> {
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
            colors: [_managerBg, Color(0xFFE6F0FF)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 320),
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.9),
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: [
                      BoxShadow(
                        color: _managerBlue.withValues(alpha: 0.14),
                        blurRadius: 12,
                        offset: const Offset(0, 5),
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
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(9),
                          gradient: const LinearGradient(
                            colors: [_managerBlue, _managerCyan],
                          ),
                        ),
                        child: const Icon(
                          Icons.groups_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'Вход бригадира',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'После входа откроются доступные разделы.',
                        style: TextStyle(
                          color: _managerMuted,
                          height: 1.2,
                          fontSize: 11,
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: loginController,
                        keyboardType: TextInputType.phone,
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(
                            RegExp(r'[0-9+\s()-]'),
                          ),
                        ],
                        decoration: _managerInputDecoration(
                          'Логин',
                          Icons.alternate_email_rounded,
                        ).copyWith(
                          prefixText: '+996 ',
                          helperText: 'Введите номер без кода страны',
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: passwordController,
                        obscureText: true,
                        decoration: _managerInputDecoration(
                          'Пароль',
                          Icons.lock_outline_rounded,
                        ),
                      ),
                      if (widget.errorText != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          widget.errorText!,
                          style: const TextStyle(color: Color(0xFFB91C1C)),
                          textAlign: TextAlign.left,
                        ),
                      ],
                      const SizedBox(height: 6),
                      FilledButton(
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(38),
                          backgroundColor: _managerBlue,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(9),
                          ),
                        ),
                        onPressed: widget.isSubmitting
                            ? null
                            : () => widget.onSubmit(
                                  loginController.text.trim(),
                                  passwordController.text,
                                ),
                        child: Text(widget.isSubmitting ? 'Вход...' : 'Войти'),
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

class ManagerMetric extends StatelessWidget {
  const ManagerMetric({
    super.key,
    required this.title,
    required this.value,
    required this.icon,
    required this.colorA,
    required this.colorB,
    this.onTap,
  });

  final String title;
  final String value;
  final IconData icon;
  final Color colorA;
  final Color colorB;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(9),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.95),
            borderRadius: BorderRadius.circular(9),
            boxShadow: [
              BoxShadow(
                color: _managerText.withValues(alpha: 0.04),
                blurRadius: 9,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  gradient: LinearGradient(colors: [colorA, colorB]),
                ),
                child: Row(
                  children: [
                    Icon(icon, color: Colors.white, size: 13),
                    const SizedBox(width: 4),
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          value,
                          maxLines: 1,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 5),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        color: _managerMuted,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (onTap != null)
                    Icon(
                      Icons.arrow_forward_rounded,
                      color: _managerMuted.withValues(alpha: 0.7),
                      size: 13,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ManagerInfoCard extends StatelessWidget {
  const ManagerInfoCard({
    super.key,
    required this.title,
    required this.lines,
    this.icon,
  });

  final String title;
  final List<String> lines;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(10),
        boxShadow: [
          BoxShadow(
            color: _managerText.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 4),
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
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: _managerBlue.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Icon(icon, color: _managerBlue, size: 13),
                ),
                const SizedBox(width: 6),
              ],
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w800),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          ...lines.map(
            (line) => Padding(
              padding: const EdgeInsets.only(bottom: 1),
              child: Text(
                line,
                style: const TextStyle(
                  color: Color(0xFF475569),
                  height: 1.08,
                  fontSize: 12,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ManagerHero extends StatelessWidget {
  const _ManagerHero({
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0F172A), Color(0xFF1D4ED8)],
        ),
        boxShadow: [
          BoxShadow(
            color: _managerBlue.withValues(alpha: 0.14),
            blurRadius: 12,
            offset: const Offset(0, 4),
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
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    height: 1.05,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white70),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 38,
            height: 30,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
            ),
            alignment: Alignment.center,
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

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            color: _managerMuted,
            fontSize: 9,
            fontWeight: FontWeight.w800,
            letterSpacing: 1,
          ),
        ),
        const SizedBox(height: 3),
        Text(
          label,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

InputDecoration _managerInputDecoration(String label, IconData icon) {
  return InputDecoration(
    labelText: label,
    prefixIcon: Icon(icon, color: _managerMuted, size: 16),
    filled: true,
    fillColor: Colors.white.withValues(alpha: 0.92),
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: _managerText.withValues(alpha: 0.08)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: BorderSide(color: _managerText.withValues(alpha: 0.08)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(8),
      borderSide: const BorderSide(color: _managerBlue, width: 1.5),
    ),
  );
}

String _managerUserError(Object error) {
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
  if (normalized.contains('manager api failed') ||
      normalized.contains('request failed')) {
    return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
  }
  if (normalized.contains('payload too large')) {
    return 'Файл слишком большой. Уменьшите фото и попробуйте снова.';
  }
  if (normalized.contains('forbidden') ||
      normalized.contains('insufficient role')) {
    return 'Недостаточно прав для этого действия.';
  }
  if (normalized.contains('not found')) {
    return 'Запись не найдена или уже удалена.';
  }
  return message.isEmpty
      ? 'Не удалось выполнить действие. Попробуйте ещё раз.'
      : message;
}

// Completed incidents remain available as read-only history.
bool _managerIncidentIsArchived(String status) =>
    const {'closed', 'resolved', 'archived'}.contains(status);

class _ManagerIncidentArchiveToggle extends StatelessWidget {
  const _ManagerIncidentArchiveToggle({
    required this.showArchive,
    required this.onChanged,
  });

  final bool showArchive;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      children: [
        ChoiceChip(
          label: const Text('Активные'),
          selected: !showArchive,
          onSelected: (_) => onChanged(false),
        ),
        ChoiceChip(
          label: const Text('Архив'),
          selected: showArchive,
          onSelected: (_) => onChanged(true),
        ),
      ],
    );
  }
}

List<String> _managerIncidentHistoryLines(
  List<ManagerIncidentStatusHistoryDto> history,
) {
  if (history.isEmpty) {
    return const ['История смены статусов не записана'];
  }
  return [
    'История статусов:',
    ...history.map((entry) {
      final stage = entry.serviceStage;
      final label = [
        _managerStatusLabel(entry.status),
        if (stage != null && stage.isNotEmpty) _managerServiceStageLabel(stage),
      ].join(' / ');
      return '$label: ${_managerDateTimeLabel(entry.changedAt)}';
    }),
  ];
}


class _ManagerLoadError extends StatelessWidget {
  const _ManagerLoadError({required this.error, required this.onRetry});
  final Object? error;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(child: Padding(
    padding: const EdgeInsets.all(20),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text('Не удалось загрузить данные. ${_managerUserError(error ?? 'Ошибка соединения')}', textAlign: TextAlign.center),
      const SizedBox(height: 12),
      FilledButton(onPressed: onRetry, child: const Text('Повторить')),
    ]),
  ));
}
