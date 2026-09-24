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

    @android.webkit.JavascriptInterface
    public boolean isNativeApp() {
        return true;
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
}
