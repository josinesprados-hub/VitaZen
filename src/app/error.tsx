'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        backgroundColor: '#000000',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginBottom: '1.5rem' }}
      >
        <path
          d="M24 4L28.9 13.96L40 15.52L32 23.28L33.8 34.24L24 29.08L14.2 34.24L16 23.28L8 15.52L19.1 13.96L24 4Z"
          stroke="#c8a55a"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>

      <p
        style={{
          fontSize: '1.0625rem',
          lineHeight: '1.6',
          color: 'rgba(255, 255, 255, 0.8)',
          marginBottom: '2rem',
          maxWidth: '20rem',
        }}
      >
        Ha ocurrido un problema al iniciar VitaZen.
      </p>

      <button
        onClick={reset}
        style={{
          backgroundColor: '#c8a55a',
          color: '#000000',
          border: 'none',
          borderRadius: '0.5rem',
          padding: '0.75rem 2rem',
          fontSize: '0.9375rem',
          fontWeight: 600,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
