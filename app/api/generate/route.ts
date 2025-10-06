import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  // Inputs enviados desde el cliente
  const inputs = await req.json();

  // Solo lo necesario para la generación
  const { nombre, imagen, escena } = inputs;

  const comfyInputs = { nombre, imagen, escena };

  const res = await fetch('https://api.comfydeploy.com/api/run/deployment/queue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.COMFY_API_KEY ?? ''}`,
    },
    body: JSON.stringify({
      deployment_id: 'a0fe4004-6878-487a-ae30-b05a60821ba1',
      inputs: comfyInputs,
    }),
  });

  const data = await res.json();
  return NextResponse.json(data);
}