package com.vitazen.app.v1

import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.browser.customtabs.CustomTabsCallback
import com.google.androidbrowserhelper.trusted.LauncherActivity
import com.google.androidbrowserhelper.trusted.TwaLauncher

/**
 * Custom LauncherActivity that ensures VitaZen always launches as a Trusted Web Activity
 * using Google Chrome.
 *
 * Fixes applied:
 *
 * 1. CHROME PROVIDER FORCING (this commit):
 *    Overrides createTwaLauncher() to pass "com.android.chrome" as providerPackage.
 *    This skips TwaProviderPicker entirely, preventing Samsung Internet, Mi Browser,
 *    Huawei Browser, ColorOS Browser, Realme Browser, etc. from being selected.
 *    When providerPackage is non-null, TwaLauncher sets mLaunchMode = TRUSTED_WEB_ACTIVITY
 *    unconditionally (see TwaLauncher.java 4-arg constructor in ABH 2.5.0).
 *
 *    Without this, TwaProviderPicker.pickProvider() may select a non-Chrome browser that:
 *    - Supports Custom Tabs but NOT TWAs -> mLaunchMode = CUSTOM_TAB -> CCT fallback
 *    - Supports TWAs but with different DAL implementation -> verification fails
 *
 * 2. CHROME NOT INSTALLED HANDLING:
 *    If Chrome is not installed or is disabled, shows a dialog prompting the user to
 *    install Chrome from Google Play. Overrides shouldLaunchImmediately() to prevent
 *    the library from attempting to launch when Chrome is unavailable.
 *
 * 3. QUALITY ENFORCER CRASH FIX (previous):
 *    Replaces QualityEnforcer with SafeTwaCallback that logs instead of crashing
 *    when Chrome sends "quality_enforcement.crash" callback.
 *
 * 4. GRACEFUL FALLBACK (previous):
 *    Wraps the TWA launch in try/catch so unexpected exceptions don't crash the app.
 *
 * NOTE: The library's SimpleSplashScreenStrategy handles the splash screen when
 * SPLASH_IMAGE_DRAWABLE meta-data is present. We must NOT call setContentView().
 */
class SafeLauncherActivity : LauncherActivity() {

    companion object {
        private const val TAG = "SafeLauncherActivity"
        private const val CHROME_PACKAGE = "com.android.chrome"
    }

    /** Whether Chrome is installed and enabled on this device. */
    private var chromeAvailable: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        chromeAvailable = isChromeAvailable()

        try {
            super.onCreate(savedInstanceState)
        } catch (e: Exception) {
            Log.e(TAG, "Exception in LauncherActivity.onCreate", e)
            finish()
            return
        }

        // If Chrome is not available, show a dialog instead of launching.
        // shouldLaunchImmediately() returns false, so super.onCreate() did not
        // attempt to launch the TWA.
        if (!chromeAvailable) {
            showChromeRequiredDialog()
            return
        }

