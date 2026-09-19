import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// El .env con la API key vive en la raíz del repo y solo lo lee el servidor de Vite:
// nunca se expone al navegador (ver agent/happyrobot/SPEC.md).
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function happyrobotCall(env: Record<string, string>): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.method !== 'POST') return next()

    const endpoint = env.HAPPYROBOT_ENDPOINT
    const apiKey = env.HAPPYROBOT_API_KEY
    const destino = env.HAPPYROBOT_TEST_PHONE
    if (!endpoint || !apiKey || !destino) {
      return send(res, 500, { error: 'Faltan HAPPYROBOT_ENDPOINT, HAPPYROBOT_API_KEY o HAPPYROBOT_TEST_PHONE en el .env de la raíz' })
    }

    let params: Record<string, string> = {}
    try {
      params = JSON.parse(await readBody(req)) as Record<string, string>
    } catch {
      return send(res, 400, { error: 'Body inválido' })
    }

    try {
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
        body: JSON.stringify({ phone_number: destino, ...params }),
        redirect: 'manual',
      })
      const text = await upstream.text()
      const tipo = upstream.headers.get('content-type') ?? ''
      if (upstream.status >= 300 && upstream.status < 400) {
        return send(res, 502, { error: `El endpoint redirige a ${upstream.headers.get('location') ?? 'otra URL'}: es una página web, no una API. Usa la URL del trigger Webhook del workflow.`, destino })
      }
      if (!tipo.includes('json')) {
        return send(res, 502, { error: 'El endpoint ha devuelto HTML, no JSON: apunta a una página del navegador (webcall), no a una API que pueda lanzar la llamada.', destino })
      }
      console.log(`[happyrobot] ${params.contraparte ?? 'llamada'} -> ${upstream.status}`)
      if (!upstream.ok) return send(res, 502, { error: `HappyRobot HTTP ${upstream.status}: ${text.slice(0, 300)}`, destino })
      let run = ""
      try { run = (JSON.parse(text) as { run_id?: string }).run_id ?? "" } catch { /* respuesta sin run_id */ }
      return send(res, 200, { ok: true, destino, runId: run })
    } catch (e) {
      return send(res, 502, { error: e instanceof Error ? e.message : 'No se pudo contactar con HappyRobot' })
    }
  }

  return {
    name: 'happyrobot-call',
    configureServer: (server) => { server.middlewares.use('/api/happyrobot/call', handler) },
    configurePreviewServer: (server) => { server.middlewares.use('/api/happyrobot/call', handler) },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), happyrobotCall(loadEnv(mode, REPO_ROOT, ''))],
}))
