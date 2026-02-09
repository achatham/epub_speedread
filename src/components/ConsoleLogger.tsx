import React, { useState, useEffect } from 'react';

interface LogEntry {
  id: number;
  type: 'log' | 'error' | 'warn';
  message: string;
  timestamp: string;
}

export const ConsoleLogger: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    // Load persisted logs
    try {
      const saved = localStorage.getItem('debug_logs');
      if (saved) {
        setLogs(JSON.parse(saved));
      }
    } catch (e) {}

    const addLog = (type: LogEntry['type'], ...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? (arg instanceof Error ? `${arg.name}: ${arg.message}\n${arg.stack}` : JSON.stringify(arg, null, 2)) : String(arg)
      ).join(' ');
      
      const newEntry: LogEntry = {
        id: Date.now() + Math.random(),
        type,
        message,
        timestamp: new Date().toLocaleTimeString()
      };

      setLogs(prev => {
        const updated = [newEntry, ...prev].slice(0, 50);
        try {
          localStorage.setItem('debug_logs', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    };

    console.log = (...args) => {
      addLog('log', ...args);
      originalLog.apply(console, args);
    };

    console.error = (...args) => {
      addLog('error', ...args);
      originalError.apply(console, args);
    };

    console.warn = (...args) => {
      addLog('warn', ...args);
      originalWarn.apply(console, args);
    };

    const handleError = (event: ErrorEvent) => {
      addLog('error', 'Uncaught Error:', event.message, 'at', event.filename, ':', event.lineno);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      addLog('error', 'Unhandled Rejection:', event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] bg-black/50 text-white p-2 rounded-full text-[10px] opacity-20 hover:opacity-100 transition-opacity"
      >
        Logs
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-white dark:bg-zinc-900 flex flex-col p-4 font-mono text-xs overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">Debug Logs</h3>
        <div className="flex gap-2">
          <button onClick={() => setLogs([])} className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded">Clear</button>
          <button onClick={() => setIsOpen(false)} className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded">Close</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 border border-zinc-200 dark:border-zinc-800 p-2 rounded">
        <div className="mb-2 text-blue-500">Origin: {window.location.origin}</div>
        {logs.map(log => (
          <div key={log.id} className={`${
            log.type === 'error' ? 'text-red-500' : 
            log.type === 'warn' ? 'text-yellow-500' : 
            'text-zinc-700 dark:text-zinc-300'
          }`}>
            <span className="opacity-50 mr-2">[{log.timestamp}]</span>
            <pre className="whitespace-pre-wrap break-all">{log.message}</pre>
          </div>
        ))}
      </div>
    </div>
  );
};
