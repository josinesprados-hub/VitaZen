export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { groq, SYSTEM_PROMPTS } from '@/lib/groq';
import { checkAILimit, getDailyLimit, rollbackAILimit } from '@/lib/limits';
import { buildMentorContext, buildContextualSystemPrompt } from '@/lib/mentor-context';
import { trackEvent } from '@/lib/analytics-server';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';

async function handler(request: NextRequest) {
  // T-2 FIX: Track whether the AI limit was consumed so we can roll it back
  // if the Groq call fails. checkAILimit() atomically increments the counter
  // BEFORE the Groq API is called — if Groq fails, the credit must be
  // returned to avoid permanently locking out FREE users after 15 failed
  // retries.
  let limitConsumed = false;
  let userId: string | null = null;
  let userPlan: string | null = null;

  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    userId = user.id;
    userPlan = user.plan;

    const isPremium = user.plan === 'PREMIUM';
    const dailyLimit = getDailyLimit(user.plan);

    // Check AI limits
    const limitCheck = await checkAILimit(user.id, user.plan);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Daily message limit reached. Con Élite, mensajes ilimitados.',
          remaining: 0,
          limit: dailyLimit,
          plan: user.plan,
        },
        { status: 403 }
      );
    }

    // Limit was consumed — any failure after this point must roll it back.
    limitConsumed = true;

    const { threadId, content } = await request.json();

    if (!threadId || !content) {
      return NextResponse.json({ error: 'threadId and content required' }, { status: 400 });
    }

    // Validate content length to prevent abuse
    if (content.length > 4000) {
      return NextResponse.json({ error: 'Message too long (max 4000 characters)' }, { status: 400 });
    }

    // Verify thread belongs to user and is not archived
    const thread = await db.aIThread.findFirst({
      where: { id: threadId, userId: user.id, archived: false },
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found or archived' }, { status: 404 });
    }

    // Get conversation history: FREE last 10 messages, PREMIUM last 30
    // Fetch most recent first, then reverse for chronological order
    // Reserve 1 slot for the current user message (appended manually to groqMessages)
    const historyLimit = isPremium ? 30 : 10;
    const recentHistory = await db.aIMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: historyLimit - 1,
    });
    const history = recentHistory.reverse();

    // Build contextual system prompt with user's recent activity
    const basePrompt = isPremium ? SYSTEM_PROMPTS.PREMIUM : SYSTEM_PROMPTS.FREE;
    let systemPrompt: string = basePrompt;

    try {
      const userContext = await buildMentorContext(user.id, user.plan);
      systemPrompt = buildContextualSystemPrompt(basePrompt, userContext);
    } catch (ctxError) {
      // If context building fails, fall back to base prompt — never block the chat
      serverLog.error('api/ai/chat', 'Context build error (non-blocking)', ctxError);
    }

    const groqMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content },
    ];

    // Call Groq API — PREMIUM gets more tokens and creativity
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: groqMessages,
      temperature: isPremium ? 0.8 : 0.5,
      max_tokens: isPremium ? 2048 : 800,
    });

    const assistantContent = completion.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';

    // Save user and assistant messages atomically — prevents orphans if DB fails mid-save
    await db.$transaction([
      db.aIMessage.create({
        data: {
          threadId,
          role: 'user',
          content,
        },
      }),
      db.aIMessage.create({
        data: {
          threadId,
          role: 'assistant',
          content: assistantContent,
        },
      }),
    ]);

    // Usage was already incremented atomically inside checkAILimit()

    // Track mentor usage (privacy-first, no message content stored)
    trackEvent({ event: 'mentor_used', userId: user.id, properties: { plan: user.plan, threadId } });

    // Auto-generate title using AI if this is the first exchange
    const messageCount = await db.aIMessage.count({ where: { threadId } });
    if (messageCount <= 2 && thread.title === 'Nueva conversación') {
      try {
        const titleCompletion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Genera un título corto de máximo 6 palabras para esta conversación. Solo el título, sin comillas ni explicaciones. En español.',
            },
            {
              role: 'user',
              content: content.slice(0, 200),
            },
          ],
          temperature: 0.3,
          max_tokens: 20,
        });

        const generatedTitle = titleCompletion.choices[0]?.message?.content?.trim();
        if (generatedTitle && generatedTitle.length > 0 && generatedTitle.length <= 80) {
          await db.aIThread.update({
            where: { id: threadId },
            data: { title: generatedTitle },
          });
        }
      } catch {
        // Fallback to simple title if AI generation fails
        await db.aIThread.update({
          where: { id: threadId },
          data: { title: content.slice(0, 50) + (content.length > 50 ? '...' : '') },
        });
      }
    }

    // Update thread updatedAt timestamp
    await db.aIThread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      message: assistantContent,
      remaining: limitCheck.remaining,
      limit: dailyLimit,
      contextual: true,
      plan: user.plan,
    });
  } catch (error) {
    // T-2 FIX: If the AI limit was consumed (checkAILimit passed) but the
    // request failed (Groq error, DB error, etc.), roll back the consumed
    // credit so the user is not permanently penalized for a server-side
    // failure. Without this, a FREE user who hit 15 failed retries would be
    // locked out for the rest of the day without ever receiving a response.
    if (limitConsumed && userId && userPlan) {
      try {
        await rollbackAILimit(userId, userPlan);
      } catch (rollbackError) {
        // Never let the rollback failure mask the original error
        serverLog.error('api/ai/chat', 'AI limit rollback failed', rollbackError);
      }
    }
    serverLog.apiError('api/ai/chat', 'POST', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withTiming('api/ai/chat', handler, { slowThresholdMs: 10_000 });
