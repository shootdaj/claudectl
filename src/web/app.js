/**
 * claudectl Web Client
 */

// Tokyo Night Storm xterm.js theme
const tokyoNightStorm = {
  background: '#24283b',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  cursorAccent: '#24283b',
  selectionBackground: '#364A82',
  black: '#1D202F',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

// State
let token = localStorage.getItem('claudectl_token');
let sessions = [];
let currentSessionId = null;
let ws = null;
let terminal = null;
let fitAddon = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');
const sessionList = document.getElementById('session-list');
const terminalContainer = document.getElementById('terminal');
const noSessionPlaceholder = document.getElementById('no-session');
const currentSessionTitle = document.getElementById('current-session-title');
const currentSessionPath = document.getElementById('current-session-path');
const connectionStatus = document.getElementById('connection-status');
const sidebar = document.getElementById('sidebar');

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('[App] Initializing...');
  // Check if we have a valid token
  if (token && await validateToken()) {
    showApp();
  } else {
    showLogin();
  }

  // Event listeners
  loginForm.addEventListener('submit', handleLogin);
  document.getElementById('refresh-sessions').addEventListener('click', loadSessions);
  document.getElementById('logout-button').addEventListener('click', logout);
  document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
  document.getElementById('toggle-notifications').addEventListener('click', enableNotifications);

  // Handle resize
  window.addEventListener('resize', handleResize);

  // Register service worker
  registerServiceWorker();
}

async function validateToken() {
  try {
    const res = await fetch('/api/sessions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  appScreen.classList.add('hidden');
  passwordInput.focus();
}

function showApp() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  loadSessions();
  initTerminal();
}

async function handleLogin(e) {
  e.preventDefault();
  console.log('[App] Login form submitted');
  loginError.textContent = '';

  const password = passwordInput.value;
  console.log('[App] Password length:', password?.length || 0);
  if (!password) return;

  try {
    console.log('[App] Sending login request...');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    console.log('[App] Response status:', res.status);
    const data = await res.json();
    console.log('[App] Response data:', data);

    if (res.ok) {
      token = data.token;
      localStorage.setItem('claudectl_token', token);
      passwordInput.value = '';
      showApp();
    } else {
      loginError.textContent = data.error || 'Login failed';
      passwordInput.select();
    }
  } catch (err) {
    console.log('[App] Login error:', err);
    loginError.textContent = 'Connection error';
  }
}

function logout() {
  token = null;
  localStorage.removeItem('claudectl_token');
  disconnectWebSocket();
  showLogin();
}

async function loadSessions() {
  try {
    const res = await fetch('/api/sessions', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        logout();
        return;
      }
      throw new Error('Failed to load sessions');
    }

    const data = await res.json();
    sessions = data.sessions;
    renderSessionList();
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
}

function renderSessionList() {
  sessionList.innerHTML = sessions.map(session => {
    const isRunning = session.isActive;  // PTY running on server
    const isSelected = session.id === currentSessionId;
    const statusClass = isRunning ? 'running' : '';

    return `
      <div class="session-item ${isSelected ? 'active' : ''} ${statusClass}"
           data-id="${session.id}">
        <div class="title">
          <span class="status-dot ${isRunning ? 'running' : ''}"></span>
          ${escapeHtml(session.title)}
        </div>
        <div class="path">${escapeHtml(session.shortPath || session.workingDirectory)}</div>
        <div class="meta">
          <span>${formatTime(session.lastAccessedAt)}</span>
          <span>${session.messageCount} messages</span>
          ${isRunning ? '<span class="badge">OPEN</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers
  sessionList.querySelectorAll('.session-item').forEach(el => {
    el.addEventListener('click', () => selectSession(el.dataset.id));
  });
}

function selectSession(sessionId) {
  if (currentSessionId === sessionId) return;

  currentSessionId = sessionId;
  const session = sessions.find(s => s.id === sessionId);

  if (session) {
    currentSessionTitle.textContent = session.title;
    currentSessionPath.textContent = session.shortPath || session.workingDirectory;
  }

  // Update UI
  renderSessionList();
  noSessionPlaceholder.classList.add('hidden');
  terminalContainer.classList.remove('hidden');

  // Close sidebar on mobile
  sidebar.classList.remove('open');

  // Connect WebSocket
  connectWebSocket(sessionId);

  // Clear and focus terminal
  if (terminal) {
    terminal.clear();
    terminal.focus();
  }
}

function initTerminal() {
  if (terminal) return;

  terminal = new Terminal({
    theme: tokyoNightStorm,
    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace',
    fontSize: 14,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 10000,
    allowProposedApi: true,
  });

  fitAddon = new FitAddon.FitAddon();
  terminal.loadAddon(fitAddon);

  // Try to load WebGL addon for better performance
  try {
    const webglAddon = new WebglAddon.WebglAddon();
    terminal.loadAddon(webglAddon);
  } catch (e) {
    console.log('WebGL addon not available, using canvas renderer');
  }

  terminal.open(terminalContainer);
  fitAddon.fit();

  // Handle terminal input
  terminal.onData(data => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  // Handle terminal resize
  terminal.onResize(({ cols, rows }) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });
}

function handleResize() {
  if (fitAddon) {
    fitAddon.fit();
  }
}

function connectWebSocket(sessionId) {
  disconnectWebSocket();

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/session/${sessionId}?token=${token}`;

  setConnectionStatus('connecting');

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected');
    setConnectionStatus('connected');

    // Request terminal size
    if (terminal && fitAddon) {
      fitAddon.fit();
      const { cols, rows } = terminal;
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }

    // Refresh session list to show active status
    loadSessions();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'output':
          terminal?.write(msg.data);
          break;

        case 'scrollback':
          terminal?.write(msg.data);
          break;

        case 'status':
          currentSessionTitle.textContent = msg.sessionTitle || currentSessionTitle.textContent;
          break;

        case 'exit':
          console.log('Session exited with code:', msg.code);
          setConnectionStatus('disconnected');
          break;
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    setConnectionStatus('disconnected');
    ws = null;
    // Refresh session list to update active status
    loadSessions();
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    setConnectionStatus('disconnected');
  };
}

function disconnectWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

function setConnectionStatus(status) {
  connectionStatus.className = `status ${status}`;
  connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  renderSessionList(); // Update active indicators
}

function toggleSidebar() {
  sidebar.classList.toggle('open');
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    alert('Notifications are not supported in this browser');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Notification permission denied');
    return;
  }

  // Get VAPID key and subscribe
  try {
    const res = await fetch('/api/push/vapid-key', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const { publicKey } = await res.json();

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(subscription)
    });

    alert('Notifications enabled!');
  } catch (err) {
    console.error('Failed to enable notifications:', err);
    alert('Failed to enable notifications');
  }
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service worker registered');
    } catch (err) {
      console.error('Service worker registration failed:', err);
    }
  }
}

// Utility functions
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
