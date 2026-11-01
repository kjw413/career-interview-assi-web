import { useRef } from 'react';
import type { QuestionCategoryFilter } from '../types';
import { QUESTION_CATEGORIES } from '../lib/questionCategories';
import './question-categories.css';

interface QuestionCategoriesProps {
  value: QuestionCategoryFilter;
  counts: Record<QuestionCategoryFilter, number>;
  onChange: (category: QuestionCategoryFilter) => void;
}

export default function QuestionCategories({ value, counts, onChange }: QuestionCategoriesProps) {
  const tabs = useRef<HTMLDivElement>(null);
  const options = [{ id: 'all' as const, label: '전체 질문', description: '기본질문부터 전공 지식, 이력서 경험까지 함께 준비하세요.' }, ...QUESTION_CATEGORIES];
  const selected = options.find(option => option.id === value)!;
  return <div className="question-categories">
    <div ref={tabs} className="question-category-tabs" role="tablist" aria-label="질문 분야">
      {options.map((option, index) => <button key={option.id} role="tab" type="button" aria-label={option.label}
        aria-selected={value === option.id} tabIndex={value === option.id ? 0 : -1} className={value === option.id ? 'active' : ''}
        onClick={() => onChange(option.id)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % options.length : event.key === 'ArrowLeft' ? (index + options.length - 1) % options.length : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); onChange(options[next].id); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>{option.label}<span aria-hidden="true">{counts[option.id]}</span></button>)}
    </div>
    <p>{selected.description}</p>
  </div>;
}
