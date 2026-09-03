import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Flame,
  Wind,
  Pill,
  Clock,
  Filter,
  CheckCircle2,
  BellRing,
} from 'lucide-react';
import { ActivityLog } from '../types';

interface LogScreenProps {
  logs: ActivityLog[];
  onResolveLog?: (id: string) => void;
  onClearAll?: () => void;
}

export const LogScreen: React.FC<LogScreenProps> = ({ logs, onResolveLog }) => {
  const [filterType, setFilterType] = useState<string>('all');

  const filteredLogs = logs.filter((log) => {
    if (filterType === 'all') return true;
    if (filterType === 'ai') return log.type === 'ai_camera';
    if (filterType === 'sensors') return log.type === 'gas' || log.type === 'air' || log.type === 'climate';
    if (filterType === 'medication') return log.type === 'medication';
    if (filterType === 'alert') return log.level === 'warning' || log.level === 'danger';
    return true;
  });

  const getLogIcon = (type: ActivityLog['type'], level: ActivityLog['level']) => {
    if (level === 'danger') return <Flame className="w-5 h-5 text-red-600" />;
    if (level === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-600" />;
    switch (type) {
      case 'ai_camera':
        return <ShieldCheck className="w-5 h-5 text-emerald-600" />;
      case 'gas':
        return <Flame className="w-5 h-5 text-orange-500" />;
      case 'air':
        return <Wind className="w-5 h-5 text-blue-500" />;
      case 'medication':
        return <Pill className="w-5 h-5 text-purple-500" />;
      default:
        return <Clock className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4 pb-24 px-4 pt-2">
      {/* Title Header */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#d7e2ff] flex items-center justify-center text-[#003f87]">
              <Clock className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Nhật Ký An Toàn
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Lịch sử quan sát AI & cảm biến môi trường
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Đồng bộ thời gian thực</span>
          </div>
        </div>

        {/* 24h Summary Bar */}
        <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200/70 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-sm font-bold text-slate-800">
              Đánh giá ngày: <span className="text-emerald-700">100% An Toàn</span>
            </span>
          </div>
          <span className="text-xs font-medium text-slate-500">{logs.length} sự kiện</span>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold pl-1 shrink-0">
          <Filter className="w-3.5 h-3.5" /> Lọc:
        </div>
        {[
          { id: 'all', label: 'Tất cả' },
          { id: 'ai', label: 'Camera AI' },
          { id: 'sensors', label: 'Cảm biến' },
          { id: 'medication', label: 'Uống thuốc' },
          { id: 'alert', label: 'Cảnh báo' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterType(tab.id)}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
              filterType === tab.id
                ? 'bg-[#003f87] text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Logs List */}
      <div className="flex flex-col gap-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <BellRing className="w-8 h-8 text-slate-400" />
            <p className="text-base font-bold">Không có sự kiện nào trong danh mục này</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isDanger = log.level === 'danger';
            const isWarning = log.level === 'warning';

            return (
              <div
                key={log.id}
                className={`bg-white border rounded-3xl p-4 sm:p-5 shadow-sm transition-all flex flex-col gap-2.5 ${
                  isDanger
                    ? 'border-red-300 bg-red-50/40'
                    : isWarning
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-slate-200/90'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        isDanger
                          ? 'bg-red-100'
                          : isWarning
                          ? 'bg-amber-100'
                          : 'bg-slate-100'
                      }`}
                    >
                      {getLogIcon(log.type, log.level)}
                    </div>
                    <div>
                      <h4 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                        {log.title}
                      </h4>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mt-0.5">
                        <span>{log.timestamp}</span>
                        {log.room && (
                          <>
                            <span>•</span>
                            <span className="text-[#003f87] bg-blue-50 px-2 py-0.5 rounded-md">
                              {log.room}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
                    {log.timeAgo}
                  </span>
                </div>

                <p className="text-sm sm:text-base text-slate-700 font-medium pl-1 leading-relaxed">
                  {log.detail}
                </p>

                {log.resolved && (
                  <div className="flex items-center justify-end gap-1 text-xs font-bold text-emerald-700 pt-1 border-t border-slate-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Đã ghi nhận an toàn</span>
                  </div>
                )}
                {!log.resolved && onResolveLog && (
                  <div className="flex items-center justify-end pt-1">
                    <button
                      onClick={() => onResolveLog(log.id)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      Xác nhận đã xử lý
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
