import { describe, expect, it } from 'vitest';
import type { AnswerStylePreset } from '../types';
import { MAX_ANSWER_STYLE_NAME, MAX_ANSWER_STYLE_PRESETS, validateAnswerStylePresets } from './answerStylePresets';

const preset = (): AnswerStylePreset => ({ id: 'keyword', name: '핵심 키워드', bold: true, color: '#b42318', backgroundColor: '#fff1a8' });

describe('saved answer styles', () => {
  it('keeps complete styles, including defaults, while normalizing names and colors without mutating input', () => {
    const source: AnswerStylePreset[] = [{ ...preset(), name: '  핵심 키워드  ', color: '#B42318', backgroundColor: '#FFF1A8' }, { id: 'normal', name: '기본', bold: false }];
    const validated = validateAnswerStylePresets(source);
    expect(validated).toEqual([preset(), { id: 'normal', name: '기본', bold: false }]);
    expect(source[0].name).toBe('  핵심 키워드  ');
    expect(source[0].color).toBe('#B42318');
    expect(validated[0]).not.toBe(source[0]);
    expect(validateAnswerStylePresets([])).toEqual([]);
    expect(validateAnswerStylePresets(Array.from({ length: MAX_ANSWER_STYLE_PRESETS }, (_, index) => ({ ...preset(), id: String(index), name: `서식 ${index}` })))).toHaveLength(MAX_ANSWER_STYLE_PRESETS);
  });

  it('rejects duplicate identities and names after trimming', () => {
    expect(() => validateAnswerStylePresets([preset(), { ...preset(), name: '다른 이름' }])).toThrow('ID가 중복');
    expect(() => validateAnswerStylePresets([preset(), { ...preset(), id: 'other', name: ' 핵심 키워드 ' }])).toThrow('이름이 중복');
  });

  it('rejects malformed styles, unsafe CSS values, unknown fields and excessive limits', () => {
    const invalid = [
      null, {}, [null], [[]], [{ ...preset(), id: '' }], [{ ...preset(), id: ' '.repeat(2) }],
      [{ ...preset(), id: 'x'.repeat(161) }], [{ ...preset(), name: ' ' }],
      [{ ...preset(), name: '한'.repeat(MAX_ANSWER_STYLE_NAME + 1) }],
      [{ ...preset(), bold: 'true' }], [{ id: 'missing-bold', name: '서식' }],
      [{ ...preset(), color: 'red' }], [{ ...preset(), backgroundColor: 'url(evil)' }],
      [{ ...preset(), color: '#fff' }], [{ ...preset(), color: null }],
      [{ ...preset(), href: 'javascript:evil' }], [{ ...preset(), html: '<script>evil</script>' }],
      Array.from({ length: MAX_ANSWER_STYLE_PRESETS + 1 }, (_, index) => ({ ...preset(), id: String(index), name: String(index) })),
    ];
    for (const value of invalid) expect(() => validateAnswerStylePresets(value)).toThrow('저장한 답변 서식');
  });
});
