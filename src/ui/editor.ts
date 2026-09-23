// 코드 에디터 (CodeMirror 6, 파이썬)
import { EditorState, StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, DecorationSet, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { syntaxHighlighting, HighlightStyle, indentUnit, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const setErrLine = StateEffect.define<number | null>();
const errField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrLine)) {
        if (e.value == null || e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none;
        const line = tr.state.doc.line(e.value);
        const b = new RangeSetBuilder<Decoration>();
        b.add(line.from, line.from, Decoration.line({ class: 'cm-errline' }));
        return b.finish();
      }
    }
    if (tr.docChanged) return Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const hl = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syn-kw)', fontWeight: '600' },
  { tag: [tags.string], color: 'var(--syn-str)' },
  { tag: [tags.number, tags.bool], color: 'var(--syn-num)' },
  { tag: tags.comment, color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syn-fn)' },
  { tag: tags.definition(tags.variableName), color: 'var(--ink)' },
]);

export function createEditor(parent: HTMLElement, doc: string, onChange: (code: string, pasteLines: number) => void) {
  let pasteLines = 0;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        python(),
        syntaxHighlighting(hl),
        errField,
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        EditorView.domEventHandlers({
          paste(e) {
            const t = e.clipboardData?.getData('text/plain') ?? '';
            pasteLines = t.split('\n').length;
            return false;
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChange(u.state.doc.toString(), pasteLines);
            pasteLines = 0;
          }
        }),
        EditorView.contentAttributes.of({ 'aria-label': '파이썬 코드 편집기', spellcheck: 'false' }),
      ],
    }),
  });
  return {
    view,
    get: () => view.state.doc.toString(),
    set: (code: string) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }),
    markError: (line: number | null) => {
      view.dispatch({ effects: setErrLine.of(line) });
      if (line && line <= view.state.doc.lines) {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'center' }) });
      }
    },
    insertLine: (code: string) => {
      const { state } = view;
      const line = state.doc.lineAt(state.selection.main.head);
      const text = line.text.trim() === '' ? code : '\n' + code;
      const at = line.text.trim() === '' ? line.from : line.to;
      const to = line.text.trim() === '' ? line.to : line.to;
      view.dispatch({ changes: { from: at, to, insert: text }, selection: { anchor: at + text.length } });
      view.focus();
    },
  };
}
