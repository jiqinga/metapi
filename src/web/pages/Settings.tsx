import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import SecuritySection from './settings/SecuritySection.js';
import TasksSection from './settings/TasksSection.js';
import ProxySection from './settings/ProxySection.js';
import RoutingSection from './settings/RoutingSection.js';
import MaintenanceSection from './settings/MaintenanceSection.js';
import { useSettingsData } from './settings/settingsData.js';

const SETTINGS_TABS = [
  { key: 'security', label: '访问与安全' },
  { key: 'tasks', label: '定时任务' },
  { key: 'proxy', label: '代理行为' },
  { key: 'routing', label: '路由与模型' },
  { key: 'maintenance', label: '运维与数据' },
] as const;

type SettingsTabKey = (typeof SETTINGS_TABS)[number]['key'];

function resolveActiveSettingsTab(pathname: string): SettingsTabKey {
  const match = pathname.match(/^\/settings\/([^/]+)/);
  const candidate = match?.[1] as SettingsTabKey | undefined;
  if (candidate && SETTINGS_TABS.some((tab) => tab.key === candidate)) {
    return candidate;
  }
  return 'security';
}

export default function Settings() {
  const location = useLocation();
  const data = useSettingsData();
  const activeTab = resolveActiveSettingsTab(location.pathname);

  if (data.loading) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <h2 className="page-title">系统设置</h2>
        </div>
        <div className="skeleton" style={{ width: '100%', height: 320, borderRadius: 'var(--radius-sm)' }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">系统设置</h2>
      </div>

      <nav
        aria-label="设置分组"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}
      >
        {SETTINGS_TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <NavLink
              key={tab.key}
              to={`/settings/${tab.key}`}
              end
              className="btn btn-ghost"
              aria-current={isActive ? 'page' : undefined}
              style={{
                border: isActive
                  ? '1px solid var(--color-primary)'
                  : '1px solid var(--color-border)',
                color: isActive ? 'var(--color-primary)' : undefined,
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </NavLink>
          );
        })}
      </nav>

      {activeTab === 'tasks' && <TasksSection data={data} />}
      {activeTab === 'proxy' && <ProxySection data={data} />}
      {activeTab === 'routing' && <RoutingSection data={data} />}
      {activeTab === 'maintenance' && <MaintenanceSection data={data} />}
      {activeTab === 'security' && <SecuritySection data={data} />}
    </div>
  );
}