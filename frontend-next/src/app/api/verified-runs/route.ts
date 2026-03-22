import { NextResponse } from 'next/server';
import { getVerifiedRuns } from '@/lib/verified-runs/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ runs: getVerifiedRuns() });
}