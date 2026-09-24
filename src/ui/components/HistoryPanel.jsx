import React, { useState, useMemo } from 'react';
import { History, Search, Trash2, RotateCcw } from 'lucide-react';
import { filterHistory } from '../history.mjs';

export default function HistoryPanel({ entries, onRemove, onReplay, onClear }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterHistory(entries, query), [entries, query]);

  return (
    <div className="card">
      <div className="history-head">
        <h2><History size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden="true" />计算记录</h2>
        {entries.length > 0 && (
          <button className="link-btn" onClick={onClear}>全部清除</button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="search">
          <Search size={14} aria-hidden="true" />
          <label className="sr-only" htmlFor="hist-search">搜索计算记录</label>
          <input
            id="hist-search"
            type="search"
            placeholder="搜索化学式或数值…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty">
          还没有记录。<br />
          每次计算都会自动留在这里，<br />
          下次想知道「上次怎么配的」随时可查。
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">没有匹配「{query}」的记录。</div>
      ) : (
        <div className="history-list">
          {shown.map((e) => (
            <div className="history-item" key={e.id}>
              <div className="body">
                <div className="summary">{e.summary}</div>
                <div className="when">{new Date(e.at).toLocaleString('zh-CN')}</div>
              </div>
              <button
                className="icon-btn"
                title="重新载入这次计算的参数"
                aria-label={`重新载入：${e.summary}`}
                onClick={() => onReplay(e)}
              >
                <RotateCcw size={14} aria-hidden="true" />
              </button>
              <button
                className="icon-btn"
                title="删除这条记录"
                aria-label={`删除：${e.summary}`}
                onClick={() => onRemove(e.id)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

