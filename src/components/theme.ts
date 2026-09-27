import { Platform, useColorScheme } from 'react-native';

const light = {
  bg: '#F2F4F8',
  card: '#FFFFFF',
  cardAlt: '#F7F8FB',
  text: '#0F172A',
  textDim: '#5B6478',
  textFaint: '#9AA3B5',
  border: '#E3E7EF',
  primary: '#2563EB',
  primaryText: '#FFFFFF',
  primarySoft: '#E6EEFF',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
  success: '#16A34A',
  successSoft: '#E7F6EC',
  warning: '#B45309',
  warningSoft: '#FEF3E2',
  mono: '#1E293B',
  overlay: 'rgba(15,23,42,0.55)',
};

const dark: typeof light = {
  bg: '#0B1020',
  card: '#151B2E',
  cardAlt: '#1B2238',
  text: '#EEF2FA',
  textDim: '#A3ADC2',
  textFaint: '#6B7590',
  border: '#262F48',
  primary: '#5B8CFF',
  primaryText: '#FFFFFF',
  primarySoft: '#1C2A52',
  danger: '#F87171',
  dangerSoft: '#3A1B22',
  success: '#4ADE80',
  successSoft: '#15301F',
  warning: '#FBBF24',
  warningSoft: '#352A12',
  mono: '#D7DEEC',
  overlay: 'rgba(0,0,0,0.65)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 22 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const mono = { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) };
