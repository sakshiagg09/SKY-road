import { registerPlugin } from "@capacitor/core";

const AuthStore = registerPlugin("AuthStore");

export async function nativeSetTokens({ accessToken, refreshToken }) {
  return await AuthStore.setTokens({ accessToken, refreshToken });
}

export async function nativeClearTokens() {
  return await AuthStore.clear();
}
