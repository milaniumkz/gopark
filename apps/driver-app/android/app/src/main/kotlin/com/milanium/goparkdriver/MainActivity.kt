package com.milanium.goparkdriver

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val channel = NotificationChannel(
            "gopark_alerts",
            "GoPark уведомления",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Чаты, статусы, заявки и срочные события GoPark"
            enableVibration(true)
        }

        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }
}
