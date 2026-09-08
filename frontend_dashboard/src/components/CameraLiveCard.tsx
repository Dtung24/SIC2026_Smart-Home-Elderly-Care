import React, { useState, useEffect } from 'react';
import { Video, Maximize2, RefreshCw, Eye, ShieldCheck, AlertCircle, Sparkles } from 'lucide-react';
import { RoomCamera } from '../types';

interface CameraLiveCardProps {
  livingRoom: RoomCamera;
  onSimulateFall?: () => void;
}

export const CameraLiveCard: React.FC<CameraLiveCardProps> = ({
  livingRoom,
}) => {
  const [timecode, setTimecode] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false });
      setTimecode(`Phòng Khách (home/livingroom/alert/fall) | ${dateStr} ${timeStr} | LIVE`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div
      id="camera-live-card"
      className="w-full bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3"
    >
      {/* Top Header: Camera icon + "Phòng Khách" & "• Trực tiếp" */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="text-slate-900">
            <Video className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[22px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight">
                Phòng Khách
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-50 text-[#003f87] border border-blue-200 rounded-full">
                AI Camera
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Topic MQTT: <span className="font-mono text-slate-700 font-semibold">home/livingroom/alert/fall</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Green Pill Badge: "• Trực tiếp" */}
          <div className="inline-flex items-center gap-1.5 bg-[#006e26] text-white px-3.5 py-1.5 rounded-full text-sm font-bold shadow-sm">
            <span className="h-2 w-2 rounded-full bg-white animate-ping"></span>
            <span>Trực tiếp</span>
          </div>

          <button
            onClick={handleRefresh}
            title="Làm mới luồng video"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Camera Live Stream Viewport */}
      <div className="relative w-full aspect-video sm:aspect-[16/10] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/80 shadow-inner group">
        <img
          src={`http://${window.location.hostname}:8000/video_feed`}
          alt="Camera giám sát Phòng Khách"
          className={`w-full h-full object-cover transition-all duration-300 ${isRefreshing ? 'opacity-50' : 'opacity-90'}`}
          referrerPolicy="no-referrer"
        />

        {/* Live HUD Timestamp Overlay */}
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white/90 font-mono text-[10px] sm:text-xs px-2 py-0.5 rounded border border-white/10 select-none">
          {timecode}
        </div>

        {/* Floating AI Detection Center Badge matching screenshot:
            "AI: Không phát hiện bất thường" */}
        <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
          <div
            className={`pointer-events-auto backdrop-blur-md px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl shadow-lg border text-center transition-all ${
              livingRoom.aiStatusLevel === 'danger'
                ? 'bg-red-600/90 border-red-400 text-white animate-bounce'
                : livingRoom.aiStatusLevel === 'warning'
                ? 'bg-amber-500/90 border-amber-300 text-white'
                : 'bg-white/90 border-white/80 text-slate-900 shadow-slate-900/10'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              {livingRoom.aiStatusLevel === 'safe' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-white shrink-0 animate-pulse" />
              )}
              <span className="text-[17px] sm:text-[20px] font-black tracking-tight leading-snug">
                {livingRoom.aiStatusText}
              </span>
            </div>
            {livingRoom.activityNote && (
              <p
                className={`text-xs sm:text-sm mt-1 font-medium ${
                  livingRoom.aiStatusLevel === 'safe'
                    ? 'text-slate-600'
                    : 'text-white/90'
                }`}
              >
                {livingRoom.activityNote}
              </p>
            )}
          </div>
        </div>

        {/* Bottom controls inside viewport */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-black/50 hover:bg-black/75 text-white rounded-lg backdrop-blur-xs transition-colors"
            title="Xem toàn màn hình"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Person detection subtle radar icon */}
        {livingRoom.personDetected && (
          <div className="absolute bottom-2 left-2 bg-emerald-950/70 backdrop-blur-xs text-emerald-300 text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 border border-emerald-500/30 font-semibold">
            <Eye className="w-3.5 h-3.5 animate-pulse" />
            <span>Có người trong phòng</span>
          </div>
        )}
      </div>

      {/* Note about single camera privacy */}
      <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
        <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span>Camera AI chỉ lắp đặt tại Phòng Khách để đảm bảo tối đa quyền riêng tư cho người cao tuổi. Nhà Bếp và Phòng Ngủ được bảo vệ bằng cảm biến thông minh.</span>
      </div>
    </div>
  );
};
