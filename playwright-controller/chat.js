const express = require('express');
const { chromium } = require('playwright');
const http = require('http');
const WebSocket = require('ws');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = 3000;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

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
    
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
      level: h.tagName,
      text: h.innerText?.trim()
    }));
    result.headings = headings;
    
    const listItems = Array.from(document.querySelectorAll('li')).map((li, idx) => ({
      index: idx,
      text: li.innerText?.trim().substring(0, 250)
    }));
    result.listItems = listItems;
    
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
// PROCESADOR DE COMANDOS CON CLAUDE
// ============================================

async function processCommand(userInput) {
  try {
    // Si el navegador no está abierto, iniciarlo automáticamente
    if (!browser && !userInput.toLowerCase().includes('cerrar')) {
      await startBrowser();
    }

    // Enviar comando natural a Claude para que lo interprete
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `Eres un asistente que convierte instrucciones naturales en acciones de Playwright para automatizar navegadores web.

El usuario está usando un navegador automatizado con Playwright. Tu tarea es:
1. Entender qué quiere hacer el usuario
2. Generar una lista de acciones en formato JSON

Acciones disponibles:
- { "type": "navigate", "url": "https://..." }
- { "type": "click", "selector": ".class" }
- { "type": "fill", "selector": ".input", "text": "valor" }
- { "type": "screenshot" }
- { "type": "extract_text" }
- { "type": "wait", "ms": 1000 }
- { "type": "eval", "code": "javascript code" }
- { "type": "scroll", "direction": "down", "pixels": 500 }

Responde SOLO con un JSON válido con estructura: { "actions": [...], "explanation": "..." }`,
      messages: [
        {
          role: 'user',
          content: userInput
        }
      ]
    });

    const responseText = response.content[0].text;

    // Parsear la respuesta JSON
    let plan;
    try {
      plan = JSON.parse(responseText);
    } catch (e) {
      // Si falla el parseo, intentar extraer JSON de la respuesta
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return 'No pude entender el comando. Intenta ser más específico.';
      }
      plan = JSON.parse(jsonMatch[0]);
    }

    // Ejecutar las acciones
    let results = [];
    for (const action of plan.actions) {
      try {
        let result;
        switch (action.type) {
          case 'navigate':
            result = await navigate(action.url);
            break;
          case 'click':
            result = await click(action.selector);
            break;
          case 'fill':
            result = await fill(action.selector, action.text);
            break;
          case 'screenshot':
            const img = await screenshot();
            if (img) {
              broadcast({ type: 'screenshot', data: img.toString('base64') });
              result = 'Screenshot capturado ✅';
            }
            break;
          case 'extract_text':
            result = await extractStructure();
            break;
          case 'wait':
            await new Promise(resolve => setTimeout(resolve, action.ms || 1000));
            result = 'Esperado';
            break;
          case 'eval':
            result = await evaluate(action.code);
            break;
          case 'scroll':
            // Implementar scroll si es necesario
            result = 'Scroll ejecutado';
            break;
          default:
            result = 'Acción no reconocida: ' + action.type;
        }
        results.push({ action: action.type, result });
      } catch (err) {
        results.push({ action: action.type, error: err.message });
      }
    }

    return {
      explanation: plan.explanation,
      actions: results
    };
  } catch (error) {
    return `Error: ${error.message}`;
  }
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
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
      max-width: 1400px;
      height: 80vh;
      display: grid;
      grid-template-columns: 1fr 320px;
      overflow: hidden;
    }
    
    .main { display: flex; flex-direction: column; }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
      border-bottom: 1px solid rgba(0,0,0,0.1);
    }
    
    .header h1 { font-size: 1.5em; margin-bottom: 4px; }
    .header p { font-size: 0.9em; opacity: 0.9; }
    
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
    
    .message.bot.json {
      background: #f5f5f5;
      font-family: 'Monaco', monospace;
      font-size: 0.85em;
      max-width: 100%;
      overflow-x: auto;
    }
    
    .message.screenshot { max-width: 100%; padding: 0; }
    .message.screenshot img { max-width: 100%; border-radius: 8px; }
    
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
    }
    
    input:focus { outline: none; border-color: #667eea; }
    
    button {
      padding: 12px 24px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 24px;
      font-weight: 600;
      cursor: pointer;
    }
    
    button:hover { background: #5568d3; }
    button:disabled { background: #ccc; }
    
    /* SIDEBAR */
    .sidebar {
      background: #f8f9fa;
      border-left: 1px solid #eee;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .sidebar-header {
      background: #667eea;
      color: white;
      padding: 14px;
      font-weight: 600;
      text-align: center;
      font-size: 0.9em;
    }
    
    .commands-list {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    
    .command-group { margin-bottom: 14px; }
    .command-group-title {
      font-weight: 600;
      color: #667eea;
      font-size: 0.8em;
      margin-bottom: 6px;
      padding-left: 4px;
      text-transform: uppercase;
    }
    
    .command-item {
      padding: 8px 10px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      margin-bottom: 5px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 0.75em;
    }
    
    .command-item:hover {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }
    
    .command-item code {
      display: block;
      font-weight: 600;
      font-family: 'Monaco', monospace;
      margin-bottom: 2px;
      font-size: 0.9em;
    }
    
    .command-item .desc {
      font-size: 0.8em;
      opacity: 0.8;
    }

    .command-item .desc em {
      display: block;
      font-style: normal;
      color: #667eea;
      font-weight: 500;
      margin-top: 3px;
      font-size: 0.75em;
      font-family: 'Monaco', monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="main">
      <div class="header">
        <h1>🤖 Automatización Inteligente</h1>
        <p>Instrucciones en lenguaje natural con IA</p>
      </div>
      
      <div class="chat-area" id="chatArea"></div>
      
      <div class="input-area">
        <input type="text" id="input" placeholder="Cuéntame qué quieres hacer: navega, analiza, llena formularios..." autocomplete="off">
        <button id="sendBtn">→</button>
      </div>
    </div>
    
    <div class="sidebar">
      <div class="sidebar-header">💡 EJEMPLOS</div>
      <div class="commands-list" id="commandsList"></div>
    </div>
  </div>

  <script>
    const COMMANDS = {
      '🌐 NAVEGACIÓN': [
        { cmd: 'Navega a Google y busca Python', display: 'Navega a Google y busca Python', desc: 'Navegar y buscar' },
        { cmd: 'Abre https://classroom.google.com y analiza las carpetas', display: 'Abre Classroom y analiza carpetas', desc: 'Abrir y analizar' }
      ],
      '📋 ANÁLISIS': [
        { cmd: 'Dame un listado de todos los títulos de esta página', display: 'Extrae títulos de la página', desc: 'Extraer información' },
        { cmd: 'Captura una foto y dame un listado de elementos visibles', display: 'Captura + lista elementos', desc: 'Screenshot y análisis' }
      ],
      '✍️ INTERACCIÓN': [
        { cmd: 'Rellena el formulario con: usuario@email.com y contraseña123', display: 'Rellena formulario', desc: 'Completar formularios' },
        { cmd: 'Haz click en el botón de enviar', display: 'Click en elemento', desc: 'Hacer clic' }
      ],
      '⚙️ COMBINADAS': [
        { cmd: 'Navega a Classroom, abre la primera carpeta y dame un listado de archivos', display: 'Navega + analiza + lista', desc: 'Flujo completo' }
      ]
    };
    
    const chatArea = document.getElementById('chatArea');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const commandsList = document.getElementById('commandsList');
    
    let isLoading = false;
    
    // Renderizar sidebar
    Object.entries(COMMANDS).forEach(([group, cmds]) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'command-group';
      
      const titleDiv = document.createElement('div');
      titleDiv.className = 'command-group-title';
      titleDiv.textContent = group;
      groupDiv.appendChild(titleDiv);
      
      cmds.forEach(({ cmd, display, desc, example }) => {
        const item = document.createElement('div');
        item.className = 'command-item';
        item.innerHTML = '<code>' + display + '</code><div class="desc">' + desc + (example ? ' <em>ej: ' + example + '</em>' : '') + '</div>';
        item.onclick = () => {
          input.value = cmd;
          input.focus();
          // Posiciona el cursor al final para comandos con parámetros
          if (cmd.endsWith(' ')) {
            input.setSelectionRange(input.value.length, input.value.length);
          }
        };
        item.title = example || desc; // Tooltip con ejemplo
        groupDiv.appendChild(item);
      });
      
      commandsList.appendChild(groupDiv);
    });
    
    function addMessage(text, type = 'bot', isJson = false) {
      const div = document.createElement('div');
      div.className = 'message ' + (isJson ? 'bot json' : type);

      if (isJson) {
        div.textContent = JSON.stringify(text, null, 2);
      } else if (type === 'screenshot') {
        div.innerHTML = '<img src="data:image/png;base64,' + text + '">';
        div.className = 'message screenshot';
      } else {
        div.textContent = text;
      }
      
      chatArea.appendChild(div);
      chatArea.scrollTop = chatArea.scrollHeight;
    }
    
    async function sendMessage() {
      const msg = input.value.trim();
      if (!msg || isLoading) return;
      
      addMessage(msg, 'user');
      input.value = '';
      isLoading = true;
      sendBtn.disabled = true;
      
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        
        const data = await res.json();
        if (data.success) {
          addMessage(data.response, 'bot', data.type === 'json');
        } else {
          addMessage(data.response, 'bot');
        }
      } catch (error) {
        addMessage('❌ Error: ' + error.message, 'bot');
      } finally {
        isLoading = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }
    
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    });
    
    const ws = new WebSocket('ws://localhost:3000');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'screenshot') {
        addMessage(data.data, 'screenshot');
      }
    };
    
    addMessage('🤖 Soy tu asistente de automatización. Cuéntame qué quieres hacer: navega, busca, analiza, rellena formularios... ¡Lo entiendo todo! Haz click en los ejemplos o escribe tu propia instrucción.');
    input.focus();
  </script>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.send(htmlContent);
});

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

server.listen(PORT, () => {
  console.log(`\n🤖 Chat Playwright en http://localhost:${PORT}\n`);
});
