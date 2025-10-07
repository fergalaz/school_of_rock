import { type NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

export const runtime = "nodejs"

const resend = new Resend(process.env.RESEND_API_KEY)

function splitName(userName?: string, nombre?: string, apellido?: string) {
  if (userName && userName.trim()) {
    const parts = userName.trim().split(/\s+/)
    const first = parts[0]
    const last = parts.slice(1).join(" ")
    return { firstName: first, lastName: last, displayName: userName.trim() }
  }
  const first = (nombre || "").trim()
  const last = (apellido || "").trim()
  const display = [first, last].filter(Boolean).join(" ").trim() || first || last || "Rockstar"
  return { firstName: first || "Rockstar", lastName: last, displayName: display }
}

function guessExtAndMime(url: string) {
  const lower = url.toLowerCase()
  if (lower.endsWith(".png")) return { ext: "png", mime: "image/png" }
  if (lower.endsWith(".webp")) return { ext: "webp", mime: "image/webp" }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return { ext: "jpg", mime: "image/jpeg" }
  return { ext: "jpg", mime: "image/jpeg" }
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, userEmail, userName, nombre, apellido, escena } = await req.json()

    if (!imageUrl || !userEmail) {
      return NextResponse.json({ error: "Missing required fields: imageUrl or userEmail" }, { status: 400 })
    }

    const { firstName, lastName, displayName } = splitName(userName, nombre, apellido)
    const FROM_EMAIL = process.env.FROM_EMAIL || "School of Rock <rockstar@nube.media>"
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "fgalaz@mstudioprod.com"

    // Descargar imagen para adjunto (si falla, enviamos solo el link)
    let attachment: { filename: string; content: string } | null = null
    try {
      const resImg = await fetch(imageUrl)
      if (!resImg.ok) throw new Error(`Image fetch failed: ${resImg.status}`)
      const buf = Buffer.from(await resImg.arrayBuffer())
      const { ext } = guessExtAndMime(imageUrl)
      attachment = {
        filename: `${firstName}_${lastName || "rockstar"}.${ext}`,
        content: buf.toString("base64"),
      }
    } catch (e) {
      attachment = null // fallback: correo sin adjunto, con link
    }

    // Correo para usuario
    const userPayload: any = {
      from: FROM_EMAIL,
      to: userEmail,
      subject: `¡Tu foto como Rockstar está lista, ${firstName}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <h1 style="color:#e63946;text-align:center;">¡Bienvenido a School of Rock!</h1>
          <p style="font-size:16px;">Hola ${displayName},</p>
          <p style="font-size:16px;">Tu transformación como estrella de rock ${
            escena ? `tocando <strong>${escena}</strong> ` : ""
          }está completa.</p>
          <p style="font-size:16px;">${
            attachment
              ? "Adjuntamos tu imagen generada."
              : `Aquí puedes descargar tu imagen:<br><a href="${imageUrl}" target="_blank">${imageUrl}</a>`
          }</p>
          <p style="font-size:14px;color:#666;margin-top:30px;">
            Saludos,<br/>Sexto Básico - Coyancura
          </p>
        </div>
      `,
    }
    if (attachment) {
      userPayload.attachments = [{ filename: attachment.filename, content: attachment.content }]
    }

    // Correo para admin
    const adminPayload: any = {
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `Copia admin – Imagen generada: ${displayName}${escena ? ` (${escena})` : ""}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <p>Se generó una imagen para <b>${displayName}</b> (${userEmail}).</p>
          <p>Link de la imagen: <a href="${imageUrl}" target="_blank">${imageUrl}</a></p>
          <p>Escena: ${escena || "N/D"}</p>
        </div>
      `,
    }
    if (attachment) {
      adminPayload.attachments = [{ filename: attachment.filename, content: attachment.content }]
    }

    const [userRes, adminRes] = await Promise.all([
      resend.emails.send(userPayload),
      resend.emails.send(adminPayload),
    ])

    return NextResponse.json({
      success: true,
      message: "Emails sent successfully",
      results: [userRes, adminRes],
    })
  } catch (error: any) {
    console.error("[send-email] Error:", error)
    return NextResponse.json({ error: "Failed to send email", details: error?.message }, { status: 500 })
  }
}