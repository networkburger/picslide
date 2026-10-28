// Inline stroke icons (24px grid, rounded joins), so buttons need no labels to read.
const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  home: svg(`<path d="M3.5 11 12 3.8l8.5 7.2"/><path d="M5.8 9.4V20h4.4v-5.2h3.6V20h4.4V9.4"/>`),
  again: svg(`<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>`),
  plus: svg(`<path d="M12 5v14M5 12h14"/>`),
  close: svg(`<path d="M6 6l12 12M18 6 6 18"/>`),
  check: svg(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  pencil: svg(`<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>`),
  soundOn: svg(`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.3 6.3a8 8 0 0 1 0 11.4"/>`),
  soundOff: svg(`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>`),
  eye: svg(`<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`),
  harder: svg(`<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>`),
};
