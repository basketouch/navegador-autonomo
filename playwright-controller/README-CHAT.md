# 🤖 Chat Playwright

Controla Playwright escribiendo comandos en un chat. Super simple.

## 🚀 Instalación

```bash
# Descargar
git clone https://github.com/basketouch/navegador-autonomo.git
cd navegador-autonomo/chat-playwright

# Instalar
npm install

# Ejecutar
npm start
```

Abre: `http://localhost:3000`

---

## 📋 Comandos

### 🌐 Navegación
```
iniciar        → Abre el navegador
cerrar         → Cierra el navegador
ir <url>       → Navega a una URL
```

### 🖱️ Interacción
```
click <selector>              → Hace click
llenar <selector> = <texto>   → Rellena un input
```

### 📸 Captura
```
foto      → Captura pantalla
extraer   → Extrae estructura (títulos, bloques, listas)
```

### 💻 Avanzado
```
eval <código>   → Ejecuta JavaScript personalizado
ayuda           → Ver todos los comandos
```

---

## 💡 Ejemplos

### Extraer estructura de Skool

```
iniciar
ir https://www.skool.com/jorge-lorenzo-coach/classroom/...
[HACES LOGIN MANUALMENTE EN EL NAVEGADOR]
extraer
```

### Automatizar un formulario

```
iniciar
ir https://ejemplo.com/formulario
llenar input[type="email"] = test@example.com
llenar input[type="password"] = miPassword123
click button[type="submit"]
foto
```

### Evaluar JavaScript personalizado

```
eval return document.title
eval return document.querySelectorAll('h1').length
eval return JSON.stringify({url: window.location.href, title: document.title})
```

---

## 🎯 Caso Real: Skool

1. Escribe: `iniciar`
2. Escribe: `ir https://www.skool.com/jorge-lorenzo-coach/classroom/f46163e1?md=297c9104a80f4b43baf68d0c04ff7340`
3. **Haz login manualmente** en el navegador que se abre
4. Escribe: `extraer`
5. ¡Recibes la estructura completa en JSON!

---

## 🔧 Técnica

- **Frontend**: HTML + Chat visual
- **Backend**: Express + Playwright + WebSocket
- **Comunicación**: REST API

---

## 📝 Notas

- El navegador se abre en modo visual (ves todo)
- Los comandos se ejecutan secuencialmente
- Los screenshots se capturan automáticamente
- Puedes escribir cualquier código JavaScript con `eval`

---

¡Disfruta! 🚀
