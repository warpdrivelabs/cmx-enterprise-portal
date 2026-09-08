#!/usr/bin/env python3
"""
Regenerate UI5/Fiori component metadata from installed .d.ts files.
Rewrites attrs, slots, extraEvents while preserving tag/group/label/description/
isVoid/canNest/defaults/styleGroups/slotOrientation.
"""
import os, re, json
from pathlib import Path

BASE       = Path(__file__).resolve().parent.parent
UI5_DIST   = BASE / 'node_modules/@ui5/webcomponents/dist'
FIORI_DIST = BASE / 'node_modules/@ui5/webcomponents-fiori/dist'
BASE_DIST  = BASE / 'node_modules/@ui5/webcomponents-base/dist'
META_UI5   = BASE / 'src/metadata/tags/ui5'
META_FIORI = BASE / 'src/metadata/tags/fiori'

UI5_PRESET = {'click','focusin','focusout','keydown','keyup'}

# ── 1. Load all enum types ────────────────────────────────────────────────────
def load_enums():
    enums = {}
    for type_dir in [UI5_DIST/'types', FIORI_DIST/'types', BASE_DIST/'types']:
        if not type_dir.exists(): continue
        for f in type_dir.glob('*.d.ts'):
            txt = f.read_text()
            for m in re.finditer(r'declare enum (\w+)\s*\{([^}]+)\}', txt, re.DOTALL):
                vals = [v for _, v in re.findall(r'(\w+)\s*=\s*"([^"]+)"', m.group(2))]
                if vals:
                    enums[m.group(1)] = vals
    return enums

# Manual overrides: metadata tag name → actual .d.ts path
MANUAL_OVERRIDES = {
    'ui5-badge':                       UI5_DIST  / 'Tag.d.ts',           # ui5-badge is an alias for ui5-tag style
    'ui5-notification-list-item':      FIORI_DIST / 'NotificationListItem.d.ts',
    'ui5-notification-list-group-item':FIORI_DIST / 'NotificationListGroupItem.d.ts',
    'ui5-notification-action':         FIORI_DIST / 'NotificationAction.d.ts',
}

# ── 2. Build tag → .d.ts mapping by scanning all dist JS files ───────────────
def build_tag_map():
    tag_map = {}
    for dist_dir in [UI5_DIST, FIORI_DIST]:
        for js in dist_dir.glob('*.js'):
            txt = js.read_text()
            # Format 1: customElement({ tag: "ui5-foo", ... })
            m = re.search(r'tag:\s*["\']([^"\']+)["\']', txt)
            if not m:
                # Format 2: customElement("ui5-foo")
                m = re.search(r'customElement\(\s*["\']([^"\']+)["\']', txt)
            if m:
                dts = js.with_suffix('.d.ts')
                if dts.exists():
                    tag_map[m.group(1)] = dts
    return tag_map

# ── 3. camelCase → kebab-case ─────────────────────────────────────────────────
def to_kebab(s):
    s = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1-\2', s)
    s = re.sub(r'([a-z0-9])([A-Z])', r'\1-\2', s)
    return s.lower()

