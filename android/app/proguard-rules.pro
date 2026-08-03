# =============================================================================
# VitaZen TWA ProGuard Rules — Release Runtime Fix
# =============================================================================
#
# ROOT CAUSE: The release build crashed because ProGuard's optimization pass
# (proguard-android-optimize.txt) was altering AIDL-generated Binder IPC
# classes in android.support.customtabs.** that the TWA/CustomTabs system
# depends on for inter-process communication with Chrome.
#
# The debug build worked because minifyEnabled=false means zero ProGuard.
#
# This file provides comprehensive keep rules so that release remains
# minified (shrinking + obfuscation) but all TWA runtime classes are preserved.
# =============================================================================

# -----------------------------------------------------------------------------
# 1. androidbrowserhelper — the TWA launcher library
#    All classes are kept because LauncherActivityMetadata.parse() reads
#    meta-data at runtime, TwaLauncher uses dynamic ServiceConnection,
#    and fallback strategies are selected by string comparison.
# -----------------------------------------------------------------------------
-keep class com.google.androidbrowserhelper.** { *; }
-dontwarn com.google.androidbrowserhelper.**

# -----------------------------------------------------------------------------
# 2. AIDL-generated Binder IPC classes in android.support.customtabs
#
#    These are the #1 cause of the release crash. They live in a different
#    package namespace (android.support.customtabs) than the public API
#    (androidx.browser), so the previous rule "-keep class androidx.browser.**"
#    did NOT protect them.
#
#    These classes handle ALL IPC between the app and Chrome's
#    CustomTabsService:
#      - ICustomTabsService.Stub.Proxy  → calls into Chrome (warmup, newSession, etc.)
#      - ICustomTabsService.Stub        → receives callbacks from Chrome
#      - ICustomTabsCallback.Stub.Proxy → receives navigation events from Chrome
#      - ITrustedWebActivityService.Stub.Proxy → TWA delegation IPC
#      - ITrustedWebActivityCallback.Stub.Proxy → TWA callback IPC
#      - IPostMessageService.Stub.Proxy → postMessage channel
#      - IEngagementSignalsCallback.Stub.Proxy → engagement signals
#      - *_Parcel helper classes → Parcel serialization internals
#
#    ProGuard's optimization pass was modifying these classes' onTransact()
#    methods and transact() call sequences, breaking Binder IPC and causing
#    the TWA launch to crash with no visible error (the connection simply
#    fails silently or throws a RemoteException).
# -----------------------------------------------------------------------------
-keep class android.support.customtabs.** { *; }
-dontwarn android.support.customtabs.**

# -----------------------------------------------------------------------------
# 3. androidx.browser — the public CustomTabs/TWA API surface
#    Includes TrustedWebActivityService, TrustedWebActivityIntentBuilder,
#    Token, TokenStore, display mode classes, sharing classes, etc.
#    Many of these use Bundle-based serialization where class structure
#    must be preserved exactly.
# -----------------------------------------------------------------------------
-keep class androidx.browser.** { *; }
-dontwarn androidx.browser.**

# -----------------------------------------------------------------------------
# 4. Parcelable CREATOR fields
#    Android's Parcel system reads CREATOR via reflection. If ProGuard
#    removes or renames these fields, unparcelling crashes with
#    BadParcelableException or ClassNotFoundException.
# -----------------------------------------------------------------------------
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# -----------------------------------------------------------------------------
# 5. SharedPreferencesTokenStore and Token serialization
#    Token/TokenContents use custom byte[] serialization. ProGuard must
#    not alter the serialize/deserialize methods or the field layout.
# -----------------------------------------------------------------------------
-keepclassmembers class androidx.browser.trusted.TokenContents {
    <init>(byte[]);
    byte[] serialize();
    static androidx.browser.trusted.TokenContents deserialize(byte[]);
    static androidx.browser.trusted.TokenContents create(java.lang.String, java.util.List);
}

