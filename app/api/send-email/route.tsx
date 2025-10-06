import { type NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, userEmail, nombre, apellido, escena } = await req.json()

    if (!imageUrl || !userEmail) {
      return NextResponse.json({ error: "Missing required fields: imageUrl or userEmail" }, { status: 400 })
    }

    // Fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl)
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString("base64")

    const emailRecipients = [userEmail, "fgalaz@mstudioprod.com"]

    // Send email to both recipients
    const emailPromises = emailRecipients.map(async (recipient) => {
      return resend.emails.send({
        from: "School of Rock <rockstar@nube.media>",
        to: recipient,
        subject: `¡Tu foto como Rock Star está lista, ${nombre}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e63946; text-align: center;">¡Bienvenido a School of Rock!</h1>
            <p style="font-size: 16px;">Hola ${nombre} ${apellido},</p>
            <p style="font-size: 16px;">Tu transformación como estrella de rock tocando <strong>${escena}</strong> está completa.</p>
            <p style="font-size: 16px;">Adjuntamos tu imagen generada. ¡Esperamos que te guste!</p>
            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              Saludos,<br/>
              Sexto Básico - Coyancura
            </p>
          </div>
        `,
        attachments: [
          {
            filename: `${nombre}_${apellido}_rockstar.png`,
            content: base64Image,
          },
        ],
      })
    })

    const results = await Promise.all(emailPromises)

    return NextResponse.json({
      success: true,
      message: "Emails sent successfully",
      results,
    })
  } catch (error: any) {
    console.error("[v0] Error sending email:", error)
    return NextResponse.json({ error: "Failed to send email", details: error.message }, { status: 500 })
  }
}
