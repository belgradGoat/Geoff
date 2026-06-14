import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'

/**
 * One-time native shell setup for the Capacitor iOS app.
 * No-ops on the web build (guarded by isNativePlatform).
 */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    // Geoff is a dark UI → light status-bar content.
    await StatusBar.setStyle({ style: Style.Dark })
    await SplashScreen.hide()
  } catch (err) {
    console.warn('[native] shell init failed:', err)
  }
}

export const isNative = (): boolean => Capacitor.isNativePlatform()
