import React from 'react';
import { CheckCircle2, AlertTriangle, Flame } from 'lucide-react';
import { motion } from 'motion/react';

interface StatusBannerProps {
  status: 'safe' | 'warning' | 'danger';
  alertMessage?: string;
  onResetStatus?: () => void;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  status,
  alertMessage,
  onResetStatus,
}) => {
  if (status === 'danger') {
    return (
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full bg-[#ffdad6] border-2 border-[#ba1a1a] text-[#93000a] rounded-3xl p-5 sm:p-6 shadow-sm flex items-center justify-between gap-4"
        id="status-banner-danger"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#ba1a1a] flex items-center justify-center text-white shrink-0 shadow-md animate-bounce">
            <Flame className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <div>
            <span className="block text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              CẢNH BÁO NGUY HIỂM!
            </span>
            <p className="text-base sm:text-lg font-medium text-red-900 mt-1">
              {alertMessage || 'Phát hiện sự cố bất thường. Cần kiểm tra ngay.'}
            </p>
          </div>
        </div>

        {onResetStatus && (
          <button
            onClick={onResetStatus}
            className="px-4 py-2 bg-[#ba1a1a] text-white font-bold rounded-xl text-sm hover:bg-red-800 active:scale-95 transition-all shrink-0"
          >
            Đã xử lý
          </button>
        )}
      </motion.div>
    );
  }

  if (status === 'warning') {
    return (
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full bg-amber-100 border-2 border-amber-500 text-amber-950 rounded-3xl p-5 sm:p-6 shadow-sm flex items-center justify-between gap-4"
        id="status-banner-warning"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-md">
            <AlertTriangle className="w-8 h-8 sm:w-9 sm:h-9" />
          </div>
          <div>
            <span className="block text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              Cần chú ý
            </span>
            <p className="text-base sm:text-lg font-medium text-amber-900 mt-1">
              {alertMessage || 'Chỉ số môi trường đang ở mức cảnh báo nhẹ.'}
            </p>
          </div>
        </div>

        {onResetStatus && (
          <button
            onClick={onResetStatus}
            className="px-4 py-2 bg-amber-600 text-white font-bold rounded-xl text-sm hover:bg-amber-700 active:scale-95 transition-all shrink-0"
          >
            Bỏ qua
          </button>
        )}
      </motion.div>
    );
  }

  // Exact match to screenshot: Green rectangle card with Checkmark in circle and bold text:
  // "Trạng thái: AN TOÀN"
  return (
    <motion.div
      initial={{ scale: 0.98, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="w-full bg-[#86efac] border border-emerald-400/60 rounded-3xl p-6 sm:p-7 shadow-[0_2px_8px_rgba(0,0,0,0.04)] flex items-center justify-center gap-4 sm:gap-6"
      id="status-banner-safe"
    >
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#006e26] flex items-center justify-center text-white shrink-0 shadow-sm">
        <CheckCircle2 className="w-9 h-9 sm:w-11 sm:h-11 stroke-[2.5]" />
      </div>

      <div className="flex flex-col text-[#003813]">
        <h2 className="text-[28px] sm:text-[34px] font-black leading-tight tracking-tight">
          Trạng thái: <span className="uppercase">AN TOÀN</span>
        </h2>
      </div>
    </motion.div>
  );
};
