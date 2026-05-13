# VitaZen TWA ProGuard Rules
# Keep TWA LauncherActivity and related classes
-keep class com.google.androidbrowserhelper.** { *; }
-keep class androidx.browser.** { *; }
-keep class androidx.core.splashscreen.** { *; }
-dontwarn com.google.androidbrowserhelper.**
-dontwarn androidx.core.splashscreen.**
