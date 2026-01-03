
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
      setProjects(list || []);
    } catch (err: any) {
      setProjectError(err.message || 'Erro ao carregar projetos');
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

  const handleSetupLocal = async () => {
    if (Object.keys(activeProject.files).length === 0) return;
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
      addLog(`3. Para rodar o projeto localmente:`, 'info');
      addLog(`   npm run dev`, 'command');
      
      setIsLocalReady(true);
    } catch (err: any) {
      addLog(`Erro: ${err.message}`, 'error');
    }
  };

  const generatePreviewContent = useCallback(() => {
    const files = activeProject.files;
    if (!files || Object.keys(files).length === 0) return '';

    const indexFile = files['index.html'] || Object.values(files).find(f => f.path.endsWith('index.html'));
    
    // Fallback se não houver index.html
    if (!indexFile) {
      return `<html><body style="background:#09090b;color:white;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
        <div style="text-align:center">
          <h1 style="color:#ef4444">index.html não encontrado</h1>
          <p style="color:#71717a">Certifique-se de que o projeto possui um arquivo index.html na raiz.</p>
        </div>
      </body></html>`;
    }

    let html = indexFile.content;

    const importMap = `
      <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@19.0.0",
          "react-dom": "https://esm.sh/react-dom@19.0.0",
          "react-dom/client": "https://esm.sh/react-dom@19.0.0/client",
          "lucide-react": "https://esm.sh/lucide-react@0.460.0?external=react"
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

    // Injeção robusta no head
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${importMap}${babelSetup}`);
    } else if (html.includes('<html>')) {
      html = html.replace('<html>', `<html><head>${importMap}${babelSetup}</head>`);
    } else {
      html = `${importMap}${babelSetup}${html}`;
    }

    // Tentar encontrar o entry point src/main.tsx ou src/index.tsx
    const mainEntry = files['src/main.tsx'] || files['src/index.tsx'] || files['main.tsx'] || files['index.tsx'];
    
    if (mainEntry) {
      const scriptTag = `
        <script type="text/babel" data-presets="my-preset">
          ${mainEntry.content}
        </script>
      `;
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${scriptTag}</body>`);
      } else {
        html += scriptTag;
      }
    }

    return html;
  }, [activeProject.files]);

  const runProject = async () => {
    if (activeProject.buildStatus !== 'idle') return;
    setIsTerminalOpen(true);
    setActiveProject(prev => ({ ...prev, buildStatus: 'installing', terminalLogs: [] }));
    
    addLog('npm install (virtual)', 'command');
    addLog('Resolvendo dependências no ambiente compartilhado...', 'info');
    await new Promise(r => setTimeout(r, 600));
    addLog('Dependências vinculadas ao runtime principal.', 'success');
    
    addLog('npm run dev', 'command');
    setActiveProject(prev => ({ ...prev, buildStatus: 'running' }));
    addLog('> vite (virtual mode active)', 'info');
    await new Promise(r => setTimeout(r, 800));
    
    setActiveProject(prev => ({ ...prev, viewMode: 'preview' }));
    addLog('➜  Local Preview montado com sucesso.', 'info');
  };

  const stopProject = () => {
    addLog('Processo interrompido.', 'warning');
    setActiveProject(prev => ({ ...prev, buildStatus: 'idle', viewMode: 'code' }));
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSending) return;
    setIsSending(true);
    setLastStatus(null);
    try {
      const result = await sendPrompt(prompt, SESSION_ID);
      if (result.success) {
        setLastStatus({ type: 'success', message: 'Prompt salvo no cluster!' });
        setPrompt('');
      } else {
        setLastStatus({ type: 'error', message: result.error || 'Erro ao salvar' });
      }
    } catch (err) {
      setLastStatus({ type: 'error', message: 'Falha na conexão com Supabase' });
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
      setActiveProject(prev => ({ ...prev, files: files || {}, status: 'ready' }));
    } catch (err) {
      console.error(err);
      setActiveProject(prev => ({ ...prev, status: 'error' }));
    }
  };

  const selectedFile = (selectedFilePath && activeProject.files) ? activeProject.files[selectedFilePath] : null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Sidebar de Projetos */}
      <aside className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <h2 className="font-bold flex items-center gap-2 text-indigo-400">
            <Zap size={20} className="fill-indigo-400/20" /> 
            <span className="tracking-tight text-lg">Workspaces</span>
          </h2>
          <button 
            onClick={loadProjects} 
            className="text-zinc-500 hover:text-white p-1 hover:bg-zinc-800 rounded transition-colors"
            disabled={isLoadingProjects}
            title="Recarregar projetos"
          >
            <RefreshCw size={18} className={isLoadingProjects ? 'animate-spin' : ''} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {projectError && (
            <div className="p-3 bg-red-900/20 border border-red-900/30 rounded-lg text-xs text-red-400 flex items-center gap-2">
              <AlertCircle size={14} /> {projectError}
            </div>
          )}
          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => handleProjectSelect(proj)}
              className={`w-full text-left p-4 rounded-xl transition-all border group ${
                activeProject.id === proj.id 
                  ? 'bg-indigo-600/10 border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.1)]' 
                  : 'bg-zinc-800/30 border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800'
              }`}
            >
              <div className="font-semibold text-zinc-100 truncate flex items-center gap-2">
                <Github size={14} className="text-zinc-500 group-hover:text-indigo-400 transition-colors" /> 
                <span className="text-xs">Project: {proj.id}</span>
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-bold">
                {proj.files[0] || 'archive.zip'}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header / Prompt Input */}
        <section className="bg-zinc-900/30 border-b border-zinc-800 p-6 backdrop-blur-sm">
          <form onSubmit={handleSendPrompt} className="max-w-4xl mx-auto flex gap-4">
            <div className="relative flex-1 group">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Qual será a próxima feature?"
                className="w-full bg-zinc-800/50 border border-zinc-700 text-zinc-100 pl-5 pr-14 py-4 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder-zinc-600"
              />
              <button 
                type="submit" 
                disabled={isSending || !prompt.trim()}
                className="absolute right-3 top-2.5 p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:bg-zinc-700"
              >
                {isSending ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
          </form>
          {lastStatus && (
            <div className={`mt-3 text-center text-[10px] font-black uppercase tracking-widest ${lastStatus.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {lastStatus.message}
            </div>
          )}
        </section>

        {/* Workspace Viewer */}
        <section className="flex-1 flex overflow-hidden">
          {activeProject.status === 'ready' ? (
            <div className="flex flex-1 overflow-hidden">
              <FileExplorer files={activeProject.files} onSelectFile={(p) => { setSelectedFilePath(p); setActiveProject(prev => ({...prev, viewMode: 'code'})); }} />
              
              <div className="flex-1 flex flex-col bg-zinc-950 relative overflow-hidden">
                {/* View Mode Switcher & Actions */}
                <div className="bg-zinc-900 border-b border-zinc-800 p-2 flex items-center justify-between px-4 z-10 shadow-md">
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                    <button 
                      onClick={() => setActiveProject(prev => ({...prev, viewMode: 'code'}))}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeProject.viewMode === 'code' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <Code size={12} /> Editor
                    </button>
                    <button 
                      onClick={() => setActiveProject(prev => ({...prev, viewMode: 'preview'}))}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${activeProject.viewMode === 'preview' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <Monitor size={12} /> Preview
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={handleSetupLocal}
                      className="text-[10px] font-bold uppercase bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white px-4 py-1.5 rounded-lg border border-indigo-600/20 flex items-center gap-2 transition-all"
                    >
                      <HardDrive size={12} /> Sincronizar Local
                    </button>

                    {activeProject.buildStatus === 'idle' ? (
                      <button onClick={runProject} className="text-[10px] font-bold uppercase bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600 hover:text-white px-4 py-1.5 rounded-lg border border-emerald-600/20 flex items-center gap-2 transition-all">
                        <Play size={12} fill="currentColor" /> Rodar Preview
                      </button>
                    ) : (
                      <button onClick={stopProject} className="text-[10px] font-bold uppercase bg-rose-600/10 text-rose-400 hover:bg-rose-600 hover:text-white px-4 py-1.5 rounded-lg border border-rose-600/20 flex items-center gap-2 transition-all">
                        <Square size={12} fill="currentColor" /> Parar
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden relative">
                  {activeProject.viewMode === 'code' ? (
                    <div className="flex-1 overflow-auto p-8 font-mono text-sm text-zinc-300 bg-zinc-950 selection:bg-indigo-500/30 custom-scrollbar">
                      {selectedFile ? (
                        <div className="animate-in fade-in duration-300">
                          <pre className="whitespace-pre-wrap leading-relaxed">{selectedFile.content}</pre>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4 opacity-50">
                          <FolderOpen size={48} />
                          <p className="text-xs uppercase tracking-[0.2em] font-bold">Workspace Ready</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 bg-white relative">
                      <iframe 
                        key={activeProject.id}
                        ref={iframeRef}
                        title="Project Preview"
                        className="w-full h-full border-none"
                        srcDoc={generatePreviewContent()}
                        sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
                      />
                      <div className="absolute bottom-6 right-6 flex gap-2">
                        <button 
                          onClick={() => { if(iframeRef.current) iframeRef.current.srcdoc = generatePreviewContent(); }}
                          className="bg-indigo-600 p-3 rounded-2xl text-white hover:bg-indigo-500 transition-all shadow-2xl hover:scale-110 active:scale-95"
                          title="Reiniciar Frame"
                        >
                          <RotateCcw size={20} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Terminal Expandível */}
                  <div className={`transition-all duration-300 border-t border-zinc-800 bg-zinc-900 flex flex-col ${isTerminalOpen ? 'h-64' : 'h-10'}`}>
                    <div className="flex items-center justify-between px-4 py-2 cursor-pointer border-b border-zinc-800/50 hover:bg-zinc-800/50" onClick={() => setIsTerminalOpen(!isTerminalOpen)}>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        <TerminalIcon size={12} /> Debug Output
                        {activeProject.buildStatus !== 'idle' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse ml-1"></span>}
                      </div>
                      <div className="text-zinc-600">
                        {isTerminalOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                      </div>
                    </div>
                    {isTerminalOpen && (
                      <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1 bg-black/60 custom-scrollbar">
                        {activeProject.terminalLogs.length === 0 && (
                          <div className="text-zinc-700 italic">Logs limpos. Aguardando atividade...</div>
                        )}
                        {activeProject.terminalLogs.map(log => (
                          <div key={log.id} className="flex gap-3 animate-in slide-in-from-left-2 duration-200">
                            <span className="text-zinc-600 w-16 shrink-0">[{log.timestamp}]</span>
                            <span className={`
                              ${log.type === 'command' ? 'text-indigo-400 font-bold' : ''}
                              ${log.type === 'success' ? 'text-emerald-400' : ''}
                              ${log.type === 'warning' ? 'text-amber-400' : ''}
                              ${log.type === 'error' ? 'text-rose-400' : ''}
                              ${log.type === 'info' ? 'text-zinc-400' : ''}
                            `}>
                              {log.type === 'command' && <span className="mr-2 opacity-50">$</span>}
                              {log.text}
                            </span>
                          </div>
                        ))}
                        {isLocalReady && (
                          <div className="mt-4 p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                            <p className="text-indigo-300 font-black uppercase text-[9px] mb-2 tracking-widest">Deploy Local Assistido</p>
                            <p className="text-zinc-400 mb-1 italic">Vá até o VS Code na pasta escolhida e execute:</p>
                            <code className="text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded select-all font-bold">npm install && npm run dev</code>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 bg-zinc-950 relative overflow-hidden">
              {/* Efeito de background decorativo */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/5 blur-[120px] rounded-full"></div>
              </div>

              {activeProject.status === 'loading' ? (
                <div className="flex flex-col items-center space-y-6 relative z-10">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin"></div>
                    <Package className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400/50" size={20} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black uppercase tracking-[0.3em] text-zinc-200">Unpacking Workspace</p>
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2">Extraindo arquivos do ZIP remoto...</p>
                  </div>
                </div>
              ) : activeProject.status === 'error' ? (
                <div className="text-center space-y-6 relative z-10 px-8">
                  <div className="bg-rose-500/10 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto border border-rose-500/20">
                    <AlertCircle size={40} className="text-rose-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">Erro de Carregamento</h3>
                    <p className="text-sm text-zinc-500 max-w-xs mx-auto">Não foi possível processar o projeto. Verifique se o arquivo ZIP é válido ou se o túnel Ngrok está online.</p>
                  </div>
                  <button onClick={loadProjects} className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold uppercase transition-all">Tentar Novamente</button>
                </div>
              ) : (
                <div className="text-center space-y-8 max-w-md px-10 relative z-10">
                  <div className="relative group mx-auto w-32 h-32">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl group-hover:bg-indigo-500/40 transition-all"></div>
                    <div className="bg-zinc-900 w-32 h-32 rounded-[2.5rem] border border-zinc-800 flex items-center justify-center shadow-2xl relative rotate-3 group-hover:rotate-0 transition-transform duration-500">
                      <Package size={64} className="text-indigo-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-4xl font-black text-white tracking-tighter mb-4">Select Project</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed font-medium">
                      Conecte-se aos seus repositórios sincronizados. Visualize o código, teste no preview nativo ou sincronize diretamente para sua máquina local.
                    </p>
                  </div>
                  <div className="pt-4">
                    <div className="inline-flex items-center gap-2 text-[10px] font-bold text-zinc-600 uppercase tracking-[0.4em] bg-zinc-900/50 px-4 py-2 rounded-full border border-zinc-800">
                      Environment Online <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    </div>
                  </div>
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
