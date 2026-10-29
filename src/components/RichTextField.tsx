import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { BackgroundColor, Color, TextStyle } from '@tiptap/extension-text-style';
import { Bold, BookmarkPlus, ChevronDown, Eraser, Highlighter, Type, X } from 'lucide-react';
import type { AnswerStylePreset, TextFormatting } from '../types';
import { fromRichTextDocument, toRichTextDocument } from '../lib/textFormatting';
import { MAX_ANSWER_STYLE_NAME, MAX_ANSWER_STYLE_PRESETS } from '../lib/answerStylePresets';
import './rich-text.css';

interface RichTextFieldProps {
  id: string;
  label: string;
  text: string;
  formatting?: TextFormatting[];
  onChange: (text: string, formatting: TextFormatting[]) => void;
  onSelectionChange?: (selection: string) => void;
  placeholder?: string;
  className?: string;
  describedBy?: string;
  autoFocus?: boolean;
  stylePresets?: AnswerStylePreset[];
  onStylePresetsChange?: (presets: AnswerStylePreset[]) => void;
}

const TEXT_COLORS = [
  { name: '빨강', value: '#b42318' }, { name: '파랑', value: '#175cd3' },
  { name: '초록', value: '#27704b' }, { name: '보라', value: '#7f3bb1' },
  { name: '주황', value: '#a94600' }, { name: '검정', value: '#243c34' },
];
const BACKGROUND_COLORS = [
  { name: '노랑', value: '#fff1a8' }, { name: '연두', value: '#dcf1c2' },
  { name: '하늘', value: '#dbeafe' }, { name: '분홍', value: '#fce0e9' },
  { name: '보라', value: '#eaddfa' }, { name: '주황', value: '#ffe2bf' },
];

type CopiedStyle = Pick<AnswerStylePreset, 'bold' | 'color' | 'backgroundColor'>;
type TextSelection = { from: number; to: number };
const SAFE_COLOR = /^#[\da-f]{6}$/i;

