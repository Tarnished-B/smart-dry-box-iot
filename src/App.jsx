import { useState, useEffect, useRef } from 'react';
import { ref, onValue, query, limitToLast } from 'firebase/database';
import { database } from './firebase';
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import DeviceTab from './DeviceTab';
import toast, { Toaster } from 'react-hot-toast';
import { Bell, Flame, Wind, Info, AlertTriangle, Droplets, Activity } from 'lucide-react';

// --- CUSTOM HOOK: Hiệu ứng đếm số chạy mượt mà ---
function useAnimatedNumber(value, duration = 1000) {
  const numericValue = Number(value) || 0;
  const [displayValue, setDisplayValue] = useState(numericValue);

  useEffect(() => {
    let startTime;
    const startValue = displayValue;
    const endValue = numericValue;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;
      const percent = Math.min(progress / duration, 1);

      const easeOut = 1 - Math.pow(1 - percent, 4);
      const currentVal = startValue + (endValue - startValue) * easeOut;

      setDisplayValue(currentVal);
      if (percent < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericValue]);

  return displayValue;
}

function ConnectionBadge({ lastSync, isDark }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const checkStatus = () => {
      if (!lastSync) {
        setIsOnline(false);
        return;
      }
      const timeDiff = Date.now() - lastSync;
      setIsOnline(timeDiff <= 25000);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);

    return () => clearInterval(interval);
  }, [lastSync]);

  return (
    <div className={`flex items-center gap-3 mt-2 mx-auto md:mx-0 px-4 py-1.5 rounded-full border backdrop-blur-md w-fit transition-all duration-1000 
      ${isOnline
        ? isDark ? 'bg-white/5 border-white/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-white border-slate-200 shadow-sm'
        : isDark ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-red-50 border-red-200 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
      }`}>
      <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse' : 'bg-red-500 shadow-[0_0_12px_#ef4444]'} `}></span>
      <span className={`text-[10px] font-mono tracking-[0.4em] uppercase font-bold opacity-70 ${isOnline ? (isDark ? 'text-slate-300' : 'text-slate-500') : 'text-red-500'}`}>
        {isOnline ? "HỆ THỐNG ONLINE" : "MẤT KẾT NỐI MẠCH"}
      </span>
    </div>
  );
}

