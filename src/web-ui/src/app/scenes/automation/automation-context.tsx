import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import type {
  Agent,
  AutomationTask,
  Priority,
  TaskStatus,
} from './automation-types';

export type CalendarView = 'week' | 'month' | 'day' | 'list';

export interface AutomationContextValue {
  tasks: AutomationTask[];
  agents: Agent[];
  view: CalendarView;
  setView: (v: CalendarView) => void;
  currentDate: Date;
  setCurrentDate: (d: Date) => void;
  goToday: () => void;
  goPrev: () => void;
  goNext: () => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  selectedTask: AutomationTask | null;
  createDialogOpen: boolean;
  setCreateDialogOpen: (open: boolean) => void;
  filterPriority: Priority | 'all';
  setFilterPriority: (p: Priority | 'all') => void;
  filterStatus: TaskStatus | 'all';
  setFilterStatus: (s: TaskStatus | 'all') => void;
  filterAgentId: string | 'all';
  setFilterAgentId: (a: string | 'all') => void;
  filteredTasks: AutomationTask[];
  addTask: (task: AutomationTask) => void;
  deleteTask: (task: AutomationTask) => void;
  toggleTaskEnabled: (task: AutomationTask, enabled: boolean) => void;
  runTaskNow: (task: AutomationTask) => void;
  getAgent: (id: string) => Agent | undefined;
}

const AutomationContext = createContext<AutomationContextValue | null>(null);

export interface AutomationProviderProps {
  children: ReactNode;
  /** Tasks come from the project layer. Defaults to empty. */
  tasks: AutomationTask[];
  agents: Agent[];
  /** Optional initial values. */
  initialView?: CalendarView;
  initialDate?: Date;
  /** Forwarded callbacks; the host owns persistence. */
  onCreateTask?: (task: AutomationTask) => void;
  onDeleteTask?: (task: AutomationTask) => void;
  onToggleTaskEnabled?: (task: AutomationTask, enabled: boolean) => void;
  onRunTaskNow?: (task: AutomationTask) => void;
}

export function AutomationProvider(props: AutomationProviderProps) {
  const {
    children,
    tasks: tasksProp,
    agents,
    initialView = 'week',
    initialDate,
    onCreateTask,
    onDeleteTask,
    onToggleTaskEnabled,
    onRunTaskNow,
  } = props;

  const [localTasks, setLocalTasks] = useState<AutomationTask[]>(tasksProp);

  // Keep local tasks in sync with props when they change.
  React.useEffect(() => {
    setLocalTasks(tasksProp);
  }, [tasksProp]);

  const [view, setView] = useState<CalendarView>(initialView);
  const [currentDate, setCurrentDate] = useState<Date>(initialDate ?? new Date());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all');
  const [filterAgentId, setFilterAgentId] = useState<string | 'all'>('all');

  const filteredTasks = useMemo(() => {
    return localTasks.filter((t) => {
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterAgentId !== 'all' && t.agentId !== filterAgentId) return false;
      return true;
    });
  }, [localTasks, filterPriority, filterStatus, filterAgentId]);

  const selectedTask = useMemo(
    () => localTasks.find((t) => t.id === selectedTaskId) ?? null,
    [localTasks, selectedTaskId],
  );

  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  const goPrev = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() - 1);
      else if (view === 'week') d.setDate(d.getDate() - 7);
      else if (view === 'day') d.setDate(d.getDate() - 1);
      else d.setDate(d.getDate() - 7);
      return d;
    });
  }, [view]);

  const goNext = useCallback(() => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() + 1);
      else if (view === 'week') d.setDate(d.getDate() + 7);
      else if (view === 'day') d.setDate(d.getDate() + 1);
      else d.setDate(d.getDate() + 7);
      return d;
    });
  }, [view]);

  const addTask = useCallback(
    (task: AutomationTask) => {
      setLocalTasks((prev) => [...prev, task]);
      onCreateTask?.(task);
    },
    [onCreateTask],
  );

  const deleteTask = useCallback(
    (task: AutomationTask) => {
      setLocalTasks((prev) => prev.filter((item) => item.id !== task.id));
      setSelectedTaskId(null);
      onDeleteTask?.(task);
    },
    [onDeleteTask],
  );

  const toggleTaskEnabled = useCallback(
    (task: AutomationTask, enabled: boolean) => {
      setLocalTasks((prev) => prev.map((item) => item.id === task.id ? { ...item, enabled } : item));
      onToggleTaskEnabled?.(task, enabled);
    },
    [onToggleTaskEnabled],
  );

  const runTaskNow = useCallback(
    (task: AutomationTask) => {
      onRunTaskNow?.(task);
    },
    [onRunTaskNow],
  );

  const getAgent = useCallback(
    (id: string) => agents.find((a) => a.id === id),
    [agents],
  );

  const value: AutomationContextValue = {
    tasks: localTasks,
    agents,
    view,
    setView,
    currentDate,
    setCurrentDate,
    goToday,
    goPrev,
    goNext,
    selectedTaskId,
    setSelectedTaskId,
    selectedTask,
    createDialogOpen,
    setCreateDialogOpen,
    filterPriority,
    setFilterPriority,
    filterStatus,
    setFilterStatus,
    filterAgentId,
    setFilterAgentId,
    filteredTasks,
    addTask,
    deleteTask,
    toggleTaskEnabled,
    runTaskNow,
    getAgent,
  };

  return (
    <AutomationContext.Provider value={value}>
      {children}
    </AutomationContext.Provider>
  );
}

export function useAutomation(): AutomationContextValue {
  const ctx = useContext(AutomationContext);
  if (!ctx) {
    throw new Error('useAutomation must be used within AutomationProvider');
  }
  return ctx;
}
