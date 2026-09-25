package com.shahintravels.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;

import androidx.core.app.NotificationCompat;

import java.util.Locale;

/**
 * Background voice alert for a ride offer. Runs as a foreground service so it
 * keeps speaking while the phone is locked or the app is closed. Uses the ALARM
 * stream at full volume so it is heard on silent / vibrate. Repeats pickup,
 * drop and fare until the driver accepts / declines, the web app says the offer
 * ended, or the offer times out.
 */
public class RideVoiceService extends Service {

    public static final String ACTION_START = "com.shahintravels.app.VOICE_START";
    public static final String ACTION_STOP = "com.shahintravels.app.VOICE_STOP";
    public static final String EXTRA_TEXT = "text";
    public static final String EXTRA_TIMEOUT = "timeout_sec";
    private static final int NOTIFICATION_ID = 1001;
    private static final long REPEAT_MS = 7000;

    private static final AudioAttributes ALARM_ATTRS = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build();

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private int savedAlarmVolume = -1;
    private boolean running = false;
    private String spokenText = "Shahin Travels. Nayi ride request aayi hai.";

    public static void start(Context context, String text, int timeoutSec, Notification notification) {
        pendingNotification = notification;
        Intent i = new Intent(context, RideVoiceService.class);
        i.setAction(ACTION_START);
        i.putExtra(EXTRA_TEXT, text);
        i.putExtra(EXTRA_TIMEOUT, timeoutSec);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(i);
        else context.startService(i);
    }

    public static void stop(Context context) {
        try {
            Intent i = new Intent(context, RideVoiceService.class);
            i.setAction(ACTION_STOP);
            context.startService(i);
        } catch (Throwable ignored) {
            context.stopService(new Intent(context, RideVoiceService.class));
        }
    }

    private static Notification pendingNotification;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        Notification n = pendingNotification != null ? pendingNotification : fallbackNotification();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Throwable ignored) {
        }

        if (ACTION_STOP.equals(action) || intent == null) {
            shutdown();
            return START_NOT_STICKY;
        }

        String text = intent.getStringExtra(EXTRA_TEXT);
        if (text != null && !text.isEmpty()) spokenText = text;
        int timeout = intent.getIntExtra(EXTRA_TIMEOUT, 60);
        if (timeout < 15 || timeout > 300) timeout = 60;

        stopSound();
        begin();
        handler.postDelayed(this::shutdown, timeout * 1000L);
        return START_NOT_STICKY;
    }

    private Notification fallbackNotification() {
        RideAlertNotifier.createChannels(this);
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 3003, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, RideAlertNotifier.RIDE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle("Nayi ride request")
            .setContentIntent(pi)
            .setSilent(true)
            .build();
    }

    private void begin() {
        running = true;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "shahin:ridevoice");
                wakeLock.acquire(5 * 60 * 1000L);
            }
        } catch (Throwable ignored) {
        }
        try {
            AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
            if (am != null) {
                savedAlarmVolume = am.getStreamVolume(AudioManager.STREAM_ALARM);
                am.setStreamVolume(AudioManager.STREAM_ALARM, am.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0);
            }
        } catch (Throwable ignored) {
        }
        try {
            Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (tone == null) tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            player = new MediaPlayer();
            player.setDataSource(this, tone);
            player.setAudioAttributes(ALARM_ATTRS);
            player.setLooping(true);
            player.setVolume(0.25f, 0.25f);
            player.prepare();
            player.start();
        } catch (Throwable ignored) {
        }
        try {
            vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            long[] pattern = new long[] { 0, 800, 400, 800, 400 };
            if (vibrator != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0), ALARM_ATTRS);
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Throwable ignored) {
        }
        try {
            tts = new TextToSpeech(getApplicationContext(), status -> {
                if (status != TextToSpeech.SUCCESS || tts == null) return;
                try {
                    int r = tts.setLanguage(new Locale("hi", "IN"));
                    if (r < 0) tts.setLanguage(Locale.ENGLISH);
                    tts.setAudioAttributes(ALARM_ATTRS);
                    tts.setSpeechRate(0.95f);
                } catch (Throwable ignored) {
                }
                speakLoop();
            });
        } catch (Throwable ignored) {
        }
    }

    private void speakLoop() {
        if (!running || tts == null) return;
        try {
            android.os.Bundle params = new android.os.Bundle();
            params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_ALARM);
            params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
            tts.speak(spokenText, TextToSpeech.QUEUE_FLUSH, params, "ride");
        } catch (Throwable ignored) {
        }
        handler.postDelayed(this::speakLoop, REPEAT_MS + spokenText.length() * 60L);
    }

    private void stopSound() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Throwable ignored) { }
            tts = null;
        }
        if (player != null) {
            try { player.stop(); player.release(); } catch (Throwable ignored) { }
            player = null;
        }
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Throwable ignored) { }
            vibrator = null;
        }
        if (savedAlarmVolume >= 0) {
            try {
                AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
                if (am != null) am.setStreamVolume(AudioManager.STREAM_ALARM, savedAlarmVolume, 0);
            } catch (Throwable ignored) { }
            savedAlarmVolume = -1;
        }
        if (wakeLock != null) {
            try { if (wakeLock.isHeld()) wakeLock.release(); } catch (Throwable ignored) { }
            wakeLock = null;
        }
    }

    private void shutdown() {
        stopSound();
        pendingNotification = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Throwable ignored) { }
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopSound();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
