import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId')

  const res = await fetch('https://api.comfydeploy.com/api/run/' + runId, {
    headers: {
      Authorization: `Bearer ${process.env.COMFY_API_KEY ?? ''}`,
    },
  })

  const json = await res.json()

  const { live_status, status, outputs, progress, queue_position } = json

  // Now you can use the run_id in your response
  return NextResponse.json({
    live_status,
    status,
    outputs,
    progress,
    queue_position,
  })
}
