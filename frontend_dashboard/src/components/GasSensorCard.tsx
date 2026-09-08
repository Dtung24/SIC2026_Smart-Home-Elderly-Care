import React, { useState } from 'react';
import { Flame, ShieldCheck, AlertTriangle, ChevronRight, Home, Utensils, BedDouble } from 'lucide-react';
import { SensorState, RoomId } from '../types';

interface GasSensorCardProps {
  sensors: SensorState;
  selectedRoomId?: RoomId;
  onSimulateGasAlert?: () => void;
}

export const GasSensorCard: React.FC<GasSensorCardProps> = ({ sensors, selectedRoomId = 'livingroom', onSimulateGasAlert }) => {
  const [showDetail, setShowDetail] = useState(false);
  const isNormal = sensors.gasStatus === 'normal';
  const isDanger = sensors.gasStatus === 'danger';

  const kitchenGas = sensors.rooms?.kitchen?.gas ?? 15;
  const livingRoomGas = sensors.rooms?.livingroom?.gas ?? sensors.gasLevelPpm ?? 12;
  const bedroomGas = sensors.rooms?.bedroom?.gas ?? 8;

  const currentGas = selectedRoomId === 'kitchen' 
    ? kitchenGas 
    : selectedRoomId === 'bedroom' 
    ? bedroomGas 
    : livingRoomGas;

  return (
    <div
      id="gas-sensor-card"
      className="w-full bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-4"
    >
      {/* Header matching screenshot: Light Green Circle + "Khí Gas" */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          {/* Light green filled circle icon */}
          <div className="w-10 h-10 rounded-full bg-[#99f89e] flex items-center justify-center text-[#00531b] shrink-0">
            <Flame className="w-5 h-5 fill-current stroke-none" />
          </div>
          <div>
            <h3 className="text-[22px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight">
              Khí Gas & Khói
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              Theo dõi 3 phòng (Bếp, Khách, Ngủ)
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowDetail(!showDetail)}
          className="text-xs font-bold text-[#003f87] hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>{showDetail ? 'Thu gọn' : 'Chi tiết'}</span>
          <ChevronRight className={`w-4 h-4 transition-transform ${showDetail ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Main Tactile Status Button matching screenshot: "Bình thường" in light green */}
      <button
        onClick={() => setShowDetail(!showDetail)}
        className={`w-full py-4 sm:py-4.5 px-6 rounded-2xl text-[20px] sm:text-[22px] font-bold tracking-tight text-slate-900 flex items-center justify-center gap-2 border-2 transition-all cursor-pointer select-none active:scale-[0.99] ${
          isDanger
            ? 'bg-[#ffdad6] border-[#ba1a1a] text-[#93000a] animate-pulse'
            : isNormal
            ? 'bg-[#a7f3d0] border-[#006e26]/30 hover:bg-[#86efac] text-[#003813]'
            : 'bg-amber-100 border-amber-500 text-amber-950'
        }`}
      >
        {isDanger ? (
          <>
            <AlertTriangle className="w-6 h-6 text-[#ba1a1a]" />
            <span>Phát hiện rò rỉ Gas!</span>
          </>
        ) : (
          <>
            <ShieldCheck className="w-6 h-6 text-[#006e26]" />
            <span>Bình thường</span>
          </>
        )}
      </button>

      {/* 3 Rooms Mini Status Grid */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center ${kitchenGas >= 50 ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1 text-slate-600 text-xs font-bold mb-1">
            <Utensils className="w-3.5 h-3.5 text-orange-600" />
            <span>Nhà Bếp</span>
          </div>
          <span className={`text-base font-extrabold ${kitchenGas >= 50 ? 'text-red-600' : 'text-slate-900'}`}>
            {kitchenGas} <span className="text-[10px] font-normal text-slate-500">ppm</span>
          </span>
          <span className="text-[10px] font-medium text-emerald-700 mt-0.5">
            {kitchenGas >= 50 ? 'Nguy hiểm' : 'An toàn'}
          </span>
        </div>

        <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center ${livingRoomGas >= 50 ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1 text-slate-600 text-xs font-bold mb-1">
            <Home className="w-3.5 h-3.5 text-blue-600" />
            <span>Phòng Khách</span>
          </div>
          <span className={`text-base font-extrabold ${livingRoomGas >= 50 ? 'text-red-600' : 'text-slate-900'}`}>
            {livingRoomGas} <span className="text-[10px] font-normal text-slate-500">ppm</span>
          </span>
          <span className="text-[10px] font-medium text-emerald-700 mt-0.5">
            {livingRoomGas >= 50 ? 'Nguy hiểm' : 'An toàn'}
          </span>
        </div>

        <div className={`p-2.5 rounded-xl border flex flex-col items-center text-center ${bedroomGas >= 50 ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center gap-1 text-slate-600 text-xs font-bold mb-1">
            <BedDouble className="w-3.5 h-3.5 text-indigo-600" />
            <span>Phòng Ngủ</span>
          </div>
          <span className={`text-base font-extrabold ${bedroomGas >= 50 ? 'text-red-600' : 'text-slate-900'}`}>
            {bedroomGas} <span className="text-[10px] font-normal text-slate-500">ppm</span>
          </span>
          <span className="text-[10px] font-medium text-emerald-700 mt-0.5">
            {bedroomGas >= 50 ? 'Nguy hiểm' : 'An toàn'}
          </span>
        </div>
      </div>

      {/* Expandable Diagnostic details */}
      {showDetail && (
        <div className="pt-2 border-t border-slate-100 flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
            <span className="text-slate-600 font-medium">Nồng độ phòng đang xem:</span>
            <span className={`font-bold ${currentGas >= 50 ? 'text-red-600' : 'text-emerald-700'}`}>
              {currentGas} ppm (Ngưỡng cảnh báo: &gt;= 50 ppm)
            </span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
            <span className="text-slate-600 font-medium">MQTT Topic Cảnh Báo Gas:</span>
            <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2 py-1 rounded border border-slate-200">
              home/{selectedRoomId}/alert/gas
            </span>
          </div>
          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
            <span className="text-slate-600 font-medium">Kênh truyền dữ liệu:</span>
            <span className="font-bold text-emerald-700">ESP32 &rarr; MQTT &rarr; Backend &rarr; Socket.IO</span>
          </div>
          {onSimulateGasAlert && (
            <button
              onClick={onSimulateGasAlert}
              className="mt-1 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
            >
              {isDanger ? 'Khôi phục cảm biến gas' : 'Kiểm tra thử nghiệm rò rỉ gas Nhà Bếp'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
