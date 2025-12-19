package com.example.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "AuthStore")
public class AuthStorePlugin extends Plugin {

    private static final String PREFS_AUTH = "auth";
    private static final String KEY_ACCESS_TOKEN = "access_token";
    private static final String KEY_REFRESH_TOKEN = "refresh_token";

    @PluginMethod
    public void setTokens(PluginCall call) {
        String accessToken = call.getString("accessToken");
        String refreshToken = call.getString("refreshToken");

        if (accessToken == null || accessToken.trim().isEmpty()) {
            call.reject("accessToken is required");
            return;
        }

        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_AUTH, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(KEY_ACCESS_TOKEN, accessToken);

        if (refreshToken != null) {
            editor.putString(KEY_REFRESH_TOKEN, refreshToken);
        }
        editor.apply();

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_AUTH, Context.MODE_PRIVATE);
        prefs.edit().clear().apply();

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getAccessToken(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_AUTH, Context.MODE_PRIVATE);
        String token = prefs.getString(KEY_ACCESS_TOKEN, null);

        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        call.resolve(ret);
    }
}
