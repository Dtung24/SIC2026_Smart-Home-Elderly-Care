import React, { useState, useEffect } from 'react';
import { ShieldAlert, Activity, Flame, Thermometer, Droplets, VolumeX, Eye } from 'lucide-react';

export default function DashboardLayout() {
  const [telemetry, setTelemetry] = useState({
    temperature: 27.2,
    humidity: 62.0,
    gas_raw: 350,
    gas_alert: false,
    motion_detected: true,
    buzzer_active: false
  });
  
  const [activeAlert, setActiveAlert] = useState(null);
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.hostname}:5000`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'TELEMETRY_UPDATE') {
        setTelemetry(prev => ({ ...prev, ...data.payload }));
      } else if (data.type === 'EMERGENCY_ALERT') {
        setActiveAlert(data.payload);
      } else if (data.type === 'GAS_ALERT') {
        setTelemetry(prev => ({ ...prev, gas_alert: true }));
      }
    };

    return () => ws.close();
  }, []);

  const handleMuteBuzzer = async () => {
    try {
      await fetch('/api/buzzer/mute', { method: 'POST' });
      setActiveAlert(null);
    } catch (e) {
      console.error("Failed to mute buzzer", e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 font-sans">
      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="p-2 bg-blue-600 rounded-lg text-white">SIC 2026</span>
            Elderly Care Smart Home AI
          </h1>
          <p className="text-sm text-slate-400">Samsung Innovation Campus - IoT Capstone Ecosystem</p>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            ESP32 Nodes Online
          </span>
          <button 
            onClick={handleMuteBuzzer}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition border border-slate-700">
            <VolumeX className="w-4 h-4 text-rose-400" />
            Tắt Còi Hú
          </button>
        </div>
      </header>

      {/* Emergency Alert Modal */}
      {activeAlert && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-rose-950 border-2 border-rose-500 rounded-2xl max-w-lg w-full p-6 text-center shadow-2xl shadow-rose-900/50 animate-bounce">
            <ShieldAlert className="w-16 h-16 text-rose-400 mx-auto mb-4" />
            <h2 className="text-2xl font-black text-white">CẢNH BÁO TÉ NGÃ KHẨN CẤP!</h2>
            <p className="text-rose-200 mt-2 text-sm">
              Camera AI phát hiện tư thế ngã bất thường (Góc nghiêng: {activeAlert.trunk_angle}°).
            </p>
            {activeAlert.image_base64 && (
              <img 
                src={`data:image/jpeg;base64,${activeAlert.image_base64}`} 
                alt="Fall Snapshot" 
                className="mt-4 rounded-xl border border-rose-400 max-h-60 mx-auto object-cover"
              />
            )}
            <div className="mt-6 flex justify-center gap-4">
              <button 
                onClick={handleMuteBuzzer}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition">
                Đã Xác Nhận / Tắt Báo Động
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        {/* Live Camera Feed */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-400" />
              <span className="font-semibold text-slate-200">Live AI Vision Stream (YOLOv8-pose)</span>
            </div>
            <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md">28.5 FPS (Pi 5)</span>
          </div>

          <div className="mt-4 relative bg-black aspect-video rounded-xl overflow-hidden flex items-center justify-center border border-slate-800">
            <img 
              src="/api/camera/stream" 
              alt="Camera Live Stream" 
              className="w-full h-full object-contain"
              onError={(e) => { e.target.style.display='none'; }}
            />
            <span className="text-slate-500 text-sm">Camera Stream Active (Click to Enlarge)</span>
          </div>
        </div>

        {/* Telemetry Cards */}
        <div className="flex flex-col gap-4">
          {/* Temperature & Humidity Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 text-sm mb-3">
              <span className="flex items-center gap-2"><Thermometer className="w-4 h-4 text-amber-400" /> Môi Trường Phòng</span>
              <span className="text-xs text-slate-500">DHT22 Node</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Nhiệt độ</span>
                <p className="text-2xl font-bold text-amber-400 mt-1">{telemetry.temperature}°C</p>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400">Độ ẩm</span>
                <p className="text-2xl font-bold text-cyan-400 mt-1">{telemetry.humidity}%</p>
              </div>
            </div>
          </div>

          {/* Gas & Fire Detection */}
          <div className={`border rounded-2xl p-5 transition ${telemetry.gas_alert ? 'bg-rose-950/40 border-rose-500 animate-pulse' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center justify-between text-slate-400 text-sm mb-2">
              <span className="flex items-center gap-2"><Flame className="w-4 h-4 text-orange-400" /> Khí Gas / Khói (MQ-2)</span>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${telemetry.gas_alert ? 'bg-rose-500 text-white' : 'bg-emerald-500/10 text-emerald-400'}`}>
                {telemetry.gas_alert ? 'NGUY HIỂM' : 'AN TOÀN'}
              </span>
            </div>
            <p className="text-3xl font-extrabold text-slate-100 mt-2">{telemetry.gas_raw} <span className="text-sm font-normal text-slate-400">ADC Index</span></p>
          </div>

          {/* Motion & Presence */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 text-sm mb-2">
              <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-purple-400" /> Chuyển Động (PIR)</span>
              <span className="text-xs text-slate-500">HC-SR501</span>
            </div>
            <p className={`text-lg font-bold mt-2 ${telemetry.motion_detected ? 'text-purple-400' : 'text-slate-500'}`}>
              {telemetry.motion_detected ? 'Đang có người di chuyển' : 'Không có chuyển động gần đây'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
