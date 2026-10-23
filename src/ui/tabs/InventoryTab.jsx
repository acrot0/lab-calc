import React, { useEffect, useMemo, useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import Card from '../components/Card.jsx';
import {
  loadInventory, saveInventory, addItem, updateItem, removeItem,
  sortForDisplay, searchInventory, expiryStatus, daysLeft,
} from '../inventory.mjs';

/**
 * The reagent inventory: where is it, is it open, has it expired.
 *
 * Not a calculator — no `onRecord`, nothing enters the history. A container
 * is edited in place, because its state (location, level, expiry) is what the
 * record *is*, unlike a calculation whose inputs are immutable once made.
 *
 * The layout follows the panel conventions already in the app: a compact
 * form for the new container, a searchable list, and status that is visible
 * without opening anything.
 */
export default function InventoryTab() {
  const { t } = useI18n();
  const [items, setItems] = useState(() => loadInventory(
    typeof localStorage !== 'undefined' ? localStorage : null,
  ));
  const [draft, setDraft] = useState({
    name: '', lot: '', location: '', openedAt: '', expiry: '', note: '',
  });
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const write = (next) => {
    setItems(next);
    setSaveFailed(!saveInventory(
      typeof localStorage !== 'undefined' ? localStorage : null,
      next,
    ));
  };

  useEffect(() => {
    if (!saveFailed) return;
    const id = setTimeout(() => setSaveFailed(false), 4000);
    return () => clearTimeout(id);
  }, [saveFailed]);

  const shown = useMemo(
    () => searchInventory(sortForDisplay(items), query),
    [items, query],
  );

  function submit(e) {
    e.preventDefault();
    if (!draft.name.trim()) return;
    write(addItem(items, draft));
    setDraft({ name: '', lot: '', location: '', openedAt: '', expiry: '', note: '' });
  }

  function set(k, v) { setDraft((d) => ({ ...d, [k]: v })); }

  return (
    <Card>
      <form className="inv-form" onSubmit={submit}>
        <label>
          <span>{t('inv.name')}</span>
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('inv.nameHint')}
            required
            aria-label={t('inv.name')}
          />
        </label>
        <div className="inv-row">
          <label>
            <span>{t('inv.lot')}</span>
            <input value={draft.lot} onChange={(e) => set('lot', e.target.value)} aria-label={t('inv.lot')} />
          </label>
          <label>
            <span>{t('inv.location')}</span>
            <input value={draft.location} onChange={(e) => set('location', e.target.value)} placeholder={t('inv.locationHint')} aria-label={t('inv.location')} />
          </label>
        </div>
        <div className="inv-row">
          <label>
            <span>{t('inv.opened')}</span>
            <input type="date" value={draft.openedAt} onChange={(e) => set('openedAt', e.target.value)} aria-label={t('inv.opened')} />
          </label>
          <label>
            <span>{t('inv.expiry')}</span>
            <input type="date" value={draft.expiry} onChange={(e) => set('expiry', e.target.value)} aria-label={t('inv.expiry')} />
          </label>
        </div>
        <label>
          <span>{t('inv.note')}</span>
          <input value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder={t('inv.noteHint')} aria-label={t('inv.note')} />
        </label>
        <button type="submit" className="primary">
          <Icons.add size={ICON_SIZE.control} aria-hidden="true" />
          {t('inv.add')}
        </button>
      </form>

      {saveFailed && <div className="inv-save-failed" role="alert">{t('inv.saveFailed')}</div>}

      {items.length > 0 && (
        <div className="search inv-search">
          <Icons.search size={ICON_SIZE.inline} aria-hidden="true" />
          <label className="sr-only" htmlFor="inv-q">{t('inv.search')}</label>
          <input
            id="inv-q"
            type="search"
            placeholder={t('inv.searchHint')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {items.length === 0 ? (
        <div className="inv-empty" role="status">{t('inv.empty')}</div>
      ) : shown.length === 0 ? (
        <div className="inv-empty" role="status">{t('inv.noMatch')}</div>
      ) : (
        <ul className="inv-list">
          {shown.map((item) => {
            const status = expiryStatus(item);
            const d = daysLeft(item.expiry);
            return (
              <li key={item.id} className={`inv-item is-${status}`}>
                {editing === item.id ? (
                  <form
                    className="inv-edit"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setEditing(null);
                    }}
                  >
                    <input
                      value={item.name}
                      aria-label={t('inv.name')}
                      onChange={(e) => write(updateItem(items, item.id, { name: e.target.value }))}
                    />
                    <input
                      value={item.lot}
                      aria-label={t('inv.lot')}
                      onChange={(e) => write(updateItem(items, item.id, { lot: e.target.value }))}
                    />
                    <input
                      value={item.location}
                      aria-label={t('inv.location')}
                      onChange={(e) => write(updateItem(items, item.id, { location: e.target.value }))}
                    />
                    <input
                      type="date"
                      value={item.expiry}
                      aria-label={t('inv.expiry')}
                      onChange={(e) => write(updateItem(items, item.id, { expiry: e.target.value }))}
                    />
                    <input
                      value={item.note}
                      aria-label={t('inv.note')}
                      onChange={(e) => write(updateItem(items, item.id, { note: e.target.value }))}
                    />
                    <button type="submit" className="control">{t('inv.done')}</button>
                  </form>
                ) : (
                  <>
                    <div className="inv-body">
                      <div className="inv-head">
                        <strong>{item.name}</strong>
                        {status !== 'none' && (
                          <span className={`inv-badge is-${status}`}>
                            {status === 'expired'
                              ? t('inv.expired')
                              : status === 'expiring'
                                ? t('inv.expiring', { n: Math.max(d ?? 0, 0) })
                                : t('inv.ok')}
                          </span>
                        )}
                      </div>
                      <div className="inv-meta">
                        {item.lot && <span>{t('inv.lotShort')}: {item.lot}</span>}
                        {item.location && <span>{t('inv.locationShort')}: {item.location}</span>}
                        {item.openedAt && <span>{t('inv.openedShort')}: {item.openedAt}</span>}
                      </div>
                      {item.note && <div className="inv-note">{item.note}</div>}
                    </div>
                    <div className="inv-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title={t('inv.edit')}
                        aria-label={`${t('inv.edit')}: ${item.name}`}
                        onClick={() => setEditing(item.id)}
                      >
                        <Icons.meta size={ICON_SIZE.inline} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t('inv.remove')}
                        aria-label={`${t('inv.remove')}: ${item.name}`}
                        onClick={() => write(removeItem(items, item.id))}
                      >
                        <Icons.remove size={ICON_SIZE.inline} aria-hidden="true" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
