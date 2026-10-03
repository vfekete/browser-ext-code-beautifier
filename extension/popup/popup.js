'use strict';

const THEMES = [
  { group: null, items: [['none', 'No highlighting (show as-is)']] },
  {
    group: 'Dark',
    items: [
      ['github-dark', 'GitHub Dark'],
      ['github-dark-dimmed', 'GitHub Dark Dimmed'],
      ['atom-one-dark', 'Atom One Dark'],
      ['vs2015', 'Visual Studio Dark (VS2015)'],
      ['monokai-sublime', 'Monokai Sublime'],
      ['dracula', 'Dracula'],
      ['nord', 'Nord'],
      ['tokyo-night-dark', 'Tokyo Night Dark'],
      ['solarized-dark', 'Solarized Dark'],
      ['gruvbox-dark-medium', 'Gruvbox Dark'],
      ['night-owl', 'Night Owl'],
      ['stackoverflow-dark', 'Stack Overflow Dark'],
    ],
  },
  {
    group: 'Light',
    items: [
      ['github', 'GitHub Light'],
      ['atom-one-light', 'Atom One Light'],
      ['vs', 'Visual Studio Light'],
      ['intellij-light', 'IntelliJ Light'],
      ['xcode', 'Xcode'],
      ['tokyo-night-light', 'Tokyo Night Light'],
      ['solarized-light', 'Solarized Light'],
      ['gruvbox-light-medium', 'Gruvbox Light'],
      ['stackoverflow-light', 'Stack Overflow Light'],
    ],
  },
];

