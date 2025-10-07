"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, CheckCircle, XCircle, Hourglass, Camera, Upload } from "lucide-react"

type PollData = {
  live_status?: string
  status?: "queued" | "running" | "success" | "failed" | "api_error"
  // outputs puede venir en diferentes formatos según ComfyDeploy
  outputs?: Array<{ url?: string; image?: string; images?: Array<{ url?: string }>; [key: string]: any }>
  progress?: number
  queue_position?: number | null
  error?: any
  details?: any
  _detected_url?: string | null // puede venir desde nuestra API /poll
}

function WorkflowForm() {
  const [runId, setRunId] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const [pollingData, setPollingData] = useState<PollData | null>(null)
  const [isPolling, setIsPolling] = useState<boolean>(false)
  const [pollingError, setPollingError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)

  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [nombre, setNombre] = useState<string>("")
  const [apellido, setApellido] = useState<string>("")
  const [escena, setEscena] = useState<string>("teclado") // UI mantiene acentos y mayúsculas si los tuviera
  const [email, setEmail] = useState<string>("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Evita enviar email más de una vez por run
  const hasSentEmailRef = useRef(false)

  // --- Polling del run ---
  useEffect(() => {
    const clearPollingInterval = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      setIsPolling(false)
    }

    if (!runId) {
      clearPollingInterval()
      setPollingData(null)
      return
    }

    const fetchAndPoll = async () => {
      if (!runId) return
      setIsPolling(true)
      setPollingError(null)

      try {
        const response = await fetch(`/api/poll?runId=${runId}`, { cache: "no-store" })
        const data: PollData = await response.json()

        if (!response.ok) {
          const errorMsg = (data as any)?.error || `Poll API Error: ${response.status}`
          setPollingError(errorMsg)
          setPollingData({ ...data, status: "api_error", live_status: errorMsg })
        } else {
          setPollingData(data)
        }

        if (data.status === "success" || data.status === "failed") {
          clearPollingInterval()
        }
      } catch (err: any) {
        setPollingError(err.message || "Polling failed unexpectedly.")
      }
    }

    // primera lectura
    fetchAndPoll()

    // evita dobles intervalos
    clearPollingInterval()
    pollIntervalRef.current = setInterval(fetchAndPoll, 2000)

    return () => {
      clearPollingInterval()
    }
  }, [runId])

  // --- Detecta la URL del output en múltiples formatos y setea imageUrl ---
  useEffect(() => {
    if (!pollingData) return

    const extractUrl = (o: any): string | null => {
      if (!o) return null
      return (
        o.url ||
        o.image ||
        (Array.isArray(o.images) ? o.images[0]?.url : null) ||
        null
      )
    }

    // intenta primero la pista que nos mandó el backend (_detected_url)
    const urlFromBackend = pollingData._detected_url || null

    // luego intenta leer del primer output o de cualquiera
    const urlFromOutputs =
      extractUrl(pollingData.outputs?.[0]) ||
      (Array.isArray(pollingData.outputs)
        ? (pollingData.outputs.map(extractUrl).find(Boolean) as string | undefined)
        : null)

    const finalUrl = urlFromBackend || urlFromOutputs || null

    if (pollingData.status === "success" && finalUrl) {
      setImageUrl(finalUrl)
    }
  }, [pollingData])

  // --- Envía el correo una vez que tenemos imageUrl ---
  useEffect(() => {
    if (!imageUrl) return
    if (hasSentEmailRef.current) return
    if (!email) return

    hasSentEmailRef.current = true
    const userName = `${nombre} ${apellido}`.trim()
    sendEmailWithImage(imageUrl, email, userName, escena)
  }, [imageUrl, email, nombre, apellido, escena])

  // --- Handlers ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setUploadedImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Normaliza la escena para ComfyDeploy: minúsculas y "bateria" sin tilde
    const escenaInput =
      escena.toLowerCase() === "batería" ? "bateria" : escena.toLowerCase()

    const inputs = {
      imagen: uploadedImage || "",
      nombre,
      apellido,
      escena: escenaInput, // ← lo que consume ComfyDeploy
      email,
    }

    // Reset de estado para un nuevo run
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setRunId(null)
    setImageUrl(null)
    setMutationError(null)
    setPollingData(null)
    setIsPolling(false)
    setPollingError(null)
    setIsGenerating(true)
    hasSentEmailRef.current = false

    try {
      setMutationError(null)
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      })
      const responseData = await res.json()

      if (!res.ok) {
        const errorMsg = (responseData as any)?.error || `API Error: ${res.status}`
        const errorDetails = (responseData as any)?.details ? JSON.stringify((responseData as any).details) : "No details"
        throw new Error(`${errorMsg} - ${errorDetails}`)
      }

      if (responseData && typeof responseData.run_id === "string" && responseData.run_id.length > 0) {
        setRunId(responseData.run_id)
        setImageUrl(null)
        setPollingData(null)
        setPollingError(null)
      } else {
        setMutationError(`Failed to start run: run_id missing. Response: ${JSON.stringify(responseData)}`)
        setRunId(null)
      }
    } catch (error: any) {
      setMutationError(error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // --- Envío de email ---
  const sendEmailWithImage = async (
    imageUrl: string,
    userEmail: string,
    userName: string,
    escenaSeleccionada?: string
  ) => {
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          userEmail,
          userName,
          escena: escenaSeleccionada,
        }),
      })

      // (opcional) podrías registrar algo si falla
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        console.error("[send-email] Failed", err)
      }
    } catch (error) {
      console.error("[send-email] Error:", error)
    }
  }

  const displayStatus = pollingData?.status
  const overallIsLoading =
    isGenerating || (isPolling && !!runId && displayStatus !== "success" && displayStatus !== "failed")

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-bold">Bienvenidos a</h1>
          <img src="/images/school-of-rock-logo.png" alt="School of Rock" className="w-full max-w-md" />
          <p className="text-lg font-medium text-muted-foreground">by Sexto Básico - Coyancura</p>
        </div>

        <Card className="w-full border shadow-sm">
          <CardHeader>
            <CardTitle className="text-center text-2xl">Conviértete en Rockstar</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="imagen">Sube una selfie</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Tomar Foto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 bg-transparent"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Subir Archivo
                  </Button>
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                {uploadedImage && (
                  <div className="mt-2 flex justify-center">
                    <img
                      src={uploadedImage || "/placeholder.svg"}
                      alt="Uploaded selfie"
                      className="max-h-48 rounded-md border shadow-sm"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  name="nombre"
                  placeholder="Ingresa tu nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="apellido">Apellido</Label>
                <Input
                  id="apellido"
                  name="apellido"
                  placeholder="Ingresa tu apellido"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="escena">¿Qué instrumento vas a tocar?</Label>
                <Select value={escena} onValueChange={setEscena}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una escena" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Los textos permanecen como en la UI, pero al enviar se normalizan */}
                    <SelectItem value="teclado">Teclado</SelectItem>
                    <SelectItem value="batería">Batería</SelectItem>
                    <SelectItem value="guitarra">Guitarra</SelectItem>
                    <SelectItem value="voz">Voz</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Ingresa tu email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={isGenerating || !uploadedImage}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Enviar"
                  )}
                </Button>
              </div>
            </form>

            {mutationError && (
              <div className="mt-4 text-center text-sm font-medium text-red-600">Error: {mutationError}</div>
            )}

            {(overallIsLoading || displayStatus) && !mutationError && (
              <div className="mt-6 flex flex-col items-center gap-2">
                {overallIsLoading && !displayStatus && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{isGenerating ? "Queuing run..." : "Initializing poll..."}</span>
                  </div>
                )}
                {displayStatus && (
                  <div className="flex items-center justify-center gap-2 text-sm capitalize text-muted-foreground">
                    {displayStatus === "queued" && <Hourglass className="h-4 w-4 animate-pulse text-amber-500" />}
                    {displayStatus === "running" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {displayStatus === "api_error" && <XCircle className="h-4 w-4 text-orange-500" />}
                    {displayStatus === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
                    {displayStatus === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                    <span>Status: {pollingData?.live_status || displayStatus}</span>
                    {displayStatus === "queued" && pollingData?.queue_position != null && (
                      <span> (Queue: {pollingData.queue_position})</span>
                    )}
                    {displayStatus === "running" && pollingData?.progress != null && (
                      <span> ({Math.round(pollingData.progress * 100)}%)</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {pollingError && !mutationError && (
              <div className="mt-4 text-center text-sm text-red-600">Polling Error: {pollingError}</div>
            )}

            {imageUrl && (
              <div className="mt-6 flex justify-center">
                <img
                  src={imageUrl || "/placeholder.svg"}
                  alt="Generated output"
                  className="max-w-full rounded-md border shadow-sm"
                />
              </div>
            )}

            {pollingData && (
              <details className="mt-6 w-full">
                <summary className="cursor-pointer text-xs text-muted-foreground">View Raw Output</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-4 text-xs">
                  {JSON.stringify(pollingData, null, 2)}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function Page() {
  return <WorkflowForm />
}