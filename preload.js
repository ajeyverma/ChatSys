/**
 * Preload Script — safe IPC bridge between renderer and main process.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    send: (channel, data) => ipcRenderer.send(channel, data),
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    on: (channel, callback) => {
        const handler = (_, ...args) => callback(...args);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    },
    receive: (channel, callback) => {
        const handler = (_, ...args) => callback(...args);
        ipcRenderer.on(channel, handler);
    },
    once: (channel, callback) => {
        ipcRenderer.once(channel, (_, ...args) => callback(...args));
    }
});
