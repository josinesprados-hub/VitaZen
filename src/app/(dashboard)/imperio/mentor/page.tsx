'use client';

import { useEffect, useState, useRef } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { Sparkles, Send, Plus, Trash2, MessageCircle, Lock } from 'lucide-react';
import Link from 'next/link';

interface Thread {
  id: string;
  title: string;
  updatedAt: string;
  messages?: { content: string; role: string; createdAt: string }[];
}

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

export default function MentorPage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    if (activeThread) {
      fetchMessages(activeThread);
    }
  }, [activeThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchThreads = async () => {
    try {
      const res = await apiFetch('/api/ai/threads');
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads);
        if (data.threads.length > 0 && !activeThread) {
          setActiveThread(data.threads[0].id);
        }
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchMessages = async (threadId: string) => {
    try {
      const res = await apiFetch(`/api/ai/threads/${threadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (e) { console.error(e); }
  };

  const createThread = async () => {
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'POST',
        body: JSON.stringify({ title: 'Nueva conversación' }),
      });
      if (res.ok) {
        const data = await res.json();
        setThreads([data.thread, ...threads]);
        setActiveThread(data.thread.id);
        setMessages([]);
      } else {
        const data = await res.json();
        if (data.error?.includes('Maximum')) {
          alert('Has alcanzado el límite de 5 conversaciones. Elimina una para crear otra nueva.');
        }
      }
    } catch (e) { console.error(e); }
  };

  const deleteThread = async (threadId: string) => {
    if (!confirm('¿Deseas eliminar esta conversación?')) return;
    try {
      const res = await apiFetch('/api/ai/threads', {
        method: 'DELETE',
        body: JSON.stringify({ threadId }),
      });
      if (res.ok) {
        setThreads(threads.filter(t => t.id !== threadId));
        if (activeThread === threadId) {
          const remaining = threads.filter(t => t.id !== threadId);
          setActiveThread(remaining.length > 0 ? remaining[0].id : null);
          setMessages([]);
        }
      }
    } catch (e) { console.error(e); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeThread || sending) return;

    const userMessage: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: input,
      createdAt: new Date().toISOString(),
    };
    setMessages([...messages, userMessage]);
    setInput('');
    setSending(true);

    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ threadId: activeThread, content: input }),
      });

      if (res.status === 403) {
        const data = await res.json();
        setShowLimitModal(true);
        setRemaining(0);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const assistantMessage: Message = {
          id: 'resp-' + Date.now(),
          role: 'assistant',
          content: data.message,
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
        setRemaining(data.remaining);
      }
    } catch (e) { console.error(e); }
    finally { setSending(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Sparkles size={32} className="text-[#c8a55a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
          <Sparkles size={28} className="text-[#c8a55a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Mentor IA</h1>
          <p className="text-[#999] text-sm">Tu guía experto de desarrollo personal</p>
        </div>
      </div>

      <div className="flex h-[calc(100%-6rem)] gap-5">
        {/* Thread list */}
        <div className="w-64 shrink-0 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex flex-col">
          <div className="p-4 border-b border-[#1a1a1a]">
            <button
              onClick={createThread}
              className="w-full flex items-center justify-center gap-2 bg-[#c8a55a] text-black font-semibold py-2 rounded-lg hover:bg-[#d4b468] transition-colors text-sm"
            >
              <Plus size={16} /> Nueva conversación
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={`flex items-center justify-between rounded-lg p-3 cursor-pointer transition-colors ${
                  activeThread === thread.id ? 'bg-[#c8a55a]/10 text-[#c8a55a]' : 'text-white hover:bg-[#1a1a1a]'
                }`}
                onClick={() => setActiveThread(thread.id)}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageCircle size={14} className="shrink-0" />
                  <span className="text-sm truncate">{thread.title}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteThread(thread.id); }}
                  className="text-[#666] hover:text-red-400 shrink-0 ml-2"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {threads.length === 0 && (
              <p className="text-[#666] text-xs text-center py-4">Sin conversaciones aún</p>
            )}
          </div>
          {user?.plan === 'FREE' && remaining !== null && (
            <div className="p-3 border-t border-[#1a1a1a] text-center">
              <p className="text-xs text-[#999]">
                {remaining === Infinity ? '∞' : remaining} mensajes restantes hoy
              </p>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl flex flex-col">
          {activeThread ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Sparkles size={48} className="text-[#c8a55a] mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">Tu Mentor IA</h3>
                      <p className="text-[#999] text-sm max-w-md">
                        {user?.plan === 'PREMIUM'
                          ? 'Soy tu mentor experto en desarrollo personal. Pregúntame lo que necesites sobre hábitos, mindset, productividad o crecimiento personal.'
                          : 'Soy tu asistente de bienestar. Pregúntame sobre hábitos y bienestar.'}
                      </p>
                    </div>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-xl p-4 ${
                      msg.role === 'user'
                        ? 'bg-[#c8a55a]/10 border border-[#c8a55a]/20'
                        : 'bg-[#000000] border border-[#1a1a1a]'
                    }`}>
                      <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-[#000000] border border-[#1a1a1a] rounded-xl p-4">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-[#c8a55a] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-[#c8a55a] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-[#c8a55a] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-[#1a1a1a]">
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escribe tu mensaje..."
                    className="flex-1 bg-[#000000] border border-[#1a1a1a] rounded-lg px-4 py-3 text-white text-sm placeholder-[#666] focus:border-[#c8a55a]"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim()}
                    className="bg-[#c8a55a] text-black font-semibold px-4 py-3 rounded-lg hover:bg-[#d4b468] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Sparkles size={48} className="text-[#c8a55a] mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Mentor IA</h3>
                <p className="text-[#999] text-sm">Crea una conversación para comenzar</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Limit Modal */}
      {showLimitModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-8 max-w-md w-full text-center">
            <Lock size={48} className="text-[#c8a55a] mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Límite diario alcanzado</h3>
            <p className="text-[#999] mb-6">
              Has utilizado tus 10 mensajes diarios del plan Free. Mejora a Premium para disfrutar de mensajes ilimitados y un mentor más avanzado.
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/pricing"
                className="bg-[#c8a55a] text-black font-semibold px-6 py-3 rounded-lg hover:bg-[#d4b468] transition-colors"
                onClick={() => setShowLimitModal(false)}
              >
                Mejorar a Premium
              </Link>
              <button
                onClick={() => setShowLimitModal(false)}
                className="text-[#999] px-6 py-3 hover:text-white transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
