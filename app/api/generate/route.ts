import { NextRequest, NextResponse } from "next/server"
import { kv } from "@/lib/kv"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const { nombre, apellido, email, imagen, escena } = body ?? {}

    if (!imagen) {
      return NextResponse.json({ error: "Falta 'imagen' en el payload" }, { status: 400 })
    }

    const apiKey = process.env.COMFY_API_KEY ?? ""
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta COMFY_API_KEY en variables de entorno" },
        { status: 500 }
      )
    }

    const DEPLOYMENT_ID = "a0fe4004-6878-487a-ae30-b05a60821ba1"

    const comfyInputs = { nombre, apellido, email, escena, imagen }

    const res = await fetch("https://api.comfydeploy.com/api/run/deployment/queue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        deployment_id: DEPLOYMENT_ID,
        inputs: comfyInputs,
      }),
      cache: "no-store",
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || "ComfyDeploy queue error", details: data },
        { status: res.status }
      )
    }

    if (!data?.run_id) {
      return NextResponse.json(
        { error: "Respuesta de ComfyDeploy sin 'run_id'", details: data },
        { status: 502 }
      )
    }

    // ✅ Guarda el run en KV para seguimiento automático por el cron
    try {
      const record = {
        run_id: data.run_id,
        nombre,
        apellido,
        email,
        escena,
        createdAt: Date.now(),
      }
      await kv.hset(`run:${data.run_id}`, record)
      await kv.sadd("runs:pending", data.run_id)
      console.log("[generate] Run registrado en KV:", record)
    } catch (kvError) {
      console.error("[generate] Error guardando en KV:", kvError)
    }

    // Devuelve la respuesta original
    return NextResponse.json(data, { status: 200 })
  } catch (err: any) {
    console.error("[generate] Error general:", err)
    return NextResponse.json(
      { error: "Fallo al encolar la generación", details: err?.message || String(err) },
      { status: 500 }
    )
  }
}