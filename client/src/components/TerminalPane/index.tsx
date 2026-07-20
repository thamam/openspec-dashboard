import React from 'react';

interface Props {
  lines: string[];
}

export const TerminalPane: React.FC<Props> = ({ lines }) => {
  return (
    <div className="terminal-pane" id="terminal-pane">
      {lines.map((line, i) => (
        <div key={i} className={line.startsWith('ERROR') ? 'term-error' : (line.startsWith('✓') ? 'term-success' : '')}>
          {line}
        </div>
      ))}
    </div>
  );
};
