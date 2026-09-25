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

        if ("ride_taken".equals(type) || "ride_cancelled".equals(type) || "ride_expired".equals(type)) {
            RideVoiceService.stop(this);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.cancel(1001);
            return;
        }

        boolean isRideOffer = "ride_offer".equals(type) || data.containsKey("ride_id");
        if (isRideOffer) {
            showRideAlert(data, data.get("ride_id"), title, body, data.get("path"));
        } else {
            showSimple(title, body, data.get("path"));
        }
    }

    /** Builds the Hindi (Devanagari) announcement with pickup, drop and fare. */
    private static String buildSpeech(Map<String, String> data, String body) {
        String pickup = data.get("pickup");
        String drop = data.get("drop");
        if (drop == null) drop = data.get("destination");
        String fare = data.get("fare");
        StringBuilder sb = new StringBuilder("शाहीन ट्रैवल्स। नई राइड रिक्वेस्ट आई है। ");
        if (pickup != null && !pickup.isEmpty()) {
            sb.append("पिकअप, ").append(pickup).append("। ");
            if (drop != null && !drop.isEmpty()) sb.append("ड्रॉप, ").append(drop).append("। ");
            if (fare != null && !fare.isEmpty()) {
                sb.append("किराया ").append(fare.replace("₹", "").trim()).append(" रुपये। ");
            }
        } else if (body != null && !body.isEmpty()) {
            sb.append(body.replace("•", ",").replace("→", " से ").replace("₹", "").replace("Rs", "रुपये")).append("। ");
        }
        sb.append("राइड स्वीकार करने के लिए स्क्रीन दबाएं।");
        return sb.toString();
    }


    private void showRideAlert(Map<String, String> data, String rideId, String title, String body, String path) {
        Intent full = new Intent(this, RideAlertActivity.class);
        full.putExtra(RideAlertActivity.EXTRA_RIDE_ID, rideId == null ? "" : rideId);
        full.putExtra(RideAlertActivity.EXTRA_TITLE, title);
        full.putExtra(RideAlertActivity.EXTRA_BODY, body);
        full.putExtra(RideAlertActivity.EXTRA_PATH, path == null ? "/rider" : path);
        full.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent fullScreen = PendingIntent.getActivity(
            this, 1001, full, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, RideAlertNotifier.RIDE_VOICE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSilent(true)
            .setAutoCancel(true)
            .setOngoing(true)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .build();

        int timeout = 60;
        try {
            String t = data.get("timeout");
            if (t == null) t = data.get("expires_in");
            if (t != null) timeout = Integer.parseInt(t.trim());
        } catch (Throwable ignored) {
        }

        boolean voiceStarted = false;
        try {
            RideVoiceService.start(this, buildSpeech(data, body), timeout, notification);
            voiceStarted = true;
        } catch (Throwable ignored) {
        }
        if (!voiceStarted) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(1001, notification);
        }

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
