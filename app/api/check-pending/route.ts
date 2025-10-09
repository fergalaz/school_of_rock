// app/api/check-pending/route.ts
import { NextResponse } from "next/server";
import { kv } from "@/lib/kv";

export const runtime = "nodejs";

function getBaseUrl() {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    // VERCEL_URL no incluye el esquema
    return `https://${vercelUrl.replace(/\/+$/, "")}`;
  }
  return ""; // como último recurso (no ideal)
}

export async function GET(req: Request) {
  // --- Auth header para el cron
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.COMFY_API_KEY ?? "";
  if (!apiKey) {
    console.error("[check-pending] Falta COMFY_API_KEY");
    return NextResponse.json({ error: "Server misconfig (COMFY_API_KEY)" }, { status: 500 });
  }

  // Carga de runs pendientes
  const pending = await kv.smembers<string>("runs:pending");
  if (!pending || pending.length === 0) {
    return NextResponse.json({ message: "No pending runs" });
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.warn("[check-pending] APP_URL/VERCEL_URL no definidos; el fetch absoluto a /api/send-email puede fallar.");
  }

  const completed: string[] = [];
  const failed: string[] = [];
  const errors: Array<{ runId: string; error: string }> = [];

  for (const runId of pending) {
    try {
      const res = await fetch(`https://api.comfydeploy.com/api/run/${runId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("[check-pending] ComfyDeploy non-200", { runId, status: res.status, body: txt });
        // no sacamos de la cola: reintento en el próximo cron
        continue;
      }

      const json = await res.json().catch(() => ({} as any));
      const rawStatus: string | undefined = json?.status;
      const outputUrl: string | undefined = json?.outputs?.[0]?.url;

      // Normalizamos estado: si hay URL, lo tratamos como éxito
      const isSuccess =
        rawStatus === "success" || rawStatus === "completed" || rawStatus === "succeeded" || !!outputUrl;

      if (isSuccess) {
        // Info del run guardada al encolarlo
        const runData = await kv.hgetall<Record<string, string>>(`run:${runId}`);

        if (runData?.email && outputUrl) {
          try {
            const sendUrl =
              baseUrl ? new URL("/api/send-email", baseUrl).toString() : "/api/send-email";

            const resp = await fetch(sendUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                imageUrl: outputUrl,
                userEmail: runData.email,
                userName: `${runData.nombre ?? ""} ${runData.apellido ?? ""}`.trim(),
                escena: runData.escena,
              }),
            });

            if (!resp.ok) {
              const body = await resp.text().catch(() => "");
              console.error("[check-pending] /api/send-email non-200", {
                runId,
                status: resp.status,
                body,
              });
            } else {
              console.log("[check-pending] Email OK", { runId, email: runData.email });
            }
          } catch (e: any) {
            console.error("[check-pending] Error enviando email", { runId, error: e?.message || String(e) });
          }
        } else {
          console.warn("[check-pending] success sin email o sin outputUrl", {
            runId,
            hasEmail: !!runData?.email,
            hasOutputUrl: !!outputUrl,
          });
        }

        completed.push(runId);
        await kv.srem("runs:pending", runId);
        await kv.del(`run:${runId}`); // limpiamos el hash de ese run
      } else if (rawStatus === "failed") {
        failed.push(runId);
        await kv.srem("runs:pending", runId);
        // mantenemos el hash por si quieres inspeccionarlo luego, o bórralo:
        // await kv.del(`run:${runId}`)
      } else {
        // Sigue en progreso -> lo dejamos en la cola para el próximo ciclo
        console.log("[check-pending] Aún en progreso", { runId, status: rawStatus });
      }
    } catch (e: any) {
      console.error("[check-pending] Error con run", runId, e);
      errors.push({ runId, error: e?.message || String(e) });
      // No sacamos de la cola: reintento en el próximo cron
    }
  }

  return NextResponse.json({
    completed,
    failed,
    total_checked: pending.length,
    errors,
  });
}