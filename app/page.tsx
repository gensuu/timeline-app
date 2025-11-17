"use client";

// useState, useEffect, useRef, useMemo, ChangeEvent, useCallback, DragEvent をインポート
import { 
  useState, 
  useEffect, 
  useRef, 
  useMemo, 
  ChangeEvent, 
  useCallback, 
  DragEvent 
} from "react";

// --- 型定義 (変更なし) ---
interface Task {
  id: string;
  title: string;
  timeInMinutes: number;
}
type ModalTime = { hour: number; minute: number };

// --- 定数 (変更なし) ---
const TOTAL_HOURS = 31; // 翌朝7時までの31時間
const MINUTES_PER_HOUR = 60;
const TOTAL_MINUTES = TOTAL_HOURS * MINUTES_PER_HOUR;
const MIN_ZOOM_THRESHOLD = 0.3; // PWAプロンプトを表示するズームのしきい値

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
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pixelsPerMinute, setPixelsPerMinute] = useState(2); 

  // --- 範囲選択 (既存) ---
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set<string>());
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  
  // 2点クリック範囲選択 (既存)
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  
  // --- 遅延ゼロ（自動保存） (既存) ---
  const [originalTasks, setOriginalTasks] = useState<Task[]>([]);
  const [movedTaskIds, setMovedTaskIds] = useState(new Set<string>());

  // ドラッグ＆ドロップ (既存)
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartMinutes, setDragStartMinutes] = useState(0);
  const [dragGhostMinutes, setDragGhostMinutes] = useState<number | null>(null);
  const [dragStartTaskId, setDragStartTaskId] = useState<string | null>(null);
  
  // ★ PWA関連 (変更なし) ★
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  // ★★★ 変更点 ★★★
  // toggleCount と lastToggleTime の useState を削除

  // --- Ref (変更なし) ---
  const mainContentRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null); 
  const isSyncingScroll = useRef(false); 

  // --- 動的な高さ計算 (変更なし) ---
  const { TIMELINE_HEIGHT_PX, HOUR_HEIGHT_PX } = useMemo(() => {
    const HOUR_HEIGHT_PX = MINUTES_PER_HOUR * pixelsPerMinute;
    const TIMELINE_HEIGHT_PX = TOTAL_HOURS * HOUR_HEIGHT_PX;
    return { TIMELINE_HEIGHT_PX, HOUR_HEIGHT_PX };
  }, [pixelsPerMinute]);

  // --- データ取得 (変更なし) ---
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

  // --- useEffect (マウント時) (PWA関連の追加) ---
  useEffect(() => {
    fetchTasks();
    const now = new Date();
    const currentMinute = now.getHours() * 60 + now.getMinutes();
    
    const scrollPosition = currentMinute * pixelsPerMinute;
    const centerOffset = (window.innerHeight / 2);

    if (mainContentRef.current) mainContentRef.current.scrollTop = scrollPosition - centerOffset;
    if (sidebarRef.current) sidebarRef.current.scrollTop = scrollPosition - centerOffset;
    
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);

    // ★ PWAインストールプロンプトのイベントリスナー (変更なし) ★
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
  }, [fetchTasks]); 

  // --- 時間変換ユーティリティ (変更なし) ---
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

  // --- イベントハンドラ (時間ズレ修正版) (変更なし) ---
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditMode || isModalOpen) return;
    if ((e.target as HTMLElement).closest('.task-item')) return;
    if (!mainContentRef.current) return;

    // pt-20 (80px) を考慮したロジック
    const scrollTop = mainContentRef.current.scrollTop;
    const mainRect = mainContentRef.current.getBoundingClientRect(); // pt-20 を含む main 要素
    const mainRectTop = mainRect.top; 
    const clickY_viewport = e.clientY; 
    const clickY_relativeToMain = clickY_viewport - mainRectTop;
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
    if ((event as any).target.type === 'checkbox') return; // チェックボックスクリック時はモーダルを開かない
    if (dragGhostMinutes !== null) return; // ドラッグ中はモーダルを開かない

    setSelectedTask(task);
    setModalTitle(task.title);
    setModalTime(minutesToTime(task.timeInMinutes));
    setIsModalOpen(true);
  };

  // --- API連携 (削除ボタン修正版) (変更なし) ---
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

  const closeModal = () => setIsModalOpen(false);
  
  // --- JSスクロール同期 (変更なし) ---
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

  // ★★★ 変更点 ★★★
  // --- ズーム機能 (PWAインストールトリガーを統合) ---
  const handleZoom = (newPixelsPerMinute: number) => {
    if (!mainContentRef.current) return;

    // ★ PWAトリガー ★
    // もし、ズームアウトしようとして（new < old）、
    // 新しいズームレベルが最小値（MIN_ZOOM_THRESHOLD）以下に達し、
    // かつ、インストールプロンプト（deferredPrompt）が存在する場合
    if (newPixelsPerMinute < pixelsPerMinute && newPixelsPerMinute <= MIN_ZOOM_THRESHOLD && deferredPrompt) {
      console.log('Attempting to show PWA install prompt via zoom out');
      (deferredPrompt as any).prompt(); // プロンプト表示
      (deferredPrompt as any).userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the PWA install prompt');
        } else {
          console.log('User dismissed the PWA install prompt');
        }
        setDeferredPrompt(null); // プロンプトは一度しか使えないのでクリア
      });
      // プロンプトを表示した場合、ズームアウトは実行しない（誤操作防止）
      return; 
    }
    
    // --- 通常のズームロジック（変更なし） ---
    const mainRect = mainContentRef.current.getBoundingClientRect();
    const centerViewportY = mainRect.top + mainRect.height / 2;
    const centerAbsoluteY = mainContentRef.current.scrollTop + (centerViewportY - mainRect.top);
    const centerMinute = centerAbsoluteY / pixelsPerMinute;
    
    setPixelsPerMinute(newPixelsPerMinute); // Stateを更新
    
    const newScrollTop = (centerMinute * newPixelsPerMinute) - (mainRect.height / 2);
    requestAnimationFrame(() => {
      if (mainContentRef.current) mainContentRef.current.scrollTop = newScrollTop;
      if (sidebarRef.current) sidebarRef.current.scrollTop = newScrollTop;
    });
  };

  // zoomIn / zoomOut は handleZoom を呼ぶだけ (変更なし)
  const zoomIn = () => handleZoom(Math.min(pixelsPerMinute * 1.5, 20));
  const zoomOut = () => handleZoom(Math.max(pixelsPerMinute / 1.5, 0.2));

  // --- 赤いバー用の計算 (変更なし) ---
  const currentMinute = currentTime.getHours() * 60 + currentTime.getMinutes();
  const currentTimeTopPx = currentMinute * pixelsPerMinute;

  // 2点クリック範囲選択 (既存)
  const handleCheckboxClick = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation(); 
    
    const newSelectedIds = new Set(selectedTaskIds);
    const isAlreadySelected = newSelectedIds.has(taskId);

    if (isAlreadySelected) {
      // 個別に選択解除
      newSelectedIds.delete(taskId);
      // もし解除したのがアンカーなら、アンカーも解除
      if (selectionAnchor === taskId) {
        setSelectionAnchor(null);
      }
    } else if (selectionAnchor === null) {
      // 1点目（アンカー）を選択
      newSelectedIds.add(taskId);
      setSelectionAnchor(taskId);
    } else {
      // 2点目を選択（間を埋める）
      const startIndex = tasks.findIndex(t => t.id === selectionAnchor);
      const endIndex = tasks.findIndex(t => t.id === taskId);
      
      if (startIndex !== -1 && endIndex !== -1) {
        const min = Math.min(startIndex, endIndex);
        const max = Math.max(startIndex, endIndex);
        for (let i = min; i <= max; i++) {
          newSelectedIds.add(tasks[i].id);
        }
      }
      // アンカーをリセット
      setSelectionAnchor(null);
    }
    
    setSelectedTaskIds(newSelectedIds);
  };

  // 一斉解除 (既存)
  const handleClearSelection = () => {
    setSelectedTaskIds(new Set());
    setSelectionAnchor(null);
  };
  
  // --- 遅延ゼロ（自動保存） (変更なし) ---
  const saveMovedTasks = async () => {
    setIsBatchLoading(true);
    try {
      const changedTasks = tasks.filter(task => {
        const original = originalTasks.find(ot => ot.id === task.id);
        return original && original.timeInMinutes !== task.timeInMinutes;
      });

      if (changedTasks.length > 0) {
        // API (PUT) を使って1件ずつ保存
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

  // ★★★ 変更点 ★★★
  // PWA関連 (トグル10回ロジックを削除)
  const handleToggleEditMode = (newEditMode: boolean) => {
    // 自動保存ロジック（変更なし）
    if (isEditMode && !newEditMode) {
      if (movedTaskIds.size > 0) {
        saveMovedTasks();
      }
      setSelectedTaskIds(new Set());
      setSelectionAnchor(null);
    }
    setIsEditMode(newEditMode);
    
    // ★ PWA関連のトグルカウントロジックを「全て削除」 ★
  };

  // --- 一括削除 (API呼び出し) (変更なし) ---
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
      } else {
        console.error('一括削除に失敗しました', await response.json());
      }
    } catch (error) {
      console.error('一括削除中にエラー:', error);
    } finally {
      setIsBatchLoading(false);
    }
  };

  // +1m / -1m ボタンの遅延ゼロロジック (既存)
  const handleBatchOperation = (operation: 'move-up' | 'move-down') => {
    const deltaMinutes = operation === 'move-up' ? -1 : 1;

    setTasks(currentTasks => 
      currentTasks.map(task => {
        if (selectedTaskIds.has(task.id)) {
          return { 
            ...task, 
            timeInMinutes: Math.max(0, task.timeInMinutes + deltaMinutes) 
          };
        }
        return task;
      })
    );
    
    const newMovedIds = new Set(movedTaskIds);
    selectedTaskIds.forEach(id => newMovedIds.add(id));
    setMovedTaskIds(newMovedIds);
  };
  
  // ドラッグ＆ドロップ (既存)
  const handleDragStart = (e: DragEvent<HTMLDivElement>, task: Task) => {
    if (!selectedTaskIds.has(task.id)) {
      setSelectedTaskIds(new Set([task.id]));
      setSelectionAnchor(null);
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setDragImage(new Image(), 0, 0); 
    setDragStartY(e.clientY);
    setDragStartMinutes(task.timeInMinutes);
    setDragStartTaskId(task.id);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); 
    const deltaY = e.clientY - dragStartY;
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
          return { 
            ...task, 
            timeInMinutes: Math.max(0, task.timeInMinutes + deltaMinutes) 
          };
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
  

  // レンダリング (JSX) (変更なし)
  return (
    <>
      {/* --- 1. 固定ヘッダー (トグルスイッチ) --- */}
      <div className="flex fixed top-4 left-1/2 -translate-x-1/2 z-50 items-center gap-2 p-2 bg-background rounded-full shadow-lg">
        {/* PC用ズームボタン (変更なし) */}
        <div className="hidden md:flex items-center gap-2">
          <button onClick={zoomOut} className="w-8 h-8 rounded-full hover:bg-muted">-</button>
          <span className="text-xs text-muted-foreground w-10 text-center">
            {(pixelsPerMinute * 60).toFixed(0)}px/h
          </span>
          <button onClick={zoomIn} className="w-8 h-8 rounded-full hover:bg-muted">+</button>
          <div className="border-l h-6 mx-2 border-muted"></div>
        </div>
        
        {/* トグルスイッチ (PWAインストールトリガー) */}
        <span className={`text-sm ml-2 transition-colors ${!isEditMode ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>通常</span>
        <button
          onClick={() => handleToggleEditMode(!isEditMode)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEditMode ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEditMode ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        <span className={`text-sm mr-2 transition-colors ${isEditMode ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>編集</span>
      </div>

      {/* --- 2. タイムライン本体 (JS同期スクロールコンテナ) (変更なし) --- */}
      <div className="absolute inset-0 flex flex-row pt-20">
        
        {/* 2a. 左サイドバー (物差し) (変更なし) */}
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
                  className="absolute flex items-start w-full px-1 md:px-2 pt-1"
                  style={{ top: `${currentMinutes * pixelsPerMinute}px` }}
                >
                  <div className={`flex items-center justify-start w-full ${isHalfHour ? '' : ''}`}>
                    <span className="text-sm text-muted-foreground text-left w-12 md:w-14">
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

        {/* 2b. メインコンテンツ (タスク) (変更なし) */}
        <main
          ref={mainContentRef}
          className={`flex-1 overflow-y-auto relative transition-colors h-full pl-2 md:pl-4 ${isEditMode ? 'bg-muted/30' : ''}`}
          onClick={handleBackgroundClick}
          onScroll={() => handleScroll('main')}
          style={{ cursor: isEditMode ? 'copy' : 'default' }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        >
          <div className="relative w-full" style={{ height: `${TIMELINE_HEIGHT_PX}px` }}>
            {/* 赤いバー (変更なし) */}
            {!isEditMode && (
              <div 
                className="absolute left-0 right-0 h-0.5 bg-primary z-10 pointer-events-none"
                style={{ top: `${currentTimeTopPx}px` }}
              >
                <div className="absolute -left-1 -top-1 w-3 h-3 rounded-full bg-primary"></div>
              </div>
            )}

            {/* タスク一覧 (変更なし) */}
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
            
            {/* ドラッグ中のゴースト表示 (変更なし) */}
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


      {/* --- 3. スマホ用ズームボタン (浮遊ボタン) (変更なし) --- */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-3 md:hidden">
        <button 
          onClick={zoomIn} 
          className="w-14 h-14 rounded-full bg-background shadow-lg text-2xl hover:bg-muted"
          disabled={isBatchLoading}
        >
          +
        </button>
        <button 
          onClick={zoomOut}
          className="w-14 h-14 rounded-full bg-background shadow-lg text-2xl hover:bg-muted"
          disabled={isBatchLoading}
        >
          -
        </button>
      </div>

      
      {/* --- 4. 一括操作パネル (一斉解除) --- */}
      {isEditMode && selectedTaskIds.size > 0 && (
        <div 
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 
                     flex items-center gap-2 p-3 bg-background rounded-full shadow-lg"
        >
          {/* 一斉解除ボタン */}
          <button
            onClick={handleClearSelection}
            className="text-sm text-primary font-semibold ml-2 px-3 py-1 rounded-full hover:bg-muted transition-colors"
            title="クリックして選択を解除"
          >
            {selectedTaskIds.size}件 選択中
          </button>
          
          <div className="border-l h-6 mx-2 border-muted"></div>
          
          {/* +1m / -1m ボタン */}
          <button
            onClick={() => handleBatchOperation('move-down')} // 遅延ゼロ
            className="w-12 h-10 rounded-full hover:bg-muted disabled:opacity-50"
            disabled={isBatchLoading}
          >
            +1m
          </button>
          <button
            onClick={() => handleBatchOperation('move-up')} // 遅延ゼロ
            className="w-12 h-10 rounded-full hover:bg-muted disabled:opacity-50"
            disabled={isBatchLoading}
          >
            -1m
          </button>

          <div className="border-l h-6 mx-2 border-muted"></div>
          
          {/* 一括削除ボタン (変更なし) */}
          <button
            onClick={handleBatchDelete} // API呼び出し
            className="w-16 h-10 rounded-full text-primary hover:bg-primary/20 disabled:opacity-50"
            disabled={isBatchLoading}
          >
            削除
          </button>
        </div>
      )}


      {/* --- 5. モーダル (固定) (変更なし) --- */}
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
          <h2 className="text-xl font-semibold mb-6 text-center">
            {selectedTask ? "タスクの編集" : "新規タスクの追加"}
          </h2>
          {/* 時間入力 (変更なし) */}
          <div className="mb-6 time-select-wrapper">
            <select
              value={modalTime.hour}
              onChange={(e) => setModalTime({ ...modalTime, hour: Number(e.target.value) })}
              className="time-select"
            >
              {Array.from({ length: TOTAL_HOURS }).map((_, h) => (
                <option key={h} value={h} className="bg-muted text-foreground">
                  {h >= 24 ? `(翌 ${ (h % 24).toString().padStart(2, "0")})` : h.toString().padStart(2, "0")}
                </option>
              ))}
            </select>
            <span className="time-separator">h</span>
            <select
              value={modalTime.minute}
              onChange={(e) => setModalTime({ ...modalTime, minute: Number(e.target.value) })}
              className="time-select"
            >
              {Array.from({ length: 60 }).map((_, m) => (
                <option key={m} value={m} className="bg-muted text-foreground">
                  {m.toString().padStart(2, "0")}
                </option>
              ))}
            </select>
            <span className="time-separator">m</span>
          </div>
          {/* タスク名入力 (変更なし) */}
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
          {/* ボタン (変更なし) */}
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
    </>
  );
}