package com.shahintravels.app;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "ShahinTravels";
    public static final String EXTRA_TARGET_PATH = "target_path";
    private static final String SITE = "https://shahintravels.app";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            SplashScreen.installSplashScreen(this);
        } catch (Throwable t) {
            Log.w(TAG, "Splash screen unavailable", t);
        }
        super.onCreate(savedInstanceState);

        try {
            attachNativeBridge();
        } catch (Throwable t) {
            Log.w(TAG, "Native bridge unavailable", t);
        }

        try {
            RideAlertNotifier.createChannels(this);
        } catch (Throwable t) {
            Log.w(TAG, "Notification channels not created", t);
        }


        try {
            publishPushToken();
        } catch (Throwable t) {
            Log.w(TAG, "Push token unavailable (Firebase not configured)", t);
        }

        try {
            handleTargetPath(getIntent());
        } catch (Throwable t) {
            Log.w(TAG, "Could not handle launch intent", t);
        }
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        try {
            handleTargetPath(intent);
        } catch (Throwable t) {
            Log.w(TAG, "Could not handle intent", t);
        }
    }

    /**
     * Exposes the permission helpers to the web app as `window.ShahinNative`.
     * The interface only applies from the next page load, so the first launch
     * reloads the WebView once.
     */
    private static boolean bridgeReloadDone = false;

    private void attachNativeBridge() {
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.addJavascriptInterface(new NativePermissions(this), "ShahinNative");
        if (bridgeReloadDone) return;
        bridgeReloadDone = true;
        webView.post(new Runnable() {
            @Override
            public void run() {
                try {
                    webView.reload();
                } catch (Throwable t) {
                    Log.w(TAG, "Could not reload after bridge attach", t);
                }
            }
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != NativePermissions.VOICE_REQUEST) return;
        String text = "";
        try {
            if (resultCode == RESULT_OK && data != null) {
                java.util.ArrayList<String> r =
                    data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
                if (r != null && !r.isEmpty() && r.get(0) != null) text = r.get(0);
            }
        } catch (Throwable t) {
            Log.w(TAG, "voice result failed", t);
        }
        sendVoiceResult(text);
    }

    /** Sends recognized speech (or "" on cancel) back to the web app. */
    public void sendVoiceResult(String text) {
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        final String js = "window.dispatchEvent(new CustomEvent('shahin-voice-result',{detail:"
            + JSONUtil.quote(text == null ? "" : text) + "}));";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    /** Opens a specific in-app screen when the user taps a ride alert. */

    private void handleTargetPath(Intent intent) {
        if (intent == null) return;
        final String path = intent.getStringExtra(EXTRA_TARGET_PATH);
        if (path == null || path.isEmpty()) return;
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.loadUrl(SITE + path);
            }
        });
    }

    /**
     * Hands the native FCM token to the web app so it can be stored against the
     * signed-in driver exactly like the web push token. Safe no-op when Firebase
     * is not configured in this build.
     */
    private void publishPushToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            try {
                if (!task.isSuccessful() || task.getResult() == null) return;
                final String token = task.getResult();
                if (getBridge() == null) return;
                final WebView webView = getBridge().getWebView();
                if (webView == null) return;
                webView.post(() -> webView.evaluateJavascript(
                    "window.__shahinNativePushToken=" + JSONUtil.quote(token) +
                        ";window.dispatchEvent(new Event('shahin-native-push-token'));",
                    null
                ));
            } catch (Throwable t) {
                Log.w(TAG, "Could not publish push token", t);
            }
        });
    }
}
