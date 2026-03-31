import { registerPlugin, Capacitor } from "@capacitor/core";

const SilentSpeech =
  Capacitor.getPlatform() === "android"
    ? registerPlugin("SilentSpeech")
    : null;

export default SilentSpeech;
