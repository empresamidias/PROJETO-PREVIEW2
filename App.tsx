
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { sendPrompt } from './services/supabaseService';
import { fetchProjectsList, downloadAndUnzip } from './services/projectService';
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
  RotateCcw
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

  // Logic to construct the Preview HTML
  const generatePreviewContent = useCallback(() => {
    const files = activeProject.files;
    const indexFile = files['index.html'] || Object.values(files).find(f => f.path.endsWith('index.html'));
    
    if (!indexFile) return '<html><body><h1>Index.html not found</h1></body></html>';

    let html = indexFile.content;

    // Inject Import Map to resolve react and other dependencies
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

    // Support TSX/JSX by using Babel Standalone inside the iframe
    const babelSetup = `
      <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
      <script>
        // Babel needs to know about JSX
        Babel.registerPreset('my-preset', {
          presets: [
            [Babel.availablePresets['env'], { modules: false }],
            [Babel.availablePresets['react'], { runtime: 'automatic' }]
          ]
        });
      </script>
    `;

    // Add necessary head scripts
    html = html.replace('<head>', `<head>${importMap}${babelSetup}`);

    // Resolve internal scripts
    // This is a simplification: in a real environment, we'd bundle or use a Service Worker
    // For this simulation, we'll try to find the main entry point
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
    
    addLog('npm install', 'command');
    addLog('Fetching dependencies from existing environment...', 'info');
    await new Promise(r => setTimeout(r, 600));
    addLog('Dependencies linked to host Vite process', 'success');
    
    addLog('npm run dev', 'command');
    setActiveProject(prev => ({ ...prev, buildStatus: 'running' }));
    
    addLog('> vite (internal dev mode)', 'info');
    await new Promise(r => setTimeout(r, 800));
    addLog('VITE v6.0.5  ready. Application mounting...', 'success');
    
    // Switch to preview mode
    setActiveProject(prev => ({ ...prev, viewMode: 'preview' }));
    addLog('➜  Preview active in internal browser frame', 'info');
  };

  const stopProject = () => {
    addLog('^C', 'command');
    addLog('Dev server stopped.', 'warning');
    setActiveProject(prev => ({ ...prev, buildStatus: 'idle', viewMode: 'code' }));
  };

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSending) return;
    setIsSending(true);
    setLastStatus(null);
    const result = await sendPrompt(prompt, SESSION_ID);
    if (result.success) {
      setLastStatus({ type: 'success', message: 'Prompt saved!' });
      setPrompt('');
    } else {
      setLastStatus({ type: 'error', message: result.error || 'Error' });
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
                placeholder="Push prompt to Supabase..."
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
                    {activeProject.buildStatus === 'idle' ? (
                      <button onClick={runProject} className="text-[10px] font-bold uppercase bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600 hover:text-white px-4 py-1.5 rounded-lg border border-emerald-600/20 flex items-center gap-2">
                        <Play size={12} fill="currentColor" /> Run Project
                      </button>
                    ) : (
                      <button onClick={stopProject} className="text-[10px] font-bold uppercase bg-rose-600/10 text-rose-400 hover:bg-rose-600 hover:text-white px-4 py-1.5 rounded-lg border border-rose-600/20 flex items-center gap-2">
                        <Square size={12} fill="currentColor" /> Stop
                      </button>
                    )}
                    <button className="text-[10px] font-bold uppercase bg-zinc-800 text-zinc-300 px-4 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-2">
                      <Download size={12} /> VS Code
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex flex-col overflow-hidden relative">
                  {activeProject.viewMode === 'code' ? (
                    <div className="flex-1 overflow-auto p-8 font-mono text-sm text-zinc-300">
                      {selectedFile ? <pre>{selectedFile.content}</pre> : <div className="h-full flex items-center justify-center opacity-20">Select a file to inspect</div>}
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
                  <div className={`transition-all duration-300 border-t border-zinc-800 bg-zinc-900 flex flex-col ${isTerminalOpen ? 'h-48' : 'h-10'}`}>
                    <div className="flex items-center justify-between px-4 py-2 cursor-pointer border-b border-zinc-800/50" onClick={() => setIsTerminalOpen(!isTerminalOpen)}>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        <TerminalIcon size={12} /> Build Status
                        {activeProject.buildStatus !== 'idle' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse ml-1"></span>}
                      </div>
                      {isTerminalOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                    {isTerminalOpen && (
                      <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1 bg-black/40">
                        {activeProject.terminalLogs.map(log => (
                          <div key={log.id} className="flex gap-2">
                            <span className="text-zinc-600">[{log.timestamp}]</span>
                            <span className={log.type === 'command' ? 'text-indigo-400' : log.type === 'success' ? 'text-emerald-400' : 'text-zinc-300'}>
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
            <div className="flex-1 flex items-center justify-center text-zinc-500">
              {activeProject.status === 'loading' ? <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div> : "Select a project to start"}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
