# 🎵 NovoBeat Core - Advanced Audio Engine

**NovoBeat Core** es un reproductor de audio Hi-Fi de alto rendimiento diseñado para ejecutarse 100% en el navegador. Este proyecto utiliza estructuras de datos avanzadas y procesamiento de señales digitales para ofrecer una experiencia premium de gestión musical.

---

## 🚀 Cómo Iniciar el Proyecto

Sigue estos pasos para poner a funcionar NovoBeat en tu computadora:

### 1. Requisitos Previos
Asegúrate de tener instalado:
*   [Node.js](https://nodejs.org/) (Versión 18 o superior recomendada)
*   Un navegador moderno (Chrome, Edge o Brave recomendados por el soporte de Web Audio API)

### 2. Instalación de Dependencias
Abre una terminal en la carpeta del proyecto y ejecuta:
```bash
npm install
```

### 3. Ejecutar en Modo Desarrollo
Para iniciar la aplicación, ejecuta el siguiente comando:
```bash
npm run dev
```
Una vez ejecutado, abre tu navegador en la dirección que te indique la terminal (usualmente `http://localhost:5173`).

---

## 🛠️ Características Técnicas

### 🧠 Estructura de Datos (Doubly Linked List)
El motor de la lista de reproducción está construido sobre una **Lista Doblemente Enlazada** implementada desde cero en TypeScript (`src/structures/DoublyLinkedList.ts`). Esto permite:
*   Navegación bidireccional instantánea (Anterior/Siguiente).
*   Inserción dinámica por índice, al inicio o al final.
*   Gestión de memoria eficiente para los nodos de audio.

### 💾 Persistencia Local (IndexedDB)
No pierdas tus canciones. Gracias a la integración con **IndexedDB**, NovoBeat guarda físicamente los archivos de audio (.mp3, .wav) y tus notas personalizadas en el almacenamiento del navegador. Al recargar la página, la Lista Doble se reconstruye automáticamente.

### 🎛️ Motor de Audio y Efectos
Utiliza la **Web Audio API** para procesar efectos en tiempo real:
*   **Eco 3D (Reverb):** Simulación de estadio.
*   **Modo Submarino:** Filtro Low-pass dinámico.
*   **Nightcore:** Aumento de pitch y velocidad sin pérdida de calidad.
*   **Visualizador FFT:** Sistema de partículas y barras reactivas al ritmo de los bajos.

---

## 🎨 Guía de Uso
1.  **Cargar Música:** Haz clic en la zona inferior de "Carga tus Pistas" o arrastra múltiples archivos directamente a la aplicación.
2.  **Notas de Nodo:** Cada canción tiene su propio espacio de memoria. Escribe letras o apuntes en el panel central y se guardarán vinculados a ese nodo específico.
3.  **Temas:** Alterna entre el **Modo Claro** (default) y el **Modo Oscuro** usando el botón superior derecho.

---

**Desarrollado para:** Proyecto Final de Estructuras de Datos.  
**Tecnologías:** React, TypeScript, Vite, Lucide React, IDB-Keyval.
