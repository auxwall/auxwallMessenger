import io from 'socket.io-client';
import { feathers } from '@feathersjs/feathers';
import socketio from '@feathersjs/socketio-client';
import auth from '@feathersjs/authentication-client';
import rest from '@feathersjs/rest-client';

export class FeathersManager {
  constructor() {
    this.client = null;
    this.socket = null;
    this.currentToken = null;
    this.apiUrl = null;
    this.currentCompanyId = null;
  }

  /**
   * Initializes the Feathers client with REST and Socket.io transports.
   * @param {Object} options
   * @param {string} options.apiUrl - The base URL of the API (e.g., https://api.example.com/api)
   * @param {Object} options.storage - Storage object (must implement getItem, setItem, removeItem)
   * @param {string} [options.storageKey='accessToken'] - Key used for the auth token
   */
  async init({ apiUrl, storage, storageKey = 'accessToken' }) {
    if (this.client) return this.client;

    const socketUrl = apiUrl.includes('/api') ? apiUrl.split('/api')[0] : apiUrl;
    const apiBaseUrl = apiUrl.endsWith('/api') ? apiUrl : (apiUrl + "/api");

    this.apiUrl = apiBaseUrl;
    this.client = feathers();

    // 1. Configure REST (Fallback)
    const restClient = rest(apiBaseUrl);
    this.client.configure(restClient.fetch(fetch));

    // 2. Configure Socket.io
    this.socket = io(socketUrl, {
      transports: ['websocket'],
      autoConnect: false,
    });
    this.client.configure(socketio(this.socket));

    // 3. Configure Auth
    this.client.configure(auth({
      storage: storage,
      storageKey: storageKey
    }));

    // Header Injection Hook
    this.client.hooks({
      before: {
        all: [
          (context) => {
            if (this.currentToken) {
              context.params.headers = {
                ...(context.params.headers || {}),
                'Authorization': `bearer ${this.currentToken}`,
                'authorization': `bearer ${this.currentToken}`,
              };
              context.params.accessToken = this.currentToken;

              if (this.currentCompanyId) {
                context.params.headers['companyid'] = this.currentCompanyId.toString();
              }
            }
            return context;
          }
        ]
      }
    });

    return this.client;
  }

  /**
   * Authenticates the client and the Socket connection.
   * @param {Object} credentials
   * @param {string} credentials.token - The JWT access token
   * @param {string|number} credentials.companyId - The company ID for the socket handshake
   */
  async authenticate({ token, companyId }) {
    if (!token || !this.socket) return null;

    const companyIdStr = companyId.toString();
    const companyChanged = this.currentCompanyId !== companyIdStr;
    
    this.currentToken = token;
    this.currentCompanyId = companyIdStr;

    // Set socket auth and extra headers for handshake
    this.socket.auth = { token, strategy: 'jwt' };
    this.socket.io.opts.extraHeaders = {
      ...(this.socket.io.opts.extraHeaders || {}),
      Authorization: `bearer ${token}`,
      companyid: companyIdStr,
    };

    if (companyChanged && this.socket.connected) {
      this.socket.disconnect();
    }

    if (!this.socket.connected) {
      this.socket.connect();
    }

    return true;
  }

  getClient() {
    return this.client;
  }

  getSocket() {
    return this.socket;
  }

  getApiUrl() {
    return this.apiUrl;
  }

  /**
   * Clears the current session, disconnects the socket, and resets the client state.
   */
  async logout() {
    try {
      if (this.socket) {
        this.socket.disconnect();
      }
      
      this.currentToken = null;
      
      if (this.client) {
        await this.client.logout();
      }
      
      return true;
    } catch (error) {
      console.error("FeathersManager Logout Error:", error);
      return false;
    }
  }
}

export const feathersManager = new FeathersManager();
export default feathersManager;
