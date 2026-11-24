import 'package:flutter/material.dart';

/// Shared tokens for the approved brigadier design. Text sizes are two points
/// above the prototype; the system accessibility text scale remains respected.
abstract final class ManagerDesign {
  static const background = Color(0xFFF7F8FA);
  static const surface = Colors.white;
  static const text = Color(0xFF19242D);
  static const muted = Color(0xFF77838E);
  static const primary = Color(0xFF216E51);
  static const bright = Color(0xFF008260);
  static const border = Color(0xFFE4EAEE);
  static const orange = Color(0xFFAD6723);
  static const red = Color(0xFFBF5353);
  static const soft = Color(0xFFE7F3EE);

  static ThemeData theme() {
    final colors = ColorScheme.fromSeed(
        seedColor: primary,
        primary: primary,
        secondary: primary,
        surface: surface,
        error: red);
    return ThemeData(
      useMaterial3: true,
      colorScheme: colors,
      scaffoldBackgroundColor: background,
      dividerColor: border,
      textTheme: Typography.material2021()
          .englishLike
          .apply(bodyColor: text, displayColor: text, fontSizeDelta: 2),
      appBarTheme: const AppBarTheme(
          backgroundColor: background,
          foregroundColor: text,
          elevation: 0,
          scrolledUnderElevation: 0,
          titleTextStyle: TextStyle(
              fontSize: 20, fontWeight: FontWeight.w600, color: text)),
      cardTheme: CardThemeData(
          color: surface,
          elevation: 0,
          margin: const EdgeInsets.symmetric(vertical: 8),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(17),
              side: const BorderSide(color: border))),
      inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: surface,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: border)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: border)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: const BorderSide(color: primary, width: 1.5))),
      filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
              minimumSize: const Size(44, 48),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)))),
      outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
              minimumSize: const Size(44, 44),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              side: const BorderSide(color: border),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)))),
      textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(minimumSize: const Size(44, 44))),
      chipTheme: ChipThemeData(
          backgroundColor: surface,
          selectedColor: soft,
          side: const BorderSide(color: border),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          showCheckmark: false),
      navigationBarTheme: NavigationBarThemeData(
          height: 76,
          backgroundColor: surface,
          surfaceTintColor: Colors.transparent,
          indicatorColor: soft,
          labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: s.contains(WidgetState.selected) ? primary : muted))),
      bottomSheetTheme: const BottomSheetThemeData(
          backgroundColor: surface,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)))),
      dialogTheme: DialogThemeData(
          backgroundColor: surface,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
    );
  }
}

class ManagerPanel extends StatelessWidget {
  const ManagerPanel(
      {super.key,
      required this.child,
      this.padding = const EdgeInsets.all(16)});
  final Widget child;
  final EdgeInsetsGeometry padding;
  @override
  Widget build(BuildContext context) => Container(
      padding: padding,
      decoration: BoxDecoration(
          color: ManagerDesign.surface,
          borderRadius: BorderRadius.circular(17),
          border: Border.all(color: ManagerDesign.border)),
      child: child);
}
