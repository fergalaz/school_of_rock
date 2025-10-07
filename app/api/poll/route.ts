import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const runId = searchParams.get("runId")

  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 })
  }

  const res = await fetch(`https://api.comfydeploy.com/api/run/${runId}`, {
    headers: {
      Authorization: `Bearer ${process.env.COMFY_API_KEY ?? ""}`,
    },
    // Evita cachear respuestas antiguas
    cache: "no-store",
  })

  const json = await res.json()

  // Campos originales de ComfyDeploy
  const { live_status, status, outputs, progress, queue_position } = json

  // Normalización del estado para el frontend
  // - algunos backends reportan "completed" / "succeeded" cuando terminó OK
  // - si ya hay una URL de salida, lo tratamos como éxito
  const hasOutputUrl = Array.isArray(outputs) && outputs[0]?.url
  const normalized_status =
    status === "success" || status === "completed" || status === "succeeded" || hasOutputUrl
      ? "success"
      : status

  return NextResponse.json({
    live_status,
    status: normalized_status,
    outputs,
    progress,
    queue_position,
    // Por si quieres ver lo bruto que vino desde la API en tus devtools:
    _raw_status: status,
  })
}