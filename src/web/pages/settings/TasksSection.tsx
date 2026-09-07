import React, { useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.js';
import { useIsMobile } from '../../components/useIsMobile.js';
import ModernSelect from '../../components/ModernSelect.js';
import type { SettingsData } from './settingsData.js';
import { getSettingsStyles } from './settingsStyles.js';

const CHECKIN_SCHEDULE_MODE_OPTIONS = [
  { value: 'cron', label: 'Cron' },
  { value: 'interval', label: '间隔签到' },
] as const;

const CHECKIN_INTERVAL_OPTIONS = Array.from({ length: 24 }, (_, index) => {
  const hour = index + 1;
  return {
    value: String(hour),
    label: `${hour} 小时`,
  };
});

export default function TasksSection({ data }: { data: SettingsData }) {
  const isMobile = useIsMobile();
  const styles = getSettingsStyles(isMobile);
  const { runtime, setRuntime } = data;
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [testingCheckin, setTestingCheckin] = useState(false);
  const toast = useToast();

  const { inputStyle } = styles;

  const triggerScheduleCheckin = async () => {
    setTestingCheckin(true);
    try {
      await api.triggerCheckinAll();
      toast.success('已开始全部签到，请稍后查看签到日志');
    } catch (err: any) {
      toast.error(err?.message || '触发签到失败');
    } finally {
      setTestingCheckin(false);
    }
  };

  const saveSchedule = async () => {
    setSavingSchedule(true);
    try {
      await api.updateRuntimeSettings({
        checkinEnabled: runtime.checkinEnabled,
        checkinCron: runtime.checkinCron,
        checkinScheduleMode: runtime.checkinScheduleMode,
        checkinIntervalHours: runtime.checkinIntervalHours,
        balanceRefreshEnabled: runtime.balanceRefreshEnabled,
        balanceRefreshModelsEnabled: runtime.balanceRefreshModelsEnabled,
        balanceRefreshCron: runtime.balanceRefreshCron,
        dailySummaryEnabled: runtime.dailySummaryEnabled,
        logCleanupEnabled: runtime.logCleanupEnabled,
        logCleanupCron: runtime.logCleanupCron,
        logCleanupUsageLogsEnabled: runtime.logCleanupUsageLogsEnabled,
        logCleanupProgramLogsEnabled: runtime.logCleanupProgramLogsEnabled,
        logCleanupRetentionDays: runtime.logCleanupRetentionDays,
      });
      toast.success('定时任务设置已保存');
    } catch (err: any) {
      toast.error(err?.message || '保存失败');
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card animate-slide-up stagger-1" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>定时任务</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 180px auto', gap: 12, alignItems: 'end', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>签到方式</div>
              <ModernSelect
                value={runtime.checkinScheduleMode}
                onChange={(value) => setRuntime((prev) => ({
                  ...prev,
                  checkinScheduleMode: value === 'interval' ? 'interval' : 'cron',
                }))}
                options={CHECKIN_SCHEDULE_MODE_OPTIONS.map((item) => ({ ...item }))}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>签到间隔</div>
              <ModernSelect
                value={String(runtime.checkinIntervalHours)}
                onChange={(value) => setRuntime((prev) => ({
                  ...prev,
                  checkinIntervalHours: Math.min(24, Math.max(1, Math.trunc(Number(value) || 1))),
                }))}
                disabled={runtime.checkinScheduleMode !== 'interval'}
                options={CHECKIN_INTERVAL_OPTIONS}
              />
            </div>
            <button
              onClick={triggerScheduleCheckin}
              disabled={testingCheckin}
              className="btn btn-ghost"
              style={{ border: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}
            >
              {testingCheckin ? '触发中...' : '测试一次签到'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>签到 Cron</div>
              <input
                value={runtime.checkinCron}
                onChange={(e) => setRuntime((prev) => ({ ...prev, checkinCron: e.target.value }))}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                disabled={runtime.checkinScheduleMode !== 'cron'}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>余额刷新 Cron</div>
              <input
                value={runtime.balanceRefreshCron}
                onChange={(e) => setRuntime((prev) => ({ ...prev, balanceRefreshCron: e.target.value }))}
                style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, width: '100%' }}>任务开关</div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={runtime.checkinEnabled}
                onChange={(e) => setRuntime((prev) => ({ ...prev, checkinEnabled: e.target.checked }))}
              />
              签到任务
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={runtime.balanceRefreshEnabled}
                onChange={(e) => setRuntime((prev) => ({ ...prev, balanceRefreshEnabled: e.target.checked }))}
              />
              余额刷新
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={runtime.balanceRefreshModelsEnabled}
                onChange={(e) => setRuntime((prev) => ({ ...prev, balanceRefreshModelsEnabled: e.target.checked }))}
                disabled={!runtime.balanceRefreshEnabled}
              />
              余额刷新时同步模型
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={runtime.dailySummaryEnabled}
                onChange={(e) => setRuntime((prev) => ({ ...prev, dailySummaryEnabled: e.target.checked }))}
              />
              每日使用汇总
            </label>
          </div>
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid var(--color-border-light)',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13 }}>自动清理日志</div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={runtime.logCleanupEnabled}
                onChange={(e) => setRuntime((prev) => ({ ...prev, logCleanupEnabled: e.target.checked }))}
              />
              启用日志清理任务（关闭后清理计划不会执行）
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 160px', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>清理 Cron</div>
                <input
                  value={runtime.logCleanupCron}
                  onChange={(e) => setRuntime((prev) => ({ ...prev, logCleanupCron: e.target.value }))}
                  style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>保留天数</div>
                <input
                  type="number"
                  min={1}
                  value={runtime.logCleanupRetentionDays}
                  onChange={(e) => setRuntime((prev) => {
                    const nextValue = Number(e.target.value);
                    return {
                      ...prev,
                      logCleanupRetentionDays: Number.isFinite(nextValue) && nextValue >= 1
                        ? Math.trunc(nextValue)
                        : prev.logCleanupRetentionDays,
                    };
                  })}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={runtime.logCleanupUsageLogsEnabled}
                  onChange={(e) => setRuntime((prev) => ({ ...prev, logCleanupUsageLogsEnabled: e.target.checked }))}
                />
                清理使用日志
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={runtime.logCleanupProgramLogsEnabled}
                  onChange={(e) => setRuntime((prev) => ({ ...prev, logCleanupProgramLogsEnabled: e.target.checked }))}
                />
                清理程序日志
              </label>
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
              默认每天早上 6 点执行。按每次定时任务执行时间，清理早于“保留天数”的日志；两个选项都不勾选时不会实际删除日志。
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={saveSchedule} disabled={savingSchedule} className="btn btn-primary">
              {savingSchedule ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : '保存定时任务'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
