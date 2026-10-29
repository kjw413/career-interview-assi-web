export interface ResumeData {
  name: string;
  text: string;
  pages: number;
  usedOcr: boolean;
}

/** Inline styles use UTF-16 offsets into the matching plain question or answer. */
export interface TextFormatting {
  start: number;
  end: number;
  bold?: true;
  color?: string;
  backgroundColor?: string;
}

export interface InterviewNode {
  id: string;
  parentId: string | null;
  /** The exact resume/parent-answer excerpt that prompted this question. */
  anchor: string;
  question: string;
  answer: string;
  questionFormatting?: TextFormatting[];
  answerFormatting?: TextFormatting[];
  status: 'draft' | 'ready';
  position?: { x: number; y: number };
}

export interface Project {
  id: string;
  company: string;
  role: string;
  companyColor: string;
  createdAt: number;
  updatedAt: number;
  resume: ResumeData | null;
  nodes: InterviewNode[];
  isDemo?: boolean;
}
