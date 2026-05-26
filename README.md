# Huh Host — Minecraft Server Hosting Platform

A complete full-stack Minecraft hosting dashboard built with React, Vite, and Express. The app is designed for mobile-first neon-blue styling and Hugging Face Spaces deployment automation.

## Features

- Email/password account creation and login flow
- Deployment wizard for Java/Bedrock servers
- Engine selection: Paper, Fabric, Vanilla, Bedrock Dedicated Server
- Version picker with latest Minecraft versions
- Hugging Face Spaces duplication and secret configuration
- Live console streaming with command input
- File manager with type restrictions by server type
- AI assistant for plugin/mod installation and cross-play configuration
- Networking panel with live IP/port and tunnel integration
- Fully responsive dark neon-blue theme

## Setup

```bash
cd /workspaces/Huh
npm install
npm run build
npm run serve
```

For development:

```bash
npm install
npm run dev
```

The backend runs on `http://localhost:5173` and Vite development mode uses the same port configuration.

## Notes

- The Hugging Face API token is loaded from the environment variable `HUGGING_FACE_API_TOKEN`.
- Set `HUGGING_FACE_API_TOKEN` before running the server, or replace the placeholder value in `server.js`.
- The Hugging Face Space template is configured for duplication from `Bruhhhhhhshbsehb/Minecraft_host`.
- The AI assistant is built into the platform and pushes compatible placeholder files directly to the server file system.

## File Structure

- `server.js` — Express backend with Hugging Face API integration
- `src/App.jsx` — React dashboard UI
- `src/index.css` — Neon-blue theme and responsive styling
- `vite.config.js` — Vite configuration

Enjoy building your Minecraft hosting platform!```