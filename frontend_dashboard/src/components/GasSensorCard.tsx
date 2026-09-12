import React from 'react';
import {
  Flame,
  ShieldCheck,
  AlertTriangle,
  Utensils,
} from 'lucide-react';
import { SensorState, RoomId } from '../types';

interface GasSensorCardProps {
  sensors: SensorState;
  selectedRoomId?: RoomId;
}

const GAS_THRESHOLD_RAW = 2200;
const ADC_MAX = 4095;

export const GasSensorCard: React.FC<GasSensorCardProps> = ({
  sensors,
}) => {
  const kitchenGas =
    sensors.rooms?.kitchen?.gas ??
    sensors.gasRawAdc ??
    null;

  const hasReading = typeof kitchenGas === 'number';

  const isDanger =
    hasReading && kitchenGas >= GAS_THRESHOLD_RAW;

  const signalPercent = hasReading
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round((kitchenGas / ADC_MAX) * 100)
        )
      )
    : null;

  return (
    <div
      id="gas-sensor-card"
      className="w-full bg-white border border-slate-200/90 rounded-3xl p-5 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-4"
    >
      <div className="flex items-center gap-3.5">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            isDanger
              ? 'bg-red-100 text-red-700'
              : 'bg-[#99f89e] text-[#00531b]'
          }`}
        >
          <Flame className="w-5 h-5 fill-current stroke-none" />
        </div>

        <div>
          <h3 className="text-[22px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight">
            Cảm biến khí Gas MQ-2
          </h3>

          <span className="text-xs text-slate-500 font-medium">
            Theo dõi an toàn khí Gas tại Nhà Bếp
          </span>
        </div>
      </div>

      <div
        className={`w-full py-4 px-5 rounded-2xl text-[20px] sm:text-[22px] font-bold tracking-tight flex items-center justify-center gap-2 border-2 ${
          !hasReading
            ? 'bg-slate-100 border-slate-300 text-slate-700'
            : isDanger
              ? 'bg-[#ffdad6] border-[#ba1a1a] text-[#93000a]'
              : 'bg-[#a7f3d0] border-[#006e26]/30 text-[#003813]'
        }`}
      >
        {!hasReading ? (
          <>
            <AlertTriangle className="w-6 h-6 text-slate-500" />
            <span>Chưa có dữ liệu cảm biến</span>
          </>
        ) : isDanger ? (
          <>
            <AlertTriangle className="w-6 h-6 text-[#ba1a1a]" />
            <span>Cảnh báo khí Gas!</span>
          </>
        ) : (
          <>
            <ShieldCheck className="w-6 h-6 text-[#006e26]" />
            <span>An toàn</span>
          </>
        )}
      </div>

      <div
        className={`p-4 rounded-2xl border ${
          isDanger
            ? 'bg-red-50 border-red-300'
            : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5 text-orange-600" />

            <div>
              <div className="text-sm font-bold text-slate-800">
                Nhà Bếp
              </div>

              <div className="text-xs text-slate-500">
                Mức tín hiệu cảm biến
              </div>
            </div>
          </div>

          <div
            className={`text-3xl font-black ${
              isDanger
                ? 'text-red-600'
                : 'text-slate-900'
            }`}
          >
            {signalPercent !== null
              ? `${signalPercent}%`
              : '--'}
          </div>
        </div>

        <div className="mt-4 h-3 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isDanger
                ? 'bg-red-500'
                : 'bg-emerald-500'
            }`}
            style={{
              width:
                signalPercent !== null
                  ? `${signalPercent}%`
                  : '0%',
            }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Trạng thái
          </span>

          <span
            className={`font-bold ${
              !hasReading
                ? 'text-slate-500'
                : isDanger
                  ? 'text-red-700'
                  : 'text-emerald-700'
            }`}
          >
            {!hasReading
              ? 'Chưa có dữ liệu'
              : isDanger
                ? 'Cần kiểm tra ngay'
                : 'Bình thường'}
          </span>
        </div>
      </div>
    </div>
  );
};
