package com.shahintravels.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Bridge exposed to the web app as `window.ShahinNative`. Lets the driver
 * dashboard read and request the three settings a call-style lock screen ride
 * alert needs: notifications, appear on top, and unrestricted battery.
 */
public class NativePermissions {

    private static final String TAG = "ShahinTravels";
    private final Activity activity;
    private final AppUpdater updater;

    public NativePermissions(Activity activity) {
        this.activity = activity;
        this.updater = new AppUpdater(activity);
    }

    /** Stops the background voice ride alert (offer accepted, declined, taken or expired). */
    @android.webkit.JavascriptInterface
    public void stopRideAlert() {
        RideVoiceService.stop(activity.getApplicationContext());
        android.app.NotificationManager nm = activity.getSystemService(android.app.NotificationManager.class);
        if (nm != null) nm.cancel(1001);
    }

    /** Downloads the new APK inside the app and opens the system installer. */
    @android.webkit.JavascriptInterface
    public void installUpdate(String url) {
        activity.runOnUiThread(() -> updater.start(url));
    }

    /** "idle", "downloading", "installing" or "error". */
    @android.webkit.JavascriptInterface
    public String updateState() {
        return updater.getState();
    }

    /** Download progress 0-100. */
    @android.webkit.JavascriptInterface
    public int updateProgress() {
        return updater.getProgress();
    }

    /** Saves a base64 PDF into the phone's Downloads folder and opens it. Returns "ok" or an error. */
    @android.webkit.JavascriptInterface
    public String savePdf(String base64, String fileName) {
        try {
            byte[] bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
            Uri uri;
            if (Build.VERSION.SDK_INT >= 29) {
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                cv.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
                cv.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS);
                uri = activity.getContentResolver().insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) return "error";
                try (java.io.OutputStream os = activity.getContentResolver().openOutputStream(uri)) { os.write(bytes); }
            } else {
                java.io.File dir = activity.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
                java.io.File f = new java.io.File(dir, fileName);
                try (java.io.FileOutputStream os = new java.io.FileOutputStream(f)) { os.write(bytes); }
                uri = androidx.core.content.FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", f);
            }
            final Uri open = uri;
            try {
                android.app.NotificationManager nm = activity.getSystemService(android.app.NotificationManager.class);
                if (Build.VERSION.SDK_INT >= 26 && nm != null) {
                    nm.createNotificationChannel(new android.app.NotificationChannel(
                            "downloads", "Downloads", android.app.NotificationManager.IMPORTANCE_HIGH));
                }
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(open, "application/pdf");
                view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                android.app.PendingIntent pi = android.app.PendingIntent.getActivity(activity,
                        (int) (System.currentTimeMillis() & 0xffff), view,
                        android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
                androidx.core.app.NotificationCompat.Builder nb = new androidx.core.app.NotificationCompat.Builder(activity, "downloads")
                        .setSmallIcon(android.R.drawable.stat_sys_download_done)
                        .setContentTitle("Download complete")
                        .setContentText(fileName + " — open karne ke liye tap karein")
                        .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                        .setContentIntent(pi)
                        .setAutoCancel(true);
                if (nm != null) nm.notify((int) (System.currentTimeMillis() & 0xfffff), nb.build());
            } catch (Throwable n) { Log.w(TAG, "pdf notify failed", n); }
            activity.runOnUiThread(() ->
                android.widget.Toast.makeText(activity, "PDF Downloads me save ho gaya", android.widget.Toast.LENGTH_LONG).show());
            return "ok";
        } catch (Throwable t) {
            Log.w(TAG, "savePdf failed", t);
            return "error";
        }
    }

    @android.webkit.JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }

    public static final int VOICE_REQUEST = 4021;

    /** Opens Android's speech recognizer; result goes to window event "shahin-voice-result". */
    @android.webkit.JavascriptInterface
    public void startVoiceSearch(String lang) {
        activity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                String l = (lang == null || lang.isEmpty()) ? "hi-IN" : lang;
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, l);
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Jagah ka naam boliye");
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                activity.startActivityForResult(intent, VOICE_REQUEST);
            } catch (Throwable t) {
                Log.w(TAG, "startVoiceSearch failed", t);
                if (activity instanceof MainActivity) ((MainActivity) activity).sendVoiceResult("");
            }
        });
    }

    /** Version name of the installed app, e.g. "1.0.0". */
    @android.webkit.JavascriptInterface
    public String appVersionName() {
        try {
            return activity.getPackageManager()
                .getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Throwable t) {
            Log.w(TAG, "appVersionName failed", t);
            return "";
        }
    }

    /** Opens a download link (new APK) in the phone browser. */
    @android.webkit.JavascriptInterface
    public void openExternal(String url) {
        try {
            if (url == null || url.isEmpty()) return;
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "openExternal failed", t);
        }
    }

    @android.webkit.JavascriptInterface
    public boolean notificationsEnabled() {
        try {
            return NotificationManagerCompat.from(activity).areNotificationsEnabled();
        } catch (Throwable t) {
            Log.w(TAG, "notificationsEnabled failed", t);
            return false;
        }
    }

    @android.webkit.JavascriptInterface
    public boolean overlayEnabled() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
            return Settings.canDrawOverlays(activity);
        } catch (Throwable t) {
            Log.w(TAG, "overlayEnabled failed", t);
            return false;
        }
    }

    @android.webkit.JavascriptInterface
    public boolean batteryUnrestricted() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
            PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
            return pm != null && pm.isIgnoringBatteryOptimizations(activity.getPackageName());
        } catch (Throwable t) {
            Log.w(TAG, "batteryUnrestricted failed", t);
            return false;
        }
    }

    @android.webkit.JavascriptInterface
    public void requestNotifications() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    activity, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 3011);
                return;
            }
            if (!notificationsEnabled()) openNotificationSettings();
        } catch (Throwable t) {
            Log.w(TAG, "requestNotifications failed", t);
        }
    }

    @android.webkit.JavascriptInterface
    public void openNotificationSettings() {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
            } else {
                intent = appDetailsIntent();
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "openNotificationSettings failed", t);
        }
    }

    @android.webkit.JavascriptInterface
    public void requestOverlay() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + activity.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "requestOverlay failed", t);
            openAppSettings();
        }
    }

    @android.webkit.JavascriptInterface
    @SuppressWarnings("BatteryLife")
    public void requestBattery() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            Intent intent = new Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + activity.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "requestBattery failed", t);
            openAppSettings();
        }
    }

    @android.webkit.JavascriptInterface
    public void openAppSettings() {
        try {
            Intent intent = appDetailsIntent();
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "openAppSettings failed", t);
        }
    }

    private Intent appDetailsIntent() {
        return new Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + activity.getPackageName()));
    }

    /** Watches a setting after opening it; once granted, brings the app back to the front. */
    private void watchAndReturn(final String key) {
        final android.os.Handler h = new android.os.Handler(android.os.Looper.getMainLooper());
        final long until = System.currentTimeMillis() + 120000;
        h.postDelayed(new Runnable() {
            @Override
            public void run() {
                boolean ok = "overlay".equals(key) ? overlayEnabled()
                    : "battery".equals(key) ? batteryUnrestricted()
                    : notificationsEnabled();
                if (ok) {
                    try {
                        Intent back = new Intent(activity, MainActivity.class);
                        back.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                            | Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                        activity.startActivity(back);
                    } catch (Throwable t) {
                        Log.w(TAG, "return to app failed", t);
                    }
                    return;
                }
                if (System.currentTimeMillis() < until) h.postDelayed(this, 700);
            }
        }, 1000);
    }
}
