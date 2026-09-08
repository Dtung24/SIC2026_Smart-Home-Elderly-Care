import React from 'react';
import { ShieldAlert, Volume2 } from 'lucide-react';
import { speakVietnamese } from '../utils/audio';
import { BackendStatusBadge } from './BackendStatusBadge';

interface HeaderProps {
  onEmergencyClick: () => void;
  systemStatus: 'safe' | 'warning' | 'danger';
}

export const Header: React.FC<HeaderProps> = ({ onEmergencyClick, systemStatus }) => {
  const handleVoiceStatus = () => {
    if (systemStatus === 'safe') {
      speakVietnamese('Trạng thái ngôi nhà và an toàn của ông bà đang an toàn. Nhiệt độ hai mươi sáu độ C. Khí gas và chất lượng không khí bình thường.');
    } else if (systemStatus === 'warning') {
      speakVietnamese('Cảnh báo. Phát hiện chỉ số môi trường bất thường tại nhà ông bà. Vui lòng kiểm tra ứng dụng.');
    } else {
      speakVietnamese('Cảnh báo nguy hiểm. Đang kích hoạt chế độ cứu hộ khẩn cấp cho gia đình.');
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 sm:px-6">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand Name: "ElderHome" on top, "AI" below with bold blue */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col select-none">
            <span className="text-[22px] sm:text-[24px] font-extrabold tracking-tight text-[#003f87] leading-none font-sans">
              ElderHome
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[20px] sm:text-[22px] font-black text-[#003f87] leading-none">
                AI
              </span>
              <span className="relative flex h-2.5 w-2.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${systemStatus === 'safe' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${systemStatus === 'safe' ? 'bg-emerald-500' : 'bg-red-600'}`}></span>
              </span>
            </div>
          </div>

          <div className="hidden sm:block">
            <BackendStatusBadge />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="block sm:hidden">
            <BackendStatusBadge />
          </div>

          {/* Quick Audio Announcer button for elderly users */}
          <button
            id="voice-announcer-btn"
            onClick={handleVoiceStatus}
            aria-label="Đọc trạng thái nhà bằng giọng nói"
            title="Đọc trạng thái bằng giọng nói"
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition-all flex items-center justify-center"
          >
            <Volume2 className="w-5 h-5 text-[#003f87]" />
          </button>

          {/* Emergency SOS Button matching exact screenshot: Red rounded block "KHẨN CẤP" */}
          <button
            id="emergency-sos-btn"
            onClick={onEmergencyClick}
            className="bg-[#b10f2b] hover:bg-[#8e0c22] active:scale-95 text-white font-extrabold text-[17px] sm:text-[19px] tracking-wider px-5 sm:px-6 py-2.5 sm:py-3 rounded-2xl shadow-md shadow-red-900/20 flex items-center gap-2 transition-all cursor-pointer select-none"
          >
            <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
            <span>KHẨN CẤP</span>
          </button>
        </div>
      </div>
    </header>
  );
};
