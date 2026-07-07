export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { trackEvent } from '@/lib/analytics-server';

// GET /api/onboarding — Check onboarding status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const onboardingData = await db.onboardingData.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      completed: user.onboardingCompleted,
      data: onboardingData
        ? {
            goals: JSON.parse(onboardingData.goals),
            primaryFocus: onboardingData.primaryFocus,
            stressLevel: onboardingData.stressLevel,
            energyLevel: onboardingData.energyLevel,
            focusLevel: onboardingData.focusLevel,
            initialHabits: JSON.parse(onboardingData.initialHabits),
          }
        : null,
    });
  } catch (error) {
    console.error('Onboarding GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/onboarding — Save onboarding data
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { goals, primaryFocus, stressLevel, energyLevel, focusLevel, initialHabits, name } = body;

    // Validate required fields
    if (!primaryFocus || !stressLevel || !energyLevel || !focusLevel) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate primaryFocus
    const validFocuses = ['mente', 'disciplina', 'energia', 'riqueza'];
    if (!validFocuses.includes(primaryFocus)) {
      return NextResponse.json({ error: 'Invalid primary focus' }, { status: 400 });
    }

    // Validate levels (1-5)
    if (stressLevel < 1 || stressLevel > 5 || energyLevel < 1 || energyLevel > 5 || focusLevel < 1 || focusLevel > 5) {
      return NextResponse.json({ error: 'Levels must be between 1 and 5' }, { status: 400 });
    }

    // GLOBAL-9 FIX: Validate goals and initialHabits arrays to prevent
    // excessive payload sizes and DB bloat.
    const MAX_GOALS = 20;
    const MAX_HABITS = 20;
    const MAX_STRING_LENGTH = 100;

    // Validate goals
    if (goals !== undefined && goals !== null) {
      if (!Array.isArray(goals)) {
        return NextResponse.json({ error: 'goals must be an array' }, { status: 400 });
      }
      if (goals.length > MAX_GOALS) {
        return NextResponse.json({ error: `goals must have at most ${MAX_GOALS} items` }, { status: 400 });
      }
      for (const g of goals) {
        if (typeof g !== 'string' || g.length > MAX_STRING_LENGTH) {
          return NextResponse.json({ error: `Each goal must be a string of at most ${MAX_STRING_LENGTH} characters` }, { status: 400 });
        }
      }
    }

    // Validate initialHabits
    if (initialHabits !== undefined && initialHabits !== null) {
      if (!Array.isArray(initialHabits)) {
        return NextResponse.json({ error: 'initialHabits must be an array' }, { status: 400 });
      }
      if (initialHabits.length > MAX_HABITS) {
        return NextResponse.json({ error: `initialHabits must have at most ${MAX_HABITS} items` }, { status: 400 });
      }
      for (const h of initialHabits) {
        if (typeof h !== 'string' || !h.trim() || h.length > MAX_STRING_LENGTH) {
          return NextResponse.json({ error: `Each habit must be a non-empty string of at most ${MAX_STRING_LENGTH} characters` }, { status: 400 });
        }
      }
    }

    // Update user name if provided and current name is default (email prefix)
    if (name && typeof name === 'string' && name.trim()) {
      const currentName = user.name || '';
      const emailPrefix = user.email?.split('@')[0] || '';
      const isDefaultName = !currentName || currentName === emailPrefix;
      if (isDefaultName) {
        await db.user.update({
          where: { id: user.id },
          data: { name: name.trim() },
        });
      }
    }

    // Save onboarding data
    const onboardingData = await db.onboardingData.upsert({
      where: { userId: user.id },
      update: {
        goals: JSON.stringify(goals || []),
        primaryFocus,
        stressLevel,
        energyLevel,
        focusLevel,
        initialHabits: JSON.stringify(initialHabits || []),
      },
      create: {
        userId: user.id,
        goals: JSON.stringify(goals || []),
        primaryFocus,
        stressLevel,
        energyLevel,
        focusLevel,
        initialHabits: JSON.stringify(initialHabits || []),
      },
    });

    // Mark onboarding as completed
    await db.user.update({
      where: { id: user.id },
      data: { onboardingCompleted: true },
    });

    // Track onboarding completion
    trackEvent({ event: 'onboarding_completed', userId: user.id, properties: { primaryFocus } });

    // Create initial habits from selection
    if (initialHabits && Array.isArray(initialHabits) && initialHabits.length > 0) {
      const existingHabits = await db.habitLog.findMany({
        where: { userId: user.id, name: { in: initialHabits } },
        select: { name: true },
      });
      const existingNames = new Set(existingHabits.map((h) => h.name));
      const newHabits = initialHabits.filter((name: string) => !existingNames.has(name));

      if (newHabits.length > 0) {
        await db.habitLog.createMany({
          data: newHabits.map((name: string) => ({
            userId: user.id,
            name,
            frequency: 'daily',
          })),
        });
      }
    }

    // Boost XP for the primary focus empire
    const empireMap: Record<string, string> = {
      mente: 'mente',
      disciplina: 'disciplina',
      energia: 'energia',
      riqueza: 'riqueza',
    };

    const focusEmpire = empireMap[primaryFocus];
    if (focusEmpire) {
      await db.empireProgress.updateMany({
        where: { userId: user.id, empire: focusEmpire },
        data: { xp: { increment: 25 } },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        goals: JSON.parse(onboardingData.goals),
        primaryFocus: onboardingData.primaryFocus,
        stressLevel: onboardingData.stressLevel,
        energyLevel: onboardingData.energyLevel,
        focusLevel: onboardingData.focusLevel,
        initialHabits: JSON.parse(onboardingData.initialHabits),
      },
    });
  } catch (error) {
    console.error('Onboarding POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
