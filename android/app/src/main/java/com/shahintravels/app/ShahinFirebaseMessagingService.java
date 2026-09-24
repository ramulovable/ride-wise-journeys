package com.shahintravels.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives ride dispatch pushes. Ride offers open a full-screen, lock-screen
 * Accept / Decline alert; anything else shows a normal notification.
 */
public class ShahinFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences("shahin", MODE_PRIVATE).edit().putString("fcm_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        RideAlertNotifier.createChannels(this);
        Map<String, String> data = message.getData();
        String type = data.get("type");
        String title = data.containsKey("title") ? data.get("title") : "Shahin Travels";
        String body = data.containsKey("body") ? data.get("body") : "";
        if (message.getNotification() != null) {
            if (message.getNotification().getTitle() != null) title = message.getNotification().getTitle();
            if (message.getNotification().getBody() != null) body = message.getNotification().getBody();
        }

        boolean isRideOffer = "ride_offer".equals(type) || data.containsKey("ride_id");
        if (isRideOffer) {
            showRideAlert(data.get("ride_id"), title, body, data.get("path"));
        } else {
            showSimple(title, body, data.get("path"));
        }
    }

    private void showRideAlert(String rideId, String title, String body, String path) {
        Intent full = new Intent(this, RideAlertActivity.class);
        full.putExtra(RideAlertActivity.EXTRA_RIDE_ID, rideId == null ? "" : rideId);
        full.putExtra(RideAlertActivity.EXTRA_TITLE, title);
        full.putExtra(RideAlertActivity.EXTRA_BODY, body);
        full.putExtra(RideAlertActivity.EXTRA_PATH, path == null ? "/rider" : path);
        full.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent fullScreen = PendingIntent.getActivity(
            this, 1001, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, RideAlertNotifier.RIDE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(false)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .build();

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(1001, notification);

        // Wake the screen so the alert is visible even when the phone is locked.
        try {
            android.os.PowerManager pm = getSystemService(android.os.PowerManager.class);
            if (pm != null) {
                @SuppressWarnings("deprecation")
                android.os.PowerManager.WakeLock wl = pm.newWakeLock(
                    android.os.PowerManager.FULL_WAKE_LOCK
                        | android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP
                        | android.os.PowerManager.ON_AFTER_RELEASE,
                    "shahin:ridealert");
                wl.acquire(10_000);
            }
        } catch (Throwable ignored) {
        }

        // Launch the call-style screen directly when allowed (older Android, or
        // "Appear on top" granted), instead of relying only on the banner.
        boolean canLaunch = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && android.provider.Settings.canDrawOverlays(this));
        if (canLaunch) {
            try {
                startActivity(full);
            } catch (Throwable ignored) {
            }
        }
    }

    private void showSimple(String title, String body, String path) {
        Intent open = new Intent(this, MainActivity.class);
        open.putExtra(MainActivity.EXTRA_TARGET_PATH, path == null ? "/" : path);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent intent = PendingIntent.getActivity(
            this, 2002, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, RideAlertNotifier.GENERAL_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(intent)
            .build();

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify((int) (System.currentTimeMillis() % 100000), notification);
    }
}