        // Enable fullscreen immersive mode for smooth launch transition.
        // Safe after super.onCreate() because Window and DecorView are initialized.
        enableImmersiveMode()
    }

    /**
     * Prevents TWA launch when Chrome is not available.
     *
     * LauncherActivity.onCreate() checks this and skips launchTwa() when it
     * returns false. This avoids the silent bind failure that would occur if
     * TwaLauncher tried to bindCustomTabsService to a non-existent Chrome.
     */
    override fun shouldLaunchImmediately(): Boolean {
        return chromeAvailable
    }

    /**
     * Forces TwaLauncher to use Chrome as the TWA provider.
     *
     * This is the core fix for the "TWA falls back to Custom Tabs on some devices"
     * issue.
     *
     * HOW IT WORKS (source: TwaLauncher.java, ABH 2.5.0):
     *
     *   // Default (current) behaviour when providerPackage is null:
     *   // TwaLauncher(Context) -> TwaLauncher(Context, null) ->
     *   //   TwaProviderPicker.pickProvider(pm) -> may return Samsung Internet,
     *   //   Mi Browser, etc. with LaunchMode.CUSTOM_TAB (no TWA support)
     *   //   or LaunchMode.TRUSTED_WEB_ACTIVITY but with different DAL verification
     *
     *   // With providerPackage = "com.android.chrome":
     *   // TwaLauncher(Context, "com.android.chrome") ->
     *   //   mProviderPackage = "com.android.chrome"
     *   //   mLaunchMode = LaunchMode.TRUSTED_WEB_ACTIVITY  (forced, not auto-detected)
     *   //   -> always binds to Chrome's CustomTabsService
     *   //   -> Chrome is the only browser with reliable, well-tested TWA support
     */
    override fun createTwaLauncher(): TwaLauncher {
        return TwaLauncher(this, CHROME_PACKAGE)
    }

    /**
     * Checks if Google Chrome is installed and enabled.
     *
     * Uses getPackageInfo() which works on all Android versions including 11+
     * without requiring a <queries> declaration in the manifest.
     * Also checks that the app is enabled (not disabled by the user or policy).
     */
    private fun isChromeAvailable(): Boolean {
        return try {
            val appInfo = packageManager.getApplicationInfo(CHROME_PACKAGE, 0)
            appInfo.enabled
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
    }

    /**
     * Shows a dialog informing the user that Chrome is required.
     * Offers a button to open Google Play to install Chrome.
     */
    private fun showChromeRequiredDialog() {
        AlertDialog.Builder(this)
            .setTitle("Google Chrome necesario")
            .setMessage(
                "Para disfrutar de la experiencia completa de VitaZen, " +
                "necesitas tener Google Chrome instalado en tu dispositivo."
            )
            .setCancelable(false)
            .setPositiveButton("Instalar Chrome") { _, _ ->
                openChromeInPlayStore()
                finish()
            }
            .setNegativeButton("Salir") { _, _ ->
                finish()
            }
            .show()
    }

    /** Opens Google Chrome's page on the Play Store. */
    private fun openChromeInPlayStore() {
        try {
            val intent = Intent(
                Intent.ACTION_VIEW,
                Uri.parse("market://details?id=$CHROME_PACKAGE")
            )
            // If Play Store app is not available, fall back to web URL
            if (intent.resolveActivity(packageManager) == null) {
                intent.data = Uri.parse(
                    "https://play.google.com/store/apps/details?id=$CHROME_PACKAGE"
                )
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Could not open Play Store for Chrome", e)
        }
    }

    /**
     * Hide system bars (status bar + navigation bar) for a fully immersive
     * launch transition. Uses the modern WindowInsetsController API on API 30+
     * and the legacy systemUiVisibility flags on older versions.
     */
    private fun enableImmersiveMode() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                window.setDecorFitsSystemWindows(false)
                val controller = window.insetsController
                if (controller != null) {
                    controller.systemBarsBehavior =
                        android.view.WindowInsetsController
                            .BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    controller.hide(android.view.WindowInsets.Type.systemBars())
                } else {
                    Log.w(TAG, "WindowInsetsController is null — immersive mode not available")
                }
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                )
            }
        } catch (e: Exception) {
            // Immersive mode is purely cosmetic — never crash the app for it.
            Log.w(TAG, "Immersive mode failed, continuing without it", e)
        }
    }

    /**
     * CRITICAL FIX: Replace QualityEnforcer with a non-crashing callback.
     *
     * The library's default QualityEnforcer receives "quality_enforcement.crash" callbacks
     * from Chrome when Digital Asset Links verification fails (Chrome 91+). The default
     * implementation throws a RuntimeException on the main thread, intentionally crashing
     * the app. This replaces it with a safe callback that logs instead of crashing.
     *
     * Source: com.google.androidbrowserhelper.trusted.QualityEnforcer
     *   - Constructor: mDelegate = message -> Handler(mainLooper).post(() -> throw RuntimeException(message))
     *   - extraCallbackWithResult("quality_enforcement.crash", args) -> mDelegate.crash(message) -> CRASH
     *
     * Chrome sends this callback when:
     *   - Digital Asset Links verification fails (assetlinks.json not matching)
     *   - The TWA is opened in CCT fallback mode
     *   - Other TWA quality violations
     *
     * In all these cases, Chrome already falls back to CCT gracefully - the crash callback
     * is just an "enforcement" mechanism. We log instead of crashing.
     */
    override fun getCustomTabsCallback(): CustomTabsCallback {
        return SafeTwaCallback()
    }

    /**
     * A CustomTabsCallback that handles TWA quality enforcement callbacks safely.
     *
     * Key callbacks from Chrome:
     *   - "quality_enforcement.crash" with "crash_reason" extra: sent when DAL verification
     *     fails or other quality violations. The library's QualityEnforcer would crash here.
     *   - onRelationshipValidationResult: sent when DAL verification result is known
     */
    private class SafeTwaCallback : CustomTabsCallback() {
        private val TAG = "SafeTwaCallback"

        override fun extraCallbackWithResult(
            callbackName: String,
            args: Bundle?
        ): Bundle? {
            if (callbackName == "quality_enforcement.crash") {
                val reason = args?.getString("crash_reason") ?: "unknown"
                Log.w(TAG, "TWA quality enforcement crash suppressed. Reason: $reason")
                Log.w(TAG, "This typically means Digital Asset Links verification failed.")
                Log.w(TAG, "Chrome has already fallen back to CCT mode - no action needed.")
                // Return success=true so Chrome doesn't retry or escalate
                return Bundle().apply { putBoolean("success", true) }
            }
            return super.extraCallbackWithResult(callbackName, args)
        }

        override fun onRelationshipValidationResult(
            relation: Int,
            requestedOrigin: android.net.Uri,
            result: Boolean,
            extras: Bundle?
        ) {
            if (!result) {
                Log.w(TAG, "Digital Asset Links verification FAILED for $requestedOrigin")
                Log.w(TAG, "Ensure https://${requestedOrigin.host}/.well-known/assetlinks.json " +
                    "contains the correct package name and SHA256 fingerprint")
            } else {
                Log.d(TAG, "Digital Asset Links verification passed for $requestedOrigin")
            }
            super.onRelationshipValidationResult(relation, requestedOrigin, result, extras)
        }
    }
}
