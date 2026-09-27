import React, { useState, useRef, useEffect } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { MAX_GROUPS, MAX_GROUP_NAME, UNGROUPED, ALL_GROUPS } from '../groups.mjs';

/*
 * The group filter and its management.
 *
 * ## Why a row of chips rather than a `<select>`
 *
 * The count is the point. "第三章 缓冲液 · 12" tells a user at a glance which
 * experiment they have been working on and how much of it there is; a dropdown
 * showing one name tells them nothing until they open it. The list is short by
 * construction — a person has a handful of experiments, not fifty.
 *
 * ## Why creating is inline
 *
 * A modal for one text field is a lot of ceremony, and the name is usually
 * short. The input appears in place, takes Enter, and the new group is selected
 * — which is what the user was going to do next anyway.
 */

export default function GroupPicker({
  groups, counts, ungrouped, value, onChange, onCreate, onRename, onDelete,
}) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const inputRef = useRef(null);

  // Focus the input when it appears. Without this the user has to click a
  // field they just asked for.
  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  function submitCreate() {
    const name = draft.trim();
    if (name === '') { setCreating(false); setDraft(''); return; }
    const made = onCreate(name);
    setDraft('');
    setCreating(false);
    // Select what was just made: creating a group is how you file the next
    // record, so leaving the filter where it was makes the user repeat a step.
    if (made) onChange(made.id);
  }

  function submitRename() {
    const name = renameDraft.trim();
    if (name !== '' && renaming) onRename(renaming, name);
    setRenaming(null);
    setRenameDraft('');
  }

  const atCap = groups.length >= MAX_GROUPS;
  const current = groups.find((g) => g.id === value) ?? null;

  return (
    <div className="group-bar">
      <div className="group-chips" role="group" aria-label={t('history.groupLabel')}>
        <button
          type="button"
          className={`group-chip${value === ALL_GROUPS ? ' is-on' : ''}`}
          aria-pressed={value === ALL_GROUPS}
          onClick={() => onChange(ALL_GROUPS)}
        >
          {t('history.groupAll')}
        </button>
        {groups.map((g) => (
          <span key={g.id} className="group-chip-wrap">
            <button
              type="button"
              className={`group-chip${value === g.id ? ' is-on' : ''}`}
              aria-pressed={value === g.id}
              onClick={() => onChange(g.id)}
              title={g.note || undefined}
            >
              {g.name}
              <span className="group-chip-count">{counts[g.id] ?? 0}</span>
            </button>
          </span>
        ))}
        {/* The ungrouped bucket, shown only when it has something in it —
            an always-present "0" is a row of chrome that never means anything. */}
        {ungrouped > 0 && (
          <button
            type="button"
            className={`group-chip${value === UNGROUPED ? ' is-on' : ''}`}
            aria-pressed={value === UNGROUPED}
            onClick={() => onChange(UNGROUPED)}
          >
            {t('history.groupUngrouped')}
            <span className="group-chip-count">{ungrouped}</span>
          </button>
        )}
      </div>

      <div className="group-actions">
        {creating ? (
          <span className="group-new">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              maxLength={MAX_GROUP_NAME}
              placeholder={t('history.groupNamePlaceholder')}
              aria-label={t('history.groupNew')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
                if (e.key === 'Escape') { setCreating(false); setDraft(''); }
              }}
            />
            <button type="button" className="link-btn" onClick={submitCreate}>
              {t('history.groupCreate')}
            </button>
            <button type="button" className="link-btn" onClick={() => { setCreating(false); setDraft(''); }}>
              {t('history.groupCancel')}
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              className="link-btn"
              onClick={() => setCreating(true)}
              disabled={atCap}
              title={atCap ? t('history.groupTooMany', { max: MAX_GROUPS }) : undefined}
            >
              <Icons.group size={ICON_SIZE.inline} aria-hidden="true" />
              {t('history.groupNew')}
            </button>
            {/* Rename and delete only make sense with a group selected, so they
                appear only then rather than sitting disabled. */}
            {current && (
              <>
                {renaming === current.id ? (
                  <span className="group-new">
                    <input
                      type="text"
                      value={renameDraft}
                      maxLength={MAX_GROUP_NAME}
                      aria-label={t('history.groupRename')}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename();
                        if (e.key === 'Escape') { setRenaming(null); setRenameDraft(''); }
                      }}
                    />
                    <button type="button" className="link-btn" onClick={submitRename}>
                      {t('history.groupCreate')}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => { setRenaming(current.id); setRenameDraft(current.name); }}
                  >
                    {t('history.groupRename')}
                  </button>
                )}
                <button
                  type="button"
                  className="link-btn group-delete"
                  onClick={() => onDelete(current.id)}
                  title={t('history.groupDeleteHint')}
                >
                  {t('history.groupDelete')}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
