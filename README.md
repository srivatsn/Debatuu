# Debatuu

An animated debate coach for young learners, with server-side Azure AI Foundry voice generation and a prepared critique endpoint.

## Run locally

1. Open `.env` and set `AZURE_AI_API_KEY`.
2. In Foundry, deploy a speech model such as `gpt-4o-mini-tts`. If its deployment name differs, update `AZURE_AI_SPEECH_DEPLOYMENT`.
3. Run `npm start` and open `http://127.0.0.1:4173`.

Maya uses the warm `coral` voice and Leo uses the lighter `ash` voice. Change `MAYA_VOICE` and `LEO_VOICE` in `.env` to audition alternatives.

If Azure provides a dedicated OpenAI-compatible inference base URL, place it in `AZURE_OPENAI_BASE_URL`. Otherwise, the server derives `https://<resource>.services.ai.azure.com/openai/v1` from the project endpoint.

## Azure App Service

This repository runs directly on Azure App Service with Node 20 or newer; the startup command is `npm start`.

Configure these App Service environment variables instead of uploading `.env`:

- `AZURE_AI_API_KEY`
- `AZURE_AI_PROJECT_ENDPOINT`
- `AZURE_OPENAI_BASE_URL` when required by the resource
- `AZURE_AI_SPEECH_DEPLOYMENT`
- `AZURE_AI_CRITIQUE_DEPLOYMENT`
- `MAYA_VOICE`
- `LEO_VOICE`

App Service provides `PORT` automatically. The API key remains on the server and is never included in browser JavaScript.

## API routes

- `POST /api/speech` — generates Maya or Leo audio through Azure AI.
- `POST /api/critique` — sends a debate transcript to `gpt-5.4-mini` for child-friendly coaching. The UI can be connected to this after recording/transcription is finalized.
- `GET /api/health` — reports configuration status without exposing secrets.
