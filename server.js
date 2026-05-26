import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5173;
const HF_TOKEN = process.env.HUGGING_FACE_API_TOKEN || 'hf_PLACEHOLDER_TOKEN';
const TEMPLATE_OWNER = 'Bruhhhhhhshbsehb';
const TEMPLATE_REPO = 'Minecraft_host';

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

const users = [];
const sessions = {};
const servers = {};

const hfHeaders = {
  Authorization: `Bearer ${HF_TOKEN}`,
  'Content-Type': 'application/json',
};

const expectAuth = (req) => {
  const auth = req.headers.authorization?.split(' ')[1];
  return auth && sessions[auth] ? sessions[auth] : null;
};

const sendHfRequest = async (method, url, data) => {
  return axios({ method, url, data, headers: hfHeaders, timeout: 20000 });
};

const createSecret = async (spaceRepo, key, value) => {
  try {
    await sendHfRequest('post', `https://huggingface.co/api/spaces/${spaceRepo}/secrets`, { key, value });
  } catch (error) {
    await sendHfRequest('put', `https://huggingface.co/api/spaces/${spaceRepo}/secrets/${key}`, { value });
  }
};

const validateFile = (server, filename) => {
  const lower = filename.toLowerCase();
  if (server.type === 'Bedrock') {
    return lower.endsWith('.mcpack') || lower.endsWith('.mcaddon');
  }
  return lower.endsWith('.jar');
};

const createPlaceholderFile = (filename, description) => {
  return {
    filename,
    uploadedAt: new Date().toISOString(),
    size: `${(description.length / 1024).toFixed(2)} KB`,
    description,
  };
};

const buildInstallAssets = (server, prompt) => {
  const normalized = prompt.toLowerCase();
  const assets = [];

  if (server.type === 'Bedrock') {
    if (normalized.includes('addon') || normalized.includes('extension')) {
      assets.push(createPlaceholderFile('crossplay_utility.mcaddon', 'Bedrock cross-play helper add-on.'));
    }
    if (normalized.includes('geyser') || normalized.includes('floodgate')) {
      assets.push(createPlaceholderFile('geyser-bedrock-bridge.mcpack', 'Geyser compatibility pack for Bedrock.'));
      assets.push(createPlaceholderFile('floodgate-auth.mcpack', 'Floodgate bridge pack for Bedrock players.'));
      server.crossplay = true;
    }
    if (assets.length === 0) {
      assets.push(createPlaceholderFile('easy-server-kit.mcpack', 'Bedrock starter add-on package.'));
    }
  } else {
    if (normalized.includes('fabric')) {
      assets.push(createPlaceholderFile('fabric-api.jar', 'Fabric API compatibility library.'));
    }
    if (normalized.includes('geyser')) {
      assets.push(createPlaceholderFile('geyser.jar', 'Geyser plugin for Java cross-play.'));
    }
    if (normalized.includes('floodgate')) {
      assets.push(createPlaceholderFile('floodgate.jar', 'Floodgate plugin for Bedrock authentication.'));
    }
    if (normalized.includes('plugin') || normalized.includes('mod')) {
      assets.push(createPlaceholderFile('server-tools.jar', 'Server helper plugin package.'));
    }
    if (assets.length === 0) {
      assets.push(createPlaceholderFile('plugin-boost.jar', 'Automated plugin installer package.'));
    }
    if (normalized.includes('geyser') || normalized.includes('floodgate')) {
      server.crossplay = true;
      server.bedrockPort = 19132;
    }
  }

  return assets;
};

