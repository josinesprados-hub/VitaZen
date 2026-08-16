'use client';

import { useEffect, useRef } from 'react';

/**
 * Registers the production service worker on mount.
 *
 * Placed in the root layout so it runs once on every page load.
 * The SW handles:
 *   - Precaching of static assets (icons, manifest, fonts)
 *   - Runtime caching (Cache-First for static, Network-First for pages/API)
 *   - Firebase Cloud Messaging for push notifications
 *   - Offline fallback page
 *
 * Registration logic:
 *   1. Check if sw.js is already registered at scope '/'
 *   2. If not, register it
 *   3. On update: notify the user (could show a toast to refresh)
 *   4. Handle controller change (new SW took control)
 */
export function ServiceWorkerRegistrar() {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    registered.current = true;

    async function registerSW() {
      try {
        // Check for existing registration
        const existingReg = await navigator.serviceWorker.getRegistration('/sw.js');

        if (existingReg) {
          // Already registered — listen for updates
          listenForUpdates(existingReg);
          return;
        }

        // Check for legacy firebase-messaging-sw.js — don't double-register
        const legacyReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
        if (legacyReg) {
          // Legacy SW exists — it will be replaced when user next visits
          // The push-client.ts getOrCreateSWRegistration() handles the transition
          return;
        }

        // Register the unified production SW
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        console.log('[VitaZen] Service Worker registered:', registration.scope);
        listenForUpdates(registration);
      } catch (error) {
        // SW registration is non-critical — don't crash the app
        console.warn('[VitaZen] Service Worker registration failed:', error);
      }
    }

    function listenForUpdates(registration: ServiceWorkerRegistration) {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            // New SW is active — pages will use it on next navigation
            console.log('[VitaZen] Service Worker updated');
          }
        });
      });
    }

    // Handle controller change (new SW took control of this tab)
    function handleControllerChange() {
      console.log('[VitaZen] New Service Worker took control');
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    registerSW();

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  // This component renders nothing
  return null;
}
