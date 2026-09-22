package com.shahintravels.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/** Creates the high-priority, call-style channel used for new ride requests. */
public final class RideAlertNotifier {

    public static final String RIDE_CHANNEL_ID = "shahin_ride_requests";
    public static final String GENERAL_CHANNEL_ID = "shahin_general";

    private RideAlertNotifier() {}

    public static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        NotificationChannel ride = new NotificationChannel(
            RIDE_CHANNEL_ID,
            "New ride requests",
            NotificationManager.IMPORTANCE_HIGH
        );
        ride.setDescription("Full-screen alert when a new ride is offered to you");
        ride.enableVibration(true);
        ride.setVibrationPattern(new long[] { 0, 700, 400, 700, 400, 700 });
        ride.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        ride.setBypassDnd(true);
        Uri ringtone = android.media.RingtoneManager
            .getDefaultUri(android.media.RingtoneManager.TYPE_RINGTONE);
        ride.setSound(ringtone, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
        manager.createNotificationChannel(ride);

        NotificationChannel general = new NotificationChannel(
            GENERAL_CHANNEL_ID,
            "Updates",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        manager.createNotificationChannel(general);
    }
}
