package com.example.app;

import android.content.Intent;
import android.os.Bundle;

import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SilentSpeechPlugin.class);
        registerPlugin(AudioRecorderPlugin.class);
        super.onCreate(savedInstanceState);

        // 🔁 Ensure tracking service is running whenever app is opened
        Intent serviceIntent = new Intent(this, TrackingService.class);
        ContextCompat.startForegroundService(this, serviceIntent);
    }
}
