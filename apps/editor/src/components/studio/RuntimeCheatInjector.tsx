import React, { useState } from 'react';
import { SlidersIcon, ZapIcon } from '../common/Icons';

export interface RuntimeCheatInjectorProps {
  variables: Record<string, unknown>;
  onInjectVariable: (key: string, value: unknown) => void;
}

export const RuntimeCheatInjector: React.FC<RuntimeCheatInjectorProps> = ({
  variables,
  onInjectVariable,
}) => {
  const [varName, setVarName] = useState('');
  const [varValue, setVarValue] = useState('');

  const handleInject = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanKey = varName.trim();
    if (!cleanKey) return;

    let parsedValue: unknown = varValue;
    const trimmedVal = varValue.trim();

    if (trimmedVal.toLowerCase() === 'true') {
      parsedValue = true;
    } else if (trimmedVal.toLowerCase() === 'false') {
      parsedValue = false;
    } else if (!isNaN(Number(trimmedVal)) && trimmedVal !== '') {
      parsedValue = Number(trimmedVal);
    }

    onInjectVariable(cleanKey, parsedValue);
    setVarValue('');
  };

  const varEntries = Object.entries(variables || {});

  return (
    <div
      data-testid="runtime-cheat-injector"
      className="flex h-full flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-neutral-800 text-xs select-none"
    >
      {/* Left: Active Variables Watch Table */}
      <div className="flex-1 overflow-auto p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] uppercase font-semibold text-neutral-400">
            Watched VM Variables ({varEntries.length})
          </span>
        </div>

        {varEntries.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-neutral-600 font-mono text-xs">
            No active VM variables initialized.
          </div>
        ) : (
          <table data-testid="table-cheat-variables" className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-800 font-mono text-[10px] text-neutral-500 uppercase">
                <th className="py-1 px-2">Variable</th>
                <th className="py-1 px-2">Type</th>
                <th className="py-1 px-2">Current Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900 font-mono">
              {varEntries.map(([key, val]) => (
                <tr
                  key={key}
                  className="hover:bg-neutral-900/50 cursor-pointer"
                  onClick={() => {
                    setVarName(key);
                    setVarValue(String(val));
                  }}
                  title="Click to copy to inject form"
                >
                  <td className="py-1 px-2 font-semibold text-sky-400">{key}</td>
                  <td className="py-1 px-2 text-neutral-500 text-[10px]">
                    {typeof val}
                  </td>
                  <td className="py-1 px-2 text-neutral-200">
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Right: Cheat Injector Form */}
      <div className="w-full sm:w-80 p-3 bg-neutral-900/40 shrink-0">
        <form onSubmit={handleInject} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-neutral-300 font-medium text-xs">
            <SlidersIcon size={13} className="text-sky-400" />
            <span>Inject / Override Variable</span>
          </div>

          <div>
            <label className="block text-[10px] font-mono text-neutral-500 mb-1">
              Variable Name
            </label>
            <input
              type="text"
              data-testid="input-cheat-var-name"
              placeholder="e.g. affection, gold, isClear"
              value={varName}
              onChange={(e) => setVarName(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs text-white placeholder-neutral-600 focus:border-sky-500 focus:outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono text-neutral-500 mb-1">
              New Value
            </label>
            <input
              type="text"
              data-testid="input-cheat-var-value"
              placeholder="e.g. 99, true, S-Rank"
              value={varValue}
              onChange={(e) => setVarValue(e.target.value)}
              className="w-full rounded border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-xs text-white placeholder-neutral-600 focus:border-sky-500 focus:outline-none font-mono"
            />
          </div>

          <button
            type="submit"
            data-testid="btn-inject-cheat"
            disabled={!varName.trim()}
            className="mt-1 flex items-center justify-center gap-1.5 rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ZapIcon size={12} />
            <span>Inject Variable (IT-EDT-04)</span>
          </button>
        </form>
      </div>
    </div>
  );
};
