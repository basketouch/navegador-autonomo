const express = require('express');
const { chromium } = require('playwright');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Variables globales
let browser = null;
let page = null;
let wsClients = new Set();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ============================================
// API ENDPOINTS
// ============================================

// Iniciar navegador
app.post('/api/start', async (req, res) => {
  try {
    if (browser) {
      return res.json({ status: 'Browser ya está abierto' });
    }
    
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    page = await context.newPage();
    
    // Capturar cambios de URL
    page.on('load', () => {
      broadcast({ type: 'urlChanged', url: page.url() });
    });
    
    broadcast({ type: 'status', message: 'Navegador iniciado' });
    res.json({ status: 'Navegador iniciado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Navegar a URL
app.post('/api/navigate', async (req, res) => {
  try {
    const { url } = req.body;
    if (!page) return res.status(400).json({ error: 'Navegador no iniciado' });
    
    await page.goto(url, { waitUntil: 'networkidle' });
    broadcast({ type: 'urlChanged', url: page.url() });
    res.json({ status: 'Navegado', url: page.url() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Captura de pantalla
app.get('/api/screenshot', async (req, res) => {
  try {
    if (!page) return res.status(400).json({ error: 'Navegador no iniciado' });
    
    const screenshot = await page.screenshot({ type: 'png' });
    res.type('image/png').send(screenshot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Evaluar código JavaScript en la página
app.post('/api/evaluate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!page) return res.status(400).json({ error: 'Navegador no iniciado' });
    
    const result = await page.evaluate(code);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Click en elemento
app.post('/api/click', async (req, res) => {
  try {
    const { selector } = req.body;
    if (!page) return res.status(400).json({ error: 'Navegador no iniciado' });
    
    await page.click(selector);
    res.json({ status: 'Click realizado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fill input
app.post('/api/fill', async (req, res) => {
  try {
    const { selector, text } = req.body;
    if (!page) return res.status(400).json({ error: 'Navegador no iniciado' });
    
    await page.fill(selector, text);
    res.json({ status: 'Texto ingresado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Esperar elemento
app.post('/api/wait', async (req, res) => {
  try {
    const { selector, timeout = 5000 } = req.body;
    if (!page) return res.status(400).json({ error: 'Navegador no iniciado' });
    
    await page.waitForSelector(selector, { timeout });
    res.json({ status: 'Elemento encontrado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cerrar navegador
app.post('/api/close', async (req, res) => {
  try {
    if (browser) {
      await browser.close();
      browser = null;
      page = null;
    }
    broadcast({ type: 'status', message: 'Navegador cerrado' });
    res.json({ status: 'Navegador cerrado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Extraer estructura (como el script anterior)
app.get('/api/extract-structure', async (req, res) => {
  try {
    if (!page) return res.status(400).json({ error: 'Navegador no iniciado' });
    
    const structure = await page.evaluate(() => {
      const result = {
        headings: [],
        listItems: [],
        blocks: []
      };
      
      // Títulos
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
        level: h.tagName,
        text: h.innerText?.trim()
      }));
      result.headings = headings;
      
      // Lista items
      const listItems = Array.from(document.querySelectorAll('li')).map((li, idx) => ({
        index: idx,
        text: li.innerText?.trim().substring(0, 250)
      }));
      result.listItems = listItems;
      
      // Bloques
      const allElements = document.querySelectorAll('article, [class*="page"], [class*="section"], [class*="block"]');
      allElements.forEach((el, idx) => {
        const text = el.innerText?.trim() || '';
        if (text.length > 15) {
          result.blocks.push({
            index: idx,
            tag: el.tagName,
            class: el.className.substring(0, 100),
            text: text.substring(0, 200)
          });
        }
      });
      
      return result;
    });
    
    res.json(structure);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket
function broadcast(message) {
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// ============================================
// HTML/UI
// ============================================
const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Playwright Controller</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    
    .panel {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      padding: 24px;
    }
    
    h1 {
      color: white;
      margin-bottom: 20px;
      text-align: center;
      grid-column: 1 / -1;
      font-size: 2.5em;
    }
    
    h2 {
      color: #333;
      font-size: 1.3em;
      margin-bottom: 16px;
      border-bottom: 2px solid #667eea;
      padding-bottom: 8px;
    }
    
    .control-group {
      margin-bottom: 16px;
    }
    
    label {
      display: block;
      font-weight: 600;
      color: #555;
      margin-bottom: 6px;
      font-size: 0.9em;
    }
    
    input[type="text"],
    input[type="url"],
    textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 0.95em;
      font-family: 'Monaco', monospace;
      transition: border-color 0.3s;
    }
    
    input[type="text"]:focus,
    input[type="url"]:focus,
    textarea:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    button {
      padding: 12px 20px;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 0.95em;
    }
    
    .btn-primary {
      background: #667eea;
      color: white;
      width: 100%;
    }
    
    .btn-primary:hover {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    }
    
    .btn-secondary {
      background: #f093fb;
      color: white;
      width: 48%;
      margin-right: 4%;
    }
    
    .btn-secondary:last-of-type {
      margin-right: 0;
    }
    
    .btn-danger {
      background: #ff6b6b;
      color: white;
      width: 100%;
    }
    
    .btn-danger:hover {
      background: #ee5a52;
    }
    
    .btn-group {
      display: flex;
      gap: 10px;
    }
    
    .output {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 12px;
      max-height: 200px;
      overflow-y: auto;
      font-size: 0.85em;
      font-family: 'Monaco', monospace;
      color: #333;
    }
    
    .status {
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.9em;
      margin-bottom: 12px;
      text-align: center;
      font-weight: 500;
    }
    
    .status.active {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .status.inactive {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    #screenshot {
      width: 100%;
      border-radius: 6px;
      margin-top: 12px;
      border: 1px solid #ddd;
    }
    
    .preview-panel {
      grid-column: 1 / -1;
      text-align: center;
    }
    
    textarea {
      min-height: 80px;
      resize: vertical;
    }
    
    .message {
      padding: 8px;
      margin: 4px 0;
      border-radius: 4px;
      background: #e7f3ff;
      border-left: 3px solid #667eea;
      color: #004085;
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <h1>🎮 Playwright Controller</h1>
  
  <div class="container">
    <!-- Panel Control -->
    <div class="panel">
      <h2>Control</h2>
      
      <div id="status" class="status inactive">Desconectado</div>
      
      <div class="control-group">
        <button class="btn-primary" onclick="startBrowser()">▶️ Iniciar Navegador</button>
      </div>
      
      <div class="control-group">
        <label>URL</label>
        <input type="url" id="urlInput" placeholder="https://www.skool.com/...">
        <button class="btn-primary" onclick="navigate()" style="margin-top: 8px;">🔗 Navegar</button>
      </div>
      
      <div class="control-group">
        <label>Selector CSS</label>
        <input type="text" id="selector" placeholder="p, .button, #id">
        <div class="btn-group" style="margin-top: 8px;">
          <button class="btn-secondary" onclick="clickElement()">Click</button>
          <button class="btn-secondary" onclick="waitElement()">Esperar</button>
        </div>
      </div>
      
      <div class="control-group">
        <label>Llenar Input</label>
        <input type="text" id="fillInput" placeholder="Selector">
        <input type="text" id="fillText" placeholder="Texto" style="margin-top: 6px;">
        <button class="btn-primary" onclick="fillInput()" style="margin-top: 8px;">Llenar</button>
      </div>
      
      <div class="control-group">
        <button class="btn-primary" onclick="extractStructure()">📊 Extraer Estructura</button>
      </div>
      
      <div class="control-group">
        <button class="btn-danger" onclick="closeBrowser()">❌ Cerrar Navegador</button>
      </div>
    </div>
    
    <!-- Panel Evaluador -->
    <div class="panel">
      <h2>Evaluador JS</h2>
      
      <div class="control-group">
        <label>Código JavaScript</label>
        <textarea id="jsCode" placeholder="return document.title;"></textarea>
        <button class="btn-primary" onclick="evaluateCode()" style="margin-top: 8px;">▶️ Ejecutar</button>
      </div>
      
      <div class="control-group">
        <label>Resultado:</label>
        <div id="jsOutput" class="output">Esperando...</div>
      </div>
      
      <div class="control-group">
        <label>Mensajes:</label>
        <div id="messages" class="output" style="max-height: 150px;"></div>
      </div>
    </div>
    
    <!-- Panel Screenshot -->
    <div class="panel preview-panel">
      <h2>Vista Previa</h2>
      <button class="btn-primary" onclick="takeScreenshot()" style="margin-bottom: 12px;">📸 Capturar Pantalla</button>
      <img id="screenshot" src="" alt="Screenshot" style="display: none;">
      <div id="screenshotLoading" style="color: #999;">Haz click en "Capturar Pantalla"</div>
    </div>
  </div>
  
  <script>
    const statusEl = document.getElementById('status');
    const messagesEl = document.getElementById('messages');
    
    function addMessage(msg, type = 'info') {
      const div = document.createElement('div');
      div.className = 'message';
      div.textContent = msg;
      messagesEl.insertBefore(div, messagesEl.firstChild);
      if (messagesEl.children.length > 20) {
        messagesEl.removeChild(messagesEl.lastChild);
      }
    }
    
    function updateStatus(browserRunning) {
      if (browserRunning) {
        statusEl.textContent = '✅ Conectado';
        statusEl.className = 'status active';
      } else {
        statusEl.textContent = '❌ Desconectado';
        statusEl.className = 'status inactive';
      }
    }
    
    // WebSocket para actualizaciones en tiempo real
    const ws = new WebSocket('ws://localhost:3000');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'status') {
        addMessage(data.message);
        updateStatus(true);
      } else if (data.type === 'urlChanged') {
        addMessage('URL: ' + data.url);
      }
    };
    
    async function startBrowser() {
      try {
        const res = await fetch('/api/start', { method: 'POST' });
        const data = await res.json();
        addMessage(data.status);
        updateStatus(true);
      } catch (e) {
        addMessage('Error: ' + e.message);
      }
    }
    
    async function navigate() {
      const url = document.getElementById('urlInput').value;
      if (!url) {
        addMessage('⚠️ Ingresa una URL');
        return;
      }
      try {
        const res = await fetch('/api/navigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        addMessage('Navegado a: ' + url);
      } catch (e) {
        addMessage('Error: ' + e.message);
      }
    }
    
    async function clickElement() {
      const selector = document.getElementById('selector').value;
      if (!selector) {
        addMessage('⚠️ Ingresa un selector');
        return;
      }
      try {
        const res = await fetch('/api/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selector })
        });
        addMessage('Click en: ' + selector);
      } catch (e) {
        addMessage('Error: ' + e.message);
      }
    }
    
    async function fillInput() {
      const selector = document.getElementById('fillInput').value;
      const text = document.getElementById('fillText').value;
      if (!selector || !text) {
        addMessage('⚠️ Ingresa selector y texto');
        return;
      }
      try {
        await fetch('/api/fill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selector, text })
        });
        addMessage('Rellenado: ' + selector);
      } catch (e) {
        addMessage('Error: ' + e.message);
      }
    }
    
    async function waitElement() {
      const selector = document.getElementById('selector').value;
      if (!selector) {
        addMessage('⚠️ Ingresa un selector');
        return;
      }
      try {
        await fetch('/api/wait', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selector })
        });
        addMessage('✅ Elemento encontrado: ' + selector);
      } catch (e) {
        addMessage('❌ Elemento no encontrado');
      }
    }
    
    async function evaluateCode() {
      const code = document.getElementById('jsCode').value;
      if (!code) {
        addMessage('⚠️ Ingresa código JS');
        return;
      }
      try {
        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        document.getElementById('jsOutput').textContent = JSON.stringify(data.result, null, 2);
        addMessage('Código ejecutado');
      } catch (e) {
        addMessage('Error: ' + e.message);
      }
    }
    
    async function takeScreenshot() {
      try {
        const res = await fetch('/api/screenshot');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const img = document.getElementById('screenshot');
        img.src = url;
        img.style.display = 'block';
        document.getElementById('screenshotLoading').style.display = 'none';
        addMessage('📸 Screenshot capturado');
      } catch (e) {
        addMessage('Error: ' + e.message);
      }
    }
    
    async function extractStructure() {
      try {
        const res = await fetch('/api/extract-structure');
        const data = await res.json();
        document.getElementById('jsOutput').textContent = JSON.stringify(data, null, 2);
        addMessage('Estructura extraída');
      } catch (e) {
        addMessage('Error: ' + e.message);
      }
    }
    
    async function closeBrowser() {
      try {
        await fetch('/api/close', { method: 'POST' });
        addMessage('Navegador cerrado');
        updateStatus(false);
      } catch (e) {
        addMessage('Error: ' + e.message);
      }
    }
  </script>
</body>
</html>
`;

// Servir HTML
app.get('/', (req, res) => {
  res.send(htmlContent);
});

// ============================================
// SERVER
// ============================================
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🎮 PLAYWRIGHT CONTROLLER INICIADO    ║
╠════════════════════════════════════════╣
║                                        ║
║   Abre tu navegador:                   ║
║   👉 http://localhost:3000             ║
║                                        ║
║   ✨ Controla Playwright desde la UI   ║
║                                        ║
╚════════════════════════════════════════╝
  `);
});
