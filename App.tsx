import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Camera, Clock, Navigation, Trash2, Save, Car, Loader2, Map as MapIcon, Edit2, Bell, AlertTriangle, Plus, Type, ChevronLeft, List, MoreVertical, RefreshCw } from 'lucide-react';
import { GeoLocation, ParkingLocation, AppState } from './types';
import { analyzeParkingPhoto } from './services/geminiService';
import { saveParkingRecords, getParkingRecords, addOrUpdateParkingRecord, deleteParkingRecord, clearParkingRecord } from './utils/storage';
import { Button } from './components/Button';

// Extend AppState to support List View
type ViewMode = 'LIST' | 'CREATE_CHOICE' | 'LOCATING' | 'ANALYZING' | 'DETAIL';

const App: React.FC = () => {
  // Global Data State
  const [parkingList, setParkingList] = useState<ParkingLocation[]>([]);
  
  // View State
  const [viewMode, setViewMode] = useState<ViewMode>('LIST');
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  
  // Creation/Temp State
  const [tempRecord, setTempRecord] = useState<ParkingLocation | null>(null);
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Detail View Specific State (Timer, Edit Mode)
  const [elapsedTime, setElapsedTime] = useState<string>("0分");
  const [remainingTime, setRemainingTime] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showTimerSetup, setShowTimerSetup] = useState(false);
  
  // Edit Form State (Linked to active record)
  const [manualFloor, setManualFloor] = useState("");
  const [manualSpot, setManualSpot] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualLocationName, setManualLocationName] = useState("");
  const [timerDuration, setTimerDuration] = useState<number | null>(null); // minutes

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const notificationSentRef = useRef<Set<string>>(new Set()); // Track notifications per record ID
  const isLocatingRef = useRef(false);

  // --- Initialization ---

  useEffect(() => {
    const records = getParkingRecords();
    setParkingList(records);
    
    // Request notification permission
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  // --- Timer Logic (Only runs when in DETAIL view) ---

  useEffect(() => {
    let interval: number;
    const activeRecord = parkingList.find(r => r.id === activeRecordId);

    if (viewMode === 'DETAIL' && activeRecord) {
      const updateTimer = () => {
        const now = Date.now();
        const diff = now - activeRecord.timestamp;
        
        // Update Elapsed
        const eMinutes = Math.floor(diff / 60000);
        const eHours = Math.floor(eMinutes / 60);
        if (eHours > 0) {
          setElapsedTime(`${eHours}小时 ${eMinutes % 60}分`);
        } else {
          setElapsedTime(`${eMinutes}分`);
        }

        // Update Remaining if timer set
        if (activeRecord.durationMinutes) {
          const endTime = activeRecord.timestamp + (activeRecord.durationMinutes * 60000);
          const remainingMs = endTime - now;
          const notifKey = `${activeRecord.id}_${activeRecord.durationMinutes}`;
          
          if (remainingMs <= 0) {
            setRemainingTime("已过期");
            setIsExpired(true);
            if (!notificationSentRef.current.has(notifKey + "_expired") && 'Notification' in window && Notification.permission === 'granted') {
              new Notification("停车超时", { body: `您在 ${activeRecord.locationName || '停车位'} 的停车时段已结束。` });
              notificationSentRef.current.add(notifKey + "_expired");
            }
          } else {
            setIsExpired(false);
            const rMinutes = Math.floor(remainingMs / 60000);
            const rHours = Math.floor(rMinutes / 60);
            const displayMin = rMinutes % 60;
            
            setRemainingTime(`${rHours}:${displayMin.toString().padStart(2, '0')}`);

            // Notify if 15 mins left
            if (rMinutes <= 15 && rMinutes > 0 && !notificationSentRef.current.has(notifKey + "_warning") && 'Notification' in window && Notification.permission === 'granted') {
               new Notification("停车即将超时", { body: `您在 ${activeRecord.locationName || '停车位'} 还剩 ${rMinutes} 分钟。` });
               notificationSentRef.current.add(notifKey + "_warning");
            }
          }
        } else {
          setRemainingTime(null);
          setIsExpired(false);
        }
      };
      
      updateTimer();
      interval = window.setInterval(updateTimer, 30000); // Update every 30s
    }
    return () => clearInterval(interval);
  }, [viewMode, activeRecordId, parkingList]); // Depend on parkingList to catch updates

  // --- Helper: Activate Record View ---
  // Sets all necessary state to show the detail view for a specific record object
  const activateRecord = (record: ParkingLocation) => {
    setActiveRecordId(record.id);
    
    // Init form state
    setManualFloor(record.floor || "");
    setManualSpot(record.spotNumber || "");
    setManualNotes(record.notes || "");
    setManualLocationName(record.locationName || "");
    setTimerDuration(record.durationMinutes || null);
    
    setViewMode('DETAIL');
    setEditMode(false);
    setShowTimerSetup(false);
  };

  // --- Handlers: List Management ---

  const handleAddNew = () => {
    setViewMode('CREATE_CHOICE');
    setErrorMsg(null);
    setTempRecord(null);
    setTempPhoto(null);
  };

  const handleViewDetail = (id: string) => {
    const record = parkingList.find(r => r.id === id);
    if (record) {
      activateRecord(record);
    }
  };

  const handleBackToList = () => {
    setViewMode('LIST');
    setActiveRecordId(null);
    setEditMode(false);
  };

  const handleDeleteRecord = (id: string) => {
    if (window.confirm("确定要删除这条停车记录吗？")) {
      const newList = deleteParkingRecord(id);
      setParkingList(newList);
      if (activeRecordId === id) {
        handleBackToList();
      }
    }
  };

  const handleClearAll = () => {
    if (parkingList.length === 0) return;
    if (window.confirm("⚠️ 确定要清空所有停车记录吗？\n此操作无法撤销。")) {
      clearParkingRecord(); // This function clears the whole key in local storage
      setParkingList([]);
    }
  };

  // --- Handlers: Creation Flow ---

  const handleStartAutoLocation = async () => {
    setErrorMsg(null);
    setViewMode('LOCATING');
    isLocatingRef.current = true;

    // 1. Environment Check (HTTPS)
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';

    if (!isLocal && !isHttps) {
      isLocatingRef.current = false;
      setErrorMsg("浏览器安全策略限制：自动定位功能必须在 HTTPS 环境下使用。当前连接不安全，请手动输入位置。");
      return;
    }

    if (!navigator.geolocation) {
      isLocatingRef.current = false;
      setErrorMsg("您的浏览器不支持地理定位功能。");
      return;
    }

    // Helper function to wrap callback-based geolocation API in a Promise
    const getPosition = (options: PositionOptions): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
        // Safety timeout race: Some mobile browsers hang indefinitely despite options.timeout
        const safetyTimeout = (options.timeout || 10000) + 2000;
        const timerId = setTimeout(() => {
          reject(new Error("Geolocation safety timeout"));
        }, safetyTimeout);

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timerId);
            resolve(pos);
          }, 
          (err) => {
            clearTimeout(timerId);
            reject(err);
          }, 
          options
        );
      });
    };

    try {
      let position: GeolocationPosition;

      try {
        // Attempt 1: High Accuracy (GPS preferred)
        // Increased timeout to 8s to allow for cold GPS start
        position = await getPosition({ 
          enableHighAccuracy: true, 
          timeout: 8000, 
          maximumAge: 0 
        });
      } catch (e) {
        if (!isLocatingRef.current) return; 
        console.warn("High accuracy positioning failed, falling back to low accuracy...", e);
        
        // Attempt 2: Low Accuracy (Network/Wifi preferred)
        // Increased timeout to 15s
        position = await getPosition({ 
          enableHighAccuracy: false, 
          timeout: 15000, 
          maximumAge: 30000 
        });
      }

      if (!isLocatingRef.current) return;
      isLocatingRef.current = false;

      const coords: GeoLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      
      const newId = Date.now().toString();
      const record: ParkingLocation = {
        id: newId,
        timestamp: Date.now(),
        coords: coords,
        locationName: "自动定位位置"
      };
      setTempRecord(record);

      // Trigger photo immediately
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }

    } catch (error: any) {
      if (!isLocatingRef.current) return;
      isLocatingRef.current = false;
      
      let msg = "定位失败";
      // GeolocationPositionError codes: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
      if (error.code === 1) {
        msg = "定位权限被拒绝。请在系统设置中允许浏览器访问位置信息，或刷新页面重试。";
      } else if (error.code === 2) {
        msg = "位置信息不可用。请检查 GPS/定位服务是否开启。";
      } else if (error.code === 3) {
        msg = "获取位置超时。信号较弱，请尝试移至开阔地带。";
      } else {
        msg = `定位出错 (${error.message || '未知错误'})。`;
      }

      console.warn("Geolocation error", error);
      setErrorMsg(msg);
    }
  };

  const handleManualLocation = () => {
    isLocatingRef.current = false;
    setErrorMsg(null);
    
    const newId = Date.now().toString();
    const record: ParkingLocation = {
      id: newId,
      timestamp: Date.now(),
      locationName: "" // Empty for manual entry
    };
    
    // Save immediately
    const newList = addOrUpdateParkingRecord(record);
    setParkingList(newList);
    
    // Directly activate the record we just created
    activateRecord(record);
    setEditMode(true); // Auto open edit mode so user can type name
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    
    // User cancelled photo during creation flow
    if (!file) {
      if (tempRecord) {
        // Save what we have (coords) and go to detail
        const newList = addOrUpdateParkingRecord(tempRecord);
        setParkingList(newList);
        activateRecord(tempRecord);
        setEditMode(true); // Prompt to add name
      } else {
        // If we don't have a temp record (shouldn't happen in auto flow usually), go back
        handleBackToList(); 
      }
      return;
    }

    if (!tempRecord) return;
    
    processAndSavePhoto(file, tempRecord);
  };
  
  const processAndSavePhoto = (file: File, record: ParkingLocation) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setTempPhoto(base64String);
      setViewMode('ANALYZING');

      const analysis = await analyzeParkingPhoto(base64String);
      
      const newRecord: ParkingLocation = {
        ...record,
        photoBase64: base64String,
        floor: analysis.floor || undefined,
        spotNumber: analysis.spotNumber || undefined,
        aiAnalysis: analysis.description || undefined,
        notes: analysis.description || undefined,
        locationName: record.locationName || "停车位置"
      };

      const newList = addOrUpdateParkingRecord(newRecord);
      setParkingList(newList);
      activateRecord(newRecord);
    };
    reader.readAsDataURL(file);
  };

  // --- Handlers: Detail View Updates ---

  const handleDetailAddPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const activeRecord = parkingList.find(r => r.id === activeRecordId);
    
    if (file && activeRecord) {
       const reader = new FileReader();
       reader.onloadend = () => {
         const base64String = reader.result as string;
         const updated = { ...activeRecord, photoBase64: base64String };
         const newList = addOrUpdateParkingRecord(updated);
         setParkingList(newList);
       };
       reader.readAsDataURL(file);
    }
  };

  const handleUpdateActiveRecord = () => {
    const activeRecord = parkingList.find(r => r.id === activeRecordId);
    if (!activeRecord) return;

    const updated: ParkingLocation = {
      ...activeRecord,
      floor: manualFloor,
      spotNumber: manualSpot,
      notes: manualNotes,
      locationName: manualLocationName,
      durationMinutes: timerDuration || undefined
    };
    
    const newList = addOrUpdateParkingRecord(updated);
    setParkingList(newList);
    
    setEditMode(false);
    setShowTimerSetup(false);
  };

  const openMap = (record: ParkingLocation) => {
    let query = "";
    if (record.coords) {
      query = `${record.coords.latitude},${record.coords.longitude}`;
    } else if (record.locationName) {
      query = encodeURIComponent(record.locationName);
    }

    if (query) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    } else {
      alert("无可导航的位置数据（GPS 或地址）。");
    }
  };
  
  // ---------------- Render Helpers ----------------
  
  const TimerOptionButton = ({ mins, label }: { mins: number, label: string }) => (
    <button 
      onClick={() => setTimerDuration(mins)}
      className={`px-4 py-3 rounded-xl border font-medium text-sm transition-all ${
        timerDuration === mins 
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
          : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300'
      }`}
    >
      {label}
    </button>
  );

  const getRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getStatusColor = (record: ParkingLocation) => {
    if (!record.durationMinutes) return "bg-white border-gray-100";
    
    const now = Date.now();
    const endTime = record.timestamp + (record.durationMinutes * 60000);
    const remainingMs = endTime - now;
    
    if (remainingMs <= 0) return "bg-red-50 border-red-200"; // Expired
    if (remainingMs < 15 * 60000) return "bg-orange-50 border-orange-200"; // Warning (< 15 mins)
    return "bg-white border-gray-100"; // Normal
  };

  // ---------------- Render Views ----------------

  const renderListView = () => (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">我的停车记录</h2>
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{parkingList.length}</span>
          {parkingList.length > 0 && (
            <button 
              onClick={handleClearAll}
              className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
              title="清空所有记录"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {parkingList.length === 0 ? (
         <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
           <div className="bg-gray-100 p-6 rounded-full mb-4">
             <Car className="w-10 h-10 text-gray-300" />
           </div>
           <p className="mb-2">暂无停车记录</p>
           <p className="text-sm">点击下方按钮添加新位置</p>
         </div>
      ) : (
        <div className="space-y-4">
          {parkingList.map((record) => {
             const now = Date.now();
             const isTimed = !!record.durationMinutes;
             const endTime = isTimed ? record.timestamp + (record.durationMinutes! * 60000) : 0;
             const isExpired = isTimed && now > endTime;
             const isWarning = isTimed && !isExpired && (endTime - now < 15 * 60000);
             
             return (
              <div 
                key={record.id} 
                onClick={() => handleViewDetail(record.id)}
                className={`p-4 rounded-2xl shadow-sm border active:scale-[0.98] transition-all cursor-pointer relative overflow-hidden ${getStatusColor(record)}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center space-x-2">
                     <div className={`p-2 rounded-lg ${isExpired ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                       <MapPin className="w-5 h-5" />
                     </div>
                     <div>
                       <h3 className="font-bold text-gray-800 line-clamp-1">
                         {record.locationName || "未命名位置"}
                       </h3>
                       <p className="text-xs text-gray-400">{getRelativeTime(record.timestamp)}</p>
                     </div>
                  </div>
                  {isTimed && (
                     <div className={`px-2 py-1 rounded-md text-xs font-bold flex items-center ${
                       isExpired ? 'bg-red-100 text-red-600' : 
                       isWarning ? 'bg-orange-100 text-orange-600' : 
                       'bg-green-50 text-green-600'
                     }`}>
                       {isExpired ? (
                         <>
                           <AlertTriangle className="w-3 h-3 mr-1" /> 已超时
                         </>
                       ) : (
                         <>
                           <Clock className="w-3 h-3 mr-1" /> 
                           {isWarning ? '即将超时' : '计时中'}
                         </>
                       )}
                     </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-4 ml-12 text-sm text-gray-600">
                   {record.floor && (
                     <span className="bg-white/50 px-2 py-1 rounded border border-gray-200">
                       {record.floor}层
                     </span>
                   )}
                   {record.spotNumber && (
                     <span className="bg-white/50 px-2 py-1 rounded border border-gray-200">
                       {record.spotNumber}号
                     </span>
                   )}
                   {!record.floor && !record.spotNumber && (
                     <span className="italic text-gray-400">无详细信息</span>
                   )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-6 left-6 right-6 z-20">
        <Button 
          onClick={handleAddNew} 
          className="w-full h-14 text-lg shadow-xl shadow-indigo-500/40"
          icon={<Plus className="w-6 h-6" />}
        >
          记录新位置
        </Button>
      </div>
    </div>
  );

  const renderCreationChoice = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-fade-in">
       <div className="w-full flex justify-start mb-4">
         <button onClick={handleBackToList} className="text-gray-500 hover:bg-gray-100 p-2 rounded-full">
            <ChevronLeft className="w-6 h-6" />
         </button>
       </div>
      <div className="relative">
        <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full animate-pulse"></div>
        <div className="bg-white p-6 rounded-3xl shadow-xl relative z-10">
          <Car className="w-16 h-16 text-indigo-600" />
        </div>
      </div>
      
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-gray-800">记录停车位置</h2>
        <p className="text-gray-500 max-w-xs mx-auto">选择记录方式</p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <Button 
          onClick={handleStartAutoLocation} 
          className="w-full h-14 text-lg shadow-indigo-500/40 hover:shadow-indigo-500/50"
          icon={<MapPin className="w-5 h-5" />}
        >
          自动定位 + 拍照
        </Button>

        <Button 
          variant="secondary"
          onClick={handleManualLocation} 
          className="w-full h-14 text-lg"
          icon={<Edit2 className="w-5 h-5" />}
        >
          手动输入
        </Button>
      </div>

      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        className="hidden"
      />
    </div>
  );

  const renderLocating = () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6 p-4 text-center">
      {errorMsg ? (
        <>
          <div className="bg-red-100 p-4 rounded-full text-red-500">
             <AlertTriangle className="w-10 h-10" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-800 mb-2">无法自动定位</p>
            <p className="text-sm text-gray-600 mb-6">{errorMsg}</p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <Button onClick={handleStartAutoLocation} variant="secondary" className="w-full" icon={<RefreshCw className="w-4 h-4"/>}>
              重试
            </Button>
            <Button onClick={handleManualLocation} className="w-full">
              手动输入位置
            </Button>
            <button onClick={handleBackToList} className="text-gray-400 text-sm mt-4 underline">
               取消
            </button>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
          <div>
             <p className="text-lg font-medium text-gray-700">正在获取 GPS 信号...</p>
             <p className="text-sm text-gray-400 mt-1">为了提高准确度，请保持静止</p>
          </div>
          
          <Button 
            variant="ghost" 
            onClick={handleManualLocation} 
            className="mt-4 text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
          >
            跳过，手动输入
          </Button>
        </>
      )}
    </div>
  );

  const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6">
      <div className="relative w-full max-w-sm aspect-video rounded-2xl overflow-hidden shadow-lg border-2 border-indigo-100">
        {tempPhoto && (
          <img src={tempPhoto} alt="Parking" className="w-full h-full object-cover opacity-50" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[2px]">
          <div className="bg-white/90 p-4 rounded-full shadow-lg">
             <div className="animate-spin text-indigo-600">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                </svg>
             </div>
          </div>
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-800 mb-2">正在分析图片...</h3>
        <p className="text-gray-500 text-sm max-w-xs">Gemini AI 正在识别楼层和车位号。</p>
      </div>
    </div>
  );

  const renderDetailView = () => {
    const activeRecord = parkingList.find(r => r.id === activeRecordId);
    if (!activeRecord) return null;

    if (editMode || showTimerSetup) {
      return (
        <div className="space-y-6 animate-fade-in pb-12">
           <div className="flex items-center justify-between mb-4">
             <h2 className="text-xl font-bold text-gray-800">{showTimerSetup ? '设置计时' : '编辑详情'}</h2>
             <button onClick={() => { setEditMode(false); setShowTimerSetup(false); }} className="text-gray-500 hover:text-gray-700">取消</button>
           </div>
           
           {showTimerSetup && (
             <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-6">
                <div className="flex items-center mb-4 text-indigo-600">
                  <Clock className="w-5 h-5 mr-2" />
                  <span className="font-semibold">停车时长</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <TimerOptionButton mins={30} label="30分" />
                  <TimerOptionButton mins={60} label="1小时" />
                  <TimerOptionButton mins={90} label="1.5小时" />
                  <TimerOptionButton mins={120} label="2小时" />
                  <TimerOptionButton mins={180} label="3小时" />
                  <TimerOptionButton mins={240} label="4小时" />
                </div>
                <div className="flex items-center justify-between">
                   <span className="text-sm text-gray-500">或清除计时</span>
                   <button onClick={() => setTimerDuration(null)} className="text-sm text-red-500 font-medium px-3 py-1 bg-red-50 rounded-lg">清除</button>
                </div>
             </div>
           )}

           {(editMode || !showTimerSetup) && (
             <div className="space-y-4">
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">地点名称 / 地址</label>
                 <input 
                    type="text" 
                    value={manualLocationName} 
                    onChange={(e) => setManualLocationName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="例如：万达广场 3楼"
                 />
                 <p className="text-xs text-gray-500 mt-1">当无 GPS 信号时用于导航。</p>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">楼层</label>
                    <input 
                        type="text" 
                        value={manualFloor} 
                        onChange={(e) => setManualFloor(e.target.value)}
                        className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        placeholder="例如：B2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">车位号</label>
                    <input 
                        type="text" 
                        value={manualSpot} 
                        onChange={(e) => setManualSpot(e.target.value)}
                        className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        placeholder="例如：402"
                    />
                  </div>
               </div>
               <div>
                 <label className="block text-sm font-medium text-gray-700 mb-1">备注 / 描述</label>
                 <textarea 
                    value={manualNotes} 
                    onChange={(e) => setManualNotes(e.target.value)}
                    className="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all h-24 resize-none"
                    placeholder="在电梯附近..."
                 />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">更新照片</label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    ref={editFileInputRef}
                    onChange={handleDetailAddPhoto}
                    className="hidden" 
                  />
                  <Button 
                    variant="secondary" 
                    onClick={() => editFileInputRef.current?.click()}
                    className="w-full border-dashed"
                    icon={<Camera className="w-4 h-4" />}
                  >
                    拍摄新照片
                  </Button>
               </div>
             </div>
           )}
           
           <Button onClick={handleUpdateActiveRecord} className="w-full mt-6" icon={<Save className="w-4 h-4" />}>
             保存修改
           </Button>
        </div>
      );
    }

    const canNavigate = !!(activeRecord.coords || activeRecord.locationName);

    return (
      <div className="space-y-6 animate-fade-in pb-24">
        {/* Back Button & Title */}
        <div className="flex items-center space-x-2 -ml-2 mb-2">
           <button onClick={handleBackToList} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
             <ChevronLeft className="w-6 h-6" />
           </button>
           <h2 className="text-lg font-bold text-gray-800 truncate">
             {activeRecord.locationName || "详情"}
           </h2>
        </div>

        {/* Header Status */}
        <div className={`rounded-3xl p-6 text-white shadow-xl transition-colors ${isExpired ? 'bg-red-500 shadow-red-200' : 'bg-indigo-600 shadow-indigo-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <span className="font-semibold tracking-wide text-sm opacity-90">
                {isExpired ? '停车超时' : '已停车'}
              </span>
            </div>
            <div className="flex items-center space-x-1 bg-white/20 px-3 py-1 rounded-full text-xs font-medium">
              <Clock className="w-3 h-3" />
              <span>已停 {elapsedTime}</span>
            </div>
          </div>
          
          <div className="flex justify-between items-end">
             <div>
               <p className="text-white/70 text-sm mb-1">楼层</p>
               <p className="text-3xl font-bold">{activeRecord.floor || "--"}</p>
             </div>
             <div className="text-right">
               <p className="text-white/70 text-sm mb-1">车位</p>
               <p className="text-3xl font-bold">{activeRecord.spotNumber || "--"}</p>
             </div>
          </div>
        </div>
        
        {/* Location Address Display */}
        {activeRecord.locationName && (
           <div className="flex items-start space-x-2 text-gray-600 px-1">
             <MapPin className="w-4 h-4 mt-0.5 text-indigo-500 shrink-0" />
             <span className="text-sm font-medium">{activeRecord.locationName}</span>
           </div>
        )}

        {/* Timer Card */}
        <div className="bg-white p-1 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {activeRecord.durationMinutes ? (
             <div className="flex items-center justify-between p-4">
               <div className="flex items-center space-x-3">
                 <div className={`p-2 rounded-lg ${isExpired ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                   {isExpired ? <AlertTriangle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                 </div>
                 <div>
                   <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">剩余时间</p>
                   <p className={`text-xl font-bold ${isExpired ? 'text-red-600' : 'text-gray-900'}`}>{remainingTime}</p>
                 </div>
               </div>
               <button onClick={() => setShowTimerSetup(true)} className="text-sm font-semibold text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors">
                 编辑
               </button>
             </div>
          ) : (
            <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setShowTimerSetup(true)}>
               <div className="flex items-center space-x-3">
                 <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                   <Bell className="w-5 h-5" />
                 </div>
                 <div>
                   <p className="text-sm font-semibold text-gray-700">设置停车计时</p>
                   <p className="text-xs text-gray-500">超时前接收通知</p>
                 </div>
               </div>
               <div className="bg-indigo-50 text-indigo-600 p-1.5 rounded-lg">
                 <Plus className="w-4 h-4" />
               </div>
            </div>
          )}
        </div>

        {/* Photo Section */}
        <div className="relative rounded-2xl overflow-hidden shadow-md border border-gray-100 bg-gray-100 min-h-[12rem]">
           {activeRecord.photoBase64 ? (
             <>
               <img src={activeRecord.photoBase64} alt="Parking Spot" className="w-full h-48 object-cover" />
               <div className="absolute top-2 right-2">
                 <button 
                    onClick={() => setEditMode(true)}
                    className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-full backdrop-blur-sm transition-all"
                 >
                   <Edit2 className="w-4 h-4" />
                 </button>
               </div>
             </>
           ) : (
             <div className="flex flex-col items-center justify-center h-48 space-y-3">
                <p className="text-gray-400 text-sm">暂无照片</p>
                <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    ref={editFileInputRef}
                    onChange={handleDetailAddPhoto}
                    className="hidden" 
                />
                <Button variant="secondary" onClick={() => editFileInputRef.current?.click()} className="text-xs py-2 px-4 h-auto">
                  <Camera className="w-4 h-4 mr-2" /> 添加照片
                </Button>
             </div>
           )}
        </div>

        {/* Location & Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            variant="secondary" 
            onClick={() => openMap(activeRecord)} 
            disabled={!canNavigate}
            className={`flex-col py-4 h-auto space-y-2 ${!canNavigate ? 'opacity-50 grayscale' : ''}`}
          >
             <Navigation className="w-6 h-6 text-blue-500" />
             <span className="text-xs font-medium">{canNavigate ? '导航' : '无位置信息'}</span>
          </Button>
          <Button variant="secondary" onClick={() => setEditMode(true)} className="flex-col py-4 h-auto space-y-2">
             <Edit2 className="w-6 h-6 text-orange-500" />
             <span className="text-xs font-medium">编辑备注</span>
          </Button>
        </div>

        {/* Notes Card */}
        {activeRecord.notes && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
             <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
               <Type className="w-4 h-4 mr-2 text-gray-400" />
               备注
             </h4>
             <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{activeRecord.notes}</p>
          </div>
        )}

        {/* Bottom Action */}
        <div className="fixed bottom-6 left-6 right-6">
           <Button variant="danger" onClick={() => handleDeleteRecord(activeRecord.id)} className="w-full shadow-lg shadow-red-200" icon={<Trash2 className="w-5 h-5" />}>
             删除此记录
           </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-indigo-100">
      <div className="max-w-md mx-auto min-h-screen bg-white shadow-2xl relative overflow-hidden">
        {/* Background Decorations */}
        <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-indigo-50/50 to-transparent pointer-events-none"></div>

        {/* Header */}
        <header className="px-6 pt-8 pb-2 relative z-10 flex items-center justify-between">
           <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
             Smart Park AI
           </h1>
        </header>

        {/* Main Content */}
        <main className="px-6 py-4 relative z-10">
          {errorMsg && viewMode !== 'LOCATING' && (
            <div className="mb-6 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-start">
              <span className="mr-2">⚠️</span>
              {errorMsg}
            </div>
          )}

          {viewMode === 'LIST' && renderListView()}
          {viewMode === 'CREATE_CHOICE' && renderCreationChoice()}
          {viewMode === 'LOCATING' && renderLocating()}
          {viewMode === 'ANALYZING' && renderAnalyzing()}
          {viewMode === 'DETAIL' && renderDetailView()}
        </main>
      </div>
    </div>
  );
};

export default App;