
import { ProjectData, VirtualFile } from '../types';

// Using window.JSZip from the script tag
declare const JSZip: any;

const API_BASE = 'https://lineable-maricela-primly.ngrok-free.dev';

export const fetchProjectsList = async (): Promise<ProjectData[]> => {
  try {
    const response = await fetch(`${API_BASE}/projects/`, {
      method: 'GET',
      headers: { 
        'ngrok-skip-browser-warning': 'true',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn(`API returned status ${response.status}`);
      return [];
    }
    
    return await response.json();
  } catch (error) {
    console.error('Fetch projects error:', error);
    throw new Error('Could not connect to the projects server. Ensure the ngrok tunnel is active.');
  }
};

export const downloadAndUnzip = async (projectId: string, fileName: string): Promise<Record<string, VirtualFile>> => {
  const downloadUrl = `${API_BASE}/projects/${projectId}/download/${fileName}`;
  
  try {
    const response = await fetch(downloadUrl, {
      headers: { 'ngrok-skip-browser-warning': 'true' }
    });
    
    if (!response.ok) throw new Error(`Error downloading ZIP (${response.status})`);
    
    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);
    
    const files: Record<string, VirtualFile> = {};
    const promises: Promise<void>[] = [];
    
    zip.forEach((relativePath: string, file: any) => {
      if (!file.dir) {
        const promise = file.async('string').then((content: string) => {
          files[relativePath] = {
            path: relativePath,
            content: content,
            isBinary: false
          };
        });
        promises.push(promise);
      }
    });
    
    await Promise.all(promises);
    return files;
  } catch (error) {
    console.error('Unzip error:', error);
    throw error;
  }
};

/**
 * Escreve os arquivos virtuais em uma pasta física selecionada pelo usuário.
 */
export const writeFilesToLocal = async (
  files: Record<string, VirtualFile>,
  onProgress: (msg: string) => void
): Promise<string> => {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Seu navegador não suporta escrita em pastas locais. Use Chrome ou Edge.');
  }

  try {
    const directoryHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite'
    });

    onProgress(`Pasta selecionada: ${directoryHandle.name}. Iniciando sincronização...`);

    for (const [path, file] of Object.entries(files)) {
      const parts = path.split('/');
      let currentHandle = directoryHandle;

      // Criar subpastas
      for (let i = 0; i < parts.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
      }

      // Criar arquivo
      const fileName = parts[parts.length - 1];
      const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file.content);
      await writable.close();
      
      onProgress(`Escrito: ${path}`);
    }

    return directoryHandle.name;
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error('Operação cancelada pelo usuário.');
    throw error;
  }
};
