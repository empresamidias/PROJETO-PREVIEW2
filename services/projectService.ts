
import { ProjectData, VirtualFile } from '../types';

// Using window.JSZip from the script tag
declare const JSZip: any;

const API_LOCAL = 'http://localhost:4000';
const API_NGROK = 'https://lineable-maricela-primly.ngrok-free.dev';

export const fetchProjectsList = async (): Promise<ProjectData[]> => {
  try {
    const response = await fetch(`${API_NGROK}/projects/`, {
      method: 'GET',
      headers: { 
        'ngrok-skip-browser-warning': 'true',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error('Fetch projects error:', error);
    return [];
  }
};

export const checkProjectStatus = async (id: string): Promise<{ readyToRun: boolean }> => {
  try {
    const response = await fetch(`${API_LOCAL}/project-status/${id}`);
    if (!response.ok) return { readyToRun: false };
    return await response.json();
  } catch (error) {
    console.error('Status check error:', error);
    return { readyToRun: false };
  }
};

export const triggerRunProject = async (id: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_LOCAL}/run-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

export const downloadAndUnzip = async (projectId: string, fileName: string): Promise<Record<string, VirtualFile>> => {
  const downloadUrl = `${API_NGROK}/projects/${projectId}/download/${fileName}`;
  
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

export const writeFilesToLocal = async (
  files: Record<string, VirtualFile>,
  onProgress: (msg: string) => void
): Promise<string> => {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Seu navegador não suporta escrita em pastas locais.');
  }

  try {
    const directoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    onProgress(`Pasta selecionada: ${directoryHandle.name}.`);

    for (const [path, file] of Object.entries(files)) {
      const parts = path.split('/');
      let currentHandle = directoryHandle;

      for (let i = 0; i < parts.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(parts[i], { create: true });
      }

      const fileName = parts[parts.length - 1];
      const fileHandle = await currentHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file.content);
      await writable.close();
      onProgress(`Sincronizado: ${path}`);
    }

    return directoryHandle.name;
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error('Operação cancelada.');
    throw error;
  }
};
