package com.example.app;

import android.content.Intent;
import android.os.Bundle;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ✅ Register plugin once
        registerPlugin(AuthStorePlugin.class);

        // 🔁 Start tracking service whenever app opens
        Intent serviceIntent = new Intent(this, TrackingService.class);
        ContextCompat.startForegroundService(this, serviceIntent);
    }

    // ✅ Required for OAuth deep link when activity is singleTask/singleTop
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }
}
