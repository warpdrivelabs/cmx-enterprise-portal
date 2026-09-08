export function isDarkUi5Theme() {
  const theme = String(
    sessionStorage.getItem('__designer_theme__')
    || document.documentElement.getAttribute('data-sap-ui-theme')
    || document.documentElement.getAttribute('theme')
    || '',
  ).toLowerCase();
  if (theme) return /(_dark|_hcb|dark|black)$/.test(theme) || theme.includes('_hcb');
  return true;
}

export function cmxCodeMirrorTheme(EditorView) {
  const dark = isDarkUi5Theme();
  const common = {
    '&': {
      height: '100%',
    },
    '.cm-content': {
      padding: '6px 0',
    },
    '&.cm-focused': {
      outline: '1px solid var(--sapField_Active_BorderColor, var(--sapHighlightColor, #0070f2))',
    },
  };
  if (dark) return EditorView.theme(common, { dark: true });
  return EditorView.theme({
    ...common,
    '&': {
      ...common['&'],
      color: 'var(--sapTextColor, #32363a)',
      backgroundColor: 'var(--sapField_Background, var(--sapBaseColor, #fff))',
    },
    '.cm-content': {
      ...common['.cm-content'],
      caretColor: 'var(--sapField_TextColor, var(--sapTextColor, #32363a))',
    },
    '.cm-editor': {
      backgroundColor: 'var(--sapField_Background, var(--sapBaseColor, #fff))',
    },
    '.cm-scroller': {
      backgroundColor: 'var(--sapField_Background, var(--sapBaseColor, #fff))',
    },
    '.cm-gutters, .cm-gutter, .cm-lineNumbers': {
      backgroundColor: 'var(--sapGroup_TitleBackground, var(--sapField_Background, #f7f7f7))',
      color: 'var(--sapContent_LabelColor, #6a6d70)',
    },
    '.cm-gutters': {
      borderRight: '1px solid var(--sapField_BorderColor, #d9d9d9)',
    },
    '.cm-gutterElement': {
      backgroundColor: 'transparent',
      color: 'var(--sapContent_LabelColor, #6a6d70)',
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: 'var(--sapContent_NonInteractiveIconColor, #6a6d70)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--sapList_SelectionBackgroundColor, rgba(0,112,242,.08))',
      color: 'var(--sapTextColor, #32363a)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--sapList_SelectionBackgroundColor, rgba(0,112,242,.08))',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--sapSelectedColor, rgba(0,112,242,.22))',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--sapPopover_Background, var(--sapGroup_ContentBackground, #fff))',
      color: 'var(--sapTextColor, #32363a)',
      border: '1px solid var(--sapField_BorderColor, #d9d9d9)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--sapHighlightColor, #0070f2)',
      color: 'var(--sapContent_ContrastTextColor, #fff)',
    },
  }, { dark: false });
}

export function cmxCodeMirrorExtensions(EditorView, oneDark) {
  const dark = isDarkUi5Theme();
  return dark && oneDark
    ? [oneDark, cmxCodeMirrorTheme(EditorView)]
    : [cmxCodeMirrorTheme(EditorView)];
}
