'use client';

import React, { useState, useCallback } from 'react';
import { Star } from 'lucide-react';

interface FavoriteButtonProps {
  messageId: string;
  isFavorited: boolean;
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>;
  onToggle?: (messageId: string, isFavorited: boolean) => void;
}

const FavoriteButton = React.memo(function FavoriteButton({ messageId, isFavorited: initialFav, apiFetch, onToggle }: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialFav);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    const prev = isFavorited;
    setIsFavorited(!prev);
    try {
      const res = await apiFetch('/api/ai/favorites', {
        method: 'PATCH',
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) {
        setIsFavorited(prev);
        return;
      }
      const data = await res.json();
      setIsFavorited(data.isFavorited);
      onToggle?.(messageId, data.isFavorited);
    } catch {
      setIsFavorited(prev);
    } finally {
      setLoading(false);
    }
  }, [messageId, isFavorited, loading, apiFetch, onToggle]);

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-label={isFavorited ? 'Quitar de favoritos' : 'Marcar como favorito'}
      className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200 focus-visible:ring-2 focus-visible:ring-champagne/50 focus-visible:outline-none ${
        isFavorited
          ? 'text-champagne opacity-100'
          : 'text-[#999] opacity-60 hover:opacity-100 hover:text-champagne/50'
      }`}
    >
      <Star
        size={13}
        fill={isFavorited ? 'currentColor' : 'none'}
        className="transition-transform duration-200"
      />
    </button>
  );
});

export default FavoriteButton;