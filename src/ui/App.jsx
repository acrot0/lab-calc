import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FlaskConical, Droplets, TestTube2, ArrowLeftRight, Activity, Percent } from 'lucide-react';
import {
  resolveStore, loadHistory, saveHistory, addEntry, removeEntry, clearHistory, planReplay,
} from './history.mjs';
import WeighTab from './tabs/WeighTab.jsx';
import DiluteTab from './tabs/DiluteTab.jsx';
import BufferTab from './tabs/BufferTab.jsx';
import SeriesTab from './tabs/SeriesTab.jsx';
import ConvertTab from './tabs/ConvertTab.jsx';
import PhTab from './tabs/PhTab.jsx';
import PercentTab from './tabs/PercentTab.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';

const TABS = [
  { id: 'weigh', label: '称量配制', icon: FlaskConical, Component: WeighTab },
  { id: 'dilute', label: '稀释', icon: Droplets, Component: DiluteTab },
  { id: 'buffer', label: '缓冲液', icon: TestTube2, Component: BufferTab },
  { id: 'series', label: '梯度稀释', icon: Droplets, Component: SeriesTab },
  { id: 'ph', label: 'pH 计算', icon: Activity, Component: PhTab },
  { id: 'percent', label: '百分比配制', icon: Percent, Component: PercentTab },
  { id: 'convert', label: '单位换算', icon: ArrowLeftRight, Component: ConvertTab },
];

export default function App() {
  const [tab, setTab] = useState('weigh');
  const [entries, setEntries] = useState([]);
  // `restored` is handed to the active tab as initial values. Bumping `nonce`
  // forces a remount, so restoring the same calculation twice still resets the
  // form rather than being ignored as an unchanged prop.
  const [restored, setRestored] = useState(null);
  const [nonce, setNonce] = useState(0);
  const store = useMemo(() => resolveStore(), []);

  useEffect(() => { setEntries(loadHistory(store)); }, [store]);
  useEffect(() => { saveHistory(store, entries); }, [store, entries]);

  const record = useCallback((entry) => {
    setEntries((prev) => addEntry(prev, entry));
  }, []);

  const remove = useCallback((id) => setEntries((prev) => removeEntry(prev, id)), []);
  const clear = useCallback(() => setEntries(clearHistory()), []);

  const replay = useCallback((entry) => {
    const plan = planReplay(entry);
    if (!plan) return;
    setTab(plan.tab);
    setRestored(plan.inputs);
    setNonce((k) => k + 1);
  }, []);

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const ActiveTab = active.Component;

  return (
    <div className="app">
      <header className="app-head">
        <h1>Lab Calc</h1>
      </header>
      <p className="tagline">实验室溶液计算 · 每次计算自动留存，随时可查</p>

      <div className="tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            className="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="split">
        <div>
          <ActiveTab key={nonce} onRecord={record} restored={restored} />
        </div>
        <HistoryPanel entries={entries} onRemove={remove} onReplay={replay} onClear={clear} />
      </div>
    </div>
  );
}
