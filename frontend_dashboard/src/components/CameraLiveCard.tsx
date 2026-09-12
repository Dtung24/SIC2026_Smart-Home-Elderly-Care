import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Maximize2,
  RefreshCw,
  Sparkles,
  Video,
} from 'lucide-react';
import { RoomCamera } from '../types';

interface CameraLiveCardProps {
  livingRoom: RoomCamera;
}

type CameraStatus =
  | 'connecting'
  | 'live'
  | 'offline';

export const CameraLiveCard: React.FC<CameraLiveCardProps> = ({
  livingRoom,
}) => {
  const [timecode, setTimecode] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraStatus, setCameraStatus] =
    useState<CameraStatus>('connecting');

  const [streamVersion, setStreamVersion] =
    useState(Date.now());

  const videoContainerRef =
    useRef<HTMLDivElement>(null);

  const roomName =
    livingRoom?.name || 'Phòng Khách';

  const streamUrl =
    `http://${window.location.hostname}:8000/video_feed?v=${streamVersion}`;

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();

      const dateStr =
        new Intl.DateTimeFormat('en-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now);

      const timeStr =
        now.toLocaleTimeString('vi-VN', {
          hour12: false,
        });

      setTimecode(
        `${roomName} | ${dateStr} ${timeStr}`
      );
    };

    updateTime();

    const interval =
      window.setInterval(updateTime, 1000);

    return () =>
      window.clearInterval(interval);
  }, [roomName]);

  // Nếu AI Vision đang tắt, tự thử kết nối lại mỗi 5 giây.
  useEffect(() => {
    if (cameraStatus !== 'offline') {
      return;
    }

    const retryInterval =
      window.setInterval(() => {
        setCameraStatus('connecting');
        setStreamVersion(Date.now());
      }, 5000);

    return () =>
      window.clearInterval(retryInterval);
  }, [cameraStatus]);

  const handleRefresh = () => {
    setCameraStatus('connecting');
    setStreamVersion(Date.now());
  };

  const handleFullscreen = async () => {
    if (cameraStatus === 'offline') {
      return;
    }

    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current
          ?.requestFullscreen();

        try {
          const orientation =
            screen.orientation as ScreenOrientation & {
              lock?: (
                orientation: string
              ) => Promise<void>;
            };

          await orientation.lock?.(
            'landscape'
          );
        } catch {
          // Trình duyệt không hỗ trợ khóa xoay.
        }
      } else {
        await document.exitFullscreen();

        try {
          screen.orientation.unlock?.();
        } catch {
          // Trình duyệt không hỗ trợ unlock.
        }
      }
    } catch (error) {
      console.warn(
        '[Camera] Không thể bật fullscreen:',
        error
      );
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        Boolean(document.fullscreenElement)
      );
    };

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      );
    };
  }, []);

  return (
    <div
      id="camera-live-card"
      className="w-full bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-3"
    >
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="text-slate-900">
            <Video className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.2]" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[22px] sm:text-[24px] font-extrabold text-slate-900 tracking-tight">
                {roomName}
              </h3>

              <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-50 text-[#003f87] border border-blue-200 rounded-full">
                AI Camera
              </span>

              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                  cameraStatus === 'live'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : cameraStatus === 'offline'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {cameraStatus === 'live'
                  ? 'TRỰC TIẾP'
                  : cameraStatus === 'offline'
                    ? 'MẤT KẾT NỐI'
                    : 'ĐANG KẾT NỐI'}
              </span>
            </div>

            <p className="text-xs text-slate-500 font-medium">
              AI phát hiện té ngã tại Phòng Khách
            </p>
          </div>
        </div>

        <button
          onClick={handleRefresh}
          title="Làm mới luồng video"
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <RefreshCw
            className={`w-4 h-4 ${
              cameraStatus === 'connecting'
                ? 'animate-spin'
                : ''
            }`}
          />
        </button>
      </div>

      <div
        ref={videoContainerRef}
        className="relative w-full aspect-video sm:aspect-[16/10] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/80 shadow-inner group fullscreen:w-screen fullscreen:h-screen fullscreen:rounded-none fullscreen:border-0"
      >
        <img
          key={streamVersion}
          src={streamUrl}
          alt="Camera giám sát Phòng Khách"
          onLoad={() =>
            setCameraStatus('live')
          }
          onError={() =>
            setCameraStatus('offline')
          }
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraStatus === 'offline'
              ? 'opacity-0'
              : 'opacity-90'
          }`}
          referrerPolicy="no-referrer"
        />

        {cameraStatus === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/70 text-white">
            <Loader2 className="w-8 h-8 animate-spin" />

            <span className="text-sm font-semibold">
              Đang kết nối Camera AI...
            </span>
          </div>
        )}

        {cameraStatus === 'offline' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 text-white px-6 text-center">
            <AlertTriangle className="w-9 h-9 text-amber-400" />

            <div>
              <p className="font-bold">
                Mất kết nối Camera AI
              </p>

              <p className="text-xs text-slate-300 mt-1">
                Hệ thống sẽ tự thử kết nối lại.
              </p>
            </div>
          </div>
        )}

        {cameraStatus === 'live' && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white/90 font-mono text-[10px] sm:text-xs px-2 py-0.5 rounded border border-white/10 select-none">
            {timecode} | LIVE
          </div>
        )}

        <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
          <button
            onClick={handleFullscreen}
            disabled={
              cameraStatus === 'offline'
            }
            className="p-1.5 bg-black/50 hover:bg-black/75 text-white rounded-lg backdrop-blur-xs transition-colors disabled:opacity-40"
            title={
              isFullscreen
                ? 'Thoát toàn màn hình'
                : 'Xem toàn màn hình'
            }
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
        <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />

        <span>
          Camera AI chỉ lắp đặt tại Phòng Khách để đảm bảo quyền riêng tư cho người cao tuổi. Nhà Bếp và Cầu Thang được bảo vệ bằng cảm biến thông minh.
        </span>
      </div>
    </div>
  );
};
