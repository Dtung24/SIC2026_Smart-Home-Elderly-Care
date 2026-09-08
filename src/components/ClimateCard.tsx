import React from 'react';
import { Thermometer, Droplets, SunMedium, Home, Utensils, BedDouble } from 'lucide-react';
import { SensorState, RoomId } from '../types';

interface ClimateCardProps {
  sensors: SensorState;
  selectedRoomId?: RoomId;
  onSelectRoom?: (roomId: RoomId) => void;
}

export const ClimateCard: React.FC<ClimateCardProps> = ({
  sensors,
  selectedRoomId = 'livingroom',
  onSelectRoom,
}) => {
  const lrData = sensors.rooms?.livingroom ?? { temperature: sensors.temperature, humidity: sensors.humidity, motion: null, gas: null };
  const ktData = sensors.rooms?.kitchen ?? { temperature: 28.0, humidity: 62, motion: null, gas: null };
  const brData = sensors.rooms?.bedroom ?? { temperature: 25.2, humidity: 50, motion: null, gas: null };

  const currentData = selectedRoomId === 'kitchen' 
    ? ktData 
    : selectedRoomId === 'bedroom' 
    ? brData 
    : lrData;

  const currentTemp = currentData.temperature ?? sensors.temperature;
  const currentHum = currentData.humidity ?? sensors.humidity;

  const getRoomName = (id?: string) => {
    switch (id) {
      case 'kitchen': return 'Nhà Bếp';
      case 'bedroom': return 'Phòng Ngủ';
      default: return 'Phòng Khách';
    }
  };

  return (
    <div
      id="climate-card"
      className="w-full bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-4"
    >
      {/* Header: Soft gray circle with Thermometer + "Nhiệt độ & Độ ẩm" */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-full bg-[#e1e3e4] flex items-center justify-center text-slate-800 shrink-0">
            <Thermometer className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-[21px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
              Nhiệt độ & Độ ẩm
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              Đang xem: <span className="font-bold text-[#003f87]">{getRoomName(selectedRoomId)}</span>
            </span>
          </div>
        </div>

        {/* Room selection tabs */}
        {onSelectRoom && (
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => onSelectRoom('livingroom')}
              title="Phòng Khách"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                selectedRoomId === 'livingroom' ? 'bg-white text-[#003f87] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Khách</span>
            </button>
            <button
              onClick={() => onSelectRoom('kitchen')}
              title="Nhà Bếp"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                selectedRoomId === 'kitchen' ? 'bg-white text-[#003f87] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bếp</span>
            </button>
            <button
              onClick={() => onSelectRoom('bedroom')}
              title="Phòng Ngủ"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                selectedRoomId === 'bedroom' ? 'bg-white text-[#003f87] shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BedDouble className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ngủ</span>
            </button>
          </div>
        )}
      </div>

      {/* 2 Metric Boxes matching screenshot: Left "Nhiệt độ: 26°C", Right "Độ ẩm: 55%" */}
      <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
        {/* Temperature Box */}
        <div className="bg-[#edeeef] border border-slate-300/70 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center">
          <span className="text-slate-600 text-sm sm:text-base font-semibold tracking-wide">
            Nhiệt độ ({getRoomName(selectedRoomId)})
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-[28px] sm:text-[34px] font-black text-slate-900 tracking-tight">
              {currentTemp !== null ? `${currentTemp}°C` : '--'}
            </span>
          </div>
          <span className="text-[11px] font-medium text-emerald-700 mt-1 flex items-center gap-1">
            <SunMedium className="w-3 h-3" />
            {currentTemp && currentTemp > 35 ? 'Nóng bức, cần hạ nhiệt' : 'Mát mẻ, dễ chịu'}
          </span>
        </div>

        {/* Humidity Box */}
        <div className="bg-[#edeeef] border border-slate-300/70 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center">
          <span className="text-slate-600 text-sm sm:text-base font-semibold tracking-wide">
            Độ ẩm ({getRoomName(selectedRoomId)})
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-[28px] sm:text-[34px] font-black text-slate-900 tracking-tight">
              {currentHum !== null ? `${currentHum}%` : '--'}
            </span>
          </div>
          <span className="text-[11px] font-medium text-blue-700 mt-1 flex items-center gap-1">
            <Droplets className="w-3 h-3" /> Chuẩn y khoa
          </span>
        </div>
      </div>

      {/* 3 Rooms Climate Comparison Grid */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          onClick={() => onSelectRoom?.('livingroom')}
          className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
            selectedRoomId === 'livingroom' ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-1 text-slate-600 text-[11px] font-bold mb-1">
            <Home className="w-3 h-3 text-blue-600" />
            <span>Phòng Khách</span>
          </div>
          <span className="text-sm font-extrabold text-slate-900">
            {lrData.temperature ?? '--'}°C / {lrData.humidity ?? '--'}%
          </span>
          <span className="text-[10px] text-emerald-700 font-medium mt-0.5">
            {lrData.motion ? 'Có chuyển động' : 'Yên tĩnh'}
          </span>
        </button>

        <button
          onClick={() => onSelectRoom?.('kitchen')}
          className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
            selectedRoomId === 'kitchen' ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-1 text-slate-600 text-[11px] font-bold mb-1">
            <Utensils className="w-3.5 h-3.5 text-orange-600" />
            <span>Nhà Bếp</span>
          </div>
          <span className="text-sm font-extrabold text-slate-900">
            {ktData.temperature ?? '--'}°C / {ktData.humidity ?? '--'}%
          </span>
          <span className="text-[10px] text-emerald-700 font-medium mt-0.5">
            {ktData.motion ? 'Có chuyển động' : 'Bếp an toàn'}
          </span>
        </button>

        <button
          onClick={() => onSelectRoom?.('bedroom')}
          className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
            selectedRoomId === 'bedroom' ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-1 text-slate-600 text-[11px] font-bold mb-1">
            <BedDouble className="w-3.5 h-3.5 text-indigo-600" />
            <span>Phòng Ngủ</span>
          </div>
          <span className="text-sm font-extrabold text-slate-900">
            {brData.temperature ?? '--'}°C / {brData.humidity ?? '--'}%
          </span>
          <span className="text-[10px] text-emerald-700 font-medium mt-0.5">
            {brData.motion ? 'Bà đang nghỉ' : 'Yên tĩnh'}
          </span>
        </button>
      </div>
    </div>
  );
};
