"use client";

import { 
  useState, 
  useEffect, 
  useRef, 
  useMemo, 
  ChangeEvent, 
  useCallback, 
  DragEvent,
  useLayoutEffect 
} from "react";

// --- 型定義 ---
interface Task {
  id: string;
  title: string;
  timeInMinutes: number;
}
interface TemplateTask {
  id: string;
  title: string;
  timeOffsetInMinutes: number;
}
interface Template {
  id: string;
  name: string;
  tasks: TemplateTask[];
}
type ModalTime = { hour: number; minute: number };

// --- 定数 ---
const TOTAL_HOURS = 31; // 翌朝7時までの31時間
const MINUTES_PER_HOUR = 60;
const TOTAL_MINUTES = TOTAL_HOURS * MINUTES_PER_HOUR;
const MIN_ZOOM_THRESHOLD = 0.3; 
const LONG_PRESS_DURATION = 500; 
const HEADER_PADDING_TOP_PX = 80;

// --- TimePickerWheel コンポーネント ---
// ★ 重要: CSSの height: 48px と完全に一致させる
const ITEM_HEIGHT_PX = 48; 

interface TimePickerWheelProps {
  items: number[]; 
  value: number;   
  onChange: (newValue: number) => void; 
  unit: 'h' | 'm'; 
  formatLabel: (value: number) => string; 
}

const TimePickerWheel: React.FC<TimePickerWheelProps> = ({ 
  items, 
  value, 
  onChange, 
  unit, 
  formatLabel 
}) => {
  const scrollRef = useRef<HTMLUListElement>(null);
  const scrollTimer = useRef<NodeJS.Timeout | null>(null);
  
  // 初期表示・外部更新時の位置合わせ
  useLayoutEffect(() => {
    const wheel = scrollRef.current;
    if (wheel) {
      const index = items.indexOf(value);
      if (index !== -1) {
        // 完全に一致していない場合のみスクロール（微調整ループ防止）
        const targetTop = index * ITEM_HEIGHT_PX;
        if (Math.abs(wheel.scrollTop - targetTop) > 1) {
           wheel.scrollTo({ top: targetTop, behavior: 'auto' });
        }
      }
    }
  }, [value, items]);

  // PCのマウスホイール操作の最適化
  useEffect(() => {
    const wheel = scrollRef.current;
    if (!wheel) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // 現在のスクロール位置からインデックスを計算
      const currentScroll = wheel.scrollTop;
      const currentIndex = Math.round(currentScroll / ITEM_HEIGHT_PX);
      
      // ホイールの方向 (正: 下へ=進む, 負: 上へ=戻る)
      const direction = Math.sign(e.deltaY);
      
      let nextIndex = currentIndex + direction;
      
      // 範囲制限
      nextIndex = Math.min(Math.max(0, nextIndex), items.length - 1);
      
      // スムーズに1項目分だけ移動
      wheel.scrollTo({
        top: nextIndex * ITEM_HEIGHT_PX,
        behavior: 'smooth'
      });
    };

    wheel.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      wheel.removeEventListener('wheel', handleWheel);
    };
  }, [items.length]);

  // スクロール終了時のスナップ位置補正と値の確定
  const handleScroll = () => {
    const wheel = scrollRef.current;
    if (!wheel) return;

    if (scrollTimer.current) {
      clearTimeout(scrollTimer.current);
    }

    // スクロールが止まってから処理 (100ms後)
    scrollTimer.current = setTimeout(() => {
      const scrollTop = wheel.scrollTop;
      // 丸めでインデックスを決定 (0.5以上なら次の数字へ)
      const index = Math.round(scrollTop / ITEM_HEIGHT_PX);
      
      const clampedIndex = Math.min(Math.max(0, index), items.length - 1);
      const newValue = items[clampedIndex];

      // 値が変更されていれば通知
      if (newValue !== value) {
        onChange(newValue); 
      }
      
      // 視覚的にも中心にピタッと合わせる
      const targetTop = clampedIndex * ITEM_HEIGHT_PX;
      if (Math.abs(scrollTop - targetTop) > 1) {
        wheel.scrollTo({ top: targetTop, behavior: 'smooth' });
      }

    }, 100); 
  };

  return (
    <>
      <ul
        ref={scrollRef}
        onScroll={handleScroll}
        className="time-wheel"
      >
        {items.map((item) => {
          const isSnapped = item === value;
          return (
            <li
              key={item}
              className={`time-wheel-item ${
                isSnapped ? "time-wheel-item-snapped" : ""
              }`}
              // クリックでも選択できるようにする
              onClick={() => {
                onChange(item);
              }}
            >
              {formatLabel(item)}
            </li>
          );
        })}
      </ul>
      <span className="time-wheel-unit-label">{unit}</span>
    </>
  );
};


