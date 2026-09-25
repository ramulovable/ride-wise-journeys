package com.shahintravels.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import java.io.File;

/**
 * Downloads a new APK inside the app (no browser, no visible file in the user's
 * Downloads folder) and hands it to Android's package installer, so the update
 * lands straight on top of the installed app.
 */
public class AppUpdater {

    private static final String TAG = "ShahinTravels";
    private static final String FILE_NAME = "ShahinTravels-update.apk";

    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private long downloadId = -1L;
    private int progress = 0;
    private String state = "idle"; // idle | downloading | installing | error

    public AppUpdater(Activity activity) {
        this.activity = activity;
    }

    public String getState() {
        return state;
    }

    public int getProgress() {
        return progress;
    }

    /** Starts the in-app download. Safe to call again after an error. */
    public void start(String url) {
        if (url == null || url.isEmpty()) {
            state = "error";
            return;
        }
        if ("downloading".equals(state)) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
                // Ask once for "install unknown apps", then the user taps update again.
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
                state = "permission";
                return;
            }

            File target = new File(
                activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME);
            if (target.exists() && !target.delete()) {
                Log.w(TAG, "Could not remove old update file");
            }

            DownloadManager manager =
                (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                state = "error";
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Shahin Travels update");
            request.setDescription("Naya version download ho raha hai");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalFilesDir(
                activity, Environment.DIRECTORY_DOWNLOADS, FILE_NAME);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);

            downloadId = manager.enqueue(request);
            progress = 0;
            state = "downloading";
            handler.postDelayed(this::poll, 700);
        } catch (Throwable t) {
            Log.w(TAG, "update download failed", t);
            state = "error";
        }
    }

    private void poll() {
        if (downloadId < 0) return;
        try {
            DownloadManager manager =
                (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                state = "error";
                return;
            }
            Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(downloadId));
            if (cursor == null || !cursor.moveToFirst()) {
                if (cursor != null) cursor.close();
                state = "error";
                return;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long done = cursor.getLong(
                cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(
                cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            cursor.close();

            if (total > 0) {
                progress = (int) Math.min(100, (done * 100) / total);
            }

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                progress = 100;
                state = "installing";
                install();
                return;
            }
            if (status == DownloadManager.STATUS_FAILED) {
                state = "error";
                return;
            }
            handler.postDelayed(this::poll, 700);
        } catch (Throwable t) {
            Log.w(TAG, "update poll failed", t);
            state = "error";
        }
    }

    private void install() {
        try {
            File file = new File(
                activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME);
            if (!file.exists()) {
                state = "error";
                return;
            }
            Uri uri = FileProvider.getUriForFile(
                activity, activity.getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
            state = "idle";
            downloadId = -1L;
        } catch (Throwable t) {
            Log.w(TAG, "install failed", t);
            state = "error";
        }
    }
}
