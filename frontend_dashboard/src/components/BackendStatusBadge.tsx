import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Settings2, Check, RefreshCw, Server } from 'lucide-react';
import { backendService, DEFAULT_BACKEND_URL } from '../services/backendService';

export const BackendStatusBadge: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(backendService.getIsConnected());
  const [currentUrl, setCurrentUrl] = useState<string>(backendService.getBaseUrl());
  const [isOpen, setIsOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState(currentUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const unsub = backendService.subscribeConnectionStatus((connected, url) => {
      setIsConnected(connected);
      setCurrentUrl(url);
      setInputUrl(url);
    });
    return () => unsub();
  }, []);

  const handleSaveUrl = () => {
    backendService.setBaseUrl(inputUrl);
    setTestResult('Đang kết nối lại Socket.IO...');
    setTimeout(() => {
      handleTestRest();
    }, 1000);
  };

  const handleResetDefault = () => {
    setInputUrl(DEFAULT_BACKEND_URL);
    backendService.resetToDefaultUrl();
    setTestResult(`Đã đặt lại về ${DEFAULT_BACKEND_URL}`);
  };

  const handleTestRest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const data = await backendService.fetchLatestTelemetry();
      if (data) {
        setTestResult(`✅ Kết nối thành công! Đã nhận telemetry.`);
      } else {
        setTestResult(`⚠️ Không nhận được phản hồi từ REST API.`);
      }
    } catch (err: any) {
      setTestResult(`❌ Lỗi kết nối: ${err.message || 'Không thể kết nối'}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      {/* Compact Status Indicator Badge */}
      <button
        id="backend-connection-badge"
        onClick={() => setIsOpen(true)}
        title={`Backend Server: ${currentUrl} (${isConnected ? 'Đã kết nối' : 'Đang kết nối / Ngoại tuyến'})`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all border shadow-xs cursor-pointer select-none ${
          isConnected
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
            : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
        }`}
      >
        {isConnected ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            <span className="truncate max-w-[120px] sm:max-w-[180px]">LAN: {currentUrl.replace(/^http:\/\//, '')}</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <WifiOff className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate max-w-[120px] sm:max-w-[180px]">Backend: 192.168.1.8:3000</span>
          </>
        )}
      </button>

      {/* Settings Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-200 flex flex-col gap-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#003f87] flex items-center justify-center">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">
                    Cấu Hình Backend & Socket.IO
                  </h3>
                  <p className="text-xs text-slate-500">
                    Giao thức kết nối Raspberry Pi / LAN server
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Connection Status Card */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isConnected ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                  }`}
                />
                <div>
                  <span className="text-xs font-bold text-slate-500 block">Trạng thái Socket.IO</span>
                  <span
                    className={`text-sm font-extrabold ${
                      isConnected ? 'text-emerald-700' : 'text-slate-700'
                    }`}
                  >
                    {isConnected ? '🟢 Đã kết nối thời gian thực' : '⚪ Đang sẵn sàng kết nối'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleTestRest}
                disabled={isTesting}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>Test API</span>
              </button>
            </div>

            {/* URL Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Base URL Backend (Mặc định LAN):</span>
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="text-[11px] text-[#003f87] hover:underline font-bold"
                >
                  Đặt lại mặc định
                </button>
              </label>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="http://192.168.1.8:3000"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#003f87]/30"
              />
              <p className="text-[11px] text-slate-500">
                Socket.IO events: <code className="text-blue-700 font-bold">telemetry:latest</code>, <code className="text-blue-700 font-bold">telemetry:update</code>, <code className="text-blue-700 font-bold">alert:new</code>, <code className="text-blue-700 font-bold">device:status</code>
              </p>
            </div>

            {testResult && (
              <div className="p-3 bg-slate-100 rounded-xl text-xs font-medium text-slate-800 border border-slate-200">
                {testResult}
              </div>
            )}

            {/* Architecture Pipeline Quick Reference */}
            <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-[11px] text-slate-700 flex flex-col gap-1.5">
              <span className="font-bold text-[#003f87] flex items-center gap-1">
                🔄 Luồng dữ liệu hệ thống (Pipeline):
              </span>
              <div className="bg-white/80 p-2 rounded-xl border border-blue-100 text-[10px] font-mono text-slate-700 space-y-1">
                <p>1. <span className="font-bold text-blue-900">ESP32 & Camera AI</span> &rarr; Gửi MQTT Broker qua Wi-Fi</p>
                <p>2. <span className="font-bold text-blue-900">Backend / Node-RED</span> &rarr; Lắng nghe MQTT, lưu MongoDB, gửi cảnh báo & gọi Telegram (không dùng SMS)</p>
                <p>3. <span className="font-bold text-blue-900">Backend &rarr; Dashboard</span> &rarr; Phát Socket.IO (<code className="text-emerald-700 font-bold">telemetry:update</code>, <code className="text-red-700 font-bold">alert:new</code>)</p>
              </div>

              <div className="p-2 bg-emerald-100/70 border border-emerald-300 rounded-xl text-[10px] text-emerald-950 font-medium">
                ✅ <strong>100% Không cần Module SIM:</strong> ESP32 chạy thuần Wi-Fi gia đình. Cuộc gọi và cảnh báo được Backend thực hiện qua Telegram Bot API miễn phí trên Internet.
              </div>

              <span className="font-bold text-slate-800 text-[10px] mt-1">📡 MQTT Topics & Socket Events:</span>
              <ul className="list-disc list-inside space-y-0.5 text-slate-600 font-mono text-[10px]">
                <li><span className="text-slate-900 font-bold">Fall Alert:</span> <code className="text-blue-700">home/livingroom/alert/fall</code></li>
                <li><span className="text-slate-900 font-bold">Gas Alert:</span> <code className="text-blue-700">home/&#123;room&#125;/alert/gas</code></li>
                <li><span className="text-slate-900 font-bold">REST:</span> <code className="text-slate-800">GET /api/telemetry/latest</code> (3 phòng + updatedAt)</li>
                <li><span className="text-slate-900 font-bold">Socket Update:</span> <code className="text-emerald-700">&#123; room, sensorType, value, unit, timestamp &#125;</code></li>
              </ul>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-all"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleSaveUrl}
                className="flex-1 py-2.5 rounded-xl bg-[#003f87] hover:bg-[#002f67] text-white font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Lưu & Kết nối</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