/**
 * 24hタイムライン アプリケーションのメインページ
 */
export default function HomePage() {
  // --- 状態 (State) ---
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [modalTime, setModalTime] = useState<ModalTime>({ hour: 0, minute: 0 }); 
  const [pixelsPerMinute, setPixelsPerMinute] = useState(2); 
  const [currentTime, setCurrentTime] = useState<Date | null>(null); 
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set<string>());
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [originalTasks, setOriginalTasks] = useState<Task[]>([]);
  const [movedTaskIds, setMovedTaskIds] = useState(new Set<string>());
  const [dragStartY, setDragStartY] = useState(0); 
  const [dragStartMinutes, setDragStartMinutes] = useState(0);
  const [dragGhostMinutes, setDragGhostMinutes] = useState<number | null>(null);
  const [dragStartTaskId, setDragStartTaskId] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  
  // --- Ref ---
  const mainContentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null); 
  const isSyncingScroll = useRef(false); 
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPressed = useRef(false); 

  // --- 動的な高さ計算 ---
  const { TIMELINE_HEIGHT_PX, HOUR_HEIGHT_PX } = useMemo(() => {
    const HOUR_HEIGHT_PX = MINUTES_PER_HOUR * pixelsPerMinute;
    const TIMELINE_HEIGHT_PX = TOTAL_HOURS * HOUR_HEIGHT_PX;
    return { TIMELINE_HEIGHT_PX, HOUR_HEIGHT_PX };
  }, [pixelsPerMinute]);

  const hourPickerItems = useMemo(() => Array.from({ length: TOTAL_HOURS }, (_, i) => i), []); 
  const minutePickerItems = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []); 

  // 現在時刻へジャンプ
  const scrollToCurrentTime = (behavior: 'smooth' | 'auto' = 'smooth') => {
    if (!mainContentRef.current || !sidebarRef.current) return;
    const now = new Date();
    setCurrentTime(now); 
    const currentMinute = now.getHours() * 60 + now.getMinutes();
    const scrollPosition = (currentMinute * pixelsPerMinute); 
    const centerOffset = (window.innerHeight / 2) - (HEADER_PADDING_TOP_PX / 2); 
    mainContentRef.current.scrollTo({
      top: scrollPosition - centerOffset,
      behavior: behavior,
    });
    sidebarRef.current.scrollTo({
      top: scrollPosition - centerOffset,
      behavior: behavior,
    });
  };

  // --- データ取得 ---
  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks");
      if (response.ok) {
        const data: Task[] = await response.json();
        setTasks(data);
        setOriginalTasks(data); 
        setMovedTaskIds(new Set());
      }
    } catch (error) {
      console.error("タスクの取得エラー:", error);
    }
  }, []); 

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/templates");
      if (response.ok) {
        setTemplates(await response.json());
      }
    } catch (error) {
      console.error("テンプレートの取得エラー:", error);
    }
  }, []);

  // --- useEffect (マウント時) ---
  useEffect(() => {
    fetchTasks();
    fetchTemplates(); 
    const now = new Date();
    setCurrentTime(now); 
    const currentMinute = now.getHours() * 60 + now.getMinutes();
    const scrollPosition = currentMinute * pixelsPerMinute;
    const centerOffset = (window.innerHeight / 2) - (HEADER_PADDING_TOP_PX / 2);
    if (mainContentRef.current) mainContentRef.current.scrollTop = scrollPosition - centerOffset;
    if (sidebarRef.current) sidebarRef.current.scrollTop = scrollPosition - centerOffset;
    const timer = setInterval(() => setCurrentTime(new Date()), 10000); 
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('beforeinstallprompt fired!');
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTasks, fetchTemplates]); 

  // --- 時間変換ユーティリティ ---
  const minutesToTime = (minutes: number): ModalTime => ({
    hour: Math.floor(minutes / 60), 
    minute: minutes % 60,
  });
  const timeToMinutes = (time: ModalTime): number => time.hour * 60 + time.minute;
  const formatTime = (timeInMinutes: number) => {
    const { hour, minute } = minutesToTime(timeInMinutes); 
    if (hour >= 24) return `(翌 ${ (hour % 24).toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")})`;
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  };

  // --- イベントハンドラ ---
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || isModalOpen || isTemplateModalOpen || isSaveTemplateModalOpen) return;
    if ((e.target as HTMLElement).closest('.task-item')) return;
    const mainEl = e.currentTarget; 
    if (!mainEl) return;
    const scrollTop = mainEl.scrollTop;
    const mainRectTop = mainEl.getBoundingClientRect().top; 
    const clickY_viewport = e.clientY; 
    const clickY_relativeToMain = clickY_viewport - mainRectTop; 
    if (clickY_relativeToMain < 0) return; 
    const absoluteY = scrollTop + clickY_relativeToMain;
    let minute = Math.round(absoluteY / pixelsPerMinute);
    minute = Math.min(Math.max(0, minute), TOTAL_MINUTES - 1);
    setSelectedTask(null);
    setModalTitle("");
    setModalTime(minutesToTime(minute)); 
    setIsModalOpen(true);
  };

  const handleTaskClick = (task: Task) => {
    if (!isEditMode) return;
    if ((event as any).target.type === 'checkbox') return;
    if (dragGhostMinutes !== null) return; 
    setSelectedTask(task);
    setModalTitle(task.title);
    setModalTime(minutesToTime(task.timeInMinutes)); 
    setIsModalOpen(true);
  };

  // --- API連携 ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalTitle) return;
    const timeInMinutes = timeToMinutes(modalTime); 
    try {
      if (selectedTask) {
        const response = await fetch(`/api/tasks/${selectedTask.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: modalTitle, timeInMinutes }),
        });
        if (!response.ok) throw new Error('タスクの更新に失敗しました');
      } else {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: modalTitle, timeInMinutes }),
        });
        if (!response.ok) throw new Error('タスクの作成に失敗しました');
      }
      closeModal();
      await fetchTasks();
    } catch (error) {
      console.error("タスクの保存に失敗:", error);
    }
  };

  const handleDelete = async () => {
    if (!selectedTask || !selectedTask.id) return;
    try {
      const response = await fetch(`/api/tasks/${selectedTask.id}`, { method: "DELETE" });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`APIエラー: ${response.status} - ${errorData.error || '不明なエラー'}`);
      }
      closeModal();
      await fetchTasks();
    } catch (error) {
      console.error("タスクの削除に失敗しました:", error);
    }
  };

  // --- モーダル ---
  const closeModal = () => setIsModalOpen(false);
  const openTemplateModal = () => {
    closeModal(); 
    setIsTemplateModalOpen(true);
  };
  const closeTemplateModal = () => setIsTemplateModalOpen(false);
  const openSaveTemplateModal = () => {
    setIsSaveTemplateModalOpen(true);
    setNewTemplateName("");
  };
  const closeSaveTemplateModal = () => setIsSaveTemplateModalOpen(false);

  // --- JSスクロール同期 ---
  const handleScroll = (source: 'sidebar' | 'main') => {
    if (isSyncingScroll.current) {
      isSyncingScroll.current = false;
      return;
    }
    isSyncingScroll.current = true;
    const sidebar = sidebarRef.current;
    const main = mainContentRef.current;
    if (sidebar && main) {
      if (source === 'sidebar') main.scrollTop = sidebar.scrollTop;
      else sidebar.scrollTop = main.scrollTop;
    }
  };

  // --- ズーム機能 ---
  const handleZoom = (newPixelsPerMinute: number) => {
    if (!mainContentRef.current) return;
    const mainRect = mainContentRef.current.getBoundingClientRect();
    const centerViewportY = mainRect.top + mainRect.height / 2;
    const absoluteY = mainContentRef.current.scrollTop + (centerViewportY - mainRect.top);
    const centerMinute = absoluteY / pixelsPerMinute;
    setPixelsPerMinute(newPixelsPerMinute); 
    const newScrollTop = (centerMinute * newPixelsPerMinute) - (mainRect.height / 2);
    requestAnimationFrame(() => {
      if (mainContentRef.current) mainContentRef.current.scrollTop = newScrollTop;
      if (sidebarRef.current) sidebarRef.current.scrollTop = newScrollTop;
    });
  };
  const zoomIn = () => handleZoom(Math.min(pixelsPerMinute * 1.5, 20));
  const zoomOut = () => handleZoom(Math.max(pixelsPerMinute / 1.5, MIN_ZOOM_THRESHOLD));

  // --- PWAインストール ---
  const handleInstallClick = () => {
    if (deferredPrompt) {
      (deferredPrompt as any).prompt(); 
      (deferredPrompt as any).userChoice.then((choiceResult: any) => {
        setDeferredPrompt(null); 
      });
    }
  };

  // --- 赤いバー ---
  const currentMinute = currentTime 
    ? currentTime.getHours() * 60 + currentTime.getMinutes() 
    : 0;
  const currentTimeTopPx = currentMinute * pixelsPerMinute;

  // --- 範囲選択 ---
  const handleCheckboxClick = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation(); 
    const newSelectedIds = new Set(selectedTaskIds);
    const isAlreadySelected = newSelectedIds.has(taskId);
    if (isAlreadySelected) {
      newSelectedIds.delete(taskId);
      if (selectionAnchor === taskId) setSelectionAnchor(null);
    } else if (selectionAnchor === null) {
      newSelectedIds.add(taskId);
      setSelectionAnchor(taskId);
    } else {
      const startIndex = tasks.findIndex(t => t.id === selectionAnchor);
      const endIndex = tasks.findIndex(t => t.id === taskId);
      if (startIndex !== -1 && endIndex !== -1) {
        const min = Math.min(startIndex, endIndex);
        const max = Math.max(startIndex, endIndex);
        for (let i = min; i <= max; i++) {
          newSelectedIds.add(tasks[i].id);
        }
      }
      setSelectionAnchor(null);
    }
    setSelectedTaskIds(newSelectedIds);
  };
  const handleClearSelection = () => {
    setSelectedTaskIds(new Set());
    setSelectionAnchor(null);
  };
  
  // --- 遅延ゼロ自動保存 ---
  const saveMovedTasks = async () => {
    setIsBatchLoading(true);
    try {
      const changedTasks = tasks.filter(task => {
        const original = originalTasks.find(ot => ot.id === task.id);
        return original && original.timeInMinutes !== task.timeInMinutes;
      });
      if (changedTasks.length > 0) {
        await Promise.all(
          changedTasks.map(task => 
            fetch(`/api/tasks/${task.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                title: task.title, 
                timeInMinutes: task.timeInMinutes
              }),
            })
          )
        );
      }
    } catch (error) {
      console.error("時間変更の保存に失敗:", error);
    } finally {
      setIsBatchLoading(false);
      setOriginalTasks(tasks);
      setMovedTaskIds(new Set());
    }
  };
  const handleToggleEditMode = (newEditMode: boolean) => {
    if (isEditMode && !newEditMode) {
      if (movedTaskIds.size > 0) saveMovedTasks();
      setSelectedTaskIds(new Set());
      setSelectionAnchor(null);
    }
    setIsEditMode(newEditMode);
  };

  // --- 一括削除 ---
  const handleBatchDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    setIsBatchLoading(true);
    const taskIds = Array.from(selectedTaskIds);
    try {
      const response = await fetch('/api/tasks/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskIds }),
      });
      if (response.ok) {
        await fetchTasks();
        setSelectedTaskIds(new Set());
        setSelectionAnchor(null);
      }
    } catch (error) {
      console.error('一括削除中にエラー:', error);
    } finally {
      setIsBatchLoading(false);
    }
  };

  // +1m / -1m
  const handleBatchOperation = (operation: 'move-up' | 'move-down') => {
    const deltaMinutes = operation === 'move-up' ? -1 : 1;
    setTasks(currentTasks => 
      currentTasks.map(task => {
        if (selectedTaskIds.has(task.id)) {
          return { ...task, timeInMinutes: Math.max(0, task.timeInMinutes + deltaMinutes) };
        }
        return task;
      })
    );
    const newMovedIds = new Set(movedTaskIds);
    selectedTaskIds.forEach(id => newMovedIds.add(id));
    setMovedTaskIds(newMovedIds);
  };
  
  // --- ドラッグ＆ドロップ ---
  const handleDragStart = (e: DragEvent<HTMLDivElement>, task: Task) => {
    if (!selectedTaskIds.has(task.id)) {
      setSelectedTaskIds(new Set([task.id]));
      setSelectionAnchor(null);
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setDragImage(new Image(), 0, 0); 
    const mainRectTop = mainContentRef.current!.getBoundingClientRect().top;
    setDragStartY(e.clientY - mainRectTop); 
    setDragStartMinutes(task.timeInMinutes);
    setDragStartTaskId(task.id);
  };
  const handleDragOverMain = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); 
    if (dragStartTaskId === null) return;
    const mainRectTop = e.currentTarget.getBoundingClientRect().top;
    const currentY_relativeToMain = e.clientY - mainRectTop; 
    const deltaY = currentY_relativeToMain - dragStartY; 
    const deltaMinutes = Math.round(deltaY / pixelsPerMinute);
    const newGhostMinutes = dragStartMinutes + deltaMinutes;
    setDragGhostMinutes(newGhostMinutes);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragGhostMinutes === null || dragStartTaskId === null) return; 
    const dragStartTask = tasks.find(t => t.id === dragStartTaskId);
    const originalTimeOfDraggable = dragStartTask ? dragStartTask.timeInMinutes : dragStartMinutes;
    let deltaMinutes = dragGhostMinutes - originalTimeOfDraggable;
    deltaMinutes = Math.max(-originalTimeOfDraggable, deltaMinutes); 
    setTasks(currentTasks => 
      currentTasks.map(task => {
        if (selectedTaskIds.has(task.id)) {
          return { ...task, timeInMinutes: Math.max(0, task.timeInMinutes + deltaMinutes) };
        }
        return task;
      })
    );
    const newMovedIds = new Set(movedTaskIds);
    selectedTaskIds.forEach(id => newMovedIds.add(id));
    setMovedTaskIds(newMovedIds);
    setDragGhostMinutes(null);
    setDragStartTaskId(null);
  };
  const handleDragEnd = () => {
    setDragGhostMinutes(null);
    setDragStartTaskId(null);
  };

  // --- テンプレート機能のハンドラ ---
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName || selectedTaskIds.size === 0) return;
    const selectedTasks = tasks.filter(task => selectedTaskIds.has(task.id));
    setIsBatchLoading(true);
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          tasks: selectedTasks.map(t => ({ 
            title: t.title,
            timeInMinutes: t.timeInMinutes
          })),
        }),
      });
      if (response.ok) {
        closeSaveTemplateModal();
        handleClearSelection();
        await fetchTemplates(); 
      } else {
        console.error('テンプレートの保存に失敗しました', await response.json());
      }
    } catch (error) {
      console.error('テンプレートの保存中にエラー:', error);
    } finally {
      setIsBatchLoading(false);
    }
  };
  const handleDeleteTemplate = async (templateId: string) => {
    if (!window.confirm("このテンプレートを削除しますか？")) return;
    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await fetchTemplates(); 
      } else {
        console.error('テンプレートの削除に失敗しました', await response.json());
      }
    } catch (error) {
      console.error('テンプレートの削除中にエラー:', error);
    }
  };
  const handleApplyTemplate = async (templateId: string) => {
    const startTimeInMinutes = timeToMinutes(modalTime); 
    try {
      const response = await fetch('/api/tasks/batch-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: templateId,
          startTimeInMinutes: startTimeInMinutes
        }),
      });
      if (response.ok) {
        const newTasks: Task[] = await response.json();
        closeTemplateModal(); 
        await fetchTasks();
        const newSelectedIds = new Set(newTasks.map(task => task.id));
        setSelectedTaskIds(newSelectedIds);
        setIsEditMode(true); 
      } else {
        console.error('テンプレートの適用に失敗しました', await response.json());
      }
    } catch (error) {
      console.error('テンプレートの適用中にエラー:', error);
    }
  };

  // --- 長押しイベントハンドラ ---
  const handleZoomButtonPress = () => {
    isLongPressed.current = false; 
    longPressTimer.current = setTimeout(() => {
      isLongPressed.current = true; 
      scrollToCurrentTime(); 
    }, LONG_PRESS_DURATION);
  };
  const handleZoomButtonRelease = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current); 
      longPressTimer.current = null;
    }
    if (!isLongPressed.current) {
      zoomIn(); 
    }
    isLongPressed.current = false; 
  };


  // レンダリング (JSX)
  return (
    <>
      {/* --- 1. 固定ヘッダー (トグルスイッチ) --- */}
      <div className="flex fixed top-4 left-1/2 -translate-x-1/2 z-50 items-center gap-2 p-2 bg-background rounded-full shadow-lg">
        {/* PC用ズームボタン */}
        <div className="hidden md:flex items-center gap-2">
          <button onClick={zoomOut} className="w-8 h-8 rounded-full hover:bg-muted">-</button>
          <span className="text-xs text-muted-foreground w-10 text-center">
            {(pixelsPerMinute * 60).toFixed(0)}px/h
          </span>
          <button onClick={zoomIn} className="w-8 h-8 rounded-full hover:bg-muted">+</button>
          <div className="border-l h-6 mx-2 border-muted"></div>
        </div>
        
        {/* トグルスイッチ */}
        <span className={`text-sm ml-2 transition-colors ${!isEditMode ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>通常</span>
        <button
          onClick={() => handleToggleEditMode(!isEditMode)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEditMode ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEditMode ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        <span className={`text-sm mr-2 transition-colors ${isEditMode ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>編集</span>
      </div>

      {/* --- 2. タイムライン本体 --- */}
      <div className="absolute inset-0 flex flex-row" style={{ paddingTop: `${HEADER_PADDING_TOP_PX}px` }}>
        
        {/* 2a. 左サイドバー (物差し) */}
        <aside 
          ref={sidebarRef}
          className="flex-shrink-0 border-muted h-full border-r overflow-y-auto w-20 md:w-24" 
          onScroll={() => handleScroll('sidebar')}
        >
          <div className="relative" style={{ height: `${TIMELINE_HEIGHT_PX}px` }}>
            {Array.from({ length: TOTAL_HOURS * 2 }).map((_, index) => {
              const hour = Math.floor(index / 2);
              const isHalfHour = index % 2 !== 0;
              const currentMinutes = index * 30;
              return (
                <div
                  key={index}
                  className="absolute flex items-start w-full px-1 md:px-2" 
                  style={{ top: `${currentMinutes * pixelsPerMinute}px` }}
                >
                  <div className="flex items-center justify-start w-full">
                    <span className="text-sm text-muted-foreground text-left w-12 md:w-14 flex-shrink-0">
                      {!isHalfHour && ( 
                        hour >= 24 ? `(翌 ${(hour % 24).toString().padStart(2, "0")}:00)` : `${hour.toString().padStart(2, "0")}:00`
                      )}
                    </span>
                    <div className={`h-0.5 bg-muted-foreground ml-1 md:ml-2 ${isHalfHour ? 'w-2' : 'w-4'}`}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 2b. メインコンテンツ (タスク) */}
        <main
          ref={mainContentRef}
          className={`flex-1 overflow-y-auto relative transition-colors h-full pl-2 md:pl-4 ${isEditMode ? 'bg-muted/30' : ''}`} 
          onClick={handleBackgroundClick}
          onScroll={() => handleScroll('main')}
          style={{ cursor: isEditMode ? 'copy' : 'default' }}
          onDragOver={handleDragOverMain} 
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        >
          <div className="relative w-full" style={{ height: `${TIMELINE_HEIGHT_PX}px` }}>
            
            {/* 赤いバー */}
            {!isEditMode && currentTime && (
              <div 
                className="absolute left-0 right-0 h-0.5 bg-primary z-10 pointer-events-none"
                style={{ top: `${currentTimeTopPx}px` }}
              >
                <div className="absolute -left-1 -top-1 w-3 h-3 rounded-full bg-primary"></div>
              </div>
            )}

            {/* タスク一覧 */}
            {tasks.map((task) => {
              const isSelected = selectedTaskIds.has(task.id);
              return (
                <div
                  key={task.id}
                  className={`task-item absolute flex items-center p-2 rounded z-20
                             left-2 right-2 md:left-4 md:right-4 ${
                    isEditMode ? 'cursor-pointer hover:bg-muted' : ''
                  } ${
                    isEditMode && isSelected ? 'bg-primary/20' : ''
                  } ${
                    dragGhostMinutes !== null && isSelected ? 'opacity-0' : 'opacity-100'
                  } ${
                    isEditMode && selectionAnchor === task.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                  }`}
                  style={{ top: `${task.timeInMinutes * pixelsPerMinute}px` }}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('input[type="checkbox"]')) {
                      handleTaskClick(task);
                    }
                  }}
                  draggable={isEditMode}
                  onDragStart={(e) => handleDragStart(e, task)}
                >
                  {isEditMode && (
                    <input
                      type="checkbox"
                      className="block h-4 w-4 mr-1 md:mr-3 cursor-pointer" 
                      checked={isSelected}
                      onClick={(e) => handleCheckboxClick(e, task.id)}
                      readOnly 
                    />
                  )}
                  <span className="font-mono text-foreground md:text-muted-foreground mr-2 md:mr-4">
                    {formatTime(task.timeInMinutes)}
                  </span>
                  <span className="flex-1 text-lg">{task.title}</span>
                </div>
              );
            })}
            
            {/* ドラッグ中のゴースト表示 */}
            {dragGhostMinutes !== null && (
              <div 
                className="absolute left-0 right-0 z-30 pointer-events-none"
                style={{ top: `0px` }} 
              >
                {tasks
                  .filter(t => selectedTaskIds.has(t.id))
                  .map(task => {
                    const dragStartTask = tasks.find(t => t.id === dragStartTaskId);
                    const originalTimeOfDraggable = dragStartTask ? dragStartTask.timeInMinutes : dragStartMinutes;
                    const deltaMinutes = dragGhostMinutes - originalTimeOfDraggable;
                    const ghostTaskTime = Math.max(0, task.timeInMinutes + deltaMinutes);
                    const ghostTopPx = ghostTaskTime * pixelsPerMinute;

                    return (
                      <div
                        key={task.id}
                        className="task-item-ghost absolute flex items-center p-2 rounded z-20
                                   opacity-50 bg-primary/30 border border-primary
                                   left-2 right-2 md:left-4 md:right-4" 
                        style={{ top: `${ghostTopPx}px` }}
                      >
                        {isEditMode && (
                          <div className="h-4 w-4 mr-1 md:mr-3" /> 
                        )}
                        <span className="font-mono text-foreground md:text-muted-foreground mr-2 md:mr-4">
                          {formatTime(ghostTaskTime)}
                        </span>
                        <span className="flex-1 text-lg">{task.title}</span>
                      </div>
                    );
                  })
                }
              </div>
            )}
            
          </div>
        </main>
      </div> {/* --- 2. タイムライン本体 終了 --- */}


      {/* --- 3. スマホ用ズームボタン --- */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-3 md:hidden">
        <button 
          onMouseDown={handleZoomButtonPress}
          onMouseUp={handleZoomButtonRelease}
          onTouchStart={handleZoomButtonPress}
          onTouchEnd={handleZoomButtonRelease}
          className="w-14 h-14 rounded-full bg-background shadow-lg text-2xl hover:bg-muted active:bg-muted/80"
          disabled={isBatchLoading}
          title="タップでズームイン、長押しで現在時刻へジャンプ"
        >
          +
        </button>
        <button 
          onClick={zoomOut}
          className="w-14 h-14 rounded-full bg-background shadow-lg text-2xl hover:bg-muted active:bg-muted/80"
          disabled={isBatchLoading}
          title="ズームアウト"
        >
          -
        </button>
      </div>

      
      {/* --- 4. PWAインストールボタン --- */}
      {deferredPrompt && pixelsPerMinute <= MIN_ZOOM_THRESHOLD && (
        <button
          onClick={handleInstallClick}
          className="fixed bottom-40 right-6 z-30 
                     md:hidden 
                     w-14 h-14 rounded-full 
                     bg-primary text-primary-foreground 
                     shadow-lg text-2xl hover:bg-primary/80
                     flex items-center justify-center"
          title="アプリをインストール"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
      )}


      {/* --- 5. 一括操作パネル --- */}
      {isEditMode && selectedTaskIds.size > 0 && (
        <div 
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 
                     flex items-center gap-2 p-3 bg-background rounded-full shadow-lg"
        >
          <button
            onClick={handleClearSelection}
            className="text-sm text-primary font-semibold ml-2 px-3 py-1 rounded-full hover:bg-muted transition-colors"
            title="クリックして選択を解除"
          >
            {selectedTaskIds.size}件 選択中
          </button>
          <div className="border-l h-6 mx-2 border-muted"></div>
          <button
            onClick={() => handleBatchOperation('move-down')} 
            className="w-12 h-10 rounded-full hover:bg-muted disabled:opacity-50"
            disabled={isBatchLoading}
          >
            +1m
          </button>
          <button
            onClick={() => handleBatchOperation('move-up')} 
            className="w-12 h-10 rounded-full hover:bg-muted disabled:opacity-50"
            disabled={isBatchLoading}
          >
            -1m
          </button>
          <div className="border-l h-6 mx-2 border-muted"></div>
          <button
            onClick={handleBatchDelete} 
            className="w-16 h-10 rounded-full text-primary hover:bg-primary/20 disabled:opacity-50"
            disabled={isBatchLoading}
          >
            削除
          </button>
          <div className="border-l h-6 mx-2 border-muted"></div>
          <button
            onClick={openSaveTemplateModal}
            className="w-16 h-10 rounded-full text-primary hover:bg-primary/20 disabled:opacity-50"
            disabled={isBatchLoading}
            title="選択中のタスクをテンプレートとして保存"
          >
            保存
          </button>
        </div>
      )}


      {/* --- 6. タスク追加/編集モーダル --- */}
      <div
        className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-300 ${
          isModalOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
        <form
          onSubmit={handleSubmit}
          className={`bg-background w-full max-w-sm rounded-lg shadow-lg p-6 z-50 transition-all duration-300 ${
            isModalOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
          }`}
          onClick={(e) => e.stopPropagation()} 
        >
          <h2 className="text-xl font-semibold mb-4 text-center">
            {selectedTask ? "タスクの編集" : "新規タスクの追加"}
          </h2>
          
          {/* 休憩・テンプレートボタン */}
          {!selectedTask && ( 
            <div className="mb-4 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setModalTitle("休憩")}
                className="py-2 px-4 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors text-sm"
              >
                ☕ 休憩
              </button>
              <button
                type="button"
                onClick={openTemplateModal}
                className="py-2 px-4 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors text-sm"
              >
                📂 テンプレート...
              </button>
            </div>
          )}

          {/* マージンを mb-6 から mb-4 に詰めて領域節約 */}
          <div className="mb-4 time-select-wrapper">
            {/* 中央のハイライト */}
            <div className="time-wheel-center-highlight" />

            {/* 時 (Hour) のピッカー */}
            <TimePickerWheel
              items={hourPickerItems} 
              value={modalTime.hour}
              onChange={(newHour) => setModalTime({ ...modalTime, hour: newHour })}
              unit="h"
              formatLabel={(h) => 
                h >= 24 
                  ? `(翌 ${(h % 24).toString().padStart(2, "0")})` 
                  : h.toString().padStart(2, "0")
              }
            />
            
            {/* 分 (Minute) のピッカー */}
            <TimePickerWheel
              items={minutePickerItems} 
              value={modalTime.minute}
              onChange={(newMinute) => setModalTime({ ...modalTime, minute: newMinute })}
              unit="m"
              formatLabel={(m) => m.toString().padStart(2, "0")}
            />
          </div>
          
          {/* タスク名入力 */}
          <div className="mb-8">
            <input
              type="text"
              placeholder="タスク名を入力"
              value={modalTitle}
              onChange={(e) => setModalTitle(e.target.value)}
              className="w-full p-3 rounded bg-muted text-foreground text-lg text-center"
              required
            />
          </div>
          
          {/* ボタン */}
          <div className="flex justify-between">
            {selectedTask ? (
              <button
                type="button"
                onClick={handleDelete}
                className="py-2 px-5 rounded bg-red-800/50 text-red-300 hover:bg-red-800/80 transition-colors"
              >
                削除
              </button>
            ) : ( <div /> )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="py-2 px-5 rounded bg-muted text-foreground"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="py-2 px-5 rounded bg-primary text-primary-foreground"
              >
                完了
              </button>
            </div>
          </div>
        </form>
      </div>
      
      {/* --- 7. テンプレート管理モーダル --- */}
      <div
        className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-300 ${
          isTemplateModalOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="absolute inset-0 bg-black/60" onClick={closeTemplateModal} />
        <div
          className={`bg-background w-full max-w-md rounded-lg shadow-lg p-6 z-50 transition-all duration-300 ${
            isTemplateModalOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
          }`}
        >
          <h2 className="text-xl font-semibold mb-6 text-center">
            テンプレートからタスクを追加
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6 -mt-4">
            （{formatTime(timeToMinutes(modalTime))} から開始）
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-64 overflow-y-auto pr-2">
            {templates.length === 0 && (
              <p className="text-muted-foreground col-span-full text-center">保存されたテンプレートがありません。</p>
            )}
            
            {templates.map(template => (
              <div key={template.id} className="relative group">
                <button
                  type="button"
                  onClick={() => handleApplyTemplate(template.id)}
                  className="w-full h-24 p-2 bg-muted rounded-lg text-foreground hover:bg-muted/80 transition-colors
                             flex flex-col items-center justify-center text-center overflow-hidden"
                  title={`"${template.name}" を ${formatTime(timeToMinutes(modalTime))} から挿入します`}
                >
                  <span className="text-lg font-semibold">{template.name}</span>
                  <span className="text-xs text-muted-foreground">{template.tasks.length}件のタスク</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(template.id)}
                  className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-background border border-muted-foreground/50 text-muted-foreground
                             hover:bg-primary hover:text-primary-foreground opacity-50 group-hover:opacity-100 transition-opacity"
                  title="このテンプレートを削除"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={closeTemplateModal}
              className="py-2 px-5 rounded bg-muted text-foreground"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
      
      {/* --- 8. テンプレート保存モーダル --- */}
      <div
        className={`fixed inset-0 flex items-center justify-center z-50 transition-opacity duration-300 ${
          isSaveTemplateModalOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="absolute inset-0 bg-black/60" onClick={closeSaveTemplateModal} />
        <form
          onSubmit={handleSaveTemplate}
          className={`bg-background w-full max-w-sm rounded-lg shadow-lg p-6 z-50 transition-all duration-300 ${
            isSaveTemplateModalOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
          }`}
          onClick={(e) => e.stopPropagation()} 
        >
          <h2 className="text-xl font-semibold mb-6 text-center">
            テンプレートとして保存
          </h2>
          <p className="text-sm text-muted-foreground text-center mb-6 -mt-4">
            （{selectedTaskIds.size}件のタスク）
          </p>
          
          <div className="mb-6">
            <input
              type="text"
              placeholder="テンプレート名を入力 (例: 朝のルーティン)"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              className="w-full p-3 rounded bg-muted text-foreground text-lg text-center"
              required
            />
          </div>
          
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={closeSaveTemplateModal}
              className="py-2 px-5 rounded bg-muted text-foreground"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="py-2 px-5 rounded bg-primary text-primary-foreground"
              disabled={isBatchLoading}
            >
              {isBatchLoading ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}