import { Fan, ThermometerSun, DoorOpen, DoorClosed, Activity, Wind, Droplets, Flame } from 'lucide-react';

function SystemModeCard({ hop, quat, isDark, thoiGianConLai }) {
  let cfg = {};
  if (hop === 1) {
    if (!quat) {
      cfg = { label: 'Trạng Thái Chờ', sub: 'Độ ẩm đạt chuẩn', icon: Activity, from: 'from-emerald-400', to: 'to-green-600', glow: 'rgba(52,211,153,0.3)', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', iconClass: '', progressMode: false, modeText: 'STANDBY' };
    } else {
      cfg = { label: 'Đang Hút Ẩm', sub: 'Hệ thống đang giảm độ ẩm', icon: Wind, from: 'from-blue-400', to: 'to-indigo-600', glow: 'rgba(59,130,246,0.4)', border: 'border-blue-500/30', bg: 'bg-blue-500/10', text: 'text-blue-400', iconClass: 'animate-pulse', progressMode: false, modeText: 'HÚT ẨM' };
    }
  } else if (hop === 2) {
    cfg = {
      label: 'Đang Sấy Hạt',
      sub: 'Đang sấy hạt hút ẩm',
      icon: Flame,
      from: 'from-orange-500',
      to: 'to-red-600',
      progFrom: '#f97316',
      progTo: '#dc2626',
      glow: 'rgba(249,115,22,0.4)',
      border: 'border-orange-500/30',
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
      iconClass: 'animate-pulse',
      progressMode: true,
      maxTime: 5400,
      modeText: 'CHẾ ĐỘ 2'
    };
  } else if (hop === 3) {
    cfg = {
      label: 'Đang Tản Nhiệt',
      sub: 'Đang giải nhiệt hệ thống',
      icon: Wind,
      from: 'from-teal-400',
      to: 'to-cyan-600',
      progFrom: '#2dd4bf',
      progTo: '#06b6d4',
      glow: 'rgba(20,184,166,0.4)',
      border: 'border-teal-500/30',
      bg: 'bg-teal-500/10',
      text: 'text-teal-400',
      iconClass: 'animate-pulse',
      progressMode: true,
      maxTime: 1800,
      modeText: 'CHẾ ĐỘ 3'
    };
  } else {
    cfg = { label: 'Không Xác Định', sub: 'Lỗi trạng thái', icon: Activity, from: 'from-slate-500', to: 'to-slate-600', glow: 'rgba(100,116,139,0.4)', border: 'border-slate-500/30', bg: 'bg-slate-500/10', text: 'text-slate-400', iconClass: '', progressMode: false, modeText: 'UNKNOWN' };
  }

  const Icon = cfg.icon;

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  let showProgress = cfg.progressMode;
  let percent = 0;

  if (showProgress) {
    const remaining = Math.max(0, Number(thoiGianConLai) || 0);
    percent = Math.min(100, Math.max(0, ((cfg.maxTime - remaining) / cfg.maxTime) * 100));
  }

  // --- SVG PROGRESS CIRCLE COMPONENT ---
  const ProgressCircle = ({ percentage, colorFrom, colorTo, glowColor, timeText }) => {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;
    const gradientId = `progGradient-${hop}`;

    return (
      <div className="relative flex items-center justify-center w-32 h-32 md:w-44 md:h-44 flex-shrink-0 p-3 md:p-4">
        {/* Soft background glow (prevents clipped rectangular shadow) */}
        <div
          className="absolute inset-2 md:inset-3 rounded-full blur-2xl opacity-60 -z-10"
          style={{ backgroundColor: glowColor }}
          aria-hidden="true"
        />

        <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className={`${isDark ? 'text-white/5' : 'text-slate-200'}`}
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth="10"
            strokeDasharray={circumference}
            style={{
              strokeDashoffset,
              transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            strokeLinecap="round"
            fill="transparent"
          />
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colorFrom} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute z-10 flex flex-col items-center justify-center text-center">
          <span className={`text-xl md:text-3xl font-black tracking-tighter ${isDark ? 'text-white' : 'text-slate-800'}`}>
            {Math.round(percentage)}%
          </span>
          <span className={`text-[10px] md:text-xs font-black uppercase tracking-[0.2em] opacity-60 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {timeText}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={`col-span-full relative rounded-3xl border overflow-hidden transition-all duration-700 group cursor-pointer hover:-translate-y-1 transform-gpu
      ${isDark ? 'border-white/10 hover:border-white/20' : 'border-slate-200 hover:border-slate-300'}`}
      style={{ boxShadow: `0 0 40px ${cfg.glow}` }}>

      <div className={`p-6 sm:p-10 md:p-12 flex flex-col md:flex-row items-center justify-between gap-10 md:gap-x-20 transition-all duration-700 ${isDark ? 'bg-white/5 hover:bg-white/8 backdrop-blur-lg sm:backdrop-blur-2xl' : 'bg-white/80 hover:bg-white backdrop-blur-xl'}`}>

        {/* LEFT SIDE: ICON + TEXT */}
        <div className="flex flex-col sm:flex-row items-center gap-8 flex-grow md:min-w-[400px] w-full md:w-auto text-center sm:text-left">
          <div className={`p-6 rounded-2xl bg-gradient-to-br ${cfg.from} ${cfg.to} shadow-2xl flex-shrink-0 transform-gpu group-hover:scale-110 transition-transform duration-500`}>
            <Icon size={48} className={`text-white ${cfg.iconClass}`} />
          </div>

          <div className="flex flex-col gap-2 w-full">
            <span className={`text-[11px] font-black uppercase tracking-[0.5em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chế Độ Hệ Thống Hiện Tại</span>
            <span className={`text-[2rem] sm:text-5xl font-black tracking-tight leading-[1.15] pb-2 inline-block text-transparent bg-clip-text bg-gradient-to-r ${cfg.from} ${cfg.to} whitespace-nowrap relative z-10 px-1`}>
              {cfg.label}
            </span>
            <span className={`text-base font-bold ${cfg.text} opacity-80 px-1`}>{cfg.sub}</span>
            <div className={`mt-3 px-6 py-2.5 rounded-full border text-xs font-black tracking-[0.3em] uppercase ${cfg.border} ${cfg.bg} ${cfg.text} w-fit mx-auto sm:mx-0 text-center shadow-sm`}>
              {cfg.modeText}
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: PROGRESS CIRCLE */}
        {showProgress ? (
          <div className="flex-shrink-0 flex items-center justify-center p-4 md:p-6">
            <ProgressCircle
              percentage={percent}
              colorFrom={cfg.progFrom || '#22d3ee'}
              colorTo={cfg.progTo || '#3b82f6'}
              glowColor={cfg.glow}
              timeText={formatTime(thoiGianConLai)}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center md:items-end flex-shrink-0 opacity-30 md:pr-10">
            <Activity size={48} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
            <span className={`text-[11px] font-black uppercase tracking-[0.3em] mt-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Monitoring...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceCard({ label, sublabel, active, isDark, icon, statusText, activeColor, activeShadow, activeBg, activeBorder, activeDotClass, colSpan }) {
  const statusCls = active
    ? `${activeColor} ${activeBg} ${activeBorder}`
    : isDark ? 'text-slate-400 bg-white/5 border-white/10' : 'text-slate-500 bg-slate-100 border-slate-200';

  return (
    <div
      className={`relative rounded-3xl border overflow-hidden transition-all duration-700 group cursor-pointer hover:-translate-y-1 ${colSpan || ''} ${isDark ? 'border-white/10 hover:border-white/20' : 'border-slate-200 hover:border-slate-300'} transform-gpu w-full text-left`}
      style={{ boxShadow: active ? `0 0 30px ${activeShadow}` : 'none' }}>
      <div className={`p-6 flex flex-col items-center gap-4 h-full transition-all duration-700 ${isDark ? 'bg-white/5 hover:bg-white/8 backdrop-blur-lg sm:backdrop-blur-2xl' : 'bg-white/80 hover:bg-white backdrop-blur-xl'}`}>
        <div className={`p-4 rounded-2xl transition-all duration-500 ${active ? activeBg : isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
          {icon}
        </div>
        <div className="text-center">
          <p className={`text-sm font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>{label}</p>
          <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sublabel}</p>
        </div>
        <div className={`px-4 py-1.5 rounded-full border text-[9px] font-black tracking-widest uppercase transition-all duration-500 ${statusCls}`}>
          {statusText}
        </div>
        <div
          className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${active
              ? activeDotClass || activeColor.replace('text-', 'bg-')
              : isDark ? 'bg-slate-600' : 'bg-slate-300'
            }`}
          style={{ boxShadow: active ? `0 0 10px ${activeShadow}` : 'none' }}
        />
      </div>
    </div>
  );
}

export default function DeviceTab({ devices, system, isDark }) {
  const dev = devices || { Quat: false, TamHutAm: false, VachNganNgoai: false, VachNganTrong: false };
  const sys = system || { Hop: 1, TrangThaiCamBien: true, ThoiGianConLai: 0 };
  const asBool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE' || v === 'on' || v === 'ON';
  const padActive = asBool(dev.TamHutAm);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">

      {/* Chế độ hệ thống — full width */}
      <SystemModeCard hop={sys.Hop} quat={dev.Quat} isDark={isDark} thoiGianConLai={sys.ThoiGianConLai} />

      {/* 4 card thiết bị */}
      <DeviceCard
        label="Quạt" sublabel="Làm Mát" active={dev.Quat} isDark={isDark}
        activeColor="text-cyan-400" activeShadow="rgba(34,211,238,0.5)"
        activeBg="bg-cyan-500/10" activeBorder="border-cyan-500/30"
        statusText={dev.Quat ? 'ĐANG CHẠY' : 'DỪNG'}
        icon={<Fan size={44} className={`transition-all duration-500 ${dev.Quat ? 'text-cyan-400 animate-spin' : isDark ? 'text-slate-500' : 'text-slate-400'}`}
          style={{ filter: dev.Quat ? 'drop-shadow(0 0 12px rgba(34,211,238,0.8))' : 'none', animationDuration: '2s' }} />}
      />

      <DeviceCard
        label="Tấm Hút Ẩm" sublabel="Gia Nhiệt" active={padActive} isDark={isDark}
        activeColor="text-orange-500" activeShadow="rgba(249,115,22,0.55)"
        activeBg="bg-orange-500/10" activeBorder="border-orange-500/30"
        activeDotClass={padActive ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]' : ''}
        statusText={padActive ? 'HOẠT ĐỘNG' : 'CHỜ'}
        icon={<ThermometerSun size={44} className={`transition-colors duration-300 ${padActive ? 'text-orange-500 animate-pulse' : isDark ? 'text-slate-500' : 'text-slate-400'}`}
          style={{ filter: padActive ? 'drop-shadow(0 0 12px rgba(249,115,22,0.75))' : 'none' }} />}
      />

      <DeviceCard
        label="Vách Ngăn Trong" sublabel="Van Servo" active={dev.VachNganTrong} isDark={isDark}
        activeColor="text-emerald-400" activeShadow="rgba(52,211,153,0.5)"
        activeBg="bg-emerald-500/10" activeBorder="border-emerald-500/30"
        statusText={dev.VachNganTrong ? 'MỞ' : 'ĐÓNG'}
        icon={dev.VachNganTrong
          ? <DoorOpen size={44} className="text-emerald-400 transition-all duration-500" style={{ filter: 'drop-shadow(0 0 10px rgba(52,211,153,0.7))' }} />
          : <DoorClosed size={44} className="text-red-400 transition-all duration-500" style={{ filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.5))' }} />}
      />

      <DeviceCard
        label="Vách Ngăn Ngoài" sublabel="Van Servo" active={dev.VachNganNgoai} isDark={isDark}
        activeColor="text-emerald-400" activeShadow="rgba(52,211,153,0.5)"
        activeBg="bg-emerald-500/10" activeBorder="border-emerald-500/30"
        statusText={dev.VachNganNgoai ? 'MỞ' : 'ĐÓNG'}
        icon={dev.VachNganNgoai
          ? <DoorOpen size={44} className="text-emerald-400 transition-all duration-500" style={{ filter: 'drop-shadow(0 0 10px rgba(52,211,153,0.7))' }} />
          : <DoorClosed size={44} className="text-red-400 transition-all duration-500" style={{ filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.5))' }} />}
      />

      {/* Card cảm biến — full width giống SystemModeCard */}
      <div className={`col-span-full relative rounded-3xl border overflow-hidden transition-all duration-700 group cursor-pointer hover:-translate-y-1 transform-gpu
        ${isDark ? 'border-white/10 hover:border-white/20' : 'border-slate-200 hover:border-slate-300'}`}
        style={{ boxShadow: sys.TrangThaiCamBien ? '0 0 30px rgba(52,211,153,0.35)' : '0 0 30px rgba(239,68,68,0.35)' }}>
        <div className={`p-4 sm:p-6 md:p-8 flex flex-col sm:flex-row items-center text-center sm:text-left sm:justify-between gap-4 sm:gap-6 transition-all duration-700 ${isDark ? 'bg-white/5 hover:bg-white/8 backdrop-blur-lg sm:backdrop-blur-2xl' : 'bg-white/80 hover:bg-white backdrop-blur-xl'}`}>
          <div className={`p-5 rounded-2xl transition-all duration-500 ${sys.TrangThaiCamBien ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
            <Activity size={40} className={`transition-all duration-500 ${sys.TrangThaiCamBien ? 'text-emerald-400' : 'text-red-400 animate-pulse'}`}
              style={{ filter: sys.TrangThaiCamBien ? 'drop-shadow(0 0 12px rgba(52,211,153,0.8))' : 'drop-shadow(0 0 12px rgba(239,68,68,0.8))' }} />
          </div>
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <span className={`text-[10px] font-black uppercase tracking-[0.4em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tình Trạng Cảm Biến</span>
            <span className={`text-[1.75rem] sm:text-4xl font-black tracking-tight ${sys.TrangThaiCamBien ? 'text-emerald-400' : 'text-red-400'} whitespace-nowrap`}>
              {sys.TrangThaiCamBien ? 'Hoạt Động' : 'Lỗi Cảm Biến'}
            </span>
            <span className={`text-sm font-bold opacity-70 ${sys.TrangThaiCamBien ? 'text-emerald-400' : 'text-red-400'}`}>
              {sys.TrangThaiCamBien ? 'Cảm biến nhiệt độ & độ ẩm đang hoạt động bình thường' : 'Kiểm tra kết nối cảm biến ngay lập tức!'}
            </span>
          </div>
          <div className={`sm:ml-auto px-5 py-2 rounded-full border text-xs font-black tracking-widest uppercase transition-all duration-500 w-full sm:w-auto text-center whitespace-nowrap ${sys.TrangThaiCamBien ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-red-400 bg-red-500/10 border-red-500/30 animate-pulse'}`}>
            {sys.TrangThaiCamBien ? 'ONLINE' : 'CẢNH BÁO'}
          </div>
        </div>
      </div>

    </div>
  );
}
