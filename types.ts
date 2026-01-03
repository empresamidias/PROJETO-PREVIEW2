
export interface PromptEntry {
  id?: number;
  session_id: string;
  mensagem: string;
  created_at?: string;
}

export interface ProjectFile {
  name: string;
  content: string | Uint8Array;
  type: 'file' | 'directory';
}

export interface ProjectData {
  id: string;
  files: string[];
}

export interface VirtualFile {
  path: string;
  content: string;
  isBinary: boolean;
}

export interface ProjectState {
  id: string;
  files: Record<string, VirtualFile>;
  status: 'idle' | 'loading' | 'ready' | 'error';
}
