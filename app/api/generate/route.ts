import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Inputs sent from the client form
  const inputs = await req.json();

  const res = await fetch('https://api.comfydeploy.com/api/run/deployment/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.COMFY_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      deployment_id: 'a0fe4004-6878-487a-ae30-b05a60821ba1',
      inputs: inputs,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data);
}
