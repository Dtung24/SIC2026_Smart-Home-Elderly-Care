import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  PhoneCall,
  MapPin,
  XCircle,
  AlertOctagon,
  VolumeX,
  Send,
  Wifi,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmergencyContact } from '../types';
import {
  startEmergencySiren,
  stopEmergencySiren,
  speakVietnamese,
} from '../utils/audio';

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: EmergencyContact[];
}

export const EmergencyModal: React.FC<EmergencyModalProps> = ({
  isOpen,
  onClose,
  contacts,
}) => {
  const [countdown, setCountdown] = useState(5);
  const [isSent, setIsSent] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(5);
      setIsSent(false);
      stopEmergencySiren();
      return;
    }

    // Play siren & Voice announcement
    startEmergencySiren();
    speakVietnamese('Đang phát tín hiệu cứu hộ khẩn cấp!');

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsSent(true);
          speakVietnamese('Đã gửi cảnh báo khẩn cấp và vị trí qua Telegram đến người thân.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      stopEmergencySiren();
    };
  }, [isOpen]);

  const handleCancel = () => {
    stopEmergencySiren();
    speakVietnamese('Đã hủy tín hiệu khẩn cấp.');
    onClose();
  };

  const toggleMute = () => {
    if (isMuted) {
      startEmergencySiren();
      setIsMuted(false);
    } else {
      stopEmergencySiren();
      setIsMuted(true);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border-4 border-red-600 flex flex-col"
        >
          {/* Top Urgent Header */}
          <div className="bg-red-600 text-white p-6 flex flex-col items-center justify-center text-center relative">
            <button
              onClick={toggleMute}
              className="absolute top-4 right-4 p-2 bg-black/30 hover:bg-black/50 rounded-full text-white text-xs flex items-center gap-1 font-bold"
              title={isMuted ? 'Bật còi' : 'Tắt còi'}
            >
              {isMuted ? <ShieldAlert className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span>{isMuted ? 'Bật còi' : 'Tắt còi'}</span>
            </button>

            <div className="w-20 h-20 rounded-full bg-white text-red-600 flex items-center justify-center shadow-lg animate-bounce mb-3">
              <AlertOctagon className="w-12 h-12 stroke-[2.5]" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">
              {isSent ? 'ĐÃ PHÁT TÍN HIỆU CỨU HỘ!' : 'ĐANG KÍCH HOẠT KHẨN CẤP'}
            </h2>
            <p className="text-white/90 text-sm sm:text-base font-medium mt-1">
              {isSent
                ? 'Hệ thống đã gửi cảnh báo vị trí GPS và gọi qua Telegram cho người thân.'
                : `Hệ thống sẽ gửi vị trí và gọi Telegram người thân trong ${countdown} giây nữa.`}
            </p>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 flex flex-col gap-4">
            {/* GPS Location Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3">
              <MapPin className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Vị trí gửi tín hiệu:
                </span>
                <p className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                  128 Phố Huế, Hàng Bài, Hoàn Kiếm, Hà Nội
                </p>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  Tọa độ GPS: 21.0185° N, 105.8524° E (Độ chính xác: 3 mét)
                </p>
              </div>
            </div>

            {/* Pure Wi-Fi & Telegram Architecture Notice (No SIM Module Needed) */}
            <div className="p-3 bg-sky-50/80 border border-sky-200 rounded-2xl flex items-start gap-2.5 text-xs text-sky-950">
              <div className="p-1.5 bg-[#229ED9] text-white rounded-lg shrink-0 mt-0.5 shadow-xs">
                <Wifi className="w-3.5 h-3.5" />
              </div>
              <div className="leading-relaxed">
                <span className="font-bold text-[#003f87]">Truyền tín hiệu 100% qua Wi-Fi & Telegram:</span>
                <span className="text-slate-600 block mt-0.5 text-[11px]">
                  ESP32 và Camera AI hoạt động hoàn toàn qua mạng Wi-Fi gia đình, <strong>không cần lắp module SIM hay thẻ SIM</strong>. Toàn bộ cảnh báo và cuộc gọi khẩn cấp được Backend chuyển tiếp tự động qua Telegram.
                </span>
              </div>
            </div>

            {/* Notification list to contacts */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 uppercase">
                  Danh sách liên hệ khẩn cấp:
                </span>
                <span className="text-[11px] font-semibold text-[#0088cc] flex items-center gap-1">
                  <Send className="w-3 h-3" /> Gọi qua Telegram
                </span>
              </div>
              {contacts.slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping shrink-0"></div>
                    <div className="truncate">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-slate-900 truncate">{c.name}</span>
                        {c.telegramUsername && (
                          <span className="text-[10px] font-mono text-[#0088cc] font-bold bg-sky-100 px-1.5 py-0.5 rounded">
                            @{c.telegramUsername}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 block">({c.relation})</span>
                    </div>
                  </div>
                  {c.telegramUrl ? (
                    <a
                      href={c.telegramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-[#229ED9] hover:bg-[#1d8cc4] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" /> Gọi Telegram
                    </a>
                  ) : (
                    <a
                      href={`tel:${c.phone}`}
                      className="px-3 py-2 bg-red-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-red-700 shadow-sm shrink-0"
                    >
                      <PhoneCall className="w-3.5 h-3.5" /> Gọi {c.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>

            {/* Huge Cancel Button */}
            <button
              onClick={handleCancel}
              className="w-full py-4 px-6 bg-slate-900 hover:bg-black text-white font-black text-lg sm:text-xl rounded-2xl shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all mt-2"
            >
              <XCircle className="w-6 h-6 text-red-400" />
              <span>HỦY BỎ (BẤM NHẦM)</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
