// @vitest-environment jsdom
// N-8 · §13 — Mentor chat accessibility contracts:
//  - textarea and send button have accessible names
//  - sending does NOT disable the textarea (focus is preserved) and
//    sends are guarded while in flight
//  - the conversation is a named role="log" live region
//  - the typing indicator is a role="status" with textual content
//  - messages identify their author for screen readers

import React, { createRef } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInput from '@/components/mentor/ChatInput';
import MessageList from '@/components/mentor/MessageList';
import MessageBubble from '@/components/mentor/MessageBubble';
import { Sparkles } from 'lucide-react';
import type { Message } from '@/components/mentor/MentorChatTypes';

afterEach(cleanup);

const baseMessage = (over: Partial<Message>): Message => ({
  id: 'm1',
  role: 'user',
  content: 'Hola mentor',
  createdAt: new Date().toISOString(),
  ...over,
});

describe('ChatInput — nombres accesibles y foco estable (N-8 §8/§13)', () => {
  function renderInput(over: Partial<Parameters<typeof ChatInput>[0]> = {}) {
    const props: Parameters<typeof ChatInput>[0] = {
      input: '',
      onInputChange: () => {},
      onSend: () => {},
      sending: false,
      isPremium: true,
      remaining: null,
      isArchived: false,
      inputRef: createRef(),
      onShowLimitModal: () => {},
      ...over,
    };
    render(<ChatInput {...props} />);
    return props;
  }

  it('el textarea tiene nombre accesible (no solo placeholder)', () => {
    renderInput();
    expect(screen.getByRole('textbox', { name: 'Escribe tu mensaje al mentor' })).toBeTruthy();
  });

  it('el botón enviar tiene nombre accesible', () => {
    renderInput({ input: 'hola' });
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeTruthy();
  });

  it('el textarea permanece activo mientras se envía (el foco no cae al body)', () => {
    renderInput({ sending: true });
    const textarea = screen.getByRole('textbox', { name: 'Escribe tu mensaje al mentor' }) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });

  it('Enter no envía mientras hay un envío en curso (guard)', async () => {
    const onSend = vi.fn();
    renderInput({ sending: true, onSend });
    const textarea = screen.getByRole('textbox', { name: 'Escribe tu mensaje al mentor' });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Enter envía cuando no se está enviando', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderInput({ input: 'hola', onSend });
    const textarea = screen.getByRole('textbox', { name: 'Escribe tu mensaje al mentor' });
    textarea.focus();
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

describe('MessageList — conversación como live region (N-8 §8/§13)', () => {
  function renderList(messages: Message[], sending: boolean) {
    const scrollRef = createRef<HTMLDivElement>();
    const endRef = createRef<HTMLDivElement>();
    const inputRef = createRef<HTMLTextAreaElement>();
    render(
      <MessageList
        messages={messages}
        isPremium={false}
        sending={sending}
        apiFetch={vi.fn() as unknown as (url: string, init?: RequestInit) => Promise<Response>}
        onToggleFavorite={() => {}}
        onSetInput={() => {}}
        scrollContainerRef={scrollRef}
        messagesEndRef={endRef}
        chatInputRef={inputRef}
        IconComponent={Sparkles}
      />
    );
  }

  it('el contenedor de mensajes es role="log" con nombre accesible', () => {
    renderList([], false);
    expect(screen.getByRole('log', { name: 'Conversación con el mentor' })).toBeTruthy();
  });

  it('el indicador de escritura es role="status" con texto ("El mentor está escribiendo…")', () => {
    renderList([], true);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('El mentor está escribiendo');
  });

  it('sin estado sending no hay indicador anunciado', () => {
    renderList([], false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('MessageBubble — autoría distinguible (N-8 §8/§13)', () => {
  it('mensaje del usuario lleva etiqueta sr-only "Tú:"', () => {
    render(
      <MessageBubble
        msg={baseMessage({ role: 'user', content: 'Buenos días' })}
        isPremium={false}
        apiFetch={vi.fn() as unknown as (url: string, init?: RequestInit) => Promise<Response>}
        onToggleFavorite={() => {}}
        animationDelay={0}
      />
    );
    expect(screen.getByText('Tú:')).toBeTruthy();
    expect(screen.getByText('Buenos días')).toBeTruthy();
  });

  it('respuesta del Mentor lleva etiqueta sr-only "Mentor:"', () => {
    render(
      <MessageBubble
        msg={baseMessage({ role: 'assistant', content: 'Hola, ¿cómo estás?' })}
        isPremium={false}
        apiFetch={vi.fn() as unknown as (url: string, init?: RequestInit) => Promise<Response>}
        onToggleFavorite={() => {}}
        animationDelay={0}
      />
    );
    expect(screen.getByText('Mentor:')).toBeTruthy();
    expect(screen.getByText('Hola, ¿cómo estás?')).toBeTruthy();
  });
});