function App() {
  const [data, setData] = useState({ isLoaded: false, NhietDo: 0, DoAm: 0, Devices: { Quat: false, TamHutAm: false, VachNganNgoai: false, VachNganTrong: false }, System: { Hop: 1, TrangThaiCamBien: true, LastSync: 0 } });
  const [activeTab, setActiveTab] = useState(0);
  const [slideClass, setSlideClass] = useState('slide-from-right');
  const [history, setHistory] = useState([]);

  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [hasUnreadLogs, setHasUnreadLogs] = useState(() => {
    return localStorage.getItem('dashboard-unread') === 'true';
  });
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowLogs(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lưu thiết lập Theme của người dùng vào Local Storage mỗi khi có sự thay đổi
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('dashboard-theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Lưu thiết lập Theme của người dùng vào Local Storage mỗi khi có sự thay đổi
  useEffect(() => {
    localStorage.setItem('dashboard-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('dashboard-unread', hasUnreadLogs);
  }, [hasUnreadLogs]);

  useEffect(() => {
    if (data.System.TrangThaiCamBien === false) {
      toast.error('Lỗi Cảm Biến: Mất kết nối hoặc hỏng cảm biến!', { id: 'sensor-error' });
    }
    if (data.NhietDo > 50) {
      toast.error(`CẢNH BÁO: Nhiệt độ quá cao (${data.NhietDo}°C)!`, { id: 'temp-error' });
    }
  }, [data.System.TrangThaiCamBien, data.NhietDo]);

  useEffect(() => {
    const logsQuery = query(ref(database, 'DryBox/SystemLogs'), limitToLast(30));
    const unsubscribe = onValue(
      logsQuery,
      (snapshot) => {
        const raw = snapshot.val();
        if (!raw) {
          setLogs([]);
          return;
        }

        const nextLogs = Object.entries(raw)
          .map(([id, item]) => {
            const action = String(item?.action || '').trim();
            const ts = Number(item?.timestamp) || 0;
            if (!action) return null;

            const lowAction = action.toLowerCase();
            const type = lowAction.includes('hút ẩm')
              ? 'dry'
              : lowAction.includes('quạt') || lowAction.includes('tản nhiệt')
                ? 'cool'
                : lowAction.includes('lỗi') || lowAction.includes('error')
                  ? 'error'
                  : 'info';

            const time = ts > 0
              ? new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '--:--:--';

            return {
              id,
              type,
              title: action,
              message: 'Đồng bộ từ Firebase Realtime Database',
              time,
              timestamp: ts
            };
          })
          .filter(Boolean)
          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        setLogs(nextLogs);
        if (nextLogs.length > 0 && !showLogs) {
          setHasUnreadLogs(true);
        }
      },
      (error) => {
        console.error('Không thể lắng nghe /DryBox/SystemLogs:', error);
      }
    );

    return () => unsubscribe();
  }, [showLogs]);

  useEffect(() => {
    const dryBoxRef = ref(database, 'DryBox');
    const unsubscribe = onValue(dryBoxRef, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        const temp = Number(val.NhietDo) || 0;
        const hum = Number(val.DoAm) || 0;
        setData({ isLoaded: true, NhietDo: temp, DoAm: hum, Devices: val.Devices || {}, System: val.System || {} });

        const now = new Date();
        const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        // Tăng lên 30 điểm dữ liệu cho Chart mượt và dày đặc hơn
        setHistory(prev => {
          if (prev.length > 0 && prev[prev.length - 1].time === timeStr) return prev;
          return [...prev, { time: timeStr, temp: temp, hum: hum }].slice(-30);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className={`min-h-screen flex flex-col items-center p-2 sm:p-6 md:p-10 transition-colors duration-1000 ease-in-out relative overflow-hidden font-sans tracking-tight ${isDarkMode ? 'bg-[#050014] text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      <Toaster position="top-right" toastOptions={{ style: { background: isDarkMode ? '#1e293b' : '#fff', color: isDarkMode ? '#fff' : '#0f172a', borderRadius: '16px', backdropFilter: 'blur(10px)' } }} />

      {/* 1A. LIGHT MODE BACKGROUND GRADIENT */}
      <div className={`absolute inset-0 z-0 pointer-events-none transition-opacity duration-1000 ease-in-out bg-gradient-to-br from-orange-50 via-slate-50 to-blue-50 ${isDarkMode ? 'opacity-0' : 'opacity-100'}`}></div>

      {/* 1B. DARK MODE LAYERED BACKGROUND */}
      <div className={`absolute inset-0 z-0 pointer-events-none overflow-hidden transition-opacity duration-1000 ease-in-out ${isDarkMode ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-[#0d4761]/80 via-transparent to-[#380940]/80"></div>

        {/* Cyan & Purple Light Spots: Giảm blur và size trên mobile để tăng FPS */}
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] sm:w-[60vw] sm:h-[60vw] bg-cyan-500/10 sm:bg-cyan-500/15 blur-[80px] sm:blur-[160px] rounded-full mix-blend-screen transform-gpu"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[80vw] h-[80vw] sm:w-[60vw] sm:h-[60vw] bg-fuchsia-500/10 sm:bg-fuchsia-500/15 blur-[80px] sm:blur-[160px] rounded-full mix-blend-screen transform-gpu"></div>

      </div>

      {/* HEADER */}
      <div className="w-full max-w-7xl flex flex-col md:flex-row items-center justify-center md:justify-between space-y-4 md:space-y-0 text-center md:text-left mb-6 md:mb-10 z-20">

        {/* TITLE & BADGE */}
        <div className="flex flex-col items-center md:items-start gap-2 sm:gap-3 w-full md:w-auto">
          <h1 className="text-[1.35rem] sm:text-4xl md:text-5xl font-black tracking-tighter uppercase italic drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-1000">
            HỘP CHỐNG ẨM <span className="relative inline-block not-italic">
              <span className={`text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-rose-500 to-indigo-600 filter drop-shadow-[0_0_10px_rgba(244,63,94,0.3)] transition-opacity duration-1000 ${isDarkMode ? 'opacity-0' : 'opacity-100'}`}>THÔNG MINH</span>
              <span className={`absolute top-0 left-0 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 filter drop-shadow-[0_0_10px_rgba(6,182,212,0.4)] transition-opacity duration-1000 ${isDarkMode ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true">THÔNG MINH</span>
            </span>
          </h1>
          <div className="mx-auto md:mx-0 transform scale-[0.9] md:scale-100">
            <ConnectionBadge lastSync={data.System.LastSync} isDark={isDarkMode} />
          </div>
        </div>

        {/* CONTROLS TOOLBAR (WEATHER, BELL, THEME) */}
        <div className="flex flex-row items-center justify-center md:justify-end w-full md:w-auto mt-2 md:mt-0">
          <div
            className={`flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-2xl border backdrop-blur-2xl transition-all duration-500
              ${isDarkMode ? 'bg-white/5 border-white/10 shadow-[0_10px_35px_rgba(0,0,0,0.45)]' : 'bg-white/70 border-slate-200 shadow-sm'}`}
          >
            <WeatherWidget isDark={isDarkMode} variant="toolbar" />

            <div className={`w-px h-8 mx-0.5 ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />

            {/* BELL NOTIFICATIONS */}
            <div className="relative z-50" ref={dropdownRef}>
              <button
                onClick={() => {
                  setShowLogs(!showLogs);
                  if (!showLogs) setHasUnreadLogs(false);
                }}
                className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 border backdrop-blur-md outline-none active:scale-[0.97]
                  ${isDarkMode ? 'bg-white/8 hover:bg-white/15 border-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'}`}
              >
                <Bell size={18} />
                {hasUnreadLogs && <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]"></span>}
              </button>

              {/* LOG DROPDOWN — VERTICAL TIMELINE */}
              {showLogs && (
                <div className={`absolute top-full right-0 md:right-0 -mr-16 sm:mr-0 mt-3 w-[90vw] sm:w-96 rounded-2xl border backdrop-blur-2xl shadow-2xl
                  ${isDarkMode ? 'bg-[#050014]/90 border-white/10 text-white' : 'bg-white/90 border-slate-200 text-slate-800'}`}>

                  {/* CARET POINTER */}
                  <div className={`absolute -top-1.5 right-[72px] sm:right-[14px] w-3 h-3 rotate-45 border-t border-l 
                    ${isDarkMode ? 'bg-[#050014] border-white/10' : 'bg-white border-slate-200'}`}
                  />

                  {/* HEADER */}
                  <div className={`flex items-center justify-between px-4 pt-4 pb-3 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-100'}`}>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-60">Nhật Ký Hệ Thống</h3>
                    <div />
                  </div>

                  {/* TIMELINE SCROLL AREA */}
                  <div
                    className="px-4 pt-4 pb-4 max-h-[26rem] overflow-y-auto"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {logs.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 py-8 opacity-40">
                        <Activity size={28} />
                        <p className="text-xs font-bold uppercase tracking-widest">Chưa có hoạt động nào</p>
                      </div>
                    ) : (
                      <div className="relative flex flex-col gap-0">
                        {/* Vertical connecting line */}
                        <div className={`absolute left-[18px] top-4 bottom-4 w-px ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />

                        {logs.map((log, idx) => {
                          // Resolve icon + color per log type
                          const typeMap = {
                            dry: { Icon: Flame, color: 'text-orange-400', bg: isDarkMode ? 'bg-orange-500/15 border-orange-500/25' : 'bg-orange-50 border-orange-200', glow: 'shadow-[0_0_10px_rgba(249,115,22,0.45)]' },
                            cool: { Icon: Wind, color: 'text-cyan-400', bg: isDarkMode ? 'bg-cyan-500/15 border-cyan-500/25' : 'bg-cyan-50 border-cyan-200', glow: 'shadow-[0_0_10px_rgba(34,211,238,0.45)]' },
                            dehumidify: { Icon: Droplets, color: 'text-blue-400', bg: isDarkMode ? 'bg-blue-500/15 border-blue-500/25' : 'bg-blue-50 border-blue-200', glow: 'shadow-[0_0_10px_rgba(59,130,246,0.45)]' },
                            error: { Icon: AlertTriangle, color: 'text-red-400', bg: isDarkMode ? 'bg-red-500/15 border-red-500/25' : 'bg-red-50 border-red-200', glow: 'shadow-[0_0_10px_rgba(239,68,68,0.45)]' },
                            info: { Icon: Info, color: isDarkMode ? 'text-slate-300' : 'text-slate-500', bg: isDarkMode ? 'bg-white/8 border-white/10' : 'bg-slate-50 border-slate-200', glow: '' },
                          };
                          const entry = typeMap[log.type] || typeMap.info;
                          const { Icon, color, bg, glow } = entry;
                          const isLast = idx === logs.length - 1;

                          return (
                            <div
                              key={log.id || idx}
                              className={`relative flex items-start gap-4 py-3 px-1 rounded-xl transition-all duration-200 cursor-default group/item
                                ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50/80'}`}
                            >
                              {/* Icon node */}
                              <div className={`relative z-10 flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-300 ${bg} ${glow} group-hover/item:scale-110`}>
                                <Icon size={15} className={color} />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0 pt-0.5">
                                <p className={`text-[11px] font-black leading-snug truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                                  {log.title}
                                </p>
                                <p className={`text-[10px] mt-0.5 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {log.message}
                                </p>
                                <p className={`text-[9px] mt-1 font-mono tracking-wider ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                                  {log.time}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ENABLE SWITCH */}
            <div className="flex items-center gap-2 sm:gap-3 pl-0.5">
              <span className="hidden sm:inline-block text-[10px] font-black tracking-[0.35em] uppercase opacity-40">GIAO DIỆN</span>
              <div
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`w-12 sm:w-16 h-6 sm:h-8 flex items-center rounded-full p-1 cursor-pointer transition-all duration-500 border backdrop-blur-md
                  ${isDarkMode ? 'bg-white/10 border-white/15 shadow-[inset_0_2px_12px_rgba(0,0,0,0.55)] hover:bg-white/15' : 'bg-slate-100 border-slate-200 shadow-inner hover:bg-slate-200'}`}
              >
                <div className={`w-4 h-4 sm:w-6 sm:h-6 rounded-full shadow-[0_5px_15px_rgba(0,0,0,0.4)] transform transition-transform duration-500 flex justify-center items-center ${isDarkMode ? 'translate-x-6 sm:translate-x-7 bg-gradient-to-br from-indigo-400 to-purple-600 text-white' : 'translate-x-0 bg-white text-orange-500'}`}>
                  {isDarkMode ? <MoonIcon size="10" className="sm:w-[12px] sm:h-[12px] w-[10px] h-[10px]" /> : <SunIcon size="10" className="sm:w-[12px] sm:h-[12px] w-[10px] h-[10px]" />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END HEADER */}

      <div className="w-full max-w-7xl z-10">

        {/* THANH TAB — SLIDING PILL */}
        <div className="w-full overflow-x-auto scrollbar-hide pb-2 -mb-2 md:pb-0 md:mb-8 flex md:justify-start justify-center">
          <div className={`relative flex mb-4 md:mb-0 p-1.5 rounded-full w-fit border backdrop-blur-md ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'}`}>
            {/* Sliding background — dùng left/right để khớp chính xác với padding */}
            <div className={`absolute top-1.5 bottom-1.5 rounded-full transition-all duration-500 ease-out pointer-events-none
              ${isDarkMode ? 'bg-white/15 shadow-[0_2px_12px_rgba(0,0,0,0.5)]' : 'bg-white shadow-md'}
              ${activeTab === 0 ? 'left-1.5 right-1/2' : 'left-1/2 right-1.5'}`} />
            {['Cảm Biến & Phân Tích', 'Điều Khiển Thiết Bị'].map((tab, i) => (
              <button key={i} onClick={() => {
                setSlideClass(i > activeTab ? 'slide-from-right' : 'slide-from-left');
                setActiveTab(i);
              }}
                className={`relative z-10 whitespace-nowrap px-4 sm:px-6 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest cursor-pointer rounded-full
                  transition-all duration-500 ease-out
                  ${activeTab !== i ? (isDarkMode ? 'hover:bg-white/5 active:bg-white/8' : 'hover:bg-white/70 active:bg-white') : ''}
                  ${activeTab === i
                    ? isDarkMode ? 'text-white' : 'text-slate-800'
                    : isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-600'
                  }`}>
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 0 && (
          <div key="tab0" className={`space-y-8 ${slideClass}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <PremiumInteractiveCard label="Nhiệt Độ" value={data.NhietDo} unit="°C" type="temp" isDark={isDarkMode} />
              <PremiumInteractiveCard label="Độ Ẩm" value={data.DoAm} unit="%" type="hum" isDark={isDarkMode} />
            </div>
            <SmartInsightsRow data={data} isDark={isDarkMode} />
            <PremiumChartCard history={history} isDark={isDarkMode} />
          </div>
        )}

        {activeTab === 1 && (
          <div key="tab1" className={slideClass}>
            <DeviceTab devices={data.Devices} system={data.System} isDark={isDarkMode} />
          </div>
        )}

      </div>
    </div>
  );
}

// ==========================================
// COMPONENT 1: CARD THÔNG SỐ (GLASSMORPHISM + GLOW)
// ==========================================
function PremiumInteractiveCard({ label, value, unit, type, isDark }) {
  const isTemp = type === 'temp';
  const animatedValue = useAnimatedNumber(value);
  const watermarkKey = isTemp ? 'temp' : 'hum';

  const [isMobileInView, setIsMobileInView] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (window.innerWidth < 768) {
          setIsMobileInView(entry.isIntersecting);
        } else {
          setIsMobileInView(false);
        }
      },
      { threshold: 0.6 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const lightGradient = isTemp ? 'from-amber-400 via-orange-500 to-rose-500' : 'from-sky-400 via-blue-500 to-indigo-600';
  const darkGradient = isTemp ? 'from-cyan-400 to-blue-500' : 'from-fuchsia-400 to-purple-500';

  const glowColorInner = isTemp ? 'rgba(34, 211, 238, 0.15)' : 'rgba(217, 70, 239, 0.15)';

  // Trạng thái (Data Meaning) chuyên sâu hơn
  const numericValue = Number(value) || 0;
  const getStatus = () => {
    if (isTemp) {
      if (numericValue < 30) return { text: 'OPTIMAL', class: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
      if (numericValue < 40) return { text: 'ELEVATED', class: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' };
      return { text: 'CRITICAL', class: 'text-red-400 border-red-500/30 bg-red-500/10 animate-pulse' };
    } else {
      if (numericValue < 50) return { text: 'OPTIMAL', class: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
      if (numericValue < 75) return { text: 'ELEVATED', class: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' };
      return { text: 'CRITICAL', class: 'text-red-400 border-red-500/30 bg-red-500/10 animate-pulse' };
    }
  };
  const status = getStatus();

  const outerGlowClass = isDark
    ? (isTemp ? 'md:hover:shadow-[0_0_50px_rgba(34,211,238,0.4)] data-[active=true]:shadow-[0_0_50px_rgba(34,211,238,0.4)]' : 'md:hover:shadow-[0_0_50px_rgba(217,70,239,0.4)] data-[active=true]:shadow-[0_0_50px_rgba(217,70,239,0.4)]')
    : (isTemp ? 'md:hover:shadow-[0_0_50px_rgba(249,115,22,0.4)] data-[active=true]:shadow-[0_0_50px_rgba(249,115,22,0.4)]' : 'md:hover:shadow-[0_0_50px_rgba(37,99,235,0.4)] data-[active=true]:shadow-[0_0_50px_rgba(37,99,235,0.4)]');

  return (
    <div
      ref={cardRef}
      data-active={isMobileInView}
      className={`
        relative rounded-[2.5rem] border overflow-hidden group transition-all duration-700 md:hover:-translate-y-1.5 data-[active=true]:-translate-y-1.5 cursor-pointer transform-gpu
        ${isDark ? 'border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.4)]' : 'border-slate-200 shadow-xl'}
        ${outerGlowClass}
      `}
    >
      {/* LỚP KÍNH GLASSMORPHISM: Giảm blur trên mobile (md) thay vì 2xl */}
      <div
        className={`relative isolate z-10 w-full h-full rounded-[inherit] p-4 sm:p-8 md:p-12 flex flex-col justify-between overflow-hidden transition-all duration-700
        ${isDark ? 'backdrop-blur-lg sm:backdrop-blur-2xl' : 'backdrop-blur-lg'}
      `}
      >
        {/* Base background (smooth gradient to avoid vertical banding) */}
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-700
            ${isDark
              ? 'bg-gradient-to-br from-slate-900/45 via-slate-900/15 to-slate-950/45 opacity-100 md:group-hover:opacity-100 group-data-[active=true]:opacity-100'
              : 'bg-gradient-to-br from-white/90 via-white/60 to-white/90 opacity-100'
            }`}
        />

        {/* Soft shine/reflection (no hard widths; smooth gradient only) */}
        <div
          className={`absolute inset-0 pointer-events-none opacity-0 md:group-hover:opacity-100 group-data-[active=true]:opacity-100 transition-opacity duration-700
            ${isDark ? 'bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.08),transparent)]' : 'bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.25),transparent)]'}
            [transform:translateX(-30%)_skewX(-12deg)]`}
        />

        {/* Watermark icon (same motion + light/dark color swap like old T/H) */}
        <div
          className="absolute bottom-4 right-4 pointer-events-none z-0 transition-opacity duration-700 opacity-15 md:group-hover:opacity-25 group-data-[active=true]:opacity-25"
          aria-hidden="true"
        >
          <div className="relative">
            {/* Light mode gradient watermark */}
            <svg
              className={`w-16 h-16 ${isDark ? 'opacity-0' : 'opacity-100'} transition-opacity duration-1000`}
              viewBox="0 0 24 24"
              fill="none"
              stroke={`url(#wmLight-${watermarkKey})`}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <defs>
                <linearGradient id={`wmLight-${watermarkKey}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={isTemp ? '#fbbf24' : '#38bdf8'} stopOpacity="1" />
                  <stop offset="50%" stopColor={isTemp ? '#f97316' : '#3b82f6'} stopOpacity="1" />
                  <stop offset="100%" stopColor={isTemp ? '#f43f5e' : '#4f46e5'} stopOpacity="1" />
                </linearGradient>
              </defs>
              {isTemp ? (
                <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
              ) : (
                <>
                  <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
                  <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
                </>
              )}
            </svg>

            {/* Dark mode gradient watermark */}
            <svg
              className={`absolute inset-0 w-16 h-16 ${isDark ? 'opacity-100' : 'opacity-0'} transition-opacity duration-1000`}
              viewBox="0 0 24 24"
              fill="none"
              stroke={`url(#wmDark-${watermarkKey})`}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <defs>
                <linearGradient id={`wmDark-${watermarkKey}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={isTemp ? '#22d3ee' : '#e879f9'} stopOpacity="1" />
                  <stop offset="100%" stopColor={isTemp ? '#3b82f6' : '#a855f7'} stopOpacity="1" />
                </linearGradient>
              </defs>
              {isTemp ? (
                <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
              ) : (
                <>
                  <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
                  <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
                </>
              )}
            </svg>
          </div>
        </div>

        <div className="flex justify-between items-center mb-10 relative z-20">
          <h3 className={`text-[11px] font-black uppercase tracking-[0.5em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</h3>
          <div className={`px-4 py-1.5 rounded-full border text-[9px] font-black tracking-widest uppercase transition-all duration-500 backdrop-blur-md ${status.class}`}>
            {status.text}
          </div>
        </div>

        <div className="relative z-20 transition-transform md:group-hover:translate-x-2 group-data-[active=true]:translate-x-2 duration-500 mt-2">
          <div className="relative flex items-baseline gap-4 pr-10 sm:pr-0 w-full">
            <div className={`flex items-baseline gap-2 sm:gap-4 transition-opacity duration-1000 ${isDark ? 'opacity-0' : 'opacity-100'} w-full`}>
              <span className={`text-6xl sm:text-7xl md:text-8xl font-black tracking-tight leading-normal text-transparent bg-clip-text bg-gradient-to-r ${lightGradient} pb-2 pr-2 sm:pr-4`}>
                {Number(animatedValue).toFixed(1)}
              </span>
              <span className={`text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r ${lightGradient} italic pr-3 sm:pr-0`}>{unit}</span>
            </div>

            <div className={`absolute top-0 left-0 flex items-baseline gap-2 sm:gap-4 transition-opacity duration-1000 ${isDark ? 'opacity-100' : 'opacity-0'} w-full`}>
              <span
                className={`text-6xl sm:text-7xl md:text-8xl font-black tracking-tight leading-normal text-transparent bg-clip-text bg-gradient-to-r ${darkGradient} pb-2 pr-2 sm:pr-4`}
                style={{ filter: `drop-shadow(0 0 15px ${glowColorInner})` }}
              >
                {Number(animatedValue).toFixed(1)}
              </span>
              <span className={`text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r ${darkGradient} italic pr-3 sm:pr-0`}>{unit}</span>
            </div>
          </div>
        </div>

        {/* Thanh Gạch Dưới Tĩnh: Mặc định ngắn, Hover thì dài ra */}
        <div className="relative mt-2 h-1.5 w-16 md:group-hover:w-32 group-data-[active=true]:w-32 transition-all duration-700 z-20">
          <div className={`absolute inset-0 rounded-full transition-opacity duration-1000 bg-gradient-to-r ${lightGradient} ${isDark ? 'opacity-0' : 'opacity-100'}`}></div>
          <div className={`absolute inset-0 rounded-full transition-opacity duration-1000 bg-gradient-to-r ${darkGradient} ${isDark ? 'opacity-100' : 'opacity-0'} shadow-[0_0_15px_currentColor]`}></div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT 1.5: SMART INSIGHTS (COMPACT + PREMIUM)
// ==========================================
function SmartInsightsRow({ data, isDark }) {
  const temp = Number(data?.NhietDo) || 0;
  const hum = Number(data?.DoAm) || 0;
  const [insightData, setInsightData] = useState({
    temperature: "",
    humidity: "",
    summary: "Đang phân tích dữ liệu..."
  });
  const [animateInsight, setAnimateInsight] = useState(false);
  const [aiStatus, setAiStatus] = useState('waiting');
  const [lastAiUpdatedAt, setLastAiUpdatedAt] = useState(null);

  const TEMP_MIN = 24;
  const TEMP_MAX = 28;
  const HUM_MIN = 40;
  const HUM_MAX = 50;

  const insights = [];

  if (temp > TEMP_MAX + 2) {
    insights.push({ kind: 'temp', title: 'Nhiệt độ', text: `đang cao hơn vùng mục tiêu ${(temp - TEMP_MAX).toFixed(1)}°C` });
  } else if (temp > TEMP_MAX) {
    insights.push({ kind: 'temp', title: 'Nhiệt độ', text: `hơi cao hơn vùng lưu trữ lý tưởng` });
  } else if (temp < TEMP_MIN - 2) {
    insights.push({ kind: 'temp', title: 'Nhiệt độ', text: `đang thấp hơn vùng mục tiêu ${(TEMP_MIN - temp).toFixed(1)}°C` });
  } else if (temp < TEMP_MIN) {
    insights.push({ kind: 'temp', title: 'Nhiệt độ', text: `thấp nhẹ so với vùng lưu trữ lý tưởng` });
  } else {
    insights.push({ kind: 'ok', title: 'Nhiệt độ', text: 'đang trong vùng tối ưu' });
  }

  if (hum > HUM_MAX + 6) {
    insights.push({ kind: 'hum', title: 'Độ ẩm', text: `cao vượt vùng tối ưu ${(hum - HUM_MAX).toFixed(0)}%` });
  } else if (hum > HUM_MAX) {
    insights.push({ kind: 'hum', title: 'Độ ẩm', text: `cao nhẹ hơn vùng mục tiêu` });
  } else if (hum < HUM_MIN - 8) {
    insights.push({ kind: 'hum', title: 'Độ ẩm', text: `thấp hơn vùng tối ưu ${(HUM_MIN - hum).toFixed(0)}%` });
  } else if (hum < HUM_MIN) {
    insights.push({ kind: 'hum', title: 'Độ ẩm', text: `thấp nhẹ hơn vùng mục tiêu` });
  } else {
    insights.push({ kind: 'ok', title: 'Độ ẩm', text: 'đang cân bằng tốt' });
  }

  const localSummary = (() => {
    const tempInRange = temp >= TEMP_MIN && temp <= TEMP_MAX;
    const humInRange = hum >= HUM_MIN && hum <= HUM_MAX;
    if (tempInRange && humInRange) {
      return 'Điều kiện đang trong vùng mục tiêu, dao động nhỏ theo thời gian thực.';
    }
    return 'Điều kiện môi trường đang dao động và chưa ổn định hoàn toàn.';
  })();

  const localTemperatureText = insights[0]?.text || 'đang cập nhật...';
  const localHumidityText = insights[1]?.text || 'đang cập nhật...';
  const hasInsightData = Boolean(
    insightData?.temperature?.trim() &&
    insightData?.humidity?.trim() &&
    insightData?.summary?.trim()
  );
  const useAiAnalysis = aiStatus === 'online' || hasInsightData;
  const displayedTemperatureText = useAiAnalysis
    ? (insightData.temperature || localTemperatureText)
    : localTemperatureText;
  const displayedHumidityText = useAiAnalysis
    ? (insightData.humidity || localHumidityText)
    : localHumidityText;
  const displayedSummaryText = useAiAnalysis
    ? (insightData.summary || localSummary)
    : localSummary;

  useEffect(() => {
    const insightRef = ref(database, 'ai_insight/latest');
    const unsubscribe = onValue(
      insightRef,
      (snapshot) => {
        const val = snapshot.val();
        if (!val) {
          setAiStatus('waiting');
          return;
        }

        const nextTemperature = typeof val.temperature === 'string' ? val.temperature.trim() : '';
        const nextHumidity = typeof val.humidity === 'string' ? val.humidity.trim() : '';
        const nextSummary = typeof val.summary === 'string' ? val.summary.trim() : '';

        if (!nextTemperature || !nextHumidity || !nextSummary) {
          console.warn('Dữ liệu /ai_insight/latest thiếu trường bắt buộc.');
          setAiStatus('error');
          return;
        }

        setInsightData({
          temperature: nextTemperature,
          humidity: nextHumidity,
          summary: nextSummary
        });
        setAiStatus('online');

        const tsCandidate = val.timestamp;
        const tsNumber = Number(tsCandidate);
        setLastAiUpdatedAt(Number.isFinite(tsNumber) && tsNumber > 0 ? tsNumber : Date.now());
      },
      (error) => {
        console.error('Không thể lắng nghe /ai_insight/latest:', error);
        setAiStatus('error');
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setAnimateInsight(true);
    const timer = setTimeout(() => setAnimateInsight(false), 650);
    return () => clearTimeout(timer);
  }, [insightData]);

  const accentClass = (kind) => {
    if (kind === 'temp') return isDark ? 'border-cyan-500/20 from-cyan-400/16 to-blue-500/10' : 'border-amber-200 from-amber-400/18 to-rose-500/10';
    if (kind === 'hum') return isDark ? 'border-fuchsia-500/20 from-fuchsia-400/16 to-purple-500/10' : 'border-sky-200 from-sky-400/18 to-indigo-500/10';
    return isDark ? 'border-white/10 from-white/8 to-white/5' : 'border-slate-200 from-white/70 to-white/40';
  };

  const resolvedAiStatus = (() => {
    if (hasInsightData) return 'online';
    if (aiStatus === 'error') return 'error';
    return 'waiting';
  })();

  const statusBadgeClass = (() => {
    if (resolvedAiStatus === 'online') {
      return isDark
        ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
        : 'bg-emerald-50 border-emerald-200 text-emerald-700';
    }
    if (resolvedAiStatus === 'waiting') {
      return isDark
        ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
        : 'bg-amber-50 border-amber-200 text-amber-700';
    }
    if (resolvedAiStatus === 'error') {
      return isDark
        ? 'bg-red-500/15 border-red-400/30 text-red-300'
        : 'bg-red-50 border-red-200 text-red-700';
    }
    return isDark
      ? 'bg-slate-500/15 border-slate-400/25 text-slate-300'
      : 'bg-slate-100 border-slate-200 text-slate-600';
  })();

  const isAiOnline = resolvedAiStatus === 'online';
  const statusBadgeLabel = isAiOnline ? 'AI ONLINE' : (resolvedAiStatus === 'error' ? 'AI ERROR' : 'WAITING');
  const statusHint = isAiOnline
    ? 'Đồng bộ phân tích tự động từ Cloud Functions'
    : (resolvedAiStatus === 'error' ? 'Lỗi đọc dữ liệu AI từ Realtime Database' : 'Đang chờ backend ghi dữ liệu AI');
  const lastAiUpdatedLabel = lastAiUpdatedAt
    ? new Date(lastAiUpdatedAt).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    : null;

  return (
    <div
      className={`relative rounded-[2.4rem] border overflow-hidden group transition-all duration-700 md:hover:-translate-y-1.5 transform-gpu
        ${isDark
          ? 'border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.4)] md:hover:shadow-[-26px_0_52px_-16px_rgba(34,211,238,0.36),26px_0_52px_-16px_rgba(232,121,249,0.34)]'
          : 'border-slate-200 bg-white/60 backdrop-blur-xl shadow-xl md:hover:shadow-[-26px_0_52px_-16px_rgba(249,115,22,0.34),26px_0_52px_-16px_rgba(59,130,246,0.3)]'}`}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className={`absolute -top-16 -left-16 w-64 h-64 rounded-full blur-3xl transition-opacity duration-700 opacity-45 md:group-hover:opacity-70 ${isDark ? 'bg-cyan-500/10' : 'bg-amber-400/10'}`} />
        <div className={`absolute -bottom-16 -right-16 w-64 h-64 rounded-full blur-3xl transition-opacity duration-700 opacity-45 md:group-hover:opacity-70 ${isDark ? 'bg-fuchsia-500/10' : 'bg-indigo-500/10'}`} />
        <div className={`absolute inset-0 opacity-40 transition-opacity duration-700 md:group-hover:opacity-60 ${isDark ? 'bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.06),transparent_55%),radial-gradient(circle_at_85%_25%,rgba(255,255,255,0.05),transparent_55%)]' : 'bg-[radial-gradient(circle_at_15%_20%,rgba(15,23,42,0.05),transparent_55%),radial-gradient(circle_at_85%_25%,rgba(15,23,42,0.04),transparent_55%)]'}`} />
      </div>

      <div className="relative z-10 px-5 sm:px-7 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.25)]'}`} />
            <p className={`text-[10px] font-black uppercase tracking-[0.45em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>PHÂN TÍCH NHANH</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-black tracking-wider px-2 py-1 rounded-full border ${statusBadgeClass}`}>
              {statusBadgeLabel}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`text-[10px] px-2.5 py-1 rounded-full border font-medium ${isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-white border-slate-200 text-slate-600'}`}>
            {statusHint}
          </span>
          {isAiOnline && lastAiUpdatedLabel && (
            <span className={`text-[10px] px-2.5 py-1 rounded-full border font-mono ${isDark ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-300/90' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
              AI cập nhật: {lastAiUpdatedLabel}
            </span>
          )}
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 transition-all duration-500 ${animateInsight ? 'opacity-100 translate-y-0' : 'opacity-90'}`}>
          <div
            className={`rounded-2xl border bg-gradient-to-br px-4 py-3 transition-all duration-500
              ${accentClass(insights[0]?.kind || 'ok')}
              ${isDark ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:hover:shadow-[0_0_20px_rgba(56,189,248,0.2)]' : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] md:hover:shadow-[0_8px_22px_rgba(14,116,144,0.14)]'}
              ${animateInsight ? 'translate-y-0' : 'translate-y-0.5'} md:hover:-translate-y-0.5`}
          >
            <p className={`text-[10px] font-black uppercase tracking-widest opacity-70 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Nhiệt độ</p>
            <p className={`text-[12px] sm:text-[13px] font-bold leading-snug mt-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {displayedTemperatureText}
            </p>
          </div>
          <div
            className={`rounded-2xl border bg-gradient-to-br px-4 py-3 transition-all duration-500
              ${isDark ? 'border-fuchsia-500/20 from-fuchsia-400/16 to-purple-500/10' : 'border-sky-200 from-sky-400/18 to-sky-500/10'}
              ${isDark ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:hover:shadow-[0_0_20px_rgba(217,70,239,0.22)]' : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] md:hover:shadow-[0_8px_22px_rgba(14,165,233,0.14)]'}
              ${animateInsight ? 'translate-y-0' : 'translate-y-0.5'} md:hover:-translate-y-0.5`}
          >
            <p className={`text-[10px] font-black uppercase tracking-widest opacity-70 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Độ ẩm</p>
            <p className={`text-[12px] sm:text-[13px] font-bold leading-snug mt-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {displayedHumidityText}
            </p>
          </div>
          <div
            className={`rounded-2xl border bg-gradient-to-br px-4 py-3 transition-all duration-500
              ${isDark ? 'border-emerald-500/20 from-emerald-400/16 to-emerald-500/10' : 'border-emerald-200 from-emerald-400/18 to-emerald-500/10'}
              ${isDark ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:hover:shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] md:hover:shadow-[0_8px_22px_rgba(5,150,105,0.14)]'}
              ${animateInsight ? 'translate-y-0' : 'translate-y-0.5'} md:hover:-translate-y-0.5`}
          >
            <p className={`text-[10px] font-black uppercase tracking-widest opacity-70 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Tổng quan</p>
            <p className={`text-[12px] sm:text-[13px] font-bold leading-snug mt-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>
              {displayedSummaryText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT 2: BIỂU ĐỒ (SMOOTH CURVE + GRADIENT FILL)
// ==========================================
function PremiumChartCard({ history, isDark }) {
  const [isMobileInView, setIsMobileInView] = useState(false);
  const [activeChartIndex, setActiveChartIndex] = useState(null);
  const cardRef = useRef(null);
  const dotPositionRef = useRef({});
  const shouldAnimateChart = Array.isArray(history) && history.length > 1;

  const getFiniteValues = (dataKey) => (
    Array.isArray(history)
      ? history.map((item) => Number(item?.[dataKey])).filter((value) => Number.isFinite(value))
      : []
  );

  const getAxisDomain = (dataKey, padding) => {
    const values = getFiniteValues(dataKey);
    if (!values.length) return [0, 1];

    return [
      Math.floor(Math.min(...values) - padding),
      Math.ceil(Math.max(...values) + padding),
    ];
  };

  const getLatestFiniteValue = (dataKey) => {
    if (!Array.isArray(history)) return null;

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const value = Number(history[index]?.[dataKey]);
      if (Number.isFinite(value)) return value;
    }

    return null;
  };

  const getVisualPosition = (value, domain) => {
    if (!Number.isFinite(value)) return 0;
    const [min, max] = domain;
    if (max === min) return 0.5;

    return (value - min) / (max - min);
  };

  const tempVisualPosition = getVisualPosition(getLatestFiniteValue('temp'), getAxisDomain('temp', 1));
  const humVisualPosition = getVisualPosition(getLatestFiniteValue('hum'), getAxisDomain('hum', 2));
  const isTempVisuallyHigher = tempVisualPosition >= humVisualPosition;

  const handleChartMouseMove = (chartState) => {
    const nextIndex = Number.isInteger(chartState?.activeTooltipIndex)
      ? chartState.activeTooltipIndex
      : null;

    setActiveChartIndex((currentIndex) => (
      currentIndex === nextIndex ? currentIndex : nextIndex
    ));
  };

  const handleChartMouseLeave = () => {
    setActiveChartIndex(null);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (window.innerWidth < 768) {
          setIsMobileInView(entry.isIntersecting);
        } else {
          setIsMobileInView(false);
        }
      },
      { threshold: 0.5 }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const TooltipContent = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const tempEntry = payload.find(p => p.dataKey === 'temp');
    const humEntry = payload.find(p => p.dataKey === 'hum');

    return (
      <div
        className={`rounded-[1.25rem] border p-4 backdrop-blur-2xl shadow-2xl transition-all duration-300
          ${isDark ? 'bg-[#050014]/90 border-white/10 text-white' : 'bg-white/95 border-slate-200 text-slate-900'}`}
        style={{
          boxShadow: isDark
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div className="flex items-center justify-between gap-8 mb-4">
          <p className={`text-[9px] font-black uppercase tracking-[0.4em] opacity-40 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Timeline</p>
          <p className={`text-[10px] font-mono font-bold tracking-wider ${isDark ? 'text-cyan-400' : 'text-blue-600'}`}>{label}</p>
        </div>

        <div className="space-y-3">
          {tempEntry && (
            <div className="flex items-center justify-between gap-10">
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'}`} />
                <span className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Temp</span>
              </div>
              <span className={`text-[13px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{Number(tempEntry.value).toFixed(1)}°C</span>
            </div>
          )}
          {humEntry && (
            <div className="flex items-center justify-between gap-10">
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-fuchsia-400 shadow-[0_0_8px_#e879f9]' : 'bg-indigo-600 shadow-[0_0_8px_#4f46e5]'}`} />
                <span className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Humid</span>
              </div>
              <span className={`text-[13px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{Number(humEntry.value).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const LatestDot = ({ cx, cy, index, dataKey }) => {
    const currentPosition = { cx: Number(cx), cy: Number(cy), index };
    const positionKey = `${dataKey}-${index}`;
    const latestPositionKey = `${dataKey}-latest`;

    if (!Number.isFinite(currentPosition.cx) || !Number.isFinite(currentPosition.cy)) return null;

    const isLatestIndex = Array.isArray(history) && index === history.length - 1;

    if (activeChartIndex !== null || !isLatestIndex) {
      dotPositionRef.current[positionKey] = currentPosition;
      return null;
    }

    const previousPosition = dotPositionRef.current[`${dataKey}-${index - 1}`] || dotPositionRef.current[latestPositionKey];
    dotPositionRef.current[positionKey] = currentPosition;
    if (index === history.length - 1) {
      dotPositionRef.current[latestPositionKey] = currentPosition;
    }

    const isTemp = dataKey === 'temp';
    const shouldMoveWithLine = (
      activeChartIndex === null &&
      shouldAnimateChart &&
      history.length === 2 &&
      previousPosition &&
      previousPosition.index === index - 1 &&
      Number.isFinite(previousPosition.cx) &&
      Number.isFinite(previousPosition.cy)
    );
    const startX = shouldMoveWithLine ? previousPosition.cx - currentPosition.cx : 0;
    const startY = shouldMoveWithLine ? previousPosition.cy - currentPosition.cy : 0;

    const glow = isDark
      ? (isTemp ? 'drop-shadow(0 0 12px rgba(34,211,238,1)) drop-shadow(0 0 28px rgba(34,211,238,0.5))' : 'drop-shadow(0 0 12px rgba(232,121,249,1)) drop-shadow(0 0 28px rgba(232,121,249,0.5))')
      : (isTemp ? 'drop-shadow(0 0 10px rgba(244,63,94,0.3)) drop-shadow(0 0 24px rgba(244,63,94,0.2))' : 'drop-shadow(0 0 10px rgba(79,70,229,0.3)) drop-shadow(0 0 24px rgba(79,70,229,0.2))');

    const stroke = isDark ? '#050014' : '#ffffff';
    const fill = isTemp
      ? (isDark ? '#22d3ee' : '#f43f5e')
      : (isDark ? '#e879f9' : '#4f46e5');

    return (
      <g
        key={`${dataKey}-${index}-${history.length}-${activeChartIndex === null ? 'latest' : 'hover'}`}
        className={shouldMoveWithLine ? 'animate-chart-dot-slide' : undefined}
        style={shouldMoveWithLine ? {
          '--chart-dot-start-x': `${startX}px`,
          '--chart-dot-start-y': `${startY}px`,
        } : undefined}
      >
        {/* Soft pulse background */}
        <circle cx={cx} cy={cy} r={14} fill={fill} className="animate-chart-pulse" style={{ transformOrigin: `${cx}px ${cy}px`, opacity: 0.15 }} />

        {/* Outer glow circle */}
        <circle cx={cx} cy={cy} r={8.5} fill={fill} opacity={0.2} style={{ filter: glow }} />

        {/* Main point */}
        <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke={stroke} strokeWidth={2.5} style={{ filter: glow }} />
      </g>
    );
  };

  const tempArea = (
    <Area
      key="temp-area"
      yAxisId="left"
      type="monotone"
      dataKey="temp"
      stroke="none"
      fill="url(#fillTemp)"
      fillOpacity={0.22}
      isAnimationActive={shouldAnimateChart}
      animateNewValues={true}
      animationBegin={80}
      animationDuration={900}
      animationEasing="ease-out"
      activeDot={false}
      dot={false}
    />
  );

  return (
    <div
      ref={cardRef}
      data-active={isMobileInView}
      className={`
        relative rounded-[3rem] border overflow-hidden group transition-all duration-700 md:hover:-translate-y-1.5 data-[active=true]:-translate-y-1.5 cursor-pointer transform-gpu
        ${isDark
          ? 'border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.4)] md:hover:shadow-[-30px_0_60px_-15px_rgba(34,211,238,0.45),30px_0_60px_-15px_rgba(232,121,249,0.45)] data-[active=true]:shadow-[-30px_0_60px_-15px_rgba(34,211,238,0.45),30px_0_60px_-15px_rgba(232,121,249,0.45)]'
          : 'border-slate-200 shadow-xl md:hover:shadow-[-30px_0_60px_-15px_rgba(249,115,22,0.45),30px_0_60px_-15px_rgba(59,130,246,0.45)] data-[active=true]:shadow-[-30px_0_60px_-15px_rgba(249,115,22,0.45),30px_0_60px_-15px_rgba(59,130,246,0.45)]'}
      `}
    >

      <div className={`relative z-10 w-full h-full rounded-[inherit] p-5 sm:p-8 overflow-hidden transition-all duration-700
        ${isDark ? 'bg-white/5 md:group-hover:bg-white/10 group-data-[active=true]:bg-white/10 backdrop-blur-lg sm:backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]' : 'bg-white/50 md:group-hover:bg-white/70 group-data-[active=true]:bg-white/70 backdrop-blur-lg sm:backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]'}
      `}>

        {/* Subtle premium "signal" layer (keeps chart from feeling empty) */}
        <div className="absolute inset-0 pointer-events-none">
          <div className={`absolute -top-28 -left-24 w-[28rem] h-[28rem] rounded-full blur-3xl transition-opacity duration-700 opacity-40 md:group-hover:opacity-60 group-data-[active=true]:opacity-60 ${isDark ? 'bg-cyan-500/10' : 'bg-amber-400/12'}`} />
          <div className={`absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl transition-opacity duration-700 opacity-40 md:group-hover:opacity-60 group-data-[active=true]:opacity-60 ${isDark ? 'bg-fuchsia-500/10' : 'bg-indigo-500/10'}`} />
          <div className={`absolute inset-0 opacity-50 ${isDark ? 'bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.06),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.05),transparent_55%)]' : 'bg-[radial-gradient(circle_at_20%_20%,rgba(15,23,42,0.05),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(15,23,42,0.04),transparent_55%)]'}`} />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 sm:gap-0 justify-between items-start sm:items-center mb-8 relative z-20">
          <h3 className={`text-[10px] font-black uppercase tracking-[0.5em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dữ Liệu Thời Gian Thực</h3>
          <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest">
            <span className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${isDark ? 'bg-cyan-400 shadow-[0_0_10px_#22d3ee]' : 'bg-gradient-to-br from-amber-400 to-rose-500 shadow-[0_0_10px_#f43f5e]'}`}></div> NHIỆT ĐỘ</span>
            <span className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${isDark ? 'bg-fuchsia-400 shadow-[0_0_10px_#e879f9]' : 'bg-gradient-to-br from-sky-400 to-indigo-600 shadow-[0_0_10px_#4f46e5]'}`}></div> ĐỘ ẨM</span>
          </div>
        </div>

        <div className="h-[300px] sm:h-[400px] w-full relative z-20">
          {/* Current zone emphasis gradient overlay */}
          <div className={`absolute right-0 top-0 bottom-0 w-32 pointer-events-none z-0 transition-opacity duration-700
            ${isDark ? 'bg-gradient-to-l from-white/5 to-transparent' : 'bg-gradient-to-l from-slate-200/30 to-transparent opacity-60'}`}
          />

          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={history}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            >
              <defs>
                {/* Replaced neonGlow SVG filter with CSS drop-shadow to fix animation clipping bug */}
                <linearGradient id="fillTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isDark ? "#22d3ee" : "#fbbf24"} stopOpacity={0.78} style={{ transition: 'stop-color 1s ease-in-out' }} />
                  <stop offset="100%" stopColor={isDark ? "#3b82f6" : "#f43f5e"} stopOpacity={0} style={{ transition: 'stop-color 1s ease-in-out' }} />
                </linearGradient>
                <linearGradient id="fillHum" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isDark ? "#e879f9" : "#38bdf8"} stopOpacity={0.78} style={{ transition: 'stop-color 1s ease-in-out' }} />
                  <stop offset="100%" stopColor={isDark ? "#a855f7" : "#4f46e5"} stopOpacity={0} style={{ transition: 'stop-color 1s ease-in-out' }} />
                </linearGradient>

                {/* Gradient dọc theo đường Line (Từ trái sang phải) */}
                <linearGradient id="strokeTemp" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
                  <stop offset="0%" stopColor={isDark ? "#22d3ee" : "#fbbf24"} style={{ transition: 'stop-color 1s ease-in-out' }} />
                  <stop offset="100%" stopColor={isDark ? "#3b82f6" : "#f43f5e"} style={{ transition: 'stop-color 1s ease-in-out' }} />
                </linearGradient>
                <linearGradient id="strokeHum" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1000" y2="0">
                  <stop offset="0%" stopColor={isDark ? "#e879f9" : "#38bdf8"} style={{ transition: 'stop-color 1s ease-in-out' }} />
                  <stop offset="100%" stopColor={isDark ? "#a855f7" : "#4f46e5"} style={{ transition: 'stop-color 1s ease-in-out' }} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.03)"} vertical={false} />
              <XAxis dataKey="time" stroke={isDark ? "#ffffff" : "#64748b"} strokeOpacity={0.3} fontSize={9} axisLine={false} tickLine={false} tickMargin={15} minTickGap={40} />

              {/* Left Y-Axis (Temperature) */}
              <YAxis
                yAxisId="left"
                orientation="left"
                stroke={isDark ? "#ffffff" : "#64748b"}
                strokeOpacity={0.3}
                fontSize={9}
                axisLine={false}
                tickLine={false}
                domain={[(dataMin) => Math.floor(dataMin - 1), (dataMax) => Math.ceil(dataMax + 1)]}
                tickFormatter={(val) => val.toFixed(1)}
              />
              {/* Right Y-Axis (Humidity) */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={isDark ? "#ffffff" : "#64748b"}
                strokeOpacity={0.3}
                fontSize={9}
                axisLine={false}
                tickLine={false}
                domain={[(dataMin) => Math.floor(dataMin - 2), (dataMax) => Math.ceil(dataMax + 2)]}
                tickFormatter={(val) => val.toFixed(1)}
              />

              <Tooltip
                cursor={{ stroke: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(100,116,139,0.25)', strokeWidth: 1, strokeDasharray: "4 5" }}
                content={<TooltipContent />}
              />

              {isTempVisuallyHigher && tempArea}

              {/* Humidity - rendered as an Area with low opacity */}
              {/* 1. Thẻ Area ĐỘ ẨM: Giờ chỉ làm nhiệm vụ đổ màu mờ ở dưới (Tắt viền, tắt chấm tròn) */}
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="hum"
                stroke="none" /* TẮT VIỀN Ở ĐÂY */
                fill="url(#fillHum)"
                fillOpacity={0.24}
                isAnimationActive={shouldAnimateChart}
                animateNewValues={true}
                animationBegin={80}
                animationDuration={900}
                animationEasing="ease-out"
                activeDot={false}
                dot={false}
              />

              {!isTempVisuallyHigher && tempArea}

              {/* 2. Thẻ Line ĐỘ ẨM: Đảm nhận việc vẽ đường nét căng và chấm tròn (Giống hệt cách Nhiệt độ đang làm) */}
              <Line
                yAxisId="right" /* Nhớ giữ yAxisId="right" để nó map đúng trục bên phải */
                type="monotone"
                dataKey="hum"
                stroke="url(#strokeHum)"
                strokeWidth={3.5}
                dot={(props) => <LatestDot {...props} dataKey="hum" />}
                isAnimationActive={shouldAnimateChart}
                animateNewValues={true}
                animationBegin={80}
                animationDuration={900}
                animationEasing="ease-out"
                activeDot={{
                  r: 6.5,
                  fill: isDark ? '#050014' : '#ffffff',
                  stroke: isDark ? "#e879f9" : "#4f46e5",
                  strokeWidth: 3.25,
                  style: { filter: isDark ? 'drop-shadow(0 0 12px rgba(232,121,249,0.85)) drop-shadow(0 0 26px rgba(232,121,249,0.35))' : 'drop-shadow(0 0 10px rgba(79,70,229,0.25)) drop-shadow(0 0 22px rgba(79,70,229,0.16))' }
                }}
                style={{
                  transition: 'stroke 1s ease-in-out',
                  filter: isDark ? 'drop-shadow(0 0 10px rgba(232,121,249,0.52))' : 'drop-shadow(0 0 10px rgba(79,70,229,0.22))'
                }}
              />

              {/* Temperature - rendered as a crisp Line (no fill) */}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="temp"
                stroke="url(#strokeTemp)"
                strokeWidth={3.5}
                dot={(props) => <LatestDot {...props} dataKey="temp" />}
                // BÍ KÍP TƯƠNG TỰ
                isAnimationActive={shouldAnimateChart}
                animateNewValues={true}
                animationBegin={80}
                animationDuration={900}
                animationEasing="ease-out"
                activeDot={{
                  r: 6.5,
                  fill: isDark ? '#050014' : '#ffffff',
                  stroke: isDark ? "#22d3ee" : "#f43f5e",
                  strokeWidth: 3.25,
                  style: { filter: isDark ? 'drop-shadow(0 0 12px rgba(34,211,238,0.85)) drop-shadow(0 0 26px rgba(34,211,238,0.35))' : 'drop-shadow(0 0 10px rgba(244,63,94,0.25)) drop-shadow(0 0 22px rgba(244,63,94,0.15))' }
                }}
                style={{
                  transition: 'stroke 1s ease-in-out',
                  filter: isDark ? 'drop-shadow(0 0 10px rgba(34,211,238,0.52))' : 'drop-shadow(0 0 10px rgba(244,63,94,0.22))'
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT 3: WEATHER WIDGET (OUTDOOR DATA)
// ==========================================
function WeatherWidget({ isDark, variant = 'card' }) {
  const [weather, setWeather] = useState({ temp: null, hum: null, icon: null });

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const apiKey = import.meta.env.VITE_WEATHER_API_KEY;
        // Lấy dữ liệu thời tiết Dĩ An, Bình Dương
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=10.91&lon=106.78&units=metric&appid=${apiKey}`);
        const data = await res.json();

        if (data && data.main) {
          setWeather({
            temp: Math.round(data.main.temp),
            hum: data.main.humidity,
            icon: data.weather[0].icon
          });
        }
      } catch (err) {
        console.error("Lỗi lấy thời tiết ngoài trời:", err);
      }
    };

    fetchWeather(); // Chạy ngay khi load

    // Cập nhật mỗi 30 phút (30 * 60 * 1000 ms)
    const interval = setInterval(fetchWeather, 1800000);
    return () => clearInterval(interval);
  }, []);

  // Trạng thái đang tải hoặc lỗi
  if (weather.temp === null) {
    return (
      <div className={`flex items-center gap-3 ${variant === 'toolbar' ? 'px-3 py-2 rounded-xl border' : 'px-4 py-2 rounded-2xl border'} backdrop-blur-md transition-all duration-1000
        ${isDark ? (variant === 'toolbar' ? 'bg-white/0 border-white/0' : 'bg-white/5 border-white/10') : (variant === 'toolbar' ? 'bg-white/0 border-slate-200/0' : 'bg-white border-slate-200')}`}
      >
        <div className="w-8 h-8 rounded-full border-2 border-t-cyan-400 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
        <div className="flex flex-col">
          <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dĩ An, Bình Dương</span>
          <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Đang tải...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${variant === 'toolbar' ? 'px-3 py-2 rounded-xl border' : 'px-4 py-2 rounded-2xl border'} backdrop-blur-md transition-all duration-1000
      ${isDark ? (variant === 'toolbar' ? 'bg-white/0 border-white/0' : 'bg-white/5 border-white/10 shadow-[0_5px_20px_rgba(0,0,0,0.5)]') : (variant === 'toolbar' ? 'bg-white/0 border-slate-200/0' : 'bg-white border-slate-200 shadow-sm')}`}
    >
      <div className="relative flex justify-center items-center w-8 h-8">
        <div className={`absolute inset-0 rounded-full blur-md ${isDark ? 'bg-cyan-500/20' : 'bg-orange-400/20'}`}></div>
        <img src={`https://openweathermap.org/img/wn/${weather.icon}.png`} alt="weather" className="relative z-10 w-10 h-10 drop-shadow-lg" />
      </div>

      <div className="flex flex-col">
        <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Dĩ An, Bình Dương</span>
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{weather.temp}°C</span>
          <span className={`text-[10px] font-bold ${isDark ? 'text-fuchsia-400' : 'text-indigo-500'}`}>{weather.hum}%</span>
        </div>
      </div>
    </div>
  );
}

// Icons
const SunIcon = ({ size }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>;
const MoonIcon = ({ size }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;

export default App;
