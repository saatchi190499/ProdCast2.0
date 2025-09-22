let disposables = [];

export function registerPythonProviders(monaco, tips) {
  if (!monaco || !Object.keys(tips).length) return;

  // 🔹 dispose old providers before re-register
  disposables.forEach((d) => d.dispose());
  disposables = [];

  // Hover provider
  disposables.push(
    monaco.languages.registerHoverProvider("python", {
      provideHover(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        const lineContent = model.getLineContent(position.lineNumber);
        const regex = /([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)/g;
        let match;
        while ((match = regex.exec(lineContent))) {
          const [full, mod, fname] = match;
          if (
            position.column >= match.index + 1 &&
            position.column <= match.index + full.length + 1
          ) {
            if (tips[mod] && tips[mod][fname]) {
              const info = tips[mod][fname];
              return {
                range: new monaco.Range(
                  position.lineNumber,
                  match.index + 1,
                  position.lineNumber,
                  match.index + full.length + 1
                ),
                contents: [
                  { value: `**${mod}.${info.signature}**` },
                  { value: info.doc || "No description" },
                ],
              };
            }
          }
        }
        return null;
      },
    })
  );

  // Signature help provider
  disposables.push(
    monaco.languages.registerSignatureHelpProvider("python", {
      signatureHelpTriggerCharacters: ["(", ","],
      provideSignatureHelp(model, position) {
        const textBeforeCursor = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const regex = /([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)\($/;
        const match = textBeforeCursor.match(regex);
        if (!match) return null;

        const [, mod, fname] = match;
        if (tips[mod] && tips[mod][fname]) {
          const info = tips[mod][fname];
          return {
            value: {
              signatures: [
                {
                  label: `${mod}.${info.signature}`,
                  documentation: info.doc || "No description",
                  parameters: (info.signature.match(/\((.*?)\)/)?.[1] || "")
                    .split(",")
                    .filter(Boolean)
                    .map((p) => ({ label: p.trim(), documentation: "" })),
                },
              ],
              activeSignature: 0,
              activeParameter: 0,
            },
            dispose: () => {},
          };
        }
        return null;
      },
    })
  );

  // Completion provider
  disposables.push(
    monaco.languages.registerCompletionItemProvider("python", {
      triggerCharacters: [".", " ", "(", "=", ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'],
      provideCompletionItems(model, position) {
        const textBeforeCursor = model
          .getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          })
          .trimEnd();

        const parts = textBeforeCursor.split(/\s+/).pop().split(".");

        let extraSuggestions = [];

        if (parts.length === 2 && textBeforeCursor.endsWith(".")) {
          const [moduleName] = parts;
          if (tips[moduleName]) {
            extraSuggestions = Object.entries(tips[moduleName]).map(([name, info]) => ({
              label: name,
              kind:
                info.kind === "function"
                  ? monaco.languages.CompletionItemKind.Function
                  : info.kind === "class"
                  ? monaco.languages.CompletionItemKind.Class
                  : monaco.languages.CompletionItemKind.Variable,
              documentation: info.doc,
              insertText: name,
            }));
          }
        }

        if (parts.length === 3 && textBeforeCursor.endsWith(".")) {
          const [moduleName, className] = parts;
          if (tips[moduleName] && tips[moduleName][className]?.methods) {
            extraSuggestions = Object.entries(tips[moduleName][className].methods).map(
              ([mname, minfo]) => ({
                label: mname,
                kind: monaco.languages.CompletionItemKind.Method,
                documentation: minfo.doc,
                insertText: mname,
              })
            );
          }
        }

        const baseSuggestions = [
          ...Object.keys(tips)
            .filter((mod) => mod !== "__variables__")
            .map((mod) => ({
              label: mod,
              kind: monaco.languages.CompletionItemKind.Module,
              documentation: `Module ${mod}`,
              insertText: mod,
            })),
          ...Object.entries(tips.__variables__ || {}).map(([name, info]) => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Variable,
            documentation: info.doc,
            insertText: name,
          })),
        ];

        const suggestions = Object.values(
          [...baseSuggestions, ...extraSuggestions].reduce((acc, item) => {
            acc[item.label] = item;
            return acc;
          }, {})
        );

        return { suggestions };
      },
    })
  );
}
