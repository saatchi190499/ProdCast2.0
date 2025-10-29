let disposables = [];

export function registerPythonProviders(monaco, tips) {
  if (!monaco || !Object.keys(tips).length) return;

  // Defensive: dispose previously registered providers stored on monaco (survives HMR)
  try {
    const globalKey = "__petexPythonProviders__";
    if (Array.isArray(monaco[globalKey])) {
      monaco[globalKey].forEach((d) => d && d.dispose && d.dispose());
      monaco[globalKey] = [];
    }
  } catch {}

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

        // Scan backwards to find the nearest "(" that is not inside quotes and
        // is balanced w.r.t. nested parentheses in this line.
        let inString = false;
        let stringQuote = null;
        let depth = 0; // counts closing parens seen moving backwards
        let openParenIndex = -1;
        for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
          const ch = textBeforeCursor[i];
          const prev = textBeforeCursor[i - 1];
          if (inString) {
            if (ch === stringQuote && prev !== "\\") {
              inString = false; stringQuote = null;
            }
            continue;
          }
          if (ch === '"' || ch === "'") {
            inString = true; stringQuote = ch; continue;
          }
          if (ch === ')') { depth++; continue; }
          if (ch === '(') {
            if (depth === 0) { openParenIndex = i; break; }
            depth--; continue;
          }
        }
        if (openParenIndex === -1) return null;

        // Determine the callee just before the open parenthesis
        const calleeText = textBeforeCursor.slice(0, openParenIndex);
        const callMatch = calleeText.match(/([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)$/);
        if (!callMatch) return null;
        const [, mod, fname] = callMatch;

        // Compute which parameter index we are on by counting top-level commas
        let commas = 0;
        inString = false; stringQuote = null; depth = 0;
        for (let i = openParenIndex + 1; i < textBeforeCursor.length; i++) {
          const ch = textBeforeCursor[i];
          const prev = textBeforeCursor[i - 1];
          if (inString) {
            if (ch === stringQuote && prev !== "\\") { inString = false; stringQuote = null; }
            continue;
          }
          if (ch === '"' || ch === "'") { inString = true; stringQuote = ch; continue; }
          if (ch === '(') { depth++; continue; }
          if (ch === ')') { if (depth === 0) break; depth--; continue; }
          if (ch === ',' && depth === 0) { commas++; }
        }
        let activeParameter = commas; // 0-based index

        if (tips[mod] && tips[mod][fname]) {
          const info = tips[mod][fname];
          const params = (info.signature.match(/\((.*?)\)/)?.[1] || "")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p) => ({ label: p, documentation: "" }));

          if (params.length > 0) {
            activeParameter = Math.min(activeParameter, params.length - 1);
          } else {
            activeParameter = 0;
          }

          return {
            value: {
              signatures: [
                {
                  label: `${mod}.${info.signature}`,
                  documentation: info.doc || "No description",
                  parameters: params,
                },
              ],
              activeSignature: 0,
              activeParameter,
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
      triggerCharacters: [".", ",", ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_"],
      provideCompletionItems(model, position) {
        const textBeforeCursor = model
          .getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          })
          .trimEnd();

        // Try to detect dotted access contexts like: module., module.na, module.Class., module.Class.me
        const classCtx = textBeforeCursor.match(/([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)?$/);
        const moduleCtx = textBeforeCursor.match(/([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)?$/);

        // Detect if we are currently typing inside parentheses of a call
        const openParens = (textBeforeCursor.match(/\(/g) || []).length;
        const closeParens = (textBeforeCursor.match(/\)/g) || []).length;
        const inParens = openParens > closeParens;

        // If in class member context: module.Class.<prefix>
        if (classCtx) {
          const [, moduleName, className, memberPrefixRaw] = classCtx;
          const memberPrefix = memberPrefixRaw || "";
          if (tips[moduleName] && tips[moduleName][className]?.methods) {
            const suggestions = Object.entries(tips[moduleName][className].methods)
              .filter(([mname]) => mname.startsWith(memberPrefix))
              .map(([mname, minfo]) => ({
                label: mname,
                kind: monaco.languages.CompletionItemKind.Method,
                documentation: minfo.doc,
                insertText: mname,
              }));
            return { suggestions };
          }
        }

        // If in module member context: module.<prefix>
        if (moduleCtx && textBeforeCursor.includes(".")) {
          const [, moduleName, memberPrefixRaw] = moduleCtx;
          const memberPrefix = memberPrefixRaw || "";
          if (tips[moduleName]) {
            const suggestions = Object.entries(tips[moduleName])
              .filter(([name, _info]) => name.startsWith(memberPrefix))
              .map(([name, info]) => ({
                label: name,
                kind:
                  info?.kind === "function"
                    ? monaco.languages.CompletionItemKind.Function
                    : info?.kind === "class"
                    ? monaco.languages.CompletionItemKind.Class
                    : monaco.languages.CompletionItemKind.Variable,
                documentation: info?.doc,
                insertText: name,
              }));
            return { suggestions };
          }
        }

        // If inside parentheses and not in a dotted context, suppress global suggestions
        if (inParens) {
          return { suggestions: [] };
        }

        // Fallback: global suggestions (modules, variables, user-defined functions)
        const baseSuggestions = [
          ...Object.keys(tips)
            .filter((mod) => mod !== "__variables__" && mod !== "__functions__")
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
          ...Object.entries(tips.__functions__ || {}).map(([name, info]) => ({
            label: name,
            kind: monaco.languages.CompletionItemKind.Function,
            documentation: info.doc,
            insertText: name,
          })),
        ];

        // Deduplicate by label
        const suggestions = Object.values(
          baseSuggestions.reduce((acc, item) => {
            acc[item.label] = item;
            return acc;
          }, {})
        );

        return { suggestions };
      },
    })
  );

  // Save references on monaco to avoid duplicate registrations across HMR reloads
  try {
    const globalKey = "__petexPythonProviders__";
    monaco[globalKey] = [...(monaco[globalKey] || []), ...disposables];
  } catch {}
}
