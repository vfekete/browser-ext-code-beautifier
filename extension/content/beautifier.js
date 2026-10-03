/*
 * Raw Beautifier — injected on demand (from the popup) into the active tab.
 * Requires lib/highlight.min.js (+ extra languages) to be injected first.
 * Exposes window.__rawBeautifier = { apply, restore, getState }.
 */
(() => {
  if (window.__rawBeautifier) return;

  // Exact file names (lower-case) -> language.
  const FILENAME_MAP = {
    'dockerfile': 'dockerfile',
    'containerfile': 'dockerfile',
    'makefile': 'makefile',
    'gnumakefile': 'makefile',
    'cmakelists.txt': 'cmake',
    'jenkinsfile': 'groovy',
    'vagrantfile': 'ruby',
    'gemfile': 'ruby',
    'rakefile': 'ruby',
    'podfile': 'ruby',
    '.gitlab-ci.yml': 'yaml',
    '.gitignore': 'bash',
    '.bashrc': 'bash',
    '.zshrc': 'bash',
    '.profile': 'bash',
    '.editorconfig': 'ini',
    '.npmrc': 'ini',
    '.gitconfig': 'ini',
    'nginx.conf': 'nginx',
    'go.mod': 'go',
    'cargo.lock': 'ini',
  };

  // File extensions -> language, or a list of candidates to auto-detect between.
  const EXT_MAP = {
    json: 'json', jsonc: 'json', json5: 'json', geojson: 'json', ipynb: 'json', har: 'json',
    xml: 'xml', xsd: 'xml', xsl: 'xml', xslt: 'xml', svg: 'xml', plist: 'xml', pom: 'xml',
    csproj: 'xml', vbproj: 'xml', fsproj: 'xml', vcxproj: 'xml', props: 'xml', targets: 'xml',
    resx: 'xml', xaml: 'xml', wsdl: 'xml', rss: 'xml', atom: 'xml', config: 'xml', nuspec: 'xml',
    html: 'xml', htm: 'xml', xhtml: 'xml', vue: 'xml', svelte: 'xml',
    c: 'c', h: ['c', 'cpp', 'objectivec'],
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', 'c++': 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', 'h++': 'cpp',
    ipp: 'cpp', tpp: 'cpp', inl: 'cpp', ino: 'cpp', cu: 'cpp', cuh: 'cpp',
    m: ['objectivec', 'matlab'], mm: 'objectivec',
    java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', sc: 'scala',
    groovy: 'groovy', gvy: 'groovy', gradle: 'gradle',
    cs: 'csharp', csx: 'csharp', vb: 'vbnet', fs: 'fsharp', fsx: 'fsharp', fsi: 'fsharp',
    rs: 'rust', go: 'go', swift: 'swift', dart: 'dart', zig: 'c',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less',
    py: 'python', pyw: 'python', pyi: 'python', rb: 'ruby', php: 'php', pl: 'perl', pm: 'perl',
    lua: 'lua', r: 'r', jl: 'julia', hs: 'haskell', ex: 'elixir', exs: 'elixir', erl: 'erlang',
    hrl: 'erlang', clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure',
    ml: 'ocaml', mli: 'ocaml', tcl: 'tcl', awk: 'awk', vim: 'vim', nix: 'nix',
    sh: 'bash', bash: 'bash', zsh: 'bash', ksh: 'bash', ps1: 'powershell', psm1: 'powershell',
    psd1: 'powershell', bat: 'dos', cmd: 'dos',
    sql: 'sql', pgsql: 'pgsql', psql: 'pgsql',
    yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'properties',
    md: 'markdown', markdown: 'markdown', tex: 'latex', sty: 'latex', cls: 'latex',
    proto: 'protobuf', graphql: 'graphql', gql: 'graphql', cmake: 'cmake', mk: 'makefile', mak: 'makefile',
    dockerfile: 'dockerfile', diff: 'diff', patch: 'diff',
    v: 'verilog', sv: 'verilog', svh: 'verilog', vhd: 'vhdl', vhdl: 'vhdl',
    asm: 'x86asm', nasm: 'x86asm', s: 'armasm', ll: 'llvm', wat: 'wasm', wast: 'wasm',
    txt: 'plaintext', log: 'plaintext', text: 'plaintext', csv: 'plaintext', tsv: 'plaintext',
  };

  // Candidates for content-based auto-detection (kept small: faster and more accurate).
  const AUTO_LANGS = [
    'json', 'xml', 'c', 'cpp', 'java', 'csharp', 'rust', 'javascript', 'typescript', 'go', 'kotlin',
    'python', 'ruby', 'php', 'bash', 'shell', 'sql', 'yaml', 'ini', 'css', 'scss', 'markdown',
    'makefile', 'dockerfile', 'cmake', 'groovy', 'scala', 'swift', 'perl', 'lua', 'diff',
    'powershell', 'properties', 'protobuf',
  ];

  const AUTO_SAMPLE_LIMIT = 64 * 1024;

  const state = {
    active: false,
    original: null,   // the page's original <pre>
    text: null,       // original raw text
    root: null,       // our rendered element
    cache: null,      // { language, html }
    view: null,       // { language, lineEls, foldEnd, hide, folded } of the rendered view
    warnings: 0,      // number of lines flagged with a "!" marker
    renderKey: null,  // render options of the current view (theme excluded)
    overlay: null,    // "Colorizing…" overlay element while rendering
    overlayWatchdog: null,
    language: null,
    detectedBy: null,
    themeId: null,
  };

  function findSource() {
    return document.querySelector('body > pre');
  }

  /** Best guess of the file name, also for GitLab API URLs (…/files/<encoded path>/raw). */
  function fileNameFromUrl() {
    try {
      const segments = location.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
      let last = segments[segments.length - 1] || '';
      if (last === 'raw' && segments.length > 1) last = segments[segments.length - 2];
      return last.split('/').pop();
    } catch (e) {
      return '';
    }
  }

  function autoDetect(text, subset) {
    const sample = text.length > AUTO_SAMPLE_LIMIT ? text.slice(0, AUTO_SAMPLE_LIMIT) : text;
    const result = hljs.highlightAuto(sample, subset);
    return result.language || 'plaintext';
  }

  function detectLanguage(text) {
    const name = fileNameFromUrl().toLowerCase();

    if (FILENAME_MAP[name]) return { language: FILENAME_MAP[name], by: 'file name' };
    if (name.startsWith('dockerfile')) return { language: 'dockerfile', by: 'file name' };

    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1) : '';
    const mapped = EXT_MAP[ext];
    if (typeof mapped === 'string' && hljs.getLanguage(mapped)) {
      return { language: mapped, by: `.${ext} extension` };
    }
    if (Array.isArray(mapped)) {
      return { language: autoDetect(text, mapped), by: `.${ext} extension + content` };
    }

    const head = text.trimStart();
    if (/^[{[]/.test(head)) {
      try {
        JSON.parse(text);
        return { language: 'json', by: 'content' };
      } catch (e) { /* not JSON */ }
    }
    if (/^(<\?xml|<!DOCTYPE|<!--|<[A-Za-z][\w:.-]*[\s>/])/i.test(head)) {
      return { language: 'xml', by: 'content' };
    }
    return { language: autoDetect(text, AUTO_LANGS), by: 'content' };
  }

  // ---------------------------------------------------------------------------
  // Line analysis: split highlighted HTML into lines, find foldable regions,
  // optionally convert indentation tabs to spaces.
  // ---------------------------------------------------------------------------

  const INDENT_FOLD_LANGS = new Set(['python', 'python-repl', 'yaml', 'coffeescript', 'haskell', 'fsharp', 'nim']);
  const TAG_FOLD_LANGS = new Set(['xml']);
  const NO_FOLD_LANGS = new Set(['plaintext', 'markdown', 'diff']);
  // Leading tabs are significant here (Makefile recipes must start with a tab).
  const KEEP_TABS_LANGS = new Set(['makefile']);

  const STRING_RE = /\bhljs-(string|regexp)\b/;
  const NO_BRACKET_RE = /\bhljs-(string|comment|regexp|char|quote)\b/;
  const COMMENT_RE = /\bhljs-comment\b/;
  const OPENERS = { '{': '{', '[': '[', '(': '(' };
  const CLOSERS = { '}': '{', ']': '[', ')': '(' };

  function foldMode(language) {
    if (NO_FOLD_LANGS.has(language)) return 'none';
    if (TAG_FOLD_LANGS.has(language)) return 'tag';
    if (INDENT_FOLD_LANGS.has(language)) return 'indent';
    return 'bracket';
  }

  /** Width of the leading whitespace, with tabs expanded to tab stops. */
  function indentWidth(line, tabSize) {
    let col = 0;
    for (const ch of line) {
      if (ch === ' ') col++;
      else if (ch === '\t') col += tabSize - (col % tabSize);
      else break;
    }
    return col;
  }

  /** Indentation-based regions (Python, YAML, ...): a line folds everything indented deeper below it. */
  function indentRegions(text, tabSize, addRegion) {
    const rawLines = text.split('\n');
    const stack = [];
    let lastNonBlank = -1;
    const closeTo = (indent) => {
      while (stack.length && stack[stack.length - 1].indent >= indent) {
        const s = stack.pop();
        addRegion(s.line, lastNonBlank);
      }
    };
    rawLines.forEach((line, i) => {
      if (!line.trim()) return;
      closeTo(indentWidth(line, tabSize));
      stack.push({ indent: indentWidth(line, tabSize), line: i });
      lastNonBlank = i;
    });
    closeTo(-1);
  }

  // ---------------------------------------------------------------------------
  // Problem detection: lines the colorized view could render wrongly or damage.
  // Each finding is shown as a "!" marker in the gutter with a tooltip.
  // ---------------------------------------------------------------------------

  const HEREDOC_LANGS = new Set(['bash', 'shell', 'perl', 'ruby', 'php']);
  const PRESERVE_TAGS = new Set(['pre', 'textarea', 'listing', 'plaintext', 'xmp']);
  const BIDI_RE = /[‪-‮⁦-⁩‎‏؜]/g;

  const hex = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

  /**
   * Multi-line constructs highlight.js may not recognize (their body is text, not code).
   * @returns {Map<number, string>} line -> explanation. Only used when highlight.js did not
   *   mark the line as string content itself.
   */
  function scanSpecialLines(rawLines, language) {
    const special = new Map();

    if (HEREDOC_LANGS.has(language)) {
      const startRe = language === 'php'
        ? /<<<\s*(["']?)([A-Za-z_]\w*)\1/
        : /(?<!<)<<([~-]?)(?:(["'`])([A-Za-z_]\w*)\2|([A-Za-z_]\w*))/;
      for (let i = 0; i < rawLines.length; i++) {
        const m = startRe.exec(rawLines[i]);
        if (!m) continue;
        const delim = language === 'php' ? m[2] : (m[3] || m[4]);
        let end = -1;
        for (let j = i + 1; j < rawLines.length; j++) {
          const t = rawLines[j].trim();
          if (t === delim || (language === 'php' && t.replace(/[;,)]+$/, '') === delim)) {
            end = j;
            break;
          }
        }
        if (end < 0) continue; // no terminator: probably not a heredoc (e.g. a shift operator)
        for (let j = i + 1; j < end; j++) {
          special.set(j, `Heredoc body (<<${delim}) is not recognized by the highlighter: it is text, but shown as code. Brackets here are ignored for folding; indentation tabs are kept as-is.`);
        }
        i = end;
      }
    }

    if (language === 'xml') {
      for (let i = 0; i < rawLines.length; i++) {
        if (!rawLines[i].includes('<![CDATA[')) continue;
        if (rawLines[i].indexOf(']]>', rawLines[i].indexOf('<![CDATA[')) >= 0) continue;
        let j = i + 1;
        while (j < rawLines.length && !rawLines[j].includes(']]>')) j++;
        for (let k = i + 1; k <= Math.min(j, rawLines.length - 1); k++) {
          special.set(k, 'Inside a CDATA section: raw text the highlighter does not recognize. Brackets here are ignored for folding; indentation tabs are kept as-is.');
        }
        i = j;
      }
    }

    if (language === 'yaml') {
      rawLines.forEach((l, i) => {
        if (/^[ ]*\t/.test(l)) {
          special.set(i, 'YAML does not allow tabs in indentation, so this tab is either text inside a block scalar or a YAML error. Highlighting may be wrong here; the tab is kept as-is.');
        }
      });
    }
    return special;
  }

  /** Checks based on the raw text of a single line. */
  function lineChecks(raw, language, tabSize) {
    const msgs = [];
    const ws = /^[ \t]*/.exec(raw)[0];
    if (/ \t/.test(ws)) {
      msgs.push(`Indentation has spaces before a tab: how deep this line appears depends on the tab width (currently ${tabSize}).`);
    }
    if (language === 'python' && tabSize !== 8 && ws.includes('\t') && ws.includes(' ')) {
      msgs.push(`Indentation mixes tabs and spaces. Python counts a tab up to the next multiple of 8 columns, so with tab width ${tabSize} the indentation shown may not match how Python reads it.`);
    }
    const bidi = raw.match(BIDI_RE);
    if (bidi) {
      const codes = [...new Set(bidi.map(hex))].join(', ');
      msgs.push(`Contains invisible bidirectional control character(s) (${codes}): the text may display in a different order than it is stored ("Trojan Source").`);
    }
    return msgs;
  }

  /**
   * @returns {{ lines: string[], foldEnd: Map<number, number>, issues: Map<number, string[]> }}
   *   lines: well-formed HTML per line (spans crossing line breaks are closed and re-opened);
   *   foldEnd: start line -> last line hidden when folded;
   *   issues: line -> problem descriptions.
   */
  function analyze(html, text, { language, tabSize, tabsToSpaces }) {
    const mode = foldMode(language);
    const convertTabs = tabsToSpaces && !KEEP_TABS_LANGS.has(language);
    const rawLines = text.split('\n');
    const special = scanSpecialLines(rawLines, language);

    const issues = new Map();
    const addIssue = (ln, msg) => {
      const list = issues.get(ln) || [];
      if (!list.includes(msg)) list.push(msg);
      issues.set(ln, list);
    };

    const foldEnd = new Map();
    const addRegion = (start, last) => {
      if (last > start && (foldEnd.get(start) ?? -1) < last) foldEnd.set(start, last);
    };

    const lines = [];
    const openTags = []; // raw "<span ...>" strings currently open
    const openInfo = []; // { cls, line } parallel to openTags
    const brackets = []; // { ch, line }
    const xmlTags = []; // { name, line, preserve }
    let tag = null; // XML tag being read: { depth, text, line, first }
    let cur = '';
    let line = 0;
    let leading = true; // still inside the line's leading whitespace
    let col = 0;
    let lineHasText = false;
    let convertLine = convertTabs;
    let skipBrackets = false; // line is text the highlighter did not recognize

    const inClass = (re) => openInfo.some((o) => re.test(o.cls));

    const startLine = () => {
      leading = true;
      col = 0;
      lineHasText = false;
      const inString = inClass(STRING_RE);
      // highlight.js may briefly treat a tab-indented YAML line as part of the preceding block scalar.
      const note = inString && language !== 'yaml' ? null : special.get(line);
      const preserve = xmlTags.some((t) => t.preserve);
      skipBrackets = !!note;
      // Whitespace at the start of a line continuing a multi-line string (or <pre>, CDATA, heredoc)
      // is content, not indentation.
      convertLine = convertTabs && !inString && !note && !preserve;
      if (note) addIssue(line, note);
      if (convertTabs && !convertLine && !note && /^[ ]*\t/.test(rawLines[line] || '')) {
        const where = inString ? 'inside a multi-line string' : 'inside <pre> / xml:space="preserve" content';
        addIssue(line, `Indentation tabs kept as-is: this line is ${where}, where whitespace is content.`);
      }
    };

    const handleTag = (t) => {
      const s = t.text.trim();
      if (s.startsWith('&lt;/')) {
        const name = (/^&lt;\/\s*([^\s&]+)/.exec(s) || [])[1];
        if (!name) return;
        const lname = name.toLowerCase();
        for (let i = xmlTags.length - 1; i >= 0; i--) {
          if (xmlTags[i].name === lname) {
            addRegion(xmlTags[i].line, t.first ? t.line - 1 : t.line);
            xmlTags.length = i;
            return;
          }
        }
        addIssue(t.line, `Closing tag </${name}> has no matching opening tag; folding around it may be inaccurate.`);
      } else if (!/^&lt;[!?]/.test(s) && !s.endsWith('/&gt;')) {
        const name = (/^&lt;([^\s&/]+)/.exec(s) || [])[1];
        if (!name) return;
        const lname = name.toLowerCase();
        const preserve = PRESERVE_TAGS.has(lname) || /xml:space\s*=\s*(&quot;|&#x27;|')preserve/.test(s);
        xmlTags.push({ name: lname, line: t.line, preserve });
      }
    };

    const scanBrackets = (chunk) => {
      let seen = lineHasText;
      for (const ch of chunk) {
        if (ch === ' ' || ch === '\t') continue;
        if (OPENERS[ch]) {
          brackets.push({ ch, line });
        } else if (CLOSERS[ch]) {
          let matched = false;
          for (let i = brackets.length - 1; i >= 0; i--) {
            if (brackets[i].ch === CLOSERS[ch]) {
              // Closing bracket first on its line stays visible, like "}" in an editor.
              addRegion(brackets[i].line, seen ? line : line - 1);
              brackets.length = i;
              matched = true;
              break;
            }
          }
          if (!matched) addIssue(line, `Unmatched closing '${ch}': folding around this line may be inaccurate.`);
        }
        seen = true;
      }
    };

    startLine();
    const re = /<span[^>]*>|<\/span>|\n|[^<\n]+|</g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const tok = m[0];

      if (tok === '\n') {
        lines.push(cur + '</span>'.repeat(openTags.length));
        cur = openTags.join('');
        line++;
        if (tag) tag.text += ' ';
        startLine();
        continue;
      }

      if (tok.startsWith('<span')) {
        const cls = (/class="([^"]*)"/.exec(tok) || [])[1] || '';
        openTags.push(tok);
        openInfo.push({ cls, line });
        cur += tok;
        if (mode === 'tag' && !tag && /\bhljs-tag\b/.test(cls)) {
          tag = { depth: openTags.length, text: '', line, first: !lineHasText };
        }
        continue;
      }

      if (tok === '</span>') {
        const info = openInfo.pop();
        openTags.pop();
        cur += tok;
        if (info && COMMENT_RE.test(info.cls) && line > info.line && !inClass(COMMENT_RE)) {
          addRegion(info.line, line);
        }
        if (tag && openTags.length < tag.depth) {
          handleTag(tag);
          tag = null;
        }
        continue;
      }

      let chunk = tok;
      if (leading) {
        let i = 0;
        while (i < chunk.length && (chunk[i] === ' ' || chunk[i] === '\t')) i++;
        if (convertLine) {
          for (let k = 0; k < i; k++) {
            const n = chunk[k] === '\t' ? tabSize - (col % tabSize) : 1;
            cur += ' '.repeat(n);
            col += n;
          }
        } else {
          cur += chunk.slice(0, i);
        }
        chunk = chunk.slice(i);
        if (chunk) leading = false;
      }
      if (!chunk) continue;

      cur += chunk;
      if (tag) tag.text += chunk;
      const bracketsHere = mode === 'bracket' || mode === 'indent' || (mode === 'tag' && inClass(/\blanguage-/));
      if (bracketsHere && !skipBrackets && !inClass(NO_BRACKET_RE)) scanBrackets(chunk);
      lineHasText = true;
    }
    lines.push(cur + '</span>'.repeat(openTags.length));

    // A trailing newline at end of file should not produce an extra empty line.
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

    for (let i = 0; i < lines.length; i++) {
      for (const msg of lineChecks(rawLines[i] || '', language, tabSize)) addIssue(i, msg);
    }

    if (mode === 'indent') indentRegions(text, tabSize, addRegion);
    for (const [start, last] of foldEnd) {
      if (last >= lines.length) foldEnd.set(start, lines.length - 1);
      if (foldEnd.get(start) <= start) foldEnd.delete(start);
    }
    return { lines, foldEnd, issues };
  }

  // ---------------------------------------------------------------------------
  // Folding
  // ---------------------------------------------------------------------------

  function setFolded(start, fold) {
    const v = state.view;
    if (!v || !v.foldEnd.has(start) || v.folded.has(start) === fold) return;
    const end = v.foldEnd.get(start);
    const delta = fold ? 1 : -1;
    for (let i = start + 1; i <= end; i++) {
      v.hide[i] += delta;
      v.lineEls[i].classList.toggle('rb-hidden', v.hide[i] > 0);
    }
    if (fold) v.folded.add(start);
    else v.folded.delete(start);
    v.lineEls[start].classList.toggle('rb-folded', fold);
  }

  function onRootClick(e) {
    const arrow = e.target.closest('.rb-fold.rb-can');
    if (!arrow) return;
    const start = Number(arrow.parentElement.dataset.n) - 1;
    const v = state.view;
    const fold = !v.folded.has(start);
    if (e.altKey) {
      // Alt+click: apply to this region and everything nested in it.
      const end = v.foldEnd.get(start);
      for (const s of v.foldEnd.keys()) if (s > start && s <= end) setFolded(s, fold);
    }
    setFolded(start, fold);
  }

  function foldAll() {
    if (state.view) for (const s of state.view.foldEnd.keys()) setFolded(s, true);
    return getState();
  }

  function unfoldAll() {
    if (state.view) for (const s of [...state.view.folded]) setFolded(s, false);
    return getState();
  }

  // ---------------------------------------------------------------------------

  function escapeAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function languageName(id) {
    const lang = hljs.getLanguage(id);
    return (lang && lang.name) || id;
  }

  function getState() {
    return {
      active: state.active,
      hasSource: !!(state.original || findSource()),
      language: state.language,
      languageName: state.language ? languageName(state.language) : null,
      detectedBy: state.detectedBy,
      themeId: state.themeId,
      foldable: state.view ? state.view.foldEnd.size : 0,
      warnings: state.view ? state.warnings : 0,
    };
  }

  // ---------------------------------------------------------------------------
  // "Colorizing…" overlay (blurs the page while a long file is being rendered)
  // ---------------------------------------------------------------------------

  function showOverlay() {
    if (state.overlay) return;
    const overlay = document.createElement('div');
    overlay.className = 'rb-overlay';
    const box = document.createElement('div');
    box.className = 'rb-overlay-box';
    const spinner = document.createElement('span');
    spinner.className = 'rb-spinner';
    box.append(spinner, 'Colorizing…');
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    state.overlay = overlay;
  }

  function hideOverlay() {
    if (state.overlay) state.overlay.remove();
    state.overlay = null;
  }

  /** Resolves once the browser has painted a frame (so the overlay is visible before blocking work). */
  function nextPaint() {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 100); // rAF may not fire in a hidden tab
      requestAnimationFrame(() => setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 0));
    });
  }

  const CHUNK_LINES = 200;

  // East Asian wide / fullwidth characters take two columns in a monospace font.
  const isWide = (c) => (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf)
    || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f)
    || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6);

  /** Display width (in columns) of the longest line, with tabs expanded, and its index. */
  function maxColumns(text, tabSize) {
    let max = 0;
    let index = 0;
    text.split('\n').forEach((line, n) => {
      if (line.length * tabSize <= max) return; // cannot be longer, skip the exact count
      let col = 0;
      for (let i = 0; i < line.length; i++) {
        const c = line.charCodeAt(i);
        col += c === 9 ? tabSize - (col % tabSize) : isWide(c) ? 2 : 1;
      }
      if (col > max) {
        max = col;
        index = n;
      }
    });
    return { max, index };
  }

  function syncPageBackground() {
    const code = state.root && state.root.querySelector('code');
    if (code) document.documentElement.style.setProperty('--rb-page-bg', getComputedStyle(code).backgroundColor);
  }

  /**
   * @param {{language: string, lineNumbers: boolean, wrap: boolean, folding: boolean,
   *          tabsToSpaces: boolean, tabSize: number, themeId: string}} opts
   * Theme CSS must already be inserted (the popup does that via chrome.scripting.insertCSS).
   */
  /** Show the overlay and wait until it is painted; the popup calls this before swapping theme CSS. */
  async function begin() {
    if (!state.overlay) {
      showOverlay();
      await nextPaint();
    }
    // If the popup is closed before apply() arrives, don't leave the overlay up.
    clearTimeout(state.overlayWatchdog);
    state.overlayWatchdog = setTimeout(hideOverlay, 4000);
    return true;
  }

  async function apply(opts) {
    clearTimeout(state.overlayWatchdog);
    try {
      return await applyInner(opts);
    } finally {
      hideOverlay();
    }
  }

  async function applyInner(opts) {
    if (!state.original) {
      const pre = findSource();
      if (!pre) {
        return { ok: false, error: 'No raw text found on this page (expected a plain-text document such as a GitLab "raw" file).' };
      }
      state.original = pre;
      state.text = pre.textContent.replace(/\r\n?/g, '\n');
    }
    const text = state.text;
    const tabSize = Math.min(Math.max(Number(opts.tabSize) || 4, 1), 16);

    // Only the theme changed: the theme CSS was already swapped, nothing to re-render.
    const renderKey = JSON.stringify([opts.language, !!opts.lineNumbers, !!opts.wrap, opts.folding !== false,
      !!opts.tabsToSpaces, tabSize]);
    if (state.active && state.root && state.renderKey === renderKey) {
      syncPageBackground();
      state.themeId = opts.themeId || null;
      return { ok: true, state: getState() };
    }

    await begin();
    render(opts, text, tabSize);
    state.renderKey = renderKey;
    state.themeId = opts.themeId || null;
    return { ok: true, state: getState() };
  }

  function render(opts, text, tabSize) {
    let language;
    let by;
    if (opts.language && opts.language !== 'auto' && hljs.getLanguage(opts.language)) {
      // "HTML" in the popup is highlight.js's XML grammar (html is an alias of xml).
      language = opts.language === 'html' ? 'xml' : opts.language;
      by = 'manual selection';
    } else {
      ({ language, by } = detectLanguage(text));
    }

    if (!state.cache || state.cache.language !== language) {
      const html = hljs.highlight(text, { language, ignoreIllegals: true }).value;
      state.cache = { language, html };
    }
    const { lines, foldEnd, issues } = analyze(state.cache.html, text, {
      language,
      tabSize,
      tabsToSpaces: !!opts.tabsToSpaces,
    });
    const folding = opts.folding !== false;

    const root = document.createElement('div');
    root.className = 'rb-root';
    root.classList.toggle('rb-wrap', !!opts.wrap);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = `hljs language-${language}`;
    code.classList.toggle('rb-num', !!opts.lineNumbers);
    code.classList.toggle('rb-folding', folding);
    code.style.setProperty('--rb-gutter', `${String(lines.length).length}ch`);
    code.style.setProperty('tab-size', String(tabSize));

    // Lines are grouped into chunks with `content-visibility: auto`, so the browser only lays out
    // the chunks near the viewport (a big win for long files). Chunks are size-contained, so give
    // the code a width that fits the longest line; otherwise long lines would be clipped.
    const longest = opts.wrap ? null : maxColumns(text, tabSize);
    if (longest) code.style.setProperty('--rb-maxch', String(longest.max));

    const parts = [];
    for (let i = 0; i < lines.length; i++) {
      if (i % CHUNK_LINES === 0) parts.push(i ? '</div><div class="rb-chunk">' : '<div class="rb-chunk">');
      const msgs = issues.get(i);
      const warn = issues.size === 0 ? ''
        : msgs ? `<span class="rb-wcol rb-warn" title="${escapeAttr(msgs.join('\n\n'))}"></span>`
          : '<span class="rb-wcol"></span>';
      const arrow = folding ? `<span class="rb-fold${foldEnd.has(i) ? ' rb-can' : ''}"></span>` : '';
      parts.push(`<div class="rb-line" data-n="${i + 1}">${warn}${arrow}<span class="rb-lc">${lines[i]}</span></div>`);
    }
    if (parts.length) parts.push('</div>');
    code.innerHTML = parts.join('');
    pre.appendChild(code);
    root.appendChild(pre);
    root.addEventListener('click', onRootClick);

    state.warnings = issues.size;
    const previouslyFolded = state.view && state.view.language === language ? state.view.folded : new Set();
    state.view = {
      language,
      lineEls: Array.from(code.querySelectorAll('.rb-line')),
      foldEnd: folding ? foldEnd : new Map(),
      hide: new Int32Array(lines.length),
      folded: new Set(),
    };
    for (const s of previouslyFolded) setFolded(s, true);

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    if (state.root) state.root.replaceWith(root);
    else document.body.appendChild(root);
    state.root = root;

    document.documentElement.classList.add('rb-active');
    if (!opts.wrap && state.view.lineEls.length) {
      // Measure the gutter (numbers, "!" and fold columns) on the first line; only lays out one chunk.
      const lc = state.view.lineEls[0].querySelector('.rb-lc');
      const gutter = lc.getBoundingClientRect().left - code.getBoundingClientRect().left;
      code.style.setProperty('--rb-gutter-px', `${Math.ceil(gutter) + 40}px`);
      // Glyphs wider than estimated (emoji, fallback fonts) must not be clipped: measure the
      // longest line itself (lays out just its chunk) and widen the code if needed.
      const longLine = state.view.lineEls[Math.min(longest.index, state.view.lineEls.length - 1)];
      const needed = gutter + longLine.querySelector('.rb-lc').scrollWidth + 40;
      if (needed > code.getBoundingClientRect().width) code.style.minWidth = `${Math.ceil(needed)}px`;
    }
    // Make the whole page (incl. overscroll area) use the theme's background.
    syncPageBackground();
    window.scrollTo(scrollX, scrollY);

    state.active = true;
    state.language = language;
    state.detectedBy = by;
  }

  function restore() {
    if (state.root) {
      state.root.remove();
      state.root = null;
    }
    state.view = null;
    state.renderKey = null;
    document.documentElement.classList.remove('rb-active');
    document.documentElement.style.removeProperty('--rb-page-bg');
    state.active = false;
    state.themeId = null;
    return { ok: true, state: getState() };
  }

  window.__rawBeautifier = { begin, apply, restore, getState, foldAll, unfoldAll };
})();
