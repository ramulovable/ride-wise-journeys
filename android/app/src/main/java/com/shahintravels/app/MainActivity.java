package com.shahintravels.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {

    public static final String EXTRA_TARGET_PATH = "target_path";
    private static final String SITE = "https://shahintravels.app";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        RideAlertNotifier.createChannels(this);
        publishPushToken();
        handleTargetPath(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleTargetPath(intent);
    }

    /** Opens a specific in-app screen when the user taps a ride alert. */
    private void handleTargetPath(Intent intent) {
        if (intent == null) return;
        final String path = intent.getStringExtra(EXTRA_TARGET_PATH);
        if (path == null || path.isEmpty()) return;
        final WebView webView = getBridge().getWebView();
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.loadUrl(SITE + path);
            }
        });
    }

    /**
     * Hands the native FCM token to the web app so it can be stored against the
     * signed-in driver exactly like the web push token.
     */
    private void publishPushToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) return;
            final String token = task.getResult();
            final WebView webView = getBridge().getWebView();
            webView.post(() -> webView.evaluateJavascript(
                "window.__shahinNativePushToken=" + JSONUtil.quote(token) +
                    ";window.dispatchEvent(new Event('shahin-native-push-token'));",
                null
            ));
        });
    }
}
