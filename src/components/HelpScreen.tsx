import React, { useState, useEffect, useRef } from 'react';
import {
  PhoneCall,
  UserCheck,
  Pill,
  BookOpen,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  Bot,
  HeartHandshake,
  CheckCircle2,
  Circle,
  Mic,
  MicOff,
  Loader2,
  RotateCcw,
  User,
  Radio,
} from 'lucide-react';
import { EmergencyContact, MedicationReminder, RoomCamera, SensorState } from '../types';
import { speakVietnamese, stopSpeaking, playTone } from '../utils/audio';

// Speech recognition type interface for cross-browser support
interface IWindowSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: IWindowSpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: IWindowSpeechRecognition, ev: any) => void) | null;
  onerror: ((this: IWindowSpeechRecognition, ev: any) => void) | null;
  onend: ((this: IWindowSpeechRecognition, ev: Event) => void) | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface HelpScreenProps {
  contacts: EmergencyContact[];
  medications: MedicationReminder[];
  sensors?: SensorState;
  rooms?: RoomCamera[];
  onToggleMedication: (id: string) => void;
  onCallContact: (contact: EmergencyContact) => void;
}

export const HelpScreen: React.FC<HelpScreenProps> = ({
  contacts,
  medications,
  sensors,
  rooms,
  onToggleMedication,
  onCallContact,
}) => {
  const [userQuery, setUserQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      text: 'Chào bạn và gia đình! Tâm An là trợ lý an toàn hỗ trợ theo dõi môi trường sống và sức khỏe của ông bà. Bạn có thể nhấn nút micro bên dưới để trò chuyện bằng giọng nói hoặc chọn các câu hỏi nhanh nhé!',
      timestamp: 'Vừa xong',
    },
  ]);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcriptPreview, setTranscriptPreview] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);
  const [selectedGuide, setSelectedGuide] = useState<string | null>(null);

  const recognitionRef = useRef<IWindowSpeechRecognition | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass() as IWindowSpeechRecognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'vi-VN';

      recognition.onstart = () => {
        setIsListening(true);
        setTranscriptPreview('');
        playTone(660, 'sine', 0.1, 0.1);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const currentText = final || interim;
        setTranscriptPreview(currentText);

        if (final) {
          setUserQuery(final);
          handleProcessQuery(final);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        setTranscriptPreview('');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      stopSpeaking();
    };
  }, [medications, sensors, rooms]);

  // Scroll to bottom when messages update
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, isListening]);

  // Voice toggle
  const toggleListening = () => {
    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
    } else {
      stopSpeaking();
      setIsSpeaking(false);
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.warn('Error starting speech recognition:', e);
        // Fallback simulate voice listening if browser permission is blocked
        setIsListening(true);
        setTranscriptPreview('Đang lắng nghe bạn nói...');
      }
    }
  };

  const handleStopSpeaking = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  // Process user question via Gemini API server endpoint with smart fallback
  const handleProcessQuery = async (queryText: string) => {
    const q = queryText.trim();
    if (!q) return;

    // Stop previous speech & add user message
    stopSpeaking();
    setIsSpeaking(false);
    setIsListening(false);
    setTranscriptPreview('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);
    setUserQuery('');

    const contextPayload = {
      sensors: sensors || { systemStatus: 'safe', aqi: 42, temperature: 26, humidity: 55, gasLevelPpm: 12 },
      rooms: rooms || [],
      medications: medications.map((m) => ({ name: m.name, time: m.time, dosage: m.dosage, taken: m.taken })),
      emergencyContacts: contacts.map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
    };

    let reply = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          context: contextPayload,
          conversationHistory: messages.slice(-4),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        reply = data.reply || '';
      }
    } catch (err) {
      console.warn('Chat request failed, using local assistant logic:', err);
    }

    // Local smart fallback if server is unreachable
    if (!reply) {
      const qLower = q.toLowerCase();
      if (qLower.includes('thuốc') || qLower.includes('uống')) {
        const pending = medications.filter((m) => !m.taken);
        if (pending.length > 0) {
          reply = `Dạ, hôm nay ông bà còn cữ thuốc: ${pending.map((m) => m.name).join(', ')} lúc ${pending[0].time}. Gia đình nhớ nhắc ông bà uống sau bữa ăn nhé ạ!`;
        } else {
          reply = 'Dạ, hôm nay ông bà đã uống đầy đủ các cữ thuốc đúng giờ rồi ạ. Rất tốt ạ!';
        }
      } else if (qLower.includes('bác sĩ') || qLower.includes('khám') || qLower.includes('bệnh')) {
        reply = 'Dạ, Bác sĩ gia đình chăm sóc cho ông bà là BS. Trần Lan (Telegram: @bs_tranlan_eldercare, SĐT: 0988 765 432). Bạn có thể bấm nút Gọi Telegram ngay trong danh bạ bên dưới ạ!';
      } else if (qLower.includes('ngã') || qLower.includes('té') || qLower.includes('đau')) {
        reply = 'Dạ khi phát hiện ông bà trượt ngã, gia đình hãy giữ ông bà nằm yên tĩnh, tránh ngồi dậy đột ngột. Hãy bấm nút KHẨN CẤP màu đỏ để phát báo động và gọi Telegram kết nối người thân ngay!';
      } else if (qLower.includes('gas') || qLower.includes('khí') || qLower.includes('bếp')) {
        reply = 'Dạ nếu phát hiện mùi gas lạ ở bếp, gia đình tuyệt đối không bật công tắc điện, hãy mở toang cửa sổ thông gió và đưa ông bà ra khu vực thoáng mát ngoài phòng khách ngay.';
      } else if (qLower.includes('sim') || qLower.includes('module') || qLower.includes('gsm') || qLower.includes('thẻ sim') || qLower.includes('sim800l')) {
        reply = 'Dạ bạn hoàn toàn yên tâm nhé! Hệ thống 100% KHÔNG CẦN module SIM (như SIM800L/GSM) hay thẻ cước nào trên ESP32. Thiết bị chỉ kết nối Wi-Fi gửi MQTT, cảnh báo và cuộc gọi được Backend thực hiện qua Telegram trên Internet hoàn toàn miễn phí ạ!';
      } else if (qLower.includes('nhà') || qLower.includes('an toàn') || qLower.includes('trạng thái') || qLower.includes('ông bà')) {
        const status = sensors?.systemStatus === 'safe' ? 'rất an toàn' : 'cần lưu ý';
        reply = `Dạ, tình trạng ngôi nhà và các phòng của ông bà hiện tại đang ${status}. Nhiệt độ phòng là ${sensors?.temperature || 26}°C, không khí trong lành, các camera đều hoạt động tốt ạ!`;
      } else {
        reply = `Dạ, Trợ lý Tâm An đã nghe rõ: "${q}". An toàn và sức khỏe của ông bà đang được hệ thống giám sát chu đáo. Bạn có thể hỏi thêm thông tin bất cứ lúc nào ạ!`;
      }
    }

    setIsThinking(false);

    const aiMsg: ChatMessage = {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      text: reply,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, aiMsg]);

    // Automatically speak the reply
    setIsSpeaking(true);
    speakVietnamese(reply, () => {
      setIsSpeaking(false);
    });
  };

  const handleReplayMessage = (text: string) => {
    stopSpeaking();
    setIsSpeaking(true);
    speakVietnamese(text, () => {
      setIsSpeaking(false);
    });
  };

  const safetyGuides = [
    {
      id: 'fall',
      title: 'Cách xử lý khi bị trượt chân hoặc ngã',
      steps: [
        '1. Nằm yên 1-2 phút, hít thở đều để đánh giá xem có bị đau vùng đầu hay xương khớp không.',
        '2. Không cố đứng bật dậy ngay.',
        '3. Nhấn nút KHẨN CẤP màu đỏ trên ứng dụng hoặc vòng đeo tay.',
        '4. Nếu có thể di chuyển, lăn người sang tư thế nằm nghiêng và chống tay từ từ lên ghế.',
      ],
    },
    {
      id: 'gas',
      title: 'Xử lý khi phát hiện mùi Gas bất thường',
      steps: [
        '1. KHÔNG bật/tắt bất kỳ công tắc điện nào (kể cả quạt gió hay bóng đèn).',
        '2. KHÔNG sử dụng diêm, bật lửa hay điện thoại gần khu vực bếp.',
        '3. Mở rộng tất cả cửa sổ và cửa ra vào để thông khí.',
        '4. Khóa van bình gas an toàn và đi ra ngoài phòng khách/sân.',
      ],
    },
    {
      id: 'dizzy',
      title: 'Hướng dẫn khi bị chóng mặt hoặc mệt',
      steps: [
        '1. Ngồi hoặc nằm xuống ngay nơi an toàn, kê chân hơi cao một chút.',
        '2. Uống từng ngụm nhỏ nước ấm hoặc nước đường nhẹ.',
        '3. Hít vào thật sâu bằng mũi và thở chậm ra bằng miệng.',
        '4. Gọi cho con cháu hoặc bấm gọi Bác sĩ gia đình để được tư vấn.',
      ],
    },
    {
      id: 'no-sim-wifi',
      title: 'Kiến trúc kết nối: 100% Không cần Module SIM / GSM',
      steps: [
        '1. ESP32 & Camera AI chỉ cần kết nối Wi-Fi gia đình sẵn có, KHÔNG cần mua thêm module SIM (như SIM800L, GSM) hay trả cước thẻ SIM.',
        '2. Cảm biến và Camera AI gửi dữ liệu, sự kiện té ngã qua giao thức MQTT lên Broker trên mạng Wi-Fi.',
        '3. Backend / Node-RED nhận tín hiệu và tự động kích hoạt Telegram Bot API để gửi cảnh báo và cuộc gọi khẩn cấp qua Internet.',
        '4. Người thân nhận thông báo chuông và có thể gọi Telegram thoại/video qua mạng 4G/Wi-Fi của điện thoại 100% miễn phí cước.',
      ],
    },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-5 pb-28 px-2 sm:px-4 pt-1">
      {/* 1. Header Hub */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-800 shrink-0">
            <HeartHandshake className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Trợ Lý Thoại & Trợ Giúp
            </h2>
            <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5">
              Trò chuyện trực tiếp bằng giọng nói hoặc gọi khẩn cấp
            </p>
          </div>
        </div>

        {/* Live Audio Status Badge */}
        {isSpeaking && (
          <button
            onClick={handleStopSpeaking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-bold animate-pulse cursor-pointer border border-red-200"
          >
            <VolumeX className="w-4 h-4" />
            <span>Dừng đọc</span>
          </button>
        )}
      </div>

      {/* 2. Interactive Voice AI Assistant Card */}
      <div className="bg-gradient-to-br from-[#003f87] via-[#003366] to-[#002244] text-white rounded-3xl p-4 sm:p-6 shadow-xl border border-blue-900/40 relative overflow-hidden flex flex-col gap-4">
        {/* Ambient background decoration */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-400/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none"></div>

        {/* Card Header */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Bot className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-black text-white">
                  Tâm An Voice AI
                </h3>
                <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                  <Radio className="w-3 h-3 animate-pulse" /> Giọng nói 2 chiều
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Trợ lý ảo ân cần - Nhận diện giọng nói tiếng Việt
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setMessages([
                {
                  id: `welcome-${Date.now()}`,
                  role: 'assistant',
                  text: 'Dạ chào bạn và gia đình, cháu là Trợ lý Tâm An. Bạn cần hỗ trợ kiểm tra an toàn hoặc sức khỏe cho ông bà việc gì ạ?',
                  timestamp: 'Vừa xong',
                },
              ]);
              stopSpeaking();
            }}
            title="Bắt đầu lại cuộc trò chuyện"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-blue-100 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Chat Messages Feed Container */}
        <div className="bg-white/95 backdrop-blur-md text-slate-900 rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 max-h-[340px] overflow-y-auto shadow-inner border border-white/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 px-1">
                {msg.role === 'user' ? (
                  <>
                    <span>Bạn (Gia đình)</span>
                    <User className="w-3 h-3 text-blue-600" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-emerald-600" />
                    <span>Trợ lý Tâm An</span>
                  </>
                )}
                <span>• {msg.timestamp}</span>
              </div>

              <div
                className={`p-3.5 rounded-2xl text-sm sm:text-base leading-relaxed max-w-[88%] shadow-xs flex flex-col gap-2 ${
                  msg.role === 'user'
                    ? 'bg-[#003f87] text-white rounded-tr-xs font-semibold'
                    : 'bg-slate-100 text-slate-900 rounded-tl-xs font-medium border border-slate-200/80'
                }`}
              >
                <div>{msg.text}</div>

                {/* Audio playback button on assistant messages */}
                {msg.role === 'assistant' && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <button
                      onClick={() => handleReplayMessage(msg.text)}
                      className="flex items-center gap-1 text-xs font-bold text-[#003f87] hover:text-blue-900 bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200 active:scale-95 transition-all cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Đọc lại</span>
                    </button>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      Tiếng Việt
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Thinking animation state */}
          {isThinking && (
            <div className="flex items-center gap-2 text-slate-600 text-xs font-bold bg-blue-50 p-3 rounded-2xl border border-blue-200 self-start animate-pulse">
              <Loader2 className="w-4 h-4 text-[#003f87] animate-spin" />
              <span>Tâm An đang lắng nghe và suy nghĩ câu trả lời...</span>
            </div>
          )}

          {/* Real-time speech transcription preview */}
          {isListening && transcriptPreview && (
            <div className="flex items-center gap-2 text-blue-900 text-xs font-bold bg-amber-50 p-3 rounded-2xl border border-amber-200 self-end animate-pulse">
              <Mic className="w-4 h-4 text-amber-600 animate-bounce" />
              <span>"{transcriptPreview}"</span>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* 3. Primary Big Microphone Action Area */}
        <div className="flex flex-col items-center justify-center gap-3 pt-1">
          {/* Main Giant Voice Button */}
          <div className="relative flex items-center justify-center">
            {isListening && (
              <>
                <span className="absolute w-24 h-24 rounded-full bg-red-400/30 animate-ping"></span>
                <span className="absolute w-20 h-20 rounded-full bg-red-400/40 animate-pulse"></span>
              </>
            )}

            <button
              id="voice-mic-main-btn"
              onClick={toggleListening}
              className={`w-18 h-18 sm:w-20 sm:h-20 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all cursor-pointer select-none active:scale-90 ${
                isListening
                  ? 'bg-red-600 text-white ring-4 ring-red-300 ring-offset-2 ring-offset-[#003f87]'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-white ring-4 ring-emerald-300/40 hover:scale-105'
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="w-8 h-8 sm:w-9 sm:h-9" />
                  <span className="text-[10px] font-black uppercase mt-0.5 tracking-tighter">
                    Dừng
                  </span>
                </>
              ) : (
                <>
                  <Mic className="w-8 h-8 sm:w-9 sm:h-9" />
                  <span className="text-[10px] font-black uppercase mt-0.5 tracking-tighter">
                    Nói
                  </span>
                </>
              )}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm font-extrabold text-white">
              {isListening
                ? '🔴 Đang lắng nghe bạn nói... (Hãy nói câu hỏi của bạn)'
                : '👉 Chạm vào Micro để trò chuyện với Trợ lý Tâm An'}
            </p>
            <p className="text-[11px] text-blue-200 mt-0.5">
              Hỗ trợ cả gia đình theo dõi an toàn & sức khỏe người cao tuổi
            </p>
          </div>
        </div>

        {/* Quick Sample Voice Prompts (Pills) */}
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="text-xs font-bold text-blue-200 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Câu hỏi gợi ý nhanh (Chạm để hỏi):</span>
          </span>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '💊 Lịch uống thuốc của ông bà?', text: 'Hôm nay ông bà cần uống những loại thuốc gì?' },
              { label: '🏠 Nhà & ông bà có an toàn không?', text: 'Trạng thái ngôi nhà và các phòng của ông bà hiện tại thế nào?' },
              { label: '🚨 Cách xử lý khi ông bà bị ngã?', text: 'Hướng dẫn cách xử lý và sơ cứu khi ông bà bị trượt ngã' },
              { label: '📡 Có cần gắn module SIM không?', text: 'Hệ thống có cần gắn module SIM trên ESP32 không?' },
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleProcessQuery(item.text)}
                className="p-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-bold text-left border border-white/15 transition-all cursor-pointer leading-tight flex items-center gap-1.5"
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Text Input Alternate Option */}
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleProcessQuery(userQuery)}
            placeholder="Hoặc nhập câu hỏi vào đây..."
            className="flex-1 bg-white/90 text-slate-900 placeholder:text-slate-500 border border-white/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <button
            onClick={() => handleProcessQuery(userQuery)}
            disabled={!userQuery.trim() || isThinking}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Gửi</span>
          </button>
        </div>
      </div>

      {/* 3. Primary Emergency Contacts (Large Touch Target Buttons) */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col gap-4">
        <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <UserCheck className="w-6 h-6 text-[#003f87]" />
          <span>Người thân & Y tế khẩn cấp</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contacts.map((c) => (
            <div
              key={c.id}
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                c.isPrimary
                  ? 'bg-emerald-50/70 border-emerald-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                {c.avatar ? (
                  <img
                    src={c.avatar}
                    alt={c.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-red-100 text-red-700 font-extrabold flex items-center justify-center text-lg shadow-sm">
                    {c.name.slice(0, 3)}
                  </div>
                )}
                <div>
                  <h4 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                    {c.name}
                  </h4>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    {c.relation}
                  </p>
                  <p className="text-xs font-mono font-bold text-[#003f87] mt-0.5">
                    {c.phone}
                  </p>
                  {c.telegramUsername && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0088cc] bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full mt-1">
                      <Send className="w-2.5 h-2.5" /> @{c.telegramUsername}
                    </span>
                  )}
                </div>
              </div>

              <button
                id={`call-contact-${c.id}`}
                onClick={() => onCallContact(c)}
                className={`p-3.5 rounded-2xl flex items-center justify-center text-white shadow-md active:scale-90 transition-all cursor-pointer ${
                  c.phone === '115' || c.phone === '114'
                    ? 'bg-[#b10f2b] hover:bg-red-800'
                    : 'bg-[#229ED9] hover:bg-[#1d8cc4]'
                }`}
                title={c.telegramUsername ? `Gọi Telegram cho ${c.name}` : `Gọi ${c.name}`}
              >
                {c.telegramUsername ? (
                  <div className="flex items-center gap-1.5 px-1">
                    <Send className="w-4 h-4 animate-pulse" />
                    <span className="text-xs font-black hidden sm:inline">Gọi Telegram</span>
                  </div>
                ) : (
                  <PhoneCall className="w-5 h-5 animate-pulse" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Medication Tracker Today */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
              <Pill className="w-5 h-5" />
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Lịch Uống Thuốc Của Ông Bà
            </h3>
          </div>
          <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg">
            {medications.filter((m) => m.taken).length}/{medications.length} đã uống
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {medications.map((m) => (
            <div
              key={m.id}
              onClick={() => onToggleMedication(m.id)}
              className={`p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                m.taken
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                {m.taken ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="w-6 h-6 text-slate-400 shrink-0" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-[#003f87]">
                      {m.time}
                    </span>
                    <h4
                      className={`text-base font-bold leading-tight ${
                        m.taken ? 'text-slate-500 line-through' : 'text-slate-900'
                      }`}
                    >
                      {m.name}
                    </h4>
                  </div>
                  <p className="text-xs font-medium text-slate-600 mt-1">
                    {m.dosage} • {m.note}
                  </p>
                </div>
              </div>

              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${
                  m.taken
                    ? 'bg-emerald-200 text-emerald-900'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {m.taken ? 'Đã uống' : 'Chưa uống'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Safety Step-by-Step Guides */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col gap-3.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-[#003f87] flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Sổ Tay An Toàn & Chăm Sóc Người Thân
          </h3>
        </div>

        <div className="flex flex-col gap-2.5">
          {safetyGuides.map((guide) => (
            <div
              key={guide.id}
              className="border border-slate-200 rounded-2xl overflow-hidden"
            >
              <button
                onClick={() =>
                  setSelectedGuide(selectedGuide === guide.id ? null : guide.id)
                }
                className="w-full text-left p-4 bg-slate-50 hover:bg-slate-100 font-bold text-slate-900 flex items-center justify-between gap-2 text-sm sm:text-base cursor-pointer"
              >
                <span>{guide.title}</span>
                <span className="text-xs text-[#003f87] bg-white px-2 py-1 rounded-md border border-slate-200">
                  {selectedGuide === guide.id ? 'Đóng' : 'Xem'}
                </span>
              </button>

              {selectedGuide === guide.id && (
                <div className="p-4 bg-white border-t border-slate-200 flex flex-col gap-2 text-sm text-slate-700">
                  {guide.steps.map((step, idx) => (
                    <p key={idx} className="font-medium leading-relaxed">
                      {step}
                    </p>
                  ))}
                  <button
                    onClick={() => speakVietnamese(guide.steps.join('. '))}
                    className="mt-2 self-start flex items-center gap-1.5 text-xs font-bold text-[#003f87] bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Đọc hướng dẫn này
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
