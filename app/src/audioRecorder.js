import { registerPlugin, Capacitor } from "@capacitor/core";

// Only registers on Android — web falls back to webkitSpeechRecognition
const AudioRecorder =
  Capacitor.getPlatform() === "android"
    ? registerPlugin("AudioRecorder")
    : null;

export default AudioRecorder;
