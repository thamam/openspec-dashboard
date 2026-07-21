import React from 'react';
import { TaskItem } from '../../types';

interface Props {
  tasks: TaskItem[];
}

export const TaskHub: React.FC<Props> = ({ tasks }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        Task Hub
        <span className="badge" id="task-count">{tasks.length} Total</span>
      </div>
      <div className="task-list">
        {tasks.map(task => (
          <div key={task.id} className={`task-card ${task.status === 'wip' ? 'active' : ''}`} id={task.id}>
            <div className="task-header">
              <span>Line {task.lineNumber}</span>
              {task.assignee ? (
                <span className="task-assignee">@{task.assignee} ({task.status})</span>
              ) : (
                <span style={{ color: 'var(--warning)' }}>{task.status}</span>
              )}
            </div>
            <div className="task-title" style={{ textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
              {task.title}
            </div>
            {task.status !== 'done' && !task.assignee && (
              <>
                <button className="task-action" style={{ marginBottom: '5px' }}>Claim Task (Agent)</button>
                <button className="task-action">Claim Task (Human)</button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
