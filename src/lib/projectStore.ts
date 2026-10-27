import type { Project, ResumeData } from '../types';
import * as local from './storage';

export interface ProjectStore {
  kind: 'local' | 'cloud';
  ownerId?: string;
  listProjects(): Promise<Project[]>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  putResumeFile(projectId: string, file: Blob, resume?: ResumeData): Promise<void>;
  getResumeFile(projectId: string): Promise<Blob | undefined>;
}

export const localStore: ProjectStore = { kind: 'local', ...local };
