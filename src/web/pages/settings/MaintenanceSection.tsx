import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.js';
import { useIsMobile } from '../../components/useIsMobile.js';
import { useAnimatedVisibility } from '../../components/useAnimatedVisibility.js';
import ModernSelect from '../../components/ModernSelect.js';
import FactoryResetModal from './FactoryResetModal.js';
import UpdateCenterSection from './UpdateCenterSection.js';
import { clearAppInstallationState } from '../../appLocalState.js';
import type { SettingsData, DbDialect } from './settingsData.js';
import { getSettingsStyles } from './settingsStyles.js';

const FACTORY_RESET_ADMIN_TOKEN = 'change-me-admin-token';
const FACTORY_RESET_CONFIRM_SECONDS = 3;

type DatabaseMigrationSummary = {
  dialect: DbDialect;
  connection: string;
  overwrite: boolean;
  version: string;
  timestamp: number;
  rows: {
    sites: number;
    accounts: number;
    accountTokens: number;
    tokenRoutes: number;
    routeChannels: number;
    settings: number;
  };
};

type ShorthandConnection = {
  host: string;
  user: string;
  password: string;
  port: string;
  database: string;
};

function getDialectDefaults(dialect: DbDialect) {
  if (dialect === 'mysql') {
    return { port: '3306', database: 'mysql' };
  }
  if (dialect === 'postgres') {
    return { port: '5432', database: 'postgres' };
  }
  return { port: '', database: '' };
}

