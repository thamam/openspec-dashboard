import React from 'react';

interface Props {
  lines: string[];
}

export const TerminalPane: React.FC<Props> = ({ lines }) => {
  return (
    <div className="terminal-pane" id="terminal-pane">
      {lines.map((line, i) => {
        const isTmux = line.trim().startsWith('tmux attach -t ');
        if (isTmux) {
          const cmd = line.trim();
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0', padding: '10px', backgroundColor: '#161b22', borderRadius: '6px', border: '1px solid #30363d' }}>
              <code style={{ color: '#58a6ff' }}>{cmd}</code>
              <button onClick={() => navigator.clipboard.writeText(cmd)} className="lifecycle-btn" style={{ margin: 0, width: 'auto', padding: '6px 12px' }}>Copy</button>
              <button onClick={() => fetch('http://localhost:3011/api/open-terminal', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({command: cmd})})} className="lifecycle-btn primary" style={{ margin: 0, width: 'auto', padding: '6px 12px' }}>Open in Terminal</button>
            </div>
          );
        }
        return (
          <div key={i} className={line.startsWith('ERROR') ? 'term-error' : (line.startsWith('✓') ? 'term-success' : '')}>
            {line}
          </div>
        );
      })}
    </div>
  );
};
