package com.vitazen.app.v1

import android.os.Bundle
import android.util.Log
import android.view.View
import androidx.browser.customtabs.CustomTabsCallback
import com.google.androidbrowserhelper.trusted.LauncherActivity

/**
 * Custom LauncherActivity that fixes three crash causes in androidbrowserhelper:2.5.0:
 *
 * 1. QualityEnforcer crash: The library's QualityEnforcer throws a RuntimeException on the
 *    main thread when Chrome sends a "quality_enforcement.crash" callback (which happens when
 *    Digital Asset Links verification fails on Chrome 91+). This replaces it with a safe
 *    callback that logs instead of crashing.
 *
 * 2. Black screen: The library never sets a content view on LauncherActivity when
 *    splashImageDrawableId == 0 (our case). This sets a background-colored view before
 *    launching, preventing the black flash and reducing the chance of OEM-specific kills.
 *
 * 3. Graceful fallback: Wraps the TWA launch in try/catch so that any unexpected
 *    exceptions during the launch flow don't crash the app.
 */
class SafeLauncherActivity : LauncherActivity() {

    companion object {
        private const val TAG = "SafeLauncherActivity"
    }

    /**
     * Set a content view BEFORE the library's onCreate runs.
     * The library only sets a content view if splashScreenNeeded() returns true,
     * which requires splashImageDrawableId != 0. Since we removed SPLASH_IMAGE_DRAWABLE,
     * the library never sets a content view, leaving the activity with a black window.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        // Set a plain view with the window background color to avoid black screen.
        // The TWA/CCT will cover this almost immediately.
        val placeholder = View(this)
        setContentView(placeholder)

        try {
            super.onCreate(savedInstanceState)
        } catch (e: Exception) {
            Log.e(TAG, "Exception in LauncherActivity.onCreate", e)
            finish()
        }
    }

    /**
     * CRITICAL FIX: Replace QualityEnforcer with a non-crashing callback.
     *
     * The library's default QualityEnforcer receives "quality_enforcement.crash" callbacks
     * from Chrome when Digital Asset Links verification fails (Chrome 91+). The default
     * implementation throws a RuntimeException on the main thread, intentionally crashing
     * the app. This is terrible UX - the app should gracefully degrade to CCT instead.
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
