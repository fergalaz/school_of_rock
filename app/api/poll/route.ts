import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

// Caché en memoria para evitar dobles envíos por el mismo runId (idempotencia best-effort)
const sentCache: Set<string> =
  (globalThis as any).__sentEmailRunIds || new Set<string>()
;(globalThis as any).__sentEmailRunIds = sentCache

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const runId = searchParams.get("runId")

  // Datos opcionales para el envío server-side
  const email = searchParams.get("email") || ""
  const userName = searchParams.get("userName") || ""
  const nombre = searchParams.get("nombre") || ""
  const apellido = searchParams.get("apellido") || ""
  const escena = searchParams.get("escena") || ""
  // Permite desactivar el envío server-side si algún día lo necesitas (&serverSend=0)
  const serverSend = (searchParams.get("serverSend") ?? "1") === "1"

  if (!runId) {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 })
  }

  const res = await fetch(`https://api.comfydeploy.com/api/run/${runId}`, {
    headers: {
      Authorization: `Bearer ${process.env.COMFY_API_KEY ?? ""}`,
    },
    // Evitar cachear respuestas antiguas
    cache: "no-store",
  })

  const json = await res.json()

  // Campos originales de ComfyDeploy
  const { live_status, status, outputs, progress, queue_position } = json

  // Normalización del estado para el frontend
  const hasOutputUrl = Array.isArray(outputs) && !!outputs[0]?.url
  const normalized_status =
    status === "success" || status === "completed" || status === "succeeded" || hasOutputUrl
      ? "success"
      : status

  // ---- Disparo de email desde el servidor (una vez por runId) ----
  let emailTriggered = false
  let emailReason = ""

  if (
    serverSend &&
    normalized_status === "success" &&
    hasOutputUrl &&
    email && // necesitamos al menos el correo del usuario
    !sentCache.has(runId) // no repetir por runId en esta instancia
  ) {
    try {
      const imageUrl: string = outputs[0].url
      const host = req.headers.get("host") || ""
      const baseUrl = host ? `https://${host}` : ""

      // Hacemos POST a nuestra propia ruta /api/send-email (server-to-server)
      const r = await fetch(`${baseUrl}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          userEmail: email,
          userName,
          nombre,
          apellido,
          escena,
        }),
        cache: "no-store",
      })

      if (!r.ok) {
        emailReason = `send-email returned ${r.status}`
      } else {
        sentCache.add(runId)
        emailTriggered = true
        emailReason = "sent"
      }
    } catch (e: any) {
      emailReason = `send-email error: ${e?.message || "unknown"}`
    }
  } else {
    // Motivo por el cual no se disparó (útil para debugging en logs)
    if (!serverSend) emailReason = "serverSend disabled"
    else if (normalized_status !== "success") emailReason = `status=${normalized_status}`
    else if (!hasOutputUrl) emailReason = "no output url"
    else if (!email) emailReason = "missing email"
    else if (sentCache.has(runId)) emailReason = "already sent for runId"
  }

  return NextResponse.json({
    live_status,
    status: normalized_status,
    outputs,
    progress,
    queue_position,
    _raw_status: status, // para inspección
    // Datos de control del envío server-side
    _server_send: serverSend,
    _email_triggered: emailTriggered,
    _email_reason: emailReason,
    _sent_cache_size: sentCache.size,
  })
}