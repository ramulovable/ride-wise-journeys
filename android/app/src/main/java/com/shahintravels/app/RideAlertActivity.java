package com.shahintravels.app;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Call-style full screen ride alert. Turns the screen on over the lock screen,
 * rings, and lets the driver jump straight into the ride or dismiss it.
 */
public class RideAlertActivity extends AppCompatActivity {

    public static final String EXTRA_RIDE_ID = "ride_id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_PATH = "path";

    private MediaPlayer player;
    private Vibrator vibrator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showOverLockScreen();
        setContentView(R.layout.activity_ride_alert);

        String rideId = getIntent().getStringExtra(EXTRA_RIDE_ID);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        String body = getIntent().getStringExtra(EXTRA_BODY);
        String path = getIntent().getStringExtra(EXTRA_PATH);
        final String target = (path == null || path.isEmpty()) ? "/rider" : path;

        ((TextView) findViewById(R.id.alert_title)).setText(title == null ? "New ride request" : title);
        ((TextView) findViewById(R.id.alert_body)).setText(body == null ? "" : body);

        startRinging();

        Button accept = findViewById(R.id.alert_accept);
        Button decline = findViewById(R.id.alert_decline);

        accept.setOnClickListener(v -> {
            stopRinging();
            Intent open = new Intent(this, MainActivity.class);
            String suffix = (rideId == null || rideId.isEmpty())
                ? ""
                : (target.contains("?") ? "&" : "?") + "ride_alert=" + rideId;
            open.putExtra(MainActivity.EXTRA_TARGET_PATH, target + suffix);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(open);
            dismissNotification();
            finish();
        });

        decline.setOnClickListener(v -> {
            stopRinging();
            dismissNotification();
            finish();
        });
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguard = getSystemService(KeyguardManager.class);
            if (keyguard != null) keyguard.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
    }

    private android.speech.tts.TextToSpeech tts;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private int savedAlarmVolume = -1;
    private boolean ringing = false;
    private String spokenText = "Shahin Travels. Nayi ride request aayi hai. Kripya jaldi accept karein.";

    private static final AudioAttributes ALARM_ATTRS = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();

    /** Rings on the ALARM stream at full volume so it is heard even on silent / vibrate. */
    private void startRinging() {
        ringing = true;
        try {
            android.media.AudioManager am = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
            if (am != null) {
                savedAlarmVolume = am.getStreamVolume(android.media.AudioManager.STREAM_ALARM);
                am.setStreamVolume(android.media.AudioManager.STREAM_ALARM,
                    am.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM), 0);
            }
        } catch (Throwable ignored) {
        }

        try {
            Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (ringtone == null) ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            player = new MediaPlayer();
            player.setDataSource(this, ringtone);
            player.setAudioAttributes(ALARM_ATTRS);
            player.setLooping(true);
            player.setVolume(0.35f, 0.35f);
            player.prepare();
            player.start();
        } catch (Exception ignored) {
        }

        String body = getIntent().getStringExtra(EXTRA_BODY);
        if (body != null && !body.isEmpty()) {
            spokenText = "Shahin Travels. Nayi ride request aayi hai. " + body.replace("•", ",").replace("Rs", "rupaye")
                + ". Kripya jaldi accept karein.";
        }
        try {
            tts = new android.speech.tts.TextToSpeech(this, status -> {
                if (status != android.speech.tts.TextToSpeech.SUCCESS || tts == null) return;
                try {
                    int r = tts.setLanguage(new java.util.Locale("hi", "IN"));
                    if (r < 0) tts.setLanguage(java.util.Locale.ENGLISH);
                    tts.setAudioAttributes(ALARM_ATTRS);
                } catch (Throwable ignored) {
                }
                speakLoop();
            });
        } catch (Throwable ignored) {
        }

        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        long[] pattern = new long[] { 0, 700, 400, 700, 400 };
        if (vibrator != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }
    }

    /** Repeats the voice announcement every few seconds while the alert is open. */
    private void speakLoop() {
        if (!ringing || tts == null) return;
        try {
            tts.speak(spokenText, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "ride");
        } catch (Throwable ignored) {
        }
        handler.postDelayed(this::speakLoop, 9000);
    }

    private void stopRinging() {
        ringing = false;
        handler.removeCallbacksAndMessages(null);
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Throwable ignored) {
            }
            tts = null;
        }
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception ignored) {
            }
            player = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
        if (savedAlarmVolume >= 0) {
            try {
                android.media.AudioManager am = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
                if (am != null) am.setStreamVolume(android.media.AudioManager.STREAM_ALARM, savedAlarmVolume, 0);
            } catch (Throwable ignored) {
            }
            savedAlarmVolume = -1;
        }
    }

    private void dismissNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(1001);
    }

    @Override
    protected void onDestroy() {
        stopRinging();
        super.onDestroy();
    }
}
