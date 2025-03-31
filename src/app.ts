/**
 * Importaciones necesarias para el funcionamiento del bot
 */
import { join } from 'path'
import 'dotenv/config'
import {
  createBot,
  createProvider,
  createFlow,
  addKeyword,
  utils,
  EVENTS,
} from '@builderbot/bot'
import { JsonFileDB as Database } from '@builderbot/database-json'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { typing } from './presence'
import { toAsk, httpInject } from '@builderbot-plugins/openai-assistants'

// Configuración inicial
const PORT = process.env.PORT ?? 8080
const ASSISTANT_ID = process.env?.ASSISTANT_ID ?? ''
let isWelcomeFlowCompleted = false
const userQueues = new Map()
const userLocks = new Map() // Mecanismo de bloqueo para evitar procesamiento simultáneo
const STATES = {}
const time = 4000

// Agregar un mapa para rastrear la última actividad del usuario
const userLastActivity = new Map()
const INACTIVITY_TIMEOUT = 60 * 60 * 1000 // 1 hora en milisegundos

/**
 * Actualiza el registro de última actividad para un usuario
 * @param userId - ID del usuario
 */
function updateLastActivity(userId) {
  userLastActivity.set(userId, Date.now())
}

/**
 * Verifica si un usuario ha estado inactivo más del tiempo permitido
 * @param userId - ID del usuario
 * @returns Verdadero si ha estado inactivo por más del tiempo permitido
 */
function isUserInactive(userId) {
  const lastActivity = userLastActivity.get(userId)
  if (!lastActivity) return false

  return Date.now() - lastActivity > INACTIVITY_TIMEOUT
}

/**
 * Termina la conversación por inactividad
 * @param userId - ID del usuario
 * @param provider - Proveedor de mensajería
 */
async function endInactiveConversation(userId, provider) {
  try {
    await provider.sendText(
      userId,
      'La conversación ha sido terminada por inactividad. Si necesitas ayuda nuevamente, escribe "Hola Tribu".',
    )
    isWelcomeFlowCompleted = false
    userLastActivity.delete(userId)
  } catch (error) {
    console.log(`Error terminando conversación para usuario ${userId}:`, error)
  }
}

/**
 * Inicializa el estado para un usuario específico
 * @param id - ID del usuario
 * @returns Estado inicializado con cola, temporizador y callback
 */
function initialState(id) {
  if (!STATES[id]) {
    STATES[id] = {
      queue: [],
      timer: null,
      callback: null,
    }
  }
  return STATES[id]
}

/**
 * Elimina el estado de un usuario
 * @param id - ID del usuario
 */
function deleteState(id) {
  STATES[id] = null
}

/**
 * Restaura el temporizador del estado
 * @param state - Estado del usuario
 */
function restoreTimer(state) {
  if (state.timer) {
    clearTimeout(state.timer)
  }
  state.timer = null
}

/**
 * Procesa la cola de mensajes acumulados
 * @param state - Estado del usuario
 * @returns Mensajes concatenados
 */
function procesingQueue(state) {
  const result = state.queue.join(' ')
  console.log({ 'Mensajes-acumulados': result })
  return result
}

/**
 * Función para unir mensajes con un temporizador
 * @param ctx - Contexto del mensaje
 * @param callback - Función a ejecutar después del temporizador
 */
export function joinMessages(ctx, callback) {
  const state = initialState(ctx.from)
  console.log({ num: ctx.from, body: ctx.body })

  restoreTimer(state)
  state.queue.push(ctx.body)
  state.callback = callback

  state.timer = setTimeout(() => {
    const result = procesingQueue(state)
    if (state.callback) {
      state.callback(result)
      state.callback = null
      deleteState(ctx.from)
    }
  }, time)
}

/**
 * Procesa el mensaje del usuario y genera una respuesta usando IA
 * @param ctx - Contexto del mensaje
 * @param flowDynamic - Función para enviar mensajes dinámicos
 * @param state - Estado del flujo
 * @param provider - Proveedor de mensajería
 */
