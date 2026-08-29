export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { validateAvatarUrlServer } from '@/lib/avatar';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

// GET /api/profile — Fetch current user profile
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

    return NextResponse.json({
      profile: {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        country: user.country,
        city: user.city,
        age: user.age,
        bio: user.bio,
        email: user.email,
        plan: user.plan,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('[Profile] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/profile — Update current user profile
export async function PUT(request: NextRequest) {
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

    const rl = await rateLimit(user.id, 'profile:put', RATE_LIMITS['profile:put']);
    if (rl.limited) return rateLimitedResponse(rl);

    const body = await request.json();
    const { name, avatarUrl, country, city, age, bio } = body;

    // Validate field lengths
    if (name !== undefined && name !== null && name.length > 100) {
      return NextResponse.json({ error: 'Name too long (max 100 chars)' }, { status: 400 });
    }
    if (bio !== undefined && bio !== null && bio.length > 300) {
      return NextResponse.json({ error: 'Bio too long (max 300 chars)' }, { status: 400 });
    }
    if (age !== undefined && age !== null && (age < 1 || age > 150)) {
      return NextResponse.json({ error: 'Invalid age' }, { status: 400 });
    }
    if (country !== undefined && country !== null && country.length > 80) {
      return NextResponse.json({ error: 'Country name too long' }, { status: 400 });
    }
    if (city !== undefined && city !== null && city.length > 80) {
      return NextResponse.json({ error: 'City name too long' }, { status: 400 });
    }

    // Validate avatar URL (data URL format, size, type)
    const avatarError = validateAvatarUrlServer(avatarUrl);
    if (avatarError) {
      return NextResponse.json({ error: avatarError }, { status: 400 });
    }

    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined && { name: name || null }),
        ...(avatarUrl !== undefined && { avatarUrl: avatarUrl || null }),
        ...(country !== undefined && { country: country || null }),
        ...(city !== undefined && { city: city || null }),
        ...(age !== undefined && { age: age || null }),
        ...(bio !== undefined && { bio: bio || null }),
      },
    });

    return NextResponse.json({
      profile: {
        id: updatedUser.id,
        name: updatedUser.name,
        avatarUrl: updatedUser.avatarUrl,
        country: updatedUser.country,
        city: updatedUser.city,
        age: updatedUser.age,
        bio: updatedUser.bio,
        email: updatedUser.email,
        plan: updatedUser.plan,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (error) {
    console.error('[Profile] PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
