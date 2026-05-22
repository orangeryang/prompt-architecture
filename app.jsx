const { useState, useRef, useEffect, useLayoutEffect } = React;

const INITIAL = [
  {
    id: 'sec-system',
    kind: 'system',
    title: 'system',
    subtitle: 'API system 字段 · 最佳缓存前缀',
    color: '#FFE0EC',
    deep: '#FFB3CB',
    ink: '#A14D6E',
    hue: 0,
    items: [
      { id: 's1', title: 'personality', desc: 'static · 全用户共享，最佳缓存前缀' },
      { id: 's2', title: 'global memory', desc: 'static-ish · 累积更新但稳定' },
      { id: 's3', title: 'context', desc: '场景描述 / 模型定义 / 时间' },
    ],
  },
  {
    id: 'sec-history',
    kind: 'history',
    title: 'session history',
    subtitle: '会话消息序列',
    color: '#D6F5E3',
    deep: '#9EDDBC',
    ink: '#3F7A5B',
    hue: 150,
    items: [
      { id: 'h1', title: 'role / content ...', desc: '每段带 turn_hash' },
    ],
  },
  {
    id: 'sec-tools',
    kind: 'tools',
    title: 'tools (API 顶层)',
    subtitle: '静态工具集',
    color: '#E0E2FA',
    deep: '#B6BCEE',
    ink: '#525AAA',
    hue: 280,
    items: [
      { id: 't1', title: '静态工具集', desc: '放 API 顶层 tools 数组，参与前缀缓存' },
    ],
  },
  {
    id: 'sec-inject',
    kind: 'inject',
    title: '末尾临时注入',
    subtitle: '塞进最后一条 user message',
    color: '#FFE2C6',
    deep: '#FFC089',
    ink: '#A35820',
    hue: 60,
    items: [
      { id: 'i1', title: 'dynamic tools', desc: '动态工具描述，破坏前缀缓存不可入 API tools' },
      { id: 'i2', title: 'current state', desc: 'background task / todo / 当前 role' },
      { id: 'i3', title: 'session memory', desc: '可选：临时记忆，压缩历史时落入' },
    ],
  },
];

// New-card default title by section kind. Heuristic falls back to title text
// match when `kind` is missing (e.g. user-renamed default sections).
const KIND_DEFAULT_TITLE = {
  system:  'instruction',
  history: 'role / content',
  tools:   'tool definition',
  inject:  'dynamic context',
};
const guessKind = (sec) => {
  if (sec?.kind) return sec.kind;
  const t = (sec?.title || '').toLowerCase();
  if (/system/.test(t)) return 'system';
  if (/history|session|会话|历史/.test(t)) return 'history';
  if (/tool|工具/.test(t)) return 'tools';
  if (/inject|注入|临时|末尾/.test(t)) return 'inject';
  return null;
};
const cardDefaultTitleFor = (sec) =>
  KIND_DEFAULT_TITLE[guessKind(sec)] || 'role / content';

// (LIBRARY removed — we now generate a default card title per section kind)

// Fallback hue lookup for sections loaded from older localStorage without a `hue` field.
const KNOWN_HUES = {
  '#FFE0EC': 0,
  '#D6F5E3': 150,
  '#E0E2FA': 280,
  '#FFE2C6': 60,
  '#FCE4F1': 340,
  '#E4F4FB': 215,
  '#FBF1D8': 85,
  '#F0E8FA': 295,
};
const getHue = (s) => (typeof s.hue === 'number' ? s.hue : (KNOWN_HUES[s.color] ?? 0));

// Generate a macaron palette at a given hue, matching the L/C of the originals.
const paletteFromHue = (h) => ({
  color: `oklch(0.92 0.05 ${h})`,
  deep:  `oklch(0.82 0.11 ${h})`,
  ink:   `oklch(0.50 0.11 ${h})`,
  hue:   h,
});

