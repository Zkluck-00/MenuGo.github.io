class RealTimeClient {
  constructor() {
    this.eventSource = null;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 3000;
    this.isConnecting = false;
  }

  connect() {
    if (this.isConnecting) return;
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) return;

    this.isConnecting = true;
    const baseUrl = window.MENUGO_API || "http://localhost:4000/api";
    
    try {
      this.eventSource = new EventSource(`${baseUrl}/events`);
      
      this.eventSource.onopen = () => {
        console.log('Conexión SSE establecida');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleEvent(data);
        } catch (error) {
          console.error('Error parseando evento SSE:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('Error SSE:', error);
        this.isConnecting = false;
        this.eventSource.close();
        this.reconnect();
      };
    } catch (error) {
      console.error('Error creando conexión SSE:', error);
      this.isConnecting = false;
      this.reconnect();
    }
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Máximos intentos de reconexión alcanzados');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconectando en ${this.reconnectDelay}ms... (intento ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      this.connect();
    }, this.reconnectDelay);
  }

handleEvent(data) {
  const { type, data: eventData } = data;
  
  if (this.listeners.has(type)) {
    const callbacks = this.listeners.get(type);
    callbacks.forEach(callback => {
      try {
        callback(eventData);
      } catch (error) {
        console.error(`Error en callback para evento ${type}:`, error);
      }
    });
  }

  if (type === 'cuentas:actualizadas' || type === 'pago:cruzado:registrado') {
    if (this.listeners.has('pago_cruzado:actualizado')) {
      const callbacks = this.listeners.get('pago_cruzado:actualizado');
      callbacks.forEach(callback => {
        try {
          callback(eventData);
        } catch (error) {
          console.error('Error en callback de pago cruzado:', error);
        }
      });
    }
  }
}

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
  }

  off(eventType, callback) {
    if (!this.listeners.has(eventType)) return;
    const callbacks = this.listeners.get(eventType);
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
  }
}

const realTime = new RealTimeClient();