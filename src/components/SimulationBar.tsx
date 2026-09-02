import React, { useState } from 'react';
import { Sliders, ShieldCheck, Flame, UserX, ThermometerSun, Wind, X } from 'lucide-react';

interface SimulationBarProps {
  onSetSafe: () => void;
  onSimulateGasLeak: () => void;
  onSimulateFall: () => void;
  onSimulateHighTemp: () => void;
  onSimulateAirPollution: () => void;
  currentStatus: 'safe' | 'warning' | 'danger';
}

export const SimulationBar: React.FC<SimulationBarProps> = ({
  onSetSafe,
  onSimulateGasLeak,
  onSimulateFall,
  onSimulateHighTemp,
  onSimulateAirPollution,
  currentStatus,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Toggle Button */}
      <div className="fixed top-20 right-3 z-30">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl shadow-lg border text-xs font-bold transition-all cursor-pointer ${
            currentStatus === 'danger'
              ? 'bg-red-600 text-white border-red-400 animate-bounce'
              : currentStatus === 'warning'
              ? 'bg-amber-500 text-white border-amber-400'
              : 'bg-white/90 backdrop-blur-md text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title="Mở bảng điều khiển mô phỏng thử nghiệm"
        >
          <Sliders className="w-4 h-4" />
          <span className="hidden sm:inline">Mô phỏng thử nghiệm</span>
        </button>
      </div>

      {/* Slide-in Simulation Panel */}
      {isOpen && (
        <div className="fixed inset-x-0 bottom-20 z-40 p-4 max-w-lg mx-auto">
          <div className="bg-slate-900/95 text-white backdrop-blur-md rounded-3xl p-5 border border-slate-700 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                <span className="font-extrabold text-sm sm:text-base">
                  Bảng Thử Nghiệm Tình Huống Giám Sát
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Chọn một kịch bản để kiểm tra phản hồi của giao diện và âm thanh cảnh báo:
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  onSetSafe();
                  setIsOpen(false);
                }}
                className="p-2.5 bg-emerald-700 hover:bg-emerald-600 rounded-xl text-xs font-bold flex items-center gap-2 justify-center transition-all"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>1. Chuẩn An Toàn 3 Phòng</span>
              </button>

              <button
                onClick={() => {
                  onSimulateGasLeak();
                  setIsOpen(false);
                }}
                className="p-2.5 bg-red-700 hover:bg-red-600 rounded-xl text-xs font-bold flex items-center gap-2 justify-center transition-all"
              >
                <Flame className="w-4 h-4" />
                <span>2. Rò rỉ Gas Nhà Bếp</span>
              </button>

              <button
                onClick={() => {
                  onSimulateFall();
                  setIsOpen(false);
                }}
                className="p-2.5 bg-orange-700 hover:bg-orange-600 rounded-xl text-xs font-bold flex items-center gap-2 justify-center transition-all"
              >
                <UserX className="w-4 h-4" />
                <span>3. Camera Té Ngã (Khách)</span>
              </button>

              <button
                onClick={() => {
                  onSimulateHighTemp();
                  setIsOpen(false);
                }}
                className="p-2.5 bg-amber-700 hover:bg-amber-600 rounded-xl text-xs font-bold flex items-center gap-2 justify-center transition-all"
              >
                <ThermometerSun className="w-4 h-4" />
                <span>4. Nhiệt cao Phòng Ngủ 38°C</span>
              </button>

              <button
                onClick={() => {
                  onSimulateAirPollution();
                  setIsOpen(false);
                }}
                className="col-span-2 p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 justify-center transition-all"
              >
                <Wind className="w-4 h-4 text-blue-400" />
                <span>5. Cảnh báo Bụi mịn PM2.5 (Phòng Khách)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
