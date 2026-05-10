const express = require('express');
const { chromium } = require('playwright');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

let browser = null;
let page = null;

app.use(express.json());

// ============================================
// FUNCIONES DE PLAYWRIGHT
// ============================================

async function startBrowser() {
  if (browser) return 'Navegador ya está abierto';
  browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  page = await context.newPage();
  return 'Navegador iniciado ✅';
}

async function closeBrowser() {
  if (!browser) return 'Navegador no está abierto';
  await browser.close();
  browser = null;
  page = null;
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
    if (!browser) {
      await startBrowser();
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `Eres un asistente que convierte instrucciones naturales en acciones de Playwright.

Acciones disponibles:
- { "type": "navigate", "url": "https://..." }
- { "type": "click", "selector": ".class" }
- { "type": "fill", "selector": ".input", "text": "valor" }
- { "type": "screenshot" }
- { "type": "extract_text" }
- { "type": "wait", "ms": 1000 }
- { "type": "eval", "code": "javascript code" }

Responde SOLO con JSON: { "actions": [...], "explanation": "..." }`,
      messages: [
        {
          role: 'user',
          content: userInput
        }
      ]
    });

    const responseText = response.content[0].text;
    let plan;
    try {
      plan = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { error: 'No pude entender el comando. Intenta ser más específico.' };
      }
      plan = JSON.parse(jsonMatch[0]);
    }

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
            result = img ? img.toString('base64') : 'No screenshot';
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
          default:
            result = 'Acción no reconocida';
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
    return { error: error.message };
  }
}

// ============================================
// API ROUTES
// ============================================

app.get('/', (req, res) => {
  res.send(getHtmlContent());
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  try {
    const response = await processCommand(message);
    res.json({ success: true, response });
  } catch (error) {
    res.json({ success: false, response: `Error: ${error.message}` });
  }
});

function getHtmlContent() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤖 Automatización Inteligente</title>
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
      max-width: 1200px;
      height: 80vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
    }
    .header h1 { font-size: 1.5em; margin-bottom: 4px; }
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
    }
    .message.user {
      align-self: flex-end;
      background: #667eea;
      color: white;
    }
    .message.bot {
      align-self: flex-start;
      background: #f0f0f0;
      color: #333;
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
    }
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
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 Automatización Inteligente</h1>
      <p>Instrucciones en lenguaje natural con IA</p>
    </div>
    <div class="chat-area" id="chatArea"></div>
    <div class="input-area">
      <input type="text" id="input" placeholder="Cuéntame qué quieres hacer..." autocomplete="off">
      <button id="sendBtn">→</button>
    </div>
  </div>

  <script>
    const chatArea = document.getElementById('chatArea');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    let isLoading = false;

    function addMessage(text, type = 'bot') {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.textContent = typeof text === 'object' ? JSON.stringify(text, null, 2) : text;
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
          addMessage(typeof data.response === 'object' ? JSON.stringify(data.response, null, 2) : data.response, 'bot');
        } else {
          addMessage(data.response || 'Error desconocido', 'bot');
        }
      } catch (error) {
        addMessage('Error: ' + error.message, 'bot');
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

    addMessage('🤖 Soy tu asistente de automatización. Cuéntame qué quieres hacer: navega, busca, analiza, rellena formularios... ¡Lo entiendo todo!');
    input.focus();
  </script>
</body>
</html>`;
}

module.exports = app;
