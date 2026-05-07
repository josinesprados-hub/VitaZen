import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getEmotionalState } from '@/lib/emotional-state';

export async function GET(request: NextRequest) {
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

    const result = await getEmotionalState(user.id, user.plan);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Emotional state error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
