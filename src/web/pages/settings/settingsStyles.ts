import type React from 'react';

export type SettingsPillTone = 'neutral' | 'primary' | 'danger' | 'warning';

export function getSettingsStyles(isMobile: boolean) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    outline: 'none',
    background: 'var(--color-bg)',
    color: 'var(--color-text-primary)',
  };
  const settingsModernCardStyle: React.CSSProperties = {
    padding: isMobile ? 20 : 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  };
  const settingsModernDangerCardStyle: React.CSSProperties = {
    ...settingsModernCardStyle,
    borderColor: 'color-mix(in srgb, var(--color-danger) 22%, var(--color-border))',
    background: 'linear-gradient(180deg, color-mix(in srgb, var(--color-danger-soft) 18%, var(--color-bg-card)) 0%, var(--color-bg-card) 100%)',
  };
  const settingsModernHeaderStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  };
  const settingsModernTitleBlockStyle: React.CSSProperties = {
    display: 'grid',
    gap: 6,
    minWidth: 0,
  };
  const settingsModernTitleStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.35,
    color: 'var(--color-text-primary)',
  };
  const settingsModernDescriptionStyle: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.75,
    color: 'var(--color-text-muted)',
  };
  const settingsModernPillRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  };
  const settingsModernCalloutStyle: React.CSSProperties = {
    display: 'grid',
    gap: 6,
    padding: '14px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-light)',
    background: 'color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-card))',
  };
  const settingsModernToggleStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: isMobile ? 12 : 16,
    padding: '14px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-light)',
    background: 'color-mix(in srgb, var(--color-bg) 78%, var(--color-bg-card))',
    cursor: 'pointer',
  };
  const settingsModernToggleCopyStyle: React.CSSProperties = {
    display: 'grid',
    gap: 6,
    minWidth: 0,
  };
  const settingsModernFieldCardStyle: React.CSSProperties = {
    display: 'grid',
    gap: 10,
    padding: '14px 16px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-light)',
    background: 'color-mix(in srgb, var(--color-bg) 82%, var(--color-bg-card))',
  };
  const settingsModernFieldLabelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  };
  const settingsModernFieldHintStyle: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.7,
    color: 'var(--color-text-muted)',
    marginTop: -2,
  };
  const settingsModernActionsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  };

  const getSettingsPillStyle = (tone: SettingsPillTone): React.CSSProperties => {
    const toneStyles: Record<SettingsPillTone, React.CSSProperties> = {
      neutral: {
        borderColor: 'color-mix(in srgb, var(--color-text-muted) 12%, var(--color-border-light))',
        background: 'color-mix(in srgb, var(--color-text-muted) 8%, var(--color-bg-card))',
        color: 'var(--color-text-secondary)',
      },
      primary: {
        borderColor: 'color-mix(in srgb, var(--color-primary) 20%, var(--color-border-light))',
        background: 'color-mix(in srgb, var(--color-primary-light) 64%, var(--color-bg-card))',
        color: 'var(--color-primary)',
      },
      warning: {
        borderColor: 'color-mix(in srgb, var(--color-warning) 20%, var(--color-border-light))',
        background: 'color-mix(in srgb, var(--color-warning-soft) 68%, var(--color-bg-card))',
        color: 'var(--color-warning)',
      },
      danger: {
        borderColor: 'color-mix(in srgb, var(--color-danger) 20%, var(--color-border-light))',
        background: 'color-mix(in srgb, var(--color-danger-soft) 66%, var(--color-bg-card))',
        color: 'var(--color-danger)',
      },
    };

    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 10px',
      borderRadius: 999,
      border: '1px solid var(--color-border-light)',
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.2,
      whiteSpace: 'nowrap',
      ...toneStyles[tone],
    };
  };

  return {
    inputStyle,
    settingsModernCardStyle,
    settingsModernDangerCardStyle,
    settingsModernHeaderStyle,
    settingsModernTitleBlockStyle,
    settingsModernTitleStyle,
    settingsModernDescriptionStyle,
    settingsModernPillRowStyle,
    settingsModernCalloutStyle,
    settingsModernToggleStyle,
    settingsModernToggleCopyStyle,
    settingsModernFieldCardStyle,
    settingsModernFieldLabelStyle,
    settingsModernFieldHintStyle,
    settingsModernActionsStyle,
    getSettingsPillStyle,
  };
}

export type SettingsStyles = ReturnType<typeof getSettingsStyles>;
