"use client";

import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";

import { zigLanguage } from "./zig-language";

const zigHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--ze-accent)" },
  { tag: t.comment, color: "var(--ze-muted)", fontStyle: "italic" },
  { tag: t.string, color: "var(--ze-string)" },
  { tag: t.number, color: "var(--ze-number)" },
  { tag: t.typeName, color: "var(--ze-accent)" },
  { tag: t.atom, color: "var(--ze-number)" },
  { tag: t.operator, color: "var(--ze-muted)" },
  { tag: t.variableName, color: "var(--ze-text)" },
]);

function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        fontSize: "13px",
        backgroundColor: "var(--ze-bg)",
        color: "var(--ze-text)",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-scroller": {
        overflow: "auto",
        fontFamily: "var(--ze-font)",
        fontFeatureSettings: '"calt" 1, "liga" 1',
        lineHeight: "1.65",
      },
      ".cm-content": {
        caretColor: "var(--ze-accent)",
        padding: "12px 0",
      },
      ".cm-gutters": {
        backgroundColor: "var(--ze-bg)",
        color: "var(--ze-muted)",
        borderRight: "1px solid var(--ze-line)",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in oklab, var(--ze-accent) 8%, transparent)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "color-mix(in oklab, var(--ze-accent) 8%, transparent)",
        color: "var(--ze-text)",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--ze-accent)",
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
        {
          backgroundColor:
            "color-mix(in oklab, var(--ze-accent) 28%, transparent) !important",
        },
    },
    { dark },
  );
}

export function CodeEditor({
  value,
  onChange,
  onRun,
  dark,
  readOnly,
}: {
  value: string;
  onChange: (code: string) => void;
  onRun: () => void;
  dark: boolean;
  readOnly: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef<Compartment | null>(null);
  const readOnlyCompartmentRef = useRef<Compartment | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  }, [onChange, onRun]);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const themeCompartment = new Compartment();
    const readOnlyCompartment = new Compartment();
    themeCompartmentRef.current = themeCompartment;
    readOnlyCompartmentRef.current = readOnlyCompartment;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          indentUnit.of("    "),
          EditorState.tabSize.of(4),
          zigLanguage,
          syntaxHighlighting(zigHighlight),
          themeCompartment.of(editorTheme(dark)),
          readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                onRunRef.current();
                return true;
              },
            },
            {
              key: "Escape",
              run: (current) => {
                current.contentDOM.blur();
                return true;
              },
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      themeCompartmentRef.current = null;
      readOnlyCompartmentRef.current = null;
    };
    // Mount once; value, theme, and readOnly sync in later effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    const themeCompartment = themeCompartmentRef.current;
    if (!view || !themeCompartment) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(editorTheme(dark)),
    });
  }, [dark]);

  useEffect(() => {
    const view = viewRef.current;
    const readOnlyCompartment = readOnlyCompartmentRef.current;
    if (!view || !readOnlyCompartment) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  return <div ref={parentRef} className="zig-editor-code" />;
}
