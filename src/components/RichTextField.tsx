import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { BackgroundColor, Color, TextStyle } from '@tiptap/extension-text-style';
import { Bold, ChevronDown, Eraser, Highlighter, Type } from 'lucide-react';
import type { TextFormatting } from '../types';
import { fromRichTextDocument, toRichTextDocument } from '../lib/textFormatting';
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

export default function RichTextField({ id, label, text, formatting, onChange, onSelectionChange, placeholder = '', className = '', describedBy, autoFocus = false }: RichTextFieldProps) {
  const callbacks = useRef({ onChange, onSelectionChange });
  callbacks.current = { onChange, onSelectionChange };
  const savedSelection = useRef<{ from: number; to: number } | null>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<'color' | 'backgroundColor' | null>(null);
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
    if (!palette) return;
    const close = (event: PointerEvent) => { if (!toolbar.current?.contains(event.target as Node)) setPalette(null); };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setPalette(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', cancel, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', cancel, true); };
  }, [palette]);

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
      {palette && <div id={`${id}-palette`} className="rich-text-palette" role="group" aria-label={`${label} ${paletteName} 선택`}>
        {swatches.map(swatch => <button type="button" key={swatch.value} className="rich-text-swatch" aria-label={`${paletteName} ${swatch.name}`}
          onMouseDown={event => event.preventDefault()} onClick={() => apply(palette, swatch.value)}>
          <span className="rich-text-swatch-color" style={{ backgroundColor: swatch.value }} aria-hidden="true" /><span>{swatch.name}</span>
        </button>)}
        <button type="button" className="rich-text-swatch rich-text-swatch-reset" aria-label={palette === 'color' ? '글자색 기본' : '배경색 없음'}
          onMouseDown={event => event.preventDefault()} onClick={() => apply(palette)}>{palette === 'color' ? '기본색' : '배경색 없음'}</button>
      </div>}
    </div>
    <EditorContent editor={editor} className="rich-text-content" />
  </div>;
}
