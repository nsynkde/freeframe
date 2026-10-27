import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const api = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
  const res = await fetch(`${api}/assets/${(await params).assetId}/info`);
  if (!res.ok) return new NextResponse(null, { status: res.status });
  const data = await res.json();
  return NextResponse.json(data, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