export default function RichTextField({ id, label, text, formatting, onChange, onSelectionChange, placeholder = '', className = '', describedBy, autoFocus = false, stylePresets = [], onStylePresetsChange }: RichTextFieldProps) {
  const callbacks = useRef({ onChange, onSelectionChange });
  callbacks.current = { onChange, onSelectionChange };
  const savedSelection = useRef<TextSelection | null>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const presetNameInput = useRef<HTMLInputElement>(null);
  const [palette, setPalette] = useState<'color' | 'backgroundColor' | null>(null);
  const [copiedStyle, setCopiedStyle] = useState<{ style: CopiedStyle; selection: TextSelection } | null>(null);
  const [presetName, setPresetName] = useState('');
  const [presetError, setPresetError] = useState('');
  const [, refresh] = useState(0);

  function captureSelection(current: Editor) {
    const { from, to } = current.state.selection;
    savedSelection.current = { from, to };
    callbacks.current.onSelectionChange?.(current.state.doc.textBetween(from, to, '\n').trim());
  }

  const editor = useEditor({
    extensions: [StarterKit.configure({
      blockquote: false, bulletList: false, code: false, codeBlock: false,
      dropcursor: false, gapcursor: false, heading: false, horizontalRule: false,
      italic: false, listItem: false, listKeymap: false, orderedList: false,
      strike: false, underline: false, link: false, trailingNode: false,
    }), TextStyle, Color, BackgroundColor],
    content: toRichTextDocument(text, formatting),
    autofocus: autoFocus ? 'start' : false,
    editorProps: {
      attributes: {
        id, role: 'textbox', tabindex: '0', 'aria-label': label, 'aria-multiline': 'true',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        class: `editor-textarea rich-text-input ${className}`,
        'data-placeholder': placeholder,
      },
      handlePaste: (view, event) => {
        const plainText = event.clipboardData?.getData('text/plain').replace(/\r\n?/gu, '\n') ?? '';
        event.preventDefault();
        if (plainText) view.dispatch(view.state.tr.insertText(plainText).scrollIntoView());
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const value = fromRichTextDocument(current.getJSON());
      callbacks.current.onChange(value.text, value.formatting);
      captureSelection(current);
      refresh(value => value + 1);
    },
    onSelectionUpdate: ({ editor: current }) => { captureSelection(current); refresh(value => value + 1); },
    onTransaction: () => refresh(value => value + 1),
  });
  useEffect(() => {
    if (!editor) return;
    const current = fromRichTextDocument(editor.getJSON());
    const incoming = fromRichTextDocument(toRichTextDocument(text, formatting));
    const comparable = (ranges: TextFormatting[]) => ranges.map(range =>
      [range.start, range.end, Boolean(range.bold), range.color ?? '', range.backgroundColor ?? '']);
    if (current.text !== incoming.text || JSON.stringify(comparable(current.formatting)) !== JSON.stringify(comparable(incoming.formatting))) {
      editor.commands.setContent(toRichTextDocument(text, formatting), { emitUpdate: false });
      savedSelection.current = null;
      callbacks.current.onSelectionChange?.('');
      refresh(value => value + 1);
    }
  }, [editor, text, formatting]);

  useEffect(() => {
    if (!palette && !copiedStyle) return;
    const close = (event: PointerEvent) => { if (!toolbar.current?.contains(event.target as Node)) setPalette(null); };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setPalette(null); setCopiedStyle(null); setPresetError('');
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', cancel, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', cancel, true); };
  }, [palette, copiedStyle]);

  useEffect(() => { if (copiedStyle) presetNameInput.current?.focus(); }, [copiedStyle]);

  const hasSelection = Boolean(editor && savedSelection.current && savedSelection.current.from < savedSelection.current.to
    && editor.state.doc.textBetween(savedSelection.current.from, savedSelection.current.to, '\n').trim());

  function beginSaveStyle() {
    if (!editor || !hasSelection || !savedSelection.current) return;
    const selection = { ...savedSelection.current };
    const style: CopiedStyle = { bold: false };
    let found = false;
    // Like a format painter, use the first selected character if the range has mixed styles.
    editor.state.doc.nodesBetween(selection.from, selection.to, node => {
      if (found || !node.isText) return;
      found = true;
      for (const mark of node.marks) {
        if (mark.type.name === 'bold') style.bold = true;
        if (mark.type.name === 'textStyle') {
          if (typeof mark.attrs.color === 'string' && SAFE_COLOR.test(mark.attrs.color)) style.color = mark.attrs.color.toLowerCase();
          if (typeof mark.attrs.backgroundColor === 'string' && SAFE_COLOR.test(mark.attrs.backgroundColor)) style.backgroundColor = mark.attrs.backgroundColor.toLowerCase();
        }
      }
    });
    setCopiedStyle({ style, selection }); setPresetName(''); setPresetError(''); setPalette(null);
  }

  function saveStyle(event: FormEvent) {
    event.preventDefault();
    if (!copiedStyle || !onStylePresetsChange) return;
    const name = presetName.trim();
    if (!name || name.length > MAX_ANSWER_STYLE_NAME) { setPresetError(`서식 이름을 ${MAX_ANSWER_STYLE_NAME}자 이내로 입력해 주세요.`); return; }
    const existing = stylePresets.find(preset => preset.name === name);
    if (!existing && stylePresets.length >= MAX_ANSWER_STYLE_PRESETS) {
      setPresetError(`서식은 ${MAX_ANSWER_STYLE_PRESETS}개까지 저장할 수 있어요. 같은 이름으로 저장하면 기존 서식을 바꿉니다.`); return;
    }
    const preset: AnswerStylePreset = { id: existing?.id ?? crypto.randomUUID(), name, ...copiedStyle.style };
    onStylePresetsChange(existing ? stylePresets.map(item => item.id === existing.id ? preset : item) : [...stylePresets, preset]);
    editor?.chain().focus().setTextSelection(copiedStyle.selection).run();
    setCopiedStyle(null); setPresetError('');
  }

  function applyPreset(preset: AnswerStylePreset) {
    if (!editor || !hasSelection || !savedSelection.current) return;
    // Replace the full style, so applying twice is stable and missing colors reset to defaults.
    const chain = editor.chain().focus().setTextSelection(savedSelection.current).unsetAllMarks();
    if (preset.bold) chain.setBold();
    if (preset.color) chain.setColor(preset.color);
    if (preset.backgroundColor) chain.setBackgroundColor(preset.backgroundColor);
    chain.run(); setPalette(null); setCopiedStyle(null); refresh(value => value + 1);
  }

  function apply(action: 'bold' | 'color' | 'backgroundColor' | 'clear', value?: string) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (savedSelection.current) chain.setTextSelection(savedSelection.current);
    if (action === 'bold') chain.toggleBold();
    if (action === 'color') value ? chain.setColor(value) : chain.unsetColor();
    if (action === 'backgroundColor') value ? chain.setBackgroundColor(value) : chain.unsetBackgroundColor();
    if (action === 'clear') chain.unsetAllMarks();
    chain.run();
    setPalette(null);
    refresh(value => value + 1);
  }

  const swatches = palette === 'color' ? TEXT_COLORS : BACKGROUND_COLORS;
  const paletteName = palette === 'color' ? '글자색' : '배경색';
  return <div className="rich-text-field" data-empty={editor?.isEmpty ? 'true' : 'false'}>
    <div className="rich-text-toolbar" ref={toolbar} role="toolbar" aria-label={`${label} 서식`}>
      <button type="button" className="rich-text-tool" aria-label="굵게" title="굵게 (Ctrl+B)" aria-pressed={editor?.isActive('bold') ?? false}
        onMouseDown={event => event.preventDefault()} onClick={() => apply('bold')}><Bold size={17} /></button>
      <button type="button" className="rich-text-tool" aria-label="글자색" aria-expanded={palette === 'color'} aria-controls={`${id}-palette`}
        onMouseDown={event => event.preventDefault()} onClick={() => setPalette(palette === 'color' ? null : 'color')}><Type size={16} /><span>글자색</span><ChevronDown size={12} /></button>
      <button type="button" className="rich-text-tool" aria-label="배경색" aria-expanded={palette === 'backgroundColor'} aria-controls={`${id}-palette`}
        onMouseDown={event => event.preventDefault()} onClick={() => setPalette(palette === 'backgroundColor' ? null : 'backgroundColor')}><Highlighter size={16} /><span>배경색</span><ChevronDown size={12} /></button>
      <button type="button" className="rich-text-tool" aria-label="서식 지우기" title="선택한 글자 서식 지우기"
        onMouseDown={event => event.preventDefault()} onClick={() => apply('clear')}><Eraser size={17} /></button>
      {onStylePresetsChange && <button type="button" className="rich-text-tool rich-text-save-style" aria-label="서식 저장" disabled={!hasSelection}
        title={hasSelection ? '선택한 첫 글자의 서식을 저장' : '서식을 저장할 글자를 선택하세요.'}
        aria-expanded={Boolean(copiedStyle)} onMouseDown={event => event.preventDefault()} onClick={beginSaveStyle}><BookmarkPlus size={16} /><span>서식 저장</span></button>}
      {palette && <div id={`${id}-palette`} className="rich-text-palette" role="group" aria-label={`${label} ${paletteName} 선택`}>
        {swatches.map(swatch => <button type="button" key={swatch.value} className="rich-text-swatch" aria-label={`${paletteName} ${swatch.name}`}
          onMouseDown={event => event.preventDefault()} onClick={() => apply(palette, swatch.value)}>
          <span className="rich-text-swatch-color" style={{ backgroundColor: swatch.value }} aria-hidden="true" /><span>{swatch.name}</span>
        </button>)}
        <button type="button" className="rich-text-swatch rich-text-swatch-reset" aria-label={palette === 'color' ? '글자색 기본' : '배경색 없음'}
          onMouseDown={event => event.preventDefault()} onClick={() => apply(palette)}>{palette === 'color' ? '기본색' : '배경색 없음'}</button>
      </div>}
      {copiedStyle && <form className="rich-text-save-form" onSubmit={saveStyle}>
        <label htmlFor={`${id}-style-name`}>서식 이름</label>
        <input ref={presetNameInput} id={`${id}-style-name`} value={presetName} onChange={event => { setPresetName(event.target.value); setPresetError(''); }}
          maxLength={MAX_ANSWER_STYLE_NAME} placeholder="예: 핵심 키워드" autoComplete="off" />
        <div className="rich-text-save-actions"><button type="submit">저장</button><button type="button" onClick={() => { setCopiedStyle(null); setPresetError(''); }}>취소</button></div>
        <p>선택한 첫 글자의 서식을 저장해 다른 문구에 적용합니다. 같은 이름은 덮어씁니다.</p>
        {presetError && <p className="rich-text-preset-error" role="alert">{presetError}</p>}
      </form>}
      {onStylePresetsChange && stylePresets.length > 0 && <div className="rich-text-presets" role="group" aria-label="저장한 답변 서식">
        <span className="rich-text-presets-label">저장한 서식</span>
        <div className="rich-text-preset-list">{stylePresets.map(preset => <div className="rich-text-preset" key={preset.id}>
          <button type="button" className="rich-text-preset-apply" aria-label={`저장한 서식 ${preset.name} 적용`} disabled={!hasSelection}
            title={hasSelection ? '선택한 문구에 저장한 서식 적용' : '서식을 적용할 문구를 선택하세요.'}
            style={{ fontWeight: preset.bold ? 750 : 400, color: preset.color ?? '#243c34', backgroundColor: preset.backgroundColor ?? '#ffffff' }}
            onMouseDown={event => event.preventDefault()} onClick={() => applyPreset(preset)}>{preset.name}</button>
          <button type="button" className="rich-text-preset-delete" aria-label={`저장한 서식 ${preset.name} 삭제`} title="저장한 서식 삭제"
            onMouseDown={event => event.preventDefault()} onClick={() => onStylePresetsChange(stylePresets.filter(item => item.id !== preset.id))}><X size={13} /></button>
        </div>)}</div>
      </div>}
    </div>
    <EditorContent editor={editor} className="rich-text-content" />
  </div>;
}
