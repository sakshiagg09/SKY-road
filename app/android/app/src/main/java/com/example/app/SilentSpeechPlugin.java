package com.example.app;

import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;

import java.util.ArrayList;

/**
 * SilentSpeechPlugin — wraps Android SpeechRecognizer directly (no dialog, no beep popup).
 *
 * STREAM_MUSIC is muted briefly on every startListening() call to suppress the
 * routing click that some OEM builds (e.g. HTC) play.
 *
 * A session generation counter ensures stale RecognitionListener callbacks from
 * a previous session never restart a new one (prevents restart-loop beeping).
 *
 * JS API:
 *   requestPermissions()
 *   start()
 *   startContinuous()  /  startContinuous({ wakeWord: true })
 *   stop()
 *
 * Events: partialResults, finalResults, error
 */
@CapacitorPlugin(
    name = "SilentSpeech",
    permissions = {
        @Permission(strings = { android.Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class SilentSpeechPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private boolean continuous   = false;
    private boolean active       = false;
    private boolean wakeWordMode = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /** Incremented on every stop() / new session — stale callbacks become no-ops. */
    private volatile int sessionGen = 0;

    // ── Permissions ──────────────────────────────────────────────────────────

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject r = new JSObject(); r.put("microphone", "granted"); call.resolve(r);
        } else {
            requestPermissionForAlias("microphone", call, "onMicPermission");
        }
    }

    @PermissionCallback
    private void onMicPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("microphone",
            getPermissionState("microphone") == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(r);
    }

    // ── start ────────────────────────────────────────────────────────────────

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicThenStart"); return;
        }
        continuous = false; wakeWordMode = false;
        active = true;
        final int gen = ++sessionGen;
        handler.removeCallbacksAndMessages(null);
        handler.post(() -> beginListening(call, gen));
    }

    @PermissionCallback
    private void onMicThenStart(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            continuous = false; wakeWordMode = false;
            active = true;
            final int gen = ++sessionGen;
            handler.removeCallbacksAndMessages(null);
            handler.post(() -> beginListening(call, gen));
        } else { call.reject("Microphone permission denied"); }
    }

    // ── startContinuous ──────────────────────────────────────────────────────

    @PluginMethod
    public void startContinuous(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicThenContinuous"); return;
        }
        wakeWordMode = Boolean.TRUE.equals(call.getBoolean("wakeWord", false));
        continuous = true;
        active = true;
        final int gen = ++sessionGen;
        handler.removeCallbacksAndMessages(null);
        if (call != null) call.resolve();
        handler.post(() -> beginListening(null, gen));
    }

    @PermissionCallback
    private void onMicThenContinuous(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            wakeWordMode = Boolean.TRUE.equals(call.getBoolean("wakeWord", false));
            continuous = true;
            active = true;
            final int gen = ++sessionGen;
            handler.removeCallbacksAndMessages(null);
            if (call != null) call.resolve();
            handler.post(() -> beginListening(null, gen));
        } else { call.reject("Microphone permission denied"); }
    }

    // ── stop ─────────────────────────────────────────────────────────────────

    @PluginMethod
    public void stop(PluginCall call) {
        sessionGen++;            // invalidate any in-flight callbacks immediately
        continuous = false;
        active     = false;
        handler.removeCallbacksAndMessages(null);
        handler.post(() -> {
            if (recognizer != null) {
                recognizer.stopListening();
                recognizer.destroy();
                recognizer = null;
            }
        });
        if (call != null) call.resolve();
    }

    // ── Core recognition ─────────────────────────────────────────────────────

    private void beginListening(PluginCall resolveCall, final int gen) {
        if (!active || sessionGen != gen) {
            if (resolveCall != null) resolveCall.resolve();
            return;
        }

        if (recognizer != null) { recognizer.destroy(); recognizer = null; }

        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            JSObject err = new JSObject();
            err.put("code", -1);
            err.put("message", "Speech recognition not available on this device");
            notifyListeners("error", err);
            if (resolveCall != null) resolveCall.reject("Speech recognition not available");
            return;
        }

        recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle p) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float r) {}
            @Override public void onBufferReceived(byte[] b) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onEvent(int t, Bundle p) {}

            @Override
            public void onPartialResults(Bundle partial) {
                if (sessionGen != gen) return;
                ArrayList<String> m =
                    partial.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (m == null || m.isEmpty()) return;
                JSObject data = new JSObject(); JSONArray arr = new JSONArray();
                for (String s : m) arr.put(s);
                data.put("matches", arr);
                notifyListeners("partialResults", data);
            }

            @Override
            public void onResults(Bundle results) {
                if (sessionGen != gen) return;
                ArrayList<String> m =
                    results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                JSObject data = new JSObject(); JSONArray arr = new JSONArray();
                if (m != null) for (String s : m) arr.put(s);
                data.put("matches", arr);
                notifyListeners("finalResults", data);
                notifyListeners("partialResults", data);
                if (continuous && active && sessionGen == gen)
                    handler.postDelayed(() -> beginListening(null, gen),
                        wakeWordMode ? 50 : 150);
            }

            @Override
            public void onError(int error) {
                if (sessionGen != gen) return;
                boolean isTransient = error == SpeechRecognizer.ERROR_NO_MATCH
                    || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                    || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY;
                if (continuous && active && isTransient) {
                    handler.postDelayed(() -> beginListening(null, gen),
                        wakeWordMode ? 100 : 300);
                } else if (!continuous || !isTransient) {
                    JSObject err = new JSObject();
                    err.put("code", error);
                    err.put("message", speechErrorString(error));
                    notifyListeners("error", err);
                }
            }
        });

        // Mute STREAM_MUSIC briefly to suppress the OEM routing click
        AudioManager audio = (AudioManager)
            getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio != null) {
            int prev = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
            if (prev > 0) {
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0);
                handler.postDelayed(
                    () -> audio.setStreamVolume(AudioManager.STREAM_MUSIC, prev, 0), 300);
            }
        }

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
            RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);

        if (wakeWordMode) {
            // Keep sessions alive as long as possible — fewer routing clicks = less beeping.
            // Offline mode avoids the 5-second Google server timeout.
            intent.putExtra("android.speech.extra.PREFER_OFFLINE", true);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 15000L);
            intent.putExtra(
                RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 12000L);
        } else {
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L);
            intent.putExtra(
                RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
            intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 300L);
        }

        recognizer.startListening(intent);
        if (resolveCall != null) resolveCall.resolve();
    }

    private String speechErrorString(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO:                    return "Audio recording error";
            case SpeechRecognizer.ERROR_CLIENT:                   return "Client side error";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Insufficient permissions";
            case SpeechRecognizer.ERROR_NETWORK:                  return "Network error";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:          return "Network timeout";
            case SpeechRecognizer.ERROR_NO_MATCH:                 return "No match found";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:          return "Recognizer busy";
            case SpeechRecognizer.ERROR_SERVER:                   return "Server error";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:           return "No speech detected";
            default:                                              return "Unknown error (" + error + ")";
        }
    }

    @Override
    protected void handleOnDestroy() {
        sessionGen++;
        continuous = false;
        active     = false;
        handler.removeCallbacksAndMessages(null);
        if (recognizer != null) { recognizer.destroy(); recognizer = null; }
    }
}
