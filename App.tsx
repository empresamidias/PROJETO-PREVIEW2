
import React, { useState, useEffect, useCallback } from 'react';
import { sendPrompt } from './services/supabaseService';
import { fetchProjectsList, downloadAndUnzip, validateProject } from './services/projectService';
import { ProjectData, ProjectState, VirtualFile } from './types';
import { FileExplorer } from './components/FileExplorer';
import { 
  Send, 
  Package, 
  RefreshCw, 
  AlertCircle, 
  Terminal, 
  Layout, 
  Code,
  ExternalLink,
  Github,
  Zap
} from 'lucide-react';

// Fixed session ID provided by the user
const SESSION_ID = "7293dd5e-4757-4ebc-a721-a78982ccd0c6";

const App: React.FC = () => {
  // State for Prompt
  const [prompt, setPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastStatus, setLastStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // State for Projects
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectState>({
    id: '',
    files: {},
    status: 'idle'
  });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

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

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleSendPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSending) return;

    setIsSending(true);
    setLastStatus(null);
    const result = await sendPrompt(prompt, SESSION_ID);
    
    if (result.success) {
      setLastStatus({ type: 'success', message: 'Prompt saved to Supabase!' });
      setPrompt('');
    } else {
      setLastStatus({ type: 'error', message: result.error || 'Failed to save prompt' });
    }
    setIsSending(false);
  };

  const handleProjectSelect = async (project: ProjectData) => {
    const fileName = project.files[0] || 'project.zip';
    
    setActiveProject({ id: project.id, files: {}, status: 'loading' });
    setSelectedFilePath(null);

    try {
      const files = await downloadAndUnzip(project.id, fileName);
      setActiveProject({ id: project.id, files, status: 'ready' });
    } catch (err) {
      setActiveProject({ id: project.id, files: {}, status: 'error' });
    }
  };

  const selectedFile = selectedFilePath ? activeProject.files[selectedFilePath] : null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Sidebar: Projects List */}
      <aside className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col shadow-2xl">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2 text-indigo-400">
            <Zap size={20} className="fill-indigo-400/20" /> 
            <span className="tracking-tight text-lg">Remote Projects</span>
          </h2>
          <button 
            onClick={loadProjects} 
            className="text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
            disabled={isLoadingProjects}
            title="Refresh list"
          >
            <RefreshCw size={18} className={isLoadingProjects ? 'animate-spin' : ''} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {projectError && (
            <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{projectError}</span>
            </div>
          )}

          {projects.length === 0 && !isLoadingProjects && !projectError && (
            <div className="text-center py-12 text-zinc-600">
              <AlertCircle className="mx-auto mb-3 opacity-20" size={48} />
              <p className="text-sm font-medium">No projects found</p>
            </div>
          )}
          
          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => handleProjectSelect(proj)}
              className={`w-full text-left p-4 rounded-xl transition-all border group ${
                activeProject.id === proj.id 
                  ? 'bg-indigo-600/10 border-indigo-500 ring-1 ring-indigo-500/50' 
                  : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800'
              }`}
            >
              <div className="font-semibold text-zinc-100 truncate flex items-center gap-2">
                <Github size={14} className="text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                ID: {proj.id}
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 uppercase tracking-widest font-bold flex items-center gap-1.5">
                <Terminal size={10} /> {proj.files[0] || 'Unknown ZIP'}
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-zinc-950">
        {/* Top Section: Prompt Input */}
        <section className="bg-zinc-900/50 border-b border-zinc-800 p-6 backdrop-blur-md sticky top-0 z-20">
          <form onSubmit={handleSendPrompt} className="max-w-4xl mx-auto flex gap-4">
            <div className="relative flex-1 group">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Push prompt to Supabase cluster..."
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 pl-5 pr-14 py-4 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-inner placeholder-zinc-500"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={isSending || !prompt.trim()}
                className={`absolute right-3 top-2.5 p-2.5 rounded-xl transition-all ${
                  prompt.trim() && !isSending 
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20' 
                    : 'text-zinc-600'
                }`}
              >
                {isSending ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} />}
              </button>
            </div>
          </form>
          {lastStatus && (
            <div className={`mt-3 text-center text-[10px] font-black uppercase tracking-[0.2em] ${lastStatus.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {lastStatus.message}
            </div>
          )}
        </section>

        {/* Bottom Section: Project Viewer */}
        <section className="flex-1 flex overflow-hidden">
          {activeProject.status === 'ready' ? (
            <div className="flex flex-1 overflow-hidden">
              <FileExplorer 
                files={activeProject.files} 
                onSelectFile={setSelectedFilePath} 
              />
              
              <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
                <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex items-center justify-between text-zinc-400 px-6">
                  <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider">
                    <Layout size={14} className="text-indigo-400" />
                    <span>Live Explorer</span>
                    {selectedFilePath && (
                      <span className="text-zinc-600 flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                        <Code size={12} className="text-zinc-500" /> {selectedFilePath}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button className="text-[10px] font-bold uppercase tracking-widest bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 px-4 py-1.5 rounded-lg border border-zinc-700 transition-all flex items-center gap-2">
                      <ExternalLink size={12} /> Preview Mode
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  {selectedFile ? (
                    <div className="h-full w-full overflow-auto font-mono text-sm p-8 text-zinc-300 bg-zinc-950 selection:bg-indigo-500/30">
                      <pre className="whitespace-pre-wrap leading-relaxed">{selectedFile.content}</pre>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500 blur-3xl opacity-5 animate-pulse"></div>
                        <Terminal size={80} className="relative opacity-20 text-indigo-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-zinc-400">Select a file to inspect</p>
                        <p className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-40 mt-2">Environment: Development</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 bg-zinc-950">
              {activeProject.status === 'loading' ? (
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 border-2 border-zinc-800 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
                  <p className="font-bold text-zinc-200 tracking-tight">Unpacking Archive...</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] mt-3 opacity-30">Indexing Project Structure</p>
                </div>
              ) : activeProject.status === 'error' ? (
                <div className="text-center p-8 bg-rose-950/10 border border-rose-900/20 rounded-3xl">
                  <AlertCircle size={56} className="text-rose-500/50 mx-auto mb-5" />
                  <p className="text-rose-400 font-black uppercase tracking-widest text-sm">Load Failure</p>
                  <p className="text-sm mt-2 text-zinc-500">The remote ZIP archive could not be parsed.</p>
                  <button onClick={() => loadProjects()} className="mt-8 px-6 py-2.5 bg-rose-500/10 text-rose-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-rose-500/20 transition-all border border-rose-500/20">Restart Fetch</button>
                </div>
              ) : (
                <div className="text-center max-w-sm px-8">
                  <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                    <div className="bg-zinc-900 w-32 h-32 rounded-[2.5rem] border border-zinc-800 flex items-center justify-center mx-auto mb-10 rotate-3 shadow-2xl relative">
                      <Package size={56} className="text-indigo-400 drop-shadow-lg" />
                    </div>
                  </div>
                  <h3 className="text-3xl font-black text-white mb-4 tracking-tighter">Project Hub</h3>
                  <p className="text-zinc-500 text-sm mb-10 leading-relaxed font-medium">
                    Connect to remote repositories and inspect Vite + React builds in our high-performance virtual filesystem.
                  </p>
                  <div className="h-1 w-16 bg-gradient-to-r from-transparent via-indigo-500 to-transparent mx-auto rounded-full opacity-50"></div>
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
