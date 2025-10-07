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

  // Extrae una URL válida si está disponible en cualquiera de los dos formatos
  const first = Array.isArray(outputs) ? outputs[0] : undefined
  const foundUrl: string | undefined =
    first?.url || first?.images?.[0]?.url || first?.image?.url

  // Normaliza: considera éxito si el backend dice success/completed/succeeded O si ya hay URL
  const normalized_status =
    status === "success" ||
    status === "completed" ||
    status === "succeeded" ||
    !!foundUrl
      ? "success"
      : status

  // Si encontramos una URL pero el objeto original no tenía `url` arriba,
  // devolvemos un outputs enriquecido para simplificar el frontend.
  let normalizedOutputs = outputs
  if (foundUrl && (!first || !first.url)) {
    normalizedOutputs = [
      {
        ...first,
        url: foundUrl,
      },
      ...(Array.isArray(outputs) ? outputs.slice(1) : []),
    ]
  }

  return NextResponse.json({
    live_status,
    status: normalized_status,
    outputs: normalizedOutputs,
    progress,
    queue_position,
    _raw_status: status,
  })
}