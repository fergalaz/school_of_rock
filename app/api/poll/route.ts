import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// Extrae de forma robusta la primera URL de imagen del arreglo outputs
function firstImageUrlFromOutputs(outputs: any): string | null {
  if (!Array.isArray(outputs)) return null

  // 1) Caso común: outputs[0].images[0].url
  for (const item of outputs) {
    const imgs = item?.images
    if (Array.isArray(imgs)) {
      for (const img of imgs) {
        if (img?.url && typeof img.url === "string") return img.url
      }
    }
  }

  // 2) Caso alterno: outputs[i].url
  for (const item of outputs) {
    if (item?.url && typeof item.url === "string") return item.url
  }

  // 3) Caso anidado: outputs[i].data.images[].url o outputs[i].data.url
  for (const item of outputs) {
    const dataImgs = item?.data?.images
    if (Array.isArray(dataImgs)) {
      for (const img of dataImgs) {
        if (img?.url && typeof img.url === "string") return img.url
      }
    }
    if (item?.data?.url && typeof item.data.url === "string") return item.data.url
  }

  return null
}

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

  // Detecta primera URL (útil para logs/diagnóstico)
  const firstUrl = firstImageUrlFromOutputs(outputs)

  // Normalización del estado para el frontend
  // - algunos backends reportan "completed" / "succeeded" cuando terminó OK
  // - si ya hay una URL de salida, lo tratamos como éxito
  const normalized_status =
    status === "success" || status === "completed" || status === "succeeded" || !!firstUrl
      ? "success"
      : status

  // 📜 Log visible en Runtime Logs (no expone secretos)
  console.log("[poll]", {
    runId,
    status: normalized_status,
    live_status,
    progress,
    queue_position,
    firstUrl,
    _raw_status: status,
  })

  return NextResponse.json({
    live_status,
    status: normalized_status,
    outputs,
    progress,
    queue_position,
    // Campos solo informativos (tu UI los ignora):
    _raw_status: status,
    _first_url: firstUrl,
  })
}