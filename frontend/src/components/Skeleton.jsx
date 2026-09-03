import React from 'react';

export const CardSkeleton = () => (
  <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm animate-pulse">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-3 w-20 bg-slate-200 rounded"></div>
        <div className="h-7 w-28 bg-slate-200 rounded"></div>
      </div>
      <div className="w-12 h-12 bg-slate-200 rounded-xl"></div>
    </div>
    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
      <div className="h-3 w-16 bg-slate-200 rounded"></div>
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 5, cols = 5 }) => (
  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden animate-pulse">
    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
      <div className="h-4 w-32 bg-slate-200 rounded"></div>
      <div className="h-8 w-48 bg-slate-200 rounded-lg"></div>
    </div>
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className={`h-4 bg-slate-200 rounded ${
                j === 0 ? 'w-1/4' : j === 1 ? 'w-1/6' : 'flex-1'
              }`}
            ></div>
          ))}
        </div>
      ))}
    </div>
  </div>
);
