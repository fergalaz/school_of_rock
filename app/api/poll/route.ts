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
    cache: "no-store",
  })

  const json = await res.json()

  const { live_status, status, outputs, progress, queue_position } = json

  // Detecta URL de salida en ambas formas posibles
  const first = Array.isArray(outputs) ? outputs[0] : undefined
  const output_url =
    first?.url ||
    first?.image || // por si alguna variante trae `image`
    (Array.isArray(first?.images) ? first?.images?.[0]?.url : undefined)

  // Normaliza el estado a "success" si ya hay URL o si viene esa familia de estados
  const normalized_status =
    status === "success" || status === "completed" || status === "succeeded" || !!output_url
      ? "success"
      : status

  return NextResponse.json({
    live_status,
    status: normalized_status,
    outputs,
    progress,
    queue_position,
    // ayuda de debug para confirmar qué llegó realmente
    _raw_status: status,
    _detected_url: output_url ?? null,
  })
}