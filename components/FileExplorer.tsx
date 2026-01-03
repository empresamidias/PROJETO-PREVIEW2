
import React, { useState } from 'react';
import { VirtualFile } from '../types';
import { Folder, FileText, ChevronRight, ChevronDown } from 'lucide-react';

interface FileExplorerProps {
  files: Record<string, VirtualFile>;
  onSelectFile: (path: string) => void;
}

interface TreeNode {
  [key: string]: TreeNode | { __file: VirtualFile };
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ files, onSelectFile }) => {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const buildTree = (): TreeNode => {
    const tree: TreeNode = {};
    Object.keys(files).forEach(path => {
      const parts = path.split('/');
      let current: any = tree;
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = index === parts.length - 1 ? { __file: files[path] } : {};
        }
        current = current[part];
      });
    });
    return tree;
  };

  const renderTree = (node: TreeNode, path: string = '', depth: number = 0) => {
    return Object.entries(node).map(([key, value]) => {
      if (key === '__file') return null;
      
      const fullPath = path ? `${path}/${key}` : key;
      const fileContainer = value as { __file?: VirtualFile };
      const isFile = fileContainer.__file !== undefined;

      if (isFile) {
        return (
          <div 
            key={fullPath}
            onClick={() => onSelectFile(fullPath)}
            className="flex items-center gap-2.5 py-1.5 px-3 hover:bg-indigo-500/10 hover:text-indigo-300 cursor-pointer rounded-lg text-xs text-zinc-400 transition-all active:scale-95"
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            <FileText size={14} className="text-zinc-600 shrink-0" />
            <span className="truncate">{key}</span>
          </div>
        );
      }

      const isExpanded = expandedFolders[fullPath];
      return (
        <div key={fullPath}>
          <div 
            onClick={() => toggleFolder(fullPath)}
            className="flex items-center gap-2 py-1.5 px-3 hover:bg-zinc-800/50 cursor-pointer rounded-lg text-xs font-bold text-zinc-300 transition-all"
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            {isExpanded ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
            <Folder size={14} className={`shrink-0 ${isExpanded ? 'text-indigo-400' : 'text-zinc-600'}`} />
            <span className="truncate tracking-tight uppercase opacity-80">{key}</span>
          </div>
          {isExpanded && renderTree(value as TreeNode, fullPath, depth + 1)}
        </div>
      );
    });
  };

  const tree = buildTree();

  return (
    <div className="h-full overflow-y-auto border-r border-zinc-800 bg-zinc-900/30 p-4 w-72 scrollbar-thin scrollbar-thumb-zinc-800">
      <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4 px-3">
        Project Structure
      </h3>
      <div className="space-y-0.5">
        {renderTree(tree)}
      </div>
    </div>
  );
};
