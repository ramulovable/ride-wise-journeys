package com.shahintravels.driver;

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

    private void startRinging() {
        try {
            Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            player = new MediaPlayer();
            player.setDataSource(this, ringtone);
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception ignored) {
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

    private void stopRinging() {
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
