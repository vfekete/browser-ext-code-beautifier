# Raw Beautifier (Chrome extension)

Syntax-highlights raw text files (e.g. GitLab "Open raw" pages) on demand.

Co-authored: Claude code

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` directory.
3. Click the puzzle icon in the toolbar and **pin** "Raw Beautifier".
4. Optional: for local `file://` files, open the extension's **Details** and enable **Allow access to file URLs**.

## Usage

Open a raw file, click the toolbar icon, pick a theme and press **Colorize**.

- **Highlighting** – 21 dark/light themes, or *No highlighting (show as-is)*.
- **Language** – *Auto-detect* (file name/extension from the URL, then content analysis) or a fixed language.
- **Show line numbers** / **Wrap long lines**.
- **Folding arrows** – click ▾/▸ next to a line to collapse/expand it (Alt+click also applies to nested
  sections). **Collapse all** / **Expand all** appear in the popup when the page has foldable sections.
  Regions come from matching `{}` `[]` `()` (C-like languages, JSON, …), XML/HTML tags, indentation
  (Python, YAML) and multi-line comments. Brackets inside strings and comments are ignored.
- **Indentation** – *Convert indentation tabs to spaces* replaces tabs in leading whitespace only, and not on
  lines that continue a multi-line string, nor in Makefiles (recipes need tabs). *Spaces per indent level*
  (default 4) is the tab width used for the conversion and for displaying any remaining tabs.
- **Show original** restores the untouched page (no highlighting, no indentation changes).

### Problem markers

Lines the colorized view could render wrongly or change get a small orange **!** marker in the gutter; hover it
for the explanation. The popup status shows how many lines are flagged. Currently detected:

- text the highlighter does not recognize and shows as code: Perl heredocs, Bash heredocs with a quoted
  delimiter (`<<'EOF'`), XML `<![CDATA[ … ]]>`, tab-indented lines in YAML (tabs are kept, brackets there are
  ignored for folding);
- indentation tabs deliberately *not* converted because the whitespace is content (multi-line strings,
  heredocs, `<pre>` / `xml:space="preserve"`);
- unmatched closing brackets or tags (folding may be inaccurate);
- indentation whose apparent depth depends on the tab width (spaces before a tab; Python mixing tabs and spaces);
- invisible bidirectional control characters ("Trojan Source").

Settings are remembered. Nothing happens until you press Colorize; after that, changing a setting
re-renders the page immediately (a theme-only change just swaps colors). While a long file is being
rendered, the page is blurred with a "Colorizing…" indicator. Line numbers are not included when copying text.

## Layout

```
extension/
  manifest.json           Manifest V3, permissions: activeTab, scripting, storage
  popup/                  toolbar popup (settings + actions)
  content/beautifier.js   injected on demand: detection, rendering, restore
  content/beautifier.css  layout + line-number gutter
  lib/                    highlight.js 11.12.0 (BSD-3-Clause) + extra language grammars
  themes/                 highlight.js themes
  icons/
```

The extension only runs on a tab when you click its icon (`activeTab`). It has no background access to any site.
