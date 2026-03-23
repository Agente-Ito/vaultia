import { NextRequest, NextResponse } from 'next/server';
import { getKeeperActivity } from '@/lib/keeper-activity/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const vaultSafes = request.nextUrl.searchParams.getAll('vault');
  const activity = await getKeeperActivity(vaultSafes);
  return NextResponse.json({ activity });
}