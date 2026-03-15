package com.example.app;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AudioRecorderPlugin — captures raw PCM via AudioRecord (no SpeechRecognizer,
 * no audio routing change, no OEM beep).
 *
 * Two modes:
 *   1. Tap-to-record:  start() / stop() → returns base64 WAV
 *   2. Wake-word mode: startWakeWord() → emits "chunk" events (2-second speech windows)
 *                      stopWakeWord()  → stops
 *
 * The two modes are mutually exclusive.
 */
@CapacitorPlugin(
    name = "AudioRecorder",
    permissions = {
        @Permission(strings = { android.Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class AudioRecorderPlugin extends Plugin {

    private static final int SAMPLE_RATE   = 16000;
    private static final int CHANNEL_CFG   = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FMT     = AudioFormat.ENCODING_PCM_16BIT;
    private static final int MIN_BUF       = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CFG, AUDIO_FMT);
    // 100ms read blocks
    private static final int READ_BLOCK    = SAMPLE_RATE / 10 * 2; // 16-bit = 2 bytes/sample
    // RMS threshold — below this = silence (no speech).
    // Checked against the most recent 1-second STRIDE (not the full 2-second window)
    // so a short ~0.6s utterance like "Hey Sky" isn't diluted by surrounding silence.
    private static final double RMS_THRESHOLD = 400.0;
    // Sliding window: 2s window emitted every 1s stride
    // "Hey Sky" is ~0.8s; a 2s window with 1s stride guarantees it's always fully captured
    private static final int WINDOW_SAMPLES = SAMPLE_RATE * 2; // 2s window
    private static final int WINDOW_BYTES   = WINDOW_SAMPLES * 2;
    private static final int STRIDE_SAMPLES = SAMPLE_RATE * 1; // emit every 1s
    private static final int STRIDE_BYTES   = STRIDE_SAMPLES * 2;

    private AudioRecord audioRecord;
    private volatile boolean recordingActive  = false;
    private volatile boolean wakeWordActive   = false;

    private final ByteArrayOutputStream recordBuffer = new ByteArrayOutputStream();
    private ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

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

    // ── Tap-to-record: start ─────────────────────────────────────────────────

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicThenStart"); return;
        }
        startRecordInternal(call);
    }

    @PermissionCallback
    private void onMicThenStart(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) startRecordInternal(call);
        else call.reject("Microphone permission denied");
    }

    private void startRecordInternal(PluginCall call) {
        if (recordingActive || wakeWordActive) {
            call.reject("Already active — stop first"); return;
        }
        recordBuffer.reset();
        audioRecord = createAudioRecord();
        if (audioRecord == null) { call.reject("AudioRecord init failed"); return; }

        recordingActive = true;
        audioRecord.startRecording();
        call.resolve();

        executor.execute(() -> {
            byte[] buf = new byte[READ_BLOCK];
            while (recordingActive) {
                int read = audioRecord.read(buf, 0, buf.length);
                if (read > 0) recordBuffer.write(buf, 0, read);
            }
        });
    }

    // ── Tap-to-record: stop ──────────────────────────────────────────────────

    @PluginMethod
    public void stop(PluginCall call) {
        if (!recordingActive) { call.reject("Not recording"); return; }
        recordingActive = false;

        executor.execute(() -> {
            destroyAudioRecord();
            byte[] pcm = recordBuffer.toByteArray();
            if (pcm.length == 0) {
                mainHandler.post(() -> call.reject("No audio captured"));
                return;
            }
            byte[] wav = buildWav(pcm);
            String b64 = Base64.encodeToString(wav, Base64.NO_WRAP);
            int durationMs = (pcm.length / 2) * 1000 / SAMPLE_RATE;
            mainHandler.post(() -> {
                JSObject r = new JSObject();
                r.put("audioBase64", b64);
                r.put("mimeType", "audio/wav");
                r.put("durationMs", durationMs);
                call.resolve(r);
            });
        });
    }

    // ── Wake-word mode: startWakeWord ────────────────────────────────────────

    @PluginMethod
    public void startWakeWord(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicThenWakeWord"); return;
        }
        startWakeWordInternal(call);
    }

    @PermissionCallback
    private void onMicThenWakeWord(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) startWakeWordInternal(call);
        else call.reject("Microphone permission denied");
    }

    private void startWakeWordInternal(PluginCall call) {
        if (recordingActive || wakeWordActive) {
            call.reject("Already active — stop first"); return;
        }
        audioRecord = createAudioRecord();
        if (audioRecord == null) { call.reject("AudioRecord init failed"); return; }

        wakeWordActive = true;
        audioRecord.startRecording();
        call.resolve();

        executor.execute(() -> {
            // Sliding window: keep last WINDOW_BYTES of audio, advance by STRIDE_BYTES each step
            byte[] window     = new byte[WINDOW_BYTES];
            int    windowFilled = 0;           // bytes populated so far (ramps up to WINDOW_BYTES)
            byte[] strideBuf  = new byte[STRIDE_BYTES];
            int    strideFilled = 0;
            byte[] readBuf    = new byte[READ_BLOCK];

            while (wakeWordActive) {
                int read = audioRecord.read(readBuf, 0, readBuf.length);
                if (read <= 0) continue;

                // Feed raw bytes into stride buffer (may span multiple reads)
                int srcOff = 0;
                while (srcOff < read) {
                    int space   = STRIDE_BYTES - strideFilled;
                    int toCopy  = Math.min(read - srcOff, space);
                    System.arraycopy(readBuf, srcOff, strideBuf, strideFilled, toCopy);
                    strideFilled += toCopy;
                    srcOff       += toCopy;

                    if (strideFilled >= STRIDE_BYTES) {
                        // Slide window: shift left by one stride, append new stride on the right
                        if (windowFilled < WINDOW_BYTES) {
                            // Window not yet full — just append
                            System.arraycopy(strideBuf, 0, window, windowFilled, STRIDE_BYTES);
                            windowFilled += STRIDE_BYTES;
                        } else {
                            // Shift left and fill right
                            System.arraycopy(window, STRIDE_BYTES, window, 0, WINDOW_BYTES - STRIDE_BYTES);
                            System.arraycopy(strideBuf, 0, window, WINDOW_BYTES - STRIDE_BYTES, STRIDE_BYTES);
                        }
                        strideFilled = 0;

                        // Emit when full 2s window is ready AND the most recent 1s stride
                        // has speech energy. Using stride RMS avoids diluting a short
                        // "Hey Sky" (~0.6s) with the surrounding silence in the window.
                        if (windowFilled >= WINDOW_BYTES && calculateRMS(strideBuf) >= RMS_THRESHOLD) {
                            byte[] toEmit = window.clone();
                            byte[] wav    = buildWav(toEmit);
                            String b64    = Base64.encodeToString(wav, Base64.NO_WRAP);
                            mainHandler.post(() -> {
                                JSObject data = new JSObject();
                                data.put("audioBase64", b64);
                                notifyListeners("chunk", data);
                            });
                        }
                    }
                }
            }
        });
    }

    // ── Wake-word mode: stopWakeWord ─────────────────────────────────────────

    @PluginMethod
    public void stopWakeWord(PluginCall call) {
        wakeWordActive = false;
        executor.execute(() -> {
            destroyAudioRecord();
            if (call != null) mainHandler.post(call::resolve);
        });
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private AudioRecord createAudioRecord() {
        int bufSize = Math.max(MIN_BUF * 4, READ_BLOCK * 4);
        AudioRecord ar = new AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE, CHANNEL_CFG, AUDIO_FMT, bufSize);
        if (ar.getState() != AudioRecord.STATE_INITIALIZED) {
            ar.release(); return null;
        }
        return ar;
    }

    private void destroyAudioRecord() {
        if (audioRecord != null) {
            try { audioRecord.stop(); } catch (Exception ignored) {}
            audioRecord.release();
            audioRecord = null;
        }
    }

    private double calculateRMS(byte[] pcm) {
        long sum = 0;
        int samples = pcm.length / 2;
        for (int i = 0; i < pcm.length - 1; i += 2) {
            short s = (short) ((pcm[i + 1] << 8) | (pcm[i] & 0xFF));
            sum += (long) s * s;
        }
        return Math.sqrt((double) sum / samples);
    }

    /** Build a minimal 44-byte WAV header + PCM data. */
    private byte[] buildWav(byte[] pcm) {
        int channels = 1, bits = 16;
        ByteBuffer buf = ByteBuffer.allocate(44 + pcm.length).order(ByteOrder.LITTLE_ENDIAN);
        buf.put("RIFF".getBytes());
        buf.putInt(36 + pcm.length);
        buf.put("WAVE".getBytes());
        buf.put("fmt ".getBytes());
        buf.putInt(16);
        buf.putShort((short) 1);           // PCM
        buf.putShort((short) channels);
        buf.putInt(SAMPLE_RATE);
        buf.putInt(SAMPLE_RATE * channels * bits / 8);
        buf.putShort((short) (channels * bits / 8));
        buf.putShort((short) bits);
        buf.put("data".getBytes());
        buf.putInt(pcm.length);
        buf.put(pcm);
        return buf.array();
    }

    @Override
    protected void handleOnDestroy() {
        recordingActive = false;
        wakeWordActive  = false;
        executor.shutdownNow();
        destroyAudioRecord();
    }
}
