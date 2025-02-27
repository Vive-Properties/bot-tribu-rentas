import 'dotenv/config';
import { addKeyword, EVENTS, createFlow, createProvider, createBot } from '@builderbot/bot';
import { JsonFileDB } from '@builderbot/database-json';
import { BaileysProvider } from '@builderbot/provider-baileys';
import { httpInject, toAsk } from '@builderbot-plugins/openai-assistants';

const typing = async function (ctx, provider) {
    if (provider && provider?.vendor && provider.vendor?.sendPresenceUpdate) {
        const id = ctx.key.remoteJid;
        await provider.vendor.sendPresenceUpdate("composing", id);
    }
};

const PORT = process.env.PORT ?? 8080;
const ASSISTANT_ID = process.env?.ASSISTANT_ID ?? "";
let isWelcomeFlowCompleted = false;
const userQueues = new Map();
const userLocks = new Map();
const STATES = {};
const time = 4000;
function initialState(id) {
    if (!STATES[id]) {
        STATES[id] = {
            queue: [],
            timer: null,
            callback: null,
        };
    }
    return STATES[id];
}
function deleteState(id) {
    STATES[id] = null;
}
function restoreTimer(state) {
    if (state.timer) {
        clearTimeout(state.timer);
    }
    state.timer = null;
}
function procesingQueue(state) {
    const result = state.queue.join(" ");
    console.log({ "Mensajes-acumulados": result });
    return result;
}
function joinMessages(ctx, callback) {
    const state = initialState(ctx.from);
    console.log({ num: ctx.from, body: ctx.body });
    restoreTimer(state);
    state.queue.push(ctx.body);
    state.callback = callback;
    state.timer = setTimeout(() => {
        const result = procesingQueue(state);
        if (state.callback) {
            state.callback(result);
            state.callback = null;
            deleteState(ctx.from);
        }
    }, time);
}
const processUserMessage = async (ctx, { flowDynamic, state, provider }) => {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await typing(ctx, provider);
    if (isWelcomeFlowCompleted) {
        await delay(3000);
        const response = await toAsk(ASSISTANT_ID, ctx.body, state);
        const chunks = response.split(/\n\n+/);
        console.log(typing(ctx, provider));
        for (const chunk of chunks) {
            const cleanedChunk = chunk.trim().replace(/ [.*?] [ ] /g, "");
            await flowDynamic([{ body: cleanedChunk }]);
        }
        if (response.includes("nombre")) {
            isWelcomeFlowCompleted = false;
            await flowDynamic([
                {
                    body: `Espera un momento, tomaremos tus datos, si deseas continuar escribe "si"`,
                },
            ]);
        }
    }
    else {
        await flowDynamic([
            {
                capture: false,
                body: `Para comenzar una nueva conversación escribe "Hola Vive Properties".`,
            },
        ]);
    }
};
const handleQueue = async (userId) => {
    const queue = userQueues.get(userId);
    if (userLocks.get(userId)) {
        return;
    }
    while (queue.length > 0) {
        userLocks.set(userId, true);
        const { ctx, flowDynamic, state, provider } = queue.shift();
        try {
            await processUserMessage(ctx, { flowDynamic, state, provider });
        }
        catch (error) {
            console.log(`Error procesing message for user ${userId}:`, error);
        }
        finally {
            userLocks.set(userId, false);
        }
    }
    userLocks.delete(userId);
    userQueues.delete(userId);
};
const aiFlow = addKeyword(EVENTS.WELCOME).addAction(async (ctx, { flowDynamic, state, provider }) => {
    const userId = ctx.from;
    if (!userQueues.has(userId)) {
        userQueues.set(userId, []);
    }
    const queue = userQueues.get(userId);
    queue.push({ ctx, flowDynamic, state, provider });
    if (!userLocks.get(userId) && queue.length === 1) {
        await handleQueue(userId);
    }
});
const callFlow = addKeyword(["hablar con un asesor", "agendar una cita"])
    .addAction((state) => {
    console.log(state);
})
    .addAnswer(`Para que podamos contactarnos contigo necesito que me proporciones algunos datos. Si deseas cancelar y volver al inicio escribe "cancelar"
        \n¿Cuál es tu nombre?`, { capture: true }, async (ctx, { endFlow, state }) => {
    const userContext = ctx.body.toLowerCase();
    if (userContext === "cancelar") {
        isWelcomeFlowCompleted = false;
        return endFlow(`Has finalizado la conversación, para iniciar una nueva escribe "Hola Vive Properties"`);
    }
    await state.update({ nombre: ctx.body });
})
    .addAnswer("¿Cual es tu correo?", { capture: true }, async (ctx, { fallBack, endFlow, state }) => {
    const userContext = ctx.body.toLowerCase();
    if (userContext === "cancelar") {
        isWelcomeFlowCompleted = false;
        return endFlow(`Has finalizado la conversación, para iniciar una nueva escribe "Hola Vive Properties"`);
    }
    if (!ctx.body.includes("@") && !ctx.body.includes(".")) {
        return fallBack("Por favor ingresa un correo");
    }
    else {
        isWelcomeFlowCompleted = false;
        await state.update({ correo: ctx.body });
    }
})
    .addAnswer("Gracias, en breve nos comunicaremos contigo");
const welcomeFlow = addKeyword("hola vive properties")
    .addAnswer("Bienvenido a Vive Properties en qué puedo ayudarte?")
    .addAction({ capture: true }, async (ctx, { flowDynamic, endFlow, gotoFlow, fallBack, provider, state }) => {
    isWelcomeFlowCompleted = true;
    joinMessages(ctx, async (mensajes) => {
        return gotoFlow(aiFlow);
    });
    return fallBack();
});
const main = async () => {
    const adapterFlow = createFlow([welcomeFlow, aiFlow, callFlow]);
    const adapterProvider = createProvider(BaileysProvider);
    const adapterDB = new JsonFileDB({ filename: "db.json" });
    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });
    adapterProvider.server.post("/v1/messages", handleCtx(async (bot, req, res) => {
        const { number, message, urlMedia } = req.body;
        await bot.sendMessage(number, message, { media: urlMedia ?? null });
        return res.end("sended");
    }));
    adapterProvider.server.post("/v1/register", handleCtx(async (bot, req, res) => {
        const { number, name } = req.body;
        await bot.dispatch("REGISTER_FLOW", { from: number, name });
        return res.end("trigger");
    }));
    adapterProvider.server.post("/v1/samples", handleCtx(async (bot, req, res) => {
        const { number, name } = req.body;
        await bot.dispatch("SAMPLES", { from: number, name });
        return res.end("trigger");
    }));
    adapterProvider.server.post("/v1/blacklist", handleCtx(async (bot, req, res) => {
        const { number, intent } = req.body;
        if (intent === "remove")
            bot.blacklist.remove(number);
        if (intent === "add")
            bot.blacklist.add(number);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "ok", number, intent }));
    }));
    httpInject(adapterProvider.server);
    httpServer(+PORT);
};
main();

export { joinMessages };
