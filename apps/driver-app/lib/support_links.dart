import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class SupportLinks extends StatelessWidget {
  const SupportLinks({super.key});

  Future<void> _open(BuildContext context, String page) async {
    try {
      final opened = await launchUrl(
        Uri.parse('https://185.138.185.36/$page.html'),
        mode: LaunchMode.externalApplication,
      );
      if (opened) return;
    } catch (_) {
      // Keep contact details available when no browser can open the page.
    }
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content:
              Text('Поддержка GoPark: milaniumkz@yandex.kz · +77086362153'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => Wrap(
        alignment: WrapAlignment.center,
        children: [
          TextButton(
            onPressed: () => _open(context, 'privacy'),
            child: const Text('Конфиденциальность'),
          ),
          TextButton(
            onPressed: () => _open(context, 'support'),
            child: const Text('Поддержка'),
          ),
        ],
      );
}
