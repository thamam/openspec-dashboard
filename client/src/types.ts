export interface ChangeItem {
  id: string;
  title: string;
  status: string;
  framework?: 'openspec' | 'bmad';
  category?: 'planning' | 'epic' | 'story' | 'openspec';
  epicNumber?: number;
}

export interface TaskItem {
  id: string;
  title: string;
  status: 'todo' | 'wip' | 'done';
  assignee?: string;
  lineNumber: number;
}

export interface Linkage {
  source: string;
  target: string;
}

export interface Artifacts {
  proposal: string;
  spec: string;
  design: string;
  tasks: string;
  linkages?: Linkage[];
  framework?: 'openspec' | 'bmad';
}
