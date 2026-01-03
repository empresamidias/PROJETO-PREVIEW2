
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

export const validateProject = (files: Record<string, VirtualFile>): boolean => {
  const filePaths = Object.keys(files);
  const hasIndex = filePaths.some(p => p.endsWith('index.html'));
  const hasPackageJson = filePaths.some(p => p.endsWith('package.json'));
  const hasViteConfig = filePaths.some(p => p.toLowerCase().includes('vite.config'));
  
  return hasIndex && hasPackageJson && hasViteConfig;
};