# -----------------------------------------------------------------------------
# 6. SplashScreen strategy classes (used dynamically by LauncherActivity)
#    PwaWrapperSplashScreenStrategy is instantiated conditionally when
#    SPLASH_IMAGE_DRAWABLE meta-data is present. The splash drawable
#    provides the VitaZen logo during the TWA launch transition.
# -----------------------------------------------------------------------------
-keep class com.google.androidbrowserhelper.trusted.splashscreens.** { *; }

# -----------------------------------------------------------------------------
# 7. androidx.core.splashscreen (kept for compatibility)
# -----------------------------------------------------------------------------
-keep class androidx.core.splashscreen.** { *; }
-dontwarn androidx.core.splashscreen.**

# -----------------------------------------------------------------------------
# 8. ServiceConnection implementations
#    TwaCustomTabsServiceConnection and ConnectionHolder implement
#    ServiceConnection. Their onServiceConnected/onServiceDisconnected
#    methods are called by the Android framework and must not be removed.
# -----------------------------------------------------------------------------
-keepclassmembers class * implements android.content.ServiceConnection {
    void onServiceConnected(android.content.ComponentName, android.os.IBinder);
    void onServiceDisconnected(android.content.ComponentName);
}

# -----------------------------------------------------------------------------
# 9. CustomTabsCallback subclasses
#    QualityEnforcer extends CustomTabsCallback. The Chrome process calls
#    back via IPC, so extraCallbackWithResult and onNavigationEvent must
#    be preserved.
# -----------------------------------------------------------------------------
-keepclassmembers class * extends androidx.browser.customtabs.CustomTabsCallback {
    *;
}

# -----------------------------------------------------------------------------
# 10. Prevent optimization of Binder IPC transaction methods
#     The onTransact() methods in AIDL Stub classes are called by the
#     Android framework via Binder, not by app code. ProGuard's optimization
#     sees them as unused and can remove/alter them. We explicitly protect
#     all onTransact implementations.
# -----------------------------------------------------------------------------
-keepclassmembers class * extends android.os.Binder {
    boolean onTransact(int, android.os.Parcel, android.os.Parcel, int);
}

# -----------------------------------------------------------------------------
# 11. Fallback strategy lambda/method references
#     TwaLauncher.CCT_FALLBACK_STRATEGY and WEBVIEW_FALLBACK_STRATEGY
#     are lambda-based FallbackStrategy instances. ProGuard can break
#     these by removing the synthetic lambda methods.
# -----------------------------------------------------------------------------
-keepclassmembers class com.google.androidbrowserhelper.trusted.TwaLauncher {
    static com.google.androidbrowserhelper.trusted.TwaLauncher$FallbackStrategy CCT_FALLBACK_STRATEGY;
    static com.google.androidbrowserhelper.trusted.TwaLauncher$FallbackStrategy WEBVIEW_FALLBACK_STRATEGY;
}

# -----------------------------------------------------------------------------
# 12. WebViewFallbackActivity inner classes (anonymous WebViewClient/WebChromeClient)
#     These are created dynamically inside createWebViewClient() and
#     createWebViewChromeClient(). ProGuard may remove them as "unused"
#     since they're not stored in named fields.
# -----------------------------------------------------------------------------
-keep class com.google.androidbrowserhelper.trusted.WebViewFallbackActivity$1 { *; }
-keep class com.google.androidbrowserhelper.trusted.WebViewFallbackActivity$2 { *; }

# -----------------------------------------------------------------------------
# 13. Notification delegation (used by DelegationService for push notifications)
# -----------------------------------------------------------------------------
-keep class com.google.androidbrowserhelper.trusted.NotificationDelegationExtraCommandHandler { *; }
-keep class com.google.androidbrowserhelper.trusted.NotificationPermissionRequestActivity { *; }
-keep class com.google.androidbrowserhelper.trusted.NotificationUtils { *; }
