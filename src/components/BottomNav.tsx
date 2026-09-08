import React from 'react';
import { LayoutGrid, History, HelpCircle } from 'lucide-react';
import { TabType } from '../types';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  unreadLogsCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
  unreadLogsCount = 0,
}) => {
  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/90 py-2.5 px-4 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]"
    >
      <div className="max-w-md mx-auto grid grid-cols-3 gap-2 sm:gap-3 items-center">
        {/* Tab 1: Trang chủ */}
        <button
          id="tab-home"
          onClick={() => onChangeTab('home')}
          className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-2xl transition-all cursor-pointer select-none active:scale-95 ${
            activeTab === 'home'
              ? 'bg-[#86efac] text-[#004d1a] shadow-sm font-black'
              : 'text-slate-700 hover:bg-slate-100 font-bold'
          }`}
        >
          <LayoutGrid className="w-6 h-6 stroke-[2.5]" />
          <span className="text-sm sm:text-base leading-tight mt-1">Trang chủ</span>
        </button>

        {/* Tab 2: Nhật ký */}
        <button
          id="tab-logs"
          onClick={() => onChangeTab('logs')}
          className={`relative flex flex-col items-center justify-center py-2.5 px-3 rounded-2xl transition-all cursor-pointer select-none active:scale-95 ${
            activeTab === 'logs'
              ? 'bg-[#86efac] text-[#004d1a] shadow-sm font-black'
              : 'text-slate-700 hover:bg-slate-100 font-bold'
          }`}
        >
          <History className="w-6 h-6 stroke-[2.5]" />
          <span className="text-sm sm:text-base leading-tight mt-1">Nhật ký</span>
          {unreadLogsCount > 0 && (
            <span className="absolute top-1.5 right-4 sm:right-6 w-5 h-5 bg-red-600 text-white rounded-full text-[11px] font-bold flex items-center justify-center shadow">
              {unreadLogsCount}
            </span>
          )}
        </button>

        {/* Tab 3: Trợ giúp */}
        <button
          id="tab-help"
          onClick={() => onChangeTab('help')}
          className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-2xl transition-all cursor-pointer select-none active:scale-95 ${
            activeTab === 'help'
              ? 'bg-[#86efac] text-[#004d1a] shadow-sm font-black'
              : 'text-slate-700 hover:bg-slate-100 font-bold'
          }`}
        >
          <HelpCircle className="w-6 h-6 stroke-[2.5]" />
          <span className="text-sm sm:text-base leading-tight mt-1">Trợ giúp</span>
        </button>
      </div>
    </nav>
  );
};
