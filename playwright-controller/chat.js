const express = require('express');
const { chromium } = require('playwright');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

let browser = null;
let page = null;
let wsClients = new Set();

app.use(express.json());

// ============================================
// FUNCIONES DE PLAYWRIGHT
// ============================================

async function startBrowser() {
  if (browser) return 'Navegador ya está abierto';
  browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  page = await context.newPage();
  broadcast({ type: 'status', message: 'Navegador iniciado ✅' });
  return 'Navegador iniciado ✅';
}

async function closeBrowser() {
  if (!browser) return 'Navegador no está abierto';
  await browser.close();
  browser = null;
  page = null;
  broadcast({ type: 'status', message: 'Navegador cerrado' });
  return 'Navegador cerrado';
}

async function navigate(url) {
  if (!page) return 'Inicia el navegador primero';
  await page.goto(url, { waitUntil: 'networkidle' });
  return `Navegado a: ${page.url()}`;
}

async function click(selector) {
  if (!page) return 'Inicia el navegador primero';
  await page.click(selector);
  return `Click en: ${selector}`;
}

async function fill(selector, text) {
  if (!page) return 'Inicia el navegador primero';
  await page.fill(selector, text);
  return `Rellenado: ${selector} = "${text}"`;
}

async function screenshot() {
  if (!page) return null;
  return await page.screenshot({ type: 'png' });
}

async function evaluate(code) {
  if (!page) return 'Inicia el navegador primero';
  const result = await page.evaluate(code);
  return result;
}

async function extractStructure() {
  if (!page) return 'Inicia el navegador primero';
  
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
  
  return structure;
}

// ============================================
// PROCESADOR DE COMANDOS
// ============================================

async function processCommand(userInput) {
  const input = userInput.toLowerCase().trim();

  // Iniciar navegador
  if (input === 'iniciar' || input === 'start') {
    return await startBrowser();
  }

  // Cerrar navegador
  if (input === 'cerrar' || input === 'close') {
    return await closeBrowser();
  }

  // Navegar
  if (input.startsWith('ir ') || input.startsWith('navigate ')) {
    const url = input.replace(/^(ir|navigate)\s+/, '');
    return await navigate(url);
  }

  // Click
  if (input.startsWith('click ')) {
    const selector = input.replace('click ', '');
    return await click(selector);
  }

  // Rellenar
  if (input.startsWith('llenar ') || input.startsWith('fill ')) {
    const parts = input.replace(/^(llenar|fill)\s+/, '').split(' = ');
    if (parts.length !== 2) return 'Formato: llenar selector = texto';
    return await fill(parts[0], parts[1]);
  }

  // Screenshot
  if (input === 'screenshot' || input === 'foto') {
    const img = await screenshot();
    if (!img) return 'Inicia el navegador primero';
    broadcast({ type: 'screenshot', data: img.toString('base64') });
    return 'Screenshot capturado ✅';
  }

  // Extraer estructura
  if (input === 'extraer' || input === 'extract') {
    const structure = await extractStructure();
    return structure;
  }

  // Evaluar JavaScript
  if (input.startsWith('eval ') || input.startsWith('js ')) {
    const code = input.replace(/^(eval|js)\s+/, '');
    const result = await evaluate(code);
    return result;
  }

  // Ayuda
  if (input === 'ayuda' || input === 'help' || input === '?') {
    return `
📋 COMANDOS DISPONIBLES:

🚀 NAVEGADOR:
  iniciar          - Abre el navegador
  cerrar           - Cierra el navegador
  ir <url>         - Navega a una URL
  
🖱️ INTERACCIÓN:
  click <selector> - Hace click en un elemento
  llenar <sel> = <texto> - Rellena un input

📸 CAPTURA Y EXTRACCIÓN:
  foto             - Captura pantalla
  extraer          - Extrae estructura de la página (títulos, bloques, etc)
  
💻 AVANZADO:
  eval <código>    - Ejecuta código JavaScript
  
❓ OTROS:
  ayuda            - Muestra esta lista
  
EJEMPLOS:
  ir https://www.skool.com/...
  click .button-login
  llenar input[type="email"] = test@example.com
  extraer
  foto
    `;
  }

  return 'Comando no reconocido. Escribe "ayuda" para ver los comandos disponibles.';
}

// ============================================
// API
// ============================================

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  
  try {
    const response = await processCommand(message);
    res.json({ 
      success: true, 
      response,
      type: typeof response === 'object' ? 'json' : 'text'
    });
  } catch (error) {
    res.json({ 
      success: false, 
      response: `❌ Error: ${error.message}`,
      type: 'error'
    });
  }
});

// ============================================
// UI HTML
// ============================================

