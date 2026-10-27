import type { Project } from '../types';

export const DEMO_PROJECT_ID = 'folio-demo-toss';

/** Fictional sample content. Never confused with an uploaded user document. */
export function createDemoProject(): Project {
  const now = Date.now();
  return {
    id: DEMO_PROJECT_ID,
    company: '토스',
    role: '프론트엔드 개발자',
    companyColor: '#376bea',
    createdAt: now,
    updatedAt: now,
    isDemo: true,
    resume: {
      name: '김지원_이력서_샘플.pdf',
      pages: 2,
      usedOcr: false,
      text: `김지원\n프론트엔드 개발자\n\n사용자의 문제를 발견하고, 더 나은 경험을 만드는 개발자입니다.\n\n경력\n2022.03 — 현재  ·  주식회사 넥스트\n프론트엔드 개발자\n\nReact와 TypeScript를 활용한 B2B 서비스 개발\n사용자 행동 데이터를 바탕으로 온보딩 개선\n디자인 시스템 구축 및 공통 컴포넌트 개발\n\n주요 프로젝트\n온보딩 경험 개선\n복잡한 가입 절차를 5단계에서 3단계로 간소화하고, 사용자 인터뷰와 A/B 테스트를 통해 가입 완료율을 24% 개선했습니다.\n\n디자인 시스템 구축\n20개 이상의 공통 컴포넌트를 설계하고, 기획·디자인·개발 팀 간의 협업 방식을 정리했습니다.\n\n기술 역량\nReact · TypeScript · Next.js · React Query\n테스트 자동화 · 웹 접근성 · 성능 최적화\n\n학력\n2018.03 — 2022.02  ·  한국대학교 컴퓨터공학과\n\n특기사항\n바이브 코딩\n반복 업무를 자동화하는 작은 도구를 만들고, 새로운 기술을 실제 문제에 적용하는 것을 즐깁니다.`,
    },
    nodes: [
      {
        id: 'demo-q1', parentId: null, anchor: '온보딩 경험 개선',
        question: '온보딩에서 어떤 문제를 발견했고, 어떻게 개선했나요?',
        answer: '사용자 인터뷰와 행동 데이터를 함께 살펴 가입 단계의 이탈 원인을 찾았습니다. 불필요한 입력을 줄이고 가입 절차를 3단계로 개선했습니다.',
        interviewer: '실무진', status: 'ready',
      },
      {
        id: 'demo-q2', parentId: 'demo-q1', anchor: '사용자 인터뷰',
        question: '사용자 인터뷰는 어떤 방식으로 진행했나요?',
        answer: '최근 가입을 중단한 사용자 8명을 인터뷰했습니다. 특정 기능에 대한 선호보다 실제로 겪은 상황과 행동을 질문해 문제를 확인했습니다.',
        interviewer: '실무진', status: 'ready',
      },
      {
        id: 'demo-q3', parentId: 'demo-q1', anchor: '행동 데이터',
        question: '어떤 지표로 개선 효과를 검증했나요?',
        answer: '가입 완료율을 핵심 지표로 정했습니다. A/B 테스트에서 완료율이 24% 개선됐고, 가입 후 첫 핵심 기능 사용률도 함께 확인했습니다.',
        interviewer: '부서장', status: 'ready',
      },
      {
        id: 'demo-q4', parentId: 'demo-q3', anchor: 'A/B 테스트',
        question: '테스트 결과에 영향을 줄 수 있는 변수는 어떻게 통제했나요?',
        answer: '', interviewer: '실무진', status: 'draft',
      },
      {
        id: 'demo-q5', parentId: null, anchor: '디자인 시스템 구축',
        question: '디자인 시스템을 구축하며 팀과 어떻게 협업했나요?',
        answer: '각 팀의 반복되는 작업을 조사하고 공통 컴포넌트의 우선순위를 함께 정했습니다. 격주 리뷰에서 사용성을 점검하며 적용 범위를 넓혔습니다.',
        interviewer: '부서장', status: 'ready',
      },
      {
        id: 'demo-q6', parentId: null, anchor: '바이브 코딩',
        question: '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.',
        answer: '', interviewer: '실무진', status: 'draft',
      },
    ],
  };
}
