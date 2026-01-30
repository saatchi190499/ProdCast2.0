let disposables = [];

export function registerPythonProviders(monaco, tips, extraGlobals = []) {
  if (!monaco) return;

  tips = tips || {};

  const workflowGlobals = (extraGlobals || [])
    .map((g) => (typeof g === "string" ? { name: g } : g))
    .filter((g) => g && g.name);

  const workflowByName = workflowGlobals.reduce((acc, g) => {
    acc[g.name] = g;
    return acc;
  }, {});

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


        // Workflow table contextual completions
        const makeRange = (prefix) => new monaco.Range(
          position.lineNumber,
          Math.max(1, position.column - (prefix ? prefix.length : 0)),
          position.lineNumber,
          position.column
        );

        const colMatch = textBeforeCursor.match(/([a-zA-Z_]\w*(?:InputsTable|OutputsTable))\[\s*(['"]?)([^'"]*)$/);
        if (colMatch) {
          const [, tableName, quote, prefix] = colMatch;
          const meta = workflowByName[tableName];
          const cols = (meta?.columns || []).map(String);
          const p = (prefix || '').toLowerCase();
          const suggestions = cols
            .filter((c) => !p || c.toLowerCase().includes(p))
            .slice(0, 50)
            .map((c) => ({
              label: c,
              kind: monaco.languages.CompletionItemKind.Field,
              documentation: `Column: ${c}`,
              insertText: quote ? c.slice(prefix.length) : JSON.stringify(c),
              range: makeRange(prefix),
            }));
          return { suggestions };
        }

        const tableMemberMatch = textBeforeCursor.match(/([a-zA-Z_]\w*(?:InputsTable|OutputsTable))\[[^\]]*\]\.([a-zA-Z_]\w*)?$/);
        if (tableMemberMatch) {
          const prefix = tableMemberMatch[2] || "";
          const suggestions = ["Row"]
            .filter((s) => s.startsWith(prefix))
            .map((s) => ({
              label: s,
              kind: monaco.languages.CompletionItemKind.Property,
              documentation: "Table member",
              insertText: s.slice(prefix.length),
              range: makeRange(prefix),
            }));
          return { suggestions };
        }

        const cfgMemberMatch = textBeforeCursor.match(/\b(inputs|outputs)\.([a-zA-Z_]\w*)?$/);
        if (cfgMemberMatch) {
          const prefix = cfgMemberMatch[2] || '';
          const members = ['tabs', 'instances', 'properties', 'columns'];
          const suggestions = members
            .filter((m) => m.startsWith(prefix))
            .map((m) => ({
              label: m,
              kind: monaco.languages.CompletionItemKind.Property,
              documentation: 'Workflow config',
              insertText: m.slice(prefix.length),
              range: makeRange(prefix),
            }));
          return { suggestions };
        }

        const rowStartMatch = textBeforeCursor.match(/([a-zA-Z_]\w*(?:InputsTable|OutputsTable))\[[^\]]*\]\.Row\s*$/);
        if (rowStartMatch) {
          const [, tableName] = rowStartMatch;
          const meta = workflowByName[tableName];
          const rows = (meta?.rows || []).map(String);
          const suggestions = [
            {
              label: '[',
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: 'Start row selector',
              insertText: '[',
              range: makeRange(''),
            },
            ...rows.slice(0, 50).map((r) => ({
              label: r,
              kind: monaco.languages.CompletionItemKind.Value,
              documentation: `Row/Instance: ${r}`,
              insertText: `[${JSON.stringify(r)}]`,
              range: makeRange(''),
            })),
          ];
          return { suggestions };
        }

        const rowMatch = textBeforeCursor.match(/([a-zA-Z_]\w*(?:InputsTable|OutputsTable))\[[^\]]*\]\.Row\[\s*(['"]?)([^'"]*)$/);
        if (rowMatch) {
          const [, tableName, quote, prefix] = rowMatch;
          const meta = workflowByName[tableName];
          const rows = (meta?.rows || []).map(String);
          const p = (prefix || '').toLowerCase();
          const suggestions = rows
            .filter((r) => !p || r.toLowerCase().includes(p))
            .slice(0, 50)
            .map((r) => ({
              label: r,
              kind: monaco.languages.CompletionItemKind.Value,
              documentation: `Row/Instance: ${r}`,
              insertText: quote ? r.slice(prefix.length) : JSON.stringify(r),
              range: makeRange(prefix),
            }));
          return { suggestions };
        }

        const inputRowMember = textBeforeCursor.match(/([a-zA-Z_]\w*InputsTable)\[[^\]]*\]\.Row\[[^\]]*\]\.([a-zA-Z_]\w*)?$/);
        if (inputRowMember) {
          const prefix = inputRowMember[2] || '';
          const suggestions = ['Sample']
            .filter((s) => s.startsWith(prefix))
            .map((s) => ({
              label: s,
              kind: monaco.languages.CompletionItemKind.Property,
              documentation: 'Inputs row member',
              insertText: s.slice(prefix.length),
              range: makeRange(prefix),
            }));
          return { suggestions };
        }

        const outputRowMember = textBeforeCursor.match(/([a-zA-Z_]\w*OutputsTable)\[[^\]]*\]\.Row\[[^\]]*\]\.([a-zA-Z_]\w*)?$/);
        if (outputRowMember) {
          const prefix = outputRowMember[2] || '';
          const members = ['Value', 'Save', 'Sample'];
          const suggestions = members
            .filter((s) => s.startsWith(prefix))
            .map((s) => ({
              label: s,
              kind: monaco.languages.CompletionItemKind.Property,
              documentation: 'Outputs row member',
              insertText: s.slice(prefix.length),
              range: makeRange(prefix),
            }));
          return { suggestions };
        }

        const sampleIndexMatch = textBeforeCursor.match(/\.Sample\[\s*([^\]]*)$/);
        if (sampleIndexMatch) {
          const prefix = (sampleIndexMatch[1] || '').trim();
          const options = ['0', 'index', 'i', '-1'];
          const pfx = prefix.toLowerCase();
          const suggestions = options
            .filter((s) => !pfx || s.toLowerCase().startsWith(pfx))
            .map((s) => ({
              label: s,
              kind: monaco.languages.CompletionItemKind.Variable,
              documentation: 'Sample index',
              insertText: s.slice(prefix.length),
              range: makeRange(prefix),
            }));
          return { suggestions };
        }

        const sampleMember = textBeforeCursor.match(/\.Sample\[[^\]]*\]\.([a-zA-Z_]\w*)?$/);
        if (sampleMember) {
          const prefix = sampleMember[1] || '';
          const members = ['Value', 'TimeOfSample'];
          const suggestions = members
            .filter((s) => s.startsWith(prefix))
            .map((s) => ({
              label: s,
              kind: monaco.languages.CompletionItemKind.Property,
              documentation: 'Sample member',
              insertText: s.slice(prefix.length),
              range: makeRange(prefix),
            }));
          return { suggestions };
        }
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

        // Note: keep suggestions available inside parentheses too

        // Fallback: global suggestions (modules, variables, user-defined functions)

        const extraGlobalSuggestions = (workflowGlobals || []).map((g) => ({
          label: g.name,
          kind: monaco.languages.CompletionItemKind.Variable,
          documentation: g.variant === 'outputs'
            ? `Workflow outputs table: ${g.name}`
            : `Workflow inputs table: ${g.name}` ,
          insertText: g.name,
          filterText: String(g.name).toLowerCase(),
        }));

        const baseSuggestions = [
          ...extraGlobalSuggestions,
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
