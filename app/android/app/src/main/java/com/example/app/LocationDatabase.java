package com.example.app;

import android.content.Context;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

public class LocationDatabase extends SQLiteOpenHelper {

    public static final String DB_NAME = "sky_tracking.db";
    public static final int DB_VERSION = 1;

    public static final String TABLE_POINTS = "location_points";

    public LocationDatabase(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        String sql = "CREATE TABLE " + TABLE_POINTS + " (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "fo_id TEXT," +
                "driver_id TEXT," +
                "lat REAL," +
                "lng REAL," +
                "accuracy REAL," +
                "timestamp TEXT," +
                "synced INTEGER DEFAULT 0" +
                ")";
        db.execSQL(sql);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS " + TABLE_POINTS);
        onCreate(db);
    }
}
