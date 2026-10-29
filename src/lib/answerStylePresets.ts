import type { AnswerStylePreset } from '../types';

export const MAX_ANSWER_STYLE_PRESETS = 8;
export const MAX_ANSWER_STYLE_NAME = 24;
const COLOR = /^#[\da-f]{6}$/i;

function invalid(detail = '정보가 올바르지 않습니다.'): never {
  throw new Error(`저장한 답변 서식의 ${detail}`);
}

/** Validate saved styles from backups and return independent, normalized records. */
export function validateAnswerStylePresets(value: unknown): AnswerStylePreset[] {
  if (!Array.isArray(value) || value.length > MAX_ANSWER_STYLE_PRESETS) {
    invalid(`개수는 최대 ${MAX_ANSWER_STYLE_PRESETS}개여야 합니다.`);
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  return value.map((item): AnswerStylePreset => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) invalid();
    const source = item as Record<string, unknown>;
    if (Object.keys(source).some(key => !['id', 'name', 'bold', 'color', 'backgroundColor'].includes(key))) invalid();
    const { id, name, bold, color, backgroundColor } = source;
    if (typeof id !== 'string' || !id.trim() || id.length > 160) invalid('ID가 올바르지 않습니다.');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_ANSWER_STYLE_NAME) {
      invalid(`이름은 1~${MAX_ANSWER_STYLE_NAME}자여야 합니다.`);
    }
    if (typeof bold !== 'boolean') invalid('굵게 설정이 올바르지 않습니다.');
    if (color !== undefined && (typeof color !== 'string' || !COLOR.test(color))) invalid('글자색이 올바르지 않습니다.');
    if (backgroundColor !== undefined && (typeof backgroundColor !== 'string' || !COLOR.test(backgroundColor))) invalid('배경색이 올바르지 않습니다.');
    if (ids.has(id)) invalid('ID가 중복되었습니다.');
    const trimmedName = name.trim();
    if (names.has(trimmedName)) invalid('이름이 중복되었습니다.');
    ids.add(id); names.add(trimmedName);
    return {
      id, name: trimmedName, bold,
      ...(typeof color === 'string' ? { color: color.toLowerCase() } : {}),
      ...(typeof backgroundColor === 'string' ? { backgroundColor: backgroundColor.toLowerCase() } : {}),
    };
  });
}
