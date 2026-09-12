import { useEffect, useState } from 'react';
import { Lightbulb, Loader2, Zap } from 'lucide-react';
import { backendService } from '../services/backendService';
import {
  BackendLightState,
  BackendLightUpdate,
  LightAction,
  LightRoomId,
} from '../types';

const INITIAL_LIGHT_STATE: BackendLightState = {
  livingroom: false,
  kitchen: false,
  staircase: false,
  staircaseMode: 'AUTO',
  updatedAt: null,
};

export function LightControlCard() {
  const [lights, setLights] =
    useState<BackendLightState>(INITIAL_LIGHT_STATE);

  const [busyRoom, setBusyRoom] =
    useState<LightRoomId | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [hasRealState, setHasRealState] =
    useState(false);

  const [backendConnected, setBackendConnected] =
    useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadInitialState = async () => {
      const data = await backendService.fetchLights();

      if (!mounted) return;

      if (data) {
        setLights(data);
        setHasRealState(true);
        setBackendConnected(true);
        setError(null);
      } else {
        setBackendConnected(false);
      }
    };

    loadInitialState();

    const unsubscribeConnection =
      backendService.subscribeConnectionStatus(
        (connected) => {
          if (!mounted) return;

          setBackendConnected(connected);

          if (connected) {
            loadInitialState();
          }
        }
      );

    const unsubscribeLatest =
      backendService.subscribeLightLatest(
        (state: BackendLightState) => {
          if (mounted) {
            setLights(state);
            setHasRealState(true);
            setBackendConnected(true);
            setError(null);
          }
        }
      );

    const unsubscribeUpdate =
      backendService.subscribeLightUpdate(
        (update: BackendLightUpdate) => {
          if (!mounted) return;

          setHasRealState(true);
          setBackendConnected(true);
          setError(null);
          setBusyRoom(null);

          setLights((prev) => {
            const next = {
              ...prev,
              updatedAt: update.timestamp,
            };

            if (typeof update.state === 'boolean') {
              next[update.room] = update.state;
            }

            if (
              update.room === 'staircase' &&
              update.mode
            ) {
              next.staircaseMode = update.mode;
            }

            return next;
          });
        }
      );

    return () => {
      mounted = false;
      unsubscribeConnection();
      unsubscribeLatest();
      unsubscribeUpdate();
    };
  }, []);

  const sendCommand = async (
    room: LightRoomId,
    action: LightAction
  ) => {
    if (backendConnected === false) {
      setError(
        'Backend đang mất kết nối. Chưa thể điều khiển đèn.'
      );
      return;
    }

    setBusyRoom(room);
    setError(null);

    const ok =
      await backendService.controlLight(room, action);

    if (!ok) {
      setError(
        'Không gửi được lệnh điều khiển. Kiểm tra Backend và MQTT.'
      );
    }

    setBusyRoom(null);
  };

  const LightStatus = ({
    on,
  }: {
    on: boolean;
  }) => (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
        on
          ? 'bg-amber-100 text-amber-700'
          : 'bg-slate-100 text-slate-500'
      }`}
    >
      {!hasRealState
        ? 'ĐANG CHỜ'
        : on
          ? 'ĐANG BẬT'
          : 'ĐANG TẮT'}
    </span>
  );

  const CommandButton = ({
    room,
    action,
    active,
    children,
  }: {
    room: LightRoomId;
    action: LightAction;
    active: boolean;
    children: React.ReactNode;
  }) => {
    const loading = busyRoom === room;

    return (
      <button
        type="button"
        disabled={
          loading ||
          backendConnected === false ||
          !hasRealState
        }
        onClick={() => sendCommand(room, action)}
        className={`flex-1 min-h-10 px-3 py-2 rounded-xl text-sm font-semibold transition ${
          active
            ? 'bg-slate-900 text-white shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        } disabled:opacity-50`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
        ) : (
          children
        )}
      </button>
    );
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-amber-600" />
        </div>

        <div>
          <h2 className="font-bold text-base text-slate-900">
            Điều khiển đèn
          </h2>
          <p className="text-xs text-slate-500">
            Điều khiển trực tiếp ESP32 qua MQTT
          </p>
        </div>
      </div>

      {!hasRealState && (
        <div className="mb-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">
          {backendConnected === false
            ? 'Mất kết nối Backend – chưa xác định trạng thái đèn.'
            : 'Đang tải trạng thái đèn thực tế...'}
        </div>
      )}

      <div className="space-y-4">
        <div className="border border-slate-100 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">
              Phòng Khách
            </span>
            <LightStatus on={lights.livingroom} />
          </div>

          <div className="flex gap-2">
            <CommandButton
              room="livingroom"
              action="ON"
              active={lights.livingroom}
            >
              Bật
            </CommandButton>

            <CommandButton
              room="livingroom"
              action="OFF"
              active={!lights.livingroom}
            >
              Tắt
            </CommandButton>
          </div>
        </div>

        <div className="border border-slate-100 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm">
              Nhà Bếp
            </span>
            <LightStatus on={lights.kitchen} />
          </div>

          <div className="flex gap-2">
            <CommandButton
              room="kitchen"
              action="ON"
              active={lights.kitchen}
            >
              Bật
            </CommandButton>

            <CommandButton
              room="kitchen"
              action="OFF"
              active={!lights.kitchen}
            >
              Tắt
            </CommandButton>
          </div>
        </div>

        <div className="border border-slate-100 rounded-2xl p-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="font-semibold text-sm">
                Cầu Thang
              </span>

              <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                <Zap className="w-3 h-3" />
                Chế độ: {lights.staircaseMode}
              </div>
            </div>

            <LightStatus on={lights.staircase} />
          </div>

          <div className="flex gap-2">
            <CommandButton
              room="staircase"
              action="AUTO"
              active={lights.staircaseMode === 'AUTO'}
            >
              Tự động
            </CommandButton>

            <CommandButton
              room="staircase"
              action="ON"
              active={lights.staircaseMode === 'ON'}
            >
              Bật
            </CommandButton>

            <CommandButton
              room="staircase"
              action="OFF"
              active={lights.staircaseMode === 'OFF'}
            >
              Tắt
            </CommandButton>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Chế độ Tự động sử dụng cảm biến PIR và giữ đèn sáng
            theo logic của ESP32.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}
    </section>
  );
}
