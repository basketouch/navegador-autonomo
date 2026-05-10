# 🎮 Playwright Controller - Web UI

Una webapp moderna para controlar Playwright interactivamente desde el navegador.

## ✨ Características

- ✅ Iniciar/Cerrar navegador
- ✅ Navegar a URLs
- ✅ Hacer click en elementos
- ✅ Rellenar inputs
- ✅ Evaluar código JavaScript en la página
- ✅ Capturar screenshots
- ✅ Extraer estructura de páginas
- ✅ WebSocket para actualizaciones en tiempo real
- ✅ UI moderna y responsive

## 🚀 Instalación Rápida

### Paso 1: Descarga los archivos

Necesitas 2 archivos:
- `app.js` → El servidor
- `package.json` → Las dependencias

### Paso 2: Abre Terminal y ejecuta

```bash
# Crea una carpeta para el proyecto
mkdir playwright-webapp
cd playwright-webapp

# Copia los archivos aquí (app.js y package.json)

# Instala dependencias
npm install

# Inicia la app
npm start
```

### Paso 3: Abre en tu navegador

```
http://localhost:3000
```

¡Eso es todo! 🎉

## 📖 Cómo Usar

### 1. Iniciar Navegador
Haz click en "▶️ Iniciar Navegador"

### 2. Navegar a Skool
- Pega la URL en el campo "URL"
- Haz click en "🔗 Navegar"
- **Tienes que hacer LOGIN manualmente en el navegador que se abre**

### 3. Extraer Estructura
- Una vez logeado, haz click en "📊 Extraer Estructura"
- Verás todos los títulos, páginas y bloques en JSON

### 4. Otras Operaciones
- **Click**: Haz click en un selector CSS
- **Esperar**: Espera a que aparezca un elemento
- **Llenar**: Rellena un input
- **Evaluar JS**: Ejecuta código JavaScript personalizado
- **Screenshot**: Captura pantalla

## 🎯 Ejemplos

### Ejemplo 1: Hacer login + Extraer estructura
```
1. Iniciar Navegador ✓
2. Navegar a https://www.skool.com/...
3. Login manualmente en el navegador
4. Extraer Estructura ✓
→ Ves toda la estructura en JSON
```

### Ejemplo 2: Automatizar con clicks
```
Selector CSS: input[type="email"]
Llenar Input: email@example.com

Selector CSS: button[type="submit"]
Click ✓
```

### Ejemplo 3: Código JavaScript personalizado
```javascript
// En el evaluador, puedes poner cualquier código:
return document.querySelectorAll('h1').map(h => h.textContent);
return document.title;
return window.location.href;
```

## 📊 Estructura del Proyecto

```
playwright-webapp/
├── app.js              # Servidor + API + UI
├── package.json        # Dependencias
└── README.md           # Este archivo
```

## 🔧 API Endpoints

Si quieres usar la API directamente (sin UI):

```bash
# Iniciar navegador
POST http://localhost:3000/api/start

# Navegar
POST http://localhost:3000/api/navigate
Body: { "url": "https://..." }

# Screenshot
GET http://localhost:3000/api/screenshot

# Extraer estructura
GET http://localhost:3000/api/extract-structure

# Evaluar JavaScript
POST http://localhost:3000/api/evaluate
Body: { "code": "return document.title;" }

# Click
POST http://localhost:3000/api/click
Body: { "selector": "button.login" }

# Rellenar input
POST http://localhost:3000/api/fill
Body: { "selector": "input[type='email']", "text": "test@example.com" }

# Esperar elemento
POST http://localhost:3000/api/wait
Body: { "selector": ".modal", "timeout": 5000 }

# Cerrar
POST http://localhost:3000/api/close
```

## 🐛 Troubleshooting

**Error: "Navegador no iniciado"**
- Haz click en "▶️ Iniciar Navegador" primero

**Error: "Elemento no encontrado"**
- Verifica el selector CSS
- Usa DevTools (F12) para inspeccionar elementos

**WebSocket error**
- Recarga la página
- Asegúrate que el servidor está corriendo en puerto 3000

## 🚀 Mejoras Futuras

- [ ] Historial de comandos
- [ ] Grabación de sesiones
- [ ] Export a código Python/Node
- [ ] Multi-tab support
- [ ] Debug mode avanzado

## 📝 Notas

- El navegador se abre en modo visual (no headless)
- Los WebSockets permiten actualizaciones en tiempo real
- Los screenshots se capturan en PNG
- La extracción de estructura usa document.querySelectorAll

¡Disfruta controlando Playwright! 🎮