const LANGUAGES = [
  ['auto', 'Auto-detect'],
  ['plaintext', 'Plain text'],
  ['apache', 'Apache config'],
  ['armasm', 'ARM Assembly'],
  ['awk', 'Awk'],
  ['bash', 'Bash / Shell script'],
  ['c', 'C'],
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['clojure', 'Clojure'],
  ['cmake', 'CMake'],
  ['css', 'CSS'],
  ['dart', 'Dart'],
  ['diff', 'Diff / Patch'],
  ['dockerfile', 'Dockerfile'],
  ['dos', 'Batch (cmd)'],
  ['elixir', 'Elixir'],
  ['erlang', 'Erlang'],
  ['fsharp', 'F#'],
  ['go', 'Go'],
  ['gradle', 'Gradle'],
  ['graphql', 'GraphQL'],
  ['groovy', 'Groovy'],
  ['haskell', 'Haskell'],
  ['html', 'HTML'],
  ['ini', 'INI / TOML'],
  ['java', 'Java'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['julia', 'Julia'],
  ['kotlin', 'Kotlin'],
  ['latex', 'LaTeX'],
  ['less', 'Less'],
  ['llvm', 'LLVM IR'],
  ['lua', 'Lua'],
  ['makefile', 'Makefile'],
  ['markdown', 'Markdown'],
  ['matlab', 'MATLAB'],
  ['nginx', 'Nginx config'],
  ['nix', 'Nix'],
  ['objectivec', 'Objective-C'],
  ['ocaml', 'OCaml'],
  ['perl', 'Perl'],
  ['pgsql', 'PostgreSQL'],
  ['php', 'PHP'],
  ['powershell', 'PowerShell'],
  ['properties', 'Properties'],
  ['protobuf', 'Protocol Buffers'],
  ['python', 'Python'],
  ['r', 'R'],
  ['ruby', 'Ruby'],
  ['rust', 'Rust'],
  ['scala', 'Scala'],
  ['scss', 'SCSS'],
  ['shell', 'Shell session'],
  ['sql', 'SQL'],
  ['swift', 'Swift'],
  ['tcl', 'Tcl'],
  ['typescript', 'TypeScript'],
  ['vbnet', 'VB.NET'],
  ['verilog', 'Verilog'],
  ['vhdl', 'VHDL'],
  ['vim', 'Vim script'],
  ['wasm', 'WebAssembly'],
  ['x86asm', 'x86 Assembly'],
  ['xml', 'XML'],
  ['yaml', 'YAML'],
];

const EXTRA_LANGUAGE_FILES = [
  'apache', 'armasm', 'awk', 'clojure', 'cmake', 'dart', 'dockerfile', 'dos', 'elixir', 'erlang',
  'fsharp', 'gradle', 'groovy', 'haskell', 'julia', 'latex', 'llvm', 'matlab', 'nginx', 'nix',
  'ocaml', 'pgsql', 'powershell', 'properties', 'protobuf', 'scala', 'tcl', 'verilog', 'vhdl',
  'vim', 'x86asm',
].map((l) => `lib/languages/${l}.min.js`);

const SCRIPT_FILES = ['lib/highlight.min.js', ...EXTRA_LANGUAGE_FILES, 'content/beautifier.js'];
const BASE_CSS = 'content/beautifier.css';
const themeCss = (id) => `themes/${id}.css`;

const DEFAULTS = {
  theme: 'github-dark',
  language: 'auto',
  lineNumbers: false,
  wrap: false,
  folding: true,
  tabsToSpaces: false,
  tabSize: 4,
};

const $ = (id) => document.getElementById(id);
const ui = {
  theme: $('theme'),
  language: $('language'),
  lineNumbers: $('lineNumbers'),
  wrap: $('wrap'),
  folding: $('folding'),
  tabsToSpaces: $('tabsToSpaces'),
  tabSize: $('tabSize'),
  colorize: $('colorize'),
  restore: $('restore'),
  status: $('status'),
  foldActions: $('foldActions'),
  foldAll: $('foldAll'),
  unfoldAll: $('unfoldAll'),
};
const SETTING_INPUTS = ['theme', 'language', 'lineNumbers', 'wrap', 'folding', 'tabsToSpaces', 'tabSize'];

let tabId = null;
let pageActive = false; // is the current tab currently colorized?

function fillSelect(select, groups) {
  for (const { group, items } of groups) {
    const parent = group ? document.createElement('optgroup') : select;
    if (group) {
      parent.label = group;
      select.appendChild(parent);
    }
    for (const [value, label] of items) {
      parent.appendChild(new Option(label, value));
    }
  }
}

function setStatus(text, kind = '') {
  ui.status.textContent = text;
  ui.status.className = `status ${kind}`.trim();
}

function currentSettings() {
  return {
    theme: ui.theme.value,
    language: ui.language.value,
    lineNumbers: ui.lineNumbers.checked,
    wrap: ui.wrap.checked,
    folding: ui.folding.checked,
    tabsToSpaces: ui.tabsToSpaces.checked,
    tabSize: Number(ui.tabSize.value),
  };
}

function describe(state) {
  const folds = state.foldable ? ` ${state.foldable} foldable regions.` : '';
  const warn = state.warnings ? ` ${state.warnings} line(s) flagged with "!" (hover for details).` : '';
  return `Highlighted as ${state.languageName} (${state.detectedBy}).${folds}${warn}`;
}

function setActive(active, state) {
  pageActive = active;
  ui.foldActions.hidden = !(active && state && state.foldable > 0);
}

/** Run a method of window.__rawBeautifier in the page. */
async function callPage(method, arg = null) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (m, a) => window.__rawBeautifier[m](a),
    args: [method, arg],
  });
  return res.result;
}

async function ensureInjected() {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => typeof window.__rawBeautifier !== 'undefined',
  });
  if (!res.result) {
    await chrome.scripting.executeScript({ target: { tabId }, files: SCRIPT_FILES });
  }
}

