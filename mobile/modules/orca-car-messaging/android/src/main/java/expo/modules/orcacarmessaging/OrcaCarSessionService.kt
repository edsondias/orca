package expo.modules.orcacarmessaging

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

// Keeps the process, and with it the JS runtime and the host socket, alive while the car session runs.
class OrcaCarSessionService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    CarNotificationPublisher(this).ensureChannel()
    val notification = NotificationCompat.Builder(this, CAR_CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Orca in the car")
      .setOngoing(true)
      .setSilent(true)
      .build()
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0
    ServiceCompat.startForeground(this, ONGOING_NOTIFICATION_ID, notification, type)
    return START_STICKY
  }

  companion object {
    const val ONGOING_NOTIFICATION_ID = 0x0CA4
  }
}