# ── 4. Parse a .d.ts file ─────────────────────────────────────────────────────
def parse_dts(path, enums):
    txt = path.read_text()

    # ── 4a. Events ─────────────────────────────────────────────────────────────
    events = []
    # direct block: eventDetails: { "name": Type; ... }
    em = re.search(r'eventDetails\s*:\s*\{([^}]+)\}', txt, re.DOTALL)
    if em:
        events = [n for n in re.findall(r'"([^"]+)"\s*:', em.group(1)) if not n.startswith('_')]
    # inherited: eventDetails: Parent["eventDetails"]  → resolve via parent .d.ts
    elif re.search(r'eventDetails\s*:\s*\w+\["eventDetails"\]', txt):
        parent_m = re.search(r'eventDetails\s*:\s*(\w+)\["eventDetails"\]', txt)
        if parent_m:
            parent_name = parent_m.group(1)
            # search for parent .d.ts in same directories
            for dist_dir in [UI5_DIST, FIORI_DIST]:
                parent_dts = dist_dir / f'{parent_name}.d.ts'
                if parent_dts.exists():
                    ptxt = parent_dts.read_text()
                    pem = re.search(r'eventDetails\s*:\s*\{([^}]+)\}', ptxt, re.DOTALL)
                    if pem:
                        events = [n for n in re.findall(r'"([^"]+)"\s*:', pem.group(1)) if not n.startswith('_')]
                    break

    # ── 4b. Named slots ────────────────────────────────────────────────────────
    # Named slot:   slotName: Slot<Type>    → keep camelCase to match shadow DOM template
    # Default slot: slotName: DefaultSlot<Type>  → represented as "" in array
    slots = []
    for m in re.finditer(r'^\s{4}(\w+)\s*:\s*(Slot|DefaultSlot)<', txt, re.MULTILINE):
        if m.group(2) == 'DefaultSlot':
            slots.append('')   # default slot → no slot="" attribute needed
        else:
            slots.append(m.group(1))   # keep camelCase — must match <slot name="..."> in shadow DOM
    # If the only entry is the default slot, no slot-zone UI is needed
    if slots == ['']:
        slots = []

    # ── 4c. Public properties ──────────────────────────────────────────────────
    props = []
    seen_names = set()

    # Split by JSDoc block openings
    parts = re.split(r'/\*\*', txt)
    for part in parts[1:]:
        end = part.find('*/')
        if end == -1: continue
        comment = part[:end]
        rest    = part[end+2:]

        # Visibility filter
        if '@private' in comment or '@protected' in comment:
            continue
        if '@public' not in comment:
            continue

        # Default value hint
        dv_m = re.search(r'@default\s+(\S+)', comment)
        default_hint = dv_m.group(1) if dv_m else None

        # First non-blank line after comment
        lines = [l.strip() for l in rest.split('\n') if l.strip()]
        if not lines: continue
        decl = lines[0].rstrip(';')

        # Skip methods, getters/setters, statics, abstract, re-exports
        if re.match(r'^(set|get|static|abstract|export|import|declare|type|interface|class)\b', decl):
            continue
        if '(' in decl:
            continue
        # Skip eventDetails and complex object properties
        if re.match(r'^event', decl) or 'eventDetails' in decl:
            continue

        # Match: propName?: type  or  propName: type
        pm = re.match(r'^(_?[a-zA-Z]\w*)\??\s*:\s*(.+)$', decl)
        if not pm: continue

        raw_name  = pm.group(1)
        prop_type = pm.group(2).strip().rstrip(';')

        # Skip private names and noAttribute-only props
        if raw_name.startswith('_'): continue
        # Skip non-attribute properties (complex objects, functions)
        if re.match(r'^\(', prop_type) or prop_type.startswith('{'): continue
        # Skip known non-attribute UI5 internal props
        skip_props = {'eventDetails','accessibilityAttributes','nativeAttributes',
                      'forcedTabIndex','mediaRange','onPhone','onDesktop',
                      'buttonTitle','iconSettings','isTouch','cancelAction',
                      'isSpacePressed','accessibleNameRefTexts','deactivate',
                      'clickHandlerAttached','onclickBound'}
        if raw_name in skip_props: continue

        attr_name = to_kebab(raw_name)
        if attr_name in seen_names: continue
        seen_names.add(attr_name)

        # ── Determine attribute type ──────────────────────────────────────────
        attr = None

        # Boolean
        if prop_type == 'boolean' or re.match(r'^boolean\b', prop_type):
            attr = {'name': attr_name, 'label': attr_name, 'type': 'boolean'}

        # Template literal enum: `${EnumName}`
        elif '`${' in prop_type:
            em2 = re.search(r'\$\{(\w+)\}', prop_type)
            if em2:
                opts = enums.get(em2.group(1), [])
                if opts:
                    attr = {'name': attr_name, 'label': attr_name, 'type': 'select', 'options': opts}
                else:
                    attr = {'name': attr_name, 'label': attr_name, 'type': 'text', 'placeholder': ''}

        # Bare enum name (PascalCase)
        elif re.match(r'^[A-Z]\w*$', prop_type):
            opts = enums.get(prop_type, [])
            if opts:
                attr = {'name': attr_name, 'label': attr_name, 'type': 'select', 'options': opts}
            else:
                attr = {'name': attr_name, 'label': attr_name, 'type': 'text', 'placeholder': ''}

        # Number
        elif re.match(r'^number\b', prop_type) and 'string' not in prop_type:
            ph = default_hint if (default_hint and default_hint not in ('undefined','false','true','""',"''",'{}','[]')) else ''
            attr = {'name': attr_name, 'label': attr_name, 'type': 'text', 'placeholder': ph}

        # String (or string | undefined, etc.)
        elif 'string' in prop_type:
            attr = {'name': attr_name, 'label': attr_name, 'type': 'text', 'placeholder': ''}

        if attr:
            props.append(attr)

    return props, events, slots

