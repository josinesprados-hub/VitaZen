export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { groq, GROQ_MODEL, SYSTEM_PROMPTS } from '@/lib/groq';
import { checkAILimit, getDailyLimit, rollbackAILimit } from '@/lib/limits';
import { buildMentorContext, buildContextualSystemPrompt } from '@/lib/mentor-context';
import { trackEvent } from '@/lib/analytics-server';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';
import { getUnderstandingContext, extractAndPersist } from '@/lib/understanding/engine';
import { optimizeContext } from '@/lib/decision/engine';
import { reason } from '@/lib/reasoning/engine';

async function handler(request: NextRequest) {
  // T-2 FIX: Track whether the AI limit was consumed so we can roll it back
  // if the Groq call fails. checkAILimit() atomically increments the counter
  // BEFORE the Groq API is called — if Groq fails, the credit must be
  // returned to avoid permanently locking out FREE users after 15 failed
  // retries.
  let limitConsumed = false;
  let userId: string | null = null;
  let userPlan: string | null = null;
  let threadLockKey: bigint | null = null;

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

    // FINAL-2 FIX: All validations must pass BEFORE consuming the AI credit.
    // Previously checkAILimit() was called first, atomically incrementing the
    // counter. But return statements for missing threadId, content too long,
    // or thread not found did NOT trigger the catch block (return ≠ throw),
    // so the credit was permanently lost. Now we validate everything first,
    // then consume the credit only when we're committed to calling Groq.
    // The advisory lock inside checkAILimit handles concurrency between
    // requests that both pass validation.

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

    // All validations passed — now consume the AI credit. Any failure after
    // this point (Groq error, DB save error) will trigger rollback in the
    // catch block via rollbackAILimit().
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

    // Credit consumed — any failure from here triggers rollback.
    limitConsumed = true;

    // H-2 FIX: Acquire a session-level advisory lock keyed on the threadId
    // before reading history and calling Groq. This prevents two concurrent
    // sends to the same thread from reading the same history and saving
    // interleaved messages (userA, userB, assistantA, assistantB). Different
    // threads are NOT blocked — only sends to the SAME thread are serialized.
    //
    // We use pg_advisory_lock (session-level, not transaction-level) because
    // the Groq API call takes 2-5 seconds and must NOT hold a DB transaction
    // open during that time. The lock is released in the finally block below
    // via pg_advisory_unlock.
    const threadLockSeed = 'ai_thread|' + threadId;
    const threadLockKeyResult = await db.$queryRaw<Array<{ key: bigint }>>`
      SELECT ('x' || substring(md5(${threadLockSeed}), 1, 16))::bit(64)::bigint AS key
    `;
    threadLockKey = threadLockKeyResult[0]?.key ?? null;
    if (threadLockKey !== null) {
      await db.$executeRaw`SELECT pg_advisory_lock(${threadLockKey})`;
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
    // L-8 FIX: Track whether context was successfully built so the response
    // accurately reflects whether the mentor had user context.
    const basePrompt = isPremium ? SYSTEM_PROMPTS.PREMIUM : SYSTEM_PROMPTS.FREE;
    let systemPrompt: string = basePrompt;
    let contextBuilt = false;

    try {
      const userContext = await buildMentorContext(user.id, user.plan);
      systemPrompt = buildContextualSystemPrompt(basePrompt, userContext);
      contextBuilt = true;
    } catch (ctxError) {
      // If context building fails, fall back to base prompt — never block the chat
      serverLog.error('api/ai/chat', 'Context build error (non-blocking)', ctxError);
    }

    // EUU-1: Emotional Understanding — learn HOW to help this user better.
    // READ path: fetch confirmed insights → inject adaptation instructions.
    // Runs in a separate try/catch so it never blocks the existing context flow.
    // PREMIUM gets up to 4 adaptation instructions; FREE gets up to 1.
    try {
      const understandingCtx = await getUnderstandingContext(user.id, user.plan);
      if (understandingCtx.adaptationSnippet) {
        // Inject as a separate invisible block after context — the mentor
        // internalizes the guidance without ever revealing the learning process.
        systemPrompt = systemPrompt + '\n\n' + understandingCtx.adaptationSnippet;
      }
    } catch (euuError) {
      // Non-blocking: if understanding fails, continue without adaptation
      serverLog.error('api/ai/chat', 'Understanding engine error (non-blocking)', euuError);
    }

    // DE-1: Decision Engine — decide which context the mentor should use.
    // Takes the fully assembled system prompt + user message, returns optimized version.
    // Zero DB queries. Zero API calls. Pure string analysis. <1ms.
    // Non-blocking: on any error, the original systemPrompt is used as-is.
    try {
      const decision = optimizeContext(systemPrompt, content, user.plan);
      systemPrompt = decision.systemPrompt;
    } catch (deError) {
      // Non-blocking: if decision engine fails, use the unfiltered prompt
      serverLog.error('api/ai/chat', 'Decision engine error (non-blocking)', deError);
    }

    // RE-1: Reasoning Engine — decide HOW the mentor should use the available context.
    // Takes the optimized prompt + user message + history, returns reasoning instruction.
    // Zero DB queries. Zero API calls. Pure string analysis. <1ms.
    // Non-blocking: on any error, the prompt is used without reasoning instruction.
    // The Decision Engine decides WHAT context to use.
    // The Reasoning Engine decides HOW to use it.
    try {
      const reasoning = reason({
        userMessage: content,
        history: history.map(msg => ({ role: msg.role, content: msg.content })),
        plan: user.plan,
        systemPrompt,
      });
      if (reasoning.instructionSnippet) {
        systemPrompt = systemPrompt + '\n\n' + reasoning.instructionSnippet;
      }
    } catch (reError) {
      // Non-blocking: if reasoning engine fails, use the prompt as-is
      serverLog.error('api/ai/chat', 'Reasoning engine error (non-blocking)', reError);
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
    // TIMEOUT FIX: Pass request.signal to the Groq SDK so that when the
    // client disconnects (e.g. 15s timeout in useApi, user navigates away),
    // the server aborts the underlying HTTP request to Groq immediately
    // instead of continuing to wait for a response that nobody will receive.
    // The groq-sdk (v1.1.2+) accepts { signal } as RequestOptions.
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: groqMessages,
      temperature: isPremium ? 0.8 : 0.5,
      max_tokens: isPremium ? 2048 : 800,
    }, { signal: request.signal });

    // L-10 FIX: Treat an empty Groq response as an error, not a fallback.
    // Previously, an empty response was replaced with a fallback string,
    // saved to DB, and consumed a credit. Now we throw to trigger the
    // catch block, which rolls back the credit and returns a 500.
    const assistantContent = completion.choices[0]?.message?.content;
    if (!assistantContent || !assistantContent.trim()) {
      throw new Error('Groq returned an empty response');
    }

    // Save user and assistant messages atomically — prevents orphans if DB fails mid-save
    const [, assistantMsg] = await db.$transaction([
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

    // M-2 FIX: Messages are now persisted. The credit is definitively consumed.
    // Set limitConsumed = false so that any failure AFTER this point (title
    // generation, updatedAt update) does NOT trigger a rollback in the catch
    // block. Previously, a title generation failure could propagate to the
    // outer catch, which rolled back the credit — giving the user a free
    // message (messages saved but credit refunded) and showing a 500 error
    // for a request that actually succeeded.
    limitConsumed = false;

    // Usage was already incremented atomically inside checkAILimit()

    // Track mentor usage (privacy-first, no message content stored)
    trackEvent({ event: 'mentor_used', userId: user.id, properties: { plan: user.plan, threadId } });

    // EUU-2: Emotional Understanding — WRITE path (fire-and-forget).
    // Extract behavioral signals from the user's message and persist as hypotheses.
    // Runs AFTER messages are saved. Non-blocking. Silently swallowed on failure.
    // This is the learning phase — it does NOT affect the current response.
    extractAndPersist({
      userId: user.id,
      threadId,
      userMessage: content,
      assistantMessage: assistantContent,
    }).catch(() => {
      // Fire-and-forget: extraction failure must never affect the user
    });

    // Auto-generate title using AI if this is the first exchange
    const messageCount = await db.aIMessage.count({ where: { threadId } });
    if (messageCount <= 2 && thread.title === 'Nueva conversación') {
      try {
        // Also propagate client signal to the title generation call
        const titleCompletion = await groq.chat.completions.create({
          model: GROQ_MODEL,
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
        }, { signal: request.signal });

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
      messageId: assistantMsg.id,
      remaining: limitCheck.remaining,
      limit: dailyLimit,
      contextual: contextBuilt,
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
  } finally {
    // H-2 FIX: Release the per-thread advisory lock.
    // This runs on both success and error paths.
    if (threadLockKey !== null) {
      try {
        await db.$executeRaw`SELECT pg_advisory_unlock(${threadLockKey})`;
      } catch {
        // Non-blocking — lock will auto-expire when the connection is returned to the pool
      }
    }
  }
}

export const POST = withTiming('api/ai/chat', handler, { slowThresholdMs: 10_000 });
