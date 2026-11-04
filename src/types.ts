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

/** Saved answer styles replace all supported marks; omitted colors mean defaults. */
export interface AnswerStylePreset {
  id: string;
  name: string;
  bold: boolean;
  color?: string;
  backgroundColor?: string;
}

/** Keep basic as the stored ID for required questions so existing content stays in place. */
export type QuestionCategory = 'basic' | 'situational' | 'fundamentals' | 'resume';
export type QuestionCategoryFilter = 'all' | QuestionCategory;

export interface InterviewNode {
  id: string;
  parentId: string | null;
  /** The exact resume/parent-answer excerpt that prompted this question. */
  anchor: string;
  question: string;
  answer: string;
  /** Omitted by legacy data; the root question's category applies to its whole flow. */
  category?: QuestionCategory;
  /** Legacy backup compatibility; questions are displayed and edited as plain text. */
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
  answerStylePresets?: AnswerStylePreset[];
  isDemo?: boolean;
}