const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤖 Chat Playwright</title>
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
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 700px;
      height: 80vh;
      max-height: 700px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
      border-bottom: 1px solid rgba(0,0,0,0.1);
    }
    
    .header h1 {
      font-size: 1.5em;
      margin-bottom: 4px;
    }
    
    .header p {
      font-size: 0.9em;
      opacity: 0.9;
    }
    
    .chat-area {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .message {
      padding: 12px 16px;
      border-radius: 8px;
      max-width: 85%;
      word-wrap: break-word;
      line-height: 1.4;
      font-size: 0.95em;
    }
    
    .message.user {
      align-self: flex-end;
      background: #667eea;
      color: white;
      border-radius: 16px 16px 4px 16px;
    }
    
    .message.bot {
      align-self: flex-start;
      background: #f0f0f0;
      color: #333;
      border-radius: 16px 16px 16px 4px;
    }
    
    .message.bot.success {
      background: #d4edda;
      color: #155724;
    }
    
    .message.bot.error {
      background: #f8d7da;
      color: #721c24;
    }
    
    .message.bot.json {
      background: #f5f5f5;
      color: #333;
      font-family: 'Monaco', monospace;
      font-size: 0.85em;
      max-width: 100%;
    }
    
    .message.screenshot {
      max-width: 100%;
      padding: 0;
    }
    
    .message.screenshot img {
      max-width: 100%;
      border-radius: 8px;
    }
    
    .input-area {
      padding: 16px;
      border-top: 1px solid #eee;
      display: flex;
      gap: 8px;
    }
    
    input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #ddd;
      border-radius: 24px;
      font-size: 0.95em;
      font-family: inherit;
      transition: border-color 0.3s;
    }
    
    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    button {
      padding: 12px 24px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 24px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    
    button:hover {
      background: #5568d3;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    }
    
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
      transform: none;
    }
    
    .status {
      text-align: center;
      padding: 8px;
      font-size: 0.85em;
      color: #999;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 Chat Playwright</h1>
      <p>Controla el navegador escribiendo comandos</p>
    </div>
    
    <div class="chat-area" id="chatArea"></div>
    
    <div class="input-area">
      <input 
        type="text" 
        id="input" 
        placeholder="Escribe un comando... (escribe 'ayuda' para ver opciones)"
        autocomplete="off"
      >
      <button id="sendBtn">Enviar</button>
    </div>
    
    <div class="status" id="status">Listo</div>
  </div>

  <script>
    const chatArea = document.getElementById('chatArea');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const statusEl = document.getElementById('status');
    
    let isLoading = false;
    
    function addMessage(text, type = 'bot', isJson = false) {
      const div = document.createElement('div');
      const className = isJson ? 'bot json' : type;
      div.className = \`message \${className}\`;
      
      if (isJson) {
        div.textContent = JSON.stringify(text, null, 2);
      } else if (type === 'screenshot') {
        div.innerHTML = \`<img src="data:image/png;base64,\${text}" alt="Screenshot">\`;
        div.className = 'message screenshot';
      } else {
        div.textContent = text;
      }
      
      chatArea.appendChild(div);
      chatArea.scrollTop = chatArea.scrollHeight;
    }
    
    async function sendMessage() {
      const message = input.value.trim();
      if (!message || isLoading) return;
      
      addMessage(message, 'user');
      input.value = '';
      isLoading = true;
      sendBtn.disabled = true;
      statusEl.textContent = 'Procesando...';
      
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        });
        
        const data = await res.json();
        
        if (data.success) {
          if (data.type === 'json') {
            addMessage(data.response, 'bot', true);
          } else if (data.type === 'text') {
            addMessage(data.response, 'bot');
          } else {
            addMessage(data.response, 'bot');
          }
        } else {
          addMessage(data.response, 'bot error');
        }
      } catch (error) {
        addMessage(\`❌ Error: \${error.message}\`, 'bot error');
      } finally {
        isLoading = false;
        sendBtn.disabled = false;
        statusEl.textContent = 'Listo';
        input.focus();
      }
    }
    
    // WebSocket para screenshots en tiempo real
    const ws = new WebSocket('ws://localhost:3000');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'screenshot') {
        addMessage(data.data, 'screenshot');
      }
    };
    
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    // Mensaje inicial
    addMessage('Hola! 👋 Soy tu asistente para Playwright. Escribe "ayuda" para ver los comandos disponibles.');
    input.focus();
  </script>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.send(htmlContent);
});

// ============================================
// WEBSOCKET
// ============================================

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(message) {
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// ============================================
// SERVIDOR
// ============================================

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     🤖 CHAT PLAYWRIGHT INICIADO        ║
╠════════════════════════════════════════╣
║                                        ║
║   Abre tu navegador:                   ║
║   👉 http://localhost:3000             ║
║                                        ║
║   Escribe comandos para controlar      ║
║   Playwright desde el chat             ║
║                                        ║
╚════════════════════════════════════════╝
  `);
});
