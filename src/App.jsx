import { useEffect, useMemo, useState } from 'react';

const engineOptions = {
  Java: ['Paper', 'Fabric', 'Vanilla'],
  Bedrock: ['Bedrock Dedicated Server'],
};

const versions = ['1.21.1', '1.20.4', '1.19.4', '1.18.2'];

const localStore = {
  get: () => ({ token: localStorage.getItem('huh_token') || '', email: localStorage.getItem('huh_email') || '' }),
  set: (token, email) => {
    localStorage.setItem('huh_token', token);
    localStorage.setItem('huh_email', email);
  },
  clear: () => {
    localStorage.removeItem('huh_token');
    localStorage.removeItem('huh_email');
  },
};

function App() {
  const stored = localStore.get();
  const [token, setToken] = useState(stored.token);
  const [userEmail, setUserEmail] = useState(stored.email);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');

  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [tab, setTab] = useState('overview');
  const [consoleLines, setConsoleLines] = useState([]);
  const [commandText, setCommandText] = useState('');
  const [wizard, setWizard] = useState({ name: 'Nova Realm', type: 'Java', engine: 'Paper', version: '1.21.1' });
  const [busy, setBusy] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [files, setFiles] = useState([]);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState('Install Fabric API, Geyser, Floodgate, and animation support.');
  const [assistantLog, setAssistantLog] = useState([]);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  const apiRequest = async (method, path, body) => {
    const options = { method, headers: authHeaders };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(path, options);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed request' }));
      throw new Error(error.error || 'Request failed');
    }
    return res.json();
  };

  const refreshServers = async () => {
    if (!token) return;
    try {
      const list = await apiRequest('GET', '/api/servers');
      setServers(list);
      if (selectedServer) {
        const updated = list.find((item) => item.id === selectedServer.id);
        if (updated) setSelectedServer(updated);
      }
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (token) refreshServers();
  }, [token]);

  useEffect(() => {
    if (!selectedServer) {
      setConsoleLines([]);
      setNetworkInfo(null);
      setFiles([]);
      return;
    }

    const source = new EventSource(`/api/servers/${selectedServer.id}/console/stream`);
    source.onmessage = (event) => {
      setConsoleLines((prev) => [...prev, JSON.parse(event.data)]);
    };
    source.onerror = () => {
      source.close();
    };

    fetch(`/api/servers/${selectedServer.id}/files`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => setFiles(data))
      .catch(() => setFiles([]));

    return () => source.close();
  }, [selectedServer, authHeaders]);

  useEffect(() => {
    if (selectedServer && tab === 'network') {
      fetch(`/api/servers/${selectedServer.id}/tunnel`, { headers: authHeaders })
        .then((res) => res.json())
        .then((data) => setNetworkInfo(data))
        .catch(() => setNetworkInfo(null));
    }
  }, [selectedServer, tab, authHeaders]);

  const handleAuth = async (email, password) => {
    setBusy(true);
    setAuthError('');
    try {
      const payload = await apiRequest('POST', `/api/auth/${authMode}`, { email, password });
      setToken(payload.token);
      setUserEmail(payload.user.email);
      localStore.set(payload.token, payload.user.email);
      setAuthMode('login');
      refreshServers();
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    localStore.clear();
    setToken('');
    setUserEmail('');
    setServers([]);
    setSelectedServer(null);
    setConsoleLines([]);
    setNetworkInfo(null);
  };

  const createServer = async () => {
    setBusy(true);
    try {
      const server = await apiRequest('POST', '/api/servers', wizard);
      await refreshServers();
      setSelectedServer(server);
      setTab('overview');
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  const sendCommand = async () => {
    if (!commandText.trim() || !selectedServer) return;
    setBusy(true);
    try {
      await apiRequest('POST', `/api/servers/${selectedServer.id}/command`, { command: commandText.trim() });
      setCommandText('');
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (event) => {
    if (!selectedServer) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.toLowerCase().split('.').pop();
    const allowed = selectedServer.type === 'Bedrock' ? ['mcpack', 'mcaddon'] : ['jar'];
    if (!allowed.includes(extension)) {
      return alert(`Invalid file type for ${selectedServer.type} servers.`);
    }
    setFileLoading(true);
    const buffer = await file.arrayBuffer();
    const contentBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    try {
      await apiRequest('POST', `/api/servers/${selectedServer.id}/files/upload`, {
        filename: file.name,
        contentBase64,
      });
      const updated = await apiRequest('GET', `/api/servers/${selectedServer.id}`);
      setFiles(updated.files || []);
    } catch (error) {
      alert(error.message);
    } finally {
      setFileLoading(false);
    }
  };

  const sendAssistant = async () => {
    if (!selectedServer) return;
    const prompt = assistantPrompt.trim();
    if (!prompt) return;
    setBusy(true);
    try {
      const response = await apiRequest('POST', '/api/ai/install', {
        serverId: selectedServer.id,
        prompt,
      });
      setAssistantLog((prev) => [...prev, `> ${prompt}`, `AI: ${response.message}`]);
      const updated = await apiRequest('GET', `/api/servers/${selectedServer.id}`);
      setFiles(updated.files || []);
      if (updated.crossplay) {
        setAssistantLog((prev) => [...prev, 'AI Assistant enabled cross-play setup.']);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  const dashboardIntro = (
    <div className="hero-card">
      <div>
        <div className="badge">Hugging Face Spaces Deployment</div>
        <h1>Neon Host</h1>
        <p>Launch Minecraft servers with a modern neon-blue dashboard, live console streaming, file manager, AI assistant, and hosted deployment automation.</p>
      </div>
      <div className="hero-actions">
        <button className="btn btn-primary" onClick={() => setTab('overview')}>
          Start a new server
        </button>
        <button className="btn btn-secondary" onClick={refreshServers}>
          Refresh server list
        </button>
      </div>
    </div>
  );

  const wizardPanel = (
    <div className="panel">
      <div className="panel-header">
        <h2>Server Setup Wizard</h2>
        <p>Configure your Minecraft server and deploy it to a Hugging Face Space instance.</p>
      </div>
      <div className="wizard-grid">
        <label>
          Server Name
          <input type="text" value={wizard.name} onChange={(e) => setWizard({ ...wizard, name: e.target.value })} />
        </label>
        <label>
          Game Type
          <select value={wizard.type} onChange={(e) => setWizard({ ...wizard, type: e.target.value, engine: engineOptions[e.target.value][0] })}>
            <option value="Java">Java Edition</option>
            <option value="Bedrock">Bedrock Edition</option>
          </select>
        </label>
        <label>
          Server Engine
          <select value={wizard.engine} onChange={(e) => setWizard({ ...wizard, engine: e.target.value })}>
            {engineOptions[wizard.type].map((engine) => (
              <option key={engine} value={engine}>{engine}</option>
            ))}
          </select>
        </label>
        <label>
          Minecraft Version
          <select value={wizard.version} onChange={(e) => setWizard({ ...wizard, version: e.target.value })}>
            {versions.map((version) => (
              <option key={version} value={version}>{version}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="wizard-footer">
        <div className="note">When you press Create Server, the platform duplicates the Hugging Face template and configures MC_TYPE and MC_VERSION secrets.</div>
        <button className="btn btn-primary" onClick={createServer} disabled={busy}>
          {busy ? 'Creating...' : 'Create Server'}
        </button>
      </div>
    </div>
  );

  const serverTabs = selectedServer && (
    <>
      <div className="tab-row">
        {['overview', 'console', 'files', 'assistant', 'network'].map((tabKey) => (
          <button
            key={tabKey}
            className={`tab-pill ${tab === tabKey ? 'active' : ''}`}
            onClick={() => setTab(tabKey)}
          >
            {tabKey === 'overview' ? 'Overview' : tabKey === 'assistant' ? 'AI Assistant' : tabKey.charAt(0).toUpperCase() + tabKey.slice(1)}
          </button>
        ))}
      </div>
      <div className="panel tab-body">
        {tab === 'overview' && (
          <div className="grid-cols-2">
            <div className="panel-card">
              <h3>Server Summary</h3>
              <div className="tile">Name: {selectedServer.name}</div>
              <div className="tile">Type: {selectedServer.type}</div>
              <div className="tile">Engine: {selectedServer.engine}</div>
              <div className="tile">Version: {selectedServer.version}</div>
              <div className="tile">Space: {selectedServer.spaceRepo}</div>
              <div className="tile">Status: {selectedServer.status}</div>
            </div>
            <div className="panel-card">
              <h3>Quick Actions</h3>
              <button className="btn btn-primary" onClick={() => setTab('console')}>Open Live Console</button>
              <button className="btn btn-secondary" onClick={() => setTab('files')}>Manage Files</button>
              <button className="btn btn-secondary" onClick={() => setTab('network')}>View IP / Port</button>
            </div>
          </div>
        )}

        {tab === 'console' && (
          <div className="console-panel">
            <div className="console-window">
              {consoleLines.length === 0 ? (
                <div className="console-empty">Waiting for live console output...</div>
              ) : (
                consoleLines.map((line, index) => <div key={index} className="console-line">{line}</div>)
              )}
            </div>
            <div className="console-input-row">
              <input
                value={commandText}
                onChange={(e) => setCommandText(e.target.value)}
                placeholder="Send command to server (e.g. /op user, /say Hello)"
              />
              <button className="btn btn-primary" onClick={sendCommand} disabled={busy || !commandText.trim()}>
                Send
              </button>
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div>
            <div className="panel-card">
              <h3>File Manager</h3>
              <p className="muted">Upload files directly to the Space container. Allowed file types for this server: <strong>{selectedServer.type === 'Bedrock' ? '.mcpack, .mcaddon' : '.jar'}</strong>.</p>
              <div className="upload-row">
                <label className="file-upload">
                  <span>{fileLoading ? 'Uploading...' : 'Upload File'}</span>
                  <input type="file" accept={selectedServer.type === 'Bedrock' ? '.mcpack,.mcaddon' : '.jar'} onChange={uploadFile} disabled={fileLoading} />
                </label>
              </div>
              <div className="files-grid">
                {files.length === 0 ? <div className="muted">No files uploaded yet.</div> : files.map((file, index) => (
                  <div key={index} className="file-card">
                    <div className="file-name">{file.filename}</div>
                    <div className="file-meta">{file.size}</div>
                    <div className="file-meta">{file.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'assistant' && (
          <div className="assistant-grid">
            <div className="panel-card">
              <h3>AI File Assistant</h3>
              <p className="muted">Ask the assistant to install plugins, mods, or cross-play tools. It knows your server context and pushes compatible files directly into your Space.</p>
              <textarea value={assistantPrompt} onChange={(e) => setAssistantPrompt(e.target.value)} rows={6} />
              <button className="btn btn-primary" onClick={sendAssistant} disabled={busy}>Send to AI Assistant</button>
            </div>
            <div className="panel-card chat-log">
              <h3>Assistant Activity</h3>
              {assistantLog.length === 0 ? <div className="muted">The assistant is ready. Ask it to install Fabric API, Geyser, Floodgate, mods, or Bedrock bundles.</div> : assistantLog.map((item, idx) => (<div key={idx} className="assistant-line">{item}</div>))}
            </div>
          </div>
        )}

        {tab === 'network' && (
          <div className="panel-card">
            <h3>Networking & Tunnel</h3>
            {networkInfo ? (
              <div className="network-grid">
                <div className="tile">Live IP: <strong>{networkInfo.ip || 'pending'}</strong></div>
                <div className="tile">Java Port: <strong>{networkInfo.port || '25565'}</strong></div>
                <div className="tile">Bedrock Port: <strong>{networkInfo.bedrockPort || (selectedServer.type === 'Bedrock' ? 19132 : '19132')}</strong></div>
                <div className="tile">Tunnel URL: <strong>{networkInfo.ngrokTunnel}</strong></div>
              </div>
            ) : (
              <div className="muted">Fetching live network details...</div>
            )}
            <div className="note">If your server supports Geyser or Bedrock, use the Bedrock port and the tunnel URL for mobile connections.</div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand">Huh Host</div>
          <div className="brand-subtitle">Minecraft Hosting Platform</div>
        </div>
        <div className="topbar-actions">
          {token ? (
            <>
              <span className="user-chip">{userEmail}</span>
              <button className="btn btn-ghost" onClick={handleLogout}>Log out</button>
            </>
          ) : null}
        </div>
      </header>

      <main className="content-shell">
        {!token ? (
          <div className="auth-panel">
            <div className="auth-card">
              <div className="badge">Account Access</div>
              <h2>{authMode === 'login' ? 'Sign in to your platform' : 'Create your first account'}</h2>
              <p>Use your email and password to start deploying servers to Hugging Face Spaces.</p>
              <AuthForm mode={authMode} onSubmit={handleAuth} busy={busy} error={authError} />
              <div className="auth-switch">
                {authMode === 'login' ? (
                  <span>New? <button onClick={() => setAuthMode('register')}>Create account</button></span>
                ) : (
                  <span>Already registered? <button onClick={() => setAuthMode('login')}>Sign in</button></span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {dashboardIntro}
            <div className="grid-layout">
              <div className="panel small-panel">
                <h3>Live Servers</h3>
                <p className="muted">Your active servers are listed here with status and access.</p>
                <div className="server-list">
                  {servers.length === 0 ? (
                    <div className="muted">No servers yet. Create your first one with the setup wizard.</div>
                  ) : servers.map((server) => (
                    <button
                      key={server.id}
                      className={`server-card ${selectedServer?.id === server.id ? 'selected' : ''}`}
                      onClick={() => { setSelectedServer(server); setTab('overview'); }}
                    >
                      <div className="server-title">{server.name}</div>
                      <div className="server-subtitle">{server.type} • {server.engine}</div>
                      <div className={`status-pill ${server.status === 'running' ? 'online' : 'offline'}`}>{server.status}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel small-panel">
                <h3>Quick Start</h3>
                <div className="quick-list">
                  <div className="quick-item">
                    <span className="quick-badge">1</span>
                    Configure the server wizard.
                  </div>
                  <div className="quick-item">
                    <span className="quick-badge">2</span>
                    Create and deploy via Hugging Face.
                  </div>
                  <div className="quick-item">
                    <span className="quick-badge">3</span>
                    Stream logs, upload plugins, and enable cross-play.
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => setTab('wizard')}>Open Setup Wizard</button>
              </div>
            </div>
            {tab === 'wizard' ? wizardPanel : selectedServer ? serverTabs : (
              <div className="panel empty-panel">
                <h3>Choose a server or create a new instance.</h3>
                <p className="muted">Your server details appear here once deployment is complete.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AuthForm({ mode, onSubmit, busy, error }) {
  const [email, setEmail] = useState('hello@example.com');
  const [password, setPassword] = useState('pqsword');

  const submit = (event) => {
    event.preventDefault();
    onSubmit(email, password);
  };

  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      </label>
      <label>
        Password
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
      </label>
      {error ? <div className="error-message">{error}</div> : null}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Processing...' : mode === 'login' ? 'Login' : 'Create Account'}</button>
    </form>
  );
}

export default App;
