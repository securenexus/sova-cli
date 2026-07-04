/**
 * SOVA CLI Design System — Terminal Theme
 *
 * All CLI colors are defined here. Do not use raw ANSI codes
 * or ad-hoc chalk calls elsewhere.
 *
 * Colors mapped from Obliq frontend design tokens.
 *
 * Uses 24-bit (truecolor) ANSI escape sequences. Respects
 * NO_COLOR and FORCE_COLOR=0 environment variables.
 */

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD_ON = `${ESC}1m`;
const DIM_ON = `${ESC}2m`;

/** Convert a #RRGGBB hex string to an ANSI foreground color wrapper. */
function hexColor(hex: string): (s: string) => string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const open = `${ESC}38;2;${r};${g};${b}m`;

  // Respect NO_COLOR / FORCE_COLOR=0
  const noColor =
    process.env['NO_COLOR'] !== undefined ||
    process.env['FORCE_COLOR'] === '0';

  if (noColor) {
    return (s: string) => s;
  }
  return (s: string) => `${open}${s}${RESET}`;
}

const noColor =
  process.env['NO_COLOR'] !== undefined ||
  process.env['FORCE_COLOR'] === '0';

export const theme = {
  brand:   hexColor('#C7264B'),
  accent:  hexColor('#D9A520'),
  success: hexColor('#00B86B'),
  warning: hexColor('#D9A520'),
  error:   hexColor('#EC4545'),
  info:    hexColor('#1E90FF'),
  muted:   hexColor('#6B7B8D'),
  bold:    (s: string) => noColor ? s : `${BOLD_ON}${s}${RESET}`,
  dim:     (s: string) => noColor ? s : `${DIM_ON}${s}${RESET}`,
} as const;

export const ok   = (s: string) => `${theme.success('✔')} ${s}`;
export const warn = (s: string) => `${theme.warning('⚠')} ${s}`;
export const fail = (s: string) => `${theme.error('✖')} ${s}`;
export const info = (s: string) => `${theme.info('ℹ')} ${s}`;
