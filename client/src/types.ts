export interface ChangeItem {
  id: string;
  title: string;
  status: string;
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
}
