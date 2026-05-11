export const R = '\x1b[0m';
export const B = '\x1b[1m';
export const DIM = '\x1b[2m';
export const RED = '\x1b[31m';
export const GREEN = '\x1b[32m';
export const YELLOW = '\x1b[33m';
export const WHITE = '\x1b[37m';
export const CYAN = '\x1b[36m';
export const BLUE = '\x1b[38;2;37;150;190m';

export const bold   = (s: string): string => `${B}${s}${R}`;
export const dim    = (s: string): string => `${DIM}${s}${R}`;
export const red    = (s: string): string => `${RED}${s}${R}`;
export const green  = (s: string): string => `${GREEN}${s}${R}`;
export const yellow = (s: string): string => `${YELLOW}${s}${R}`;
export const cyan   = (s: string): string => `${CYAN}${s}${R}`;
export const blue   = (s: string): string => `${BLUE}${s}${R}`;
