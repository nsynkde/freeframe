import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: { assetId: string } },
) {
  const api = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
  const res = await fetch(`${api}/assets/${params.assetId}/thumbnail`);
  if (!res.ok) return new NextResponse(null, { status: res.status });
  const blob = await res.blob();
  return new NextResponse(blob, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
