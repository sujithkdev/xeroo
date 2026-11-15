const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('xeroo',{connect:address=>ipcRenderer.invoke('xeroo:connect',address)});
