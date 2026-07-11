'use client';

import { useState, useEffect, useRef } from 'react';

interface DebugEvent {
  id: number;
  ms: number;
  event: string;
  detail: string;
  color: string;
}

export function AuthDebugPanel() {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [active, setActive] = useState(false);
  const [probe, setProbe] = useState({ href: 'SSR', search: 'SSR', paramsStr: 'SSR', debugAuth: 'SSR' });
  const counterRef = useRef(0);
  const t0Ref = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('debugAuth') !== '1') return;

    setActive(true);
    t0Ref.current = Date.now();

    const log = (event: string, data?: string | number | object | null) => {
      counterRef.current++;
      const ms = Date.now() - t0Ref.current;
      let detail = '';
      let color = '#ccc';

      if (data === null || data === undefined) {
        detail = '';
      } else if (typeof data === 'string') {
        detail = data;
      } else if (typeof data === 'number') {
        detail = String(data);
      } else {
        try {
          detail = JSON.stringify(data);
        } catch {
          detail = String(data);
        }
      }

      const lc = event.toLowerCase();
      if (lc.includes('error') || lc.includes('reject')) color = '#ff6b6b';
      else if (lc.includes('abort') || lc.includes('timeout')) color = '#ffa502';
      else if (
        lc.includes('ok') || lc.includes('resolved') ||
        lc.includes('credential') || lc.includes('usercredential')
      ) color = '#2ed573';
      else if (lc.includes('null') || lc.includes('false')) color = '#e8a735';
      else if (lc.includes('mount')) color = '#70a1ff';
      else if (lc.includes('state') || lc.includes('router') || lc.includes('replace')) color = '#a29bfe';
      else if (lc.includes('#')) color = '#eccc68';
      else if (lc.includes('sign') || lc.includes('redirect') || lc.includes('popup')) color = '#70a1ff';
      else if (lc.includes('sync') || lc.includes('entry') || lc.includes('exit')) color = '#7bed9f';
      else if (lc.includes('guard')) color = '#dfe6e9';
      else if (lc.includes('catch')) color = '#ff6b6b';

      setEvents((prev) => [...prev, { id: counterRef.current, ms, event, detail, color }]);
    };

    (window as any).__authDebugLog = log;

    return () => {
      delete (window as any).__authDebugLog;
    };
  }, []);

  // Probe: capture raw URL values every render
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    setProbe({
      href: window.location.href,
      search: window.location.search,
      paramsStr: sp.toString(),
      debugAuth: sp.get('debugAuth') as string,
    });
  });

  // Auto-scroll to bottom on new events
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'instant' } as any);
  }, [events]);

  return (
    <>
    {/* PROBE — always visible */}
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: 'rgba(255,0,0,0.92)',
        color: '#fff',
        fontSize: 9,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        padding: '4px 6px',
        zIndex: 9999999,
        lineHeight: '13px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}
    >
      <div>href: {probe.href}</div>
      <div>search: {probe.search}</div>
      <div>toString(): {probe.paramsStr}</div>
      <div>get(debugAuth): {probe.debugAuth}</div>
      <div>active: {String(active)}</div>
    </div>

    {/* EVENT LOG — only when active */}
    {active && (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '42vh',
        minHeight: 180,
        background: 'rgba(8, 8, 8, 0.97)',
        borderTop: '1px solid #333',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 10,
        lineHeight: '15px',
        color: '#fff',
        touchAction: 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '5px 8px',
          background: '#111',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#ff6b6b', fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>
          ● AUTH DEBUG
        </span>
        <span style={{ color: '#555', fontSize: 9 }}>{events.length} events</span>
      </div>

      {/* Scrollable event list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          padding: '2px 0',
        }}
      >
        {events.map((e) => (
          <div
            key={e.id}
            style={{
              padding: '2px 6px',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            <span style={{ color: '#444', fontSize: 9 }}>[{e.id}]</span>{' '}
            <span style={{ color: '#555', fontSize: 9 }}>{e.ms}ms</span>{' '}
            <span style={{ color: e.color, fontWeight: 600 }}>{e.event}</span>
            {e.detail ? (
              <span style={{ color: '#888', fontSize: 9 }}> {e.detail}</span>
            ) : null}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
    )}
    </>
  );
}