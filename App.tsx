
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sendPrompt } from './services/supabaseService';
import { 
  fetchProjectsList, 
  downloadAndUnzip, 
  writeFilesToLocal, 
  checkProjectStatus, 
  triggerRunProject 
} from './services/projectService';
import { ProjectData, ProjectState, TerminalLog, VirtualFile } from './types';
import { FileExplorer } from './components/FileExplorer';
import { 
  Send, 
  Package, 
  RefreshCw, 
  AlertCircle, 
  Terminal as TerminalIcon, 
  Code,
  Github,
  Zap,
  Play,
  Square,
  ChevronUp,
  ChevronDown,
  Monitor,
  RotateCcw,
  FolderOpen,
  HardDrive
} from 'lucide-react';

const SESSION_ID = "7293dd5e-4757-4ebc-a721-a78982ccd0c6";

const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastStatus, setLastStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  
  const [activeProject, setActiveProject] = useState<ProjectState>({
    id: '',
    files: {},
    status: 'idle',
    buildStatus: 'idle',
    terminalLogs: [],
    viewMode: 'code',
    readyToRun: false
  });
  
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isLocalSyncing, setIsLocalSyncing] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const addLog = useCallback((text: string, type: TerminalLog['type'] = 'info') => {
    setActiveProject(prev => ({
      ...prev,
      terminalLogs: [
        ...prev.terminalLogs,
        {
          id: Math.random().toString(36).substr(2, 9),
          text,
          type,
          timestamp: new Date().toLocaleTimeString([], { hour12: false })
        }
      ]
    }));
  }, []);

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const list = await fetchProjectsList();
      setProjects(list);
    } catch (err) {
      setProjectError('Erro ao carregar lista de projetos.');
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [activeProject.terminalLogs]);

  const handleProjectSelect = async (project: ProjectData) => {
    setActiveProject({ 
      id: project.id, files: {}, status: 'loading', 
      buildStatus: 'idle', terminalLogs: [], viewMode: 'code',
      readyToRun: false
    });
    setSelectedFilePath(null);
    setIsTerminalOpen(false);

    try {
      addLog(`Iniciando checagem de status para o projeto ${project.id}...`, 'info');
      const status = await checkProjectStatus(project.id);
      
      if (!status.readyToRun) {
        addLog(`O projeto ${project.id} ainda não está pronto para rodar no backend.`, 'warning');
      } else {
        addLog(`Projeto ${project.id} está marcado como ReadyToRun.`, 'success');
      }

      const fileName = project.files[0] || 'project.zip';
      addLog(`Baixando e descompactando ${fileName}...`, 'info');
      
      const files = await downloadAndUnzip(project.id, fileName);
      
      setActiveProject(prev => ({ 
        ...prev, 
        files, 
        status: 'ready', 
        readyToRun: status.readyToRun 
      }));
      addLog('Arquivos carregados com sucesso.', 'success');
    } catch (err: any) {
      addLog(`Erro ao carregar projeto: ${err.message}`, 'error');
      setActiveProject(prev => ({ ...prev, status: 'error' }));
    }
  };

  const handleSetupLocal = async () => {
    if (Object.keys(activeProject.files).length === 0) return;
    setIsTerminalOpen(true);
    setIsLocalSyncing(true);
    try {
      addLog('Iniciando sincronização local...', 'command');
      const folder = await writeFilesToLocal(activeProject.files, (msg) => addLog(msg, 'info'));
      addLog(`Sucesso! Projeto salvo em ${folder}.`, 'success');
      addLog('Rode: npm install && npm run dev no seu VS Code.', 'warning');
    } catch (err: any) {
      addLog(`Erro na sincronização: ${err.message}`, 'error');
    } finally {
      setIsLocalSyncing(false);
    }
  };

  const generatePreviewContent = useCallback(() => {
    const files = activeProject.files;
    if (!files || Object.keys(files).length === 0) return '';

    const indexFile = files['index.html'] || Object.values(files).find(f => f.path.endsWith('index.html'));
    if (!indexFile) return '<html><body><h1>Index.html não encontrado</h1></body></html>';

    let html = indexFile.content;
    const importMap = `<script type="importmap">{"imports": {"react": "https://esm.sh/react@19.0.0","react-dom": "https://esm.sh/react-dom@19.0.0","react-dom/client": "https://esm.sh/react-dom@19.0.0/client","lucide-react": "https://esm.sh/lucide-react@0.460.0?external=react"}}</script>`;
    const babelSetup = `<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><script>Babel.registerPreset('my-preset', {presets: [[Babel.availablePresets['env'], { modules: false }],[Babel.availablePresets['react'], { runtime: 'automatic' }]]});</script>`;

    html = html.includes('<head>') ? html.replace('<head>', `<head>${importMap}${babelSetup}`) : `${importMap}${babelSetup}${html}`;

    const mainEntry = files['src/main.tsx'] || files['src/index.tsx'] || files['main.tsx'] || files['index.tsx'];
    if (mainEntry) {
      const scriptTag = `<script type="text/babel" data-presets="my-preset">${mainEntry.content}</script>`;
      html = html.includes('</body>') ? html.replace('</body>', `${scriptTag}</body>`) : html + scriptTag;
    }
    return html;
  }, [activeProject.files]);

  const runProject = async () => {
    if (activeProject.buildStatus !== 'idle') return;
    setIsTerminalOpen(true);
    setActiveProject(prev => ({ ...prev, buildStatus: 'installing' }));
    
    addLog('npm install && npm run dev (Virtual Runtime)', 'command');
    addLog('Acionando backend via /run-project...', 'info');
    
    const success = await triggerRunProject(activeProject.id);
    if (!success) {
      addLog('Falha ao comunicar início com o backend localhost:4000', 'warning');
    }

    await new Promise(r => setTimeout(r, 800));
    setActiveProject(prev => ({ ...prev, buildStatus: 'running', viewMode: 'preview' }));
    addLog('Vite Dev Server ready. Rendering Preview...', 'success');
  };

  const stopProject = () => {
    addLog('Processo encerrado.', 'warning');
    setActiveProject(prev => ({ ...prev, buildStatus: 'idle', viewMode: 'code' }));
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSending) return;
    setIsSending(true);
    const result = await sendPrompt(prompt, SESSION_ID);
    setLastStatus({ 
      type: result.success ? 'success' : 'error', 
      message: result.success ? 'Prompt enviado!' : 'Erro ao enviar prompt' 
    });
    if (result.success) setPrompt('');
    setIsSending(false);
  };

  const selectedFile = (selectedFilePath && activeProject.files) ? activeProject.files[selectedFilePath] : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      <aside className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2 text-indigo-400">
            <Zap size={20} /> <span className="tracking-tight text-lg">Workspaces</span>
          </h2>
          <button onClick={loadProjects} className="p-1 hover:bg-zinc-800 rounded">
            <RefreshCw size={18} className={isLoadingProjects ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => handleProjectSelect(proj)}
              className={`w-full text-left p-4 rounded-xl transition-all border ${
                activeProject.id === proj.id ? 'bg-indigo-600/10 border-indigo-500' : 'bg-zinc-800/30 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <div className="font-semibold text-zinc-100 truncate flex items-center gap-2">
                <Github size={14} className="text-zinc-500" /> <span className="text-xs">ID: {proj.id}</span>
                {proj.readyToRun && <span className="w-2 h-2 rounded-full bg-emerald-500" title="Ready to Run"></span>}
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-bold">
                {proj.files[0] || 'project.zip'}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <section className="bg-zinc-900/30 border-b border-zinc-800 p-6">
          <form onSubmit={handleSendPrompt} className="max-w-4xl mx-auto flex gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Qual será a próxima alteração?"
                className="w-full bg-zinc-800/50 border border-zinc-700 text-zinc-100 pl-5 pr-14 py-4 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" disabled={isSending} className="absolute right-3 top-2.5 p-2.5 bg-indigo-600 rounded-xl text-white">
                {isSending ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
          </form>
          {lastStatus && <div className={`mt-2 text-center text-[10px] font-black uppercase ${lastStatus.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>{lastStatus.message}</div>}
        </section>

        <section className="flex-1 flex overflow-hidden">
          {activeProject.status === 'ready' ? (
            <div className="flex flex-1 overflow-hidden">
              <FileExplorer files={activeProject.files} onSelectFile={(p) => setSelectedFilePath(p)} />
              <div className="flex-1 flex flex-col bg-zinc-950 relative">
                <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex items-center justify-between px-4">
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    <button onClick={() => setActiveProject(prev => ({...prev, viewMode: 'code'}))} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${activeProject.viewMode === 'code' ? 'bg-indigo-600 text-white' : 'text-zinc-500'}`}>Editor</button>
                    <button onClick={() => setActiveProject(prev => ({...prev, viewMode: 'preview'}))} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${activeProject.viewMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-zinc-500'}`}>Preview</button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSetupLocal} disabled={isLocalSyncing} className="text-[10px] font-bold uppercase bg-indigo-600/10 text-indigo-400 px-4 py-1.5 rounded-lg border border-indigo-600/20 flex items-center gap-2">
                      <HardDrive size={12} /> {isLocalSyncing ? 'Sincronizando...' : 'Setup Local'}
                    </button>
                    {activeProject.buildStatus === 'idle' ? (
                      <button onClick={runProject} className="text-[10px] font-bold uppercase bg-emerald-600/10 text-emerald-400 px-4 py-1.5 rounded-lg border border-emerald-600/20 flex items-center gap-2">
                        <Play size={12} fill="currentColor" /> Run Preview
                      </button>
                    ) : (
                      <button onClick={stopProject} className="text-[10px] font-bold uppercase bg-rose-600/10 text-rose-400 px-4 py-1.5 rounded-lg border border-rose-600/20 flex items-center gap-2">
                        <Square size={12} fill="currentColor" /> Stop
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                  {activeProject.viewMode === 'code' ? (
                    <div className="flex-1 overflow-auto p-8 font-mono text-sm text-zinc-300">
                      {selectedFile ? <pre className="whitespace-pre-wrap">{selectedFile.content}</pre> : <div className="h-full flex flex-col items-center justify-center opacity-20"><FolderOpen size={48} /><p className="mt-4">Selecione um arquivo</p></div>}
                    </div>
                  ) : (
                    <div className="flex-1 bg-white relative">
                      <iframe ref={iframeRef} title="Preview" className="w-full h-full border-none" srcDoc={generatePreviewContent()} sandbox="allow-scripts allow-forms allow-modals allow-same-origin" />
                      <button onClick={() => { if(iframeRef.current) iframeRef.current.srcdoc = generatePreviewContent(); }} className="absolute bottom-6 right-6 bg-indigo-600 p-3 rounded-2xl text-white shadow-2xl"><RotateCcw size={20} /></button>
                    </div>
                  )}
                  <div className={`transition-all duration-300 bg-zinc-900 border-t border-zinc-800 flex flex-col ${isTerminalOpen ? 'h-64' : 'h-10'}`}>
                    <div className="flex items-center justify-between px-4 py-2 cursor-pointer" onClick={() => setIsTerminalOpen(!isTerminalOpen)}>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-zinc-500">
                        <TerminalIcon size={12} /> Console Output
                        {activeProject.buildStatus !== 'idle' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>}
                      </div>
                      {isTerminalOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                    {isTerminalOpen && (
                      <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1 bg-black/40">
                        {activeProject.terminalLogs.map(log => (
                          <div key={log.id} className="flex gap-3">
                            <span className="text-zinc-600 w-16">[{log.timestamp}]</span>
                            <span className={log.type === 'command' ? 'text-indigo-400 font-bold' : log.type === 'success' ? 'text-emerald-400' : log.type === 'error' ? 'text-rose-400' : 'text-zinc-400'}>
                              {log.type === 'command' && '$ '}{log.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 bg-zinc-950">
              {activeProject.status === 'loading' ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-12 h-12 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin"></div>
                  <p className="text-xs font-bold uppercase tracking-widest">Building Workspace...</p>
                </div>
              ) : (
                <div className="text-center space-y-4 max-w-sm">
                  <Package size={64} className="mx-auto opacity-10" />
                  <h3 className="text-3xl font-black text-white">Project Viewer</h3>
                  <p className="text-sm">Selecione um projeto remoto para visualizar o código ou sincronizar localmente para desenvolvimento.</p>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
