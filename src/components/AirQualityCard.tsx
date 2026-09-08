import React, { useState } from 'react';
import { Wind, Leaf, ChevronRight, Sparkles } from 'lucide-react';
import { SensorState } from '../types';

interface AirQualityCardProps {
  sensors: SensorState;
}

export const AirQualityCard: React.FC<AirQualityCardProps> = ({ sensors }) => {
  const [showDetail, setShowDetail] = useState(false);
  const isClean = sensors.airQuality === 'clean';

  return (
    <div
      id="air-quality-card"
      className="w-full bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-4"
    >
      {/* Header matching screenshot: Soft blue circle + "Không khí" */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          {/* Soft lavender/blue filled circle */}
          <div className="w-10 h-10 rounded-full bg-[#d7e2ff] flex items-center justify-center text-[#003f87] shrink-0">
            <Wind className="w-5 h-5" />
          </div>
          <h3 className="text-[22px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight">
            Không khí
          </h3>
        </div>

        <button
          onClick={() => setShowDetail(!showDetail)}
          className="text-xs font-bold text-[#003f87] hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>{showDetail ? 'Thu gọn' : 'Chi tiết'}</span>
          <ChevronRight className={`w-4 h-4 transition-transform ${showDetail ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Main Action/Status Button matching screenshot:
          Deep trust-blue pill button with Leaf icon & "Sạch" */}
      <button
        onClick={() => setShowDetail(!showDetail)}
        className={`w-full py-4 sm:py-4.5 px-6 rounded-2xl text-[20px] sm:text-[22px] font-bold tracking-tight text-white flex items-center justify-center gap-2.5 shadow-sm transition-all cursor-pointer select-none active:scale-[0.99] ${
          isClean
            ? 'bg-[#0056b3] hover:bg-[#003f87]'
            : 'bg-amber-600 hover:bg-amber-700'
        }`}
      >
        <Leaf className="w-6 h-6 fill-current stroke-none" />
        <span>{isClean ? 'Sạch' : 'Cần lọc bụi'}</span>
      </button>

      {/* Expandable Diagnostic details */}
      {showDetail && (
        <div className="pt-2 border-t border-slate-100 flex flex-col gap-2.5 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 p-3 rounded-xl flex flex-col">
              <span className="text-slate-500 text-xs font-medium">Chỉ số chất lượng AQI</span>
              <span className="text-lg font-bold text-[#003f87] mt-0.5">{sensors.aqi} (Rất tốt)</span>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl flex flex-col">
              <span className="text-slate-500 text-xs font-medium">Bụi mịn PM2.5</span>
              <span className="text-lg font-bold text-[#006e26] mt-0.5">{sensors.pm25} µg/m³</span>
            </div>
          </div>
          <div className="bg-blue-50/70 p-3 rounded-xl flex items-center justify-between text-blue-900">
            <div className="flex items-center gap-2 font-medium">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Máy lọc không khí Plasma</span>
            </div>
            <span className="text-xs font-bold px-2 py-1 bg-blue-200 text-blue-900 rounded-lg">Đang chạy êm</span>
          </div>
        </div>
      )}
    </div>
  );
};
