package com.shahintravels.driver;

import org.json.JSONObject;

/** Tiny helper to safely embed a string in injected JavaScript. */
public final class JSONUtil {
    private JSONUtil() {}

    public static String quote(String value) {
        return JSONObject.quote(value == null ? "" : value);
    }
}