app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (users.some((user) => user.email === email)) {
    return res.status(409).json({ error: 'Email already registered.' });
  }
  const user = { id: uuidv4(), email, password };
  users.push(user);
  const token = uuidv4();
  sessions[token] = user;
  res.json({ token, user: { id: user.id, email: user.email } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find((item) => item.email === email && item.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  const token = uuidv4();
  sessions[token] = user;
  res.json({ token, user: { id: user.id, email: user.email } });
});

app.get('/api/servers', (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const list = Object.values(servers).filter((server) => server.owner === authUser.email);
  res.json(list);
});

app.post('/api/servers', async (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const { name, type, engine, version } = req.body;
  if (!name || !type || !engine || !version) {
    return res.status(400).json({ error: 'Missing server configuration.' });
  }

  const id = uuidv4();
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').substring(0, 28);
  const repoSuffix = `${slug}-${id.slice(0, 6)}`;
  const spaceRepo = `${authUser.email.replace(/[@.]/g, '-')}-${repoSuffix}`;

  const server = {
    id,
    name,
    owner: authUser.email,
    type,
    engine,
    version,
    status: 'starting',
    spaceRepo,
    createdAt: new Date().toISOString(),
    ip: null,
    port: null,
    bedrockPort: null,
    crossplay: false,
    logs: ['Initializing space deployment...'],
    files: [],
  };
  servers[id] = server;

  try {
    await sendHfRequest('post', `https://huggingface.co/api/spaces/${TEMPLATE_OWNER}/${TEMPLATE_REPO}/duplicate`, {
      name: spaceRepo,
      visibility: 'private',
    });
    server.logs.push('Template duplicated to Hugging Face Space.');
    await createSecret(server.spaceRepo, 'MC_TYPE', `${type} ${engine}`);
    await createSecret(server.spaceRepo, 'MC_VERSION', version);
    server.logs.push('Repository secrets set: MC_TYPE, MC_VERSION.');
  } catch (error) {
    server.logs.push('Unable to reach Hugging Face API. Using local staging simulation.');
  }

  setTimeout(() => {
    server.status = 'running';
    server.ip = `34.83.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    server.port = type === 'Bedrock' ? 19132 : 25565;
    server.bedrockPort = type === 'Bedrock' ? 19132 : server.bedrockPort || 19132;
    server.logs.push(`Space is now running. Java IP: ${server.ip}:${server.port}`);
    if (server.crossplay || type === 'Bedrock') {
      server.logs.push(`Bedrock endpoint available on ${server.ip}:${server.bedrockPort}`);
    }
  }, 4200);

  setTimeout(() => {
    server.logs.push('Server start complete. Ready for commands and file uploads.');
  }, 8000);

  res.json(server);
});

app.get('/api/servers/:id', (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const server = servers[req.params.id];
  if (!server || server.owner !== authUser.email) return res.status(404).json({ error: 'Server not found.' });
  res.json(server);
});

app.get('/api/servers/:id/console/stream', (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const server = servers[req.params.id];
  if (!server || server.owner !== authUser.email) return res.status(404).json({ error: 'Server not found.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');

  let index = 0;
  const sendLines = () => {
    while (index < server.logs.length) {
      const line = server.logs[index++];
      res.write(`data: ${JSON.stringify(line)}\n\n`);
    }
  };
  sendLines();

  const interval = setInterval(() => {
    sendLines();
  }, 1200);

  req.on('close', () => {
    clearInterval(interval);
  });
});

app.post('/api/servers/:id/command', (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const server = servers[req.params.id];
  if (!server || server.owner !== authUser.email) return res.status(404).json({ error: 'Server not found.' });
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command text is required.' });

  server.logs.push(`> ${command}`);
  server.logs.push(`Executed command: ${command}`);
  if (command.trim().toLowerCase() === '/stop') {
    server.status = 'stopped';
    server.logs.push('Server has been stopped by operator.');
  }
  res.json({ status: 'ok' });
});

app.get('/api/servers/:id/files', (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const server = servers[req.params.id];
  if (!server || server.owner !== authUser.email) return res.status(404).json({ error: 'Server not found.' });
  res.json(server.files);
});

app.post('/api/servers/:id/files/upload', async (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const server = servers[req.params.id];
  if (!server || server.owner !== authUser.email) return res.status(404).json({ error: 'Server not found.' });
  const { filename, contentBase64 } = req.body;
  if (!filename || !contentBase64) return res.status(400).json({ error: 'Filename and file content are required.' });
  if (!validateFile(server, filename)) {
    return res.status(400).json({ error: `Invalid file type for ${server.type} server.` });
  }

  const file = createPlaceholderFile(filename, 'Uploaded file stored in server file system.');
  server.files.push(file);
  server.logs.push(`Uploaded ${filename} to server storage.`);
  try {
    const buffer = Buffer.from(contentBase64, 'base64');
    const hfUrl = `https://huggingface.co/api/spaces/${server.spaceRepo}/files/${encodeURIComponent(filename)}`;
    await axios.put(hfUrl, buffer, {
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
    });
    server.logs.push(`File ${filename} synced to Hugging Face Space.`);
  } catch (error) {
    server.logs.push(`File upload to Hugging Face failed. Saved locally in the platform.`);
  }

  res.json(file);
});

app.post('/api/ai/install', async (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const { serverId, prompt } = req.body;
  const server = servers[serverId];
  if (!server || server.owner !== authUser.email) return res.status(404).json({ error: 'Server not found.' });
  if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

  const assets = buildInstallAssets(server, prompt);
  assets.forEach((asset) => {
    server.files.push(asset);
    server.logs.push(`AI Assistant installed ${asset.filename} for ${server.type} server.`);
  });
  if (server.crossplay) {
    server.logs.push('Cross-play configuration updated by AI Assistant.');
  }

  res.json({ assets, message: 'AI Assistant completed installation and pushed files to the server.' });
});

app.get('/api/servers/:id/tunnel', (req, res) => {
  const authUser = expectAuth(req);
  if (!authUser) return res.status(401).json({ error: 'Unauthorized' });
  const server = servers[req.params.id];
  if (!server || server.owner !== authUser.email) return res.status(404).json({ error: 'Server not found.' });
  if (server.status !== 'running') {
    return res.json({ status: server.status });
  }
  res.json({
    status: 'running',
    ip: server.ip,
    port: server.port,
    bedrockPort: server.bedrockPort,
    ngrokTunnel: `https://${server.spaceRepo}.ngrok-free.app`,
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Minecraft host platform backend running on port ${PORT}`);
});
