import { RoomCamera, SensorState, ActivityLog, EmergencyContact } from '../types';

export const INITIAL_ROOMS: RoomCamera[] = [
  {
    id: 'livingroom',
    name: 'Phòng Khách',
    location: 'Tầng 1 - Khu sinh hoạt chung',
    hasCamera: true,
    cameraTopic: 'home/livingroom/alert/fall',
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
    isLive: true,
    aiStatusText: '',
    aiStatusLevel: 'safe',
    personDetected: true,
    activityNote: '',
    lastMotionTime: '1 phút trước',
  },
  {
    id: 'kitchen',
    name: 'Nhà Bếp',
    location: 'Tầng 1 - Khu vực nấu ăn',
    hasCamera: false,
    aiStatusText: 'Cảm biến Gas & Môi trường an toàn',
    aiStatusLevel: 'safe',
    personDetected: false,
    activityNote: 'Cảm biến giám sát gas/khói & nhiệt độ qua MQTT hoạt động ổn định',
    lastMotionTime: '25 phút trước',
  },
  {
    id: 'staircase',
    name: 'Cầu Thang',
    location: 'Khu vực cầu thang',
    hasCamera: false,
    aiStatusText: 'Cảm biến PIR đang giám sát chuyển động',
    aiStatusLevel: 'safe',
    personDetected: false,
    activityNote: 'Chưa phát hiện chuyển động',
    lastMotionTime: 'Chưa phát hiện',
  },
];

export const INITIAL_SENSOR_STATE: SensorState = {
  gasStatus: 'normal',
  temperature: null,
  humidity: null,
  lastUpdated: 'Chưa có dữ liệu',
  systemStatus: 'safe',
  rooms: {
    livingroom: {
      temperature: null,
      humidity: null,
      motion: null,
      gas: null,
    },
    kitchen: {
      temperature: null,
      humidity: null,
      motion: null,
      gas: null,
    },
    staircase: {
      temperature: null,
      humidity: null,
      motion: false,
      gas: null,
    },
  },
};

export const INITIAL_LOGS: ActivityLog[] = [];

export const INITIAL_CONTACTS: EmergencyContact[] = [
  {
    id: 'contact-1',
    name: 'Nguyễn Vũ Trung Nguyên',
    relation: 'Con trai trưởng (Người chăm sóc)',
    phone: '0913 451 878',
    telegramUsername: 'nguynsiuuu',
    telegramUrl: 'https://t.me/nguynsiuuu',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    isPrimary: true,
    notes: 'Gọi Telegram nhận chuông tức thì - Có thể có mặt trong 10 phút',
  },
  {
    id: 'contact-2',
    name: 'Ngô Gia Bắc',
    relation: 'Con trai thứ (Người chăm sóc)',
    phone: '0367 095 663',
    telegramUsername: 'Bacbg123',
    telegramUrl: 'https://t.me/Bacbg123',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    isPrimary: true,
    notes: 'Gọi Telegram nhận chuông tức thì - Có thể có mặt trong 10 phút',
  },
  {
    id: 'contact-3',
    name: 'BS. Trần Khang',
    relation: 'Bác sĩ gia đình',
    phone: '0906 222 885',
    telegramUsername: 'khangtran667',
    telegramUrl: 'https://t.me/khangtran667',
    avatar: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=200&q=80',
    isPrimary: false,
    notes: 'Bác sĩ Lão Khoa TW - Hỗ trợ tư vấn khẩn qua Telegram',
  },
  
  {
    id: 'contact-sos-115',
    name: 'Cấp Cứu Y Tế 115',
    relation: 'Đường dây khẩn cấp Quốc Gia',
    phone: '115',
    avatar: '',
    isPrimary: false,
    notes: 'Xe cứu thương và sơ cấp cứu',
  },
  {
    id: 'contact-sos-114',
    name: 'Cứu Hỏa & Cứu Nạn 114',
    relation: 'Phòng cháy chữa cháy',
    phone: '114',
    avatar: '',
    isPrimary: false,
    notes: 'Sự cố rò rỉ gas / hỏa hoạn',
  },
];
