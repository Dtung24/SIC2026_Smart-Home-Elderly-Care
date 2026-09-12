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
import { backendService } from '../services/backendService';

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
  medicationLoading: boolean;
  backendConnected: boolean | null;
  sensors?: SensorState;
  rooms?: RoomCamera[];
  onToggleMedication: (id: string) => void;
  onCallContact: (contact: EmergencyContact) => void;
}

export const HelpScreen: React.FC<HelpScreenProps> = ({
  contacts,
  medications,
  medicationLoading,
  backendConnected,
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

  // Gửi câu hỏi tới AI Agent thật của backend.
  const handleProcessQuery = async (queryText: string) => {
    const q = queryText.trim();

    if (!q) {
      return;
    }

    stopSpeaking();
    setIsSpeaking(false);
    setIsListening(false);
    setTranscriptPreview('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);
    setUserQuery('');

    let reply = '';

    try {
      const result =
        await backendService.askAiAgent(q);

      if (result?.success && result.answer) {
        reply = result.answer;
      }
    } catch (err) {
      console.warn(
        'Không gọi được AI backend:',
        err
      );
    }

    if (!reply) {
      reply =
        'Hiện Tâm An chưa kết nối được với trợ lý AI. ' +
        'Gia đình vui lòng kiểm tra kết nối tới hệ thống và thử lại sau.';
    }

    setIsThinking(false);

    const aiMsg: ChatMessage = {
      id: `ai-${Date.now()}`,
      role: 'assistant',
      text: reply,
      timestamp: new Date().toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, aiMsg]);

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
            {medicationLoading
              ? 'Đang tải...'
              : backendConnected === false
                ? 'Mất kết nối'
                : medications.length > 0
                  ? `${medications.filter((m) => m.taken).length}/${medications.length} đã uống`
                  : 'Chưa có lịch'}
          </span>
        </div>

        <div className="flex flex-col gap-2.5">
          {medicationLoading ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-600 text-center">
              Đang tải lịch uống thuốc hôm nay...
            </div>
          ) : backendConnected === false ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-800 text-center">
              Mất kết nối Backend – chưa thể tải lịch uống thuốc.
            </div>
          ) : medications.length === 0 ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-600 text-center">
              Chưa có lịch uống thuốc cho hôm nay.
            </div>
          ) : (
            medications.map((m) => (
            <div
              key={m.id}
              className={`p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                m.status === 'taken'
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : m.status === 'overdue'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                {m.taken ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                ) : (
                  <Circle
                    className={`w-6 h-6 shrink-0 ${
                      m.status === 'overdue'
                        ? 'text-red-500'
                        : 'text-slate-400'
                    }`}
                  />
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
                    {m.note}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap ${
                    m.status === 'taken'
                      ? 'bg-emerald-200 text-emerald-900'
                      : m.status === 'overdue'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {m.status === 'taken'
                    ? 'Đã uống'
                    : m.status === 'overdue'
                      ? 'Quá giờ'
                      : 'Chưa đến giờ'}
                </span>

                {m.status === 'overdue' && (
                  <button
                    type="button"
                    onClick={() => onToggleMedication(m.id)}
                    className="px-3 py-1.5 rounded-xl bg-[#003f87] text-white text-xs font-bold hover:opacity-90 active:scale-95 transition"
                  >
                    Đã uống thuốc
                  </button>
                )}
              </div>
            </div>
            ))
          )}
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
