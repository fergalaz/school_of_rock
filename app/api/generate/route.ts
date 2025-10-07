import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    // Cuerpo enviado desde el cliente
    const body = await req.json().catch(() => ({} as any))

    // Extraemos SOLO lo que el workflow necesita
    const { nombre, imagen, escena } = body ?? {}

    // Validaciones mínimas (ajústalas si necesitas)
    if (!imagen) {
      return NextResponse.json(
        { error: "Falta 'imagen' en el payload" },
        { status: 400 }
      )
    }
    // nombre/escena pueden ser opcionales dependiendo del workflow;
    // si quieres forzarlos, descomenta:
    // if (!nombre) return NextResponse.json({ error: "Falta 'nombre'" }, { status: 400 })
    // if (!escena) return NextResponse.json({ error: "Falta 'escena'" }, { status: 400 })

    const apiKey = process.env.COMFY_API_KEY ?? ""
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta COMFY_API_KEY en variables de entorno" },
        { status: 500 }
      )
    }

    // Mantengo tu deployment_id
    const DEPLOYMENT_ID = "a0fe4004-6878-487a-ae30-b05a60821ba1"

    // Construimos exactamente los inputs que consume tu workflow
    const comfyInputs = { nombre, imagen, escena }

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
      // Evita respuestas cacheadas entre runs
      cache: "no-store",
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      // Propaga info útil cuando ComfyDeploy rechaza
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

    // Devuelve tal cual (incluye run_id)
    return NextResponse.json(data, { status: 200 })
  } catch (err: any) {
    return NextResponse.json(
      { error: "Fallo al encolar la generación", details: err?.message || String(err) },
      { status: 500 }
    )
  }
}