const processUserMessage = async (ctx, { flowDynamic, state, provider }) => {
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
  await typing(ctx, provider)

  // Actualizar actividad del usuario
  updateLastActivity(ctx.from)

  if (isWelcomeFlowCompleted) {
    const response = await toAsk(ASSISTANT_ID, ctx.body, state)
    const chunks = response.split(/\n\n+/)
    console.log(typing(ctx, provider))
    for (const chunk of chunks) {
      const cleanedChunk = chunk.trim().replace(/ [.*?] [ ] /g, '')
      await flowDynamic([{ body: cleanedChunk }])
    }
    if (
      response.includes('Teléfono de Oficina') ||
      response.includes('De nada')
    ) {
      isWelcomeFlowCompleted = false
      await flowDynamic([
        {
          body: `Gracias por comunicarse con Tribu, si desea una nueva conversación escriba "Hola Tribu".`,
        },
      ])
    }
  } else {
    await flowDynamic([
      {
        capture: false,
        body: `Para comenzar una nueva conversación escribe "Hola Tribu".`,
      },
    ])
  }
}

/**
 * Maneja la cola de mensajes para un usuario específico
 * @param userId - ID del usuario
 */
const handleQueue = async userId => {
  const queue = userQueues.get(userId)

  if (userLocks.get(userId)) {
    return
  }

  while (queue.length > 0) {
    userLocks.set(userId, true)
    const { ctx, flowDynamic, state, provider } = queue.shift()
    try {
      await processUserMessage(ctx, { flowDynamic, state, provider })
    } catch (error) {
      console.log(`Error procesing message for user ${userId}:`, error)
    } finally {
      userLocks.set(userId, false)
    }
  }

  userLocks.delete(userId)
  userQueues.delete(userId)
}

/**
 * Formatea números de teléfono internacionales
 * @param number - Número de teléfono a formatear
 * @returns Número formateado
 */
function formatInternationalNumber(number) {
  if (number.startsWith('52') && number.length === 13) {
    const formattedNumber = '+52' + number.slice(3)
    return formattedNumber
  }
  return number
}

// Flujo principal de IA
const aiFlow = addKeyword<Provider, Database>(EVENTS.WELCOME).addAction(
  async (ctx, { flowDynamic, state, provider }) => {
    const userId = ctx.from

    if (!userQueues.has(userId)) {
      userQueues.set(userId, [])
    }
    const queue = userQueues.get(userId)
    queue.push({ ctx, flowDynamic, state, provider })

    if (!userLocks.get(userId) && queue.length === 1) {
      await handleQueue(userId)
    }
  },
)

// Flujo de bienvenida
const welcomeFlow = addKeyword<Provider, Database>('hola tribu')
  .addAnswer('Bienvenido a Tribu Living en qué puedo ayudarte?')
  .addAction(
    { capture: true },
    async (
      ctx,
      { flowDynamic, endFlow, gotoFlow, fallBack, provider, state },
    ) => {
      isWelcomeFlowCompleted = true
      joinMessages(ctx, async mensajes => {
        console.log(mensajes)
        return gotoFlow(aiFlow)
      })
      return fallBack()
    },
  )

// Agrega esta función para verificar inactividad periódicamente
function startInactivityChecker(provider) {
  setInterval(() => {
    for (const [userId, lastActivity] of userLastActivity.entries()) {
      if (isUserInactive(userId)) {
        endInactiveConversation(userId, provider)
      }
    }
  }, 5 * 60 * 1000) // Verificar cada 5 minutos
}

/**
 * Función principal que inicializa el bot
 */
const main = async () => {
  const adapterFlow = createFlow([welcomeFlow, aiFlow])
  const adapterProvider = createProvider(Provider)
  const adapterDB = new Database({ filename: 'db.json' })

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  })

  // Endpoints de la API
  adapterProvider.server.post(
    '/v1/messages',
    handleCtx(async (bot, req, res) => {
      const { number, message, urlMedia } = req.body
      await bot.sendMessage(number, message, { media: urlMedia ?? null })
      return res.end('sended')
    }),
  )

  adapterProvider.server.post(
    '/v1/register',
    handleCtx(async (bot, req, res) => {
      const { number, name } = req.body
      await bot.dispatch('REGISTER_FLOW', { from: number, name })
      return res.end('trigger')
    }),
  )

  adapterProvider.server.post(
    '/v1/samples',
    handleCtx(async (bot, req, res) => {
      const { number, name } = req.body
      await bot.dispatch('SAMPLES', { from: number, name })
      return res.end('trigger')
    }),
  )

  adapterProvider.server.post(
    '/v1/blacklist',
    handleCtx(async (bot, req, res) => {
      const { number, intent } = req.body
      if (intent === 'remove') bot.blacklist.remove(number)
      if (intent === 'add') bot.blacklist.add(number)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ status: 'ok', number, intent }))
    }),
  )

  httpInject(adapterProvider.server)

  // Iniciar verificador de inactividad
  startInactivityChecker(adapterProvider)

  httpServer(+PORT)
}

main()