function buildShorthandConnectionString(dialect: DbDialect, input: ShorthandConnection): string {
  if (dialect === 'sqlite') return '';
  const host = input.host.trim();
  const user = input.user.trim();
  const password = input.password;
  if (!host || !user || !password) return '';
  const defaults = getDialectDefaults(dialect);
  const port = (input.port || defaults.port).trim() || defaults.port;
  const database = (input.database || defaults.database).trim() || defaults.database;
  const protocol = dialect === 'mysql' ? 'mysql' : 'postgres';
  return `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function inferUrlDialect(connectionString: string): 'mysql' | 'postgres' | null {
  const normalized = (connectionString || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('mysql://')) return 'mysql';
  if (normalized.startsWith('postgres://') || normalized.startsWith('postgresql://')) return 'postgres';
  return null;
}

export default function MaintenanceSection({ data }: { data: SettingsData }) {
  const isMobile = useIsMobile();
  const styles = getSettingsStyles(isMobile);
  const {
    migrationDialect,
    setMigrationDialect,
    runtimeDatabaseState,
    setRuntimeDatabaseState,
  } = data;
  const [clearingCache, setClearingCache] = useState(false);
  const [clearingUsage, setClearingUsage] = useState(false);
  const [migrationConnectionString, setMigrationConnectionString] = useState('');
  const [connectionMode, setConnectionMode] = useState<'shorthand' | 'advanced'>('shorthand');
  const [showShorthandOptional, setShowShorthandOptional] = useState(false);
  const [shorthandConnection, setShorthandConnection] = useState<ShorthandConnection>({
    host: '',
    user: '',
    password: '',
    port: '5432',
    database: 'postgres',
  });
  const [migrationOverwrite, setMigrationOverwrite] = useState(true);
  const [migrationSsl, setMigrationSsl] = useState(false);
  const [testingMigrationConnection, setTestingMigrationConnection] = useState(false);
  const [migratingDatabase, setMigratingDatabase] = useState(false);
  const [savingRuntimeDatabase, setSavingRuntimeDatabase] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState<DatabaseMigrationSummary | null>(null);
  const [factoryResetOpen, setFactoryResetOpen] = useState(false);
  const factoryResetPresence = useAnimatedVisibility(factoryResetOpen, 220);
  const [factoryResetting, setFactoryResetting] = useState(false);
  const [factoryResetSecondsLeft, setFactoryResetSecondsLeft] = useState(FACTORY_RESET_CONFIRM_SECONDS);
  const toast = useToast();

  const { inputStyle } = styles;

  const generatedConnectionString = useMemo(() => (
    buildShorthandConnectionString(migrationDialect, shorthandConnection)
  ), [migrationDialect, shorthandConnection]);

  const effectiveMigrationConnectionString = useMemo(() => {
    if (migrationDialect === 'sqlite') return migrationConnectionString.trim();
    if (connectionMode === 'advanced') return migrationConnectionString.trim();
    return generatedConnectionString.trim();
  }, [connectionMode, generatedConnectionString, migrationConnectionString, migrationDialect]);

  useEffect(() => {
    const defaults = getDialectDefaults(migrationDialect);
    if (migrationDialect === 'sqlite') {
      setConnectionMode('advanced');
      return;
    }
    setShorthandConnection((prev) => ({
      ...prev,
      port: defaults.port,
      database: defaults.database,
    }));
  }, [migrationDialect]);

  useEffect(() => {
    if (!factoryResetOpen) {
      setFactoryResetSecondsLeft(FACTORY_RESET_CONFIRM_SECONDS);
      return;
    }
    setFactoryResetSecondsLeft(FACTORY_RESET_CONFIRM_SECONDS);
    const timer = globalThis.setInterval(() => {
      setFactoryResetSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, [factoryResetOpen]);

  const handleClearCache = async () => {
    if (!window.confirm('确认清理模型缓存并重建路由？')) return;
    setClearingCache(true);
    try {
      const res = await api.clearRuntimeCache();
      toast.success(`缓存已清理（模型缓存 ${res.deletedModelAvailability || 0} 条）`);
    } catch (err: any) {
      toast.error(err?.message || '清理缓存失败');
    } finally {
      setClearingCache(false);
    }
  };

  const handleClearUsage = async () => {
    if (!window.confirm('确认清理占用统计与使用日志？')) return;
    setClearingUsage(true);
    try {
      const res = await api.clearUsageData();
      toast.success(`占用统计已清理（日志 ${res.deletedProxyLogs || 0} 条）`);
    } catch (err: any) {
      toast.error(err?.message || '清理占用失败');
    } finally {
      setClearingUsage(false);
    }
  };

  const closeFactoryResetModal = () => {
    if (factoryResetting) return;
    setFactoryResetOpen(false);
  };

  const handleFactoryReset = async () => {
    if (factoryResetSecondsLeft > 0 || factoryResetting) return;
    setFactoryResetting(true);
    try {
      await api.factoryReset();
      clearAppInstallationState(localStorage);
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.message || '重新初始化系统失败');
      setFactoryResetting(false);
    }
  };

  const handleTestExternalDatabaseConnection = async () => {
    if (!effectiveMigrationConnectionString) {
      toast.info('Please fill target database connection first');
      return;
    }

    const inferredDialect = inferUrlDialect(effectiveMigrationConnectionString);
    if (migrationDialect === 'sqlite' && inferredDialect) {
      toast.error(`当前选择 SQLite，但连接串是 ${inferredDialect.toUpperCase()} URL，请先切换方言`);
      return;
    }

    setTestingMigrationConnection(true);
    try {
      const res = await api.testExternalDatabaseConnection({
        dialect: migrationDialect,
        connectionString: effectiveMigrationConnectionString,
        ssl: migrationSsl,
      });
      toast.success(`Connection success: ${res.connection || migrationDialect}`);
    } catch (err: any) {
      toast.error(err?.message || 'Target database connection failed');
    } finally {
      setTestingMigrationConnection(false);
    }
  };

  const handleMigrateToExternalDatabase = async () => {
    if (!effectiveMigrationConnectionString) {
      toast.info('Please fill target database connection first');
      return;
    }

    const inferredDialect = inferUrlDialect(effectiveMigrationConnectionString);
    if (migrationDialect === 'sqlite' && inferredDialect) {
      toast.error(`当前选择 SQLite，但连接串是 ${inferredDialect.toUpperCase()} URL，请先切换方言`);
      return;
    }

    const warning = migrationOverwrite
      ? 'Confirm migration and overwrite existing data in target database?'
      : 'Confirm migration to target database? If target has data, migration may fail.';
    if (!window.confirm(warning)) return;

    setMigratingDatabase(true);
    try {
      const res = await api.migrateExternalDatabase({
        dialect: migrationDialect,
        connectionString: effectiveMigrationConnectionString,
        overwrite: migrationOverwrite,
        ssl: migrationSsl,
      });
      setMigrationSummary(res);
      toast.success(res?.message || 'Database migration completed');
    } catch (err: any) {
      toast.error(err?.message || 'Database migration failed');
    } finally {
      setMigratingDatabase(false);
    }
  };

  const handleSaveRuntimeDatabaseConfig = async () => {
    if (!effectiveMigrationConnectionString) {
      toast.info('Please fill target database connection first');
      return;
    }

    const inferredDialect = inferUrlDialect(effectiveMigrationConnectionString);
    if (migrationDialect === 'sqlite' && inferredDialect) {
      toast.error(`当前选择 SQLite，但连接串是 ${inferredDialect.toUpperCase()} URL，请先切换方言`);
      return;
    }

    setSavingRuntimeDatabase(true);
    try {
      const res = await api.updateRuntimeDatabaseConfig({
        dialect: migrationDialect,
        connectionString: effectiveMigrationConnectionString,
        ssl: migrationSsl,
      });
      setRuntimeDatabaseState({
        active: {
          dialect: (res?.active?.dialect || 'sqlite') as DbDialect,
          connection: String(res?.active?.connection || ''),
          ssl: !!res?.active?.ssl,
        },
        saved: res?.saved
          ? {
            dialect: res.saved.dialect as DbDialect,
            connection: String(res.saved.connection || ''),
            ssl: !!res.saved.ssl,
          }
          : null,
        restartRequired: !!res?.restartRequired,
      });
      toast.success(res?.message || 'Runtime database config saved');
    } catch (err: any) {
      toast.error(err?.message || 'Runtime database config save failed');
    } finally {
      setSavingRuntimeDatabase(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card animate-slide-up stagger-1" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>数据库迁移（SQLite / MySQL / PostgreSQL）</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            可先测试连接，再迁移数据；迁移完成后可保存为运行数据库配置（重启容器后生效）。
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: 10, marginBottom: 10, alignItems: 'center' }}>
            <ModernSelect
              value={migrationDialect}
              onChange={(value) => setMigrationDialect(value as DbDialect)}
              options={[
                { value: 'postgres', label: 'PostgreSQL' },
                { value: 'mysql', label: 'MySQL' },
                { value: 'sqlite', label: 'SQLite' },
              ]}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              {migrationDialect !== 'sqlite' && (
                <button
                  className="btn btn-ghost"
                  style={{ border: '1px solid var(--color-border)' }}
                  onClick={() => setConnectionMode((prev) => (prev === 'shorthand' ? 'advanced' : 'shorthand'))}
                >
                  {connectionMode === 'shorthand' ? '高级输入连接串' : '使用半自动简写'}
                </button>
              )}
            </div>
          </div>

          {migrationDialect === 'sqlite' ? (
            <input
              value={migrationConnectionString}
              onChange={(e) => setMigrationConnectionString(e.target.value)}
              placeholder="./data/target.db or file:///abs/path.db"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', marginBottom: 10 }}
            />
          ) : connectionMode === 'advanced' ? (
            <input
              value={migrationConnectionString}
              onChange={(e) => setMigrationConnectionString(e.target.value)}
              placeholder={migrationDialect === 'mysql'
                ? 'mysql://user:pass@host:3306/db'
                : 'postgres://user:pass@host:5432/db'}
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', marginBottom: 10 }}
            />
          ) : (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10, marginBottom: 8 }}>
                <input
                  value={shorthandConnection.host}
                  onChange={(e) => setShorthandConnection((prev) => ({ ...prev, host: e.target.value }))}
                  placeholder="Host (required)"
                  style={inputStyle}
                />
                <input
                  value={shorthandConnection.user}
                  onChange={(e) => setShorthandConnection((prev) => ({ ...prev, user: e.target.value }))}
                  placeholder="User (required)"
                  style={inputStyle}
                />
                <input
                  value={shorthandConnection.password}
                  onChange={(e) => setShorthandConnection((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Password (required)"
                  type="password"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  className="btn btn-ghost"
                  style={{ border: '1px solid var(--color-border)' }}
                  onClick={() => setShowShorthandOptional((prev) => !prev)}
                >
                  {showShorthandOptional ? '收起端口/库名' : '展开端口/库名'}
                </button>
              </div>
              {showShorthandOptional && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 8 }}>
                  <input
                    value={shorthandConnection.port}
                    onChange={(e) => setShorthandConnection((prev) => ({ ...prev, port: e.target.value }))}
                    placeholder={getDialectDefaults(migrationDialect).port}
                    style={inputStyle}
                  />
                  <input
                    value={shorthandConnection.database}
                    onChange={(e) => setShorthandConnection((prev) => ({ ...prev, database: e.target.value }))}
                    placeholder={getDialectDefaults(migrationDialect).database}
                    style={inputStyle}
                  />
                </div>
              )}
              <code style={{ display: 'block', padding: '10px 14px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-light)' }}>
                {generatedConnectionString || 'Fill host/user/password to generate connection string'}
              </code>
            </div>
          )}

          {migrationDialect !== 'sqlite' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                checked={migrationSsl}
                onChange={(e) => setMigrationSsl(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: 'var(--color-primary)' }}
              />
              启用 SSL/TLS 加密连接
            </label>
          )}

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <input
              type="checkbox"
              checked={migrationOverwrite}
              onChange={(e) => setMigrationOverwrite(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: 'var(--color-primary)' }}
            />
            允许覆盖目标数据库现有数据
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              onClick={handleTestExternalDatabaseConnection}
              disabled={testingMigrationConnection || migratingDatabase || savingRuntimeDatabase}
              className="btn btn-ghost"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {testingMigrationConnection ? <><span className="spinner spinner-sm" /> 测试中...</> : '测试连接'}
            </button>
            <button
              onClick={handleMigrateToExternalDatabase}
              disabled={migratingDatabase || testingMigrationConnection || savingRuntimeDatabase}
              className="btn btn-primary"
            >
              {migratingDatabase ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 迁移中...</> : '开始迁移'}
            </button>
            <button
              onClick={handleSaveRuntimeDatabaseConfig}
              disabled={savingRuntimeDatabase || migratingDatabase || testingMigrationConnection}
              className="btn btn-ghost"
              style={{ border: '1px solid var(--color-border)' }}
            >
              {savingRuntimeDatabase ? <><span className="spinner spinner-sm" /> 保存中...</> : '保存为运行数据库（重启后生效）'}
            </button>
          </div>

          {runtimeDatabaseState && (
            <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.8, marginBottom: migrationSummary ? 12 : 0 }}>
              <div>当前运行：{runtimeDatabaseState.active.dialect}（{runtimeDatabaseState.active.connection || '(empty)' }）{runtimeDatabaseState.active.ssl && ' [SSL]'}</div>
              <div>
                已保存待生效：
                {runtimeDatabaseState.saved
                  ? ` ${runtimeDatabaseState.saved.dialect}（${runtimeDatabaseState.saved.connection}）${runtimeDatabaseState.saved.ssl ? ' [SSL]' : ''}`
                  : ' 未保存'}
              </div>
              {runtimeDatabaseState.restartRequired && (
                <div style={{ color: 'var(--color-warning)' }}>检测到待生效数据库配置，请重启容器使其生效。</div>
              )}
            </div>
          )}

          {migrationSummary && (
            <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
              <div>目标：{migrationSummary.dialect}（{migrationSummary.connection}）</div>
              <div>版本：{migrationSummary.version}，时间：{new Date(migrationSummary.timestamp).toLocaleString()}</div>
              <div>迁移结果：站点 {migrationSummary.rows.sites} / 账号 {migrationSummary.rows.accounts} / 令牌 {migrationSummary.rows.accountTokens} / 路由 {migrationSummary.rows.tokenRoutes} / 通道 {migrationSummary.rows.routeChannels} / 设置 {migrationSummary.rows.settings}</div>
            </div>
          )}
        </div>

        <UpdateCenterSection />

        <div className="card animate-slide-up stagger-2" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>维护工具</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleClearCache} disabled={clearingCache} className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }}>
              {clearingCache ? <><span className="spinner spinner-sm" /> 清理中...</> : '清除缓存并重建路由'}
            </button>
            <button onClick={handleClearUsage} disabled={clearingUsage} className="btn btn-link btn-link-warning">
              {clearingUsage ? <><span className="spinner spinner-sm" /> 清理中...</> : '清除占用与使用日志'}
            </button>
          </div>
        </div>

        <div className="card animate-slide-up stagger-2" style={{ padding: 20, border: '1px solid color-mix(in srgb, var(--color-danger) 30%, var(--color-border))' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--color-danger)' }}>危险操作</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.8, marginBottom: 12 }}>
            重新初始化系统会清空当前 metapi 使用中的全部数据库内容；若当前运行在外部 MySQL/Postgres，也会先清空该外部库中的 metapi 数据，然后切回默认 SQLite。
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.8, marginBottom: 14 }}>
            完成后管理员 Token 会重置为 <code style={{ fontFamily: 'var(--font-mono)' }}>{FACTORY_RESET_ADMIN_TOKEN}</code>，当前会话会立即退出并刷新页面。
          </div>
          <button onClick={() => setFactoryResetOpen(true)} className="btn btn-danger">
            重新初始化系统
          </button>
        </div>
      </div>
      <FactoryResetModal
        presence={factoryResetPresence}
        factoryResetting={factoryResetting}
        factoryResetSecondsLeft={factoryResetSecondsLeft}
        adminToken={FACTORY_RESET_ADMIN_TOKEN}
        onClose={closeFactoryResetModal}
        onConfirm={handleFactoryReset}
      />
    </div>
  );
}