// Pick the hue that sits at the midpoint of the largest gap in the
// current set of section hues — i.e. maximally distant from neighbors.
const pickNewHue = (sections) => {
  const hues = sections.map(getHue);
  if (hues.length === 0) return 200;
  const sorted = [...hues].sort((a, b) => a - b);
  let bestGap = -1;
  let bestHue = (sorted[0] + 180) % 360;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    const b = i === sorted.length - 1 ? sorted[0] + 360 : sorted[i + 1];
    const gap = b - a;
    if (gap > bestGap) {
      bestGap = gap;
      bestHue = ((a + b) / 2) % 360;
    }
  }
  return Math.round(bestHue);
};

let nextId = 1000;
const uid = () => `card-${++nextId}`;
let nextSecId = 1000;
const secUid = () => `sec-${++nextSecId}`;

const EMPTY_DRAG = {
  kind: null,        // 'move' | 'add' | 'sec-move' | 'sec-add' | 'stash-card' | 'stash-mod'
  dragId: null,      // card id (for 'move')
  fromSec: null,     // source section id (for 'move')
  dragSecId: null,   // section id (for 'sec-move')
  template: null,    // library template (for 'add')
  stashIndex: null,  // index into stash list (for 'stash-card' / 'stash-mod')
  stashItem: null,   // payload (for 'stash-card' / 'stash-mod')
  altCopy: false,
  over: null,        // { type, id?, secId? }
};