# ── 5. Add placeholder labels for well-known attrs ────────────────────────────
PLACEHOLDER_HINTS = {
    'accessible-name': '无障碍名称',
    'accessible-name-ref': '关联元素ID',
    'accessible-description': '无障碍描述',
    'placeholder': '请输入...',
    'value': '',
    'label': '',
    'text': '',
    'tooltip': '提示文本',
    'icon': 'sap-icon://add',
    'opener': '元素ID',
    'initial-focus': '元素ID',
    'name': '',
    'id-prefix': '',
    'header-text': '',
    'min': '0',
    'max': '100',
    'step': '1',
    'value-precision': '0',
    'min-date': 'YYYY-MM-DD',
    'max-date': 'YYYY-MM-DD',
    'format-pattern': 'yyyy-MM-dd',
    'date-value': 'YYYY-MM-DD',
    'for-component': '组件ID',
    'title-text': '标题',
    'subtitle-text': '副标题',
    'count': '0',
    'delay': '0',
    'loading-delay': '1000',
    'color': '#FFFFFF',
}

def apply_hints(props):
    for p in props:
        if p.get('type') == 'text' and not p.get('placeholder'):
            hint = PLACEHOLDER_HINTS.get(p['name'])
            if hint:
                p['placeholder'] = hint
    return props

# ── 6. Main ───────────────────────────────────────────────────────────────────
enums   = load_enums()
tag_map = build_tag_map()
tag_map.update({k: v for k, v in MANUAL_OVERRIDES.items() if v.exists()})

print(f'Loaded {len(enums)} enum types, {len(tag_map)} component .d.ts files\n')

total_updated = 0
total_missing = []

for meta_dir in [META_UI5, META_FIORI]:
    for meta_file in sorted(meta_dir.glob('*.json')):
        meta = json.loads(meta_file.read_text(encoding='utf-8'))
        tag  = meta['tag']

        dts = tag_map.get(tag)
        if not dts:
            total_missing.append(tag)
            continue

        props, events, slots = parse_dts(dts, enums)
        props = apply_hints(props)

        # Preserve fields that should not be overwritten
        KEEP = {'tag','group','label','description','isVoid','canNest',
                'styleGroups','defaults','slotOrientation','eventPreset','paletteIcon'}

        new_meta = {k: meta[k] for k in KEEP if k in meta}
        new_meta['attrs']       = props
        new_meta['slots']       = slots
        new_meta['extraEvents'] = [e for e in events if e not in UI5_PRESET]

        meta_file.write_text(
            json.dumps(new_meta, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )
        total_updated += 1
        print(f'✓  {tag:45s}  attrs={len(props):3d}  slots={slots}  extra={[e for e in events if e not in UI5_PRESET]}')

print(f'\n── Done: updated {total_updated} files ──')
if total_missing:
    print(f'No .d.ts found for: {total_missing}')
