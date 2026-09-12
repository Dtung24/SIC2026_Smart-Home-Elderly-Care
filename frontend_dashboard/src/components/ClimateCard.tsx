import React from 'react';
import {
  Thermometer,
  Droplets,
  SunMedium,
  Home,
  Utensils,
} from 'lucide-react';
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
  const lrData =
    sensors.rooms?.livingroom ??
    { temperature: null, humidity: null, motion: null, gas: null };

  const ktData =
    sensors.rooms?.kitchen ??
    { temperature: null, humidity: null, motion: null, gas: null };

  // Card khí hậu chỉ có DHT11 tại Phòng Khách và Nhà Bếp.
  // Nếu selectedRoomId đang là Cầu Thang từ khu vực khác,
  // card này mặc định hiển thị Phòng Khách.
  const climateRoomId =
    selectedRoomId === 'kitchen'
      ? 'kitchen'
      : 'livingroom';

  const currentData =
    climateRoomId === 'kitchen'
      ? ktData
      : lrData;

  const currentTemp = currentData.temperature ?? null;
  const currentHum = currentData.humidity ?? null;

  const getRoomName = (id?: string) => {
    switch (id) {
      case 'kitchen':
        return 'Nhà Bếp';
      default:
        return 'Phòng Khách';
    }
  };

  return (
    <div
      id="climate-card"
      className="w-full bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-4"
    >
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-full bg-[#e1e3e4] flex items-center justify-center text-slate-800 shrink-0">
          <Thermometer className="w-5 h-5 stroke-[2.5]" />
        </div>

        <div>
          <h3 className="text-[21px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">
            Nhiệt độ & Độ ẩm
          </h3>

          <span className="text-xs text-slate-500 font-medium">
            Đang xem:{' '}
            <span className="font-bold text-[#003f87]">
              {getRoomName(climateRoomId)}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:gap-4">
        <div className="bg-[#edeeef] border border-slate-300/70 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center">
          <span className="text-slate-600 text-sm sm:text-base font-semibold tracking-wide">
            Nhiệt độ ({getRoomName(climateRoomId)})
          </span>

          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-[28px] sm:text-[34px] font-black text-slate-900 tracking-tight">
              {currentTemp !== null ? `${currentTemp}°C` : '--'}
            </span>
          </div>

          <span className="text-[11px] font-medium text-emerald-700 mt-1 flex items-center gap-1">
            <SunMedium className="w-3 h-3" />
            {currentTemp === null
              ? 'Không có cảm biến nhiệt độ'
              : currentTemp > 35
                ? 'Nóng, cần lưu ý'
                : 'Nhiệt độ đang được theo dõi'}
          </span>
        </div>

        <div className="bg-[#edeeef] border border-slate-300/70 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center">
          <span className="text-slate-600 text-sm sm:text-base font-semibold tracking-wide">
            Độ ẩm ({getRoomName(climateRoomId)})
          </span>

          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-[28px] sm:text-[34px] font-black text-slate-900 tracking-tight">
              {currentHum !== null ? `${currentHum}%` : '--'}
            </span>
          </div>

          <span className="text-[11px] font-medium text-blue-700 mt-1 flex items-center gap-1">
            <Droplets className="w-3 h-3" />
            {currentHum === null
              ? 'Không có cảm biến độ ẩm'
              : 'Độ ẩm đang được theo dõi'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => onSelectRoom?.('livingroom')}
          className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
            selectedRoomId === 'livingroom'
              ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20'
              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
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
            DHT11 nhiệt độ / độ ẩm
          </span>
        </button>

        <button
          onClick={() => onSelectRoom?.('kitchen')}
          className={`p-2.5 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
            selectedRoomId === 'kitchen'
              ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20'
              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
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
            DHT11 nhiệt độ / độ ẩm
          </span>
        </button>


      </div>
    </div>
  );
};
