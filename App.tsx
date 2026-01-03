
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sendPrompt } from './services/supabaseService';
import { fetchProjectsList, downloadAndUnzip, writeFilesToLocal } from './services/projectService';
import { ProjectData, ProjectState, TerminalLog } from './types';
import { FileExplorer } from './components/FileExplorer';
import { 
  Send, 
  Package, 
  RefreshCw, 
  AlertCircle, 
  Terminal as TerminalIcon, 
  Layout, 
  Code,
  Github,
  Zap,
  Play,
  Square,
  Download,
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
    viewMode: 'code'
  });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isLocalReady, setIsLocalReady] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setProjectError(null);
    try {
      const list = await fetchProjectsList();
      setProjects(list);
    } catch (err: any) {
      setProjectError(err.message);
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

  const addLog = (text: string, type: TerminalLog['type'] = 'info') => {
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
  };

  const handleSetupLocal = async () => {
    setIsTerminalOpen(true);
    try {
      addLog('Iniciando sincronização com sistema de arquivos local...', 'command');
      const folderName = await writeFilesToLocal(activeProject.files, (msg) => {
        addLog(msg, 'info');
      });
      
      addLog(`Sucesso! Arquivos salvos em: ${folderName}`, 'success');
      addLog('--- INSTRUÇÕES PARA VS CODE ---', 'warning');
      addLog(`1. Abra o VS Code na pasta: ${folderName}`, 'info');
      addLog(`2. No terminal do VS Code, execute:`, 'info');
      addLog(`   npm install`, 'command');
      addLog(`3. Para rodar o projeto:`, 'info');
      addLog(`   npm run dev`, 'command');
      
      setIsLocalReady(true);
    } catch (err: any) {
      addLog(`Erro: ${err.message}`, 'error');
    }
  };

  const generatePreviewContent = useCallback(() => {
    const files = activeProject.files;
    const indexFile = files['index.html'] || Object.values(files).find(f => f.path.endsWith('index.html'));
    if (!indexFile) return '<html><body><h1>Index.html not found</h1></body></html>';

    let html = indexFile.content;
    const importMap = `
      <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@19.0.0",
          "react-dom": "https://esm.sh/react-dom@19.0.0",
          "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
          "lucide-react": "https://esm.sh/lucide-react@0.460.0"
        }
      }
      </script>
    `;

    const babelSetup = `
      <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
      <script>
        Babel.registerPreset('my-preset', {
          presets: [
            [Babel.availablePresets['env'], { modules: false }],
            [Babel.availablePresets['react'], { runtime: 'automatic' }]
          ]
        });
      </script>
    `;

    html = html.replace('<head>', `<head>${importMap}${babelSetup}`);
    const mainEntry = files['src/main.tsx'] || files['src/index.tsx'] || files['main.tsx'];
    if (mainEntry) {
      const scriptTag = `
        <script type="text/babel" data-presets="my-preset">
          ${mainEntry.content}
        </script>
      `;
      html = html.replace('</body>', `${scriptTag}</body>`);
    }
    return html;
  }, [activeProject.files]);

  const runProject = async () => {
    if (activeProject.buildStatus !== 'idle') return;
    setIsTerminalOpen(true);
    setActiveProject(prev => ({ ...prev, buildStatus: 'installing', terminalLogs: [] }));
    
    addLog('npm install (virtual)', 'command');
    addLog('Instalando dependências no ambiente virtual...', 'info');
    await new Promise(r => setTimeout(r, 600));
    addLog('Dependências prontas.', 'success');
    
    addLog('npm run dev', 'command');
    setActiveProject(prev => ({ ...prev, buildStatus: 'running' }));
    addLog('> vite (virtual mode)', 'info');
    await new Promise(r => setTimeout(r, 800));
    
    setActiveProject(prev => ({ ...prev, viewMode: 'preview' }));
    addLog('➜  Preview renderizado com sucesso.', 'info');
  };

  const stopProject = () => {
    addLog('Processo encerrado.', 'warning');
    setActiveProject(prev => ({ ...prev, buildStatus: 'idle', viewMode: 'code' }));
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSending) return;
    setIsSending(true);
    setLastStatus(null);
    const result = await sendPrompt(prompt, SESSION_ID);
    if (result.success) {
      setLastStatus({ type: 'success', message: 'Prompt salvo!' });
      setPrompt('');
    } else {
      setLastStatus({ type: 'error', message: result.error || 'Erro' });
    }
    setIsSending(false);
  };

  const handleProjectSelect = async (project: ProjectData) => {
    const fileName = project.files[0] || 'project.zip';
    setActiveProject({ 
      id: project.id, files: {}, status: 'loading', 
      buildStatus: 'idle', terminalLogs: [], viewMode: 'code' 
    });
    setSelectedFilePath(null);
    setIsTerminalOpen(false);
    setIsLocalReady(false);
    try {
      const files = await downloadAndUnzip(project.id, fileName);
      setActiveProject(prev => ({ ...prev, files, status: 'ready' }));
    } catch (err) {
      setActiveProject(prev => ({ ...prev, status: 'error' }));
    }
  };

  const selectedFile = selectedFilePath ? activeProject.files[selectedFilePath] : null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col shadow-2xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2 text-indigo-400">
            <Zap size={20} className="fill-indigo-400/20" /> 
            <span className="tracking-tight text-lg">Remote Projects</span>
          </h2>
          <button onClick={loadProjects} className="text-zinc-500 hover:text-white" disabled={isLoadingProjects}>
            <RefreshCw size={18} className={isLoadingProjects ? 'animate-spin' : ''} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => handleProjectSelect(proj)}
              className={`w-full text-left p-4 rounded-xl transition-all border ${
                activeProject.id === proj.id ? 'bg-indigo-600/10 border-indigo-500' : 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              <div className="font-semibold text-zinc-100 truncate flex items-center gap-2">
                <Github size={14} className="text-zinc-500" /> ID: {proj.id}
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-bold">
                {proj.files[0] || 'project.zip'}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        <section className="bg-zinc-900/50 border-b border-zinc-800 p-6">
          <form onSubmit={handleSendPrompt} className="max-w-4xl mx-auto flex gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enviar prompt para o Supabase..."
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 pl-5 pr-14 py-4 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="submit" className="absolute right-3 top-2.5 p-2.5 bg-indigo-600 rounded-xl">
                {isSending ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
          </form>
          {lastStatus && <div className="mt-2 text-center text-[10px] font-bold uppercase">{lastStatus.message}</div>}
        </section>

        <section className="flex-1 flex overflow-hidden">
          {activeProject.status === 'ready' ? (
            <div className="flex flex-1 overflow-hidden">
              <FileExplorer files={activeProject.files} onSelectFile={(p) => { setSelectedFilePath(p); setActiveProject(prev => ({...prev, viewMode: 'code'})); }} />
              
              <div className="flex-1 flex flex-col bg-zinc-950 relative">
                {/* View Toolbar */}
                <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex items-center justify-between px-4">
                  <div className="flex bg-zinc-950/50 p-1 rounded-lg border border-zinc-800">
                    <button 
                      onClick={() => setActiveProject(prev => ({...prev, viewMode: 'code'}))}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${activeProject.viewMode === 'code' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <Code size={12} /> Code
                    </button>
                    <button 
                      onClick={() => setActiveProject(prev => ({...prev, viewMode: 'preview'}))}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${activeProject.viewMode === 'preview' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <Monitor size={12} /> Preview
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={handleSetupLocal}
                      className="text-[10px] font-bold uppercase bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white px-4 py-1.5 rounded-lg border border-indigo-600/20 flex items-center gap-2 transition-all"
                    >
                      <HardDrive size={12} /> Setup Local Workspace
                    </button>

                    {activeProject.buildStatus === 'idle' ? (
                      <button onClick={runProject} className="text-[10px] font-bold uppercase bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600 hover:text-white px-4 py-1.5 rounded-lg border border-emerald-600/20 flex items-center gap-2 transition-all">
                        <Play size={12} fill="currentColor" /> Run Preview
                      </button>
                    ) : (
                      <button onClick={stopProject} className="text-[10px] font-bold uppercase bg-rose-600/10 text-rose-400 hover:bg-rose-600 hover:text-white px-4 py-1.5 rounded-lg border border-rose-600/20 flex items-center gap-2 transition-all">
                        <Square size={12} fill="currentColor" /> Stop
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden relative">
                  {activeProject.viewMode === 'code' ? (
                    <div className="flex-1 overflow-auto p-8 font-mono text-sm text-zinc-300 bg-zinc-950">
                      {selectedFile ? (
                        <div className="animate-in fade-in duration-300">
                          <pre className="whitespace-pre-wrap">{selectedFile.content}</pre>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                          <FolderOpen size={48} />
                          <p>Selecione um arquivo para visualizar o código</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 bg-white relative">
                      <iframe 
                        ref={iframeRef}
                        title="Project Preview"
                        className="w-full h-full border-none"
                        srcDoc={generatePreviewContent()}
                        sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
                      />
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button 
                          onClick={() => { if(iframeRef.current) iframeRef.current.srcdoc = generatePreviewContent(); }}
                          className="bg-zinc-900/80 p-2 rounded-full text-white hover:bg-indigo-600 transition-colors shadow-xl"
                          title="Reload Preview"
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Terminal */}
                  <div className={`transition-all duration-300 border-t border-zinc-800 bg-zinc-900 flex flex-col ${isTerminalOpen ? 'h-64' : 'h-10'}`}>
                    <div className="flex items-center justify-between px-4 py-2 cursor-pointer border-b border-zinc-800/50" onClick={() => setIsTerminalOpen(!isTerminalOpen)}>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        <TerminalIcon size={12} /> Local Console & Build Logs
                        {activeProject.buildStatus !== 'idle' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse ml-1"></span>}
                      </div>
                      {isTerminalOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                    {isTerminalOpen && (
                      <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1 bg-black/40">
                        {activeProject.terminalLogs.length === 0 && (
                          <div className="text-zinc-700 italic">Aguardando processos...</div>
                        )}
                        {activeProject.terminalLogs.map(log => (
                          <div key={log.id} className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
                            <span className="text-zinc-600 w-16">[{log.timestamp}]</span>
                            <span className={`
                              ${log.type === 'command' ? 'text-indigo-400 font-bold' : ''}
                              ${log.type === 'success' ? 'text-emerald-400' : ''}
                              ${log.type === 'warning' ? 'text-amber-400' : ''}
                              ${log.type === 'error' ? 'text-rose-400' : ''}
                              ${log.type === 'info' ? 'text-zinc-300' : ''}
                            `}>
                              {log.type === 'command' && '$ '}{log.text}
                            </span>
                          </div>
                        ))}
                        {isLocalReady && (
                          <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                            <p className="text-indigo-300 font-bold mb-1">Dica Local:</p>
                            <p className="text-zinc-400">Abra a pasta no VS Code e rode <span className="text-indigo-400">npm install</span> para começar.</p>
                          </div>
                        )}
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
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
                  <p className="text-sm font-bold uppercase tracking-widest text-zinc-400">Carregando Workspace...</p>
                </div>
              ) : (
                <div className="text-center space-y-6 max-w-sm">
                  <Package size={64} className="mx-auto opacity-10 text-indigo-400" />
                  <h3 className="text-2xl font-black text-white tracking-tight">Project Explorer</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Selecione um projeto remoto para visualizar o código, rodar um preview ou sincronizar com sua máquina local para desenvolvimento no VS Code.
                  </p>
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
