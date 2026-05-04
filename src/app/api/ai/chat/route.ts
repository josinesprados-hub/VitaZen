import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { groq, SYSTEM_PROMPTS } from '@/lib/groq';
import { checkAILimit, incrementAIUsage } from '@/lib/limits';

export async function POST(request: NextRequest) {
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

    // Check AI limits
    const limitCheck = await checkAILimit(user.id, user.plan);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Daily message limit reached. Upgrade to Premium for unlimited messages.',
          remaining: 0,
        },
        { status: 403 }
      );
    }

    const { threadId, content } = await request.json();

    if (!threadId || !content) {
      return NextResponse.json({ error: 'threadId and content required' }, { status: 400 });
    }

    // Verify thread belongs to user
    const thread = await db.aIThread.findFirst({
      where: { id: threadId, userId: user.id },
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Save user message
    await db.aIMessage.create({
      data: {
        threadId,
        role: 'user',
        content,
      },
    });

    // Get conversation history (last 20 messages)
    const history = await db.aIMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    // Build messages for Groq
    const systemPrompt = user.plan === 'PREMIUM' ? SYSTEM_PROMPTS.PREMIUM : SYSTEM_PROMPTS.FREE;

    const groqMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    ];

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: groqMessages,
      temperature: user.plan === 'PREMIUM' ? 0.8 : 0.5,
      max_tokens: user.plan === 'PREMIUM' ? 2048 : 512,
    });

    const assistantContent = completion.choices[0]?.message?.content || 'Lo siento, no pude generar una respuesta.';

    // Save assistant message
    await db.aIMessage.create({
      data: {
        threadId,
        role: 'assistant',
        content: assistantContent,
      },
    });

    // Increment usage for FREE users
    if (user.plan !== 'PREMIUM') {
      await incrementAIUsage(user.id);
    }

    // Update thread title if first message
    const messageCount = await db.aIMessage.count({ where: { threadId } });
    if (messageCount <= 2 && thread.title === 'Nueva conversación') {
      await db.aIThread.update({
        where: { id: threadId },
        data: { title: content.slice(0, 50) + (content.length > 50 ? '...' : '') },
      });
    }

    const newLimitCheck = await checkAILimit(user.id, user.plan);

    return NextResponse.json({
      message: assistantContent,
      remaining: newLimitCheck.remaining,
    });
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
