package com.example.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.location.Location;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import android.content.SharedPreferences;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.FusedLocationProviderClient;

import java.io.BufferedOutputStream;
import java.io.BufferedWriter;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;

import org.json.JSONObject;

// ⭐ Native always-on tracking service
public class TrackingService extends Service {

    private static final String TAG = "SKY_TRACKING";
    private static final String CHANNEL_ID = "sky_tracking_channel";

    // Backend endpoint for native tracking (must be your real BTP host).
    // Keep this in ONE place and change as needed per landscape.
    private static final String BACKEND_URL =
            "https://nav-it-consulting-gmbh-nav-payg-btp-3oqfixeo-dev-sky-ro70256e00.cfapps.us10-001.hana.ondemand.com/api/tracking/location";

    // SharedPreferences keys for auth token (written by the JS layer after PKCE login)
    private static final String PREFS_AUTH = "auth";
    private static final String KEY_ACCESS_TOKEN = "access_token";

    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private LocationDatabase dbHelper;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "TrackingService onCreate");

        dbHelper = new LocationDatabase(this);

        createNotificationChannel();
        startForeground(1, buildNotification("Tracking active"));

        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        setupLocationUpdates();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "TrackingService onStartCommand");
        // Restart if killed
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "TrackingService onDestroy");
        if (fusedClient != null && locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null; // Not a bound service
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "SKY Tracking",
                    NotificationManager.IMPORTANCE_LOW
            );
            ch.setDescription("Location tracking for SKY app");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("SKY – Tracking")
                .setContentText(text)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .build();
    }

    private void setupLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                && ActivityCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {

            Log.w(TAG, "Location permission not granted – service will wait until granted");
            return;
        }

        LocationRequest request = LocationRequest.create();
        request.setInterval(10_000);            // 10s
        request.setFastestInterval(5_000);      // 5s
        request.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null) return;
                for (Location loc : result.getLocations()) {
                    handleLocation(loc);
                }
            }
        };

        fusedClient.requestLocationUpdates(request, locationCallback, null);
    }

    private void handleLocation(Location location) {
        if (location == null) return;

        Log.d(TAG, "New native location: " + location.getLatitude() + "," + location.getLongitude());

        // 🔹 In real logic, FO + driver should come from shared prefs or backend assignment
        String foId = "UNKNOWN_FO";
        String driverId = "DRIVER_001";

        SQLiteDatabase db = dbHelper.getWritableDatabase();
        ContentValues cv = new ContentValues();
        cv.put("fo_id", foId);
        cv.put("driver_id", driverId);
        cv.put("lat", location.getLatitude());
        cv.put("lng", location.getLongitude());
        cv.put("accuracy", location.getAccuracy());
        cv.put("timestamp", String.valueOf(System.currentTimeMillis()));
        cv.put("synced", 0);
        db.insert(LocationDatabase.TABLE_POINTS, null, cv);

        // Try to sync now if online
        if (isOnline()) {
            new Thread(this::syncPendingLocations).start();
        }
    }

    private boolean isOnline() {
    try {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
            return caps != null &&
                    (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                            || caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
        } else {
            android.net.NetworkInfo info = cm.getActiveNetworkInfo();
            return info != null && info.isConnected();
        }
    } catch (SecurityException e) {
        // If for any reason we don't have permission, just assume offline
        Log.w(TAG, "ACCESS_NETWORK_STATE not granted, treating as offline", e);
        return false;
    }
}

    private void syncPendingLocations() {
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        Cursor c = null;
        try {
            c = db.query(
                    LocationDatabase.TABLE_POINTS,
                    null,
                    "synced = 0",
                    null, null, null,
                    "id ASC",
                    "100" // batch size
            );

            while (c.moveToNext()) {
                long id = c.getLong(c.getColumnIndexOrThrow("id"));
                String foId = c.getString(c.getColumnIndexOrThrow("fo_id"));
                String driverId = c.getString(c.getColumnIndexOrThrow("driver_id"));
                double lat = c.getDouble(c.getColumnIndexOrThrow("lat"));
                double lng = c.getDouble(c.getColumnIndexOrThrow("lng"));
                float acc = c.getFloat(c.getColumnIndexOrThrow("accuracy"));
                String ts = c.getString(c.getColumnIndexOrThrow("timestamp"));

                boolean ok = sendToBackend(foId, driverId, lat, lng, acc, ts);
                if (ok) {
                    ContentValues cv = new ContentValues();
                    cv.put("synced", 1);
                    db.update(LocationDatabase.TABLE_POINTS, cv, "id = ?", new String[]{String.valueOf(id)});
                } else {
                    // stop looping, try again later to avoid hammering backend
                    break;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error syncing locations", e);
        } finally {
            if (c != null) c.close();
        }
    }

    @Nullable
    private String getStoredAccessToken() {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_AUTH, MODE_PRIVATE);
            return prefs.getString(KEY_ACCESS_TOKEN, null);
        } catch (Exception e) {
            Log.w(TAG, "Unable to read access token from SharedPreferences", e);
            return null;
        }
    }

    private boolean sendToBackend(String foId, String driverId, double lat, double lng, float acc, String ts) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(BACKEND_URL);
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            conn.setDoOutput(true);
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");

            // Attach Bearer token if present. If missing, do not call protected backend.
            String token = getStoredAccessToken();
            if (token == null || token.trim().isEmpty()) {
                Log.w(TAG, "Not authenticated yet (no access token). Keeping location queued.");
                return false;
            }
            conn.setRequestProperty("Authorization", "Bearer " + token);

            JSONObject body = new JSONObject();
            body.put("FoId", foId);
            body.put("DriverId", driverId);
            body.put("Latitude", lat);
            body.put("Longitude", lng);
            body.put("Accuracy", acc);
            body.put("Timestamp", ts);

            BufferedWriter writer = new BufferedWriter(
                    new OutputStreamWriter(new BufferedOutputStream(conn.getOutputStream()))
            );
            writer.write(body.toString());
            writer.flush();
            writer.close();

            int code = conn.getResponseCode();
            Log.d(TAG, "Backend response code: " + code);

            if (code == 401 || code == 403) {
                Log.w(TAG, "Backend rejected request (auth/permission). Ensure user has SkyRoad-User role collection and token is valid.");
            }

            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.e(TAG, "Failed to send location to backend", e);
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