function Editable({ value, onChange, className, placeholder, multiline }) {
  const ref = useRef(null);
  const isEditing = useRef(false);

  useEffect(() => {
    if (!isEditing.current && ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onFocus={() => { isEditing.current = true; }}
      onBlur={(e) => {
        isEditing.current = false;
        onChange(e.currentTarget.innerText);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
    />
  );
}

function Card({ item, section, onChange, drag, setDrag, dragHandled }) {
  const isCardKind = drag.kind === 'move' || drag.kind === 'add' || drag.kind === 'stash-card';
  const dragging = drag.kind === 'move' && drag.dragId === item.id && !drag.altCopy;
  const dropTarget = isCardKind && drag.over && drag.over.type === 'card' && drag.over.id === item.id && drag.dragId !== item.id;

  return (
    <div
      className={`card ${dragging ? 'card--dragging' : ''} ${dropTarget ? 'card--drop' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        setDrag({ ...EMPTY_DRAG, kind: 'move', dragId: item.id, fromSec: section.id });
      }}
      onDragOver={(e) => {
        if (!drag.kind) return;
        // Section-level drags: let event bubble up to section
        if (drag.kind === 'sec-move' || drag.kind === 'sec-add' || drag.kind === 'stash-mod') return;

        e.preventDefault();
        e.stopPropagation();
        const alt = e.altKey;
        const wantCopy = drag.kind === 'add' || (drag.kind === 'move' && alt);
        e.dataTransfer.dropEffect = wantCopy ? 'copy' : 'move';
        setDrag((d) => {
          const o = d.over;
          if (o && o.type === 'card' && o.id === item.id && o.secId === section.id && d.altCopy === alt) {
            return d;
          }
          return { ...d, altCopy: alt, over: { type: 'card', id: item.id, secId: section.id } };
        });
        dragHandled.current = true;
      }}
      style={{ '--card-deep': section.deep, '--card-ink': section.ink }}
    >
      <div className="card__handle" aria-hidden>
        <span></span><span></span><span></span>
        <span></span><span></span><span></span>
      </div>
      <div className="card__body">
        <Editable
          className="card__title"
          value={item.title}
          placeholder="模块名"
          onChange={(v) => onChange({ ...item, title: v })}
        />
        <Editable
          className="card__desc"
          value={item.desc}
          placeholder="描述这块的作用…"
          multiline
          onChange={(v) => onChange({ ...item, desc: v })}
        />
      </div>
    </div>
  );
}

function Section({ section, onUpdate, drag, setDrag, dragHandled }) {
  const updateItem = (item) => {
    onUpdate({
      ...section,
      items: section.items.map((it) => (it.id === item.id ? item : it)),
    });
  };

  const isCardKind = drag.kind === 'move' || drag.kind === 'add' || drag.kind === 'stash-card';
  const isSecKind = drag.kind === 'sec-move' || drag.kind === 'sec-add' || drag.kind === 'stash-mod';

  const cardDropActive = isCardKind &&
    drag.over &&
    drag.over.secId === section.id &&
    (drag.over.type === 'section' || section.items.length === 0);

  const isSecSourceDragging = drag.kind === 'sec-move' && drag.dragSecId === section.id;
  const isSecInsertTarget = isSecKind &&
    drag.over && drag.over.type === 'sec-insert' && drag.over.secId === section.id &&
    !(drag.kind === 'sec-move' && drag.dragSecId === section.id);

  return (
    <section
      className={[
        'section',
        cardDropActive ? 'section--drop' : '',
        isSecSourceDragging ? 'section--sec-source' : '',
        isSecInsertTarget ? 'section--sec-insert' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--sec-color': section.color, '--sec-deep': section.deep, '--sec-ink': section.ink }}
      onDragOver={(e) => {
        if (!drag.kind) return;

        // Section drag: this section is a "insert before" target
        if (isSecKind) {
          if (drag.kind === 'sec-move' && drag.dragSecId === section.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = drag.kind === 'sec-add' ? 'copy' : 'move';
          setDrag((d) => {
            if (d.over && d.over.type === 'sec-insert' && d.over.secId === section.id) return d;
            return { ...d, over: { type: 'sec-insert', secId: section.id } };
          });
          dragHandled.current = true;
          return;
        }

        // Card drag: this section is a drop area for empty/append
        e.preventDefault();
        const alt = e.altKey;
        const wantCopy = drag.kind === 'add' || (drag.kind === 'move' && alt);
        e.dataTransfer.dropEffect = wantCopy ? 'copy' : 'move';        setDrag((d) => {
          const o = d.over;
          if (o && o.type === 'card' && o.secId === section.id) {
            if (d.altCopy === alt) return d;
            return { ...d, altCopy: alt };
          }
          if (o && o.type === 'section' && o.secId === section.id && d.altCopy === alt) return d;
          return { ...d, altCopy: alt, over: { type: 'section', id: null, secId: section.id } };
        });
        dragHandled.current = true;
      }}
    >
      <header
        className="section__head"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', section.id);
          setDrag({ ...EMPTY_DRAG, kind: 'sec-move', dragSecId: section.id });
        }}
      >
        <div className="section__pip" />
        <div className="section__titles">
          <Editable
            className="section__title"
            value={section.title}
            onChange={(v) => onUpdate({ ...section, title: v })}
          />
          <Editable
            className="section__sub"
            value={section.subtitle}
            placeholder="可选副标题…"
            onChange={(v) => onUpdate({ ...section, subtitle: v })}
          />
        </div>
        <div className="section__count">{section.items.length}</div>
      </header>

      <div className="section__cards">
        {section.items.map((it) => (
          <Card
            key={it.id}
            item={it}
            section={section}
            onChange={updateItem}
            drag={drag}
            setDrag={setDrag}
            dragHandled={dragHandled}
          />
        ))}
        {section.items.length === 0 && (
          <div className="empty">把卡片拖到这里 →</div>
        )}
      </div>
    </section>
  );
}

function StackEnd({ drag, setDrag, dragHandled }) {
  const visible = drag.kind === 'sec-move' || drag.kind === 'sec-add' || drag.kind === 'stash-mod';
  const active = drag.over && drag.over.type === 'sec-end';
  if (!visible) return null;
  return (
    <div
      className={`stack-end ${active ? 'stack-end--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = drag.kind === 'sec-add' ? 'copy' : 'move';
        setDrag((d) => {
          if (d.over && d.over.type === 'sec-end') return d;
          return { ...d, over: { type: 'sec-end' } };
        });
        dragHandled.current = true;
      }}
    >
      <span className="stack-end__line" />
      <span className="stack-end__txt">放到最后</span>
      <span className="stack-end__line" />
    </div>
  );
}

// (LIBRARY / LibraryItem / ModuleItem / StashItem removed — tray no longer has popovers)

// ---------- Bottom tray tiles ----------

function ActionTile({ kind, drag, setDrag, dragHandled }) {
  const acceptsCurrent = (() => {
    if (drag.altCopy) return false;
    if (kind === 'trash') return drag.kind === 'move' || drag.kind === 'sec-move' || drag.kind === 'stash-card' || drag.kind === 'stash-mod';
    if (kind === 'copy')  return drag.kind === 'move';
    return false;
  })();
  const active = drag.over && drag.over.type === kind;

  const meta = kind === 'trash'
    ? {
        label: '删除',
        sub: '不可恢复',
        subActive:
          drag.kind === 'sec-move' ? '松手删掉整个模块'
          : (drag.kind === 'stash-card' || drag.kind === 'stash-mod') ? '从暂存区移除'
          : '松手就删掉',
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        ),
      }
    : {
        label: '复制',
        sub: '原位复制一份',
        subActive: '松手就复制',
        icon: (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="12" height="12" rx="2.5" />
            <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
          </svg>
        ),
      };

  return (
    <div
      className={`tile tile--${kind} ${acceptsCurrent ? 'tile--accepting' : ''} ${active ? 'tile--active' : ''}`}
      onDragOver={(e) => {
        if (!acceptsCurrent || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = kind === 'copy' ? 'copy' : 'move';
        setDrag((d) => {
          if (d.over && d.over.type === kind && !d.altCopy) return d;
          return { ...d, altCopy: false, over: { type: kind } };
        });
        dragHandled.current = true;
      }}
    >
      <div className="tile__icon" aria-hidden>{meta.icon}</div>
      <div className="tile__txt">
        <div className="tile__label">{meta.label}</div>
        <div className="tile__sub">{active ? meta.subActive : meta.sub}</div>
      </div>
    </div>
  );
}

function AddTile({ drag, setDrag }) {
  const [mode, setMode] = useState('card'); // 'card' | 'module'
  const sourcing = drag.kind === 'add' || drag.kind === 'sec-add';

  const makeGhost = (m) => {
    const g = document.createElement('div');
    g.style.cssText = "position:absolute;left:-9999px;top:-9999px;font-family:'Quicksand',-apple-system,sans-serif;";
    if (m === 'card') {
      const inner = document.createElement('div');
      inner.style.cssText = "width:210px;padding:14px 16px 14px 14px;background:#fff;border-radius:14px;border:1.5px solid #B6BCEE;box-shadow:0 14px 30px rgba(74,58,58,0.25);display:flex;gap:10px;align-items:flex-start;";
      inner.innerHTML = '<div style="width:4px;align-self:stretch;background:#B6BCEE;border-radius:2px;margin-top:2px;"></div><div><div style="font-weight:700;font-size:14px;color:#4A3A3A;">role / content</div><div style="font-size:11.5px;color:#8A7878;margin-top:3px;">新卡片</div></div>';
      g.appendChild(inner);
    } else {
      const inner = document.createElement('div');
      inner.style.cssText = "width:260px;padding:16px 18px;background:linear-gradient(180deg,#FFF6E8 0%,#FFEAC8 100%);border-radius:14px;border:1.5px solid #FFC089;box-shadow:0 14px 30px rgba(74,58,58,0.25);display:flex;gap:12px;align-items:center;";
      inner.innerHTML = '<div style="width:14px;height:14px;border-radius:50%;background:#FFC089;box-shadow:0 0 0 4px rgba(255,255,255,0.75);flex-shrink:0;"></div><div><div style="font-weight:700;font-size:15px;color:#A35820;">新模块</div><div style="font-size:11.5px;color:#A35820;opacity:0.7;margin-top:2px;">拖到模块之间或末尾</div></div>';
      g.appendChild(inner);
    }
    document.body.appendChild(g);
    return g;
  };

  return (
    <div
      className={`add-tile add-tile--${mode} ${sourcing ? 'add-tile--sourcing' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        const isModule = mode === 'module';
        e.dataTransfer.setData('text/plain', isModule ? 'new-module' : 'new-card');
        const ghost = makeGhost(mode);
        e.dataTransfer.setDragImage(ghost.firstChild, 40, 28);
        setTimeout(() => { try { document.body.removeChild(ghost); } catch (_) {} }, 0);
        setDrag({ ...EMPTY_DRAG, kind: isModule ? 'sec-add' : 'add', template: null });
      }}
    >
      <div
        className="add-tile__half add-tile__half--card"
        onPointerEnter={() => setMode('card')}
      >
        <div className="add-tile__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5" width="16" height="14" rx="3" />
            <path d="M8 10h8M8 14h5" />
          </svg>
        </div>
        <div className="add-tile__label">新卡片</div>
      </div>
      <div
        className="add-tile__half add-tile__half--module"
        onPointerEnter={() => setMode('module')}
      >
        <div className="add-tile__icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="4" rx="1.5" />
            <rect x="3" y="11" width="18" height="4" rx="1.5" />
            <rect x="3" y="17" width="18" height="3" rx="1.5" opacity="0.4" />
          </svg>
        </div>
        <div className="add-tile__label">新模块</div>
      </div>
    </div>
  );
}

function StashChip({ kind, index, payload, drag, setDrag }) {
  const isCard = kind === 'card';
  const dragging =
    (isCard ? drag.kind === 'stash-card' : drag.kind === 'stash-mod') &&
    drag.stashIndex === index;
  const deep = isCard ? (payload.deep || '#C8B6E2') : payload.deep;
  const surface = isCard ? '#FFFFFF' : payload.color;
  return (
    <div
      className={`chip chip--${kind} ${dragging ? 'chip--dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `stash:${kind}:${index}`);
        setDrag({
          ...EMPTY_DRAG,
          kind: isCard ? 'stash-card' : 'stash-mod',
          stashIndex: index,
          stashItem: payload,
        });
      }}
      style={{ '--chip-deep': deep, '--chip-surface': surface }}
      title={payload.title || ''}
    >
      <span className="chip__strip" />
      <div className="chip__body">
        <div className="chip__title">
          {payload.title || (isCard ? '(未命名卡片)' : '(未命名模块)')}
        </div>
        <div className="chip__meta">
          {isCard
            ? (payload.desc || '卡片')
            : `模块 · ${payload.items?.length || 0} 张卡`}
        </div>
      </div>
      {!isCard && <span className="chip__corner" aria-hidden />}
    </div>
  );
}

function StashStrip({ stash, drag, setDrag, dragHandled }) {
  const acceptsCurrent =
    !drag.altCopy && (drag.kind === 'move' || drag.kind === 'sec-move');
  const active = drag.over && drag.over.type === 'stash';
  const total = stash.cards.length + stash.modules.length;

  // Poker-hand stacking: each chip reserves `peek` px of horizontal space.
  // Peek has a comfortable max; as count grows past what fits, it shrinks.
  const rowRef = useRef(null);
  const [peek, setPeek] = useState(60);
  const CHIP_W = 168;
  const MAX_PEEK = 64;
  const MIN_PEEK = 18;

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (total <= 1 || w <= 0) { setPeek(MAX_PEEK); return; }
      // total stacked width = CHIP_W + peek * (total - 1)  must fit w
      const fit = (w - CHIP_W) / (total - 1);
      setPeek(Math.max(MIN_PEEK, Math.min(MAX_PEEK, fit)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [total]);

  return (
    <div
      className={[
        'stash-strip',
        acceptsCurrent ? 'stash-strip--accepting' : '',
        active ? 'stash-strip--active' : '',
        total === 0 ? 'stash-strip--empty' : '',
      ].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        if (!acceptsCurrent || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setDrag((d) => {
          if (d.over && d.over.type === 'stash') return d;
          return { ...d, altCopy: false, over: { type: 'stash' } };
        });
        dragHandled.current = true;
      }}
    >
      <div className="stash-strip__label">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 7H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1z" />
          <path d="M3 11v8a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8" />
          <path d="M10 14h4" />
        </svg>
        <span>暂存</span>
        {total > 0 && <span className="stash-strip__count">{total}</span>}
      </div>

      <div
        className="stash-strip__row"
        ref={rowRef}
        style={{ '--chip-peek': `${peek}px`, '--chip-w': `${CHIP_W}px` }}
      >
        {total === 0 ? (
          <div className="stash-strip__empty-txt">
            {acceptsCurrent ? '松手就收起来···' : '拖卡片或模块过来临时放一边'}
          </div>
        ) : (
          <>
            {stash.cards.map((c, i) => (
              <StashChip key={`c-${c.id || i}`} kind="card" index={i} payload={c} drag={drag} setDrag={setDrag} />
            ))}
            {stash.modules.map((m, i) => (
              <StashChip key={`m-${m.id || i}`} kind="mod" index={i} payload={m} drag={drag} setDrag={setDrag} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Tray({ stash, drag, setDrag, dragHandled }) {
  return (
    <div className="tray-wrap" aria-label="操作托盘">
      <div className="tray">
        <AddTile drag={drag} setDrag={setDrag} />
        <ActionTile kind="copy" drag={drag} setDrag={setDrag} dragHandled={dragHandled} />
        <StashStrip stash={stash} drag={drag} setDrag={setDrag} dragHandled={dragHandled} />
        <ActionTile kind="trash" drag={drag} setDrag={setDrag} dragHandled={dragHandled} />
      </div>
    </div>
  );
}

function App() {
  const [sections, setSections] = useState(() => {
    const saved = localStorage.getItem('promt-sections-v2');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return INITIAL;
  });

  const [stash, setStash] = useState(() => {
    const saved = localStorage.getItem('promt-stash-v1');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          cards: Array.isArray(parsed?.cards) ? parsed.cards : [],
          modules: Array.isArray(parsed?.modules) ? parsed.modules : [],
        };
      } catch (e) {}
    }
    return { cards: [], modules: [] };
  });

  useEffect(() => {
    localStorage.setItem('promt-sections-v2', JSON.stringify(sections));
  }, [sections]);

  useEffect(() => {
    localStorage.setItem('promt-stash-v1', JSON.stringify(stash));
  }, [stash]);

  const [drag, setDrag] = useState(EMPTY_DRAG);
  const dragHandled = useRef(false);

  const updateSection = (sec) => {
    setSections((prev) => prev.map((s) => (s.id === sec.id ? sec : s)));
  };

  const onDropGlobal = (e) => {
    e.preventDefault();
    const { kind, over } = drag;
    if (!kind || !over) {
      setDrag(EMPTY_DRAG);
      return;
    }

    // -------- Stash drops --------
    if (over.type === 'stash') {
      if (kind === 'move') {
        // remove from section, push to stash.cards
        let removed = null;
        setSections((prev) =>
          prev.map((s) => {
            if (s.id !== drag.fromSec) return s;
            const found = s.items.find((it) => it.id === drag.dragId);
            if (found) removed = found;
            return { ...s, items: s.items.filter((it) => it.id !== drag.dragId) };
          })
        );
        // schedule stash add after state pass
        setTimeout(() => {
          if (removed) setStash((p) => ({ ...p, cards: [removed, ...p.cards] }));
        }, 0);
      } else if (kind === 'sec-move') {
        let removed = null;
        setSections((prev) => {
          const found = prev.find((s) => s.id === drag.dragSecId);
          if (found) removed = found;
          return prev.filter((s) => s.id !== drag.dragSecId);
        });
        setTimeout(() => {
          if (removed) setStash((p) => ({ ...p, modules: [removed, ...p.modules] }));
        }, 0);
      }
      setDrag(EMPTY_DRAG);
      return;
    }

    // -------- Dragging FROM stash --------
    if (kind === 'stash-card') {
      const item = drag.stashItem;
      if (item && (over.type === 'card' || over.type === 'section')) {
        const overSec = over.secId;
        const overCardId = over.type === 'card' ? over.id : null;
        const placed = { id: uid(), title: item.title, desc: item.desc };
        setSections((prev) =>
          prev.map((s) => {
            if (s.id !== overSec) return s;
            if (overCardId == null) {
              return { ...s, items: [...s.items, placed] };
            }
            const idx = s.items.findIndex((it) => it.id === overCardId);
            const newItems = [...s.items];
            newItems.splice(idx === -1 ? newItems.length : idx, 0, placed);
            return { ...s, items: newItems };
          })
        );
        // remove from stash
        setStash((p) => ({
          ...p,
          cards: p.cards.filter((_, i) => i !== drag.stashIndex),
        }));
      } else if (over.type === 'trash') {
        setStash((p) => ({
          ...p,
          cards: p.cards.filter((_, i) => i !== drag.stashIndex),
        }));
      }
      setDrag(EMPTY_DRAG);
      return;
    }

    if (kind === 'stash-mod') {
      const item = drag.stashItem;
      if (item && (over.type === 'sec-insert' || over.type === 'sec-end')) {
        const restored = {
          ...item,
          id: secUid(),
          items: (item.items || []).map((it) => ({ ...it, id: uid() })),
        };
        setSections((prev) => {
          if (over.type === 'sec-end') return [...prev, restored];
          const idx = prev.findIndex((s) => s.id === over.secId);
          if (idx === -1) return [...prev, restored];
          const next = [...prev];
          next.splice(idx, 0, restored);
          return next;
        });
        setStash((p) => ({
          ...p,
          modules: p.modules.filter((_, i) => i !== drag.stashIndex),
        }));
      } else if (over.type === 'trash') {
        setStash((p) => ({
          ...p,
          modules: p.modules.filter((_, i) => i !== drag.stashIndex),
        }));
      }
      setDrag(EMPTY_DRAG);
      return;
    }

    // -------- Section-level ops --------
    if (kind === 'sec-move') {
      if (over.type === 'trash') {
        setSections((prev) => prev.filter((s) => s.id !== drag.dragSecId));
      } else if (over.type === 'sec-insert') {
        const dragId = drag.dragSecId;
        const beforeId = over.secId;
        if (dragId !== beforeId) {
          setSections((prev) => {
            const item = prev.find((s) => s.id === dragId);
            if (!item) return prev;
            const without = prev.filter((s) => s.id !== dragId);
            const tIdx = without.findIndex((s) => s.id === beforeId);
            if (tIdx === -1) return prev;
            const next = [...without];
            next.splice(tIdx, 0, item);
            return next;
          });
        }
      } else if (over.type === 'sec-end') {
        setSections((prev) => {
          const item = prev.find((s) => s.id === drag.dragSecId);
          if (!item) return prev;
          const without = prev.filter((s) => s.id !== drag.dragSecId);
          return [...without, item];
        });
      }
      setDrag(EMPTY_DRAG);
      return;
    }

    if (kind === 'sec-add') {
      if (over.type === 'sec-insert' || over.type === 'sec-end') {
        setSections((prev) => {
          const palette = paletteFromHue(pickNewHue(prev));
          const newSec = {
            id: secUid(),
            title: '新模块',
            subtitle: '',
            color: palette.color,
            deep: palette.deep,
            ink: palette.ink,
            hue: palette.hue,
            items: [],
          };
          if (over.type === 'sec-end') {
            return [...prev, newSec];
          }
          const idx = prev.findIndex((s) => s.id === over.secId);
          if (idx === -1) return [...prev, newSec];
          const next = [...prev];
          next.splice(idx, 0, newSec);
          return next;
        });
      }
      setDrag(EMPTY_DRAG);
      return;
    }

    // -------- Card-level ops --------
    if (kind === 'move' && over.type === 'trash') {
      setSections((prev) =>
        prev.map((s) =>
          s.id === drag.fromSec ? { ...s, items: s.items.filter((it) => it.id !== drag.dragId) } : s
        )
      );
    } else if (kind === 'move' && over.type === 'copy') {
      setSections((prev) =>
        prev.map((s) => {
          if (s.id !== drag.fromSec) return s;
          const idx = s.items.findIndex((it) => it.id === drag.dragId);
          if (idx === -1) return s;
          const src = s.items[idx];
          const clone = { id: uid(), title: src.title, desc: src.desc };
          const newItems = [...s.items];
          newItems.splice(idx + 1, 0, clone);
          return { ...s, items: newItems };
        })
      );
    } else if (kind === 'move' && (over.type === 'card' || over.type === 'section')) {
      const fromSec = drag.fromSec;
      const overSec = over.secId;
      const overCardId = over.type === 'card' ? over.id : null;
      const dragId = drag.dragId;
      const copy = !!drag.altCopy;

      if (!copy && dragId === overCardId) {
        setDrag(EMPTY_DRAG);
        return;
      }

      setSections((prev) => {
        const fromSection = prev.find((s) => s.id === fromSec);
        if (!fromSection) return prev;
        const sourceItem = fromSection.items.find((it) => it.id === dragId);
        if (!sourceItem) return prev;

        const placed = copy
          ? { id: uid(), title: sourceItem.title, desc: sourceItem.desc }
          : sourceItem;

        let next = prev;
        if (!copy) {
          next = prev.map((s) =>
            s.id === fromSec ? { ...s, items: s.items.filter((it) => it.id !== dragId) } : s
          );
        }

        next = next.map((s) => {
          if (s.id !== overSec) return s;
          if (overCardId == null) {
            return { ...s, items: [...s.items, placed] };
          }
          const idx = s.items.findIndex((it) => it.id === overCardId);
          const newItems = [...s.items];
          newItems.splice(idx === -1 ? newItems.length : idx, 0, placed);
          return { ...s, items: newItems };
        });

        return next;
      });
    } else if (kind === 'add' && (over.type === 'card' || over.type === 'section')) {
      const overSec = over.secId;
      const overCardId = over.type === 'card' ? over.id : null;

      setSections((prev) => {
        const target = prev.find((s) => s.id === overSec);
        if (!target) return prev;
        const newItem = { id: uid(), title: cardDefaultTitleFor(target), desc: '' };
        return prev.map((s) => {
          if (s.id !== overSec) return s;
          if (overCardId == null) {
            return { ...s, items: [...s.items, newItem] };
          }
          const idx = s.items.findIndex((it) => it.id === overCardId);
          const newItems = [...s.items];
          newItems.splice(idx === -1 ? newItems.length : idx, 0, newItem);
          return { ...s, items: newItems };
        });
      });
    }

    setDrag(EMPTY_DRAG);
  };

  const reset = () => {
    if (confirm('重置成默认结构？在暂存区的条目不会动。')) {
      setSections(INITIAL);
      setDrag(EMPTY_DRAG);
    }
  };

  return (
    <div
      className={`page ${drag.kind ? 'page--dragging' : ''}`}
      onDrop={onDropGlobal}
      onDragOver={(e) => {
        if (!drag.kind) return;
        e.preventDefault();
        // If no inner target captured this event, clear stale `over`
        if (!dragHandled.current) {
          setDrag((d) => (d.over ? { ...d, over: null } : d));
        }
        dragHandled.current = false;
      }}
      onDragEnd={() => setDrag(EMPTY_DRAG)}
    >
      <header className="topbar">
        <div className="topbar__logo">
          <span className="dot dot--p" />
          <span className="dot dot--m" />
          <span className="dot dot--l" />
          <span className="dot dot--o" />
        </div>
        <div className="topbar__title">
          <h1>prompt architecture</h1>
          <p>双击编辑 · 拖拽重排 · 按住 ⌥ Option / Alt 拖拽复制</p>
        </div>
        <button className="topbar__reset" onClick={reset}>↺ 恢复默认</button>
      </header>

      <div className="layout">
        <main className="stack">
          {sections.map((s) => (
            <Section
              key={s.id}
              section={s}
              onUpdate={updateSection}
              drag={drag}
              setDrag={setDrag}
              dragHandled={dragHandled}
            />
          ))}
          <StackEnd drag={drag} setDrag={setDrag} dragHandled={dragHandled} />
        </main>
      </div>

      <Tray stash={stash} drag={drag} setDrag={setDrag} dragHandled={dragHandled} />

      <footer className="foot">
        <span>🍡 macaron edition</span>
        <span>·</span>
        <span>状态自动保存在本地</span>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
