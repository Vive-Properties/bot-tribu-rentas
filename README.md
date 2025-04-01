<p align="center">
  <h1 align="center">Bot Tribu Rentas - Asistente Virtual</h1>
</p>

## 📝 Descripción

Bot de WhatsApp automatizado para Tribu Living que utiliza la API de OpenAI
(Asistentes) para proporcionar respuestas automáticas e inteligentes a consultas
de usuarios. El bot está diseñado para manejar preguntas frecuentes y
proporcionar información relevante sobre servicios de renta y propiedades.

## 🚀 Características Principales

- Integración con WhatsApp mediante Baileys Provider
- Utilización de OpenAI Assistants para respuestas contextualizadas
- Sistema de cola de mensajes para manejo eficiente de conversaciones
- Finalización automática de conversaciones por inactividad (1 hora)
- Endpoints REST para gestión de mensajes y usuarios
- Almacenamiento de datos mediante JSON File Database

## 🛠️ Tecnologías Utilizadas

- Node.js
- TypeScript
- @builderbot/bot (Framework principal)
- OpenAI API (Assistants)
- Baileys (Proveedor de WhatsApp)
- JSON File Database

## ⚙️ Requisitos Previos

- Node.js (versión 14 o superior)
- npm o yarn
- Cuenta de WhatsApp
- Cuenta en OpenAI con acceso a API

## 🔧 Configuración

1. Clona el repositorio:

```bash
git clone https://github.com/tu-usuario/bot-tribu-rentas.git
cd bot-tribu-rentas
```

2. Instala las dependencias:

```bash
npm install
```

3. Configura las variables de entorno creando un archivo `.env`:

```env
PORT=8080
OPENAI_API_KEY=tu_api_key_de_openai
ASSISTANT_ID=id_del_asistente_openai
```

### ℹ️ Configuración del Asistente OpenAI

El bot utiliza un asistente preconfigurado en OpenAI que contiene:

- Contexto específico sobre Tribu Living
- Base de conocimiento sobre preguntas frecuentes
- Directrices de comportamiento y respuesta
- Información sobre propiedades y servicios

Para configurar un nuevo asistente:

1. Crear un nuevo asistente en OpenAI
2. Cargar la base de conocimiento necesaria
3. Configurar el comportamiento deseado
4. Copiar el ID del asistente al archivo .env

## 🚀 Uso

Para iniciar el bot en modo desarrollo:

```bash
npm run dev
```

Para producción:

```bash
npm run build
npm start
```

## 📡 API Endpoints

El bot expone los siguientes endpoints:

### POST /v1/messages

Envía mensajes a usuarios específicos.

```json
{
  "number": "5212345678900",
  "message": "Mensaje a enviar",
  "urlMedia": "https://url-opcional-media.com"
}
```

### POST /v1/register

Registra nuevos usuarios en el sistema.

```json
{
  "number": "5212345678900",
  "name": "Nombre Usuario"
}
```

### POST /v1/blacklist

Gestiona la lista negra de usuarios.

```json
{
  "number": "5212345678900",
  "intent": "add" | "remove"
}
```

## 🤖 Flujos de Conversación

1. **Flujo de Bienvenida**

   - Activación: Usuario envía "Hola Tribu"
   - Respuesta inicial de bienvenida
   - Transición al flujo principal de IA

2. **Flujo Principal**
   - Procesamiento de mensajes mediante OpenAI Assistant
   - Respuestas contextualizadas
   - Gestión de cola de mensajes
   - Finalización automática después de 1 hora de inactividad

## 🔒 Seguridad

- Las credenciales sensibles se manejan mediante variables de entorno
- Sistema de cola para prevenir sobrecarga
- Mecanismo de bloqueo para evitar procesamiento simultáneo
- Lista negra para gestión de usuarios

## 👥 Contribución

1. Fork el proyecto
2. Crea tu rama de características (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add: alguna característica asombrosa'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo
[LICENSE.md](LICENSE.md) para más detalles.

## 📞 Soporte

Para soporte y consultas, por favor contacta a:

- Email: [tu-email@dominio.com]
- WhatsApp: [número-de-soporte]

## ✨ Agradecimientos

- Equipo de Tribu Living
- Comunidad de BuilderBot
- Contribuidores del proyecto