async function colorize() {
  const s = currentSettings();
  if (s.theme === 'none') {
    await showOriginal();
    return;
  }

  setStatus('Highlighting…');
  await ensureInjected();
  const before = await callPage('getState');
  // Show "Colorizing…" before any work: on long files even a theme CSS swap takes a moment.
  // Only when the page has a view to blur or the base CSS (overlay styles) is already there.
  if (before.active) await callPage('begin');

  // Base CSS stays inserted while the page is colorized (removing it would briefly show the original).
  if (!before.active) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: [BASE_CSS] });
  }
  // Add the new theme before removing the old one, so the page is never unstyled.
  if (before.themeId !== s.theme) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: [themeCss(s.theme)] });
    if (before.themeId) {
      await chrome.scripting.removeCSS({ target: { tabId }, files: [themeCss(before.themeId)] });
    }
  }

  const res = await callPage('apply', { ...s, themeId: s.theme });

  if (!res.ok) {
    await chrome.scripting.removeCSS({ target: { tabId }, files: [themeCss(s.theme), BASE_CSS] });
    setActive(false);
    setStatus(res.error, 'error');
    return;
  }
  setActive(true, res.state);
  setStatus(describe(res.state), 'ok');
}

async function showOriginal() {
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => (window.__rawBeautifier ? window.__rawBeautifier.getState() : null),
  });
  const state = probe.result;
  if (state && state.active) {
    await callPage('restore');
    const files = [BASE_CSS];
    if (state.themeId) files.push(themeCss(state.themeId));
    await chrome.scripting.removeCSS({ target: { tabId }, files });
  }
  setActive(false);
  setStatus('Showing original page content.');
}

async function run(action) {
  ui.colorize.disabled = ui.restore.disabled = true;
  try {
    await action();
  } catch (e) {
    setStatus(e.message || String(e), 'error');
  } finally {
    ui.colorize.disabled = ui.restore.disabled = false;
  }
}

// Colorize runs one at a time; changes made meanwhile trigger one more run with the latest settings.
let colorizing = false;
let colorizeAgain = false;
async function requestColorize() {
  if (colorizing) {
    colorizeAgain = true;
    return;
  }
  colorizing = true;
  do {
    colorizeAgain = false;
    await run(colorize);
  } while (colorizeAgain);
  colorizing = false;
}

async function onSettingChanged() {
  const s = currentSettings();
  await chrome.storage.local.set({ settings: s });
  // Once the page has been colorized, settings changes apply live.
  if (pageActive) requestColorize();
}

async function init() {
  fillSelect(ui.theme, THEMES);
  fillSelect(ui.language, [{ group: null, items: LANGUAGES }]);

  const { settings } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...settings };
  ui.theme.value = s.theme;
  if (!ui.theme.value) ui.theme.value = DEFAULTS.theme;
  ui.language.value = s.language;
  if (!ui.language.value) ui.language.value = 'auto';
  ui.lineNumbers.checked = s.lineNumbers;
  ui.wrap.checked = s.wrap;
  ui.folding.checked = s.folding;
  ui.tabsToSpaces.checked = s.tabsToSpaces;
  ui.tabSize.value = String(s.tabSize);
  if (!ui.tabSize.value) ui.tabSize.value = String(DEFAULTS.tabSize);

  for (const name of SETTING_INPUTS) ui[name].addEventListener('change', onSettingChanged);
  ui.colorize.addEventListener('click', requestColorize);
  ui.restore.addEventListener('click', () => run(showOriginal));
  ui.foldAll.addEventListener('click', () => run(() => callPage('foldAll')));
  ui.unfoldAll.addEventListener('click', () => run(() => callPage('unfoldAll')));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;

  // Probe the page: is it a raw text document, and is it already colorized?
  try {
    const [probe] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        hasSource: !!document.querySelector('body > pre'),
        contentType: document.contentType,
        state: window.__rawBeautifier ? window.__rawBeautifier.getState() : null,
      }),
    });
    const info = probe.result;
    if (info.state && info.state.active) {
      setActive(true, info.state);
      setStatus(describe(info.state), 'ok');
    } else if (info.hasSource) {
      setStatus(`Raw text detected (${info.contentType}). Click Colorize.`);
    } else {
      setStatus('This page does not look like a raw text file.', 'error');
    }
  } catch (e) {
    ui.colorize.disabled = ui.restore.disabled = true;
    const url = (tab && tab.url) || '';
    const hint = url.startsWith('file:')
      ? ' Enable "Allow access to file URLs" for this extension in chrome://extensions.'
      : '';
    setStatus(`Cannot run on this page.${hint}`, 'error');
  }
}

init();
