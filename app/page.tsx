"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, CheckCircle, XCircle, Hourglass, Camera, Upload } from "lucide-react"

type OutputItem = {
  url?: string
  images?: Array<{ url?: string }>
  [key: string]: any
}

type PollData = {
  live_status?: string
  status?: "queued" | "running" | "success" | "failed" | "api_error"
  outputs?: OutputItem[]
  progress?: number
  queue_position?: number | null
  error?: any
  details?: any
}

function firstImageUrlFromOutputs(outputs?: OutputItem[] | null): string | null {
  if (!outputs || outputs.length === 0) return null

  for (const item of outputs) {
    const imgs = item?.images
    if (Array.isArray(imgs)) {
      for (const img of imgs) {
        if (img?.url && typeof img.url === "string") return img.url
      }
    }
  }

  for (const item of outputs) {
    if (item?.url && typeof item.url === "string") return item.url
  }

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

function WorkflowForm() {
  const [runId, setRunId] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [pollingData, setPollingData] = useState<PollData | null>(null)
  const [isPolling, setIsPolling] = useState<boolean>(false)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [nombre, setNombre] = useState<string>("")
  const [apellido, setApellido] = useState<string>("")
  const [escena, setEscena] = useState<string>("teclado")
  const [email, setEmail] = useState<string>("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasSentEmailRef = useRef(false)

  useEffect(() => {
    const clearPolling = () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
      setIsPolling(false)
    }

    if (!runId) {
      clearPolling()
      setPollingData(null)
      return
    }

    const fetchAndPoll = async () => {
      if (!runId) return
      setIsPolling(true)

      try {
        const res = await fetch(`/api/poll?runId=${runId}`)
        const data: PollData = await res.json()
        const tickUrl = firstImageUrlFromOutputs(data.outputs)
        console.log("[poll tick]", data.status, "url:", tickUrl)
        setPollingData(data)
        if (data.status === "success" || data.status === "failed") clearPolling()
      } catch (err: any) {
        console.error("Polling failed:", err)
      }
    }

    fetchAndPoll()
    pollIntervalRef.current = setInterval(fetchAndPoll, 2000)
    return () => clearPolling()
  }, [runId])

  useEffect(() => {
    const url = firstImageUrlFromOutputs(pollingData?.outputs)
    if (pollingData?.status === "success" && url) setImageUrl(url)
  }, [pollingData])

  useEffect(() => {
    if (!imageUrl || hasSentEmailRef.current || !email) return
    hasSentEmailRef.current = true
    const userName = `${nombre} ${apellido}`.trim()
    sendEmailWithImage(imageUrl, email, userName, escena)
  }, [imageUrl, email, nombre, apellido, escena])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setUploadedImage(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const inputs = { imagen: uploadedImage || "", nombre, apellido, escena, email }

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    setRunId(null)
    setImageUrl(null)
    setMutationError(null)
    setPollingData(null)
    setIsGenerating(true)
    hasSentEmailRef.current = false

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
      })
      const data = await res.json()
      if (res.ok && data.run_id) setRunId(data.run_id)
      else setMutationError(`Error: ${data.error || "run_id missing"}`)
    } catch (err: any) {
      setMutationError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const sendEmailWithImage = async (imageUrl: string, userEmail: string, userName: string, escenaSeleccionada?: string) => {
    try {
      console.log("[send-email]", { imageUrl, userEmail, userName, escenaSeleccionada })
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, userEmail, userName, escena: escenaSeleccionada }),
      })
      console.log("[send-email] status:", response.status)
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
                  <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="mr-2 h-4 w-4" />
                    Tomar Foto
                  </Button>
                  <Button type="button" variant="outline" className="flex-1 bg-transparent" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Subir Archivo
                  </Button>
                </div>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFileUpload} />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                {uploadedImage && (
                  <div className="mt-2 flex justify-center">
                    <img src={uploadedImage || "/placeholder.svg"} alt="Uploaded selfie" className="max-h-48 rounded-md border shadow-sm" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" name="nombre" placeholder="Ingresa tu nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="apellido">Apellido</Label>
                <Input id="apellido" name="apellido" placeholder="Ingresa tu apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} required />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="escena">¿Qué instrumento vas a tocar?</Label>
                <Select
                  value={escena}
                  onValueChange={(val) => {
                    const clean = val.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    setEscena(clean)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una escena" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="teclado">Teclado</SelectItem>
                    <SelectItem value="bateria">Batería</SelectItem>
                    <SelectItem value="guitarra">Guitarra</SelectItem>
                    <SelectItem value="voz">Voz</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="Ingresa tu email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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

            {mutationError && <div className="mt-4 text-center text-sm font-medium text-red-600">Error: {mutationError}</div>}

            {(overallIsLoading || displayStatus) && (
              <div className="mt-6 flex flex-col items-center gap-2">
                {displayStatus && (
                  <div className="flex items-center justify-center gap-2 text-sm capitalize text-muted-foreground">
                    {displayStatus === "queued" && <Hourglass className="h-4 w-4 animate-pulse text-amber-500" />}
                    {displayStatus === "running" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {displayStatus === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
                    {displayStatus === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                    <span>Status: {pollingData?.live_status || displayStatus}</span>
                  </div>
                )}
              </div>
            )}

            {imageUrl && (
              <div className="mt-6 flex justify-center">
                <img src={imageUrl} alt="Generated output" className="max-w-full rounded-md border shadow-sm" />
              </div>
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